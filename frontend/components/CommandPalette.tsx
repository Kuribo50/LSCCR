"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Modal, ModalOverlay } from "react-aria-components";
import {
  FiArrowRight,
  FiCornerDownLeft,
  FiLogOut,
  FiMoon,
  FiLoader,
  FiSearch,
  FiSun,
  FiUser,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatearRut } from "@/lib/rut";
import { unwrapResults } from "@/lib/swr";
import { normalizeSearchText } from "@/lib/utils";
import { CATEGORIA_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import BadgeEstado from "./BadgeEstado";
import type { Paciente, PaginatedResponse } from "@/lib/types";

type NavItem = { href: string; label: string; icon: IconType };

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  navItems: NavItem[];
  /** false para el Médico: no tiene acceso a pacientes, solo a secciones. */
  buscarPacientes?: boolean;
  onSelectPatient: (paciente: Paciente) => void;
  onViewAllPatients: (term: string) => void;
}

type PaletteEntry = {
  id: string;
  kind: "patient" | "nav" | "action";
  icon: IconType;
  label: string;
  hint?: string;
  paciente?: Paciente;
  run: () => void;
};

const GROUP_LABEL: Record<PaletteEntry["kind"], string> = {
  patient: "Pacientes",
  nav: "Secciones",
  action: "Acciones",
};

// Que encuentra la persona en cada seccion, dicho en simple.
const NAV_DESCRIPTIONS: Record<string, string> = {
  "/inicio": "Resumen del día y acciones prioritarias",
  "/calendario": "Citas agendadas por día y profesional",
  "/lista-espera": "Pacientes pendientes de primer contacto",
  "/mis-pacientes": "Pacientes ingresados en tratamiento",
  "/grupos": "Grupos guardados de pacientes para citarlos juntos",
  "/llamados": "Llamar a pacientes en espera y citar ingresados sin cita",
  "/importar": "Cargar el Excel mensual de derivaciones",
  "/importar/revision": "Observaciones y duplicados de la última carga",
  "/historial-mensual": "Cortes mensuales importados",
  "/egresos": "Altas, abandonos y egresos",
  "/linea-tiempo": "Movimientos de pacientes en el tiempo",
  "/riesgo-abandono": "Pacientes con inasistencias repetidas",
  "/analisis/estadisticas": "Reportes mensuales y por profesional",
  "/usuarios": "Cuentas, roles y claves del equipo",
  "/perfil": "Tus datos y contraseña",
};

// "JUAN PEREZ SOTO" -> "Juan Perez Soto": mas legible en una lista.
function nombrePropio(texto: string) {
  if (/^[A-Z]{2,5}$/.test(texto.trim())) return texto.trim();
  return texto
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, letra: string) => sep + letra.toUpperCase())
    // Siglas clinicas que deben seguir en mayusculas.
    .replace(/(Sd|Sdnt|Sdt|Aatt|Acv|Ave|Ges|Hta|Ccr)/g, (sigla) => sigla.toUpperCase());
}

function diasEnEspera(dias: number | undefined) {
  if (dias == null || Number.isNaN(dias)) return null;
  if (dias === 0) return "Derivado hoy";
  if (dias === 1) return "1 día en lista";
  return `${dias.toLocaleString("es-CL")} días en lista`;
}

// Marca en negrita la parte del texto que coincide con la busqueda.
function Resaltado({ texto, termino }: { texto: string; termino: string }) {
  const limpio = termino.trim();
  if (limpio.length < 2) return <>{texto}</>;
  const base = normalizeSearchText(texto);
  const idx = base.indexOf(normalizeSearchText(limpio));
  if (idx < 0) return <>{texto}</>;
  const fin = idx + limpio.length;
  return (
    <>
      {texto.slice(0, idx)}
      <mark className="bg-transparent font-extrabold text-inherit underline decoration-slate-400 decoration-2 underline-offset-2">{texto.slice(idx, fin)}</mark>
      {texto.slice(fin)}
    </>
  );
}

const PATIENT_LIMIT = 6;

// Replica la logica de tema del Navbar para que el toggle quede consistente.
function temaActualEsOscuro() {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  return root.getAttribute("data-theme") === "dark" || root.classList.contains("dark");
}

