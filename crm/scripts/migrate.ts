/**
 * Applies Drizzle migrations (as the owner role), then (re)installs row-level security
 * policies and grants for the restricted app role. Safe to run repeatedly.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { TENANT_TABLES } from "../src/db/schema";

async function main() {
  const ownerUrl = process.env.DATABASE_OWNER_URL!;
  const appUrl = process.env.DATABASE_URL!;
  const appRole = decodeURIComponent(new URL(appUrl).username);
  const ownerRole = decodeURIComponent(new URL(ownerUrl).username);

  const pool = new Pool({ connectionString: ownerUrl });
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
        "⚠ DATABASE_URL and DATABASE_OWNER_URL use the same role. The owner bypasses RLS, so tenant isolation\n" +
          "  would rely on application code only. Create a separate login role for DATABASE_URL in production.",
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
