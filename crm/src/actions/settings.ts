"use server";

import { and, asc, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ownerDb, schema } from "@/db";
import { FIELD_ENTITIES, FIELD_TYPES, ROLES } from "@/db/schema";
import { requireRole } from "@/lib/access";
import { addDomainToHosting, checkDomain } from "@/lib/domains";
import { brandedHtml, escapeHtml, sendEmail } from "@/lib/email";
import { slugify } from "@/lib/format";
import { getHost, PLATFORM_DOMAIN } from "@/lib/tenant";

export type ActionState = { ok?: string; error?: string } | null;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #4f46e5");
const MAX_IMAGE = 256 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"];

async function fileToDataUrl(f: FormDataEntryValue | null) {
  if (!(f instanceof File) || f.size === 0) return undefined;
  if (f.size > MAX_IMAGE) throw new Error("Images must be under 256 KB");
  if (!IMAGE_TYPES.includes(f.type)) throw new Error("Upload a PNG, JPG, SVG, WebP or ICO image");
  return `data:${f.type};base64,${Buffer.from(await f.arrayBuffer()).toString("base64")}`;
}

function done(msg: string): ActionState {
  revalidatePath("/", "layout");
  return { ok: msg };
}
function fail(e: unknown): ActionState {
  if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid input" };
  return { error: e instanceof Error ? e.message : "Something went wrong" };
}

// ─────────────── Branding ───────────────

export async function saveBranding(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { tenant } = await requireRole("admin");
    const data = z
      .object({
        name: z.string().trim().min(1, "App name is required").max(60),
        primaryColor: hex,
        accentColor: hex,
        loginHeadline: z.string().trim().max(120),
        loginSubtext: z.string().trim().max(240),
        emailFromName: z.string().trim().max(60),
        emailReplyTo: z.union([z.literal(""), z.email("Reply-to must be an email")]),
      })
      .parse(Object.fromEntries(fd));
    const logo = await fileToDataUrl(fd.get("logoFile"));
    const favicon = await fileToDataUrl(fd.get("faviconFile"));
    await ownerDb
      .update(schema.tenants)
      .set({
        ...data,
        loginHeadline: data.loginHeadline || null,
        loginSubtext: data.loginSubtext || null,
        emailFromName: data.emailFromName || null,
        emailReplyTo: data.emailReplyTo || null,
        ...(logo ? { logo } : fd.get("removeLogo") ? { logo: null } : {}),
        ...(favicon ? { favicon } : fd.get("removeFavicon") ? { favicon: null } : {}),
      })
      .where(eq(schema.tenants.id, tenant.id));
    return done("Branding saved");
  } catch (e) {
    return fail(e);
  }
}

// ─────────────── Pipeline stages ───────────────

const stageSchema = z.object({
  name: z.string().trim().min(1).max(60),
  probability: z.coerce.number().int().min(0).max(100),
  kind: z.enum(["open", "won", "lost"]),
});

export async function addStage(fd: FormData) {
  const { db } = await requireRole("admin");
  const data = stageSchema.parse(Object.fromEntries(fd));
  await db(async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(schema.pipelineStages);
    await tx.insert(schema.pipelineStages).values({ ...data, position: n });
  });
  revalidatePath("/", "layout");
}

export async function updateStage(id: string, fd: FormData) {
  const { db } = await requireRole("admin");
  const data = stageSchema.parse(Object.fromEntries(fd));
  await db((tx) => tx.update(schema.pipelineStages).set(data).where(eq(schema.pipelineStages.id, id)));
  revalidatePath("/", "layout");
}

export async function moveStage(id: string, dir: -1 | 1) {
  const { db } = await requireRole("admin");
  await db(async (tx) => {
    const stages = await tx.query.pipelineStages.findMany({ orderBy: asc(schema.pipelineStages.position) });
    const i = stages.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= stages.length) return;
    [stages[i], stages[j]] = [stages[j], stages[i]];
    for (const [pos, s] of stages.entries()) {
      await tx.update(schema.pipelineStages).set({ position: pos }).where(eq(schema.pipelineStages.id, s.id));
    }
  });
  revalidatePath("/", "layout");
}

