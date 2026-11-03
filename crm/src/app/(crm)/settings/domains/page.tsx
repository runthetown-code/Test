import { eq } from "drizzle-orm";
import { CheckCircle2, Clock } from "lucide-react";
import { addDomain, removeDomain, saveEmailDomain, sendTestEmail, verifyDomain } from "@/actions/settings";
import { ownerDb, schema } from "@/db";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { getAppContext } from "@/lib/access";
import { CNAME_TARGET } from "@/lib/domains";
import { senderFor } from "@/lib/email";
import { tenantUrl } from "@/lib/tenant";

export const metadata = { title: "Domain & email" };

export default async function DomainSettings() {
  const { tenant } = await getAppContext();
  const domains = await ownerDb.query.domains.findMany({ where: eq(schema.domains.tenantId, tenant.id) });
  const defaultUrl = tenantUrl(tenant.slug);

  return (
    <div className="max-w-3xl space-y-4">
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Web address</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Your CRM is always available at{" "}
          <a href={defaultUrl} className="font-medium text-brand hover:underline">
            {defaultUrl.replace(/^https?:\/\//, "")}
          </a>
          . Add your own domain so your team and clients only ever see your brand.
        </p>

        {domains.length > 0 && (
          <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {domains.map((d) => (
              <li key={d.id} className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  {d.verified ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Clock className="size-5 text-amber-500" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{d.hostname}</div>
                    <div className="text-xs text-zinc-500">{d.verified ? "Connected" : "Waiting for DNS"}</div>
                  </div>
                  {!d.verified && (
                    <form action={verifyDomain.bind(null, d.id)}>
                      <SubmitButton className="btn-secondary btn-sm" pendingText="Checking…">
                        Check now
                      </SubmitButton>
                    </form>
                  )}
                  <form action={removeDomain.bind(null, d.id)}>
                    <ConfirmButton message={`Disconnect ${d.hostname}?`} className="btn-ghost btn-sm text-red-600">
                      Remove
                    </ConfirmButton>
                  </form>
                </div>
                {!d.verified && (
                  <div className="mt-3 overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs">
                    <p className="mb-2 text-zinc-600">Add this record at your DNS provider, then click “Check now”. Changes can take up to an hour.</p>
                    <table className="font-mono">
                      <thead className="text-left text-zinc-500">
                        <tr>
                          <th className="pr-6 font-medium">Type</th>
                          <th className="pr-6 font-medium">Name</th>
                          <th className="font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="pr-6">CNAME</td>
                          <td className="pr-6">{d.hostname.split(".")[0]}</td>
                          <td>{CNAME_TARGET}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <ActionForm action={addDomain} className="mt-4 flex flex-wrap gap-2">
          <input name="hostname" required placeholder="crm.yourbrand.com" className="input min-w-56 flex-1" aria-label="Custom domain" />
          <SubmitButton pendingText="Adding…">Add domain</SubmitButton>
        </ActionForm>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Email sending</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Emails currently go out as <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">{senderFor(tenant)}</code>.
        </p>
        <ActionForm action={saveEmailDomain} className="mt-4">
          <label className="block">
            <span className="label">Sending domain (verified with the email provider)</span>
            <div className="flex flex-wrap gap-2">
              <input name="emailDomain" defaultValue={tenant.emailDomain ?? ""} placeholder="mail.yourbrand.com" className="input min-w-56 flex-1" />
              <SubmitButton className="btn-secondary">Save</SubmitButton>
            </div>
          </label>
          {tenant.emailDomain && (
            <p className="mt-2 text-xs text-zinc-500">
              Status:{" "}
              {tenant.emailDomainVerified ? (
                <span className="font-medium text-emerald-700">verified — sending as notifications@{tenant.emailDomain}</span>
              ) : (
                <span className="font-medium text-amber-700">pending — your platform admin will send you DNS records to add</span>
              )}
            </p>
          )}
        </ActionForm>
        <ActionForm action={sendTestEmail} className="mt-4 border-t border-zinc-100 pt-4">
          <SubmitButton className="btn-secondary" pendingText="Sending…">
            Send me a test email
          </SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
