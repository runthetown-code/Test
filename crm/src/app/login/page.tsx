import { redirect } from "next/navigation";
import { auth, googleEnabled, signIn } from "@/auth";
import { BrandMark } from "@/components/brand";
import { emailDeliveryEnabled } from "@/lib/email";
import { getHostContext, PLATFORM_NAME } from "@/lib/tenant";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  AccessDenied: "That email doesn't have access to this workspace. Ask an admin to invite you.",
  Verification: "That sign-in link has expired or was already used. Request a new one.",
  Default: "Something went wrong signing in. Please try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const ctx = await getHostContext();
  const session = await auth();
  const tenant = ctx.kind === "tenant" ? ctx.tenant : null;
  const home = ctx.kind === "platform" ? "/admin" : "/dashboard";
  if (session?.user && !error) redirect(home);

  if (ctx.kind === "unknown") {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold">Workspace not found</h1>
          <p className="mt-1 text-sm text-zinc-500">No CRM is configured for {ctx.host}.</p>
        </div>
      </main>
    );
  }

  async function emailSignIn(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    await signIn("resend", { email, redirectTo: home });
  }
  async function googleSignIn() {
    "use server";
    await signIn("google", { redirectTo: home });
  }

  const headline = tenant?.loginHeadline || (tenant ? `Welcome to ${tenant.name}` : `${PLATFORM_NAME} — Platform admin`);
  const subtext =
    tenant?.loginSubtext ||
    (tenant ? "Sign in to manage your contacts, pipeline and tasks." : "Manage client workspaces, branding and usage.");

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand p-12 text-brand-fg lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="absolute -right-32 -top-32 size-[520px] rounded-full opacity-25"
          style={{ background: "radial-gradient(circle, var(--accent), transparent 65%)" }}
        />
        <div
          aria-hidden
          className="absolute -bottom-40 -left-24 size-[460px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, white, transparent 60%)" }}
        />
        <div className="relative text-sm font-medium opacity-90">{tenant?.name ?? PLATFORM_NAME}</div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">{headline}</h2>
          <p className="mt-4 text-lg opacity-85">{subtext}</p>
        </div>
        <div className="relative text-xs opacity-70">Secure sign-in · no passwords to remember</div>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <BrandMark tenant={tenant ?? { name: PLATFORM_NAME, logo: null }} size="lg" />
          <h1 className="mt-8 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-zinc-500 lg:hidden">{subtext}</p>
          <p className="mt-1 hidden text-sm text-zinc-500 lg:block">We&apos;ll email you a secure sign-in link.</p>

          {error && (
            <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {ERRORS[error] ?? ERRORS.Default}
            </div>
          )}

          {googleEnabled && (
            <>
              <form action={googleSignIn} className="mt-6">
                <button className="btn-secondary w-full py-2.5">
                  <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                    <path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z" />
                    <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
                    <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
                    <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
                  </svg>
                  Continue with Google
                </button>
              </form>
              <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
                <span className="h-px flex-1 bg-zinc-200" /> or <span className="h-px flex-1 bg-zinc-200" />
              </div>
            </>
          )}

          <form action={emailSignIn} className={googleEnabled ? "" : "mt-6"}>
            <label htmlFor="email" className="label">
              Work email
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" className="input py-2.5" />
            <button className="btn-primary mt-3 w-full py-2.5">Email me a sign-in link</button>
          </form>

          {!emailDeliveryEnabled && (
            <p className="mt-6 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Development mode: emails aren&apos;t sent. Open{" "}
              <a href="/dev/inbox" className="font-medium underline">
                the dev inbox
              </a>{" "}
              to click your sign-in link.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
