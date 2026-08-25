import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { executePython, MAX_CODE_LENGTH } from "./python/pool";

export const runPythonTool = tool({
  description:
    "Execute Python 3 code in a secure sandbox. Available packages: numpy, sympy, scipy, pandas, matplotlib. Use for arithmetic, symbolic math, numerical computation, statistics, and data processing. Print results to stdout. No network access, no filesystem, no plotting.",
  execute: async ({ code }, options) =>
    executePython(code, options?.abortSignal),
  inputSchema: z.object({
    code: z
      .string()
      .min(1)
      .max(MAX_CODE_LENGTH)
      .describe("Python 3 source code to execute."),
  }),
});
