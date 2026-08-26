export const TOOL_IDS = [
  "getWeather",
  "writeFile",
  "editFile",
  "readFile",
  "searchWeb",
  "fetchUrl",
  "runPython",
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

// Legacy aliases kept for backward compat with stored messages / approval flows
export const LEGACY_TOOL_IDS = ["writeDocument", "editDocument"] as const;

export const TOOL_IDS_SET: ReadonlySet<string> = new Set([
  ...TOOL_IDS,
  ...LEGACY_TOOL_IDS,
]);

export const FILE_TOOL_IDS = ["writeFile", "editFile", "readFile"] as const;
export const DOCUMENT_TOOL_IDS = ["writeFile", "editFile"] as const;

export type ToolMetadata = { label: string; description: string };

export const TOOL_METADATA: Record<ToolId, ToolMetadata> = {
  editFile: {
    description: "Make targeted edits to an existing file.",
    label: "Edit file",
  },
  fetchUrl: {
    description: "Read the content of a web page from its URL.",
    label: "Fetch URL",
  },
  getWeather: {
    description: "Get current weather at a location.",
    label: "Weather",
  },
  readFile: {
    description: "Read the content of an existing file.",
    label: "Read file",
  },
  runPython: {
    description: "Run Python code to solve math, logic, and data problems.",
    label: "Python",
  },
  searchWeb: {
    description: "Search the web for up-to-date information.",
    label: "Web search",
  },
  writeFile: {
    description: "Create or overwrite files, scripts, and spreadsheets.",
    label: "Write file",
  },
};

export const CONFIGURABLE_TOOLS = ["searchWeb"] as const;

export type ConfigurableToolId = (typeof CONFIGURABLE_TOOLS)[number];

export const SEARCH_PROVIDERS = ["tavily", "searxng"] as const;

export type SearchProvider = (typeof SEARCH_PROVIDERS)[number];
