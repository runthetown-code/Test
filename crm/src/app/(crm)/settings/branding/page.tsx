import { getAppContext } from "@/lib/access";
import { BrandingEditor } from "./editor";

export const metadata = { title: "Branding" };

export default async function BrandingPage() {
  const { tenant: t } = await getAppContext();
  return (
    <BrandingEditor
      name={t.name}
      primaryColor={t.primaryColor}
      accentColor={t.accentColor}
      loginHeadline={t.loginHeadline ?? ""}
      loginSubtext={t.loginSubtext ?? ""}
      emailFromName={t.emailFromName ?? ""}
      emailReplyTo={t.emailReplyTo ?? ""}
      hasLogo={!!t.logo}
      hasFavicon={!!t.favicon}
      version={String((t.logo ?? "").length)}
    />
  );
}
