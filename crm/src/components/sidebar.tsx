"use client";

import {
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  SquareCheck,
  SquareKanban,
  Upload,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/pipeline", label: "Pipeline", icon: SquareKanban },
  { href: "/tasks", label: "Tasks", icon: SquareCheck },
  { href: "/import", label: "Import", icon: Upload },
];

export function Sidebar({
  brand,
  user,
  role,
  canSettings,
  openTasks,
  signOutAction,
}: {
  brand: React.ReactNode;
  user: { name: string; email: string; initials: string };
  role: string;
  canSettings: boolean;
  openTasks: number;
  signOutAction: () => Promise<void>;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  const items = canSettings ? [...NAV, { href: "/settings", label: "Settings", icon: Settings }] : NAV;

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
      {items.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-brand-soft text-brand-strong" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <Icon className={`size-[18px] ${active ? "text-brand" : "text-zinc-400 group-hover:text-zinc-600"}`} />
            {label}
            {href === "/tasks" && openTasks > 0 && (
              <span className="ml-auto rounded-full bg-zinc-100 px-1.5 text-[11px] font-semibold tabular-nums text-zinc-600">
                {openTasks}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-zinc-200 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-muted text-xs font-semibold text-brand-strong">
          {user.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs capitalize text-zinc-500">{role}</div>
        </div>
        <form action={signOutAction}>
          <button className="btn-ghost p-2" title="Sign out" aria-label="Sign out">
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex h-16 items-center px-6">
          <Link href="/dashboard">{brand}</Link>
        </div>
        {nav}
        {footer}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <Link href="/dashboard">{brand}</Link>
        <button className="btn-ghost p-2" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-zinc-900/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between px-4">
              {brand}
              <button className="btn-ghost p-2" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}
    </>
  );
}
