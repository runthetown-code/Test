import "server-only";
import { Resend } from "resend";
import { ownerDb, schema } from "@/db";
import type { Tenant } from "@/db/schema";
import { PLATFORM_NAME } from "./tenant";
import { contrastText, safeColor } from "./theme";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
export const emailDeliveryEnabled = !!resend;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Sender identity: the tenant's verified domain if it has one, else the platform default. */
export function senderFor(tenant: Tenant | null) {
  const name = tenant?.emailFromName || tenant?.name || PLATFORM_NAME;
  const fallback = process.env.EMAIL_FROM_ADDRESS ?? "notifications@example.com";
  const address =
    tenant?.emailDomain && tenant.emailDomainVerified ? `notifications@${tenant.emailDomain}` : fallback;
  return `${name.replace(/[<>"]/g, "")} <${address}>`;
}

/** Wraps content in a simple, email-client-safe layout using the tenant's logo and color. */
export function brandedHtml(
  tenant: Tenant | null,
  opts: { heading: string; body: string; cta?: { label: string; url: string }; logoUrl?: string },
) {
  const brand = safeColor(tenant?.primaryColor, "#4f46e5");
  const name = esc(tenant?.name ?? PLATFORM_NAME);
  const logo = opts.logoUrl
    ? `<img src="${esc(opts.logoUrl)}" alt="${name}" height="36" style="height:36px;max-width:180px;display:block">`
    : `<div style="font:600 18px system-ui,sans-serif;color:${brand}">${name}</div>`;
  const cta = opts.cta
    ? `<p style="margin:28px 0"><a href="${esc(opts.cta.url)}" style="background:${brand};color:${contrastText(brand)};padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${esc(opts.cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;padding:32px 12px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#18181b">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;border-top:4px solid ${brand}"><tr><td style="padding:32px">
${logo}
<h1 style="font-size:20px;margin:24px 0 12px">${esc(opts.heading)}</h1>
<div style="font-size:15px;line-height:1.6;color:#3f3f46">${opts.body}</div>
${cta}
<p style="font-size:12px;color:#a1a1aa;margin-top:32px">Sent by ${name}</p>
</td></tr></table></body></html>`;
}

export async function sendEmail(input: {
  tenant: Tenant | null;
  to: string;
  subject: string;
  html: string;
}) {
  const from = senderFor(input.tenant);
  let status = "logged";
  let error: string | null = null;
  if (resend) {
    const res = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.tenant?.emailReplyTo ?? undefined,
    });
    status = res.error ? "failed" : "sent";
    error = res.error?.message ?? null;
  } else {
    console.log(`\n✉️  [email logged, not sent] to=${input.to} subject="${input.subject}" — view at /dev/inbox\n`);
  }
  await ownerDb.insert(schema.emailLog).values({
    tenantId: input.tenant?.id ?? null,
    to: input.to,
    from,
    subject: input.subject,
    html: input.html,
    status,
    error,
  });
  if (error) throw new Error(`Email failed: ${error}`);
}

export { esc as escapeHtml };
