import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";
import { createTask } from "@/actions/crm";
import { schema } from "@/db";
import { Dialog, SubmitButton } from "@/components/client";
import { Field } from "@/components/ui";
import { MemberSelect } from "@/components/forms";
import { TaskRow } from "@/components/record";
import { EmptyState, PageHeader } from "@/components/ui";
import { getAppContext, getMembers } from "@/lib/access";
import { fullName } from "@/lib/format";
import { taskWhere, type TaskFilter } from "@/lib/queries";

export const metadata = { title: "Tasks" };

const TABS: { key: TaskFilter; label: string }[] = [
  { key: "open", label: "All open" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "done", label: "Completed" },
];

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ f?: string; who?: string }> }) {
  const sp = await searchParams;
  const filter = (TABS.find((t) => t.key === sp.f)?.key ?? "open") as TaskFilter;
  const everyone = sp.who === "all";
  const { tenant, user, db } = await getAppContext();
  const members = await getMembers(tenant.id);
  const names = new Map(members.map((m) => [m.id, m.name || m.email]));

  const { tasks, counts, contacts } = await db(async (tx) => {
    const mine = everyone ? undefined : eq(schema.tasks.assigneeId, user.id);
    const tasks = await tx
      .select()
      .from(schema.tasks)
      .where(and(taskWhere(filter), mine))
      .orderBy(filter === "done" ? desc(schema.tasks.completedAt) : asc(schema.tasks.dueAt))
      .limit(200);
    const counts: Record<string, number> = {};
    for (const t of TABS) {
      const [{ n }] = await tx.select({ n: count() }).from(schema.tasks).where(and(taskWhere(t.key), mine));
      counts[t.key] = n;
    }
    const ids = [...new Set(tasks.map((t) => t.contactId).filter(Boolean))] as string[];
    const contacts = ids.length
      ? await tx.select().from(schema.contacts).where(inArray(schema.contacts.id, ids))
      : [];
    return { tasks, counts, contacts };
  });
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const link = (f: TaskFilter, who = sp.who) => `?${new URLSearchParams({ f, ...(who ? { who } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Follow-ups and reminders. Assignees get a daily email digest of what's due."
        actions={
          <Dialog title="New task" trigger={<><Plus className="size-4" /> New task</>}>
            <form action={createTask}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Task *" className="sm:col-span-2">
                  <input name="title" required className="input" />
                </Field>
                <Field label="Due">
                  <input name="dueAt" type="datetime-local" className="input" />
                </Field>
                <Field label="Assignee">
                  <MemberSelect name="assigneeId" members={members} value={user.id} />
                </Field>
              </div>
              <div className="mt-5 flex justify-end">
                <SubmitButton>Create task</SubmitButton>
              </div>
            </form>
          </Dialog>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1 overflow-x-auto rounded-lg bg-zinc-100 p-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={link(t.key)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
                filter === t.key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-xs tabular-nums ${t.key === "overdue" && counts.overdue ? "text-red-600" : "text-zinc-400"}`}>
                {counts[t.key]}
              </span>
            </Link>
          ))}
        </nav>
        <div className="flex gap-1 text-sm">
          <Link href={link(filter, "")} className={`rounded-md px-3 py-1.5 ${!everyone ? "bg-brand-soft font-medium text-brand-strong" : "text-zinc-600"}`}>
            Mine
          </Link>
          <Link href={link(filter, "all")} className={`rounded-md px-3 py-1.5 ${everyone ? "bg-brand-soft font-medium text-brand-strong" : "text-zinc-600"}`}>
            Everyone
          </Link>
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState title="Nothing here" body={filter === "overdue" ? "No overdue tasks. Nice work." : "No tasks in this view."} />
      ) : (
        <ul className="card divide-y divide-zinc-100 px-4">
          {tasks.map((t) => {
            const c = t.contactId ? contactById.get(t.contactId) : null;
            return (
              <TaskRow
                key={t.id}
                task={t}
                assignee={everyone ? names.get(t.assigneeId ?? "") : undefined}
                context={c ? { href: `/contacts/${c.id}`, label: fullName(c) } : undefined}
              />
            );
          })}
        </ul>
      )}
    </>
  );
}
