import { desc } from "drizzle-orm";
import Link from "next/link";
import { createTenant } from "@/actions/admin";
import { ownerDb, schema } from "@/db";
import { ActionForm } from "@/components/action-form";
import { Dialog, SubmitButton } from "@/components/client";
import { PageHeader, Stat } from "@/components/ui";
import { money, relTime } from "@/lib/format";
import { PIPELINE_TEMPLATES } from "@/lib/provision";
import { PLATFORM_DOMAIN } from "@/lib/tenant";
import { usageByTenant } from "./usage";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const tenants = await ownerDb.select().from(schema.tenants).orderBy(desc(schema.tenants.createdAt));
  const usage = await usageByTenant();
  const totals = [...usage.values()].reduce(
    (a, u) => ({ contacts: a.contacts + u.contacts, members: a.members + u.members, open: a.open + u.openValue }),
    { contacts: 0, members: 0, open: 0 },
  );

  return (
    <>
      <PageHeader
        title="Client workspaces"
        description="Every client gets an isolated, branded CRM."
        actions={
          <Dialog title="New client workspace" wide trigger="+ New workspace">
            <ActionForm action={createTenant} className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">Business name *</span>
                <input name="name" required className="input" placeholder="Bright Smile Dental" />
              </label>
              <label className="block">
                <span className="label">Subdomain</span>
                <div className="flex items-center rounded-lg border border-zinc-300 bg-white pr-3 shadow-sm focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15">
                  <input name="slug" className="w-full rounded-lg border-0 bg-transparent px-3 py-2 text-sm outline-none" placeholder="brightsmile" />
                  <span className="whitespace-nowrap text-xs text-zinc-400">.{PLATFORM_DOMAIN}</span>
                </div>
              </label>
              <label className="block">
                <span className="label">Owner email *</span>
                <input name="ownerEmail" type="email" required className="input" placeholder="owner@client.com" />
              </label>
              <label className="block">
                <span className="label">Owner name</span>
                <input name="ownerName" className="input" />
              </label>
              <label className="block">
                <span className="label">Industry (sets the default pipeline)</span>
                <select name="industry" className="input">
                  {Object.keys(PIPELINE_TEMPLATES).map((k) => (
                    <option key={k} value={k === "general" ? "" : k}>
                      {k === "general" ? "General" : k}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">Brand color</span>
                  <input name="primaryColor" type="color" defaultValue="#4f46e5" className="h-[38px] w-full cursor-pointer rounded-lg border border-zinc-300 bg-white p-1" />
                </label>
                <label className="block">
                  <span className="label">Plan</span>
                  <select name="plan" className="input">
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </label>
              </div>
              <div className="flex justify-end sm:col-span-2">
                <SubmitButton pendingText="Creating…">Create workspace</SubmitButton>
              </div>
            </ActionForm>
          </Dialog>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Workspaces" value={tenants.length} hint={`${tenants.filter((t) => t.status === "active").length} active`} />
        <Stat label="Users" value={totals.members} />
        <Stat label="Contacts managed" value={totals.contacts.toLocaleString()} />
        <Stat label="Open pipeline (all clients)" value={money(totals.open, { compact: true })} />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-zinc-200 bg-zinc-50/60">
              <tr>
                <th className="table-th">Workspace</th>
                <th className="table-th">Plan</th>
                <th className="table-th text-right">Users</th>
                <th className="table-th text-right">Contacts</th>
                <th className="table-th text-right">Deals</th>
                <th className="table-th text-right">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {tenants.map((t) => {
                const u = usage.get(t.id);
                return (
                  <tr key={t.id} className="group hover:bg-zinc-50">
                    <td className="table-td">
                      <Link href={`/admin/tenants/${t.id}`} className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white" style={{ background: t.primaryColor }}>
                          {t.name[0]?.toUpperCase()}
                        </span>
                        <span>
                          <span className="block font-medium group-hover:underline">{t.name}</span>
                          <span className="block text-xs text-zinc-500">
                            {t.slug}.{PLATFORM_DOMAIN}
                          </span>
                        </span>
                        {t.status === "suspended" && <span className="badge bg-red-50 text-red-700">Suspended</span>}
                      </Link>
                    </td>
                    <td className="table-td capitalize text-zinc-600">{t.plan}</td>
                    <td className="table-td text-right tabular-nums">{u?.members ?? 0}</td>
                    <td className="table-td text-right tabular-nums">{u?.contacts ?? 0}</td>
                    <td className="table-td text-right tabular-nums">{u?.deals ?? 0}</td>
                    <td className="table-td text-right text-zinc-500">{relTime(u?.lastActivity)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
