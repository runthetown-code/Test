"use client";

import { useActionState } from "react";
import type { ActionState } from "@/actions/settings";

/** A form bound to a server action returning {ok|error}; shows the result inline. */
export function ActionForm({
  action,
  children,
  className,
  encType,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  encType?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className} encType={encType}>
      {children}
      {state?.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="mt-3 text-sm text-emerald-700">✓ {state.ok}</p>}
    </form>
  );
}
