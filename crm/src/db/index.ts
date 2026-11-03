import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { ownerPool?: Pool; appPool?: Pool };

function makePool(url: string | undefined, name: string) {
  if (!url) throw new Error(`${name} is not set`);
  return new Pool({ connectionString: url, max: 5 });
}

const ownerPool = (globalForDb.ownerPool ??= makePool(
  process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL,
  "DATABASE_OWNER_URL",
));
const appPool = (globalForDb.appPool ??= makePool(process.env.DATABASE_URL, "DATABASE_URL"));

/**
 * Platform connection: tenants, users, memberships, auth, audit and email tables.
 * Never use it to read tenant CRM data in request handlers; use withTenant().
 */
export const ownerDb: DB = drizzle(ownerPool, { schema });

const appDb: DB = drizzle(appPool, { schema });

export type TenantTx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Runs `fn` in a transaction on the restricted app role with `app.tenant_id` pinned.
 * Postgres RLS then filters every read and rejects every write outside that tenant,
 * so a forgotten WHERE clause can't leak data across tenants.
 */
export async function withTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  return appDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

export { schema };