function alternarTema(): boolean {
  const next = !temaActualEsOscuro();
  const root = document.documentElement;
  root.classList.toggle("dark", next);
  root.setAttribute("data-theme", next ? "dark" : "light");
  window.localStorage.setItem("ccr-theme", next ? "dark" : "light");
  return next;
}

export default function CommandPalette({
  isOpen,
  onClose,
  navItems,
  buscarPacientes = true,
  onSelectPatient,
  onViewAllPatients,
}: CommandPaletteProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [patients, setPatients] = useState<Paciente[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDark, setIsDark] = useState(false);

  // Al abrir: limpia estado, sincroniza tema y enfoca el input.
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setDebouncedQuery("");
    setPatients([]);
    setActiveIndex(0);
    setIsDark(temaActualEsOscuro());
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  // Debounce de la consulta para no pegarle al backend en cada tecla.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => window.clearTimeout(id);
  }, [query]);

  // Busqueda de pacientes: solo con 2+ caracteres, con guard anti-carrera.
  useEffect(() => {
    if (!isOpen) return;
    const term = debouncedQuery;
    if (!buscarPacientes || term.length < 2) {
      setPatients([]);
      setLoadingPatients(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingPatients(true);
    api
      .get<Paciente[] | PaginatedResponse<Paciente>>(
        `/pacientes/?search=${encodeURIComponent(term)}`,
      )
      .then((data) => {
        if (requestIdRef.current !== requestId) return;
        setPatients(unwrapResults(data).slice(0, PATIENT_LIMIT));
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setPatients([]);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoadingPatients(false);
      });
  }, [buscarPacientes, debouncedQuery, isOpen]);

  const actions: PaletteEntry[] = useMemo(() => {
    return [
      {
        id: "action-perfil",
        kind: "action",
        icon: FiUser,
        label: "Mi perfil",
        hint: NAV_DESCRIPTIONS["/perfil"],
        run: () => {
          router.push("/perfil");
          onClose();
        },
      },
      {
        id: "action-tema",
        kind: "action",
        icon: isDark ? FiSun : FiMoon,
        label: isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro",
        hint: "Ajusta el contraste de la interfaz",
        run: () => {
          setIsDark(alternarTema());
        },
      },
      {
        id: "action-logout",
        kind: "action",
        icon: FiLogOut,
        label: "Cerrar sesión",
        hint: "Salir de tu cuenta en este equipo",
        run: () => {
          onClose();
          void logout().then(() => router.replace("/login"));
        },
      },
    ];
  }, [isDark, logout, onClose, router]);

  const entries: PaletteEntry[] = useMemo(() => {
    const term = debouncedQuery;
    const normalizedTerm = normalizeSearchText(term);

    const patientEntries: PaletteEntry[] = patients.map((paciente) => ({
      id: `patient-${paciente.id}`,
      kind: "patient",
      icon: FiUser,
      label: nombrePropio(paciente.nombre),
      paciente,
      run: () => onSelectPatient(paciente),
    }));

    if (term.length >= 2 && patients.length > 0) {
      patientEntries.push({
        id: "patient-view-all",
        kind: "patient",
        icon: FiArrowRight,
        label: `Ver todos los resultados para “${term}” en la lista de espera`,
        run: () => {
          onViewAllPatients(term);
          onClose();
        },
      });
    }

    const matches = (label: string) =>
      !normalizedTerm || normalizeSearchText(label).includes(normalizedTerm);

    const navEntries: PaletteEntry[] = navItems
      .filter((item) => matches(item.label))
      .map((item) => ({
        id: `nav-${item.href}`,
        kind: "nav",
        icon: item.icon,
        label: item.label,
        hint: NAV_DESCRIPTIONS[item.href],
        run: () => {
          router.push(item.href);
          onClose();
        },
      }));

    const actionEntries = actions.filter((action) => matches(action.label));

    return [...patientEntries, ...navEntries, ...actionEntries];
  }, [actions, debouncedQuery, navItems, onClose, onSelectPatient, onViewAllPatients, patients, router]);

  // Mantiene el indice activo dentro de rango cuando cambian los resultados.
  useEffect(() => {
    setActiveIndex((prev) => {
      if (entries.length === 0) return 0;
      return Math.min(prev, entries.length - 1);
    });
  }, [entries.length]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (entries.length ? (prev + 1) % entries.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (entries.length ? (prev - 1 + entries.length) % entries.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      entries[activeIndex]?.run();
    } else if (event.key === "Escape") {
      onClose();
    }
  }

  const showPatientLoading = debouncedQuery.length >= 2 && loadingPatients;
  const countByKind = entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.kind] = (acc[entry.kind] ?? 0) + (entry.id === "patient-view-all" ? 0 : 1);
    return acc;
  }, {});
  const kbd =
    "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-slate-200 bg-white px-1 font-sans text-[10px] font-semibold text-slate-500 dark:border-ink-black-600 dark:bg-ink-black-700 dark:text-ink-black-200";

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable
      className="fixed inset-0 z-[75] flex items-start justify-center bg-slate-950/30 px-4 pb-6 pt-[12vh] backdrop-blur-[2px] transition-opacity duration-150 data-[entering]:opacity-0 data-[exiting]:opacity-0 motion-reduce:transition-none"
    >
      <Modal className="w-full max-w-[780px] outline-none transition duration-200 ease-out data-[entering]:translate-y-2 data-[entering]:opacity-0 data-[exiting]:translate-y-1 data-[exiting]:opacity-0 motion-reduce:transition-none">
        <Dialog
          aria-label="Buscador"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_64px_-20px_rgba(22,24,27,0.35)] outline-none dark:border-ink-black-600 dark:bg-ink-black-800"
        >
          <div className="flex h-14 items-center gap-3 border-b border-slate-200 px-4 dark:border-ink-black-600">
            {showPatientLoading ? (
              <FiLoader className="shrink-0 animate-spin text-slate-500 motion-reduce:animate-none" size={18} aria-hidden="true" />
            ) : (
              <FiSearch className="shrink-0 text-slate-500" size={18} aria-hidden="true" />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={buscarPacientes ? "Busca por nombre, RUT o sección" : "Busca una sección"}
              aria-label="Buscar paciente, sección o acción"
              className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-950 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-ink-black-400"
            />
            <kbd className={kbd}>Esc</kbd>
          </div>

          <div role="listbox" aria-label="Resultados" className="max-h-[62vh] overflow-y-auto px-2 pb-2">
            {debouncedQuery.length > 0 && debouncedQuery.length < 2 && (
              <p className="px-3 py-2 text-xs font-medium text-slate-500">
                Escribe al menos 2 caracteres para buscar pacientes.
              </p>
            )}

            {entries.length === 0 && !showPatientLoading ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm font-semibold text-slate-950 dark:text-white">
                  {debouncedQuery ? `No hay resultados para “${debouncedQuery}”` : "¿Qué necesitas buscar?"}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-ink-black-300">
                  Prueba con el RUT sin puntos, un apellido o el nombre de una sección.
                </p>
              </div>
            ) : (
              entries.map((entry, index) => {
                const isActive = index === activeIndex;
                const prev = entries[index - 1];
                const showHeader = !prev || prev.kind !== entry.kind;
                const Icon = entry.icon;
                const paciente = entry.paciente;
                const total = countByKind[entry.kind] ?? 0;
                const isPatientGroup = entry.kind === "patient";

                return (
                  <div key={entry.id}>
                    {showHeader && (
                      <div className="flex items-baseline justify-between px-3 pb-2 pt-4 first:pt-2">
                        <p className="text-[13px] font-bold text-slate-950 dark:text-white">
                          {GROUP_LABEL[entry.kind]}
                          {total > 0 && (
                            <span className="ml-1.5 font-semibold tabular-nums text-slate-400">{total}</span>
                          )}
                        </p>
                        {isPatientGroup && total >= PATIENT_LIMIT && (
                          <span className="text-[11px] font-semibold text-slate-500">Mostrando los primeros {total}</span>
                        )}
                      </div>
                    )}

                    {showHeader && isPatientGroup && patients.length > 0 && (
                      <div
                        aria-hidden="true"
                        className="hidden grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_7.5rem_6.5rem] gap-4 border-b border-slate-200 px-3 pb-1.5 text-[11px] font-bold text-slate-500 dark:border-ink-black-600 dark:text-ink-black-300 sm:grid"
                      >
                        <span>Paciente</span>
                        <span>Categoría</span>
                        <span>Prioridad</span>
                        <span className="text-right">Estado</span>
                      </div>
                    )}

                    <button
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      ref={(el) => {
                        if (isActive) el?.scrollIntoView({ block: "nearest" });
                      }}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => entry.run()}
                      className={`relative w-full text-left outline-none transition-colors duration-100 ${
                        paciente
                          ? "grid grid-cols-1 gap-1 border-b border-slate-100 px-3 py-3 dark:border-ink-black-700 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_7.5rem_6.5rem] sm:items-center sm:gap-4"
                          : "flex items-center gap-3 rounded-lg px-3 py-2.5"
                      } ${
                        isActive
                          ? "bg-slate-100 dark:bg-ink-black-700"
                          : "hover:bg-slate-50 dark:hover:bg-ink-black-700/60"
                      }`}
                    >
                      {isActive && paciente && (
                        <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-blue-500 dark:bg-blue-500" />
                      )}

                      {paciente ? (
                        <>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-slate-950 dark:text-white">
                              <Resaltado texto={entry.label} termino={debouncedQuery} />
                            </span>
                            <span className="mt-0.5 block truncate text-xs font-semibold tabular-nums text-slate-600 dark:text-ink-black-200">
                              {formatearRut(paciente.rut)}
                              {paciente.edad ? <span className="font-bold text-slate-800 dark:text-ink-black-100"> · {paciente.edad} años</span> : null}
                            </span>
                          </span>

                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-ink-black-100">
                              {/* Solo la categoria: el diagnostico de derivacion es dato sensible y
                                  queda dentro de la ficha operativa, que se abre a proposito. */}
                              {paciente.categoria_label ?? CATEGORIA_LABELS[paciente.categoria] ?? "Sin categoría"}
                            </span>
                            <span className="mt-0.5 block truncate text-xs font-medium text-slate-500 dark:text-ink-black-300">
                              {paciente.kine_asignado_nombre ?? "Sin profesional asignado"}
                            </span>
                          </span>

                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-bold text-slate-800 dark:text-ink-black-100">
                              {PRIORIDAD_LABELS[paciente.prioridad] ?? paciente.prioridad}
                            </span>
                            <span className="mt-0.5 block truncate text-xs font-medium tabular-nums text-slate-500 dark:text-ink-black-300">
                              {diasEnEspera(paciente.dias_en_lista) ?? "-"}
                            </span>
                          </span>

                          <span className="flex sm:justify-end">
                            <BadgeEstado estado={paciente.estado} />
                          </span>
                        </>
                      ) : (
                        <>
                          <Icon
                            size={16}
                            aria-hidden="true"
                            className={`shrink-0 ${isActive ? "text-slate-950 dark:text-white" : "text-slate-500 dark:text-ink-black-300"}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-slate-950 dark:text-white">{entry.label}</span>
                            {entry.hint && (
                              <span className="mt-0.5 block truncate text-xs font-medium text-slate-500 dark:text-ink-black-300">
                                {entry.hint}
                              </span>
                            )}
                          </span>
                          {isActive && (
                            <FiCornerDownLeft size={14} aria-hidden="true" className="shrink-0 text-slate-500" />
                          )}
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-medium text-slate-500 dark:border-ink-black-600 dark:bg-ink-black-900 dark:text-ink-black-300">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <kbd className={kbd}>↑</kbd>
                <kbd className={kbd}>↓</kbd>
                Moverse
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className={kbd}>↵</kbd>
                Abrir
              </span>
              <span className="hidden items-center gap-1.5 sm:flex">
                <kbd className={kbd}>Esc</kbd>
                Cerrar
              </span>
            </div>
            <span className="hidden font-semibold sm:inline">Busca pacientes por nombre o RUT</span>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
