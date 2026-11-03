import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/auth";
import { requireSuperAdmin } from "@/lib/access";
import { PLATFORM_NAME } from "@/lib/tenant";

export const metadata = { title: "Platform admin" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireSuperAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-900 text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-indigo-300" />
            <span className="truncate">{PLATFORM_NAME}</span>
            <span className="hidden rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-zinc-300 sm:inline">Admin</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-zinc-400 sm:inline">{admin.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="rounded-md px-2.5 py-1.5 text-zinc-300 hover:bg-white/10 hover:text-white">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
