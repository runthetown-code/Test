import type { Tenant } from "@/db/schema";

const HEX = /^#([0-9a-f]{6})$/i;

export function safeColor(c: string | null | undefined, fallback: string) {
  return c && HEX.test(c) ? c : fallback;
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Black or white, whichever reads better on the given background. */
export function contrastText(hex: string) {
  return luminance(hex) > 0.4 ? "#111827" : "#ffffff";
}

/** CSS custom properties that re-skin the whole UI for a tenant. */
export function themeCss(t: Pick<Tenant, "primaryColor" | "accentColor"> | null) {
  const brand = safeColor(t?.primaryColor, "#4f46e5");
  const accent = safeColor(t?.accentColor, "#0ea5e9");
  return `:root{--brand:${brand};--brand-fg:${contrastText(brand)};--accent:${accent};--accent-fg:${contrastText(accent)};}`;
}