/** Deletes a stage, moving its deals to `moveTo` first. */
export async function deleteStage(id: string, fd: FormData) {
  const { db } = await requireRole("admin");
  const moveTo = String(fd.get("moveTo") ?? "");
  await db(async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(schema.deals).where(eq(schema.deals.stageId, id));
    if (n > 0) {
      if (!moveTo || moveTo === id) throw new Error("Choose a stage to move this stage's deals to");
      await tx.update(schema.deals).set({ stageId: moveTo }).where(eq(schema.deals.stageId, id));
    }
    await tx.delete(schema.pipelineStages).where(eq(schema.pipelineStages.id, id));
  });
  revalidatePath("/", "layout");
}

// ─────────────── Custom fields ───────────────

export async function addCustomField(fd: FormData) {
  const { db } = await requireRole("admin");
  const data = z
    .object({
      entity: z.enum(FIELD_ENTITIES),
      label: z.string().trim().min(1).max(60),
      type: z.enum(FIELD_TYPES),
      options: z.string().optional(),
    })
    .parse(Object.fromEntries(fd));
  const key = slugify(data.label).replace(/-/g, "_") || "field";
  await db(async (tx) => {
    const [{ n }] = await tx.select({ n: count() }).from(schema.customFieldDefs).where(eq(schema.customFieldDefs.entity, data.entity));
    await tx
      .insert(schema.customFieldDefs)
      .values({
        entity: data.entity,
        key,
        label: data.label,
        type: data.type,
        position: n,
        options: data.type === "select" ? (data.options ?? "").split(",").map((o) => o.trim()).filter(Boolean).slice(0, 50) : [],
      })
      .onConflictDoNothing();
  });
  revalidatePath("/", "layout");
}

export async function deleteCustomField(id: string) {
  const { db } = await requireRole("admin");
  await db((tx) => tx.delete(schema.customFieldDefs).where(eq(schema.customFieldDefs.id, id)));
  revalidatePath("/", "layout");
}

// ─────────────── Team ───────────────

export async function inviteMember(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { tenant, role: myRole, user: me } = await requireRole("admin");
    const { email, name, role } = z
      .object({ email: z.email("Enter a valid email").transform((e) => e.toLowerCase()), name: z.string().trim().max(80), role: z.enum(ROLES) })
      .parse(Object.fromEntries(fd));
    if (role === "owner" && myRole !== "owner") throw new Error("Only owners can add other owners");

    let user = await ownerDb.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (!user) [user] = await ownerDb.insert(schema.users).values({ email, name: name || null }).returning();
    const existing = await ownerDb.query.memberships.findFirst({
      where: and(eq(schema.memberships.tenantId, tenant.id), eq(schema.memberships.userId, user.id)),
    });
    if (existing) throw new Error(`${email} is already on the team`);
    await ownerDb.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, role });

    const host = await getHost();
    const proto = host.startsWith("localhost") || host.includes(".localhost") ? "http" : "https";
    const origin = `${proto}://${host}`;
    await sendEmail({
      tenant,
      to: email,
      subject: `You've been invited to ${tenant.name}`,
      html: brandedHtml(tenant, {
        heading: `Join ${escapeHtml(tenant.name)}`,
        body: `<p>${escapeHtml(me.name || me.email)} invited you to the ${escapeHtml(tenant.name)} CRM as ${role === "admin" ? "an" : "a"} <strong>${role}</strong>.</p><p>Sign in with this email address (${escapeHtml(email)}) to get started.</p>`,
        cta: { label: "Sign in", url: `${origin}/login` },
        logoUrl: tenant.logo ? `${origin}/api/brand/logo` : undefined,
      }),
    });
    return done(`Invitation sent to ${email}`);
  } catch (e) {
    return fail(e);
  }
}

async function ownerCount(tenantId: string) {
  const [{ n }] = await ownerDb
    .select({ n: count() })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.tenantId, tenantId), eq(schema.memberships.role, "owner")));
  return n;
}

