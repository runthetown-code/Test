import { and, arrayContains, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { createContact } from "@/actions/crm";
import { schema } from "@/db";
import { LIFECYCLES } from "@/db/schema";
import { AutoSubmitForm, Dialog, SubmitButton } from "@/components/client";
import { ContactFields } from "@/components/forms";
import { Avatar, EmptyState, LifecycleBadge, PageHeader, Tags } from "@/components/ui";
import { getAppContext, getMembers } from "@/lib/access";
import { fullName, relTime } from "@/lib/format";

export const metadata = { title: "Contacts" };
const PAGE = 50;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; lifecycle?: string; tag?: string; owner?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const { tenant, db } = await getAppContext();
  const members = await getMembers(tenant.id);
  const names = new Map(members.map((m) => [m.id, m.name || m.email]));
  const page = Math.max(1, Number(sp.page) || 1);

  const filters: SQL[] = [];
  if (sp.q) {
    const q = `%${sp.q.trim()}%`;
    filters.push(
      or(
        ilike(sql`${schema.contacts.firstName} || ' ' || coalesce(${schema.contacts.lastName}, '')`, q),
        ilike(schema.contacts.email, q),
        ilike(schema.contacts.phone, q),
        ilike(schema.companies.name, q),
      )!,
    );
  }
  if (sp.lifecycle && (LIFECYCLES as readonly string[]).includes(sp.lifecycle)) {
    filters.push(eq(schema.contacts.lifecycle, sp.lifecycle as (typeof LIFECYCLES)[number]));
  }
  if (sp.tag) filters.push(arrayContains(schema.contacts.tags, [sp.tag]));
  if (sp.owner) filters.push(eq(schema.contacts.ownerId, sp.owner));
  const where = filters.length ? and(...filters) : undefined;

  const { rows, total, tags, companies, defs } = await db(async (tx) => {
    const rows = await tx
      .select({ contact: schema.contacts, companyName: schema.companies.name })
      .from(schema.contacts)
      .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
      .where(where)
      .orderBy(desc(sql`coalesce(${schema.contacts.lastActivityAt}, ${schema.contacts.createdAt})`))
      .limit(PAGE)
      .offset((page - 1) * PAGE);
    const [{ total }] = await tx
      .select({ total: count() })
      .from(schema.contacts)
      .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
      .where(where);
    const tags = await tx
      .selectDistinct({ tag: sql<string>`unnest(${schema.contacts.tags})` })
      .from(schema.contacts)
      .orderBy(sql`1`);
    const companies = await tx
      .select({ id: schema.companies.id, name: schema.companies.name })
      .from(schema.companies)
      .orderBy(asc(schema.companies.name));
    const defs = await tx.query.customFieldDefs.findMany({
      where: eq(schema.customFieldDefs.entity, "contact"),
      orderBy: asc(schema.customFieldDefs.position),
    });
    return { rows, total, tags: tags.map((t) => t.tag), companies, defs };
  });

  const pages = Math.ceil(total / PAGE);
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set("page", String(p));
    return `?${u}`;
  };

  return (
    <>
      <PageHeader
        title="Contacts"
        description={`${total} ${total === 1 ? "person" : "people"}`}
        actions={
          <>
            <a href="/api/export/contacts" className="btn-secondary">
              Export CSV
            </a>
            <Dialog
              title="New contact"
              wide
              trigger={
                <>
                  <Plus className="size-4" /> New contact
                </>
              }
            >
              <form action={createContact}>
                <ContactFields companies={companies} members={members} defs={defs} />
                <div className="mt-5 flex justify-end">
                  <SubmitButton>Create contact</SubmitButton>
                </div>
              </form>
            </Dialog>
          </>
        }
      />

      <AutoSubmitForm className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input name="q" defaultValue={sp.q} placeholder="Search name, email, phone, company…" className="input pl-9" />
        </div>
        <select name="lifecycle" defaultValue={sp.lifecycle ?? ""} className="input w-auto capitalize">
          <option value="">All stages</option>
          {LIFECYCLES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <select name="tag" defaultValue={sp.tag ?? ""} className="input w-auto">
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select name="owner" defaultValue={sp.owner ?? ""} className="input w-auto">
          <option value="">Any owner</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name || m.email}
            </option>
          ))}
        </select>
      </AutoSubmitForm>

      {rows.length === 0 ? (
        <EmptyState
          title={where ? "No contacts match these filters" : "No contacts yet"}
          body={where ? "Try a different search." : "Add your first contact, or import a spreadsheet from your old CRM."}
          action={
            !where && (
              <Link href="/import" className="btn-secondary">
                Import CSV
              </Link>
            )
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-zinc-200 bg-zinc-50/60">
                <tr>
                  <th className="table-th">Name</th>
                  <th className="table-th">Company</th>
                  <th className="table-th">Stage</th>
                  <th className="table-th">Tags</th>
                  <th className="table-th">Owner</th>
                  <th className="table-th text-right">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map(({ contact: c, companyName }) => (
                  <tr key={c.id} className="group hover:bg-zinc-50">
                    <td className="table-td">
                      <Link href={`/contacts/${c.id}`} className="flex items-center gap-3">
                        <Avatar name={fullName(c)} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium group-hover:text-brand">{fullName(c)}</span>
                          <span className="block truncate text-xs text-zinc-500">{c.email ?? c.phone ?? "—"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="table-td text-zinc-600">
                      {c.companyId ? (
                        <Link href={`/companies/${c.companyId}`} className="hover:underline">
                          {companyName}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="table-td">
                      <LifecycleBadge value={c.lifecycle} />
                    </td>
                    <td className="table-td">
                      <Tags tags={c.tags} />
                    </td>
                    <td className="table-td text-zinc-600">{names.get(c.ownerId ?? "") ?? "—"}</td>
                    <td className="table-td text-right text-zinc-500">{relTime(c.lastActivityAt ?? c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 text-sm">
              <span className="text-zinc-500">
                Page {page} of {pages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={qs(page - 1)} className="btn-secondary btn-sm">
                    Previous
                  </Link>
                )}
                {page < pages && (
                  <Link href={qs(page + 1)} className="btn-secondary btn-sm">
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
