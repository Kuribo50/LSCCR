"use client";

import type { IconType } from "react-icons";
import {
  FiActivity,
  FiAlertTriangle,
  FiArrowRight,
  FiCalendar,
  FiClock,
  FiPhoneOff,
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
  titulo: string;
  descripcion: string;
  icon: IconType;
  tone: {
    border: string;
    bg: string;
    icon: string;
    text: string;
  };
}

const CARDS: CardConfig[] = [
  {
    key: "alta_sin_responsable",
    titulo: "Alta sin responsable",
    descripcion: "Pacientes ALTA pendientes de asignación.",
    icon: FiAlertTriangle,
    tone: {
      border: "border-red-200",
      bg: "bg-red-50",
      icon: "text-red-700",
      text: "text-red-800",
    },
  },
  {
    key: "sobre_90_dias",
    titulo: "Más de 90 días",
    descripcion: "Pacientes con espera prolongada.",
    icon: FiClock,
    tone: {
      border: "border-orange-200",
      bg: "bg-orange-50",
      icon: "text-orange-700",
      text: "text-orange-800",
    },
  },
  {
    key: "pendientes_con_1_intento",
    titulo: "Pendientes con 1 intento",
    descripcion: "Un nuevo intento puede pasar a rescate.",
    icon: FiPhoneOff,
    tone: {
      border: "border-amber-200",
      bg: "bg-amber-50",
      icon: "text-amber-700",
      text: "text-amber-800",
    },
  },
  {
    key: "rescates_activos",
    titulo: "Rescates activos",
    descripcion: "Requieren seguimiento de contactabilidad.",
    icon: FiActivity,
    tone: {
      border: "border-orange-300",
      bg: "bg-orange-50",
      icon: "text-orange-800",
      text: "text-orange-900",
    },
  },
  {
    key: "ingresados_sin_proxima_atencion",
    titulo: "Ingresados sin próxima atención",
    descripcion: "Pacientes ingresados sin agenda próxima.",
    icon: FiCalendar,
    tone: {
      border: "border-slate-200",
      bg: "bg-slate-50",
      icon: "text-slate-600",
      text: "text-slate-800",
    },
  },
  {
    key: "posible_abandono",
    titulo: "Posible abandono",
    descripcion: "2 o más inasistencias no justificadas.",
    icon: FiUserX,
    tone: {
      border: "border-red-300",
      bg: "bg-red-50",
      icon: "text-red-900",
      text: "text-red-950",
    },
  },
  {
    key: "telefonos_incompletos",
    titulo: "Teléfonos incompletos",
    descripcion: "Sin teléfono principal ni recados.",
    icon: FiPhoneOff,
    tone: {
      border: "border-slate-200",
      bg: "bg-slate-50",
      icon: "text-slate-500",
      text: "text-slate-700",
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
    <section className="rounded-xl border border-[#D4E4D4] bg-[#E7F3EC] p-5">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#1B5E3B]">
            Gestión diaria
          </p>
          <h2 className="text-xl font-black text-slate-950">Trabajo de hoy</h2>
        </div>
        <p className="text-xs font-medium text-slate-600">
          Alertas operativas para priorizar acciones del CCR.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((card) => (
          <AlertaCard
            key={card.key}
            config={card}
            grupo={alertas?.[card.key] ?? null}
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
  loading,
  onVerPaciente,
  onVerGrupo,
}: {
  config: CardConfig;
  grupo: AlertasOperativas[GrupoAlerta] | null;
  loading: boolean;
  onVerPaciente: (paciente: Paciente) => void;
  onVerGrupo: (grupo: GrupoAlerta) => void;
}) {
  const Icon = config.icon;
  const total = grupo?.total ?? 0;
  const pacientes = grupo?.pacientes.slice(0, 3) ?? [];

  return (
    <article className="flex min-h-[260px] flex-col rounded-lg border border-[#D4E4D4] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${config.tone.border} ${config.tone.bg}`}
        >
          <Icon className={config.tone.icon} size={20} />
        </div>
        <div className={`text-right text-3xl font-black ${config.tone.text}`}>
          {loading ? "..." : total}
        </div>
      </div>

      <div className="mt-3">
        <h3 className="text-sm font-black text-slate-900">{config.titulo}</h3>
        <p className="mt-1 min-h-10 text-xs leading-5 text-slate-600">
          {config.descripcion}
        </p>
      </div>

      <div className="mt-3 flex-1 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-8 animate-pulse rounded-md bg-slate-100" />
            ))}
          </div>
        ) : total === 0 ? (
          <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            Sin pendientes
          </div>
        ) : (
          pacientes.map((paciente) => (
            <button
              key={paciente.id}
              type="button"
              onClick={() => onVerPaciente(paciente)}
              className="block w-full rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-left transition hover:border-[#D4E4D4] hover:bg-white"
            >
              <p className="truncate text-xs font-bold text-slate-800">
                {paciente.nombre}
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                {paciente.id_ccr} · {formatearRut(paciente.rut)}
              </p>
            </button>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={() => onVerGrupo(config.key)}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-md border border-[#D4E4D4] bg-white px-3 py-2 text-xs font-bold text-[#1B5E3B] transition hover:bg-[#E7F3EC]"
      >
        Ver todos
        <FiArrowRight size={14} />
      </button>
    </article>
  );
}
