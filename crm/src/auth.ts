import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import NextAuth, { type NextAuthConfig } from "next-auth";
import { headers } from "next/headers";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { ownerDb, schema } from "@/db";
import { brandedHtml, escapeHtml, sendEmail } from "@/lib/email";
import { normalizeHost, resolveHost } from "@/lib/tenant";

declare module "next-auth" {
  interface Session {
    user: { id: string; email: string; name?: string | null; image?: string | null; isSuperAdmin: boolean };
  }
}

export const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Can this email sign in on this host? Prevents open sign-ups: users must be invited to a tenant. */
export async function canSignIn(email: string, host: string) {
  const ctx = await resolveHost(host);
  const user = await ownerDb.query.users.findFirst({ where: eq(schema.users.email, email.toLowerCase()) });
  const isSuper = !!user?.isSuperAdmin || superAdminEmails.includes(email.toLowerCase());
  if (ctx.kind === "platform") return isSuper;
  if (ctx.kind !== "tenant") return false;
  if (isSuper) return true;
  if (!user || ctx.tenant.status !== "active") return false;
  const m = await ownerDb.query.memberships.findFirst({
    where: and(eq(schema.memberships.tenantId, ctx.tenant.id), eq(schema.memberships.userId, user.id)),
  });
  return !!m;
}

const providers: NextAuthConfig["providers"] = [
  Resend({
    apiKey: process.env.RESEND_API_KEY || "unused-in-dev",
    from: process.env.EMAIL_FROM_ADDRESS,
    async sendVerificationRequest({ identifier, url }) {
      const ctx = await resolveHost(normalizeHost(new URL(url).host));
      const tenant = ctx.kind === "tenant" ? ctx.tenant : null;
      const origin = new URL(url).origin;
      await sendEmail({
        tenant,
        to: identifier,
        subject: `Sign in to ${tenant?.name ?? process.env.PLATFORM_NAME ?? "your CRM"}`,
        html: brandedHtml(tenant, {
          heading: "Your sign-in link",
          body: `<p>Click the button below to sign in as <strong>${escapeHtml(identifier)}</strong>. The link expires in 24 hours and can only be used once.</p><p>If you didn't request this, you can ignore this email.</p>`,
          cta: { label: "Sign in", url },
          logoUrl: tenant?.logo ? `${origin}/api/brand/logo` : undefined,
        }),
      });
    },
  }),
];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  // Linking is safe: Google verifies email ownership, and users must already be invited.
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}
export const googleEnabled = providers.length > 1;

async function currentHost(req?: Request) {
  const h = req?.headers ?? (await headers());
  return normalizeHost(h.get("x-forwarded-host") ?? h.get("host"));
}

export const { handlers, auth, signIn, signOut } = NextAuth((req) => {
  return {
    adapter: DrizzleAdapter(ownerDb, {
      usersTable: schema.users,
      accountsTable: schema.accounts,
      sessionsTable: schema.sessions,
      verificationTokensTable: schema.verificationTokens,
    }),
    trustHost: true,
    session: { strategy: "database", maxAge: 30 * 24 * 3600 },
    providers,
    pages: { signIn: "/login", verifyRequest: "/login/check-email", error: "/login" },
    callbacks: {
      // Keep users on the host (tenant subdomain / custom domain) they signed in from.
      async redirect({ url }) {
        const host = await currentHost(req);
        const h = req?.headers ?? (await headers());
        const proto = h.get("x-forwarded-proto") ?? (/localhost|\.test(:|$)/.test(host) ? "http" : "https");
        const origin = `${proto}://${host}`;
        if (url.startsWith("/")) return `${origin}${url}`;
        try {
          if (new URL(url).host === host) return url;
        } catch {}
        return origin;
      },
      async signIn({ user, profile }) {
        const email = (user.email ?? profile?.email ?? "").toLowerCase();
        const host = await currentHost(req);
        if (!email || !host) return false;
        return (await canSignIn(email, host)) ? true : "/login?error=AccessDenied";
      },
      async session({ session, user }) {
        const u = user as typeof user & { isSuperAdmin?: boolean };
        session.user.id = user.id;
        session.user.isSuperAdmin = !!u.isSuperAdmin || superAdminEmails.includes(user.email.toLowerCase());
        return session;
      },
    },
    events: {
      async createUser({ user }) {
        if (user.email && superAdminEmails.includes(user.email.toLowerCase())) {
          await ownerDb.update(schema.users).set({ isSuperAdmin: true }).where(eq(schema.users.id, user.id!));
        }
      },
    },
  };
});
