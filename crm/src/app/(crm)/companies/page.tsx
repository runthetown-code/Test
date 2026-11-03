import { asc, eq, ilike, or, sql } from "drizzle-orm";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { createCompany } from "@/actions/crm";
import { schema } from "@/db";
import { AutoSubmitForm, Dialog, SubmitButton } from "@/components/client";
import { CompanyFields } from "@/components/forms";
import { EmptyState, PageHeader, Tags } from "@/components/ui";
import { getAppContext } from "@/lib/access";
import { money } from "@/lib/format";

export const metadata = { title: "Companies" };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { db } = await getAppContext();

  const { rows, defs } = await db(async (tx) => {
    const contactCount = tx
      .select({ companyId: schema.contacts.companyId, n: sql<number>`count(*)::int`.as("n") })
      .from(schema.contacts)
      .groupBy(schema.contacts.companyId)
      .as("cc");
    const openValue = tx
      .select({
        companyId: schema.deals.companyId,
        v: sql<number>`sum(${schema.deals.valueCents})`.as("v"),
      })
      .from(schema.deals)
      .innerJoin(schema.pipelineStages, eq(schema.pipelineStages.id, schema.deals.stageId))
      .where(eq(schema.pipelineStages.kind, "open"))
      .groupBy(schema.deals.companyId)
      .as("ov");
    const rows = await tx
      .select({
        company: schema.companies,
        contacts: sql<number>`coalesce(${contactCount.n}, 0)`,
        open: sql<number>`coalesce(${openValue.v}, 0)::bigint`,
      })
      .from(schema.companies)
      .leftJoin(contactCount, eq(contactCount.companyId, schema.companies.id))
      .leftJoin(openValue, eq(openValue.companyId, schema.companies.id))
      .where(q ? or(ilike(schema.companies.name, `%${q}%`), ilike(schema.companies.domain, `%${q}%`)) : undefined)
      .orderBy(asc(schema.companies.name))
      .limit(200);
    const defs = await tx.query.customFieldDefs.findMany({ where: eq(schema.customFieldDefs.entity, "company") });
    return { rows, defs };
  });

  return (
    <>
      <PageHeader
        title="Companies"
        description={`${rows.length} ${rows.length === 1 ? "company" : "companies"}`}
        actions={
          <Dialog title="New company" wide trigger={<><Plus className="size-4" /> New company</>}>
            <form action={createCompany}>
              <CompanyFields defs={defs} />
              <div className="mt-5 flex justify-end">
                <SubmitButton>Create company</SubmitButton>
              </div>
            </form>
          </Dialog>
        }
      />
      <AutoSubmitForm className="mb-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input name="q" defaultValue={q} placeholder="Search companies…" className="input pl-9" />
        </div>
      </AutoSubmitForm>

      {rows.length === 0 ? (
        <EmptyState title={q ? "No companies match" : "No companies yet"} body={q ? undefined : "Companies group contacts and deals for the same organization."} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ company: c, contacts, open }) => (
            <Link key={c.id} href={`/companies/${c.id}`} className="card group p-5 transition hover:border-brand/40 hover:shadow-md">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-sm font-semibold text-zinc-600 group-hover:bg-brand-soft group-hover:text-brand-strong">
                  {c.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium group-hover:text-brand">{c.name}</div>
                  <div className="truncate text-xs text-zinc-500">{[c.industry, c.domain].filter(Boolean).join(" · ") || "—"}</div>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-zinc-500">
                  {contacts} {contacts === 1 ? "contact" : "contacts"}
                </span>
                <span className="tabular-nums">
                  {Number(open) > 0 ? <>{money(Number(open))} <span className="text-zinc-400">open</span></> : <span className="text-zinc-400">No open deals</span>}
                </span>
              </div>
              {c.tags.length > 0 && (
                <div className="mt-3">
                  <Tags tags={c.tags} />
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
