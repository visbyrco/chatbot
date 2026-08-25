import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({
  path: "../../.env.local",
});
config({
  path: ".env.local",
});

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) {
  const msg =
    "[drizzle.config] POSTGRES_URL is not set – drizzle-kit commands will fail without a database URL";
  const isDemo = process.env.DEMO_MODE === "1";
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isDemo && !isBuild) {
    throw new Error(msg);
  }
  console.warn(msg);
}

export default defineConfig({
  dbCredentials: {
    url: postgresUrl ?? "",
  },
  dialect: "postgresql",
  out: "./lib/db/migrations",
  schema: "./lib/db/schema.ts",
});
