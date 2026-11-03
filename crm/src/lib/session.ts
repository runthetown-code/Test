import "server-only";
import { randomBytes } from "node:crypto";
import { ownerDb, schema } from "@/db";

/** Creates an Auth.js database session for `userId` and returns the Set-Cookie pieces for it. */
export async function createSession(userId: string, opts: { secure: boolean; hours?: number }) {
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + (opts.hours ?? 24 * 30) * 3600_000);
  await ownerDb.insert(schema.sessions).values({ sessionToken, userId, expires });
  return {
    name: `${opts.secure ? "__Secure-" : ""}authjs.session-token`,
    value: sessionToken,
    options: { path: "/", httpOnly: true, sameSite: "lax" as const, secure: opts.secure, expires },
  };
}
