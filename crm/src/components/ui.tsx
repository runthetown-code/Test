import Link from "next/link";
import { LIFECYCLES } from "@/db/schema";
import { initials } from "@/lib/format";

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm text-zinc-500 hover:text-zinc-900">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">{title}</h1>
          {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="text-sm font-medium">{title}</div>
      {body && <p className="mt-1 max-w-sm text-sm text-zinc-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const LIFECYCLE_STYLE: Record<(typeof LIFECYCLES)[number], string> = {
  lead: "bg-sky-50 text-sky-700 ring-sky-200",
  qualified: "bg-violet-50 text-violet-700 ring-violet-200",
  customer: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  churned: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

export function LifecycleBadge({ value }: { value: (typeof LIFECYCLES)[number] }) {
  return <span className={`badge capitalize ring-1 ring-inset ${LIFECYCLE_STYLE[value]}`}>{value}</span>;
}

export function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="badge bg-zinc-100 text-zinc-700">
          {t}
        </span>
      ))}
    </span>
  );
}

export function Avatar({ name, size = "md" }: { name: string | null | undefined; size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "size-14 text-lg" : size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs";
  return (
    <span className={`${s} inline-grid shrink-0 place-items-center rounded-full bg-brand-muted font-semibold text-brand-strong`}>
      {initials(name)}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
