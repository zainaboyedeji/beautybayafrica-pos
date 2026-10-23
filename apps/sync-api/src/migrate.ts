import "./env";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { withFullTls } from "./db";

// Applies new files from migrations/ in name order. Schema changes use the
// direct (unpooled) connection, as Neon recommends.
const migrationsDir = path.resolve(__dirname, "../migrations");

async function main() {
  const client = new pg.Client({
    connectionString: withFullTls(
      process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
    ),
  });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations",
    );
    const applied = new Set(rows.map((r) => r.name));
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(path.join(migrationsDir, file), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
          file,
        ]);
        await client.query("COMMIT");
        console.log(`Applied ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    console.log("Database schema is up to date.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
