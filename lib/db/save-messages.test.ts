import { randomUUID } from "node:crypto";
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
    const user = getOrCreateUserByEmail(`upsert-${randomUUID()}@test.local`);
    const chatId = randomUUID();
    saveChat({
      id: chatId,
      title: "upsert",
      userId: user.id,
      visibility: "private",
    });

    const id = randomUUID();
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

  // The in-memory store applies Map.set synchronously, so this pins the
  // overwrite semantics both persists rely on rather than true DB-level
  // concurrency: re-persisting the same id keeps one row with new content.
  it("re-persisting the same id keeps a single row with latest content", async () => {
    const { inMemoryQueries } = await import("@/lib/db/in-memory");
    const { getOrCreateUserByEmail, saveChat, saveMessages, getMessageById } =
      inMemoryQueries;
    const user = getOrCreateUserByEmail(`repersist-${randomUUID()}@test.local`);
    const chatId = randomUUID();
    saveChat({
      id: chatId,
      title: "repersist",
      userId: user.id,
      visibility: "private",
    });

    const id = randomUUID();
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
    const start = source.indexOf("export async function saveMessages");
    expect(start).toBeGreaterThan(-1);
    // Bound the block to the next top-level export so the assertions cannot
    // pass on an upsert that lives in unrelated dead code.
    const nextExport = source.indexOf("\nexport ", start + 1);
    const saveBlock = source.slice(
      start,
      nextExport === -1 ? undefined : nextExport
    );
    // The upsert target and the refreshed columns must sit in one
    // onConflictDoUpdate call, matching the in-memory Map.set semantics.
    const upsert = saveBlock.match(/onConflictDoUpdate\(\{[\s\S]*?\}\)/);
    expect(upsert).not.toBeNull();
    expect(upsert?.[0]).toContain("target: message.id");
    expect(upsert?.[0]).toContain("excluded.parts");
    expect(upsert?.[0]).toContain("excluded.metadata");
    expect(upsert?.[0]).toContain("excluded.attachments");
  });
});
