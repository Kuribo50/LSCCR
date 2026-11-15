// Los sectores CESFAM suelen nombrarse por color (ROJO, AZUL, VERDE...). Este
// helper mapea cada nombre a clases de color para badges + un hex para estilar
// <option> nativos. Los sectores que no son colores (CECOSF, CESFAM, lugares)
// caen en un gris neutro.

export type SectorColor = { dot: string; chip: string; hex?: string };

const COLOR_NEUTRAL: SectorColor = {
  dot: "bg-slate-400",
  chip: "border-slate-200 bg-slate-100 text-slate-600 dark:border-[#2a2a2a] dark:bg-[#1c1c1c] dark:text-slate-300",
};

const COLORES: Record<string, SectorColor> = {
  ROJO: {
    dot: "bg-red-500",
    chip: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300",
    hex: "#dc2626",
  },
  AZUL: {
    dot: "bg-blue-500",
    chip: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300",
    hex: "#2563eb",
  },
  VERDE: {
    dot: "bg-green-500",
    chip: "border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-300",
    hex: "#16a34a",
  },
  AMARILLO: {
    dot: "bg-amber-400",
    chip: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300",
    hex: "#d97706",
  },
  NARANJO: {
    dot: "bg-orange-500",
    chip: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-300",
    hex: "#ea580c",
  },
  MORADO: {
    dot: "bg-purple-500",
    chip: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/50 dark:bg-purple-950/40 dark:text-purple-300",
    hex: "#9333ea",
  },
  CELESTE: {
    dot: "bg-sky-400",
    chip: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-300",
    hex: "#0284c7",
  },
  ROSADO: {
    dot: "bg-pink-500",
    chip: "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900/50 dark:bg-pink-950/40 dark:text-pink-300",
    hex: "#db2777",
  },
};

// Alias frecuentes.
COLORES.NARANJA = COLORES.NARANJO;
COLORES.VIOLETA = COLORES.MORADO;
COLORES.ROSA = COLORES.ROSADO;

export function sectorColorClasses(nombre: string | null | undefined): SectorColor {
  const key = (nombre ?? "").trim().toUpperCase();
  if (!key) return COLOR_NEUTRAL;
  if (COLORES[key]) return COLORES[key];
  // Nombres compuestos como "OTROS ROJOS": detecta la palabra de color contenida.
  for (const color of Object.keys(COLORES)) {
    if (key.includes(color)) return COLORES[color];
  }
  return COLOR_NEUTRAL;
}
