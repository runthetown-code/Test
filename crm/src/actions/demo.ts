"use server";

import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { canSignIn } from "@/auth";
import { ownerDb, schema } from "@/db";
import { createSession } from "@/lib/session";
import { getHost, getHostContext } from "@/lib/tenant";

export const demoMode = async () => process.env.DEMO_MODE === "true";

/** DEMO_MODE only: one-click sign-in for seeded demo accounts (emails ending in .test). */
export async function demoSignIn(email: string) {
  if (process.env.DEMO_MODE !== "true" || !email.endsWith(".test")) throw new Error("Demo sign-in is disabled");
  const host = await getHost();
  if (!(await canSignIn(email, host))) throw new Error("That demo account has no access here");
  const user = await ownerDb.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!user) throw new Error("Unknown demo account");
  const h = await headers();
  const secure = (h.get("x-forwarded-proto") ?? "http") === "https";
  const c = await createSession(user.id, { secure, hours: 12 });
  (await cookies()).set(c.name, c.value, c.options);
  const ctx = await getHostContext();
  redirect(ctx.kind === "platform" ? "/admin" : "/dashboard");
}
