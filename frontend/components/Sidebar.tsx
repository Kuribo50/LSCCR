"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, Dialog, Modal, ModalOverlay } from "react-aria-components";
import {
  FiActivity,
  FiAlertTriangle,
  FiBarChart2,
  FiCalendar,
  FiChevronLeft,
  FiClock,
  FiGrid,
  FiClipboard,
  FiPhone,
  FiSearch,
  FiUpload,
  FiUsers,
  FiX,
  FiUser,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import { api } from "@/lib/api";
import logoHorizontal from "../public/logoHorizontal.png";
import type {
  DashboardResumenOperativo,
  ImportacionRevisionResultado,
  Paciente,
  Rol,
  Usuario,
} from "@/lib/types";
import FichaPaciente from "./FichaPaciente";
import PacienteSearchBox from "./PacienteSearchBox";

type CountKey =
  | "total"
  | "mios"
  | "rescates"
  | "cola"
  | "egresos"
  | "agendaHoy"
  | "revision";
type SidebarCounts = Record<CountKey, number>;

interface Item {
  href: string;
  label: string;
  icon: IconType;
  section: "principal" | "gestion" | "analisis" | "admin";
  tone: string;
  countKey?: CountKey;
}

const BASE_ITEMS: Record<Rol, Item[]> = {
  KINE: [
    { href: "/inicio", label: "Dashboard", icon: FiGrid, section: "principal", tone: "text-blue-700" },
    { href: "/calendario", label: "Calendario de citas", icon: FiCalendar, section: "principal", tone: "text-indigo-700", countKey: "agendaHoy" },
    { href: "/lista-espera", label: "Lista de espera", icon: FiClipboard, section: "principal", tone: "text-cyan-700", countKey: "total" },
    { href: "/mis-pacientes", label: "Ingresados", icon: FiUsers, section: "gestion", tone: "text-sky-700", countKey: "mios" },
    { href: "/llamados", label: "Cola de llamados", icon: FiPhone, section: "gestion", tone: "text-blue-700", countKey: "cola" },
    { href: "/egresos", label: "Lista de egresados", icon: FiClock, section: "gestion", tone: "text-indigo-700", countKey: "egresos" },
    { href: "/analisis/estadisticas", label: "Estadísticas", icon: FiBarChart2, section: "analisis", tone: "text-blue-700" },
  ],
  ADMINISTRATIVO: [
    { href: "/inicio", label: "Dashboard", icon: FiGrid, section: "principal", tone: "text-blue-700" },
    { href: "/calendario", label: "Calendario de citas", icon: FiCalendar, section: "principal", tone: "text-indigo-700", countKey: "agendaHoy" },
    { href: "/llamados", label: "Cola de llamados", icon: FiPhone, section: "gestion", tone: "text-blue-700", countKey: "cola" },
    { href: "/importar", label: "Importar derivaciones", icon: FiUpload, section: "gestion", tone: "text-cyan-700" },
    { href: "/importar/revision", label: "Revisión importación", icon: FiAlertTriangle, section: "gestion", tone: "text-amber-700", countKey: "revision" },
    { href: "/historial-mensual", label: "Historial de cortes", icon: FiClock, section: "gestion", tone: "text-indigo-700" },
    { href: "/egresos", label: "Lista de egresados", icon: FiClock, section: "gestion", tone: "text-indigo-700", countKey: "egresos" },
    { href: "/analisis/estadisticas", label: "Estadísticas", icon: FiBarChart2, section: "analisis", tone: "text-blue-700" },
  ],
  ADMIN: [
    { href: "/inicio", label: "Dashboard", icon: FiGrid, section: "principal", tone: "text-blue-700" },
    { href: "/calendario", label: "Calendario de citas", icon: FiCalendar, section: "principal", tone: "text-indigo-700", countKey: "agendaHoy" },
    { href: "/lista-espera", label: "Lista de espera", icon: FiClipboard, section: "principal", tone: "text-cyan-700", countKey: "total" },
    { href: "/mis-pacientes", label: "Ingresados", icon: FiUsers, section: "gestion", tone: "text-sky-700", countKey: "mios" },
    { href: "/llamados", label: "Cola de llamados", icon: FiPhone, section: "gestion", tone: "text-blue-700", countKey: "cola" },
    { href: "/importar", label: "Importar derivaciones", icon: FiUpload, section: "gestion", tone: "text-cyan-700" },
    { href: "/importar/revision", label: "Revisión importación", icon: FiAlertTriangle, section: "gestion", tone: "text-amber-700", countKey: "revision" },
    { href: "/historial-mensual", label: "Historial de cortes", icon: FiClock, section: "gestion", tone: "text-indigo-700" },
    { href: "/egresos", label: "Lista de egresados", icon: FiClock, section: "gestion", tone: "text-indigo-700", countKey: "egresos" },
    { href: "/analisis/estadisticas", label: "Estadísticas", icon: FiBarChart2, section: "analisis", tone: "text-blue-700" },
    { href: "/usuarios", label: "Usuarios", icon: FiUser, section: "admin", tone: "text-slate-700" },
  ],
};

const SECTION_LABELS: Record<Item["section"], string> = {
  principal: "Principal",
  gestion: "Gestión",
  analisis: "Análisis",
  admin: "Administración",
};

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function esElementoEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.matches("input, textarea, select") || target.isContentEditable)
  );
}

