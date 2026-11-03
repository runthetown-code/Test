import { asc } from "drizzle-orm";
import { addCustomField, deleteCustomField } from "@/actions/settings";
import { schema } from "@/db";
import { FIELD_ENTITIES, FIELD_TYPES } from "@/db/schema";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { getAppContext } from "@/lib/access";

export const metadata = { title: "Custom fields" };

const ENTITY_LABEL = { contact: "Contacts", company: "Companies", deal: "Deals" } as const;

export default async function FieldsSettings() {
  const { db } = await getAppContext();
  const defs = await db((tx) => tx.select().from(schema.customFieldDefs).orderBy(asc(schema.customFieldDefs.position)));

  return (
    <div className="max-w-3xl space-y-4">
      {FIELD_ENTITIES.map((entity) => {
        const list = defs.filter((d) => d.entity === entity);
        return (
          <section key={entity} className="card overflow-hidden">
            <div className="border-b border-zinc-100 px-5 py-3">
              <h2 className="text-sm font-semibold">{ENTITY_LABEL[entity]}</h2>
            </div>
            {list.length === 0 ? (
              <p className="px-5 py-4 text-sm text-zinc-400">No custom fields.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {list.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div>
                      <span className="font-medium">{d.label}</span>
                      <span className="ml-2 badge bg-zinc-100 text-zinc-600">{d.type}</span>
                      {d.options.length > 0 && <span className="ml-2 text-xs text-zinc-500">{d.options.join(", ")}</span>}
                    </div>
                    <form action={deleteCustomField.bind(null, d.id)}>
                      <ConfirmButton message={`Delete the "${d.label}" field? Existing values are hidden.`} className="btn-ghost btn-sm text-red-600">
                        Delete
                      </ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">Add a field</h2>
        <form action={addCustomField} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
          <label>
            <span className="label">Applies to</span>
            <select name="entity" className="input">
              {FIELD_ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {ENTITY_LABEL[e]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Label</span>
            <input name="label" required className="input" placeholder="e.g. Contract renewal date" />
          </label>
          <label>
            <span className="label">Type</span>
            <select name="type" className="input">
              {FIELD_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="label">Options (for “select”, comma separated)</span>
            <input name="options" className="input" placeholder="Bronze, Silver, Gold" />
          </label>
          <div className="flex items-end">
            <SubmitButton className="btn-primary w-full">Add field</SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
