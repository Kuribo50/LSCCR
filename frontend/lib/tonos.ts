// Tonos semánticos compartidos para badges (estado, prioridad...): pills con
// punto de color y soporte dark-mode.
export type Tono = "amber" | "orange" | "green" | "red" | "slate" | "blue";

export const TONO_CHIP: Record<Tono, string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200",
  orange: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-200",
  green: "border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-200",
  red: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200",
  slate: "border-slate-200 bg-slate-100 text-slate-600 dark:border-[#2a2a2a] dark:bg-[#202020] dark:text-slate-300",
  blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200",
};

export const TONO_DOT: Record<Tono, string> = {
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  green: "bg-green-500",
  red: "bg-red-500",
  slate: "bg-slate-400",
  blue: "bg-blue-500",
};
