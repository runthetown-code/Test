import "server-only";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { ownerDb, schema } from "@/db";
import type { Tenant } from "@/db/schema";

export const PLATFORM_DOMAIN = (process.env.PLATFORM_DOMAIN ?? "localhost:3000").toLowerCase();
export const PLATFORM_NAME = process.env.PLATFORM_NAME ?? "White Label CRM";

export type HostContext =
  | { kind: "platform"; host: string }
  | { kind: "tenant"; host: string; tenant: Tenant }
  | { kind: "unknown"; host: string };

export function normalizeHost(raw: string | null | undefined) {
  return (raw ?? "").split(",")[0].trim().toLowerCase();
}

/** Resolves a hostname to the platform, a tenant (by subdomain or verified custom domain), or nothing. */
export async function resolveHost(host: string): Promise<HostContext> {
  const bare = host.replace(/^www\./, "");
  if (bare === PLATFORM_DOMAIN || bare === `admin.${PLATFORM_DOMAIN}`) return { kind: "platform", host };

  let tenant: Tenant | undefined;
  if (bare.endsWith(`.${PLATFORM_DOMAIN}`)) {
    const slug = bare.slice(0, -(PLATFORM_DOMAIN.length + 1));
    if (!slug.includes(".")) {
      tenant = await ownerDb.query.tenants.findFirst({ where: eq(schema.tenants.slug, slug) });
    }
  } else {
    const hostname = bare.split(":")[0];
    const domain = await ownerDb.query.domains.findFirst({
      where: and(eq(schema.domains.hostname, hostname), eq(schema.domains.verified, true)),
    });
    if (domain) tenant = await ownerDb.query.tenants.findFirst({ where: eq(schema.tenants.id, domain.tenantId) });
  }

  if (!tenant && process.env.FALLBACK_TENANT_SLUG) {
    tenant = await ownerDb.query.tenants.findFirst({
      where: eq(schema.tenants.slug, process.env.FALLBACK_TENANT_SLUG),
    });
  }
  return tenant ? { kind: "tenant", host, tenant } : { kind: "unknown", host };
}

export const getHost = cache(async () => {
  const h = await headers();
  return normalizeHost(h.get("x-forwarded-host") ?? h.get("host"));
});

export const getHostContext = cache(async () => resolveHost(await getHost()));

/** Base URL for a tenant's default subdomain, e.g. http://acme.localhost:3000 */
export function tenantUrl(slug: string, path = "") {
  const proto = PLATFORM_DOMAIN.startsWith("localhost") ? "http" : "https";
  return `${proto}://${slug}.${PLATFORM_DOMAIN}${path}`;
}

export function platformUrl(path = "") {
  const proto = PLATFORM_DOMAIN.startsWith("localhost") ? "http" : "https";
  return `${proto}://${PLATFORM_DOMAIN}${path}`;
}
