"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { FiCheck, FiRefreshCw, FiX } from "react-icons/fi";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/errors";
import { unwrapResults } from "@/lib/swr";
import { useToast } from "@/lib/toast-context";
import type { Categoria, Paciente, Prioridad, Usuario } from "@/lib/types";
import { CATEGORIA_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import { formatearRut } from "@/lib/rut";
import { TONO_CATEGORIA } from "./AgendaGrid";
import CampoFecha from "./CampoFecha";
import SelectFiltro from "./SelectFiltro";
import { puedeCorregirDatos } from "@/lib/roles";
import { formatearFecha } from "@/lib/utils";

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
  kine_asignado: string;
};

const DATE_FIELDS = [
  "fecha_nacimiento",
  "fecha_ingreso",
  "fecha_siguiente_cita",
  "fecha_egreso",
] as const;

const INPUT =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-500 hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-ink-black-50";

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
    edad: p.edad ? String(p.edad) : "",
    prioridad: p.prioridad,
    categoria: p.categoria,
    diagnostico: p.diagnostico ?? "",
    telefono: p.telefono ?? "",
    telefono_recados: p.telefono_recados ?? "",
    email: p.email ?? "",
    fecha_ingreso: p.fecha_ingreso ?? "",
    fecha_siguiente_cita: p.fecha_siguiente_cita ?? "",
    fecha_egreso: p.fecha_egreso ?? "",
    observaciones: "",
    kine_asignado: p.kine_asignado ? String(p.kine_asignado) : "",
  };
}

