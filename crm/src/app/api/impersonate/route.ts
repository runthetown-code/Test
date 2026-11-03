import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, like } from "drizzle-orm";
import { ownerDb, schema } from "@/db";
import { getHostContext } from "@/lib/tenant";

/** Exchanges a support-access token (minted in the admin console) for a session on this tenant host. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const ctx = await getHostContext();
  if (ctx.kind !== "tenant" || !/^[0-9a-f]{64}$/.test(token)) return new Response("Invalid link", { status: 400 });

  const hashed = createHash("sha256").update(token).digest("hex");
  const [row] = await ownerDb
    .delete(schema.verificationTokens)
    .where(
      and(
        eq(schema.verificationTokens.token, hashed),
        like(schema.verificationTokens.identifier, `impersonate:${ctx.tenant.id}:%`),
        gt(schema.verificationTokens.expires, new Date()),
      ),
    )
    .returning();
  if (!row) return new Response("This support link has expired. Open it again from the admin console.", { status: 403 });

  const userId = row.identifier.split(":")[2];
  const user = await ownerDb.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user?.isSuperAdmin) return new Response("Forbidden", { status: 403 });

  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 8 * 3600_000);
  await ownerDb.insert(schema.sessions).values({ sessionToken, userId, expires });

  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const secure = proto === "https";
  const cookie = `${secure ? "__Secure-" : ""}authjs.session-token=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure ? "; Secure" : ""}`;
  return new Response(null, { status: 302, headers: { Location: "/dashboard", "Set-Cookie": cookie } });
}
