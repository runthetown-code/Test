import Link from "next/link";
import { redirect } from "next/navigation";
import { getHostContext, PLATFORM_NAME } from "@/lib/tenant";

export default async function Home() {
  const ctx = await getHostContext();
  if (ctx.kind === "tenant") redirect("/dashboard");
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
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4">
      <div aria-hidden className="absolute -top-40 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative max-w-xl text-center">
        <span className="badge bg-brand-soft text-brand-strong ring-1 ring-brand/20">White-label CRM platform</span>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{PLATFORM_NAME}</h1>
        <p className="mt-4 text-lg text-zinc-600">
          One codebase, many branded CRMs. Each client gets their own logo, colors, domain and fully isolated data.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/admin" className="btn-primary px-5 py-2.5">
            Platform admin
          </Link>
        </div>
      </div>
    </main>
  );
}
