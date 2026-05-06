"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import type { Categoria, Paciente, Prioridad } from "@/lib/types";
import { CATEGORIA_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import { formatearRut } from "@/lib/rut";

interface Props {
  paciente: Paciente;
  onClose: () => void;
  onGuardado: (actualizado: Paciente) => void;
  mode?: "full" | "contact-only";
}

type FormState = {
  fecha_nacimiento: string;
  edad: string;
  prioridad: Prioridad;
  categoria: Categoria;
  diagnostico: string;
  telefono: string;
  telefono_recados: string;
  email: string;
  fecha_ingreso: string;
  fecha_siguiente_cita: string;
  fecha_egreso: string;
  observaciones: string;
};

const DATE_FIELDS = [
  "fecha_nacimiento",
  "fecha_ingreso",
  "fecha_siguiente_cita",
  "fecha_egreso",
] as const;

function calcularEdadExacta(fechaNacimiento: string): number | null {
  if (!fechaNacimiento) return null;
  const birth = new Date(`${fechaNacimiento}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let edad = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    edad -= 1;
  }

  return edad >= 0 ? edad : 0;
}

function toForm(p: Paciente): FormState {
  return {
    fecha_nacimiento: p.fecha_nacimiento ?? "",
    edad: String(p.edad ?? ""),
    prioridad: p.prioridad,
    categoria: p.categoria,
    diagnostico: p.diagnostico ?? "",
    telefono: p.telefono ?? "",
    telefono_recados: p.telefono_recados ?? "",
    email: p.email ?? "",
    fecha_ingreso: p.fecha_ingreso ?? "",
    fecha_siguiente_cita: p.fecha_siguiente_cita ?? "",
    fecha_egreso: p.fecha_egreso ?? "",
    observaciones: p.observaciones ?? "",
  };
}

export default function EditarPacienteModal({
  paciente,
  onClose,
  onGuardado,
  mode = "full",
}: Props) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(toForm(paciente));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isContactOnly = mode === "contact-only";

  const edadCalculada = useMemo(
    () => calcularEdadExacta(form.fecha_nacimiento),
    [form.fecha_nacimiento],
  );

  function set(field: keyof FormState, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };

      if (field === "fecha_nacimiento") {
        const exacta = calcularEdadExacta(value);
        if (exacta !== null) {
          next.edad = String(exacta);
        }
      }

      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const payload: Record<string, string | number | null> = {};

      if (isContactOnly) {
        payload.categoria = form.categoria;
        payload.telefono = form.telefono.trim();
        payload.telefono_recados = form.telefono_recados.trim();
        payload.email = form.email.trim();

        const actualizado = await api.patch<Paciente>(
          `/pacientes/${paciente.id}/`,
          payload,
        );
        onGuardado(actualizado);
        toast.success("Contacto y categoría actualizados correctamente.");
        return;
      }

      const edadFinal = form.fecha_nacimiento
        ? (calcularEdadExacta(form.fecha_nacimiento) ?? Number(form.edad || 0))
        : Number(form.edad || 0);

      payload.edad = Number.isFinite(edadFinal) ? edadFinal : 0;
      payload.prioridad = form.prioridad;
      payload.categoria = form.categoria;
      payload.diagnostico = form.diagnostico.trim();
      payload.telefono = form.telefono.trim();
      payload.telefono_recados = form.telefono_recados.trim();
      payload.email = form.email.trim();
      payload.observaciones = form.observaciones.trim();

      for (const key of DATE_FIELDS) {
        payload[key] = form[key] || null;
      }

      const actualizado = await api.patch<Paciente>(
        `/pacientes/${paciente.id}/`,
        payload,
      );
      onGuardado(actualizado);
      toast.success("Paciente actualizado correctamente.");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "No se pudo guardar.");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm dark:bg-black/75"
      onClick={onClose}
    >
      <div
        className="ccr-edit-patient-modal max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ccr-edit-patient-modal-header flex items-start justify-between border-b border-blue-100 bg-blue-50 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-gray-800">
              {isContactOnly
                ? "Editar contacto y categoría"
                : "Editar datos del paciente"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              <span className="font-semibold text-gray-700">
                {paciente.nombre}
              </span>
              {" — "}
              <span className="font-mono">{formatearRut(paciente.rut)}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 text-xl leading-none text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="ccr-edit-patient-modal-body max-h-[68vh] overflow-y-auto px-6 py-5"
        >
          {isContactOnly ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Categoría
                </label>
                <select
                  value={form.categoria}
                  onChange={(e) =>
                    set("categoria", e.target.value as Categoria)
                  }
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:border-[#335FDB] focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  {Object.entries(CATEGORIA_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Teléfono principal
                </label>
                <input
                  type="tel"
                  value={form.telefono}
                  onChange={(e) => set("telefono", e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:border-[#335FDB] focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Teléfono recados
                </label>
                <input
                  type="tel"
                  value={form.telefono_recados}
                  onChange={(e) => set("telefono_recados", e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:border-[#335FDB] focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:border-[#335FDB] focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Fecha de nacimiento
                </label>
                <input
                  type="date"
                  value={form.fecha_nacimiento}
                  onChange={(e) => set("fecha_nacimiento", e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Edad calculada: {edadCalculada ?? "-"}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Edad
                </label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={form.edad}
                  onChange={(e) => set("edad", e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Prioridad
                </label>
                <select
                  value={form.prioridad}
                  onChange={(e) =>
                    set("prioridad", e.target.value as Prioridad)
                  }
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  {Object.entries(PRIORIDAD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Categoría
                </label>
                <select
                  value={form.categoria}
                  onChange={(e) =>
                    set("categoria", e.target.value as Categoria)
                  }
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  {Object.entries(CATEGORIA_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Diagnóstico
                </label>
                <input
                  type="text"
                  value={form.diagnostico}
                  onChange={(e) => set("diagnostico", e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Teléfono principal
                </label>
                <input
                  type="tel"
                  value={form.telefono}
                  onChange={(e) => set("telefono", e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Teléfono recados
                </label>
                <input
                  type="tel"
                  value={form.telefono_recados}
                  onChange={(e) => set("telefono_recados", e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#2694d9] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Fecha ingreso
                </label>
                <input
                  type="date"
                  value={form.fecha_ingreso}
                  onChange={(e) => set("fecha_ingreso", e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#2694d9] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Próxima cita
                </label>
                <input
                  type="date"
                  value={form.fecha_siguiente_cita}
                  onChange={(e) => set("fecha_siguiente_cita", e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#2694d9] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Fecha egreso
                </label>
                <input
                  type="date"
                  value={form.fecha_egreso}
                  onChange={(e) => set("fecha_egreso", e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#2694d9] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  Observaciones
                </label>
                <textarea
                  value={form.observaciones}
                  onChange={(e) => set("observaciones", e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border border-gray-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </form>

        <div className="ccr-edit-patient-modal-footer flex gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 rounded-md bg-[#335FDB] py-2.5 text-sm font-bold text-white transition hover:bg-[#284FC0] disabled:opacity-50"
          >
            {loading ? "Guardando…" : "Guardar cambios"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 px-5 py-2.5 text-sm text-gray-600 transition hover:bg-gray-100"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
