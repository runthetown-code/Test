import "server-only";
import { sql } from "drizzle-orm";
import { ownerDb } from "@/db";

export type Usage = { contacts: number; deals: number; members: number; openValue: number; lastActivity: Date | null };

/** Cross-tenant usage, read with the owner role (platform admin only). */
export async function usageByTenant(): Promise<Map<string, Usage>> {
  const { rows } = await ownerDb.execute<{
    id: string;
    contacts: number;
    deals: number;
    members: number;
    open_value: string | null;
    last_activity: Date | null;
  }>(sql`
    select t.id,
      (select count(*)::int from contacts c where c.tenant_id = t.id) as contacts,
      (select count(*)::int from deals d where d.tenant_id = t.id) as deals,
      (select count(*)::int from memberships m where m.tenant_id = t.id) as members,
      (select sum(d.value_cents) from deals d join pipeline_stages s on s.id = d.stage_id where d.tenant_id = t.id and s.kind = 'open') as open_value,
      (select max(a.created_at) from activities a where a.tenant_id = t.id) as last_activity
    from tenants t`);
  return new Map(
    rows.map((r) => [
      r.id,
      { contacts: r.contacts, deals: r.deals, members: r.members, openValue: Number(r.open_value ?? 0), lastActivity: r.last_activity ? new Date(r.last_activity) : null },
    ]),
  );
}
