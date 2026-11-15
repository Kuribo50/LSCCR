"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button, Dialog, Modal, ModalOverlay } from "react-aria-components";
import { motion, useReducedMotion } from "framer-motion";
import {
  FiAlertTriangle,
  FiBarChart2,
  FiCalendar,
  FiChevronLeft,
  FiClock,
  FiGrid,
  FiLayers,
  FiGitCommit,
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
import CommandPalette from "./CommandPalette";

const BRAND_ALT = "Centro Comunitario de Rehabilitación CESFAM Dr. Alberto Reyes";
const SIDEBAR_ICON_SRC = "/icon.ico";
type SidebarBrandMode = "desktop" | "mobile" | "compact";

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
    { href: "/inicio", label: "Inicio", icon: FiGrid, section: "principal", tone: "text-blue-700" },
    { href: "/calendario", label: "Agenda", icon: FiCalendar, section: "principal", tone: "text-indigo-700", countKey: "agendaHoy" },
    { href: "/lista-espera", label: "Lista de espera", icon: FiClipboard, section: "principal", tone: "text-cyan-700", countKey: "total" },
    { href: "/mis-pacientes", label: "Ingresados", icon: FiUsers, section: "gestion", tone: "text-sky-700", countKey: "mios" },
    { href: "/grupos", label: "Grupos", icon: FiLayers, section: "gestion", tone: "text-sky-700" },
    { href: "/llamados", label: "Llamados", icon: FiPhone, section: "gestion", tone: "text-blue-700", countKey: "cola" },
    { href: "/egresos", label: "Lista de egresados", icon: FiClock, section: "gestion", tone: "text-indigo-700", countKey: "egresos" },
    { href: "/linea-tiempo", label: "Línea de tiempo", icon: FiGitCommit, section: "gestion", tone: "text-indigo-700" },
    { href: "/riesgo-abandono", label: "Riesgo de abandono", icon: FiAlertTriangle, section: "gestion", tone: "text-rose-700" },
    { href: "/analisis/estadisticas", label: "Estadísticas", icon: FiBarChart2, section: "analisis", tone: "text-blue-700" },
  ],
  ADMINISTRATIVO: [
    { href: "/inicio", label: "Inicio", icon: FiGrid, section: "principal", tone: "text-blue-700" },
    { href: "/calendario", label: "Agenda", icon: FiCalendar, section: "principal", tone: "text-indigo-700", countKey: "agendaHoy" },
    { href: "/grupos", label: "Grupos", icon: FiLayers, section: "gestion", tone: "text-sky-700" },
    { href: "/llamados", label: "Llamados", icon: FiPhone, section: "gestion", tone: "text-blue-700", countKey: "cola" },
    { href: "/importar", label: "Importar derivaciones", icon: FiUpload, section: "gestion", tone: "text-cyan-700" },
    { href: "/importar/revision", label: "Revisión de carga", icon: FiAlertTriangle, section: "gestion", tone: "text-amber-700", countKey: "revision" },
    { href: "/historial-mensual", label: "Historial de cortes", icon: FiClock, section: "gestion", tone: "text-indigo-700" },
    { href: "/egresos", label: "Lista de egresados", icon: FiClock, section: "gestion", tone: "text-indigo-700", countKey: "egresos" },
    { href: "/linea-tiempo", label: "Línea de tiempo", icon: FiGitCommit, section: "gestion", tone: "text-indigo-700" },
    { href: "/riesgo-abandono", label: "Riesgo de abandono", icon: FiAlertTriangle, section: "gestion", tone: "text-rose-700" },
    { href: "/analisis/estadisticas", label: "Estadísticas", icon: FiBarChart2, section: "analisis", tone: "text-blue-700" },
  ],
  ADMIN: [
    { href: "/inicio", label: "Inicio", icon: FiGrid, section: "principal", tone: "text-blue-700" },
    { href: "/calendario", label: "Agenda", icon: FiCalendar, section: "principal", tone: "text-indigo-700", countKey: "agendaHoy" },
    { href: "/lista-espera", label: "Lista de espera", icon: FiClipboard, section: "principal", tone: "text-cyan-700", countKey: "total" },
    { href: "/mis-pacientes", label: "Ingresados", icon: FiUsers, section: "gestion", tone: "text-sky-700", countKey: "mios" },
    { href: "/grupos", label: "Grupos", icon: FiLayers, section: "gestion", tone: "text-sky-700" },
    { href: "/llamados", label: "Llamados", icon: FiPhone, section: "gestion", tone: "text-blue-700", countKey: "cola" },
    { href: "/importar", label: "Importar derivaciones", icon: FiUpload, section: "gestion", tone: "text-cyan-700" },
    { href: "/importar/revision", label: "Revisión de carga", icon: FiAlertTriangle, section: "gestion", tone: "text-amber-700", countKey: "revision" },
    { href: "/historial-mensual", label: "Historial de cortes", icon: FiClock, section: "gestion", tone: "text-indigo-700" },
    { href: "/egresos", label: "Lista de egresados", icon: FiClock, section: "gestion", tone: "text-indigo-700", countKey: "egresos" },
    { href: "/linea-tiempo", label: "Línea de tiempo", icon: FiGitCommit, section: "gestion", tone: "text-indigo-700" },
    { href: "/riesgo-abandono", label: "Riesgo de abandono", icon: FiAlertTriangle, section: "gestion", tone: "text-rose-700" },
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

function SidebarBrand({ mode = "desktop" }: { mode?: SidebarBrandMode }) {
  if (mode === "compact") {
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded-xl p-1.5">
        <Image
          src={SIDEBAR_ICON_SRC}
          alt={BRAND_ALT}
          width={36}
          height={36}
          className="h-8 w-8 object-contain"
          priority
          unoptimized
        />
      </div>
    );
  }

  if (mode === "mobile") {
    return (
      <div className="flex h-14 min-w-0 flex-1 items-center overflow-hidden">
        <Image
          src={logoHorizontal}
          alt={BRAND_ALT}
          className="h-14 w-full object-contain object-left"
          sizes="260px"
          priority
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center overflow-hidden">
      <Image
        src={logoHorizontal}
        alt={BRAND_ALT}
        className="h-[72px] w-full object-cover object-left"
        sizes="(min-width: 1024px) 222px, 272px"
        priority
      />
    </div>
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
        "group flex h-10 w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 text-left text-slate-950 outline-none transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-950/20 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-white dark:hover:bg-ink-black-700",
        size === "mobile" ? "text-sm" : "text-[13px]",
      )}
    >
      <FiSearch
        className="shrink-0 text-slate-500 dark:text-ink-black-300"
        size={16}
      />
      <span className="min-w-0 flex-1 truncate font-medium text-slate-500 dark:text-ink-black-300">
        Buscar
      </span>
      <kbd className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-sans text-[10px] font-bold text-slate-600 dark:bg-ink-black-700 dark:text-ink-black-200">
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
  const reduceMotion = useReducedMotion();
  // Un id por instancia: el menu de escritorio y el movil no comparten indicador.
  const indicatorId = onNavigate ? "sidebar-active-mobile" : "sidebar-active-desktop";

  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Navegación principal">
      {sectionOrder.map((section, sectionIndex) => {
        const sectionItems = items.filter((item) => item.section === section);
        if (sectionItems.length === 0) return null;

        return (
          <div
            key={section}
            className={classes(
              "py-2.5",
              sectionIndex > 0 && "border-t border-slate-100 dark:border-ink-black-700",
            )}
          >
            {!compact && (
              <p className="mb-1 px-2.5 text-[11px] font-semibold text-slate-400 dark:text-ink-black-300">
                {SECTION_LABELS[section]}
              </p>
            )}

            <ul className="space-y-0.5">
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
                      aria-current={active ? "page" : undefined}
                      className={classes(
                        "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-slate-950/25 dark:focus-visible:ring-white/30",
                        compact && "justify-center px-0",
                        active
                          ? "font-bold text-white dark:text-white"
                          : "font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-ink-black-100 dark:hover:bg-ink-black-700",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId={indicatorId}
                          aria-hidden="true"
                          className="absolute inset-0 rounded-lg bg-blue-500 dark:bg-blue-500"
                          transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }}
                        />
                      )}
                      <Icon
                        aria-hidden="true"
                        className={classes(
                          "relative shrink-0 text-[16px]",
                          active ? "text-current" : "text-slate-500 group-hover:text-slate-950 dark:text-ink-black-300",
                        )}
                      />

                      {!compact && (
                        <>
                          <span className="relative min-w-0 flex-1 truncate">{item.label}</span>
                          {typeof count === "number" && (
                            <span
                              className={classes(
                                "relative min-w-[2rem] shrink-0 rounded-md px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums",
                                active
                                  ? "bg-white/20 text-white"
                                  : "bg-slate-100 text-slate-500 dark:bg-ink-black-700 dark:text-ink-black-200",
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
          cola: resumen.cola_llamados + (resumen.por_citar ?? 0),
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
      // Cmd+K (Mac) o Ctrl+K (Windows/Linux) abre/cierra la paleta desde cualquier lugar.
      const isPaletteShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "k";
      if (!isPaletteShortcut) return;

      event.preventDefault();
      onMobileOpenChange(false);
      setSearchOverlayOpen((prev) => !prev);
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onMobileOpenChange]);

  return (
    <>
      <aside
        className={classes(
          "ccr-sidebar-surface sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white text-slate-950 transition-all duration-300 dark:border-ink-black-600 dark:bg-ink-black-800 dark:text-white lg:flex",
          compact ? "w-[86px]" : "w-[286px]",
        )}
      >
        <div
          className={classes(
            "flex py-5",
            compact
              ? "flex-col items-center gap-3 px-3"
              : "items-center justify-between gap-2 px-3",
          )}
        >
          <SidebarBrand mode={compact ? "compact" : "desktop"} />

          <Button
            aria-label={compact ? "Expandir menú" : "Contraer menú"}
            onPress={() => setCompact((prev) => !prev)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-950 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-950/25 dark:border-ink-black-600 dark:text-white dark:hover:bg-ink-black-700"
          >
            <FiChevronLeft className={classes("transition-transform duration-300", compact && "rotate-180")} size={14} />
          </Button>
        </div>

        {!compact && (
          <div className="border-b border-slate-200 px-3 pb-4 dark:border-ink-black-600">
            <SearchLauncher onOpen={abrirBuscadorCentral} />
          </div>
        )}

        <SidebarNav items={items} pathname={pathname} counts={counts} compact={compact} />
      </aside>

      <ModalOverlay
        isOpen={mobileOpen}
        onOpenChange={onMobileOpenChange}
        className="fixed inset-0 z-50 bg-slate-900/30 p-0 backdrop-blur-[1px] sm:p-3 lg:hidden"
      >
        <Modal className="ccr-sidebar-surface h-dvh max-h-dvh w-[92vw] max-w-[360px] rounded-r-2xl bg-white text-slate-950 shadow-2xl outline-none dark:bg-ink-black-800 dark:text-white sm:h-full sm:rounded-2xl">
          <Dialog aria-label="Menú principal" className="flex h-full min-h-0 flex-col outline-none">
            {({ close }) => (
              <>
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-200/70 px-3 py-3">
                  <SidebarBrand mode="mobile" />
                  <Button
                    onPress={close}
                    aria-label="Cerrar menú"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 outline-none transition hover:bg-zinc-100 focus:ring-2 focus:ring-blue-100"
                  >
                    <FiX size={16} />
                  </Button>
                </div>

                <div className="shrink-0 px-3 pb-3 pt-3">
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

      <CommandPalette
        isOpen={searchOverlayOpen}
        onClose={() => setSearchOverlayOpen(false)}
        navItems={items}
        onSelectPatient={handleSelectPaciente}
        onViewAllPatients={handleViewAllPacientes}
      />

      {pacienteSeleccionado && (
        <FichaPaciente
          key={pacienteSeleccionado.id}
          paciente={pacienteSeleccionado}
          usuario={user}
          onClose={() => setPacienteSeleccionado(null)}
          onRefresh={() => window.dispatchEvent(new Event("ccr:refresh-sidebar"))}
        />
      )}
    </>
  );
}
