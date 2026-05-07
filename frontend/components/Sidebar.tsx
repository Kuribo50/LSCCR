"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
import type {
  DashboardResumenOperativo,
  ImportacionRevisionResultado,
  Paciente,
  Rol,
} from "@/lib/types";
import { formatearRut, limpiarRut } from "@/lib/rut";

type CountKey = "total" | "mios" | "rescates" | "cola" | "revision";
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
    { href: "/calendario", label: "Calendario de citas", icon: FiCalendar, section: "principal", tone: "text-indigo-700" },
    { href: "/lista-espera", label: "Lista de espera", icon: FiClipboard, section: "principal", tone: "text-cyan-700", countKey: "total" },
    { href: "/mis-pacientes", label: "Mi cartera", icon: FiUsers, section: "principal", tone: "text-sky-700", countKey: "mios" },
    { href: "/llamados", label: "Cola de llamados", icon: FiPhone, section: "gestion", tone: "text-blue-700", countKey: "cola" },
    { href: "/egresos", label: "Historial de egresos", icon: FiClock, section: "gestion", tone: "text-indigo-700" },
    { href: "/analisis/estadisticas", label: "Estadísticas", icon: FiBarChart2, section: "analisis", tone: "text-blue-700" },
  ],
  ADMINISTRATIVO: [
    { href: "/inicio", label: "Dashboard", icon: FiGrid, section: "principal", tone: "text-blue-700" },
    { href: "/calendario", label: "Calendario de citas", icon: FiCalendar, section: "principal", tone: "text-indigo-700" },
    { href: "/llamados", label: "Cola de llamados", icon: FiPhone, section: "gestion", tone: "text-blue-700", countKey: "cola" },
    { href: "/importar", label: "Importar derivaciones", icon: FiUpload, section: "gestion", tone: "text-cyan-700" },
    { href: "/importar/revision", label: "Revisión importación", icon: FiAlertTriangle, section: "gestion", tone: "text-amber-700", countKey: "revision" },
    { href: "/historial-mensual", label: "Historial de cortes", icon: FiClock, section: "gestion", tone: "text-indigo-700" },
    { href: "/egresos", label: "Historial de egresos", icon: FiClock, section: "gestion", tone: "text-indigo-700" },
    { href: "/analisis/estadisticas", label: "Estadísticas", icon: FiBarChart2, section: "analisis", tone: "text-blue-700" },
  ],
  ADMIN: [
    { href: "/inicio", label: "Dashboard", icon: FiGrid, section: "principal", tone: "text-blue-700" },
    { href: "/calendario", label: "Calendario de citas", icon: FiCalendar, section: "principal", tone: "text-indigo-700" },
    { href: "/lista-espera", label: "Lista de espera", icon: FiClipboard, section: "principal", tone: "text-cyan-700", countKey: "total" },
    { href: "/mis-pacientes", label: "Pacientes asignados", icon: FiUsers, section: "principal", tone: "text-sky-700", countKey: "mios" },
    { href: "/llamados", label: "Cola de llamados", icon: FiPhone, section: "gestion", tone: "text-blue-700", countKey: "cola" },
    { href: "/importar", label: "Importar derivaciones", icon: FiUpload, section: "gestion", tone: "text-cyan-700" },
    { href: "/importar/revision", label: "Revisión importación", icon: FiAlertTriangle, section: "gestion", tone: "text-amber-700", countKey: "revision" },
    { href: "/historial-mensual", label: "Historial de cortes", icon: FiClock, section: "gestion", tone: "text-indigo-700" },
    { href: "/egresos", label: "Historial de egresos", icon: FiClock, section: "gestion", tone: "text-indigo-700" },
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
  rol,
  userId,
  mobileOpen,
  onMobileOpenChange,
}: {
  rol: Rol;
  userId: number;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [compact, setCompact] = useState(false);
  const [counts, setCounts] = useState<SidebarCounts>({ total: 0, mios: 0, rescates: 0, cola: 0, revision: 0 });
  const items = useMemo(() => BASE_ITEMS[rol], [rol]);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Paciente[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = useCallback(async (raw: string) => {
    const limpio = limpiarRut(raw);
    if (limpio.length < 3) {
      setSuggestions([]);
      setSearchOpen(false);
      return;
    }
    setLoadingSearch(true);
    try {
      const data = await api.get<Paciente[]>(`/pacientes/?search=${encodeURIComponent(limpio)}`);
      const seen = new Set<string>();
      const uniq = data.filter((p) => {
        if (seen.has(p.rut)) return false;
        seen.add(p.rut);
        return true;
      });
      setSuggestions(uniq.slice(0, 8));
      setSearchOpen(uniq.length > 0);
    } catch {
      setSuggestions([]);
      setSearchOpen(false);
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatearRut(e.target.value);
    setQuery(formatted);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void buscar(formatted), 300);
  }

  function handleSelect(paciente: Paciente) {
    setSearchOpen(false);
    setQuery("");
    setSuggestions([]);
    router.push(`/paciente/${limpiarRut(paciente.rut)}`);
    onMobileOpenChange(false);
  }

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

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
          total: resumen.sin_asignar,
          mios: rol === "ADMIN" ? resumen.asignados_activos : resumen.mios_activos,
          rescates: resumen.rescates_globales,
          cola: resumen.cola_llamados,
          revision: revision?.pendientes ?? 0,
        });
      } catch {
        if (!mounted) return;
        setCounts({ total: 0, mios: 0, rescates: 0, cola: 0, revision: 0 });
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
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#335fdb] text-white">
                <FiActivity size={17} />
              </div>
              <span className="font-bold tracking-tight text-zinc-950">CCR Panel</span>
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
          <div ref={searchRef} className="relative mb-2 px-4 pb-3 pt-1">
            <div className="relative group">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-[#335fdb]" size={14} />
              <input
                type="text"
                aria-label="Buscar paciente por RUT"
                placeholder="Buscar RUT..."
                value={query}
                onChange={handleSearchChange}
                className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-4 text-xs text-zinc-950 outline-none transition-all placeholder:text-zinc-500 focus:border-[#335fdb] focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
              {loadingSearch && <div className="absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />}
            </div>

            {searchOpen && suggestions.length > 0 && (
              <div className="absolute left-4 right-4 top-full z-50 mt-2 overflow-hidden rounded-lg bg-white shadow-lg">
                <ul className="max-h-60 overflow-y-auto">
                  {suggestions.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => handleSelect(p)}
                        className="flex w-full flex-col gap-0.5 bg-white px-3 py-2 text-left transition hover:bg-slate-100"
                      >
                        <span className="truncate text-[11px] font-semibold leading-tight text-slate-950">{p.nombre}</span>
                        <span className="font-mono text-[10px] text-slate-600">{formatearRut(p.rut)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <SidebarNav items={items} pathname={pathname} counts={counts} compact={compact} />

        <div className="mt-auto p-4">
          <div className="flex items-center justify-center rounded-md bg-[#e9edf5] py-2 text-[10px] font-semibold uppercase tracking-wide text-[#335fdb]">
            CCR
          </div>
        </div>
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
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#335fdb] text-white">
                      <FiActivity size={17} />
                    </div>
                    <span className="font-bold tracking-tight text-zinc-950">CCR Panel</span>
                  </div>
                  <Button
                    onPress={close}
                    aria-label="Cerrar menú"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 outline-none transition hover:bg-zinc-100"
                  >
                    <FiX size={16} />
                  </Button>
                </div>

                <div className="relative mt-1 px-4 pb-3">
                  <div className="relative">
                    <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
                    <input
                      type="text"
                      aria-label="Buscar paciente por RUT"
                      placeholder="Buscar RUT..."
                      value={query}
                      onChange={handleSearchChange}
                      className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-sm text-zinc-950 outline-none placeholder:text-zinc-500 focus:border-[#335fdb] focus:bg-white focus:ring-2 focus:ring-blue-100"
                    />
                    {loadingSearch && <div className="absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />}
                  </div>

                  {searchOpen && suggestions.length > 0 && (
                    <div className="absolute left-4 right-4 top-full z-50 mt-2 overflow-hidden rounded-lg bg-white shadow-lg">
                      <ul>
                        {suggestions.map((p) => (
                          <li key={p.id}>
                            <button
                              onClick={() => handleSelect(p)}
                              className="flex w-full flex-col gap-0.5 bg-white px-4 py-3 text-left transition hover:bg-slate-100"
                            >
                              <span className="text-sm font-semibold text-slate-950">{p.nombre}</span>
                              <span className="font-mono text-xs text-slate-600">{formatearRut(p.rut)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <SidebarNav items={items} pathname={pathname} counts={counts} compact={false} onNavigate={close} />

                <div className="mt-auto p-4 pb-8">
                  <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-[#335fdb]">CCR</div>
                </div>
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </>
  );
}
