/**
 * Seeds two demo tenants with distinct branding and realistic mock data, plus a super admin.
 *   acme   → http://acme.localhost:3000   (also custom domain crm.acme-demo.test)
 *   harbor → http://harbor.localhost:3000
 * Re-running replaces the demo tenants.
 */
import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { ownerDb, schema, withTenant } from "../src/db";
import { createTenantWithDefaults } from "../src/lib/provision";

const DAY = 86400_000;
const rand = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

const FIRST = ["Ava", "Liam", "Maya", "Noah", "Zoe", "Ethan", "Isla", "Lucas", "Mia", "Owen", "Priya", "Diego", "Hana", "Marcus", "Sofia", "Kai", "Elena", "Theo", "Nadia", "Jonah", "Leah", "Omar", "Ruby", "Sam"];
const LAST = ["Patel", "Nguyen", "Garcia", "Kim", "Johnson", "Okafor", "Rossi", "Schmidt", "Silva", "Cohen", "Murphy", "Tanaka", "Dubois", "Ali", "Brown", "Lopez"];
const SOURCES = ["Website", "Referral", "LinkedIn", "Google Ads", "Event", "Cold outreach"];

async function upsertUser(email: string, name: string, isSuperAdmin = false) {
  const [u] = await ownerDb
    .insert(schema.users)
    .values({ email, name, isSuperAdmin, emailVerified: new Date() })
    .onConflictDoUpdate({ target: schema.users.email, set: { name, isSuperAdmin } })
    .returning();
  return u;
}

type Spec = {
  slug: string;
  name: string;
  industry: string;
  primaryColor: string;
  accentColor: string;
  loginHeadline: string;
  loginSubtext: string;
  domain?: string;
  team: { email: string; name: string; role: "owner" | "admin" | "member" }[];
  companies: { name: string; domain: string; industry: string }[];
  dealNames: string[];
  valueRange: [number, number];
};

const SPECS: Spec[] = [
  {
    slug: "acme",
    name: "Acme Growth",
    industry: "Marketing agency",
    primaryColor: "#4338ca",
    accentColor: "#f59e0b",
    loginHeadline: "Every client relationship, in one place.",
    loginSubtext: "Acme Growth's CRM for retainers, pitches and renewals.",
    domain: "crm.acme-demo.test",
    team: [
      { email: "owner@acme.test", name: "Jordan Reyes", role: "owner" },
      { email: "alex@acme.test", name: "Alex Chen", role: "admin" },
      { email: "sam@acme.test", name: "Sam Rivera", role: "member" },
    ],
    companies: [
      { name: "Northwind Coffee", domain: "northwind.coffee", industry: "Food & beverage" },
      { name: "Bluebird Fitness", domain: "bluebirdfit.com", industry: "Health & fitness" },
      { name: "Lumen Dental", domain: "lumendental.com", industry: "Healthcare" },
      { name: "Copperline Realty", domain: "copperline.realty", industry: "Real estate" },
      { name: "Fable & Co", domain: "fableco.com", industry: "Retail" },
      { name: "Vertex Logistics", domain: "vertexlogistics.io", industry: "Logistics" },
      { name: "Pinecrest Hotels", domain: "pinecresthotels.com", industry: "Hospitality" },
      { name: "Orbit SaaS", domain: "orbit.so", industry: "Software" },
    ],
    dealNames: ["SEO retainer", "Website redesign", "Paid social campaign", "Brand refresh", "Email automation setup", "Quarterly content plan", "Launch campaign"],
    valueRange: [2500, 48000],
  },
  {
    slug: "harbor",
    name: "Harbor Home Services",
    industry: "Local services",
    primaryColor: "#0f766e",
    accentColor: "#38bdf8",
    loginHeadline: "Book more jobs. Miss fewer follow-ups.",
    loginSubtext: "Harbor's team hub for quotes, jobs and repeat customers.",
    team: [
      { email: "owner@harbor.test", name: "Morgan Blake", role: "owner" },
      { email: "riley@harbor.test", name: "Riley Park", role: "member" },
    ],
    companies: [
      { name: "Seaside Apartments", domain: "seasideapts.com", industry: "Property management" },
      { name: "Oak Street HOA", domain: "oakstreethoa.org", industry: "HOA" },
      { name: "Bayview Schools", domain: "bayview.edu", industry: "Education" },
      { name: "Marina Offices", domain: "marinaoffices.com", industry: "Commercial" },
    ],
    dealNames: ["HVAC replacement", "Roof repair", "Annual maintenance plan", "Kitchen plumbing", "Gutter cleaning", "Water heater install"],
    valueRange: [300, 14000],
  },
];

