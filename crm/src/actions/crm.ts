"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { schema, type TenantTx } from "@/db";
import { LIFECYCLES } from "@/db/schema";
import { getAppContext, requireRole } from "@/lib/access";
import { fullName, money, parseTags } from "@/lib/format";

// ─────────────── helpers ───────────────

const str = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const uuidOrNull = z
  .string()
  .transform((v) => (v === "" || v === "none" ? null : v))
  .pipe(z.uuid().nullable())
  .nullable()
  .optional();

function form(fd: FormData) {
  return Object.fromEntries(Array.from(fd.keys()).map((k) => [k, fd.get(k)?.toString() ?? ""]));
}

function customFieldsFrom(fd: FormData) {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("cf_") && typeof v === "string" && v.trim()) out[k.slice(3)] = v.trim().slice(0, 500);
  }
  return out;
}

export async function logActivity(
  tx: TenantTx,
  a: {
    type: string;
    summary: string;
    actorId?: string | null;
    contactId?: string | null;
    companyId?: string | null;
    dealId?: string | null;
  },
) {
  await tx.insert(schema.activities).values(a);
  if (a.contactId) {
    await tx.update(schema.contacts).set({ lastActivityAt: new Date() }).where(eq(schema.contacts.id, a.contactId));
  }
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

// ─────────────── contacts ───────────────

const contactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: str(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200)
    .transform((v) => (v === "" ? null : v))
    .pipe(z.email().nullable())
    .optional(),
  phone: str(50),
  title: str(120),
  companyId: uuidOrNull,
  source: str(80),
  lifecycle: z.enum(LIFECYCLES).optional(),
  ownerId: str(64),
  tags: z.string().optional(),
});

export async function createContact(fd: FormData) {
  const { user, db } = await getAppContext();
  const data = contactSchema.parse(form(fd));
  const id = await db(async (tx) => {
    const [c] = await tx
      .insert(schema.contacts)
      .values({
        ...data,
        tags: parseTags(data.tags),
        ownerId: data.ownerId ?? user.id,
        customFields: customFieldsFrom(fd),
      })
      .returning();
    await logActivity(tx, {
      type: "contact_created",
      summary: `Contact ${fullName(c)} created`,
      actorId: user.id,
      contactId: c.id,
      companyId: c.companyId,
    });
    return c.id;
  });
  revalidateAll();
  redirect(`/contacts/${id}`);
}

export async function updateContact(id: string, fd: FormData) {
  const { db } = await getAppContext();
  const data = contactSchema.parse(form(fd));
  await db((tx) =>
    tx
      .update(schema.contacts)
      .set({ ...data, tags: parseTags(data.tags), customFields: customFieldsFrom(fd) })
      .where(eq(schema.contacts.id, id)),
  );
  revalidateAll();
}

export async function deleteContact(id: string) {
  const { db } = await requireRole("admin");
  await db((tx) => tx.delete(schema.contacts).where(eq(schema.contacts.id, id)));
  revalidateAll();
  redirect("/contacts");
}

// ─────────────── companies ───────────────

const companySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  domain: str(200),
  industry: str(100),
  phone: str(50),
  address: str(300),
  tags: z.string().optional(),
});

export async function createCompany(fd: FormData) {
  const { user, db } = await getAppContext();
  const data = companySchema.parse(form(fd));
  const id = await db(async (tx) => {
    const [c] = await tx
      .insert(schema.companies)
      .values({ ...data, tags: parseTags(data.tags), customFields: customFieldsFrom(fd) })
      .returning();
    await logActivity(tx, { type: "company_created", summary: `Company ${c.name} created`, actorId: user.id, companyId: c.id });
    return c.id;
  });
  revalidateAll();
  redirect(`/companies/${id}`);
}

export async function updateCompany(id: string, fd: FormData) {
  const { db } = await getAppContext();
  const data = companySchema.parse(form(fd));
  await db((tx) =>
    tx
      .update(schema.companies)
      .set({ ...data, tags: parseTags(data.tags), customFields: customFieldsFrom(fd) })
      .where(eq(schema.companies.id, id)),
  );
  revalidateAll();
}

export async function deleteCompany(id: string) {
  const { db } = await requireRole("admin");
  await db((tx) => tx.delete(schema.companies).where(eq(schema.companies.id, id)));
  revalidateAll();
  redirect("/companies");
}

// ─────────────── deals ───────────────

const dealSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  value: z.coerce.number().min(0).max(1e9).default(0),
  stageId: z.uuid(),
  contactId: uuidOrNull,
  companyId: uuidOrNull,
  ownerId: str(64),
  expectedClose: str(10),
});

export async function createDeal(fd: FormData) {
  const { user, db } = await getAppContext();
  const { value, ...data } = dealSchema.parse(form(fd));
  await db(async (tx) => {
    // If only a contact was picked, inherit its company.
    let companyId = data.companyId ?? null;
    if (!companyId && data.contactId) {
      const c = await tx.query.contacts.findFirst({ where: eq(schema.contacts.id, data.contactId) });
      companyId = c?.companyId ?? null;
    }
    const [{ maxPos }] = await tx
      .select({ maxPos: sql<number>`coalesce(max(${schema.deals.position}), -1)` })
      .from(schema.deals)
      .where(eq(schema.deals.stageId, data.stageId));
    const [d] = await tx
      .insert(schema.deals)
      .values({
        ...data,
        companyId,
        valueCents: Math.round(value * 100),
        ownerId: data.ownerId ?? user.id,
        position: Number(maxPos) + 1,
        customFields: customFieldsFrom(fd),
      })
      .returning();
    await logActivity(tx, {
      type: "deal_created",
      summary: `Deal "${d.title}" created (${money(d.valueCents)})`,
      actorId: user.id,
      dealId: d.id,
      contactId: d.contactId,
      companyId: d.companyId,
    });
  });
  revalidateAll();
}

