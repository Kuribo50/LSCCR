"use client";

import { useState } from "react";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import { FiUserPlus, FiX } from "react-icons/fi";
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

  // Form state
  const [rut, setRut] = useState("");
  const [nombre, setNombre] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [edad, setEdad] = useState("");
  const [telefono, setTelefono] = useState("+569");
  const [email, setEmail] = useState("");
  const [fechaDerivacion, setFechaDerivacion] = useState(() => 
    new Date().toISOString().split("T")[0]
  );
  const [percapitaDesde, setPercapitaDesde] = useState("CESFAM Dr. Alberto Reyes");
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
    setTelefono(val.slice(0, 12)); // max 12 chars: +569 followed by 8 digits
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // 1. Create Patient
      const rawRut = rut.replace(/[^0-9kK]/g, "");
      
      const res = await api.post<Paciente>("/pacientes/", {
        rut: rawRut,
        nombre: nombre.trim(),
        fecha_nacimiento: fechaNacimiento || null,
        edad: Number(edad),
        telefono: telefono.length > 4 ? telefono.trim() : "",
        email: email.trim() || undefined,
        fecha_derivacion: fechaDerivacion,
        percapita_desde: percapitaDesde,
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
        } catch (assignError) {
          console.error("No se pudo autoasignar", assignError);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm [animation:fade_150ms_ease-out]"
      isDismissable
    >
      <Modal className="w-full max-w-[900px] overflow-hidden rounded-2xl bg-[#FCFDFD] shadow-2xl outline-none [animation:zoom_150ms_ease-out]">
        <Dialog className="flex max-h-[90vh] flex-col outline-none">
          {({ close }) => (
            <>
              <header className="flex shrink-0 items-center justify-between border-b border-[#E9F3ED] bg-[#FAFCFB] px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9f4fb] text-[#335fdb]">
                    <FiUserPlus size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-[#1D3B2A]">
                      Ingreso Manual de Paciente
                    </h2>
                    <p className="text-[13px] text-[#698B77]">
                      Formulario avanzado para nuevos ingresos a la lista base.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg p-2 text-[#698B77] transition hover:bg-[#E9F3ED] hover:text-[#1D3B2A]"
                >
                  <FiX size={20} />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-6 [scrollbar-color:#BCCDBE_transparent] [scrollbar-width:thin]">
                {error && (
                  <div className="mb-6 rounded-xl border border-[#F5C2C7] bg-[#F8D7DA] p-4 text-[13px] text-[#842029]">
                    <p className="font-semibold">No se pudo registrar:</p>
                    <p className="mt-1">{error}</p>
                  </div>
                )}

                <form id="crear-paciente-form" onSubmit={handleSubmit} className="space-y-4">
                  {/* Row 1: Identification */}
                  <div className="rounded-xl border border-[#a8d4f0] bg-white p-4">
                    <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#698B77]">Identificacion</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                      <div className="space-y-1.5 sm:col-span-1">
                        <label className="text-[12px] font-semibold text-[#1D3B2A]">
                          RUT
                        </label>
                        <input
                          required
                          value={rut}
                          onChange={handleRutChange}
                          placeholder="Sin puntos, con guión"
                          className="w-full rounded-lg border border-[#a8d4f0] bg-[#FAFCFB] px-3 py-2 text-[13px] font-semibold text-[#2C4837] outline-none focus:border-[#2694d9] focus:bg-white focus:ring-1 focus:ring-[#2694d9]"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-3">
                        <label className="text-[12px] font-semibold text-[#1D3B2A]">
                          Nombre Completo
                        </label>
                        <input
                          required
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          placeholder="Nombres y Apellidos"
                          className="w-full rounded-lg border border-[#a8d4f0] bg-[#FAFCFB] px-3 py-2 text-[13px] outline-none focus:border-[#2694d9] focus:bg-white focus:ring-1 focus:ring-[#2694d9]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Demographics & Contact */}
                  <div className="rounded-xl border border-[#a8d4f0] bg-white p-4">
                    <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#698B77]">Demografia y Contacto</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold text-[#1D3B2A]">
                          Fecha Nacimiento
                        </label>
                        <input
                          type="date"
                          value={fechaNacimiento}
                          onChange={(e) => {
                            setFechaNacimiento(e.target.value);
                            if (e.target.value) {
                              const birth = new Date(e.target.value);
                              const now = new Date();
                              const ageMatch = now.getFullYear() - birth.getFullYear();
                              const isBefore = now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
                              const age = isBefore ? ageMatch - 1 : ageMatch;
                              if (edad === "" || Number(edad) !== age) {
                                setEdad(String(Math.max(0, age)));
                              }
                            }
                          }}
                          className="w-full rounded-lg border border-[#a8d4f0] bg-[#FAFCFB] px-3 py-2 text-[13px] outline-none focus:border-[#2694d9] focus:bg-white focus:ring-1 focus:ring-[#2694d9]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold text-[#1D3B2A]">
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
                          className="w-full rounded-lg border border-[#a8d4f0] bg-[#FAFCFB] px-3 py-2 text-[13px] outline-none focus:border-[#2694d9] focus:bg-white focus:ring-1 focus:ring-[#2694d9]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold text-[#1D3B2A]">
                          Celular
                        </label>
                        <input
                          value={telefono}
                          onChange={handleTelefonoChange}
                          placeholder="+56912345678"
                          className="w-full rounded-lg border border-[#a8d4f0] bg-[#FAFCFB] px-3 py-2 text-[13px] outline-none focus:border-[#2694d9] focus:bg-white focus:ring-1 focus:ring-[#2694d9]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold text-[#1D3B2A]">
                          Correo Electrónico
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Opcional"
                          className="w-full rounded-lg border border-[#a8d4f0] bg-[#FAFCFB] px-3 py-2 text-[13px] outline-none focus:border-[#2694d9] focus:bg-white focus:ring-1 focus:ring-[#2694d9]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bloque de datos de derivación. */}
                  <div className="rounded-xl border border-[#a8d4f0] bg-white p-4">
                    <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#698B77]">Información de derivación</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[12px] font-semibold text-[#1D3B2A]">
                          Diagnóstico
                        </label>
                        <input
                          required
                          value={diagnostico}
                          onChange={(e) => setDiagnostico(e.target.value)}
                          placeholder="Descripción detallada del diagnóstico"
                          className="w-full rounded-lg border border-[#a8d4f0] bg-[#FAFCFB] px-3 py-2 text-[13px] outline-none focus:border-[#2694d9] focus:bg-white focus:ring-1 focus:ring-[#2694d9]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold text-[#1D3B2A]">
                          Centro Derivador
                        </label>
                        <input
                          required
                          value={percapitaDesde}
                          onChange={(e) => setPercapitaDesde(e.target.value)}
                          className="w-full rounded-lg border border-[#a8d4f0] bg-[#FAFCFB] px-3 py-2 text-[13px] outline-none focus:border-[#2694d9] focus:bg-white focus:ring-1 focus:ring-[#2694d9]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold text-[#1D3B2A]">
                          Categoría
                        </label>
                        <select
                          required
                          value={categoria}
                          onChange={(e) => setCategoria(e.target.value as Categoria)}
                          className="w-full rounded-lg border border-[#a8d4f0] bg-[#FAFCFB] px-3 py-2 text-[13px] outline-none focus:border-[#2694d9] focus:bg-white focus:ring-1 focus:ring-[#2694d9]"
                        >
                          {CATEGORIAS.map((c) => (
                            <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold text-[#1D3B2A]">
                          Prioridad
                        </label>
                        <select
                          required
                          value={prioridad}
                          onChange={(e) => setPrioridad(e.target.value as Prioridad)}
                          className="w-full rounded-lg border border-[#a8d4f0] bg-[#FAFCFB] px-3 py-2 text-[13px] outline-none focus:border-[#2694d9] focus:bg-white focus:ring-1 focus:ring-[#2694d9]"
                        >
                          {PRIORIDADES.map((p) => (
                            <option key={p} value={p}>{PRIORIDAD_LABELS[p]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold text-[#1D3B2A]">
                          Fecha Derv. Original
                        </label>
                        <input
                          required
                          type="date"
                          value={fechaDerivacion}
                          onChange={(e) => setFechaDerivacion(e.target.value)}
                          className="w-full rounded-lg border border-[#a8d4f0] bg-[#FAFCFB] px-3 py-2 text-[13px] outline-none focus:border-[#2694d9] focus:bg-white focus:ring-1 focus:ring-[#2694d9]"
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-3 flex flex-col">
                        <label className="text-[12px] font-semibold text-[#1D3B2A]">
                          Observaciones
                        </label>
                        <textarea
                          rows={2}
                          value={observaciones}
                          onChange={(e) => setObservaciones(e.target.value)}
                          placeholder="Notas extra de la derivación o del estado..."
                          className="w-full rounded-lg border border-[#a8d4f0] bg-[#FAFCFB] px-3 py-2 text-[13px] outline-none focus:border-[#2694d9] focus:bg-white focus:ring-1 focus:ring-[#2694d9]"
                        />
                      </div>
                    </div>
                  </div>

                  {isKine && (
                    <div className="mt-4 rounded-xl border border-[#CDEAE0] bg-[#e9f4fb] p-4 text-[13px] flex items-center justify-between">
                      <div>
                        <label htmlFor="autoAsignar" className="font-bold text-[#1D3B2A] cursor-pointer block">
                          Ingresar directo a mis pacientes
                        </label>
                        <p className="text-[#456A55] text-[12px] mt-0.5 max-w-[65ch]">
                          El paciente pasará a tu cartera en estado Pendiente listo para ser gestionado.
                        </p>
                      </div>
                      <input 
                        type="checkbox" 
                        id="autoAsignar"
                        checked={autoAsignar} 
                        onChange={(e) => setAutoAsignar(e.target.checked)}
                        className="h-5 w-5 rounded border-[#6ab0c8] text-[#335fdb] focus:ring-[#2694d9] bg-white shadow-sm"
                      />
                    </div>
                  )}
                </form>
              </div>

              <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-[#E9F3ED] bg-[#FAFCFB] px-6 py-4">
                <button
                  type="button"
                  onClick={close}
                  disabled={loading}
                  className="rounded-xl px-5 py-2 text-[13px] font-bold text-[#698B77] transition hover:bg-[#E9F3ED]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  form="crear-paciente-form"
                  disabled={loading}
                  className="rounded-xl bg-[#335fdb] px-6 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#284fc0] disabled:opacity-50 flex items-center justify-center min-w-[150px] shadow-sm"
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
