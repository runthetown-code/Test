import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getAppContext, hasRole } from "@/lib/access";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { role } = await getAppContext();
  if (!hasRole(role, "admin")) redirect("/dashboard");
  return (
    <>
      <PageHeader title="Settings" description="Make this CRM your own: branding, pipeline, fields, team and domains." />
      <SettingsTabs />
      <div className="mt-6">{children}</div>
    </>
  );
}
