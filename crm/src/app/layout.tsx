import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getHostContext, PLATFORM_NAME } from "@/lib/tenant";
import { safeColor, themeCss } from "@/lib/theme";

export async function generateMetadata(): Promise<Metadata> {
  const ctx = await getHostContext();
  const name = ctx.kind === "tenant" ? ctx.tenant.name : PLATFORM_NAME;
  return {
    title: { default: name, template: `%s · ${name}` },
    icons: ctx.kind === "tenant" ? { icon: "/api/brand/favicon", apple: "/api/brand/favicon" } : undefined,
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const ctx = await getHostContext();
  return { themeColor: safeColor(ctx.kind === "tenant" ? ctx.tenant.primaryColor : null, "#4f46e5") };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getHostContext();
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss(ctx.kind === "tenant" ? ctx.tenant : null) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
