#!/bin/sh
set -e
trap 'rm -f /app/migrate.mjs' EXIT

if [ -z "$ENCRYPTION_KEY" ] && [ "$DEMO_MODE" != "1" ]; then
  echo "ERROR: ENCRYPTION_KEY is not set. It is required to encrypt provider API keys."
  echo "Generate one with: openssl rand -base64 32"
  echo "If running a demo without external services, set DEMO_MODE=1 (and ALLOW_DEMO_IN_PROD=1 in production)."
  exit 1
fi

if [ "$DEMO_MODE" = "1" ]; then
  echo "DEMO_MODE=1, skipping database migrations..."
else
  echo "Running database migrations..."
  # Write migration script to a temp file to avoid shell quoting issues with POSTGRES_URL
  cat > /app/migrate.mjs <<'MIGRATE_EOF'
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function waitForPostgres(url, maxAttempts = 0) {
  // maxAttempts <= 0 (the default), an unset/empty/invalid
  // POSTGRES_WAIT_MAX_ATTEMPTS, or an explicit "0" all mean the same
  // thing: wait indefinitely. A bounded budget caused two crash-loop
  // restarts after a host reboot while Postgres ran ~3min of WAL recovery
  // (#227): on `restart: unless-stopped` "not ready yet" is never a
  // reason to exit 1. Set POSTGRES_WAIT_MAX_ATTEMPTS=<n> for a hard cap
  // of n attempts (~4s each worst-case) when one is wanted (e.g. CI).
  const rawCap = (process.env.POSTGRES_WAIT_MAX_ATTEMPTS ?? "").trim();
  const parsedCap = Number.parseInt(rawCap, 10);
  const cap = Number.isFinite(parsedCap) && parsedCap > 0 ? parsedCap : maxAttempts;
  const bounded = Number.isFinite(cap) && cap > 0;
  console.log(
    bounded
      ? `Waiting for PostgreSQL (up to ${cap} attempts)...`
      : "Waiting for PostgreSQL..."
  );
  const start = Date.now();
  let attempt = 0;
  for (;;) {
    attempt += 1;
    let connection;
    try {
      // connect_timeout keeps each attempt cheap so the loop stays
      // responsive instead of hanging inside one long connect (#227).
      connection = postgres(url, { max: 1, connect_timeout: 2 });
      await connection`SELECT 1`;
      await connection.end();
      console.log("PostgreSQL is ready!");
      return true;
    } catch (err) {
      try { if (connection) await connection.end(); } catch {}
      const msg = err instanceof Error ? err.message : String(err);
      // Auth/config errors never resolve by waiting — fail fast with the
      // cause instead of logging `Attempt N...` forever (#227 review).
      // A typo in POSTGRES_PASSWORD would otherwise be a silent hang.
      if (/password authentication failed|role .* does not exist|database .* does not exist|getaddrinfo ENOTFOUND/i.test(msg)) {
        console.error(`PostgreSQL misconfigured (not retrying): ${msg}`);
        return false;
      }
      if (bounded && attempt >= cap) {
        console.error(`PostgreSQL did not become ready after ${cap} attempts: ${msg}`);
        return false;
      }
      const label = bounded ? `Attempt ${attempt}/${cap}` : `Attempt ${attempt}`;
      console.log(`${label}: PostgreSQL not ready (${msg}), waiting...`);
      if (!bounded && attempt % 30 === 0) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        console.log(`Still waiting for PostgreSQL after ${attempt} attempts (~${elapsed}s elapsed)...`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

if (!process.env.POSTGRES_URL) {
  console.log("POSTGRES_URL not defined, skipping migrations");
  process.exit(0);
}

const isReady = await waitForPostgres(process.env.POSTGRES_URL);
if (!isReady) {
  process.exit(1);
}

let _conn;
try {
  _conn = postgres(process.env.POSTGRES_URL, { max: 1 });
  const db = drizzle(_conn);
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./lib/db/migrations" });
  console.log("Migrations complete");
} finally {
  try { if (_conn) await _conn.end(); } catch {}
}
process.exit(0);
MIGRATE_EOF
  node /app/migrate.mjs
fi
echo "Starting application..."
exec node server.js
