"use server";

import { eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { schema } from "@/db";
import { LIFECYCLES } from "@/db/schema";
import { getAppContext } from "@/lib/access";
import { parseTags, slugify } from "@/lib/format";
import { logActivity } from "./crm";

/** Target fields a CSV column can be mapped to. `cf:<key>` targets a custom field; `new:<label>` creates one. */
const BUILTIN = ["firstName", "lastName", "fullName", "email", "phone", "title", "company", "source", "lifecycle", "tags"] as const;

const input = z.object({
  mapping: z.record(z.string(), z.string()), // csv header -> target
  rows: z.array(z.record(z.string(), z.string())).max(5000),
  duplicates: z.enum(["skip", "update"]),
});

export type ImportResult = { created: number; updated: number; skipped: number; companies: number; errors: string[] };

export async function importContacts(raw: z.input<typeof input>): Promise<ImportResult> {
  const { user, db } = await getAppContext();
  const { mapping, rows, duplicates } = input.parse(raw);
  const targets = Object.entries(mapping).filter(([, t]) => t && t !== "ignore");
  for (const [, t] of targets) {
    if (!(BUILTIN as readonly string[]).includes(t) && !t.startsWith("cf:") && !t.startsWith("new:")) {
      throw new Error(`Unknown target field ${t}`);
    }
  }

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, companies: 0, errors: [] };

  await db(async (tx) => {
    // Create any new custom fields requested in the mapping.
    const newFieldKeys = new Map<string, string>();
    for (const [, t] of targets.filter(([, t]) => t.startsWith("new:"))) {
      const label = t.slice(4).trim().slice(0, 60) || "Imported field";
      const key = slugify(label).replace(/-/g, "_") || `field_${Date.now()}`;
      await tx
        .insert(schema.customFieldDefs)
        .values({ entity: "contact", key, label, type: "text", position: 100 })
        .onConflictDoNothing();
      newFieldKeys.set(t, key);
    }

    // Company lookup by name (case-insensitive); created on demand.
    const companyIds = new Map<string, string>();
    for (const c of await tx.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies)) {
      companyIds.set(c.name.trim().toLowerCase(), c.id);
    }
    const existingByEmail = new Map<string, string>();
    for (const c of await tx
      .select({ id: schema.contacts.id, email: schema.contacts.email })
      .from(schema.contacts)
      .where(isNotNull(schema.contacts.email))) {
      existingByEmail.set(c.email!.toLowerCase(), c.id);
    }

    for (const [i, row] of rows.entries()) {
      const rec: Record<string, string> = {};
      const custom: Record<string, string> = {};
      for (const [header, target] of targets) {
        const v = (row[header] ?? "").trim();
        if (!v) continue;
        if (target.startsWith("cf:")) custom[target.slice(3)] = v.slice(0, 500);
        else if (target.startsWith("new:")) custom[newFieldKeys.get(target)!] = v.slice(0, 500);
        else rec[target] = v;
      }
      if (rec.fullName && !rec.firstName) {
        const [first, ...rest] = rec.fullName.split(/\s+/);
        rec.firstName = first;
        rec.lastName ??= rest.join(" ");
      }
      if (!rec.firstName && rec.email) rec.firstName = rec.email.split("@")[0];
      if (!rec.firstName) {
        result.skipped++;
        if (result.errors.length < 10) result.errors.push(`Row ${i + 2}: no name or email`);
        continue;
      }
      const email = rec.email?.toLowerCase();
      if (email && !z.email().safeParse(email).success) {
        result.skipped++;
        if (result.errors.length < 10) result.errors.push(`Row ${i + 2}: invalid email "${rec.email}"`);
        continue;
      }

      let companyId: string | null = null;
      if (rec.company) {
        const key = rec.company.toLowerCase();
        companyId = companyIds.get(key) ?? null;
        if (!companyId) {
          const [c] = await tx.insert(schema.companies).values({ name: rec.company.slice(0, 200) }).returning();
          companyIds.set(key, c.id);
          companyId = c.id;
          result.companies++;
        }
      }
      const lifecycle = (LIFECYCLES as readonly string[]).includes(rec.lifecycle?.toLowerCase() ?? "")
        ? (rec.lifecycle!.toLowerCase() as (typeof LIFECYCLES)[number])
        : undefined;
      const values = {
        firstName: rec.firstName.slice(0, 100),
        lastName: rec.lastName?.slice(0, 100) || null,
        email: email ?? null,
        phone: rec.phone?.slice(0, 50) ?? null,
        title: rec.title?.slice(0, 120) ?? null,
        source: rec.source?.slice(0, 80) ?? "Import",
        companyId,
        tags: parseTags(rec.tags),
      };

      const existing = email ? existingByEmail.get(email) : undefined;
      if (existing) {
        if (duplicates === "skip") {
          result.skipped++;
          continue;
        }
        await tx
          .update(schema.contacts)
          .set({
            ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && !(Array.isArray(v) && !v.length))),
            ...(lifecycle ? { lifecycle } : {}),
            customFields: sql`${schema.contacts.customFields} || ${JSON.stringify(custom)}::jsonb`,
          })
          .where(eq(schema.contacts.id, existing));
        result.updated++;
      } else {
        const [c] = await tx
          .insert(schema.contacts)
          .values({ ...values, lifecycle: lifecycle ?? "lead", ownerId: user.id, customFields: custom })
          .returning({ id: schema.contacts.id });
        if (email) existingByEmail.set(email, c.id);
        result.created++;
      }
    }

    await logActivity(tx, {
      type: "import",
      summary: `Imported contacts from CSV: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
      actorId: user.id,
    });
  });

  revalidatePath("/", "layout");
  return result;
}
