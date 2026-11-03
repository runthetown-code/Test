/**
 * Database schema.
 *
 * Two kinds of tables:
 *  - PLATFORM tables (tenants, domains, users, memberships, auth, audit, email log) are global and
 *    only reachable through the owner connection (`ownerDb`).
 *  - TENANT tables carry `tenant_id` and are protected by Postgres row-level security
 *    (see drizzle/rls.sql). They are only reachable through `withTenant()`, which uses the
 *    restricted `crm_app` role and pins `app.tenant_id` for the transaction. `tenant_id`
 *    defaults to that setting, so inserts never have to (and cannot) pick another tenant.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const tenantId = () =>
  uuid("tenant_id")
    .notNull()
    .default(sql`nullif(current_setting('app.tenant_id', true), '')::uuid`)
    .references(() => tenants.id, { onDelete: "cascade" });

// ───────────────────────────── Platform tables ─────────────────────────────

export const tenants = pgTable("tenants", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  plan: text("plan").notNull().default("starter"),
  industry: text("industry"),
  // Branding
  logo: text("logo"), // data: URL or https URL
  favicon: text("favicon"),
  primaryColor: text("primary_color").notNull().default("#4f46e5"),
  accentColor: text("accent_color").notNull().default("#0ea5e9"),
  loginHeadline: text("login_headline"),
  loginSubtext: text("login_subtext"),
  // Branded outbound email
  emailFromName: text("email_from_name"),
  emailReplyTo: text("email_reply_to"),
  emailDomain: text("email_domain"), // e.g. mail.clientbrand.com, verified in Resend
  emailDomainVerified: boolean("email_domain_verified").notNull().default(false),
  createdAt: createdAt(),
});

export const domains = pgTable("domains", {
  id: id(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull().unique(),
  verified: boolean("verified").notNull().default(false),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// Auth.js tables (shape required by @auth/drizzle-adapter)
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const ROLES = ["owner", "admin", "member"] as const;
export type Role = (typeof ROLES)[number];

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_tenant_user").on(t.tenantId, t.userId)],
);

export const auditLog = pgTable("audit_log", {
  id: id(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: createdAt(),
});

export const emailLog = pgTable("email_log", {
  id: id(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  to: text("to").notNull(),
  from: text("from").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  status: text("status").notNull(), // sent | logged | failed
  error: text("error"),
  createdAt: createdAt(),
});

// ───────────────────────────── Tenant tables (RLS) ─────────────────────────────

export const pipelineStages = pgTable("pipeline_stages", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  probability: integer("probability").notNull().default(10), // % chance to close
  kind: text("kind", { enum: ["open", "won", "lost"] }).notNull().default("open"),
});

export const companies = pgTable(
  "companies",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    domain: text("domain"),
    industry: text("industry"),
    phone: text("phone"),
    address: text("address"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    customFields: jsonb("custom_fields").$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("companies_tenant").on(t.tenantId)],
);

export const LIFECYCLES = ["lead", "qualified", "customer", "churned"] as const;

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    tenantId: tenantId(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    source: text("source"),
    lifecycle: text("lifecycle", { enum: LIFECYCLES }).notNull().default("lead"),
    ownerId: text("owner_id"), // users.id (resolved via platform connection)
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    customFields: jsonb("custom_fields").$type<Record<string, string>>().notNull().default({}),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("contacts_tenant").on(t.tenantId), index("contacts_email").on(t.tenantId, t.email)],
);

export const deals = pgTable(
  "deals",
  {
    id: id(),
    tenantId: tenantId(),
    title: text("title").notNull(),
    valueCents: integer("value_cents").notNull().default(0),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => pipelineStages.id, { onDelete: "restrict" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    ownerId: text("owner_id"),
    expectedClose: date("expected_close"),
    position: integer("position").notNull().default(0),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    customFields: jsonb("custom_fields").$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("deals_tenant_stage").on(t.tenantId, t.stageId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    tenantId: tenantId(),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    done: boolean("done").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    assigneeId: text("assignee_id"),
    createdById: text("created_by_id"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("tasks_tenant_due").on(t.tenantId, t.done, t.dueAt)],
);

export const notes = pgTable("notes", {
  id: id(),
  tenantId: tenantId(),
  body: text("body").notNull(),
  authorId: text("author_id"),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const activities = pgTable(
  "activities",
  {
    id: id(),
    tenantId: tenantId(),
    type: text("type").notNull(), // contact_created | note | task_created | task_done | deal_created | stage_changed | import | email
    summary: text("summary").notNull(),
    actorId: text("actor_id"),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("activities_tenant_created").on(t.tenantId, t.createdAt)],
);

export const FIELD_ENTITIES = ["contact", "company", "deal"] as const;
export const FIELD_TYPES = ["text", "number", "date", "select"] as const;

export const customFieldDefs = pgTable(
  "custom_field_defs",
  {
    id: id(),
    tenantId: tenantId(),
    entity: text("entity", { enum: FIELD_ENTITIES }).notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type", { enum: FIELD_TYPES }).notNull().default("text"),
    options: text("options").array().notNull().default(sql`'{}'::text[]`),
    position: integer("position").notNull().default(0),
  },
  (t) => [uniqueIndex("custom_field_defs_key").on(t.tenantId, t.entity, t.key)],
);

export const TENANT_TABLES = [
  "pipeline_stages",
  "companies",
  "contacts",
  "deals",
  "tasks",
  "notes",
  "activities",
  "custom_field_defs",
] as const;

export type Tenant = typeof tenants.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type Stage = typeof pipelineStages.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type CustomFieldDef = typeof customFieldDefs.$inferSelect;
