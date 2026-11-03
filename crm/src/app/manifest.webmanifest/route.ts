import { getHostContext, PLATFORM_NAME } from "@/lib/tenant";
import { safeColor } from "@/lib/theme";

/** Per-tenant PWA manifest so "Add to Home Screen" shows the client's name, icon and color. */
export async function GET() {
  const ctx = await getHostContext();
  const t = ctx.kind === "tenant" ? ctx.tenant : null;
  return Response.json(
    {
      name: t?.name ?? PLATFORM_NAME,
      short_name: (t?.name ?? PLATFORM_NAME).slice(0, 12),
      start_url: t ? "/dashboard" : "/",
      display: "standalone",
      background_color: "#fafafa",
      theme_color: safeColor(t?.primaryColor, "#4f46e5"),
      icons: [{ src: "/api/brand/favicon", sizes: "any", purpose: "any" }],
    },
    { headers: { "content-type": "application/manifest+json" } },
  );
}
