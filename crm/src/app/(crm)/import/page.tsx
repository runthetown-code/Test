import { asc, eq } from "drizzle-orm";
import { schema } from "@/db";
import { PageHeader } from "@/components/ui";
import { getAppContext } from "@/lib/access";
import { Importer } from "./importer";

export const metadata = { title: "Import" };

export default async function ImportPage() {
  const { db } = await getAppContext();
  const defs = await db((tx) =>
    tx.query.customFieldDefs.findMany({
      where: eq(schema.customFieldDefs.entity, "contact"),
      orderBy: asc(schema.customFieldDefs.position),
    }),
  );
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Import contacts" description="Bring contacts over from a spreadsheet or your previous CRM. Companies are created automatically." />
      <Importer customFields={defs.map((d) => ({ key: d.key, label: d.label }))} />
    </div>
  );
}
