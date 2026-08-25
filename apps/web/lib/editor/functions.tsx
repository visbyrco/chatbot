"use client";

import DOMPurify from "dompurify";
import { defaultMarkdownSerializer } from "prosemirror-markdown";
import { DOMParser, type Node } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { renderToString } from "react-dom/server";

import { MessageResponse } from "@/components/ai-elements/message-response";

import { documentSchema } from "./config";
import type { UISuggestion } from "./suggestions";

export const buildDocumentFromContent = (content: string) => {
  const parser = DOMParser.fromSchema(documentSchema);
  const stringFromMarkdown = renderToString(
    <MessageResponse>{content}</MessageResponse>
  );
  const sanitized =
    typeof window !== "undefined" && typeof DOMPurify.sanitize === "function"
      ? DOMPurify.sanitize(stringFromMarkdown)
      : stringFromMarkdown;
  const tempContainer = document.createElement("div");
  tempContainer.innerHTML = sanitized;
  return parser.parse(tempContainer);
};

export const buildContentFromDocument = (document: Node) =>
  defaultMarkdownSerializer.serialize(document);

export const createDecorations = (
  suggestions: UISuggestion[],
  _view: EditorView
) => {
  const decorations: Decoration[] = [];

  for (const suggestion of suggestions) {
    decorations.push(
      Decoration.inline(
        suggestion.selectionStart,
        suggestion.selectionEnd,
        {
          class: "suggestion-highlight",
          "data-suggestion-id": suggestion.id,
        },
        {
          suggestionId: suggestion.id,
          type: "highlight",
        }
      )
    );
  }

  return DecorationSet.create(_view.state.doc, decorations);
};