async function seedTenant(spec: Spec) {
  const old = await ownerDb.query.tenants.findFirst({ where: eq(schema.tenants.slug, spec.slug) });
  if (old) await ownerDb.delete(schema.tenants).where(eq(schema.tenants.id, old.id));

  const tenant = await createTenantWithDefaults({
    slug: spec.slug,
    name: spec.name,
    industry: spec.industry,
    primaryColor: spec.primaryColor,
    accentColor: spec.accentColor,
    ownerEmail: spec.team[0].email,
    ownerName: spec.team[0].name,
  });
  await ownerDb
    .update(schema.tenants)
    .set({ loginHeadline: spec.loginHeadline, loginSubtext: spec.loginSubtext, emailFromName: spec.name })
    .where(eq(schema.tenants.id, tenant.id));
  if (spec.domain) {
    await ownerDb.insert(schema.domains).values({ tenantId: tenant.id, hostname: spec.domain, verified: true });
  }

  const users: (typeof schema.users.$inferSelect)[] = [];
  for (const m of spec.team) {
    const u = await upsertUser(m.email, m.name);
    users.push(u);
    await ownerDb
      .insert(schema.memberships)
      .values({ tenantId: tenant.id, userId: u.id, role: m.role })
      .onConflictDoNothing();
  }

  await withTenant(tenant.id, async (tx) => {
    const stages = await tx.query.pipelineStages.findMany({ orderBy: (s, { asc }) => asc(s.position) });
    const companies = await tx
      .insert(schema.companies)
      .values(spec.companies.map((c, i) => ({ ...c, tags: i % 3 === 0 ? ["key account"] : [], createdAt: daysAgo(170 - i * 9) })))
      .returning();

    const contactRows = Array.from({ length: spec.slug === "acme" ? 42 : 26 }, (_, i) => {
      const first = FIRST[(i * 7 + spec.slug.length) % FIRST.length];
      const last = LAST[(i * 5 + 3) % LAST.length];
      const company = i % 4 === 3 ? null : companies[i % companies.length];
      const created = daysAgo(Math.floor(Math.random() * 175));
      return {
        firstName: first,
        lastName: last,
        email: `${first}.${last}${i}@${company?.domain ?? "gmail.com"}`.toLowerCase(),
        phone: `+1 (555) ${String(100 + i).padStart(3, "0")}-${String(1000 + i * 37).slice(-4)}`,
        title: rand(["Marketing Director", "Founder", "Operations Manager", "CEO", "Office Manager", "Head of Growth", "Facilities Lead"]),
        companyId: company?.id ?? null,
        source: rand(SOURCES),
        lifecycle: rand(["lead", "lead", "qualified", "customer", "churned"] as const),
        ownerId: rand(users).id,
        tags: i % 5 === 0 ? ["vip"] : i % 7 === 0 ? ["newsletter"] : [],
        createdAt: created,
        lastActivityAt: new Date(created.getTime() + Math.random() * (Date.now() - created.getTime())),
      };
    });
    const contacts = await tx.insert(schema.contacts).values(contactRows).returning();

    const [min, max] = spec.valueRange;
    const deals = await tx
      .insert(schema.deals)
      .values(
        Array.from({ length: spec.slug === "acme" ? 30 : 20 }, (_, i) => {
          const contact = contacts[(i * 3) % contacts.length];
          const stage = stages[i % stages.length];
          const created = daysAgo(Math.floor(Math.random() * 170) + 5);
          return {
            title: `${rand(spec.dealNames)}${contact.companyId ? "" : ` — ${contact.firstName}`}`,
            valueCents: Math.round((min + Math.random() * (max - min)) / 50) * 50 * 100,
            stageId: stage.id,
            contactId: contact.id,
            companyId: contact.companyId,
            ownerId: contact.ownerId,
            position: i,
            expectedClose: new Date(Date.now() + (Math.random() * 60 - 10) * DAY).toISOString().slice(0, 10),
            closedAt: stage.kind === "open" ? null : new Date(created.getTime() + Math.random() * (Date.now() - created.getTime())),
            createdAt: created,
          };
        }),
      )
      .returning();
    const TASKS = ["Send proposal", "Follow up on quote", "Book discovery call", "Share case study", "Confirm start date", "Check in after onboarding", "Prepare renewal deck"];
    await tx.insert(schema.tasks).values(
      Array.from({ length: 16 }, (_, i) => {
        const contact = contacts[(i * 5) % contacts.length];
        const due = new Date(Date.now() + (i - 5) * DAY * 0.8);
        due.setHours(10 + (i % 6), 0, 0, 0);
        const done = i < 3;
        return {
          title: `${TASKS[i % TASKS.length]} — ${contact.firstName} ${contact.lastName}`,
          dueAt: due,
          done,
          completedAt: done ? daysAgo(i) : null,
          assigneeId: users[i % users.length].id,
          createdById: users[0].id,
          contactId: contact.id,
        };
      }),
    );

    const NOTES = [
      "Great intro call. Budget approved for Q1, wants to see examples from their industry.",
      "Asked about pricing tiers; sent the comparison sheet.",
      "Decision maker is the COO — schedule a call with both of them.",
      "Happy with the last project, open to expanding scope next quarter.",
    ];
    for (const [i, c] of contacts.slice(0, 18).entries()) {
      const at = new Date(c.createdAt.getTime() + DAY);
      await tx.insert(schema.activities).values({ type: "contact_created", summary: `Contact ${c.firstName} ${c.lastName} created`, actorId: c.ownerId, contactId: c.id, companyId: c.companyId, createdAt: c.createdAt });
      const body = NOTES[i % NOTES.length];
      await tx.insert(schema.notes).values({ body, authorId: c.ownerId, contactId: c.id, createdAt: at });
      await tx.insert(schema.activities).values({ type: "note", summary: body, actorId: c.ownerId, contactId: c.id, companyId: c.companyId, createdAt: at });
    }
    for (const d of deals) {
      const stage = stages.find((s) => s.id === d.stageId)!;
      await tx.insert(schema.activities).values({ type: "deal_created", summary: `Deal "${d.title}" created`, actorId: d.ownerId, dealId: d.id, contactId: d.contactId, companyId: d.companyId, createdAt: d.createdAt });
      if (stage.position > 0) {
        await tx.insert(schema.activities).values({ type: "stage_changed", summary: `"${d.title}" moved to ${stage.name}`, actorId: d.ownerId, dealId: d.id, contactId: d.contactId, companyId: d.companyId, createdAt: d.closedAt ?? new Date(d.createdAt.getTime() + 3 * DAY) });
      }
    }

    if (spec.slug === "acme") {
      await tx.insert(schema.customFieldDefs).values([
        { entity: "contact", key: "linkedin", label: "LinkedIn URL", type: "text", position: 0 },
        { entity: "contact", key: "budget", label: "Monthly budget", type: "select", options: ["< $2k", "$2k–$5k", "$5k–$10k", "$10k+"], position: 1 },
        { entity: "company", key: "employees", label: "Employees", type: "number", position: 0 },
      ]);
    }
  });

  console.log(`✓ ${spec.name}: ${spec.team.length} users`);
  return tenant;
}

