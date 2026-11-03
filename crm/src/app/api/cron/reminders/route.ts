import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { ownerDb, schema, withTenant } from "@/db";
import { brandedHtml, escapeHtml, sendEmail } from "@/lib/email";
import { tenantBaseUrl } from "@/lib/tenant";

/**
 * Daily digest: emails each assignee their due-today and overdue tasks, branded per tenant.
 * Scheduled by vercel.json; protected by CRON_SECRET (Vercel sends it as a Bearer token).
 */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const endOfDay = new Date();
  endOfDay.setUTCHours(23, 59, 59, 999);
  const tenants = await ownerDb.query.tenants.findMany({ where: eq(schema.tenants.status, "active") });
  let sent = 0;

  for (const tenant of tenants) {
    const tasks = await withTenant(tenant.id, (tx) =>
      tx
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.done, false), lte(schema.tasks.dueAt, endOfDay), isNull(schema.tasks.remindedAt)))
        .orderBy(asc(schema.tasks.dueAt)),
    );
    const byAssignee = Map.groupBy(tasks.filter((t) => t.assigneeId), (t) => t.assigneeId!);
    const base = await tenantBaseUrl(tenant);

    for (const [userId, list] of byAssignee) {
      const user = await ownerDb.query.users.findFirst({ where: eq(schema.users.id, userId) });
      if (!user) continue;
      const items = list
        .map((t) => `<li style="margin:6px 0">${escapeHtml(t.title)} <span style="color:#a1a1aa">— ${t.dueAt!.toUTCString().slice(0, 16)}</span></li>`)
        .join("");
      await sendEmail({
        tenant,
        to: user.email,
        subject: `${list.length} task${list.length === 1 ? "" : "s"} due today — ${tenant.name}`,
        html: brandedHtml(tenant, {
          heading: `You have ${list.length} task${list.length === 1 ? "" : "s"} due`,
          body: `<ul style="padding-left:18px">${items}</ul>`,
          cta: { label: "Open tasks", url: `${base}/tasks?f=today` },
          logoUrl: tenant.logo ? `${base}/api/brand/logo` : undefined,
        }),
      });
      await withTenant(tenant.id, async (tx) => {
        for (const t of list) await tx.update(schema.tasks).set({ remindedAt: new Date() }).where(eq(schema.tasks.id, t.id));
      });
      sent++;
    }
  }
  return Response.json({ ok: true, emails: sent });
}
