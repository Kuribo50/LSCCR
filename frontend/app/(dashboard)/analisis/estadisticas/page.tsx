import { FiBarChart2, FiClock } from "react-icons/fi";

export default function EstadisticasPage() {
  return (
    <main className="ccr-dashboard-content flex min-h-[calc(100dvh-7rem)] items-center justify-center">
      <section className="ccr-panel ccr-dashboard-card w-full max-w-2xl rounded-xl p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 shadow-sm dark:!border-[#262626] dark:!bg-[#202020] dark:!text-[#8fc4d6]">
          <FiBarChart2 size={28} />
        </div>

        <p className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700 dark:!border-[#262626] dark:!bg-[#202020] dark:!text-[#daebf1]">
          <FiClock size={12} />
          En desarrollo
        </p>

        <h1 className="mt-4 text-3xl font-black text-slate-900 dark:!text-white">
          Página en progreso
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm font-medium text-slate-600 dark:!text-[#b5d8e3]">
          El módulo de estadísticas está reservado para una próxima versión del panel CCR.
        </p>
      </section>
    </main>
  );
}
