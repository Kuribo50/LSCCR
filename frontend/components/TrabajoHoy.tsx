"use client";

import type { IconType } from "react-icons";
import {
  FiArrowRight,
  FiCalendar,
  FiUserX,
} from "react-icons/fi";
import type { AlertasOperativas, Paciente } from "@/lib/types";
import { formatearRut } from "@/lib/rut";

type GrupoAlerta = keyof AlertasOperativas;

interface Props {
  alertas: AlertasOperativas | null;
  loading: boolean;
  onVerPaciente: (paciente: Paciente) => void;
  onVerGrupo: (grupo: GrupoAlerta) => void;
}

interface CardConfig {
  key: GrupoAlerta;
  secondaryKey?: GrupoAlerta;
  titulo: string;
  descripcion: string;
  icon: IconType;
  tone: {
    border: string;
    bg: string;
    icon: string;
    iconDark: string;
    text: string;
  };
}

const CARDS: CardConfig[] = [
  {
    key: "ingresados_sin_proxima_atencion",
    titulo: "Ingresados sin próxima atención",
    descripcion: "Pacientes ingresados sin agenda próxima.",
    icon: FiCalendar,
    tone: {
      border: "border-blue-100",
      bg: "bg-blue-50",
      icon: "text-blue-600",
      iconDark: "dark:text-slate-200",
      text: "text-slate-800",
    },
  },
  {
    key: "posible_abandono",
    titulo: "Posible abandono",
    descripcion: "2 o más inasistencias no justificadas.",
    icon: FiUserX,
    tone: {
      border: "border-red-100",
      bg: "bg-red-50",
      icon: "text-red-600",
      iconDark: "dark:text-red-200",
      text: "text-red-950",
    },
  },
];

export default function TrabajoHoy({
  alertas,
  loading,
  onVerPaciente,
  onVerGrupo,
}: Props) {
  return (
    <section className="p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-[color:var(--ink)]">Trabajo de hoy</h2>
        </div>
        <p className="text-xs font-medium text-slate-600 dark:text-ink-black-200">
          Alertas operativas para priorizar acciones del CCR.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {CARDS.map((card) => (
          <AlertaCard
            key={card.key}
            config={card}
            grupo={alertas?.[card.key] ?? null}
            grupoSecundario={card.secondaryKey ? (alertas?.[card.secondaryKey] ?? null) : null}
            loading={loading}
            onVerPaciente={onVerPaciente}
            onVerGrupo={onVerGrupo}
          />
        ))}
      </div>
    </section>
  );
}

function AlertaCard({
  config,
  grupo,
  grupoSecundario,
  loading,
  onVerPaciente,
  onVerGrupo,
}: {
  config: CardConfig;
  grupo: AlertasOperativas[GrupoAlerta] | null;
  grupoSecundario: AlertasOperativas[GrupoAlerta] | null;
  loading: boolean;
  onVerPaciente: (paciente: Paciente) => void;
  onVerGrupo: (grupo: GrupoAlerta) => void;
}) {
  const Icon = config.icon;
  const total = (grupo?.total ?? 0) + (grupoSecundario?.total ?? 0);
  const pacientes = Array.from(
    new Map(
      [...(grupo?.pacientes ?? []), ...(grupoSecundario?.pacientes ?? [])].map(
        (paciente) => [paciente.id, paciente],
      ),
    ).values(),
  ).slice(0, 3);

  return (
    <article className="flex min-h-[230px] flex-col rounded-2xl border border-slate-200 bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_12px_28px_-16px_rgba(47,99,214,0.35)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-ink-black-600 dark:bg-ink-black-800 dark:hover:border-blue-500/60">
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${config.tone.border} ${config.tone.bg} dark:border-ink-black-600 dark:bg-ink-black-700`}
        >
          <Icon className={`${config.tone.icon} ${config.tone.iconDark}`} size={20} />
        </div>
        <div className={`text-right text-3xl font-bold tabular-nums ${config.tone.text} dark:!text-white`}>
          {loading ? "..." : total}
        </div>
      </div>

      <div className="mt-3">
        <h3 className="text-sm font-bold text-slate-950 dark:text-white">{config.titulo}</h3>
        <p className="mt-1 min-h-10 text-xs leading-5 text-slate-600 dark:text-ink-black-200">
          {config.descripcion}
        </p>
      </div>

      <div className="mt-3 flex-1 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-8 animate-pulse rounded-md bg-slate-100 dark:bg-[#202020]" />
            ))}
          </div>
        ) : total === 0 ? (
          <div className="rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-800 dark:bg-green-400/10 dark:text-green-100">
            Sin pendientes
          </div>
        ) : (
          pacientes.map((paciente) => (
            <button
              key={paciente.id}
              type="button"
              onClick={() => onVerPaciente(paciente)}
              className="block w-full rounded-lg bg-slate-50 px-3 py-2 text-left outline-none transition-colors hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:bg-ink-black-700 dark:hover:bg-blue-500/15"
            >
              <p className="truncate text-xs font-bold text-slate-800 dark:text-white">
                {paciente.nombre.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toUpperCase())}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-ink-black-200">
                {paciente.id_ccr} · {formatearRut(paciente.rut)}
              </p>
            </button>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={() => onVerGrupo(config.key)}
        className="ccr-control-button mt-4 w-full"
      >
        Ver todos
        <FiArrowRight size={14} />
      </button>
    </article>
  );
}
