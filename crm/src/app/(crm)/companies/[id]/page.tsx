import { asc, desc, eq } from "drizzle-orm";
import { Globe, MapPin, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createDeal, deleteCompany, updateCompany } from "@/actions/crm";
import { schema } from "@/db";
import { seq } from "@/lib/queries";
import { ConfirmButton, Dialog, SubmitButton } from "@/components/client";
import { CompanyFields, DealFields } from "@/components/forms";
import { NoteComposer, TaskRow, Timeline, type TimelineItem } from "@/components/record";
import { Avatar, LifecycleBadge, PageHeader, Tags } from "@/components/ui";
import { getAppContext, getMembers, hasRole } from "@/lib/access";
import { fullName, money } from "@/lib/format";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { tenant, role, db } = await getAppContext();
  const members = await getMembers(tenant.id);
  const names = new Map(members.map((m) => [m.id, m.name || m.email]));

  const data = await db(async (tx) => {
    const company = await tx.query.companies.findFirst({ where: eq(schema.companies.id, id) });
    if (!company) return null;
    const [contacts, deals, notes, activities, tasks, stages, defs, dealDefs] = await seq([
      () => tx.query.contacts.findMany({ where: eq(schema.contacts.companyId, id), orderBy: asc(schema.contacts.firstName) }),
      () => tx.query.deals.findMany({ where: eq(schema.deals.companyId, id), orderBy: desc(schema.deals.createdAt) }),
      () => tx.query.notes.findMany({ where: eq(schema.notes.companyId, id), orderBy: desc(schema.notes.createdAt) }),
      () => tx.query.activities.findMany({ where: eq(schema.activities.companyId, id), orderBy: desc(schema.activities.createdAt), limit: 100 }),
      () => tx.query.tasks.findMany({ where: eq(schema.tasks.companyId, id), orderBy: [asc(schema.tasks.done), asc(schema.tasks.dueAt)] }),
      () => tx.query.pipelineStages.findMany({ orderBy: asc(schema.pipelineStages.position) }),
      () => tx.query.customFieldDefs.findMany({ where: eq(schema.customFieldDefs.entity, "company") }),
      () => tx.query.customFieldDefs.findMany({ where: eq(schema.customFieldDefs.entity, "deal") }),
    ] as const);
    return { company, contacts, deals, notes, activities, tasks, stages, defs, dealDefs };
  });
  if (!data) notFound();
  const { company: c, stages } = data;
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const openValue = data.deals.filter((d) => stageById.get(d.stageId)?.kind === "open").reduce((a, d) => a + d.valueCents, 0);
  const wonValue = data.deals.filter((d) => stageById.get(d.stageId)?.kind === "won").reduce((a, d) => a + d.valueCents, 0);

  const timeline: TimelineItem[] = [
    ...data.notes.map((n) => ({ id: n.id, kind: "note" as const, type: "note", body: n.body, actor: names.get(n.authorId ?? "") ?? "Someone", at: n.createdAt })),
    ...data.activities
      .filter((a) => a.type !== "note")
      .map((a) => ({ id: a.id, kind: "activity" as const, type: a.type, body: a.summary, actor: names.get(a.actorId ?? "") ?? "System", at: a.createdAt })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <PageHeader
        back={{ href: "/companies", label: "Companies" }}
        title={c.name}
        description={c.industry ?? undefined}
        actions={
          <>
            <Dialog title={`Edit ${c.name}`} wide triggerClassName="btn-secondary" trigger="Edit">
              <form action={updateCompany.bind(null, c.id)}>
                <CompanyFields company={c} defs={data.defs} />
                <div className="mt-5 flex justify-end">
                  <SubmitButton>Save changes</SubmitButton>
                </div>
              </form>
            </Dialog>
            {hasRole(role, "admin") && (
              <form action={deleteCompany.bind(null, c.id)}>
                <ConfirmButton message={`Delete ${c.name}? Contacts are kept but unlinked.`}>Delete</ConfirmButton>
              </form>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <section className="card p-5">
            <Tags tags={c.tags} />
            <dl className="mt-3 space-y-3 text-sm">
              {c.domain && (
                <div className="flex items-center gap-2.5">
                  <Globe className="size-4 text-zinc-400" />
                  <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                    {c.domain}
                  </a>
                </div>
              )}
              {c.phone && (
                <div className="flex items-center gap-2.5">
                  <Phone className="size-4 text-zinc-400" />
                  {c.phone}
                </div>
              )}
              {c.address && (
                <div className="flex items-center gap-2.5">
                  <MapPin className="size-4 text-zinc-400" />
                  {c.address}
                </div>
              )}
            </dl>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-4 text-sm">
              <div>
                <dt className="text-xs text-zinc-500">Open pipeline</dt>
                <dd className="font-medium tabular-nums">{money(openValue)}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Won to date</dt>
                <dd className="font-medium tabular-nums">{money(wonValue)}</dd>
              </div>
              {data.defs.map((d) => (
                <div key={d.id}>
                  <dt className="text-xs text-zinc-500">{d.label}</dt>
                  <dd>{c.customFields[d.key] || "—"}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="mb-2 text-sm font-semibold">People ({data.contacts.length})</h2>
            <ul className="divide-y divide-zinc-100">
              {data.contacts.map((p) => (
                <li key={p.id}>
                  <Link href={`/contacts/${p.id}`} className="flex items-center gap-3 py-2 hover:text-brand">
                    <Avatar name={fullName(p)} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{fullName(p)}</span>
                    <LifecycleBadge value={p.lifecycle} />
                  </Link>
                </li>
              ))}
              {data.contacts.length === 0 && <li className="text-sm text-zinc-400">No contacts linked.</li>}
            </ul>
          </section>

          <section className="card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Deals</h2>
              <Dialog title="New deal" wide triggerClassName="btn-ghost btn-sm" trigger={<><Plus className="size-3.5" /> Add</>}>
                <form action={createDeal}>
                  <DealFields
                    stages={stages}
                    contacts={data.contacts.map((p) => ({ id: p.id, name: fullName(p) }))}
                    companies={[{ id: c.id, name: c.name }]}
                    members={members}
                    defs={data.dealDefs}
                    defaults={{ companyId: c.id }}
                  />
                  <div className="mt-5 flex justify-end">
                    <SubmitButton>Create deal</SubmitButton>
                  </div>
                </form>
              </Dialog>
            </div>
            <ul className="divide-y divide-zinc-100">
              {data.deals.map((d) => (
                <li key={d.id} className="py-2.5">
                  <Link href={`/pipeline?deal=${d.id}`} className="flex justify-between gap-2 text-sm hover:text-brand">
                    <span className="truncate font-medium">{d.title}</span>
                    <span className="tabular-nums">{money(d.valueCents)}</span>
                  </Link>
                  <div className="text-xs text-zinc-500">{stageById.get(d.stageId)?.name}</div>
                </li>
              ))}
              {data.deals.length === 0 && <li className="text-sm text-zinc-400">No deals yet.</li>}
            </ul>
          </section>

          {data.tasks.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-1 text-sm font-semibold">Tasks</h2>
              <ul className="divide-y divide-zinc-100">
                {data.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} assignee={names.get(t.assigneeId ?? "")} />
                ))}
              </ul>
            </section>
          )}
        </aside>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">Activity</h2>
          <NoteComposer hidden={{ companyId: c.id }} />
          <div className="mt-6">
            <Timeline items={timeline} />
          </div>
        </section>
      </div>
    </>
  );
}
