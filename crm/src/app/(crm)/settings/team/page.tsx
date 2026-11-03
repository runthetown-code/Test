import { changeRole, inviteMember, removeMember } from "@/actions/settings";
import { ActionForm } from "@/components/action-form";
import { ConfirmButton, SubmitButton } from "@/components/client";
import { Avatar } from "@/components/ui";
import { ROLES } from "@/db/schema";
import { getAppContext, getMembers, hasRole } from "@/lib/access";
import { relTime } from "@/lib/format";

export const metadata = { title: "Team" };

const ROLE_HELP = {
  owner: "Everything, including managing owners",
  admin: "Settings, branding, team and deletes",
  member: "Work with contacts, deals and tasks",
};

export default async function TeamSettings() {
  const { tenant, user, role } = await getAppContext();
  const members = await getMembers(tenant.id);
  const isOwner = hasRole(role, "owner");

  return (
    <div className="max-w-3xl space-y-4">
      <section className="card overflow-hidden">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold">Members ({members.length})</h2>
          <p className="text-xs text-zinc-500">Only invited people can sign in to this workspace.</p>
        </div>
        <ul className="divide-y divide-zinc-100">
          {members.map((m) => {
            const editable = m.id !== user.id && (isOwner || m.role !== "owner");
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={m.name || m.email} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {m.name || m.email} {m.id === user.id && <span className="text-xs font-normal text-zinc-400">(you)</span>}
                  </div>
                  <div className="truncate text-xs text-zinc-500">
                    {m.email} · joined {relTime(m.joinedAt)}
                  </div>
                </div>
                {editable ? (
                  <>
                    <form action={changeRole.bind(null, m.id)} className="flex items-center gap-1.5">
                      <select name="role" defaultValue={m.role} className="input w-28 py-1.5 capitalize" aria-label="Role">
                        {ROLES.filter((r) => isOwner || r !== "owner").map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <SubmitButton className="btn-secondary btn-sm">Update</SubmitButton>
                    </form>
                    <form action={removeMember.bind(null, m.id)}>
                      <ConfirmButton message={`Remove ${m.email} from ${tenant.name}?`} className="btn-ghost btn-sm text-red-600">
                        Remove
                      </ConfirmButton>
                    </form>
                  </>
                ) : (
                  <span className="badge bg-zinc-100 capitalize text-zinc-700">{m.role}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Invite a teammate</h2>
        <p className="mb-4 text-xs text-zinc-500">They&apos;ll get a branded email and sign in with a magic link{process.env.AUTH_GOOGLE_ID ? " or Google" : ""}.</p>
        <ActionForm action={inviteMember} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto_auto] sm:items-end">
          <label>
            <span className="label">Email</span>
            <input name="email" type="email" required className="input" placeholder="teammate@company.com" />
          </label>
          <label>
            <span className="label">Name (optional)</span>
            <input name="name" className="input" />
          </label>
          <label>
            <span className="label">Role</span>
            <select name="role" defaultValue="member" className="input capitalize">
              {ROLES.filter((r) => isOwner || r !== "owner").map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton pendingText="Sending…">Send invite</SubmitButton>
        </ActionForm>
        <dl className="mt-5 grid gap-2 border-t border-zinc-100 pt-4 text-xs sm:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r}>
              <dt className="font-medium capitalize">{r}</dt>
              <dd className="text-zinc-500">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