function Campo({
  label,
  htmlFor,
  ayuda,
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  ayuda?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-semibold text-slate-600 dark:text-ink-black-200">
        {label}
      </label>
      {children}
      {ayuda && <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-ink-black-400">{ayuda}</p>}
    </div>
  );
}

function Bloque({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-3 border-b border-slate-100 py-5 first:pt-0 last:border-b-0 last:pb-0 dark:border-ink-black-700 md:grid-cols-[190px_minmax(0,1fr)] md:gap-6">
      <div>
        <h3 className="text-[13px] font-extrabold text-slate-900 dark:text-ink-black-50">{titulo}</h3>
        <p className="mt-0.5 text-[12px] font-medium leading-snug text-slate-500 dark:text-ink-black-300">{descripcion}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function EditarPacienteModal({
  paciente,
  onClose,
  onGuardado,
  mode = "full",
}: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(toForm(paciente));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [kines, setKines] = useState<Usuario[]>([]);
  const isContactOnly = mode === "contact-only";
  const puedeAsignarKine = !isContactOnly && puedeCorregirDatos(user);

  // Profesionales activos: Administrador y encargados pueden asignar responsable.
  useEffect(() => {
    if (!puedeAsignarKine) return;
    let activo = true;
    api
      .get<Usuario[]>("/usuarios/profesionales/")
      .then((data) => {
        if (!activo) return;
        const lista = unwrapResults<Usuario>(data).filter((u) => u.rol === "KINE" && u.is_active !== false);
        setKines(lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      })
      .catch(() => {
        if (activo) setKines([]);
      });
    return () => {
      activo = false;
    };
  }, [puedeAsignarKine]);

  const edadCalculada = useMemo(
    () => calcularEdadExacta(form.fecha_nacimiento),
    [form.fecha_nacimiento],
  );

  const hoyKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const opcionesKine = useMemo(() => {
    const lista = kines.map((k) => ({ value: String(k.id), label: k.nombre }));
    // Si el kine actual no esta activo igual debe aparecer como seleccion.
    if (paciente.kine_asignado && !lista.some((o) => o.value === String(paciente.kine_asignado))) {
      lista.unshift({
        value: String(paciente.kine_asignado),
        label: paciente.kine_asignado_nombre ?? paciente.responsable_nombre ?? "Kine actual",
      });
    }
    return [{ value: "", label: "Sin asignar" }, ...lista];
  }, [kines, paciente.kine_asignado, paciente.kine_asignado_nombre, paciente.responsable_nombre]);

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
        // Solo contacto: la categoria se cambia desde la ficha completa para
        // que no se modifique por error mientras se llama.
        payload.telefono = form.telefono.trim();
        payload.telefono_recados = form.telefono_recados.trim();
        payload.email = form.email.trim();

        const actualizado = await api.patch<Paciente>(
          `/pacientes/${paciente.id}/`,
          payload,
        );
        onGuardado(actualizado);
        toast.success("Contacto actualizado correctamente.");
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
      // La observación nueva se agrega a la lista de observaciones (no reemplaza las anteriores).
      const nuevaObservacion = form.observaciones.trim();

      for (const key of DATE_FIELDS) {
        payload[key] = form[key] || null;
      }

      const kineOriginal = paciente.kine_asignado ? String(paciente.kine_asignado) : "";
      if (puedeAsignarKine && form.kine_asignado !== kineOriginal) {
        payload.kine_asignado = form.kine_asignado ? Number(form.kine_asignado) : null;
      }

      let actualizado = await api.patch<Paciente>(
        `/pacientes/${paciente.id}/`,
        payload,
      );
      if (nuevaObservacion) {
        await api.post("/observaciones-paciente/", { paciente: paciente.id, texto: nuevaObservacion, tipo: "GENERAL" });
        actualizado = await api.get<Paciente>(`/pacientes/${paciente.id}/`);
      }
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

  const selectCategoria = (
    <SelectFiltro
      label="Categoría"
      value={form.categoria}
      opciones={Object.entries(CATEGORIA_LABELS).map(([value, label]) => ({
        value,
        label,
        dot: TONO_CATEGORIA[value as Categoria]?.dot,
      }))}
      onChange={(v) => set("categoria", v)}
    />
  );

  const camposContacto = (
    <>
      <Campo label="Teléfono principal" htmlFor="edit-telefono">
        <input id="edit-telefono" type="tel" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="+56 9 1234 5678" className={INPUT} />
      </Campo>
      <Campo label="Teléfono de recados" htmlFor="edit-recados">
        <input id="edit-recados" type="tel" value={form.telefono_recados} onChange={(e) => set("telefono_recados", e.target.value)} className={INPUT} />
      </Campo>
      <Campo label="Correo electrónico" htmlFor="edit-email" className="sm:col-span-2">
        <input id="edit-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="nombre@correo.cl" className={INPUT} />
      </Campo>
    </>
  );

  return (
    <ModalOverlay
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
      className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/45 px-4 py-4 backdrop-blur-sm"
    >
      <Modal className="w-full max-w-3xl">
      <Dialog
        aria-label="Editar paciente"
        className="ccr-edit-patient-modal flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-ink-black-600 dark:bg-ink-black-800"
      >
        <header className="ccr-edit-patient-modal-header flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-ink-black-600">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-ink-black-300">
              {isContactOnly ? "Editar contacto" : "Editar paciente"}
            </p>
            <h2 className="mt-0.5 truncate text-lg font-extrabold text-slate-950 dark:text-ink-black-50">{paciente.nombre}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] font-medium text-slate-500 dark:text-ink-black-300">
              <span className="font-bold tabular-nums text-slate-800 dark:text-ink-black-100">{formatearRut(paciente.rut)}</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>{paciente.id_ccr}</span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span>Derivado el {formatearFecha(paciente.fecha_derivacion, "Sin dato")}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 outline-none transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:hover:bg-ink-black-700"
            aria-label="Cerrar"
          >
            <FiX size={18} />
          </button>
        </header>

        <form
          id="editar-paciente-form"
          onSubmit={handleSubmit}
          className="ccr-edit-patient-modal-body custom-scrollbar flex-1 overflow-y-auto px-6 py-5"
        >
          {isContactOnly ? (
            <Bloque titulo="Contacto" descripcion="Datos para llamar o escribir al paciente.">
              {camposContacto}
            </Bloque>
          ) : (
            <>
              <Bloque titulo="Datos personales" descripcion="La edad se calcula sola al ingresar la fecha de nacimiento.">
                <CampoFecha
                  label="Fecha de nacimiento"
                  value={form.fecha_nacimiento}
                  onChange={(v) => set("fecha_nacimiento", v)}
                  max={hoyKey}
                  vistaVacia="anios"
                />
                <div>
                  <label
                    htmlFor="edit-edad"
                    className="flex h-12 w-full cursor-text flex-col justify-center rounded-lg border border-slate-200 bg-white px-3 transition-colors hover:border-slate-300 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/15 dark:border-ink-black-600 dark:bg-ink-black-800"
                  >
                    <span className="text-[10px] font-bold text-slate-500 dark:text-ink-black-300">Edad</span>
                    <input
                      id="edit-edad"
                      type="number"
                      min={0}
                      max={120}
                      value={form.edad}
                      onChange={(e) => set("edad", e.target.value)}
                      placeholder="Sin dato"
                      className="w-full bg-transparent text-[13px] font-semibold tabular-nums text-slate-800 outline-none placeholder:text-slate-500 dark:text-ink-black-100"
                    />
                  </label>
                  <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-ink-black-400">
                    {edadCalculada !== null ? `Calculada: ${edadCalculada} años` : "Sin fecha de nacimiento"}
                  </p>
                </div>
              </Bloque>

              <Bloque titulo="Clasificación clínica" descripcion="Define el orden de atención y el grupo del paciente.">
                <SelectFiltro
                  label="Prioridad"
                  value={form.prioridad}
                  opciones={Object.entries(PRIORIDAD_LABELS).map(([value, label]) => ({ value, label }))}
                  onChange={(v) => set("prioridad", v)}
                />
                {selectCategoria}
                <Campo label="Diagnóstico" htmlFor="edit-diagnostico" className="sm:col-span-2">
                  <textarea
                    id="edit-diagnostico"
                    rows={2}
                    value={form.diagnostico}
                    onChange={(e) => set("diagnostico", e.target.value)}
                    className={`${INPUT} h-auto resize-none py-2.5 leading-snug`}
                  />
                </Campo>
              </Bloque>

              {puedeAsignarKine && (
                <Bloque titulo="Responsable" descripcion="Profesional a cargo del seguimiento.">
                  <div className="sm:col-span-2">
                    <SelectFiltro
                      label="Profesional asignado"
                      value={form.kine_asignado}
                      opciones={opcionesKine}
                      onChange={(v) => set("kine_asignado", v)}
                    />
                  </div>
                </Bloque>
              )}

              <Bloque titulo="Contacto" descripcion="Datos para llamar o escribir al paciente.">
                {camposContacto}
              </Bloque>

              <Bloque titulo="Seguimiento" descripcion="Fechas del proceso en el CCR.">
                <CampoFecha label="Fecha de ingreso" value={form.fecha_ingreso} onChange={(v) => set("fecha_ingreso", v)} />
                <CampoFecha label="Próxima cita" value={form.fecha_siguiente_cita} onChange={(v) => set("fecha_siguiente_cita", v)} />
                <CampoFecha label="Fecha de egreso" value={form.fecha_egreso} onChange={(v) => set("fecha_egreso", v)} />
              </Bloque>

              <Bloque titulo="Nueva observación" descripcion="Se agrega al registro del paciente. La observación importada no se reemplaza aquí.">
                <Campo label="Observación" htmlFor="edit-observacion" className="sm:col-span-2">
                  <textarea
                    id="edit-observacion"
                    value={form.observaciones}
                    onChange={(e) => set("observaciones", e.target.value)}
                    rows={3}
                    placeholder="Ej.: paciente solicita horario de la tarde."
                    className={`${INPUT} h-auto resize-none py-2.5 leading-snug`}
                  />
                </Campo>
              </Bloque>
            </>
          )}

          {error && (
            <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}
        </form>

        <footer className="ccr-edit-patient-modal-footer flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3.5 dark:border-ink-black-600 dark:bg-ink-black-900">
          <button type="button" onClick={onClose} disabled={loading} className="ccr-button-cancel">
            Cancelar
          </button>
          <button type="submit" form="editar-paciente-form" disabled={loading} className="ccr-control-button-primary disabled:opacity-60">
            {loading ? <FiRefreshCw className="animate-spin" size={13} aria-hidden="true" /> : <FiCheck size={14} aria-hidden="true" />}
            {loading ? "Guardando..." : "Guardar cambios"}
          </button>
        </footer>
      </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
