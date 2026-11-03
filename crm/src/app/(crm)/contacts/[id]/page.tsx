import { asc, desc, eq } from "drizzle-orm";
import { Building2, Mail, Phone, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createDeal, createTask, deleteContact, updateContact } from "@/actions/crm";
import { schema } from "@/db";
import { seq } from "@/lib/queries";
import { ConfirmButton, Dialog, SubmitButton } from "@/components/client";
import { ContactFields, DealFields, TaskFields } from "@/components/forms";
import { NoteComposer, TaskRow, Timeline, type TimelineItem } from "@/components/record";
import { Avatar, LifecycleBadge, PageHeader, Tags } from "@/components/ui";
import { getAppContext, getMembers, hasRole } from "@/lib/access";
import { fullName, money } from "@/lib/format";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { tenant, user, role, db } = await getAppContext();
  const members = await getMembers(tenant.id);
  const names = new Map(members.map((m) => [m.id, m.name || m.email]));

  const data = await db(async (tx) => {
    const contact = await tx.query.contacts.findFirst({ where: eq(schema.contacts.id, id) });
    if (!contact) return null;
    const company = contact.companyId
      ? await tx.query.companies.findFirst({ where: eq(schema.companies.id, contact.companyId) })
      : null;
    const [notes, activities, tasks, deals, stages, companies, defs, dealDefs] = await seq([
      () => tx.query.notes.findMany({ where: eq(schema.notes.contactId, id), orderBy: desc(schema.notes.createdAt) }),
      () => tx.query.activities.findMany({ where: eq(schema.activities.contactId, id), orderBy: desc(schema.activities.createdAt), limit: 100 }),
      () => tx.query.tasks.findMany({ where: eq(schema.tasks.contactId, id), orderBy: [asc(schema.tasks.done), asc(schema.tasks.dueAt)] }),
      () => tx.query.deals.findMany({ where: eq(schema.deals.contactId, id), orderBy: desc(schema.deals.createdAt) }),
      () => tx.query.pipelineStages.findMany({ orderBy: asc(schema.pipelineStages.position) }),
      () => tx.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).orderBy(asc(schema.companies.name)),
      () => tx.query.customFieldDefs.findMany({ where: eq(schema.customFieldDefs.entity, "contact"), orderBy: asc(schema.customFieldDefs.position) }),
      () => tx.query.customFieldDefs.findMany({ where: eq(schema.customFieldDefs.entity, "deal"), orderBy: asc(schema.customFieldDefs.position) }),
    ] as const);
    return { contact, company, notes, activities, tasks, deals, stages, companies, defs, dealDefs };
  });
  if (!data) notFound();
  const { contact: c, company, stages } = data;
  const name = fullName(c);
  const stageById = new Map(stages.map((s) => [s.id, s]));

  const timeline: TimelineItem[] = [
    ...data.notes.map((n) => ({ id: n.id, kind: "note" as const, type: "note", body: n.body, actor: names.get(n.authorId ?? "") ?? "Someone", at: n.createdAt })),
    ...data.activities
      .filter((a) => a.type !== "note")
      .map((a) => ({ id: a.id, kind: "activity" as const, type: a.type, body: a.summary, actor: names.get(a.actorId ?? "") ?? "System", at: a.createdAt })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <PageHeader
        back={{ href: "/contacts", label: "Contacts" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={name} size="lg" />
            <span>
              <span className="block">{name}</span>
              <span className="block text-sm font-normal text-zinc-500">
                {[c.title, company?.name].filter(Boolean).join(" at ") || "—"}
              </span>
            </span>
          </span>
        }
        actions={
          <>
            <Dialog title={`Edit ${name}`} wide triggerClassName="btn-secondary" trigger="Edit">
              <form action={updateContact.bind(null, c.id)}>
                <ContactFields contact={c} companies={data.companies} members={members} defs={data.defs} />
                <div className="mt-5 flex justify-end">
                  <SubmitButton>Save changes</SubmitButton>
                </div>
              </form>
            </Dialog>
            {hasRole(role, "admin") && (
              <form action={deleteContact.bind(null, c.id)}>
                <ConfirmButton message={`Delete ${name}? Notes and tasks are deleted too.`}>Delete</ConfirmButton>
              </form>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <section className="card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <LifecycleBadge value={c.lifecycle} />
              <Tags tags={c.tags} />
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              {c.email && (
                <div className="flex items-center gap-2.5">
                  <Mail className="size-4 shrink-0 text-zinc-400" />
                  <a href={`mailto:${c.email}`} className="truncate text-brand hover:underline">
                    {c.email}
                  </a>
                </div>
              )}
              {c.phone && (
                <div className="flex items-center gap-2.5">
                  <Phone className="size-4 shrink-0 text-zinc-400" />
                  <a href={`tel:${c.phone}`} className="hover:underline">
                    {c.phone}
                  </a>
                </div>
              )}
              {company && (
                <div className="flex items-center gap-2.5">
                  <Building2 className="size-4 shrink-0 text-zinc-400" />
                  <Link href={`/companies/${company.id}`} className="hover:underline">
                    {company.name}
                  </Link>
                </div>
              )}
            </dl>
            <dl className="mt-5 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-zinc-100 pt-4 text-sm">
              <div>
                <dt className="text-xs text-zinc-500">Owner</dt>
                <dd>{names.get(c.ownerId ?? "") ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Source</dt>
                <dd>{c.source ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Created</dt>
                <dd>{c.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</dd>
              </div>
              {data.defs.map((d) => (
                <div key={d.id} className="min-w-0">
                  <dt className="text-xs text-zinc-500">{d.label}</dt>
                  <dd className="truncate">{c.customFields[d.key] || "—"}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Deals</h2>
              <Dialog title="New deal" wide triggerClassName="btn-ghost btn-sm" trigger={<><Plus className="size-3.5" /> Add</>}>
                <form action={createDeal}>
                  <DealFields
                    stages={stages}
                    contacts={[{ id: c.id, name }]}
                    companies={data.companies}
                    members={members}
                    defs={data.dealDefs}
                    defaults={{ contactId: c.id, companyId: c.companyId ?? undefined }}
                  />
                  <div className="mt-5 flex justify-end">
                    <SubmitButton>Create deal</SubmitButton>
                  </div>
                </form>
              </Dialog>
            </div>
            {data.deals.length === 0 ? (
              <p className="text-sm text-zinc-400">No deals yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {data.deals.map((d) => {
                  const s = stageById.get(d.stageId);
                  return (
                    <li key={d.id} className="py-2.5">
                      <Link href={`/pipeline?deal=${d.id}`} className="flex items-baseline justify-between gap-2 text-sm hover:text-brand">
                        <span className="truncate font-medium">{d.title}</span>
                        <span className="shrink-0 tabular-nums">{money(d.valueCents)}</span>
                      </Link>
                      <div className="text-xs text-zinc-500">
                        {s?.name}
                        {s?.kind === "won" && " ✓"}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Tasks</h2>
              <Dialog title="New task" triggerClassName="btn-ghost btn-sm" trigger={<><Plus className="size-3.5" /> Add</>}>
                <form action={createTask}>
                  <TaskFields members={members} hidden={{ contactId: c.id, companyId: c.companyId }} defaultAssignee={user.id} />
                  <div className="mt-5 flex justify-end">
                    <SubmitButton>Create task</SubmitButton>
                  </div>
                </form>
              </Dialog>
            </div>
            {data.tasks.length === 0 ? (
              <p className="text-sm text-zinc-400">No tasks.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {data.tasks.map((t) => (
                  <TaskRow key={t.id} task={t} assignee={names.get(t.assigneeId ?? "")} />
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">Activity</h2>
          <NoteComposer hidden={{ contactId: c.id, ...(c.companyId ? { companyId: c.companyId } : {}) }} />
          <div className="mt-6">
            <Timeline items={timeline} />
          </div>
        </section>
      </div>
    </>
  );
}
