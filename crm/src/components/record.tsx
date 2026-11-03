import { Check, Trash2 } from "lucide-react";
import Link from "next/link";
import { addNote, deleteTask, toggleTask } from "@/actions/crm";
import type { Task } from "@/db/schema";
import { relTime } from "@/lib/format";
import { SubmitButton } from "./client";
import { Avatar } from "./ui";

export type TimelineItem = {
  id: string;
  kind: "note" | "activity";
  type: string;
  body: string;
  actor: string;
  at: Date;
};

const DOT: Record<string, string> = {
  stage_changed: "bg-violet-500",
  deal_created: "bg-emerald-500",
  task_done: "bg-sky-500",
  task_created: "bg-zinc-400",
  import: "bg-amber-500",
  email: "bg-pink-500",
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-zinc-400">No activity yet.</p>;
  return (
    <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-zinc-200">
      {items.map((i) =>
        i.kind === "note" ? (
          <li key={i.id} className="relative flex gap-3">
            <span className="relative z-10 rounded-full ring-4 ring-white">
              <Avatar name={i.actor} />
            </span>
            <div className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white p-3">
              <div className="mb-1 text-xs text-zinc-500">
                <span className="font-medium text-zinc-800">{i.actor}</span> added a note · {relTime(i.at)}
              </div>
              <p className="whitespace-pre-wrap text-sm text-zinc-700">{i.body}</p>
            </div>
          </li>
        ) : (
          <li key={i.id} className="relative flex items-start gap-3">
            <span className="grid w-8 shrink-0 place-items-center pt-1.5">
              <span className={`relative z-10 size-2.5 rounded-full ring-4 ring-white ${DOT[i.type] ?? "bg-zinc-400"}`} />
            </span>
            <div className="text-sm text-zinc-600">
              {i.body}
              <div className="text-xs text-zinc-400">
                {i.actor} · {relTime(i.at)}
              </div>
            </div>
          </li>
        ),
      )}
    </ol>
  );
}

export function NoteComposer({ hidden }: { hidden: Record<string, string> }) {
  return (
    <form action={addNote} className="rounded-lg border border-zinc-200 bg-white p-2 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/15">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <textarea name="body" required rows={2} placeholder="Add a note — call summary, next steps…" className="block w-full resize-y border-0 bg-transparent px-1.5 py-1 text-sm outline-none" />
      <div className="flex justify-end">
        <SubmitButton className="btn-primary btn-sm">Add note</SubmitButton>
      </div>
    </form>
  );
}

export function TaskRow({ task, assignee, context }: { task: Task; assignee?: string; context?: { href: string; label: string } }) {
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
  const overdue = !task.done && task.dueAt && task.dueAt < startOfDay;
  return (
    <li className="group flex items-start gap-3 py-2.5">
      <form action={toggleTask.bind(null, task.id)}>
        <button
          aria-label={task.done ? "Mark as not done" : "Mark as done"}
          className={`mt-0.5 grid size-5 place-items-center rounded-md border transition ${
            task.done ? "border-brand bg-brand text-brand-fg" : "border-zinc-300 hover:border-brand"
          }`}
        >
          {task.done && <Check className="size-3.5" strokeWidth={3} />}
        </button>
      </form>
      <div className="min-w-0 flex-1">
        <div className={`text-sm ${task.done ? "text-zinc-400 line-through" : ""}`}>{task.title}</div>
        <div className="flex flex-wrap gap-x-2 text-xs text-zinc-500">
          {task.dueAt && (
            <span className={overdue ? "font-medium text-red-600" : ""}>
              {overdue ? "Overdue · " : "Due "}
              {task.dueAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          {assignee && <span>· {assignee}</span>}
          {context && (
            <Link href={context.href} className="hover:text-brand hover:underline">
              · {context.label}
            </Link>
          )}
        </div>
      </div>
      <form action={deleteTask.bind(null, task.id)} className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <button className="btn-ghost p-1.5" aria-label="Delete task">
          <Trash2 className="size-3.5" />
        </button>
      </form>
    </li>
  );
}
