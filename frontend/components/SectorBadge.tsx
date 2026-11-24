import { sectorColorClasses } from "@/lib/sectores";

// Badge de sector con punto de color. ROJO/AZUL/VERDE salen en su color; los
// sectores que no son colores (lugares, CECOSF...) salen en gris neutro.
export default function SectorBadge({
  sector,
  className = "",
}: {
  sector?: string | null;
  className?: string;
}) {
  const value = (sector ?? "").trim();
  if (!value || value === "-") {
    return <span className="text-slate-500 dark:text-slate-400">-</span>;
  }
  const { dot, chip } = sectorColorClasses(value);
  return (
    <span
      title={value}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip} ${className}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <span className="truncate">{value}</span>
    </span>
  );
}