function SearchLauncher({
  onOpen,
  size = "desktop",
}: {
  onOpen: () => void;
  size?: "desktop" | "mobile";
}) {
  return (
    <Button
      type="button"
      onPress={onOpen}
      aria-label="Abrir buscador de pacientes"
      aria-keyshortcuts="Control+K"
      className={classes(
        "group flex w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white text-left text-zinc-950 outline-none transition-all hover:border-blue-200 hover:bg-blue-50/40 focus:border-[#335fdb] focus:ring-2 focus:ring-blue-100",
        size === "mobile" ? "px-3 py-2.5 text-sm" : "px-3 py-2 text-xs",
      )}
    >
      <FiSearch
        className="shrink-0 text-zinc-500 transition-colors group-hover:text-[#335fdb]"
        size={15}
      />
      <span className="min-w-0 flex-1 truncate text-zinc-500">
        Buscar RUT, sector o diagnóstico...
      </span>
      <kbd className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-black text-slate-500 transition group-hover:border-blue-100 group-hover:bg-white group-hover:text-blue-700">
        Ctrl K
      </kbd>
    </Button>
  );
}

function SidebarNav({
  items,
  pathname,
  counts,
  compact,
  onNavigate,
}: {
  items: Item[];
  pathname: string;
  counts: SidebarCounts;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const sectionOrder: Item["section"][] = ["principal", "gestion", "analisis", "admin"];

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {sectionOrder.map((section, sectionIndex) => {
        const sectionItems = items.filter((item) => item.section === section);
        if (sectionItems.length === 0) return null;

        return (
          <div
            key={section}
            className={classes(
              "mb-3 last:mb-0",
              sectionIndex > 0 && !compact && "mt-2 pt-2",
            )}
          >
            {!compact && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                {SECTION_LABELS[section]}
              </p>
            )}

            <ul className="space-y-1.5">
              {sectionItems.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== "/importar" && pathname.startsWith(`${item.href}/`));
                const count = item.countKey ? counts[item.countKey] : null;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={compact ? item.label : undefined}
                      aria-label={compact ? item.label : undefined}
                      className={classes(
                        "group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition",
                        compact && "justify-center px-2",
                        active
                          ? "bg-[#335fdb] text-white shadow-sm"
                          : "text-zinc-800 hover:bg-[#eceef3] hover:text-zinc-950",
                      )}
                    >
                      <span
                        className={classes(
                          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[15px]",
                          active
                            ? "bg-white/15 text-white"
                            : "bg-transparent text-zinc-700 group-hover:text-zinc-950",
                        )}
                      >
                        <Icon />
                      </span>

                      {!compact && (
                        <>
                          <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                          {typeof count === "number" && (
                            <span
                              className={classes(
                                "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                                active
                                  ? "bg-white/20 text-white"
                                  : "bg-[#e9edf5] text-zinc-700",
                              )}
                            >
                              {count}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export default function Sidebar({
  user,
  mobileOpen,
  onMobileOpenChange,
}: {
  user: Usuario;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const rol = user.rol;
  const userId = user.id;
  const [compact, setCompact] = useState(false);
  const [counts, setCounts] = useState<SidebarCounts>({
    total: 0,
    mios: 0,
    rescates: 0,
    cola: 0,
    egresos: 0,
    agendaHoy: 0,
    revision: 0,
  });
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState<Paciente | null>(null);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const items = useMemo(() => BASE_ITEMS[rol], [rol]);

  function abrirBuscadorCentral() {
    setSearchOverlayOpen(true);
  }

  function abrirBuscadorMovil() {
    onMobileOpenChange(false);
    setSearchOverlayOpen(true);
  }

  function handleSelectPaciente(paciente: Paciente) {
    setSearchOverlayOpen(false);
    setPacienteSeleccionado(paciente);
    onMobileOpenChange(false);
  }

  function handleViewAllPacientes(term: string) {
    const query = term.trim();
    if (!query) return;
    setSearchOverlayOpen(false);
    setPacienteSeleccionado(null);
    onMobileOpenChange(false);
    router.push(`/pacientes?search=${encodeURIComponent(query)}`);
  }

  useEffect(() => {
    let mounted = true;

    async function loadCounts() {
      try {
        const puedeVerRevision = rol === "ADMIN" || rol === "ADMINISTRATIVO";
        const [resumen, revision] = await Promise.all([
          api.get<DashboardResumenOperativo>("/pacientes/dashboard-resumen/"),
          puedeVerRevision
            ? api.get<ImportacionRevisionResultado>("/importar/revision/?estado=PENDIENTE").catch(() => null)
            : Promise.resolve(null),
        ]);

        if (!mounted) return;

        setCounts({
          total: resumen.lista_espera_global ?? resumen.sin_asignar,
          mios: resumen.ingresados,
          rescates: resumen.rescates_globales,
          cola: resumen.cola_llamados,
          egresos: resumen.egresados ?? 0,
          agendaHoy: resumen.agenda_hoy ?? 0,
          revision: revision?.pendientes ?? 0,
        });
      } catch {
        if (!mounted) return;
        setCounts({
          total: 0,
          mios: 0,
          rescates: 0,
          cola: 0,
          egresos: 0,
          agendaHoy: 0,
          revision: 0,
        });
      }
    }

    void loadCounts();

    function onRefreshEvent() {
      void loadCounts();
    }

    window.addEventListener("ccr:refresh-sidebar", onRefreshEvent);
    return () => {
      mounted = false;
      window.removeEventListener("ccr:refresh-sidebar", onRefreshEvent);
    };
  }, [rol, userId]);

  useEffect(() => {
    onMobileOpenChange(false);
  }, [pathname, onMobileOpenChange]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!event.ctrlKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") {
        return;
      }
      if (esElementoEditable(event.target) && !searchOverlayOpen) return;

      event.preventDefault();
      onMobileOpenChange(false);
      setSearchOverlayOpen(true);
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onMobileOpenChange, searchOverlayOpen]);

  return (
    <>
      <aside
        className={classes(
          "ccr-sidebar-surface sticky top-0 hidden h-screen shrink-0 flex-col bg-[#f4f4f5] text-zinc-950 transition-all duration-300 lg:flex",
          compact ? "w-[86px]" : "w-[286px]",
        )}
      >
        <div className="flex items-center justify-between px-4 py-5">
          {!compact && (
            <div className="flex min-w-0 flex-1 items-center overflow-hidden">
              <img
                src={logoHorizontal.src}
                alt="Centro Comunitario de Rehabilitación"
                className="h-16 w-full origin-left scale-125 object-contain object-left"
              />
            </div>
          )}
          {compact && (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#335fdb] text-white">
              <FiActivity size={17} />
            </div>
          )}

          <Button
            aria-label={compact ? "Expandir menú" : "Contraer menú"}
            onPress={() => setCompact((prev) => !prev)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 outline-none transition hover:bg-zinc-100"
          >
            <FiChevronLeft className={classes("transition-transform duration-300", compact && "rotate-180")} size={14} />
          </Button>
        </div>

        {!compact && (
          <div className="mb-2 px-4 pb-3 pt-1">
            <SearchLauncher onOpen={abrirBuscadorCentral} />
          </div>
        )}

        <SidebarNav items={items} pathname={pathname} counts={counts} compact={compact} />
      </aside>

      <ModalOverlay
        isOpen={mobileOpen}
        onOpenChange={onMobileOpenChange}
        className="fixed inset-0 z-50 bg-slate-900/30 p-3 backdrop-blur-[1px] lg:hidden"
      >
        <Modal className="ccr-sidebar-surface h-full w-[92vw] max-w-[320px] rounded-xl bg-[#f4f4f5] text-zinc-950 shadow-2xl outline-none">
          <Dialog aria-label="Menú principal" className="flex h-full flex-col outline-none">
            {({ close }) => (
              <>
                <div className="flex items-center justify-between px-4 py-5">
                  <div className="flex min-w-0 flex-1 items-center overflow-hidden">
                    <img
                      src={logoHorizontal.src}
                      alt="Centro Comunitario de Rehabilitación"
                      className="h-16 w-full origin-left scale-125 object-contain object-left"
                    />
                  </div>
                  <Button
                    onPress={close}
                    aria-label="Cerrar menú"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 outline-none transition hover:bg-zinc-100"
                  >
                    <FiX size={16} />
                  </Button>
                </div>

                <div className="mt-1 px-4 pb-3">
                  <SearchLauncher
                    onOpen={abrirBuscadorMovil}
                    size="mobile"
                  />
                </div>

                <SidebarNav items={items} pathname={pathname} counts={counts} compact={false} onNavigate={close} />
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>

      <ModalOverlay
        isOpen={searchOverlayOpen}
        onOpenChange={setSearchOverlayOpen}
        isDismissable
        className="fixed inset-0 z-[75] flex items-start justify-center bg-slate-900/45 px-4 pb-6 pt-[9vh] backdrop-blur-sm sm:pt-[8vh]"
      >
        <Modal className="w-full max-w-3xl scale-100 opacity-100 outline-none transition duration-150 data-[entering]:scale-95 data-[entering]:opacity-0 data-[exiting]:scale-95 data-[exiting]:opacity-0 motion-reduce:transition-none">
          <Dialog
            aria-label="Buscador de pacientes"
            className="outline-none"
          >
            {({ close }) => (
              <div>
                <div className="mb-4 flex items-center justify-between px-1 text-white">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-blue-100">
                      Búsqueda rápida
                    </p>
                    <h2 className="text-lg font-black">Buscar paciente</h2>
                  </div>
                  <Button
                    type="button"
                    onPress={close}
                    aria-label="Cerrar buscador"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-600 outline-none transition hover:bg-white hover:text-slate-950 focus:ring-2 focus:ring-blue-200"
                  >
                    <FiX size={18} />
                  </Button>
                </div>
                <PacienteSearchBox
                  autoFocus
                  size="overlay"
                  onSelect={handleSelectPaciente}
                  onViewAll={handleViewAllPacientes}
                />
              </div>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>

      {pacienteSeleccionado && (
        <FichaPaciente
          paciente={pacienteSeleccionado}
          usuario={user}
          onClose={() => setPacienteSeleccionado(null)}
          onRefresh={() => window.dispatchEvent(new Event("ccr:refresh-sidebar"))}
        />
      )}
    </>
  );
}
