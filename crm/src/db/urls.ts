/**
 * Resolves the two database connections.
 *
 *  owner: runs migrations and platform queries (owns the tables, so bypasses RLS)
 *  app:   restricted role used for all tenant CRM data (RLS enforced)
 *
 * Works with plain env vars (local) and with the Vercel ↔ Neon integration, which injects
 * DATABASE_URL / DATABASE_URL_UNPOOLED for the owner role. In that case set APP_DB_PASSWORD and
 * the app role ("crm_app") is created by `npm run db:migrate` and its URL derived automatically.
 */
export const APP_ROLE = process.env.APP_DB_ROLE ?? "crm_app";

export function dbUrls() {
  const ownerPooled = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  const ownerDirect = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  let app = process.env.DATABASE_APP_URL;
  if (!app && process.env.APP_DB_PASSWORD && ownerPooled) {
    const u = new URL(ownerPooled);
    u.username = APP_ROLE;
    u.password = encodeURIComponent(process.env.APP_DB_PASSWORD);
    app = u.toString();
  }
  return { ownerPooled, ownerDirect, app };
}
