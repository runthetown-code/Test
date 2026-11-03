import { and, count, eq } from "drizzle-orm";
import { ShieldAlert } from "lucide-react";
import { signOut } from "@/auth";
import { schema } from "@/db";
import { BrandMark } from "@/components/brand";
import { Sidebar } from "@/components/sidebar";
import { getAppContext, hasRole } from "@/lib/access";
import { initials } from "@/lib/format";
import { platformUrl } from "@/lib/tenant";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { tenant, user, role, supportMode, db } = await getAppContext();
  const [{ n: openTasks }] = await db((tx) =>
    tx
      .select({ n: count() })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.done, false), eq(schema.tasks.assigneeId, user.id))),
  );

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar
        brand={<BrandMark tenant={tenant} size="sm" />}
        user={{ name: user.name || user.email, email: user.email, initials: initials(user.name || user.email) }}
        role={supportMode ? "support access" : role}
        canSettings={hasRole(role, "admin")}
        openTasks={openTasks}
        signOutAction={signOutAction}
      />
      <div className="min-w-0 flex-1">
        {supportMode && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2 text-sm text-amber-900 sm:px-8">
            <ShieldAlert className="size-4" />
            <span>
              Support access: you&apos;re viewing <strong>{tenant.name}</strong> as a platform admin. Actions are logged.
            </span>
            <a href={platformUrl("/admin")} className="font-medium underline sm:ml-auto">
              Back to admin console
            </a>
          </div>
        )}
        {tenant.status === "suspended" && (
          <div className="bg-red-100 px-4 py-2 text-sm text-red-800 sm:px-8">
            This workspace is suspended. Only platform admins can access it.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
