"use server";

import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ownerDb, schema } from "@/db";
import { requireSuperAdmin } from "@/lib/access";
import { slugify } from "@/lib/format";
import { createTenantWithDefaults, RESERVED_SLUGS } from "@/lib/provision";
import { tenantUrl } from "@/lib/tenant";
import type { ActionState } from "./settings";

export async function createTenant(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string;
  try {
    const admin = await requireSuperAdmin();
    const data = z
      .object({
        name: z.string().trim().min(1, "Name is required").max(60),
        slug: z.string().trim().toLowerCase(),
        industry: z.string(),
        ownerEmail: z.email("Owner email is invalid"),
        ownerName: z.string().trim().max(80),
        primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        plan: z.enum(["starter", "pro", "enterprise"]),
      })
      .parse(Object.fromEntries(fd));
    const slug = slugify(data.slug || data.name);
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) throw new Error("Subdomain must be 3–40 letters, numbers or dashes");
    if (RESERVED_SLUGS.has(slug)) throw new Error(`"${slug}" is reserved`);
    if (await ownerDb.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) })) throw new Error(`${slug} is already taken`);
    const t = await createTenantWithDefaults({ ...data, slug, industry: data.industry || null });
    await ownerDb.insert(schema.auditLog).values({ tenantId: t.id, actorUserId: admin.id, action: "tenant.created", detail: `${t.name} (${slug})` });
    id = t.id;
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : "Failed" };
  }
  revalidatePath("/admin");
  redirect(`/admin/tenants/${id}`);
}

export async function updateTenant(id: string, fd: FormData) {
  const admin = await requireSuperAdmin();
  const data = z
    .object({
      status: z.enum(["active", "suspended"]),
      plan: z.enum(["starter", "pro", "enterprise"]),
      emailDomainVerified: z.string().optional(),
    })
    .parse(Object.fromEntries(fd));
  const [t] = await ownerDb
    .update(schema.tenants)
    .set({ status: data.status, plan: data.plan, emailDomainVerified: data.emailDomainVerified === "on" })
    .where(eq(schema.tenants.id, id))
    .returning();
  await ownerDb.insert(schema.auditLog).values({ tenantId: id, actorUserId: admin.id, action: "tenant.updated", detail: `status=${t.status} plan=${t.plan}` });
  revalidatePath("/admin");
}

/**
 * Support access: mints a single-use, 60-second token and sends the admin to the tenant's host,
 * where /api/impersonate exchanges it for a session on that host.
 */
export async function impersonate(tenantId: string) {
  const admin = await requireSuperAdmin();
  const tenant = await ownerDb.query.tenants.findFirst({ where: eq(schema.tenants.id, tenantId) });
  if (!tenant) throw new Error("Tenant not found");
  const token = randomBytes(32).toString("hex");
  await ownerDb.insert(schema.verificationTokens).values({
    identifier: `impersonate:${tenant.id}:${admin.id}`,
    token: createHash("sha256").update(token).digest("hex"),
    expires: new Date(Date.now() + 60_000),
  });
  await ownerDb.insert(schema.auditLog).values({ tenantId: tenant.id, actorUserId: admin.id, action: "support.access", detail: `${admin.email} opened ${tenant.name}` });
  redirect(tenantUrl(tenant.slug, `/api/impersonate?token=${token}`));
}
