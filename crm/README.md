# White Label CRM

One codebase, many branded CRMs. Each client workspace (tenant) gets its own logo, colors, login page,
domain and sender name, with its data isolated by Postgres row-level security.

**Stack:** Next.js 15 (App Router, TypeScript) · Tailwind CSS 4 · Postgres + Drizzle ORM · Auth.js (magic link + Google) · Resend · Vercel Cron

## What's built

| Area | Features |
| --- | --- |
| **Core CRM** | Contacts (search, filters, tags, lifecycle, owner, custom fields, CSV export) · Companies · Deal pipeline kanban with drag & drop, configurable stages, deal values · Tasks with due dates, filters and a daily email digest · Notes and an activity timeline on every record |
| **Analytics** | Open and weighted pipeline, revenue won by month, win rate, stage conversion funnel, lead sources, due tasks, recent activity |
| **Import** | CSV upload with automatic column mapping, full-name splitting, auto-created companies, new custom fields from unknown columns, skip or update duplicates |
| **Auth & roles** | Email magic link (Google OAuth when configured) · invite-only workspaces · owner / admin / member roles |
| **White label** | Per-tenant app name, logo, favicon, colors (whole UI re-themes), login page copy, PWA manifest · tenant subdomains + custom domains (DNS check or Vercel API) · branded outbound email (sender name, reply-to, verified sending domain) |
| **Platform admin** | Create client workspaces (with an industry-specific default pipeline), usage overview, suspend/plan, verify sending domains, audit log, **"Open as support"** impersonation with a visible banner |
| **Isolation** | Every tenant table has `tenant_id` + an RLS policy. Tenant data is only reachable via `withTenant()`, which uses a restricted DB role and pins `app.tenant_id` for the transaction |

## How tenancy works

```
acme.yourcrm.com ─┐                       ┌─ tenants, users, memberships, domains, auth  (owner role)
crm.acme.com ─────┼─▶ resolveHost(host) ──┤
harbor.yourcrm.com┘    → tenant           └─ withTenant(tenant.id, tx => …)  (crm_app role + RLS)
yourcrm.com ─────────▶ platform            → marketing page + /admin console
```

- `src/lib/tenant.ts`: maps the request host to the platform, a tenant subdomain, or a verified custom domain.
- `src/lib/access.ts`: `getAppContext()` returns the tenant, user, role and an RLS-scoped `db()` for every page and action.
- `src/db/index.ts`: two pools. `ownerDb` for platform tables; `withTenant()` for CRM data.
- `scripts/migrate.ts`: applies migrations, then enables RLS policies and grants on all tenant tables.
- `npm run test:isolation` shows that, even with raw SQL and no WHERE clause, one tenant cannot read, update or insert another tenant's rows.

## Run locally

Requires Node 22+ and Postgres 14+.

```bash
cd crm
cp .env.example .env            # set AUTH_SECRET (openssl rand -base64 32)

# Two roles: an owner for migrations/platform data, and a restricted app role for tenant data
psql -c "CREATE ROLE crm_owner LOGIN PASSWORD 'owner_pw';"
psql -c "CREATE ROLE crm_app LOGIN PASSWORD 'app_pw';"
psql -c "CREATE DATABASE crm OWNER crm_owner;"

npm install
npm run db:migrate
npm run db:seed                 # two demo tenants with mock data
npm run dev
```

Open these (browsers resolve `*.localhost` automatically):

| URL | Sign in as |
| --- | --- |
| http://acme.localhost:3000 | `owner@acme.test` (owner), `alex@acme.test` (admin), `sam@acme.test` (member) |
| http://harbor.localhost:3000 | `owner@harbor.test` |
| http://localhost:3000/admin | the email in `SUPER_ADMIN_EMAILS` |

With no `RESEND_API_KEY`, emails are not sent: open **/dev/inbox** on the same host and click the sign-in link.

## Deploy (Vercel + Neon)

1. Import the repo into Vercel with **Root Directory = `crm`**.
2. In the project's **Storage** tab, add a **Neon** Postgres database. This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. Add env vars: `AUTH_SECRET`, `APP_DB_PASSWORD` (a long random string), `PLATFORM_DOMAIN`, `PLATFORM_NAME`, `SUPER_ADMIN_EMAILS`, `CRON_SECRET`.
4. Deploy. The build (see `vercel.json`) runs migrations, creates the restricted `crm_app` role, enables RLS, and seeds demo data if the database is empty.
5. Domains: add `yourcrm.com` and the wildcard `*.yourcrm.com` (wildcards need Vercel nameservers). Without a custom domain, give each demo tenant its own `*.vercel.app` alias and list them in `DEMO_DOMAINS` (e.g. `acme=acme-crm.vercel.app`).
6. Optional: `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` so client custom domains are added to the project automatically.
7. Email: set `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` (a verified sender) so magic links go out. To send as a client's own domain, verify it in Resend, then tick "Sending domain verified" in the admin console.
8. Google login (optional): set `AUTH_GOOGLE_ID/SECRET` and add `https://<host>/api/auth/callback/google` for each host.

**Demo mode** (`DEMO_MODE=true`) adds one-click sign-in buttons for the seeded `*.test` accounts, including a demo platform admin. It's for showing the product only. Turn it off and remove the demo tenants before any real client data goes in.

## Not built yet (later phases from the plan)

- Workflows and automations (email sequences, stage-change triggers)
- Two-way email and SMS, web forms, calendar booking
- Stripe billing and plan limits (the `plan` field exists; nothing enforces it yet)
- AI features and integrations (webhooks, Zapier)

## Known limitations

- Task due times come from `datetime-local` inputs and are read in the server's time zone, which is UTC on Vercel. Per-user time zones are not supported yet.
- Drag and drop on the pipeline uses HTML5 drag events, which don't work on touch screens. On phones, change a deal's stage from the deal panel.
- Logos are stored as data URLs in Postgres, capped at 256 KB. Move them to Blob storage if they get bigger.
