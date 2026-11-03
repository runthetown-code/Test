import { asc, sql } from "drizzle-orm";
import { ArrowDown, ArrowUp } from "lucide-react";
import { addStage, deleteStage, moveStage, updateStage } from "@/actions/settings";
import { schema } from "@/db";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { getAppContext } from "@/lib/access";

export const metadata = { title: "Pipeline settings" };

const KINDS = [
  { v: "open", l: "Open" },
  { v: "won", l: "Won" },
  { v: "lost", l: "Lost" },
];

export default async function PipelineSettings() {
  const { db } = await getAppContext();
  const stages = await db((tx) =>
    tx
      .select({ s: schema.pipelineStages, deals: sql<number>`(select count(*)::int from deals d where d.stage_id = ${schema.pipelineStages.id})` })
      .from(schema.pipelineStages)
      .orderBy(asc(schema.pipelineStages.position)),
  );

  return (
    <div className="max-w-3xl space-y-4">
      <section className="card overflow-hidden">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold">Deal stages</h2>
          <p className="text-xs text-zinc-500">
            Stages appear as columns on the pipeline board, left to right. Probability feeds the weighted forecast. Moving a deal into a “Won” stage marks its contact as a customer.
          </p>
        </div>
        <ul className="divide-y divide-zinc-100">
          {stages.map(({ s, deals }, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
              <div className="flex flex-col">
                <form action={moveStage.bind(null, s.id, -1)}>
                  <button className="btn-ghost p-0.5" disabled={i === 0} aria-label="Move up">
                    <ArrowUp className="size-3.5" />
                  </button>
                </form>
                <form action={moveStage.bind(null, s.id, 1)}>
                  <button className="btn-ghost p-0.5" disabled={i === stages.length - 1} aria-label="Move down">
                    <ArrowDown className="size-3.5" />
                  </button>
                </form>
              </div>
              <form action={updateStage.bind(null, s.id)} className="flex flex-1 flex-wrap items-center gap-2">
                <input name="name" defaultValue={s.name} required className="input min-w-40 flex-1 py-1.5" aria-label="Stage name" />
                <select name="kind" defaultValue={s.kind} className="input w-24 py-1.5" aria-label="Type">
                  {KINDS.map((k) => (
                    <option key={k.v} value={k.v}>
                      {k.l}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-sm text-zinc-500">
                  <input name="probability" type="number" min={0} max={100} defaultValue={s.probability} className="input w-20 py-1.5" aria-label="Probability" />%
                </label>
                <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton>
              </form>
              <form action={deleteStage.bind(null, s.id)} className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">{deals} deals</span>
                {deals > 0 && (
                  <select name="moveTo" className="input w-36 py-1.5 text-xs" aria-label="Move deals to" required>
                    <option value="">Move deals to…</option>
                    {stages
                      .filter((o) => o.s.id !== s.id)
                      .map((o) => (
                        <option key={o.s.id} value={o.s.id}>
                          {o.s.name}
                        </option>
                      ))}
                  </select>
                )}
                <ConfirmButton message={`Delete the "${s.name}" stage?`} className="btn-danger btn-sm">
                  Delete
                </ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">Add a stage</h2>
        <form action={addStage} className="flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1">
            <span className="label">Name</span>
            <input name="name" required className="input" placeholder="e.g. Demo booked" />
          </label>
          <label>
            <span className="label">Type</span>
            <select name="kind" className="input w-28">
              {KINDS.map((k) => (
                <option key={k.v} value={k.v}>
                  {k.l}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Probability %</span>
            <input name="probability" type="number" min={0} max={100} defaultValue={50} className="input w-28" />
          </label>
          <SubmitButton>Add stage</SubmitButton>
        </form>
      </section>
    </div>
  );
}
