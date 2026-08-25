import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "server-only": path.resolve(
        import.meta.dirname,
        "./tests/__mocks__/server-only.ts"
      ),
    },
  },
  test: {
    environment: "node",
    exclude: ["lib/ai/models.test.ts", "node_modules/**"],
    globals: false,
    include: ["lib/**/*.test.ts", "tests/unit/**/*.test.ts"],
  },
});
