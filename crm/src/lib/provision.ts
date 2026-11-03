/**
 * Tenant provisioning, shared by the super-admin console and the seed script.
 * (No "server-only" import so it can run from scripts.)
 */
import { eq } from "drizzle-orm";
import { ownerDb, schema, withTenant } from "@/db";

type StageSeed = { name: string; probability: number; kind?: "open" | "won" | "lost" };

/** Default pipelines by niche: shapes the first-run experience for each kind of client. */
export const PIPELINE_TEMPLATES: Record<string, StageSeed[]> = {
  general: [
    { name: "New lead", probability: 10 },
    { name: "Contacted", probability: 25 },
    { name: "Proposal sent", probability: 50 },
    { name: "Negotiation", probability: 75 },
    { name: "Won", probability: 100, kind: "won" },
    { name: "Lost", probability: 0, kind: "lost" },
  ],
  "Marketing agency": [
    { name: "Inquiry", probability: 10 },
    { name: "Discovery call", probability: 25 },
    { name: "Proposal", probability: 50 },
    { name: "Contract out", probability: 80 },
    { name: "Signed", probability: 100, kind: "won" },
    { name: "Lost", probability: 0, kind: "lost" },
  ],
  "Local services": [
    { name: "New request", probability: 15 },
    { name: "Site visit", probability: 35 },
    { name: "Quote sent", probability: 55 },
    { name: "Scheduled", probability: 85 },
    { name: "Completed", probability: 100, kind: "won" },
    { name: "Declined", probability: 0, kind: "lost" },
  ],
  "Real estate": [
    { name: "New lead", probability: 10 },
    { name: "Showing", probability: 30 },
    { name: "Offer", probability: 60 },
    { name: "Under contract", probability: 85 },
    { name: "Closed", probability: 100, kind: "won" },
    { name: "Fell through", probability: 0, kind: "lost" },
  ],
};

export const RESERVED_SLUGS = new Set(["www", "admin", "app", "api", "mail", "auth", "login", "static", "assets"]);

export async function createTenantWithDefaults(input: {
  slug: string;
  name: string;
  industry?: string | null;
  primaryColor?: string;
  accentColor?: string;
  ownerEmail: string;
  ownerName?: string | null;
  plan?: string;
}) {
  if (RESERVED_SLUGS.has(input.slug)) throw new Error(`"${input.slug}" is reserved`);
  const [tenant] = await ownerDb
    .insert(schema.tenants)
    .values({
      slug: input.slug,
      name: input.name,
      industry: input.industry ?? null,
      plan: input.plan ?? "starter",
      primaryColor: input.primaryColor ?? "#4f46e5",
      accentColor: input.accentColor ?? "#0ea5e9",
      emailFromName: input.name,
    })
    .returning();

  const email = input.ownerEmail.trim().toLowerCase();
  let user = await ownerDb.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!user) {
    [user] = await ownerDb.insert(schema.users).values({ email, name: input.ownerName ?? null }).returning();
  }
  await ownerDb.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, role: "owner" });

  const stages = PIPELINE_TEMPLATES[input.industry ?? ""] ?? PIPELINE_TEMPLATES.general;
  await withTenant(tenant.id, (tx) =>
    tx.insert(schema.pipelineStages).values(
      stages.map((s, i) => ({ name: s.name, probability: s.probability, kind: s.kind ?? "open", position: i })),
    ),
  );
  return tenant;
}
