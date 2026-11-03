import type { Tenant } from "@/db/schema";

/** Tenant logo if uploaded, otherwise a monogram tile + app name. */
export function BrandMark({
  tenant,
  size = "md",
  showName = true,
}: {
  tenant: Pick<Tenant, "name" | "logo"> | null;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
}) {
  const name = tenant?.name ?? "CRM";
  const h = size === "lg" ? "h-11" : size === "sm" ? "h-7" : "h-8";
  if (tenant?.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/brand/logo?v=${tenant.logo.length}`} alt={name} className={`${h} w-auto max-w-[180px] object-contain`} />;
  }
  const box = size === "lg" ? "size-11 text-xl" : size === "sm" ? "size-7 text-sm" : "size-8 text-base";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`${box} inline-grid place-items-center rounded-lg bg-brand font-bold text-brand-fg shadow-sm`}>
        {name.trim()[0]?.toUpperCase()}
      </span>
      {showName && (
        <span className={`font-semibold tracking-tight ${size === "lg" ? "text-xl" : "text-[15px]"}`}>{name}</span>
      )}
    </span>
  );
}
