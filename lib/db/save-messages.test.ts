import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DBMessage } from "@/lib/db/schema";

// Regression coverage for #219: Postgres logged 12 duplicate-key violations
// on Message_v2_pkey on 2026-09-06/07 because saveMessages() did a plain
// insert. lib/db/queries.pg.ts now upserts on id conflict, and the in-memory
// store overwrites via Map.set. These tests pin that behaviour so a future
// refactor of the persist path cannot silently reintroduce the race.

function makeMessage(
  overrides: Partial<DBMessage> & { chatId: string; id: string }
): DBMessage {
  return {
    attachments: [],
    chatId: overrides.chatId,
    createdAt: new Date(),
    id: overrides.id,
    metadata: {},
    parts: [{ text: "hello", type: "text" }],
    role: "user",
    ...overrides,
  };
}

describe("saveMessages upsert semantics (#219)", () => {
  it("overwrites the same message id instead of duplicating it", async () => {
    const { inMemoryQueries } = await import("@/lib/db/in-memory");
    const {
      getOrCreateUserByEmail,
      saveChat,
      saveMessages,
      getMessagesByChatId,
    } = inMemoryQueries;
    const user = getOrCreateUserByEmail(`upsert-${Date.now()}@test.local`);
    const chatId = `00000000-0000-4000-a000-${Date.now().toString().slice(-12).padStart(12, "0")}`;
    saveChat({
      id: chatId,
      title: "upsert",
      userId: user.id,
      visibility: "private",
    });

    const id = "11111111-1111-4111-8111-111111111111";
    await saveMessages({ messages: [makeMessage({ chatId, id })] });
    await saveMessages({
      messages: [
        makeMessage({
          chatId,
          id,
          parts: [{ text: "updated", type: "text" }],
        }),
      ],
    });

    const rows = await getMessagesByChatId({ id: chatId });
    const matching = rows.filter((m) => m.id === id);
    expect(matching).toHaveLength(1);
    expect(matching[0]?.parts).toEqual([{ text: "updated", type: "text" }]);
  });

  it("handles concurrent re-persists of the same id (onEnd race)", async () => {
    const { inMemoryQueries } = await import("@/lib/db/in-memory");
    const { getOrCreateUserByEmail, saveChat, saveMessages, getMessageById } =
      inMemoryQueries;
    const user = getOrCreateUserByEmail(`race-${Date.now()}@test.local`);
    const chatId = `00000000-0000-4000-b000-${Date.now().toString().slice(-12).padStart(12, "0")}`;
    saveChat({
      id: chatId,
      title: "race",
      userId: user.id,
      visibility: "private",
    });

    const id = "22222222-2222-4222-8222-222222222222";
    const first = makeMessage({
      chatId,
      id,
      parts: [{ text: "v1", type: "text" }],
    });
    const second = makeMessage({
      chatId,
      id,
      parts: [{ text: "v2", type: "text" }],
    });
    await Promise.all([
      saveMessages({ messages: [first] }),
      saveMessages({ messages: [second] }),
    ]);

    const rows = await getMessageById({ id });
    expect(rows).toHaveLength(1);
  });

  it("postgres persist path still upserts on id conflict", () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, "./queries.pg.ts"),
      "utf8"
    );
    const saveBlock = source.slice(
      source.indexOf("export async function saveMessages")
    );
    expect(saveBlock).toContain("onConflictDoUpdate");
    expect(saveBlock).toContain("target: message.id");
    expect(saveBlock).toContain("excluded.parts");
    expect(saveBlock).toContain("excluded.metadata");
    expect(saveBlock).toContain("excluded.attachments");
  });
});
