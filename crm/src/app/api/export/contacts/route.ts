import { asc, eq } from "drizzle-orm";
import Papa from "papaparse";
import { schema } from "@/db";
import { getAppContext, memberMap } from "@/lib/access";

/** Exports all contacts of the current tenant as CSV (including custom fields). */
export async function GET() {
  const { tenant, db } = await getAppContext();
  const owners = await memberMap(tenant.id);
  const { rows, defs } = await db(async (tx) => ({
    rows: await tx
      .select({ c: schema.contacts, company: schema.companies.name })
      .from(schema.contacts)
      .leftJoin(schema.companies, eq(schema.companies.id, schema.contacts.companyId))
      .orderBy(asc(schema.contacts.createdAt)),
    defs: await tx.query.customFieldDefs.findMany({ where: eq(schema.customFieldDefs.entity, "contact") }),
  }));
  const csv = Papa.unparse(
    rows.map(({ c, company }) => ({
      "First name": c.firstName,
      "Last name": c.lastName ?? "",
      Email: c.email ?? "",
      Phone: c.phone ?? "",
      "Job title": c.title ?? "",
      Company: company ?? "",
      "Lead source": c.source ?? "",
      Lifecycle: c.lifecycle,
      Tags: c.tags.join(", "),
      Owner: owners.get(c.ownerId ?? "") ?? "",
      Created: c.createdAt.toISOString(),
      ...Object.fromEntries(defs.map((d) => [d.label, c.customFields[d.key] ?? ""])),
    })),
    { escapeFormulae: true },
  );
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${tenant.slug}-contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
