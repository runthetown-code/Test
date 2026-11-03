/** Drops everything in the public schema (development only). */
import "dotenv/config";
import { Pool } from "pg";
import { dbUrls } from "../src/db/urls";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("refusing to reset in production");
  const pool = new Pool({ connectionString: dbUrls().ownerDirect });
  const { rows } = await pool.query(
    `select tablename from pg_tables where schemaname = 'public'`,
  );
  for (const r of rows) await pool.query(`drop table if exists "${r.tablename}" cascade`);
  await pool.query(`drop schema if exists drizzle cascade`);
  console.log(`✓ dropped ${rows.length} tables`);
  await pool.end();
}
main();
