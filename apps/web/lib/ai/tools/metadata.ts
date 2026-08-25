export const TOOL_IDS = [
  "getWeather",
  "writeDocument",
  "editDocument",
  "searchWeb",
  "fetchUrl",
  "runPython",
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export const TOOL_IDS_SET: ReadonlySet<string> = new Set(TOOL_IDS);

export const DOCUMENT_TOOL_IDS = ["writeDocument", "editDocument"] as const;

export type ToolMetadata = { label: string; description: string };

export const TOOL_METADATA: Record<ToolId, ToolMetadata> = {
  editDocument: {
    description: "Make targeted edits to an existing artifact.",
    label: "Edit document",
  },
  fetchUrl: {
    description: "Read the content of a web page from its URL.",
    label: "Fetch URL",
  },
  getWeather: {
    description: "Get current weather at a location.",
    label: "Weather",
  },
  runPython: {
    description: "Run Python code to solve math, logic, and data problems.",
    label: "Python",
  },
  searchWeb: {
    description: "Search the web for up-to-date information.",
    label: "Web search",
  },
  writeDocument: {
    description: "Create or overwrite scripts, documents, and spreadsheets.",
    label: "Write document",
  },
};

export const CONFIGURABLE_TOOLS = ["searchWeb"] as const;

export type ConfigurableToolId = (typeof CONFIGURABLE_TOOLS)[number];

export const SEARCH_PROVIDERS = ["tavily", "searxng"] as const;

export type SearchProvider = (typeof SEARCH_PROVIDERS)[number];