async function main() {
  if (process.argv.includes("--if-empty")) {
    const existing = await ownerDb.query.tenants.findFirst();
    if (existing) {
      console.log("✓ database already has tenants; skipping seed");
      process.exit(0);
    }
  }
  if (process.env.DEMO_MODE === "true") await upsertUser("admin@demo.test", "Demo Platform Admin", true);
  // DEMO_DOMAINS=acme=acme-crm.vercel.app,harbor=harbor-crm.vercel.app
  for (const pair of (process.env.DEMO_DOMAINS ?? "").split(",").filter(Boolean)) {
    const [slug, host] = pair.split("=").map((s) => s.trim());
    const spec = SPECS.find((s) => s.slug === slug);
    if (spec && host) spec.domain = host;
  }
  const supers = (process.env.SUPER_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const email of supers) await upsertUser(email, "Platform Admin", true);
  console.log(`✓ super admins: ${supers.join(", ") || "(none — set SUPER_ADMIN_EMAILS)"}`);

  for (const spec of SPECS) await seedTenant(spec);
  const extraUsers = await ownerDb.select().from(schema.users).where(inArray(schema.users.email, SPECS.flatMap((s) => s.team.map((t) => t.email))));
  console.log(`✓ ${extraUsers.length} demo users. Sign in at http://acme.localhost:3000/login as owner@acme.test`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