export async function updateDeal(id: string, fd: FormData) {
  const { user, db } = await getAppContext();
  const { value, ...data } = dealSchema.parse(form(fd));
  await db(async (tx) => {
    const before = await tx.query.deals.findFirst({ where: eq(schema.deals.id, id) });
    if (!before) throw new Error("Deal not found");
    await tx
      .update(schema.deals)
      .set({ ...data, valueCents: Math.round(value * 100), customFields: customFieldsFrom(fd) })
      .where(eq(schema.deals.id, id));
    if (before.stageId !== data.stageId) await afterStageChange(tx, id, data.stageId, user.id);
  });
  revalidateAll();
}

async function afterStageChange(tx: TenantTx, dealId: string, stageId: string, actorId: string) {
  const stage = await tx.query.pipelineStages.findFirst({ where: eq(schema.pipelineStages.id, stageId) });
  if (!stage) throw new Error("Stage not found");
  const [d] = await tx
    .update(schema.deals)
    .set({ closedAt: stage.kind === "open" ? null : new Date() })
    .where(eq(schema.deals.id, dealId))
    .returning();
  await logActivity(tx, {
    type: "stage_changed",
    summary: `"${d.title}" moved to ${stage.name}`,
    actorId,
    dealId,
    contactId: d.contactId,
    companyId: d.companyId,
  });
  if (stage.kind === "won" && d.contactId) {
    await tx.update(schema.contacts).set({ lifecycle: "customer" }).where(eq(schema.contacts.id, d.contactId));
  }
}

/** Kanban drag & drop: move a deal to `stageId` at `index` within that column. */
export async function moveDeal(dealId: string, stageId: string, index: number) {
  const { user, db } = await getAppContext();
  await db(async (tx) => {
    const deal = await tx.query.deals.findFirst({ where: eq(schema.deals.id, dealId) });
    if (!deal) throw new Error("Deal not found");
    const column = await tx
      .select({ id: schema.deals.id })
      .from(schema.deals)
      .where(eq(schema.deals.stageId, stageId))
      .orderBy(asc(schema.deals.position), asc(schema.deals.createdAt));
    const ids = column.map((c) => c.id).filter((id) => id !== dealId);
    ids.splice(Math.max(0, Math.min(index, ids.length)), 0, dealId);
    for (let i = 0; i < ids.length; i++) {
      await tx.update(schema.deals).set({ position: i, stageId }).where(eq(schema.deals.id, ids[i]));
    }
    if (deal.stageId !== stageId) await afterStageChange(tx, dealId, stageId, user.id);
  });
  revalidateAll();
}

export async function deleteDeal(id: string) {
  const { db } = await getAppContext();
  await db((tx) => tx.delete(schema.deals).where(eq(schema.deals.id, id)));
  revalidateAll();
}

// ─────────────── notes ───────────────

export async function addNote(fd: FormData) {
  const { user, db } = await getAppContext();
  const data = z
    .object({ body: z.string().trim().min(1).max(5000), contactId: uuidOrNull, companyId: uuidOrNull, dealId: uuidOrNull })
    .parse(form(fd));
  await db(async (tx) => {
    await tx.insert(schema.notes).values({ ...data, authorId: user.id });
    await logActivity(tx, {
      type: "note",
      summary: data.body.length > 140 ? data.body.slice(0, 140) + "…" : data.body,
      actorId: user.id,
      contactId: data.contactId,
      companyId: data.companyId,
      dealId: data.dealId,
    });
  });
  revalidateAll();
}

// ─────────────── tasks ───────────────

const taskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  dueAt: str(30),
  assigneeId: str(64),
  contactId: uuidOrNull,
  companyId: uuidOrNull,
  dealId: uuidOrNull,
});

export async function createTask(fd: FormData) {
  const { user, db } = await getAppContext();
  const { dueAt, ...data } = taskSchema.parse(form(fd));
  await db(async (tx) => {
    const [t] = await tx
      .insert(schema.tasks)
      .values({
        ...data,
        dueAt: dueAt ? new Date(dueAt) : null,
        assigneeId: data.assigneeId ?? user.id,
        createdById: user.id,
      })
      .returning();
    await logActivity(tx, {
      type: "task_created",
      summary: `Task: ${t.title}`,
      actorId: user.id,
      contactId: t.contactId,
      companyId: t.companyId,
      dealId: t.dealId,
    });
  });
  revalidateAll();
}

export async function toggleTask(id: string) {
  const { user, db } = await getAppContext();
  await db(async (tx) => {
    const t = await tx.query.tasks.findFirst({ where: eq(schema.tasks.id, id) });
    if (!t) return;
    await tx
      .update(schema.tasks)
      .set({ done: !t.done, completedAt: t.done ? null : new Date() })
      .where(eq(schema.tasks.id, id));
    if (!t.done) {
      await logActivity(tx, {
        type: "task_done",
        summary: `Completed: ${t.title}`,
        actorId: user.id,
        contactId: t.contactId,
        companyId: t.companyId,
        dealId: t.dealId,
      });
    }
  });
  revalidateAll();
}

export async function deleteTask(id: string) {
  const { db } = await getAppContext();
  await db((tx) => tx.delete(schema.tasks).where(eq(schema.tasks.id, id)));
  revalidateAll();
}
