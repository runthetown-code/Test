import { and, asc, count, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import Link from "next/link";
import { schema } from "@/db";
import { ColumnChart, Funnel, HBarChart } from "@/components/charts";
import { PageHeader, Stat } from "@/components/ui";
import { getAppContext, memberMap } from "@/lib/access";
import { money, relTime } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const { tenant, user, db } = await getAppContext();
  const names = await memberMap(tenant.id);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const data = await db(async (tx) => {
    const stages = await tx
      .select({
        id: schema.pipelineStages.id,
        name: schema.pipelineStages.name,
        kind: schema.pipelineStages.kind,
        position: schema.pipelineStages.position,
        probability: schema.pipelineStages.probability,
        deals: sql<number>`count(${schema.deals.id})::int`,
        value: sql<number>`coalesce(sum(${schema.deals.valueCents}), 0)::bigint`,
      })
      .from(schema.pipelineStages)
      .leftJoin(schema.deals, eq(schema.deals.stageId, schema.pipelineStages.id))
      .groupBy(schema.pipelineStages.id)
      .orderBy(asc(schema.pipelineStages.position));

    const wonByMonth = await tx
      .select({
        month: sql<string>`to_char(date_trunc('month', ${schema.deals.closedAt}), 'YYYY-MM')`,
        value: sql<number>`sum(${schema.deals.valueCents})::bigint`,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.deals)
      .innerJoin(schema.pipelineStages, eq(schema.pipelineStages.id, schema.deals.stageId))
      .where(and(eq(schema.pipelineStages.kind, "won"), gte(schema.deals.closedAt, sixMonthsAgo)))
      .groupBy(sql`1`);

    const closed90 = await tx
      .select({ kind: schema.pipelineStages.kind, n: sql<number>`count(*)::int` })
      .from(schema.deals)
      .innerJoin(schema.pipelineStages, eq(schema.pipelineStages.id, schema.deals.stageId))
      .where(and(isNotNull(schema.deals.closedAt), gte(schema.deals.closedAt, new Date(Date.now() - 90 * 86400_000))))
      .groupBy(schema.pipelineStages.kind);

    const sources = await tx
      .select({
        source: sql<string>`coalesce(nullif(${schema.contacts.source}, ''), 'Unknown')`,
        n: sql<number>`count(*)::int`,
        customers: sql<number>`count(*) filter (where ${schema.contacts.lifecycle} = 'customer')::int`,
      })
      .from(schema.contacts)
      .groupBy(sql`1`)
      .orderBy(desc(sql`2`));

    const [{ n: newContacts }] = await tx
      .select({ n: count() })
      .from(schema.contacts)
      .where(gte(schema.contacts.createdAt, new Date(Date.now() - 30 * 86400_000)));

    const myTasks = await tx.query.tasks.findMany({
      where: and(eq(schema.tasks.done, false), eq(schema.tasks.assigneeId, user.id), lte(schema.tasks.dueAt, endOfToday)),
      orderBy: asc(schema.tasks.dueAt),
      limit: 6,
    });

    const recent = await tx.query.activities.findMany({ orderBy: desc(schema.activities.createdAt), limit: 8 });
    return { stages, wonByMonth, closed90, sources, newContacts, myTasks, recent };
  });

  const open = data.stages.filter((s) => s.kind === "open");
  const openValue = open.reduce((a, s) => a + Number(s.value), 0);
  const weighted = open.reduce((a, s) => a + (Number(s.value) * s.probability) / 100, 0);
  const openDeals = open.reduce((a, s) => a + s.deals, 0);
  const thisMonthKey = monthStart.toISOString().slice(0, 7);
  const wonThisMonth = Number(data.wonByMonth.find((m) => m.month === thisMonthKey)?.value ?? 0);
  const won90 = data.closed90.find((c) => c.kind === "won")?.n ?? 0;
  const lost90 = data.closed90.find((c) => c.kind === "lost")?.n ?? 0;
  const winRate = won90 + lost90 ? Math.round((won90 / (won90 + lost90)) * 100) : null;

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const m = data.wonByMonth.find((w) => w.month === key);
    return {
      label: d.toLocaleDateString("en-US", { month: "short" }),
      value: Number(m?.value ?? 0),
      display: money(Number(m?.value ?? 0)),
      detail: `${m?.n ?? 0} deals`,
    };
  });

  // Funnel: a deal "reached" an open stage if it sits there or further along, or was won.
  const totalDeals = data.stages.reduce((a, s) => a + s.deals, 0);
  const wonDeals = data.stages.filter((s) => s.kind === "won").reduce((a, s) => a + s.deals, 0);
  const funnel = [
    ...open.map((s, i) => ({
      label: s.name,
      count: i === 0 ? totalDeals : open.filter((o) => o.position >= s.position).reduce((a, o) => a + o.deals, 0) + wonDeals,
    })),
    { label: "Won", count: wonDeals },
  ].map((f) => ({ ...f, pct: totalDeals ? (f.count / totalDeals) * 100 : 0 }));

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        title={`${greeting}, ${(user.name || user.email).split(" ")[0]}`}
        description={`Here's how ${tenant.name} is tracking.`}
        actions={
          <Link href="/pipeline" className="btn-primary">
            Open pipeline
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Open pipeline" value={money(openValue, { compact: true })} hint={`${openDeals} open deals`} />
        <Stat label="Weighted forecast" value={money(weighted, { compact: true })} hint="Value × stage probability" />
        <Stat label="Won this month" value={money(wonThisMonth, { compact: true })} hint={`Win rate ${winRate === null ? "—" : `${winRate}%`} (90 days)`} />
        <Stat label="New contacts" value={data.newContacts} hint="Last 30 days" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold">Revenue won</h2>
          <p className="mb-5 text-xs text-zinc-500">Last 6 months, by close date</p>
          <ColumnChart data={months} maxLabel={money(Math.max(...months.map((m) => m.value)), { compact: true })} />
        </section>
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Pipeline by stage</h2>
          <p className="mb-5 text-xs text-zinc-500">Open deal value</p>
          <HBarChart
            data={open.map((s) => ({
              label: s.name,
              value: Number(s.value),
              display: money(Number(s.value), { compact: true }),
              detail: `${s.deals} deals · ${s.probability}% probability`,
            }))}
          />
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Conversion by stage</h2>
          <p className="mb-5 text-xs text-zinc-500">Share of all deals that reached each stage</p>
          <Funnel steps={funnel} />
        </section>
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Lead sources</h2>
          <p className="mb-5 text-xs text-zinc-500">Contacts by source</p>
          <HBarChart
            data={data.sources.slice(0, 6).map((s) => ({
              label: s.source,
              value: s.n,
              display: String(s.n),
              detail: `${s.customers} became customers (${s.n ? Math.round((s.customers / s.n) * 100) : 0}%)`,
            }))}
          />
        </section>
        <section className="card p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Due today & overdue</h2>
            <Link href="/tasks" className="text-xs font-medium text-brand hover:underline">
              All tasks
            </Link>
          </div>
          {data.myTasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">You&apos;re all caught up 🎉</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {data.myTasks.map((t) => {
                const overdue = t.dueAt && t.dueAt < new Date(new Date().setHours(0, 0, 0, 0));
                return (
                  <li key={t.id} className="py-2.5 text-sm">
                    <Link href={t.contactId ? `/contacts/${t.contactId}` : "/tasks"} className="hover:underline">
                      {t.title}
                    </Link>
                    <div className={`text-xs ${overdue ? "font-medium text-red-600" : "text-zinc-500"}`}>
                      {overdue ? "Overdue · " : "Today · "}
                      {t.dueAt?.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-4 p-5">
        <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
        <ul className="divide-y divide-zinc-100">
          {data.recent.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{names.get(a.actorId ?? "") ?? "Someone"}</span>{" "}
                <span className="text-zinc-600">
                  {a.contactId ? (
                    <Link href={`/contacts/${a.contactId}`} className="hover:underline">
                      {a.summary}
                    </Link>
                  ) : (
                    a.summary
                  )}
                </span>
              </span>
              <span className="text-xs text-zinc-400">{relTime(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
