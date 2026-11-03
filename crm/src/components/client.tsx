"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "btn-primary",
  pendingText,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} className={className} disabled={pending || rest.disabled}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}

/** Modal built on <dialog>. `trigger` opens it; forms inside close it on submit. */
export function Dialog({
  trigger,
  title,
  children,
  triggerClassName = "btn-primary",
  wide,
}: {
  trigger: React.ReactNode;
  title: string;
  children: React.ReactNode;
  triggerClassName?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => ref.current?.showModal()}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-2xl" : "max-w-lg"} rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl backdrop:bg-zinc-900/40`}
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => ref.current?.close()} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="p-5" onSubmit={() => setTimeout(() => ref.current?.close(), 0)}>
          {children}
        </div>
      </dialog>
    </>
  );
}

/** Confirm before submitting a destructive form. */
export function ConfirmButton({
  children,
  message,
  className = "btn-danger",
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
}) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

/** Shows a short-lived "Saved" note after a form action resolves. */
export function useFlash() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg, setMsg] as const;
}

/** Auto-submits a GET form (search / filters) as the user types or changes a select. */
export function AutoSubmitForm({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <form
      ref={ref}
      className={className}
      onChange={(e) => {
        clearTimeout(timer.current);
        const delay = (e.target as HTMLElement).tagName === "INPUT" ? 300 : 0;
        timer.current = setTimeout(() => ref.current?.requestSubmit(), delay);
      }}
    >
      {children}
    </form>
  );
}
