import "server-only";
import { resolveCname, resolve4 } from "node:dns/promises";

const CNAME_TARGET = (process.env.CNAME_TARGET ?? "cname.vercel-dns.com").toLowerCase();
const VERCEL = process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID;

function vercelUrl(path: string) {
  const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
  return `https://api.vercel.com${path}${team}`;
}
const vercelHeaders = () => ({ Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, "Content-Type": "application/json" });

/** Registers the domain with the hosting project so it gets routed and issued a TLS certificate. */
export async function addDomainToHosting(hostname: string) {
  if (!VERCEL) return; // manual setup: add the domain in your hosting dashboard
  const res = await fetch(vercelUrl(`/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains`), {
    method: "POST",
    headers: vercelHeaders(),
    body: JSON.stringify({ name: hostname }),
  });
  if (!res.ok && res.status !== 409) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Hosting provider rejected the domain: ${body?.error?.message ?? res.status}`);
  }
}

/** True when the domain points at the platform (Vercel's view if configured, else a DNS lookup). */
export async function checkDomain(hostname: string): Promise<boolean> {
  if (VERCEL) {
    const res = await fetch(vercelUrl(`/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${hostname}`), { headers: vercelHeaders() });
    if (!res.ok) return false;
    const body = await res.json();
    if (!body.verified) return false;
    const cfg = await fetch(vercelUrl(`/v6/domains/${hostname}/config`), { headers: vercelHeaders() }).then((r) => r.json());
    return cfg.misconfigured === false;
  }
  try {
    const cnames = await resolveCname(hostname);
    if (cnames.some((c) => c.toLowerCase().replace(/\.$/, "") === CNAME_TARGET)) return true;
  } catch {}
  try {
    const [mine, theirs] = await Promise.all([resolve4(CNAME_TARGET), resolve4(hostname)]);
    return theirs.some((ip) => mine.includes(ip));
  } catch {
    return false;
  }
}

export { CNAME_TARGET };
