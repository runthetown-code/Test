import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { ownerDb, schema, withTenant, type TenantTx } from "@/db";
import type { Role } from "@/db/schema";
import { getHostContext } from "./tenant";

const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export function hasRole(role: Role, min: Role) {
  return RANK[role] >= RANK[min];
}

/**
 * Everything a tenant page or action needs: the tenant (from the host), the signed-in user,
 * their role, and a `db` helper scoped to the tenant by RLS.
 * Super admins without a membership get owner rights in "support mode" (impersonation).
 */
export const getAppContext = cache(async () => {
  const host = await getHostContext();
  if (host.kind !== "tenant") notFound();
  const tenant = host.tenant;

  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = session.user;

  const membership = await ownerDb.query.memberships.findFirst({
    where: and(eq(schema.memberships.tenantId, tenant.id), eq(schema.memberships.userId, user.id)),
  });

  let role: Role;
  let supportMode = false;
  if (membership && (tenant.status === "active" || user.isSuperAdmin)) {
    role = membership.role;
  } else if (user.isSuperAdmin) {
    role = "owner";
    supportMode = true;
  } else {
    redirect("/login?error=AccessDenied");
  }

  return {
    tenant,
    user,
    role,
    supportMode,
    db: <T,>(fn: (tx: TenantTx) => Promise<T>) => withTenant(tenant.id, fn),
  };
});

export type AppContext = Awaited<ReturnType<typeof getAppContext>>;

export async function requireRole(min: Role) {
  const ctx = await getAppContext();
  if (!hasRole(ctx.role, min)) throw new Error(`This action requires the ${min} role.`);
  return ctx;
}

/** Team members of the tenant (id → name/email), used to show owners and assignees. */
export const getMembers = cache(async (tenantId: string) => {
  const rows = await ownerDb
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      image: schema.users.image,
      role: schema.memberships.role,
      joinedAt: schema.memberships.createdAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(eq(schema.memberships.tenantId, tenantId))
    .orderBy(schema.users.name);
  return rows;
});

export async function memberMap(tenantId: string) {
  const ms = await getMembers(tenantId);
  return new Map(ms.map((m) => [m.id, m.name || m.email]));
}

export async function requireSuperAdmin() {
  const host = await getHostContext();
  if (host.kind !== "platform") notFound();
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/login?error=AccessDenied");
  return session.user;
}
