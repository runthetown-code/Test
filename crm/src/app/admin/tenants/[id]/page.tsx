import { desc, eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { impersonate, updateTenant } from "@/actions/admin";
import { ownerDb, schema } from "@/db";
import { SubmitButton } from "@/components/client";
import { Avatar, PageHeader, Stat } from "@/components/ui";
import { getMembers } from "@/lib/access";
import { money, relTime } from "@/lib/format";
import { tenantBaseUrl } from "@/lib/tenant";
import { usageByTenant } from "../../usage";

export const dynamic = "force-dynamic";

export default async function TenantAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const t = await ownerDb.query.tenants.findFirst({ where: eq(schema.tenants.id, id) });
  if (!t) notFound();
  const [members, domains, usage, audit] = [
    await getMembers(t.id),
    await ownerDb.query.domains.findMany({ where: eq(schema.domains.tenantId, t.id) }),
    (await usageByTenant()).get(t.id),
    await ownerDb.select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, t.id)).orderBy(desc(schema.auditLog.createdAt)).limit(10),
  ];
  const url = await tenantBaseUrl(t);

  return (
    <>
      <PageHeader
        back={{ href: "/admin", label: "All workspaces" }}
        title={
          <span className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg text-sm font-bold text-white" style={{ background: t.primaryColor }}>
              {t.name[0]}
            </span>
            {t.name}
          </span>
        }
        description={
          <a href={url} className="hover:underline">
            {url.replace(/^https?:\/\//, "")}
          </a>
        }
        actions={
          <form action={impersonate.bind(null, t.id)}>
            <button className="btn-primary">
              Open as support <ExternalLink className="size-4" />
            </button>
          </form>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Users" value={usage?.members ?? 0} />
        <Stat label="Contacts" value={usage?.contacts ?? 0} />
        <Stat label="Deals" value={usage?.deals ?? 0} />
        <Stat label="Open pipeline" value={money(usage?.openValue ?? 0, { compact: true })} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold">Account</h2>
          <form action={updateTenant.bind(null, t.id)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">Status</span>
                <select name="status" defaultValue={t.status} className="input">
                  <option value="active">Active</option>
                  <option value="suspended">Suspended (blocks client sign-in)</option>
                </select>
              </label>
              <label className="block">
                <span className="label">Plan</span>
                <select name="plan" defaultValue={t.plan} className="input">
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </label>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="emailDomainVerified" defaultChecked={t.emailDomainVerified} disabled={!t.emailDomain} className="mt-0.5" />
              <span>
                Sending domain verified in Resend
                <span className="block text-xs text-zinc-500">
                  {t.emailDomain ? `Client requested ${t.emailDomain}. Verify it in Resend first.` : "Client hasn't set a sending domain."}
                </span>
              </span>
            </label>
            <SubmitButton>Save</SubmitButton>
          </form>
          <dl className="mt-5 space-y-2 border-t border-zinc-100 pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Industry</dt>
              <dd>{t.industry ?? "General"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Created</dt>
              <dd>{t.createdAt.toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Custom domains</dt>
              <dd className="text-right">{domains.length ? domains.map((d) => `${d.hostname}${d.verified ? "" : " (pending)"}`).join(", ") : "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">Team</h2>
          <ul className="divide-y divide-zinc-100">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={m.name || m.email} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {m.name || m.email} <span className="text-zinc-400">{m.email}</span>
                </span>
                <span className="badge bg-zinc-100 capitalize text-zinc-700">{m.role}</span>
              </li>
            ))}
          </ul>
          <h2 className="mb-2 mt-6 text-sm font-semibold">Audit log</h2>
          <ul className="space-y-1.5 text-xs text-zinc-600">
            {audit.map((a) => (
              <li key={a.id} className="flex justify-between gap-3">
                <span>
                  <code className="text-zinc-800">{a.action}</code> {a.detail}
                </span>
                <span className="shrink-0 text-zinc-400">{relTime(a.createdAt)}</span>
              </li>
            ))}
            {audit.length === 0 && <li className="text-zinc-400">No entries.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
