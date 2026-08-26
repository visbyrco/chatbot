import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { Session } from "@/app/(auth)/auth";
import type { ArtifactKind } from "@/components/chat/artifact";
import { getDocumentById, saveDocument } from "@/lib/db/queries";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

export const artifactKinds = ["text", "code", "sheet"] as const;

type WriteFileProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

export const writeFile = ({ session, dataStream }: WriteFileProps) =>
  tool({
    description:
      "Write a file, script, or spreadsheet. Use this to CREATE a new file (provide kind, title, and the full content) or to OVERWRITE an existing file (provide id and the full new content). You generate the content yourself from the conversation context.",
    execute: async ({
      id: inputId,
      kind: inputKind,
      title: inputTitle,
      content,
    }) => {
      let id = inputId;
      let kind: ArtifactKind | undefined = inputKind;
      let title = inputTitle;

      if (id) {
        const document = await getDocumentById({ id });

        if (!document) {
          return { error: "File not found" };
        }

        if (document.userId !== session.user?.id) {
          return { error: "Forbidden" };
        }

        ({ id, kind, title } = document);
      } else {
        if (!kind || !title) {
          return {
            error: "kind and title are required when creating a file",
          };
        }

        id = generateUUID();
      }

      await saveDocument({
        content,
        id,
        kind,
        title,
        userId: session.user.id,
      });

      dataStream.write({
        data: null,
        transient: true,
        type: "data-clear",
      });

      dataStream.write({
        data: content,
        transient: true,
        type: `data-${
          kind === "code" ? "code" : kind === "sheet" ? "sheet" : "text"
        }Delta`,
      });

      dataStream.write({ data: null, transient: true, type: "data-finish" });

      return {
        content: `The ${
          kind === "code" ? "script" : "file"
        } has been written successfully.`,
        id,
        kind,
        title,
      };
    },
    inputSchema: z.object({
      content: z
        .string()
        .describe(
          "The complete content to write. Provide the FULL content — this replaces whatever is in the file."
        ),
      id: z
        .string()
        .optional()
        .describe(
          "ID of an existing file to overwrite. Omit to create a new one."
        ),
      kind: z
        .enum(artifactKinds)
        .optional()
        .describe(
          "REQUIRED when creating: 'code' for scripts, 'text' for writing, 'sheet' for data."
        ),
      title: z
        .string()
        .optional()
        .describe("REQUIRED when creating: the title of the file."),
    }),
  });

// Backward compatibility alias
export const writeDocument = writeFile;
