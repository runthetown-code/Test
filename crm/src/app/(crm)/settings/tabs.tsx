"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/branding", label: "Branding" },
  { href: "/settings/pipeline", label: "Pipeline" },
  { href: "/settings/fields", label: "Custom fields" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/domains", label: "Domain & email" },
];

export function SettingsTabs() {
  const path = usePathname();
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-zinc-200 px-4 sm:mx-0 sm:px-0">
      {TABS.map((t) => {
        const active = path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
              active ? "border-brand text-brand-strong" : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
