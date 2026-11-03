"use client";

import { useActionState, useState } from "react";
import { saveBranding, type ActionState } from "@/actions/settings";
import { SubmitButton } from "@/components/client";

type Props = {
  name: string;
  primaryColor: string;
  accentColor: string;
  loginHeadline: string;
  loginSubtext: string;
  emailFromName: string;
  emailReplyTo: string;
  hasLogo: boolean;
  hasFavicon: boolean;
  version: string;
};

const PRESETS = ["#4f46e5", "#0f766e", "#be123c", "#c2410c", "#1d4ed8", "#7c3aed", "#111827", "#15803d"];

function contrast(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111827" : "#ffffff";
}

function ColorInput({ name, value, onChange, label }: { name: string; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-10 shrink-0 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1" aria-label={label} />
        <input name={name} value={value} onChange={(e) => onChange(e.target.value)} pattern="#[0-9a-fA-F]{6}" className="input font-mono uppercase" />
      </div>
    </div>
  );
}

export function BrandingEditor(p: Props) {
  const [state, action] = useActionState<ActionState, FormData>(saveBranding, null);
  const [name, setName] = useState(p.name);
  const [primary, setPrimary] = useState(p.primaryColor);
  const [accent, setAccent] = useState(p.accentColor);
  const [headline, setHeadline] = useState(p.loginHeadline);
  const [logoPreview, setLogoPreview] = useState<string | null>(p.hasLogo ? `/api/brand/logo?v=${p.version}` : null);
  const valid = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c);
  const pc = valid(primary) ? primary : "#4f46e5";
  const ac = valid(accent) ? accent : "#0ea5e9";

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <form action={action} className="space-y-6">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Identity</h2>
          <p className="mb-4 text-xs text-zinc-500">Shown in the sidebar, browser tab, login page and emails.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="label">App name</span>
              <input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} className="input" />
            </label>
            <div>
              <span className="label">Logo (PNG, SVG, JPG · max 256 KB)</span>
              <input
                name="logoFile"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setLogoPreview(URL.createObjectURL(f));
                }}
              />
              {p.hasLogo && (
                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                  <input type="checkbox" name="removeLogo" onChange={(e) => e.target.checked && setLogoPreview(null)} /> Remove current logo
                </label>
              )}
            </div>
            <div>
              <span className="label">Favicon / app icon (square)</span>
              <input
                name="faviconFile"
                type="file"
                accept="image/png,image/svg+xml,image/x-icon,image/webp"
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium"
              />
              {p.hasFavicon && (
                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                  <input type="checkbox" name="removeFavicon" /> Remove current favicon
                </label>
              )}
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Colors</h2>
          <p className="mb-4 text-xs text-zinc-500">The primary color drives buttons, highlights and charts. Text color adjusts automatically for contrast.</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setPrimary(c)}
                className={`size-8 rounded-full ring-offset-2 transition ${primary === c ? "ring-2 ring-zinc-900" : "hover:scale-110"}`}
                style={{ background: c }}
                aria-label={`Use ${c}`}
              />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorInput name="primaryColor" label="Primary" value={primary} onChange={setPrimary} />
            <ColorInput name="accentColor" label="Accent" value={accent} onChange={setAccent} />
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Login page</h2>
          <p className="mb-4 text-xs text-zinc-500">What your team sees before signing in.</p>
          <div className="grid gap-4">
            <label className="block">
              <span className="label">Headline</span>
              <input name="loginHeadline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120} placeholder={`Welcome to ${name}`} className="input" />
            </label>
            <label className="block">
              <span className="label">Subtext</span>
              <input name="loginSubtext" defaultValue={p.loginSubtext} maxLength={240} className="input" />
            </label>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Outbound email</h2>
          <p className="mb-4 text-xs text-zinc-500">Sign-in links, invites and reminders are sent under this name.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Sender name</span>
              <input name="emailFromName" defaultValue={p.emailFromName} placeholder={name} maxLength={60} className="input" />
            </label>
            <label className="block">
              <span className="label">Reply-to address</span>
              <input name="emailReplyTo" type="email" defaultValue={p.emailReplyTo} placeholder="support@yourbrand.com" className="input" />
            </label>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <SubmitButton>Save branding</SubmitButton>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state?.ok && <p className="text-sm text-emerald-700">✓ {state.ok}</p>}
        </div>
      </form>

      <aside className="xl:sticky xl:top-8 xl:self-start">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Live preview</div>
        <div className="card mt-2 overflow-hidden">
          <div className="flex h-56">
            <div className="flex w-36 flex-col gap-1 border-r border-zinc-200 bg-white p-3">
              <div className="mb-2 flex items-center gap-2">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="" className="h-6 max-w-full object-contain" />
                ) : (
                  <>
                    <span className="grid size-6 place-items-center rounded-md text-xs font-bold" style={{ background: pc, color: contrast(pc) }}>
                      {name.trim()[0]?.toUpperCase()}
                    </span>
                    <span className="truncate text-xs font-semibold">{name}</span>
                  </>
                )}
              </div>
              {["Dashboard", "Contacts", "Pipeline", "Tasks"].map((l, i) => (
                <div
                  key={l}
                  className="rounded-md px-2 py-1 text-[11px] font-medium"
                  style={i === 2 ? { background: `color-mix(in oklab, ${pc} 10%, white)`, color: `color-mix(in oklab, ${pc} 82%, black)` } : { color: "#52525b" }}
                >
                  {l}
                </div>
              ))}
            </div>
            <div className="flex-1 bg-zinc-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Pipeline</span>
                <span className="rounded-md px-2 py-1 text-[10px] font-medium" style={{ background: pc, color: contrast(pc) }}>
                  + New deal
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {[80, 55, 35].map((w) => (
                  <div key={w} className="rounded-md border border-zinc-200 bg-white p-2">
                    <div className="h-1.5 w-16 rounded bg-zinc-200" />
                    <div className="mt-2 h-1.5 rounded-full bg-zinc-100">
                      <div className="h-1.5 rounded-full" style={{ width: `${w}%`, background: pc }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden p-5" style={{ background: pc, color: contrast(pc) }}>
            <div className="absolute -right-10 -top-10 size-40 rounded-full opacity-30" style={{ background: `radial-gradient(circle, ${ac}, transparent 65%)` }} />
            <div className="relative text-[10px] opacity-80">Login page</div>
            <div className="relative mt-1 text-base font-semibold leading-snug">{headline || `Welcome to ${name}`}</div>
          </div>
        </div>
      </aside>
    </div>
  );
}
