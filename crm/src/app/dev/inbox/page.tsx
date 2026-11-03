import { desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ownerDb, schema } from "@/db";
import { emailDeliveryEnabled } from "@/lib/email";
import { relTime } from "@/lib/format";
import { getHostContext } from "@/lib/tenant";

export const metadata = { title: "Dev inbox" };
export const dynamic = "force-dynamic";

/** Development-only: shows emails that would have been sent (no RESEND_API_KEY configured). */
export default async function DevInbox() {
  if (emailDeliveryEnabled || process.env.NODE_ENV === "production") notFound();
  const ctx = await getHostContext();
  const where =
    ctx.kind === "tenant" ? eq(schema.emailLog.tenantId, ctx.tenant.id) : isNull(schema.emailLog.tenantId);
  const emails = await ownerDb.select().from(schema.emailLog).where(where).orderBy(desc(schema.emailLog.createdAt)).limit(15);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="page-title">Dev inbox</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Emails for <strong>{ctx.host}</strong> are logged here instead of sent, because RESEND_API_KEY is empty.
      </p>
      <div className="mt-6 space-y-4">
        {emails.length === 0 && <p className="card p-6 text-sm text-zinc-500">No emails yet.</p>}
        {emails.map((e) => (
          <article key={e.id} className="card overflow-hidden">
            <header className="border-b border-zinc-100 px-4 py-3 text-sm">
              <div className="font-medium">{e.subject}</div>
              <div className="text-xs text-zinc-500">
                to {e.to} · from {e.from} · {relTime(e.createdAt)}
              </div>
            </header>
            <iframe title={e.subject} srcDoc={`<base target="_top">${e.html}`} sandbox="allow-top-navigation-by-user-activation allow-popups" className="h-[380px] w-full" />
          </article>
        ))}
      </div>
    </main>
  );
}
