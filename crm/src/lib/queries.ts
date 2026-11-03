import { and, eq, gt, gte, lt } from "drizzle-orm";
import { schema } from "@/db";

export type TaskFilter = "open" | "overdue" | "today" | "upcoming" | "done";
export function taskWhere(filter: TaskFilter) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86400_000);
  switch (filter) {
    case "done":
      return eq(schema.tasks.done, true);
    case "overdue":
      return and(eq(schema.tasks.done, false), lt(schema.tasks.dueAt, startOfDay));
    case "today":
      return and(eq(schema.tasks.done, false), gte(schema.tasks.dueAt, startOfDay), lt(schema.tasks.dueAt, endOfDay));
    case "upcoming":
      return and(eq(schema.tasks.done, false), gt(schema.tasks.dueAt, endOfDay));
    default:
      return eq(schema.tasks.done, false);
  }
}

/** Runs queries one after another. A transaction holds one connection, so they can't run in parallel. */
export async function seq<T extends readonly (() => Promise<unknown>)[]>(
  fns: T,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const out: unknown[] = [];
  for (const f of fns) out.push(await f());
  return out as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
