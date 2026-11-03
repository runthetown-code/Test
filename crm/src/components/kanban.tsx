"use client";

import { GripVertical } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { moveDeal } from "@/actions/crm";

export type KanbanDeal = {
  id: string;
  title: string;
  valueCents: number;
  stageId: string;
  contactName: string | null;
  companyName: string | null;
  ownerInitials: string;
  expectedClose: string | null;
};
export type KanbanStage = { id: string; name: string; kind: "open" | "won" | "lost"; probability: number };

const fmt = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(c / 100);

export function Kanban({ stages, deals }: { stages: KanbanStage[]; deals: KanbanDeal[] }) {
  const [optimistic, applyMove] = useOptimistic(deals, (state, m: { id: string; stageId: string; index: number }) => {
    const moving = state.find((d) => d.id === m.id);
    if (!moving) return state;
    const rest = state.filter((d) => d.id !== m.id);
    const col = rest.filter((d) => d.stageId === m.stageId);
    const anchor = col[m.index];
    const updated = { ...moving, stageId: m.stageId };
    if (!anchor) {
      const lastIdx = rest.findLastIndex((d) => d.stageId === m.stageId);
      rest.splice(lastIdx + 1, 0, updated);
    } else {
      rest.splice(rest.indexOf(anchor), 0, updated);
    }
    return rest;
  });
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ stageId: string; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function drop(stageId: string, index: number) {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (!id) return;
    startTransition(async () => {
      applyMove({ id, stageId, index });
      try {
        await moveDeal(id, stageId, index);
      } catch {
        setError("Couldn't move that deal. Please try again.");
      }
    });
  }

  return (
    <>
      {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
        {stages.map((s) => {
          const col = optimistic.filter((d) => d.stageId === s.id);
          const total = col.reduce((a, d) => a + d.valueCents, 0);
          const tone = s.kind === "won" ? "bg-emerald-500" : s.kind === "lost" ? "bg-zinc-400" : "bg-brand";
          return (
            <section
              key={s.id}
              className={`flex w-72 shrink-0 snap-start flex-col rounded-xl bg-zinc-100/70 transition ${over?.stageId === s.id ? "ring-2 ring-brand/40" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (over?.stageId !== s.id || over.index < col.length) {
                  // dropping on empty space in the column appends to the end
                  if ((e.target as HTMLElement).dataset.column) setOver({ stageId: s.id, index: col.length });
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(s.id, over?.stageId === s.id ? over.index : col.length);
              }}
            >
              <header className="px-3 pb-2 pt-3">
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${tone}`} />
                  <h2 className="truncate text-sm font-semibold">{s.name}</h2>
                  <span className="rounded-full bg-white px-1.5 text-xs tabular-nums text-zinc-500">{col.length}</span>
                </div>
                <div className="mt-0.5 pl-4 text-xs tabular-nums text-zinc-500">
                  {fmt(total)}
                  {s.kind === "open" && <span className="text-zinc-400"> · {s.probability}%</span>}
                </div>
              </header>
              <ol data-column="1" className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {col.map((d, i) => (
                  <li
                    key={d.id}
                    draggable
                    onDragStart={(e) => {
                      setDragging(d.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      const r = e.currentTarget.getBoundingClientRect();
                      setOver({ stageId: s.id, index: e.clientY < r.top + r.height / 2 ? i : i + 1 });
                    }}
                    className={`relative ${dragging === d.id ? "opacity-40" : ""}`}
                  >
                    {over?.stageId === s.id && over.index === i && dragging !== d.id && (
                      <div className="absolute -top-1.5 left-1 right-1 h-0.5 rounded bg-brand" />
                    )}
                    <Link
                      href={`/pipeline?deal=${d.id}`}
                      scroll={false}
                      className="group block cursor-grab rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition hover:border-brand/40 hover:shadow active:cursor-grabbing"
                    >
                      <div className="flex items-start gap-1.5">
                        <span className="min-w-0 flex-1 text-sm font-medium leading-snug group-hover:text-brand">{d.title}</span>
                        <GripVertical className="size-4 shrink-0 text-zinc-300" />
                      </div>
                      <div className="mt-1 truncate text-xs text-zinc-500">
                        {[d.contactName, d.companyName].filter(Boolean).join(" · ") || "—"}
                      </div>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="text-sm font-semibold tabular-nums">{fmt(d.valueCents)}</span>
                        <span className="flex items-center gap-2">
                          {d.expectedClose && s.kind === "open" && (
                            <span className="text-[11px] text-zinc-400">
                              {new Date(d.expectedClose + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          <span className="grid size-6 place-items-center rounded-full bg-brand-muted text-[10px] font-semibold text-brand-strong">
                            {d.ownerInitials}
                          </span>
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
                {over?.stageId === s.id && over.index === col.length && <li className="h-0.5 rounded bg-brand" />}
              </ol>
            </section>
          );
        })}
      </div>
    </>
  );
}
