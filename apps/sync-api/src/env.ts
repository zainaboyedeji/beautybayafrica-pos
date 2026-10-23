import { existsSync } from "node:fs";
import path from "node:path";

// Local settings: ADMIN_PASSWORD etc. live in apps/sync-api/.env, and the Neon
// DATABASE_URL that `neon deploy` writes lives in the repo root's .env.local.
// On a host, set these as environment variables instead.
for (const file of [".env", path.resolve(__dirname, "../../../.env.local")]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
