import "./env";
import pg from "pg";

// Postgres sends NUMERIC (prices) as text to avoid losing precision. Prices
// are stored with two decimals, so plain numbers are safe here.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number);

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Run `neon env pull` in the repo root, or set it on the host.",
  );
}

/**
 * Neon's connection strings say sslmode=require, which pg currently treats as
 * full certificate checking but will weaken in pg 9. Ask for that explicitly.
 */
export const withFullTls = (url: string) =>
  url.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/, "$1verify-full");

// The pooled Neon connection, for the app's normal queries.
export const db = new pg.Pool({
  connectionString: withFullTls(process.env.DATABASE_URL),
});

// Neon closes idle connections when the database scales to zero; the pool
// opens a new one on the next query, so this is not fatal.
db.on("error", (err) => console.error("Idle database connection closed:", err.message));

/** Runs `work` in a transaction, rolling back if it throws. */
export async function transaction<T>(
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
