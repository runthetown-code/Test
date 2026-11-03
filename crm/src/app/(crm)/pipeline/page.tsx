import { asc, eq, sql } from "drizzle-orm";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { createDeal, deleteDeal, updateDeal } from "@/actions/crm";
import { schema } from "@/db";
import { AutoSubmitForm, ConfirmButton, Dialog, SubmitButton } from "@/components/client";
import { DealFields } from "@/components/forms";
import { Kanban } from "@/components/kanban";
import { NoteComposer, Timeline } from "@/components/record";
import { EmptyState, PageHeader } from "@/components/ui";
import { getAppContext, getMembers } from "@/lib/access";
import { fullName, initials, money } from "@/lib/format";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ deal?: string; owner?: string }> }) {
  const sp = await searchParams;
  const { tenant, user, db } = await getAppContext();
  const members = await getMembers(tenant.id);
  const names = new Map(members.map((m) => [m.id, m.name || m.email]));
  const ownerFilter = sp.owner === "me" ? user.id : sp.owner || null;
  const selectedId = sp.deal && /^[0-9a-f-]{36}$/i.test(sp.deal) ? sp.deal : null;

  const data = await db(async (tx) => {
    const stages = await tx.query.pipelineStages.findMany({ orderBy: asc(schema.pipelineStages.position) });
    const deals = await tx
      .select({
        deal: schema.deals,
        contactName: sql<string | null>`nullif(trim(${schema.contacts.firstName} || ' ' || coalesce(${schema.contacts.lastName}, '')), '')`,
        companyName: schema.companies.name,
      })
      .from(schema.deals)
      .leftJoin(schema.contacts, eq(schema.contacts.id, schema.deals.contactId))
      .leftJoin(schema.companies, eq(schema.companies.id, schema.deals.companyId))
      .where(ownerFilter ? eq(schema.deals.ownerId, ownerFilter) : undefined)
      .orderBy(asc(schema.deals.position), asc(schema.deals.createdAt));
    const contacts = await tx
      .select({ id: schema.contacts.id, firstName: schema.contacts.firstName, lastName: schema.contacts.lastName })
      .from(schema.contacts)
      .orderBy(asc(schema.contacts.firstName))
      .limit(1000);
    const companies = await tx.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies).orderBy(asc(schema.companies.name));
    const defs = await tx.query.customFieldDefs.findMany({ where: eq(schema.customFieldDefs.entity, "deal") });
    const selected = selectedId
      ? {
          deal: await tx.query.deals.findFirst({ where: eq(schema.deals.id, selectedId) }),
          activities: await tx.query.activities.findMany({
            where: eq(schema.activities.dealId, selectedId),
            orderBy: (a, { desc }) => desc(a.createdAt),
            limit: 30,
          }),
          notes: await tx.query.notes.findMany({ where: eq(schema.notes.dealId, selectedId), orderBy: (n, { desc }) => desc(n.createdAt) }),
        }
      : null;
    return { stages, deals, contacts, companies, defs, selected };
  });

  const contactOpts = data.contacts.map((c) => ({ id: c.id, name: fullName(c) }));
  const openTotal = data.deals
    .filter((d) => data.stages.find((s) => s.id === d.deal.stageId)?.kind === "open")
    .reduce((a, d) => a + d.deal.valueCents, 0);
  const sel = data.selected?.deal;

  return (
    <>
      <PageHeader
        title="Pipeline"
        description={`${money(openTotal)} open across ${data.deals.length} deals · drag cards between stages`}
        actions={
          <>
            <AutoSubmitForm>
              <select name="owner" defaultValue={sp.owner ?? ""} className="input w-auto">
                <option value="">Everyone&apos;s deals</option>
                <option value="me">My deals</option>
                {members
                  .filter((m) => m.id !== user.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email}
                    </option>
                  ))}
              </select>
            </AutoSubmitForm>
            <Dialog title="New deal" wide trigger={<><Plus className="size-4" /> New deal</>}>
              <form action={createDeal}>
                <DealFields stages={data.stages} contacts={contactOpts} companies={data.companies} members={members} defs={data.defs} />
                <div className="mt-5 flex justify-end">
                  <SubmitButton>Create deal</SubmitButton>
                </div>
              </form>
            </Dialog>
          </>
        }
      />

      {data.stages.length === 0 ? (
        <EmptyState title="No pipeline stages" body="An admin can add stages in Settings → Pipeline." />
      ) : (
        <Kanban
          stages={data.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, probability: s.probability }))}
          deals={data.deals.map(({ deal: d, contactName, companyName }) => ({
            id: d.id,
            title: d.title,
            valueCents: d.valueCents,
            stageId: d.stageId,
            contactName,
            companyName,
            ownerInitials: initials(names.get(d.ownerId ?? "") ?? "?"),
            expectedClose: d.expectedClose,
          }))}
        />
      )}

      {sel && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <Link href="/pipeline" scroll={false} className="absolute inset-0 bg-zinc-900/30" aria-label="Close" />
          <aside className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-2xl">
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-100 bg-white px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{sel.title}</h2>
                <p className="text-sm text-zinc-500">
                  {money(sel.valueCents)} · {data.stages.find((s) => s.id === sel.stageId)?.name}
                  {sel.contactId && (
                    <>
                      {" · "}
                      <Link href={`/contacts/${sel.contactId}`} className="text-brand hover:underline">
                        {contactOpts.find((c) => c.id === sel.contactId)?.name}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <Link href="/pipeline" scroll={false} className="btn-ghost p-2" aria-label="Close">
                <X className="size-5" />
              </Link>
            </header>
            <div className="space-y-6 p-5">
              <form action={updateDeal.bind(null, sel.id)}>
                <DealFields deal={sel} stages={data.stages} contacts={contactOpts} companies={data.companies} members={members} defs={data.defs} />
                <div className="mt-4 flex justify-between">
                  <SubmitButton>Save deal</SubmitButton>
                </div>
              </form>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Notes & activity</h3>
                <NoteComposer hidden={{ dealId: sel.id, ...(sel.contactId ? { contactId: sel.contactId } : {}) }} />
                <div className="mt-5">
                  <Timeline
                    items={[
                      ...data.selected!.notes.map((n) => ({ id: n.id, kind: "note" as const, type: "note", body: n.body, actor: names.get(n.authorId ?? "") ?? "Someone", at: n.createdAt })),
                      ...data.selected!.activities
                        .filter((a) => a.type !== "note")
                        .map((a) => ({ id: a.id, kind: "activity" as const, type: a.type, body: a.summary, actor: names.get(a.actorId ?? "") ?? "System", at: a.createdAt })),
                    ].sort((a, b) => b.at.getTime() - a.at.getTime())}
                  />
                </div>
              </div>
              <form
                action={async () => {
                  "use server";
                  await deleteDeal(sel.id);
                  const { redirect } = await import("next/navigation");
                  redirect("/pipeline");
                }}
                className="border-t border-zinc-100 pt-4"
              >
                <ConfirmButton message={`Delete "${sel.title}"?`}>Delete deal</ConfirmButton>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
