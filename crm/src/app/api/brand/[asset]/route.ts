import { getHostContext } from "@/lib/tenant";
import { contrastText, safeColor } from "@/lib/theme";

/** Serves the current host's tenant logo / favicon. Falls back to a generated monogram. */
export async function GET(_req: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const ctx = await getHostContext();
  const t = ctx.kind === "tenant" ? ctx.tenant : null;
  const src = asset === "favicon" ? (t?.favicon ?? t?.logo) : asset === "logo" ? t?.logo : null;

  if (src?.startsWith("data:")) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src);
    if (m) {
      const body = m[2] ? Buffer.from(m[3], "base64") : decodeURIComponent(m[3]);
      return new Response(body, {
        headers: {
          "content-type": m[1],
          "cache-control": "public, max-age=60",
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
        },
      });
    }
  }
  if (src?.startsWith("https://")) return Response.redirect(src, 302);

  const color = safeColor(t?.primaryColor, "#4f46e5");
  const letter = ((t?.name ?? "C").trim()[0] ?? "C").toUpperCase().replace(/[<&>"']/g, "C");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="43" font-family="system-ui,sans-serif" font-size="32" font-weight="700" fill="${contrastText(color)}" text-anchor="middle">${letter}</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=60" } });
}
