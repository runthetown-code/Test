/**
 * Lightweight, dependency-free charts. Single-series bars wear the tenant brand color;
 * every value is also printed as text, so identity never relies on color alone.
 * Hover shows a tooltip with the exact figures.
 */

export type BarDatum = { label: string; value: number; display: string; detail?: string };

/** Horizontal bars: comparing magnitude across categories (stages, sources). */
export function HBarChart({ data, emptyText = "No data yet" }: { data: BarDatum[]; emptyText?: string }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  if (!data.length || max === 0) return <p className="py-8 text-center text-sm text-zinc-400">{emptyText}</p>;
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label} className="group relative">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-zinc-700">{d.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-zinc-900">{d.display}</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100">
            <div
              className="h-2 rounded-full bg-brand transition-[width] group-hover:bg-brand-strong"
              style={{ width: `${Math.max(1.5, (d.value / max) * 100)}%` }}
            />
          </div>
          {d.detail && (
            <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
              {d.detail}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Vertical columns: change over time (won revenue by month). */
export function ColumnChart({ data, maxLabel }: { data: BarDatum[]; maxLabel?: string }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const ticks = max > 0 ? [1, 0.5, 0] : [0];
  return (
    <div className="relative">
      <div className="flex h-48 gap-[2px] border-b border-zinc-200 pl-0">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-dashed border-zinc-100" style={{ top: `${(1 - t) * 100}%` }} />
          ))}
          {maxLabel && max > 0 && (
            <span className="absolute -top-2 right-0 bg-white pl-1 text-[11px] tabular-nums text-zinc-400">{maxLabel}</span>
          )}
        </div>
        {data.map((d) => (
          <div key={d.label} className="group relative flex flex-1 flex-col items-center justify-end px-1 sm:px-2">
            <div
              className="w-full max-w-10 rounded-t bg-brand transition group-hover:bg-brand-strong"
              style={{ height: max ? `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%` : 0 }}
            />
            <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
              {d.label}: {d.display}
              {d.detail ? ` · ${d.detail}` : ""}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[2px]">
        {data.map((d) => (
          <div key={d.label} className="flex-1 text-center text-[11px] text-zinc-500">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Funnel: share of deals that reached each stage. */
export function Funnel({ steps }: { steps: { label: string; count: number; pct: number }[] }) {
  if (!steps.length || steps[0].count === 0) return <p className="py-8 text-center text-sm text-zinc-400">No deals yet</p>;
  return (
    <ol className="space-y-1.5">
      {steps.map((s) => (
        <li key={s.label} className="group relative flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm text-zinc-700 sm:w-32">{s.label}</span>
          <div className="relative h-7 flex-1 rounded bg-zinc-100">
            <div className="h-7 rounded bg-brand/85 group-hover:bg-brand" style={{ width: `${Math.max(1.5, s.pct)}%` }} />
          </div>
          <span className="w-20 shrink-0 text-right text-sm tabular-nums">
            <span className="font-medium">{Math.round(s.pct)}%</span>
            <span className="text-zinc-400"> · {s.count}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
