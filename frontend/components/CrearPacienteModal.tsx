"use client";

import { useState } from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { FiUserPlus, FiX } from "react-icons/fi";
import CampoFecha, { fechaHoyKey } from "./CampoFecha";
import { api } from "@/lib/api";
import { CATEGORIA_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import type { Categoria, Paciente, Prioridad } from "@/lib/types";
import { formatearRut } from "@/lib/rut";
import { useAuth } from "@/lib/auth-context";

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (nuevoPaciente: Paciente) => void;
}

const PRIORIDADES: Prioridad[] = ["ALTA", "MEDIANA", "MODERADA", "LICENCIA_MEDICA"];
const CATEGORIAS: Categoria[] = [
  "MAS65",
  "OA_MENOS65",
  "HOMBROS",
  "LUMBAGOS",
  "SDNT",
  "SDT",
  "OTROS_NEUROS",
  "AATT",
  "DUPLA",
  "BORRADOR",
];

export default function CrearPacienteModal({ isOpen, onOpenChange, onSuccess }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isKine = user?.rol === "KINE";

  const [rut, setRut] = useState("");
  const [nombre, setNombre] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [edad, setEdad] = useState("");
  const [telefono, setTelefono] = useState("+569");
  const [email, setEmail] = useState("");
  const [fechaDerivacion, setFechaDerivacion] = useState(fechaHoyKey);
  const [sectorOficial, setSectorOficial] = useState("");
  const [sectorCesfam, setSectorCesfam] = useState("");
  const [diagnostico, setDiagnostico] = useState("");
  const [prioridad, setPrioridad] = useState<Prioridad>("MODERADA");
  const [categoria, setCategoria] = useState<Categoria>("OA_MENOS65");
  const [observaciones, setObservaciones] = useState("");
  const [autoAsignar, setAutoAsignar] = useState(isKine);

  function resetForm() {
    setRut("");
    setNombre("");
    setFechaNacimiento("");
    setEdad("");
    setTelefono("+569");
    setEmail("");
    setSectorOficial("");
    setSectorCesfam("");
    setDiagnostico("");
    setObservaciones("");
    setPrioridad("MODERADA");
    setCategoria("OA_MENOS65");
    setError("");
    setAutoAsignar(isKine);
  }

  function handleRutChange(e: React.ChangeEvent<HTMLInputElement>) {
    setRut(formatearRut(e.target.value));
  }

  function handleTelefonoChange(e: React.ChangeEvent<HTMLInputElement>) {
    let val = e.target.value;
    if (!val.startsWith("+569")) {
      val = "+569" + val.replace("+569", "").replace(/\D/g, "");
    }
    setTelefono(val.slice(0, 12));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const rawRut = rut.replace(/[^0-9kK]/g, "");
      
      const res = await api.post<Paciente>("/pacientes/", {
        rut: rawRut,
        nombre: nombre.trim(),
        fecha_nacimiento: fechaNacimiento || null,
        edad: Number(edad),
        telefono: telefono.length > 4 ? telefono.trim() : "",
        email: email.trim() || undefined,
        fecha_derivacion: fechaDerivacion,
        sector_oficial: sectorOficial.trim().toUpperCase(),
        sector_cesfam: sectorCesfam.trim().toUpperCase(),
        diagnostico: diagnostico.trim(),
        profesional: "KINESIOLOGO",
        prioridad,
        categoria,
        observaciones: observaciones.trim(),
      });

      // Autoasigna al usuario actual si se pidió desde el formulario.
      if (autoAsignar && isKine) {
        try {
          await api.post(`/pacientes/${res.id}/asignar/`, {});
        } catch {
          // Si falla la autoasignacion, el paciente igual queda creado.
        }
      }

      resetForm();
      onOpenChange(false);
      onSuccess(res);
    } catch (err: unknown) {
      const errorData = err as {
        response?: {
          data?: {
            detail?: string;
            rut?: string[];
            email?: string[];
          };
        };
      };
      setError(
        errorData.response?.data?.detail ??
        errorData.response?.data?.rut?.[0] ??
        errorData.response?.data?.email?.[0] ??
        "Ocurrió un error al intentar registrar el paciente. Verifique los datos."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm [animation:fade_150ms_ease-out]"
      isDismissable
    >
      <Modal className="w-full max-w-[900px] overflow-hidden rounded-2xl border border-blue-100 dark:border-[var(--brand-border)] bg-white dark:bg-[var(--bg-card)] shadow-2xl outline-none [animation:zoom_150ms_ease-out]">
        <Dialog className="flex max-h-[90vh] flex-col outline-none">
          {({ close }) => (
            <>
              <header className="flex shrink-0 items-center justify-between border-b border-blue-100 dark:border-[var(--brand-border)] bg-white dark:bg-[var(--bg-card)] px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 dark:border-[var(--brand-border)] bg-blue-50 dark:bg-[var(--brand-light)] text-blue-500">
                    <FiUserPlus size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-950 dark:text-[color:var(--text-primary)]">
                      Ingreso Manual de Paciente
                    </h2>
                    <p className="text-[13px] font-semibold text-slate-500 dark:text-[color:var(--text-muted)]">
                      Formulario avanzado para nuevos ingresos a la lista base.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Cerrar ingreso manual de paciente"
                  className="rounded-lg p-2 text-slate-500 dark:text-[color:var(--text-muted)] transition hover:bg-blue-50 dark:hover:bg-[var(--brand-light)] hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <FiX size={20} />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6 [scrollbar-color:#BFDBFE_transparent] [scrollbar-width:thin]">
                {error && (
                  <div className="mb-6 rounded-xl border border-[#F5C2C7] bg-[#F8D7DA] p-4 text-[13px] text-[#842029]">
                    <p className="font-semibold">No se pudo registrar:</p>
                    <p className="mt-1">{error}</p>
                  </div>
                )}

                <form id="crear-paciente-form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="rounded-xl border border-blue-100 dark:border-[var(--brand-border)] bg-white dark:bg-[var(--bg-card)] p-4 shadow-sm">
                    <h3 className="mb-3 text-[11px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-200">Identificacion</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                      <div className="space-y-1.5 sm:col-span-1">
                        <label className="text-[12px] font-bold text-slate-700 dark:text-[color:var(--text-secondary)]">
                          RUT
                        </label>
                        <input
                          required
                          value={rut}
                          onChange={handleRutChange}
                          placeholder="Sin puntos, con guión"
                          className="w-full rounded-lg border border-slate-200 dark:border-[var(--border-subtle)] bg-white dark:bg-[var(--bg-card)] px-3 py-2 text-[13px] font-semibold text-slate-800 dark:text-[color:var(--text-primary)] outline-none transition placeholder:text-slate-500 dark:placeholder:text-[color:var(--text-muted)] focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-3">
                        <label className="text-[12px] font-bold text-slate-700 dark:text-[color:var(--text-secondary)]">
                          Nombre Completo
                        </label>
                        <input
                          required
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          placeholder="Nombres y Apellidos"
                          className="w-full rounded-lg border border-slate-200 dark:border-[var(--border-subtle)] bg-white dark:bg-[var(--bg-card)] px-3 py-2 text-[13px] text-slate-800 dark:text-[color:var(--text-primary)] outline-none transition placeholder:text-slate-500 dark:placeholder:text-[color:var(--text-muted)] focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-100 dark:border-[var(--brand-border)] bg-white dark:bg-[var(--bg-card)] p-4 shadow-sm">
                    <h3 className="mb-3 text-[11px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-200">Demografia y Contacto</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-700 dark:text-[color:var(--text-secondary)]">
                          Fecha Nacimiento
                        </label>
                        <CampoFecha
                          compacto
                          label="Fecha de nacimiento"
                          value={fechaNacimiento}
                          max={fechaHoyKey()}
                          vistaVacia="anios"
                          onChange={(valor) => {
                            setFechaNacimiento(valor);
                            if (valor) {
                              const birth = new Date(`${valor}T00:00:00`);
                              const now = new Date();
                              const ageMatch = now.getFullYear() - birth.getFullYear();
                              const isBefore = now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
                              const age = isBefore ? ageMatch - 1 : ageMatch;
                              if (edad === "" || Number(edad) !== age) {
                                setEdad(String(Math.max(0, age)));
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-700 dark:text-[color:var(--text-secondary)]">
                          Edad
                        </label>
                        <input
                          required
                          type="number"
                          min={0}
                          max={120}
                          value={edad}
                          onChange={(e) => setEdad(e.target.value)}
                          placeholder="Automático"
                          className="w-full rounded-lg border border-slate-200 dark:border-[var(--border-subtle)] bg-white dark:bg-[var(--bg-card)] px-3 py-2 text-[13px] text-slate-800 dark:text-[color:var(--text-primary)] outline-none transition placeholder:text-slate-500 dark:placeholder:text-[color:var(--text-muted)] focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-700 dark:text-[color:var(--text-secondary)]">
                          Celular
                        </label>
                        <input
                          value={telefono}
                          onChange={handleTelefonoChange}
                          placeholder="+56912345678"
                          className="w-full rounded-lg border border-slate-200 dark:border-[var(--border-subtle)] bg-white dark:bg-[var(--bg-card)] px-3 py-2 text-[13px] text-slate-800 dark:text-[color:var(--text-primary)] outline-none transition placeholder:text-slate-500 dark:placeholder:text-[color:var(--text-muted)] focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-700 dark:text-[color:var(--text-secondary)]">
                          Correo Electrónico
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Opcional"
                          className="w-full rounded-lg border border-slate-200 dark:border-[var(--border-subtle)] bg-white dark:bg-[var(--bg-card)] px-3 py-2 text-[13px] text-slate-800 dark:text-[color:var(--text-primary)] outline-none transition placeholder:text-slate-500 dark:placeholder:text-[color:var(--text-muted)] focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-100 dark:border-[var(--brand-border)] bg-white dark:bg-[var(--bg-card)] p-4 shadow-sm">
                    <h3 className="mb-3 text-[11px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-200">Información de derivación</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[12px] font-bold text-slate-700 dark:text-[color:var(--text-secondary)]">
                          Diagnóstico
                        </label>
                        <input
                          required
                          value={diagnostico}
                          onChange={(e) => setDiagnostico(e.target.value)}
                          placeholder="Descripción detallada del diagnóstico"
                          className="w-full rounded-lg border border-slate-200 dark:border-[var(--border-subtle)] bg-white dark:bg-[var(--bg-card)] px-3 py-2 text-[13px] text-slate-800 dark:text-[color:var(--text-primary)] outline-none transition placeholder:text-slate-500 dark:placeholder:text-[color:var(--text-muted)] focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-700 dark:text-[color:var(--text-secondary)]">
                          Sector territorial
                        </label>
                        <input
                          value={sectorOficial}
                          onChange={(e) => setSectorOficial(e.target.value)}
                          placeholder="AZUL, ROJO, VERDE..."
                          className="w-full rounded-lg border border-slate-200 dark:border-[var(--border-subtle)] bg-white dark:bg-[var(--bg-card)] px-3 py-2 text-[13px] text-slate-800 dark:text-[color:var(--text-primary)] outline-none transition placeholder:text-slate-500 dark:placeholder:text-[color:var(--text-muted)] focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-700 dark:text-[color:var(--text-secondary)]">
                          Sector
                        </label>
                        <input
                          value={sectorCesfam}
                          onChange={(e) => setSectorCesfam(e.target.value)}
                          placeholder="AZUL, CECOSF EL SANTO..."
                          className="w-full rounded-lg border border-slate-200 dark:border-[var(--border-subtle)] bg-white dark:bg-[var(--bg-card)] px-3 py-2 text-[13px] text-slate-800 dark:text-[color:var(--text-primary)] outline-none transition placeholder:text-slate-500 dark:placeholder:text-[color:var(--text-muted)] focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-700 dark:text-[color:var(--text-secondary)]">
                          Categoría
                        </label>
                        <select
                          required
                          value={categoria}
                          onChange={(e) => setCategoria(e.target.value as Categoria)}
                          className="w-full rounded-lg border border-slate-200 dark:border-[var(--border-subtle)] bg-white dark:bg-[var(--bg-card)] px-3 py-2 text-[13px] text-slate-800 dark:text-[color:var(--text-primary)] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        >
                          {CATEGORIAS.map((c) => (
                            <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-700 dark:text-[color:var(--text-secondary)]">
                          Prioridad
                        </label>
                        <select
                          required
                          value={prioridad}
                          onChange={(e) => setPrioridad(e.target.value as Prioridad)}
                          className="w-full rounded-lg border border-slate-200 dark:border-[var(--border-subtle)] bg-white dark:bg-[var(--bg-card)] px-3 py-2 text-[13px] text-slate-800 dark:text-[color:var(--text-primary)] outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        >
                          {PRIORIDADES.map((p) => (
                            <option key={p} value={p}>{PRIORIDAD_LABELS[p]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-slate-700 dark:text-[color:var(--text-secondary)]">
                          Fecha Derv. Original
                        </label>
                        <CampoFecha
                          compacto
                          label="Fecha de derivación original"
                          value={fechaDerivacion}
                          max={fechaHoyKey()}
                          opcional={false}
                          onChange={setFechaDerivacion}
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-3 flex flex-col">
                        <label className="text-[12px] font-bold text-slate-700 dark:text-[color:var(--text-secondary)]">
                          Observaciones
                        </label>
                        <textarea
                          rows={2}
                          value={observaciones}
                          onChange={(e) => setObservaciones(e.target.value)}
                          placeholder="Notas extra de la derivación o del estado..."
                          className="w-full rounded-lg border border-slate-200 dark:border-[var(--border-subtle)] bg-white dark:bg-[var(--bg-card)] px-3 py-2 text-[13px] text-slate-800 dark:text-[color:var(--text-primary)] outline-none transition placeholder:text-slate-500 dark:placeholder:text-[color:var(--text-muted)] focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  </div>

                  {isKine && (
                    <div className="mt-4 flex items-center justify-between rounded-xl border border-blue-100 dark:border-[var(--brand-border)] bg-blue-50 dark:bg-[var(--brand-light)] p-4 text-[13px]">
                      <div>
                        <label htmlFor="autoAsignar" className="block cursor-pointer font-bold text-slate-900 dark:text-[color:var(--text-primary)]">
                          Ingresar directo a mis pacientes
                        </label>
                        <p className="mt-0.5 max-w-[65ch] text-[12px] font-semibold text-slate-600 dark:text-[color:var(--text-secondary)]">
                          El paciente pasará a tu cartera en estado Pendiente listo para ser gestionado.
                        </p>
                      </div>
                      <input 
                        type="checkbox" 
                        id="autoAsignar"
                        checked={autoAsignar} 
                        onChange={(e) => setAutoAsignar(e.target.checked)}
                        className="h-5 w-5 rounded border-blue-200 dark:border-[var(--brand-border)] bg-white dark:bg-[var(--bg-card)] text-blue-500 shadow-sm focus:ring-blue-500"
                      />
                    </div>
                  )}
                </form>
              </div>

              <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-blue-100 dark:border-[var(--brand-border)] bg-white dark:bg-[var(--bg-card)] px-6 py-4">
                <button
                  type="button"
                  onClick={close}
                  disabled={loading}
                  className="rounded-xl px-5 py-2 text-[13px] font-bold text-slate-600 dark:text-[color:var(--text-secondary)] transition hover:bg-blue-50 dark:hover:bg-[var(--brand-light)] hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="crear-paciente-form"
                  disabled={loading}
                  className="flex min-w-[150px] items-center justify-center rounded-xl bg-blue-500 px-6 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    "Guardar Ingreso"
                  )}
                </button>
              </footer>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
