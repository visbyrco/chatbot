const PLACEHOLDER = "\u0000";

const PROTECTED_REGEX = /```[\s\S]*?```|~~~[\s\S]*?~~~|`+[^`\n]*`+/g;

const DELIMITER_REGEX = new RegExp(`${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, "g");

export function normalizeLatexDelimiters(markdown: string): string {
  const placeholders: string[] = [];

  const protectedContent = markdown.replace(PROTECTED_REGEX, (match) => {
    placeholders.push(match);
    return `${PLACEHOLDER}${placeholders.length - 1}${PLACEHOLDER}`;
  });

  const converted = protectedContent
    .replace(/\\\[([\s\S]*?)\\\]/g, "$$$$$1$$$$")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$");

  return converted.replace(
    DELIMITER_REGEX,
    (_, index: string) => placeholders[Number(index)] ?? ""
  );
}