export async function changeRole(userId: string, fd: FormData) {
  const { tenant, role: myRole } = await requireRole("admin");
  const role = z.enum(ROLES).parse(fd.get("role"));
  const target = await ownerDb.query.memberships.findFirst({
    where: and(eq(schema.memberships.tenantId, tenant.id), eq(schema.memberships.userId, userId)),
  });
  if (!target) throw new Error("Member not found");
  if ((role === "owner" || target.role === "owner") && myRole !== "owner") throw new Error("Only owners can change owner roles");
  if (target.role === "owner" && role !== "owner" && (await ownerCount(tenant.id)) <= 1) throw new Error("A workspace needs at least one owner");
  await ownerDb.update(schema.memberships).set({ role }).where(eq(schema.memberships.id, target.id));
  revalidatePath("/", "layout");
}

export async function removeMember(userId: string) {
  const { tenant, role: myRole, user } = await requireRole("admin");
  if (userId === user.id) throw new Error("You can't remove yourself");
  const target = await ownerDb.query.memberships.findFirst({
    where: and(eq(schema.memberships.tenantId, tenant.id), eq(schema.memberships.userId, userId)),
  });
  if (!target) return;
  if (target.role === "owner" && myRole !== "owner") throw new Error("Only owners can remove owners");
  await ownerDb.delete(schema.memberships).where(eq(schema.memberships.id, target.id));
  // End their sessions on this workspace's hosts too (sessions are per user; simplest is to end all).
  await ownerDb.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  revalidatePath("/", "layout");
}

// ─────────────── Domains & email ───────────────

export async function addDomain(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { tenant } = await requireRole("admin");
    const hostname = String(fd.get("hostname") ?? "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(hostname)) throw new Error("Enter a domain like crm.yourbrand.com");
    if (hostname.endsWith(PLATFORM_DOMAIN.split(":")[0])) throw new Error("Use your own domain, not a platform subdomain");
    const taken = await ownerDb.query.domains.findFirst({ where: eq(schema.domains.hostname, hostname) });
    if (taken) throw new Error("That domain is already connected to a workspace");
    await ownerDb.insert(schema.domains).values({ tenantId: tenant.id, hostname });
    await addDomainToHosting(hostname);
    return done(`${hostname} added. Now create the DNS record below.`);
  } catch (e) {
    return fail(e);
  }
}

export async function verifyDomain(id: string) {
  const { tenant } = await requireRole("admin");
  const d = await ownerDb.query.domains.findFirst({ where: and(eq(schema.domains.id, id), eq(schema.domains.tenantId, tenant.id)) });
  if (!d) return;
  const verified = await checkDomain(d.hostname);
  await ownerDb.update(schema.domains).set({ verified, lastCheckedAt: new Date() }).where(eq(schema.domains.id, id));
  revalidatePath("/", "layout");
}

export async function removeDomain(id: string) {
  const { tenant } = await requireRole("admin");
  await ownerDb.delete(schema.domains).where(and(eq(schema.domains.id, id), eq(schema.domains.tenantId, tenant.id)));
  revalidatePath("/", "layout");
}

export async function saveEmailDomain(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { tenant } = await requireRole("admin");
    const domain = String(fd.get("emailDomain") ?? "").trim().toLowerCase();
    if (domain && !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) throw new Error("Enter a domain like mail.yourbrand.com");
    await ownerDb
      .update(schema.tenants)
      .set({ emailDomain: domain || null, emailDomainVerified: false })
      .where(eq(schema.tenants.id, tenant.id));
    return done(domain ? "Sending domain saved. A platform admin verifies it in Resend." : "Sending domain removed");
  } catch (e) {
    return fail(e);
  }
}

export async function sendTestEmail(_: ActionState): Promise<ActionState> {
  try {
    const { tenant, user } = await requireRole("admin");
    await sendEmail({
      tenant,
      to: user.email,
      subject: `Test email from ${tenant.name}`,
      html: brandedHtml(tenant, {
        heading: "Your branded emails look like this",
        body: "<p>Sign-in links, invitations and task reminders use your logo, colors and sender name.</p>",
      }),
    });
    return { ok: `Test email sent to ${user.email}` };
  } catch (e) {
    return fail(e);
  }
}
