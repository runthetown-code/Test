/**
 * Proves Postgres row-level security isolates tenants, independent of application code.
 * Runs raw queries as the restricted app role with no WHERE clauses.
 */
import "dotenv/config";
import { Pool } from "pg";

const app = new Pool({ connectionString: process.env.DATABASE_URL });
const owner = new Pool({ connectionString: process.env.DATABASE_OWNER_URL });
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function asTenant<T>(tenantId: string | null, fn: (q: (sql: string, p?: unknown[]) => Promise<any[]>) => Promise<T>) {
  const c = await app.connect();
  try {
    await c.query("begin");
    if (tenantId) await c.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    return await fn(async (sql, p) => (await c.query(sql, p)).rows);
  } finally {
    await c.query("rollback");
    c.release();
  }
}

async function main() {
  const { rows: tenants } = await owner.query("select id, slug from tenants where slug in ('acme','harbor') order by slug");
  const [acme, harbor] = tenants;
  const { rows: totals } = await owner.query("select tenant_id, count(*)::int n from contacts group by tenant_id");
  const total = (id: string) => totals.find((t) => t.tenant_id === id)?.n ?? 0;

  await asTenant(acme.id, async (q) => {
    const rows = await q("select tenant_id from contacts");
    check("acme sees only its own contacts", rows.length === total(acme.id) && rows.every((r) => r.tenant_id === acme.id), `${rows.length} rows`);
    const leak = await q("select count(*)::int n from deals where tenant_id = $1", [harbor.id]);
    check("acme cannot read harbor deals even when asking explicitly", leak[0].n === 0);
    const upd = await q("update contacts set first_name = 'pwned' where tenant_id = $1 returning id", [harbor.id]);
    check("acme cannot update harbor rows", upd.length === 0);
    let blocked = false;
    try {
      await q("insert into contacts (tenant_id, first_name) values ($1, 'sneaky')", [harbor.id]);
    } catch {
      blocked = true;
    }
    check("acme cannot insert rows into harbor", blocked);
  });

  await asTenant(harbor.id, async (q) => {
    const rows = await q("select count(*)::int n from contacts");
    check("harbor sees only its own contacts", rows[0].n === total(harbor.id), `${rows[0].n} rows`);
  });

  await asTenant(null, async (q) => {
    const rows = await q("select count(*)::int n from contacts");
    check("no tenant context → no rows", rows[0].n === 0);
  });

  await asTenant(acme.id, async (q) => {
    let denied = false;
    try {
      await q("select * from users");
    } catch {
      denied = true;
    }
    check("app role cannot read platform tables (users)", denied);
  });

  await app.end();
  await owner.end();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll isolation checks passed");
  process.exit(failures ? 1 : 0);
}
main();
