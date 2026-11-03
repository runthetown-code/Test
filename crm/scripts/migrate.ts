/**
 * Applies Drizzle migrations (as the owner role), then (re)installs row-level security
 * policies and grants for the restricted app role. Safe to run repeatedly.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { TENANT_TABLES } from "../src/db/schema";
import { APP_ROLE, dbUrls } from "../src/db/urls";

async function main() {
  const { ownerDirect, app } = dbUrls();
  if (!ownerDirect || !app) throw new Error("Set DATABASE_URL and DATABASE_APP_URL (or APP_DB_PASSWORD)");
  const appRole = decodeURIComponent(new URL(app).username);
  const ownerRole = decodeURIComponent(new URL(ownerDirect).username);

  const pool = new Pool({ connectionString: ownerDirect });
  // On hosted Postgres (Neon), create the restricted app role on first run.
  if (process.env.APP_DB_PASSWORD && !process.env.DATABASE_APP_URL) {
    const { rows } = await pool.query("select 1 from pg_roles where rolname = $1", [APP_ROLE]);
    const pw = process.env.APP_DB_PASSWORD.replace(/'/g, "''");
    await pool.query(`${rows.length ? "ALTER" : "CREATE"} ROLE "${APP_ROLE}" WITH LOGIN PASSWORD '${pw}'`);
    console.log(`✓ app role "${APP_ROLE}" ${rows.length ? "updated" : "created"}`);
  }
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("✓ schema migrations applied");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const policy = `tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`;
    for (const t of TENANT_TABLES) {
      await client.query(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY`);
      await client.query(`DROP POLICY IF EXISTS tenant_isolation ON "${t}"`);
      await client.query(
        `CREATE POLICY tenant_isolation ON "${t}" USING (${policy}) WITH CHECK (${policy})`,
      );
      if (appRole !== ownerRole) {
        await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON "${t}" TO "${appRole}"`);
      }
    }
    if (appRole !== ownerRole) {
      await client.query(`GRANT USAGE ON SCHEMA public TO "${appRole}"`);
      // The app role needs to validate FKs to tenants but never reads platform tables directly.
      await client.query(`REVOKE ALL ON tenants, domains, users, accounts, sessions, verification_tokens, memberships, audit_log, email_log FROM "${appRole}"`);
    } else {
      console.warn(
        "⚠ The app and owner connections use the same role. The owner bypasses RLS, so tenant isolation\n" +
          "  would rely on application code only. Set DATABASE_APP_URL or APP_DB_PASSWORD in production.",
      );
    }
    await client.query("COMMIT");
    console.log(`✓ row-level security enabled on ${TENANT_TABLES.length} tables for role "${appRole}"`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
