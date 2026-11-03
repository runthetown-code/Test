import { MailCheck } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { emailDeliveryEnabled } from "@/lib/email";
import { getHostContext } from "@/lib/tenant";

export const metadata = { title: "Check your email" };

export default async function CheckEmail() {
  const ctx = await getHostContext();
  const tenant = ctx.kind === "tenant" ? ctx.tenant : null;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="flex justify-center">
          <BrandMark tenant={tenant} showName={false} />
        </div>
        <div className="mx-auto mt-6 grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
          <MailCheck className="size-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Check your email</h1>
        <p className="mt-1 text-sm text-zinc-500">We sent you a sign-in link. It expires in 24 hours.</p>
        {!emailDeliveryEnabled && (
          <Link href="/dev/inbox" className="btn-primary mt-6 w-full">
            Open dev inbox
          </Link>
        )}
        <Link href="/login" className="btn-ghost mt-2 w-full">
          Use a different email
        </Link>
      </div>
    </main>
  );
}
