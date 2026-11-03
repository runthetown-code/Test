import type { Company, Contact, CustomFieldDef, Deal, Stage } from "@/db/schema";
import { LIFECYCLES } from "@/db/schema";
import { Field } from "./ui";

type Member = { id: string; name: string | null; email: string };

export function CustomFieldInputs({ defs, values }: { defs: CustomFieldDef[]; values?: Record<string, string> }) {
  if (!defs.length) return null;
  return (
    <>
      {defs.map((d) => {
        const name = `cf_${d.key}`;
        const v = values?.[d.key] ?? "";
        return (
          <Field key={d.id} label={d.label}>
            {d.type === "select" ? (
              <select name={name} defaultValue={v} className="input">
                <option value="">—</option>
                {d.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input name={name} defaultValue={v} type={d.type === "number" ? "number" : d.type === "date" ? "date" : "text"} className="input" />
            )}
          </Field>
        );
      })}
    </>
  );
}

export function MemberSelect({ name, members, value, emptyLabel }: { name: string; members: Member[]; value?: string | null; emptyLabel?: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} className="input">
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name || m.email}
        </option>
      ))}
    </select>
  );
}

export function ContactFields({
  contact,
  companies,
  members,
  defs,
}: {
  contact?: Contact;
  companies: Pick<Company, "id" | "name">[];
  members: Member[];
  defs: CustomFieldDef[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="First name *">
        <input name="firstName" required defaultValue={contact?.firstName} className="input" />
      </Field>
      <Field label="Last name">
        <input name="lastName" defaultValue={contact?.lastName ?? ""} className="input" />
      </Field>
      <Field label="Email">
        <input name="email" type="email" defaultValue={contact?.email ?? ""} className="input" />
      </Field>
      <Field label="Phone">
        <input name="phone" defaultValue={contact?.phone ?? ""} className="input" />
      </Field>
      <Field label="Job title">
        <input name="title" defaultValue={contact?.title ?? ""} className="input" />
      </Field>
      <Field label="Company">
        <select name="companyId" defaultValue={contact?.companyId ?? ""} className="input">
          <option value="">No company</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Lifecycle stage">
        <select name="lifecycle" defaultValue={contact?.lifecycle ?? "lead"} className="input capitalize">
          {LIFECYCLES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Lead source">
        <input name="source" list="sources" defaultValue={contact?.source ?? ""} className="input" />
        <datalist id="sources">
          {["Website", "Referral", "LinkedIn", "Google Ads", "Event", "Cold outreach"].map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <Field label="Owner">
        <MemberSelect name="ownerId" members={members} value={contact?.ownerId} />
      </Field>
      <Field label="Tags (comma separated)">
        <input name="tags" defaultValue={contact?.tags.join(", ") ?? ""} className="input" placeholder="vip, newsletter" />
      </Field>
      <CustomFieldInputs defs={defs} values={contact?.customFields} />
    </div>
  );
}

export function CompanyFields({ company, defs }: { company?: Company; defs: CustomFieldDef[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name *" className="sm:col-span-2">
        <input name="name" required defaultValue={company?.name} className="input" />
      </Field>
      <Field label="Website domain">
        <input name="domain" defaultValue={company?.domain ?? ""} className="input" placeholder="example.com" />
      </Field>
      <Field label="Industry">
        <input name="industry" defaultValue={company?.industry ?? ""} className="input" />
      </Field>
      <Field label="Phone">
        <input name="phone" defaultValue={company?.phone ?? ""} className="input" />
      </Field>
      <Field label="Tags (comma separated)">
        <input name="tags" defaultValue={company?.tags.join(", ") ?? ""} className="input" />
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <input name="address" defaultValue={company?.address ?? ""} className="input" />
      </Field>
      <CustomFieldInputs defs={defs} values={company?.customFields} />
    </div>
  );
}

export function DealFields({
  deal,
  stages,
  contacts,
  companies,
  members,
  defs,
  defaults,
}: {
  deal?: Deal;
  stages: Stage[];
  contacts: { id: string; name: string }[];
  companies: Pick<Company, "id" | "name">[];
  members: Member[];
  defs: CustomFieldDef[];
  defaults?: { contactId?: string; companyId?: string; stageId?: string };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Deal title *" className="sm:col-span-2">
        <input name="title" required defaultValue={deal?.title} className="input" />
      </Field>
      <Field label="Value (USD)">
        <input name="value" type="number" min="0" step="1" defaultValue={deal ? deal.valueCents / 100 : ""} className="input" />
      </Field>
      <Field label="Stage">
        <select name="stageId" defaultValue={deal?.stageId ?? defaults?.stageId ?? stages[0]?.id} className="input">
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Contact">
        <select name="contactId" defaultValue={deal?.contactId ?? defaults?.contactId ?? ""} className="input">
          <option value="">None</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Company">
        <select name="companyId" defaultValue={deal?.companyId ?? defaults?.companyId ?? ""} className="input">
          <option value="">None / from contact</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Expected close">
        <input name="expectedClose" type="date" defaultValue={deal?.expectedClose ?? ""} className="input" />
      </Field>
      <Field label="Owner">
        <MemberSelect name="ownerId" members={members} value={deal?.ownerId} />
      </Field>
      <CustomFieldInputs defs={defs} values={deal?.customFields} />
    </div>
  );
}

export function TaskFields({
  members,
  hidden,
  defaultAssignee,
}: {
  members: Member[];
  hidden?: Record<string, string | null | undefined>;
  defaultAssignee?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Object.entries(hidden ?? {}).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <Field label="Task *" className="sm:col-span-2">
        <input name="title" required className="input" placeholder="Follow up about the proposal" />
      </Field>
      <Field label="Due">
        <input name="dueAt" type="datetime-local" className="input" />
      </Field>
      <Field label="Assignee">
        <MemberSelect name="assigneeId" members={members} value={defaultAssignee} />
      </Field>
    </div>
  );
}
