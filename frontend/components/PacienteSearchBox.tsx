"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FiSearch, FiUser, FiX } from "react-icons/fi";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { CATEGORIA_LABELS, ESTADO_LABELS, PRIORIDAD_LABELS } from "@/lib/types";
import type { Estado, Paciente, Usuario } from "@/lib/types";
import { formatearRut, limpiarRut } from "@/lib/rut";

const MIN_SEARCH_LENGTH = 2;
const MAX_RESULTS = 12;
const SEARCH_HISTORY_KEY = "ccr:paciente-search-history";
const MAX_HISTORY = 6;
const LISTA_ESPERA_ESTADOS = new Set<Estado>(["PENDIENTE", "RESCATE"]);
const ESTADOS_EGRESO = new Set<Estado>([
  "ABANDONO",
  "ALTA_MEDICA",
  "EGRESO_VOLUNTARIO",
  "EGRESO_ADMINISTRATIVO",
  "DERIVADO",
]);

type SearchSectionId = "lista-espera" | "ingresados" | "egresados";

type SearchGroup = {
  id: SearchSectionId;
  label: string;
  items: Paciente[];
};

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function pareceRut(value: string) {
  return /^[0-9.\-\skK]+$/.test(value) && /\d/.test(value);
}

function normalizarTexto(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function terminoParaApi(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (pareceRut(trimmed)) return limpiarRut(trimmed);
  return trimmed;
}

function pacienteSearchIndex(paciente: Paciente) {
  return [
    paciente.id_ccr,
    paciente.nombre,
    limpiarRut(paciente.rut),
    paciente.diagnostico,
    paciente.sector_cesfam,
    paciente.sector_oficial,
    paciente.kine_asignado_nombre,
    paciente.responsable_nombre,
    paciente.profesional,
    paciente.percapita_desde,
    paciente.observaciones,
    ESTADO_LABELS[paciente.estado] ?? paciente.estado,
    PRIORIDAD_LABELS[paciente.prioridad] ?? paciente.prioridad,
    CATEGORIA_LABELS[paciente.categoria] ?? paciente.categoria,
  ]
    .map((value) => normalizarTexto(String(value ?? "")))
    .join(" ");
}

function coincideBusquedaAmplia(paciente: Paciente, term: string) {
  const texto = normalizarTexto(term);
  const rut = limpiarRut(term);
  return (
    (texto.length >= MIN_SEARCH_LENGTH && pacienteSearchIndex(paciente).includes(texto)) ||
    (rut.length >= MIN_SEARCH_LENGTH && limpiarRut(paciente.rut).includes(rut))
  );
}

function responsablePaciente(paciente: Paciente) {
  return paciente.kine_asignado_nombre || paciente.responsable_nombre || "Sin responsable";
}

function seccionPaciente(paciente: Paciente): SearchSectionId | null {
  if (LISTA_ESPERA_ESTADOS.has(paciente.estado)) return "lista-espera";
  if (paciente.estado === "INGRESADO") return "ingresados";
  if (ESTADOS_EGRESO.has(paciente.estado)) return "egresados";
  return null;
}

function puedeVerEnBuscador(paciente: Paciente, usuario: Usuario | null) {
  const seccion = seccionPaciente(paciente);
  if (!seccion) return false;
  if (usuario?.rol !== "KINE") return true;
  if (seccion === "lista-espera") return true;
  return paciente.kine_asignado === usuario.id;
}

function agruparResultados(pacientes: Paciente[], usuario: Usuario | null): SearchGroup[] {
  const grupos: Record<SearchSectionId, Paciente[]> = {
    "lista-espera": [],
    ingresados: [],
    egresados: [],
  };

  pacientes.forEach((paciente) => {
    if (!puedeVerEnBuscador(paciente, usuario)) return;
    const seccion = seccionPaciente(paciente);
    if (!seccion) return;
    grupos[seccion].push(paciente);
  });

  const orden: Array<{ id: SearchSectionId; label: string }> = [
    { id: "lista-espera", label: "Lista de espera" },
    { id: "ingresados", label: "Ingresados" },
    { id: "egresados", label: "Egresados" },
  ];

  let restantes = MAX_RESULTS;
  return orden
    .map(({ id, label }) => {
      const items = grupos[id].slice(0, Math.max(0, restantes));
      restantes -= items.length;
      return { id, label, items };
    })
    .filter((grupo) => grupo.items.length > 0);
}

function loadHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Paciente[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: Paciente[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items));
}

export default function PacienteSearchBox({
  onSelect,
  onViewAll,
  autoFocus = false,
  className,
  inputClassName,
  size = "desktop",
}: {
  onSelect: (paciente: Paciente) => void;
  onViewAll?: (term: string) => void;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  size?: "desktop" | "mobile" | "overlay";
}) {
  const { user } = useAuth();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const [query, setQuery] = useState("");
  const [suggestionGroups, setSuggestionGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [history, setHistory] = useState<Paciente[]>([]);

  const searchTerm = useMemo(() => terminoParaApi(query), [query]);
  const canSearch = searchTerm.length >= MIN_SEARCH_LENGTH;
  const showHistory = !query.trim();
  const suggestions = useMemo(
    () => suggestionGroups.flatMap((grupo) => grupo.items),
    [suggestionGroups],
  );
  const visibleHistory = useMemo(
    () => history.filter((paciente) => puedeVerEnBuscador(paciente, user)),
    [history, user],
  );
  const activeItems = canSearch ? suggestions : showHistory ? visibleHistory : [];
  const indexedSuggestionGroups = useMemo(() => {
    let index = 0;
    return suggestionGroups.map((grupo) => ({
      ...grupo,
      items: grupo.items.map((paciente) => ({
        paciente,
        index: index++,
      })),
    }));
  }, [suggestionGroups]);
  const panelOpen = focused;

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (!autoFocus) return;
    const timeout = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timeout);
  }, [autoFocus]);

  useEffect(() => {
    function onOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setFocused(false);
      }
    }

    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    if (!canSearch) {
      requestIdRef.current += 1;
      setSuggestionGroups([]);
      setLoading(false);
      setSearched(false);
      setError("");
      setHighlightedIndex(showHistory && visibleHistory.length > 0 ? 0 : -1);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setSearched(false);
    setError("");

    const timeout = window.setTimeout(async () => {
      try {
        const data = await api.get<Paciente[]>(
          `/pacientes/?search=${encodeURIComponent(searchTerm)}`,
        );
        if (requestIdRef.current !== requestId) return;
        const vistos = new Set<number>();
        const unicos = data.filter((paciente) => {
          if (!coincideBusquedaAmplia(paciente, searchTerm)) return false;
          if (vistos.has(paciente.id)) return false;
          vistos.add(paciente.id);
          return true;
        });
        const grupos = agruparResultados(unicos, user);
        const total = grupos.reduce((acc, grupo) => acc + grupo.items.length, 0);
        setSuggestionGroups(grupos);
        setHighlightedIndex(total > 0 ? 0 : -1);
      } catch {
        if (requestIdRef.current !== requestId) return;
        setSuggestionGroups([]);
        setHighlightedIndex(-1);
        setError("No se pudo buscar pacientes.");
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
          setSearched(true);
        }
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [canSearch, searchTerm, showHistory, user, visibleHistory.length]);

  function clearSearch() {
    requestIdRef.current += 1;
    setQuery("");
    setSuggestionGroups([]);
    setLoading(false);
    setSearched(false);
    setError("");
    setHighlightedIndex(-1);
  }

  function selectPaciente(paciente: Paciente) {
    const nextHistory = [
      paciente,
      ...history.filter((item) => item.id !== paciente.id),
    ].slice(0, MAX_HISTORY);
    setHistory(nextHistory);
    saveHistory(nextHistory);
    clearSearch();
    setFocused(false);
    onSelect(paciente);
  }

  function viewAllResults() {
    if (!canSearch || !onViewAll) return;
    const term = query.trim();
    clearSearch();
    setFocused(false);
    onViewAll(term);
  }

  function clearHistory() {
    setHistory([]);
    saveHistory([]);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setFocused(false);
      return;
    }

    if (!panelOpen || activeItems.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, activeItems.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter" && highlightedIndex >= 0) {
      event.preventDefault();
      selectPaciente(activeItems[highlightedIndex]);
    }
  }

  function renderPacienteOption(paciente: Paciente, index: number) {
    const active = highlightedIndex === index;
    const sectorCesfam = paciente.sector_cesfam?.trim();
    const sectorOficial = paciente.sector_oficial?.trim();

    return (
      <li key={paciente.id}>
        <button
          id={`${listboxId}-option-${paciente.id}`}
          type="button"
          role="option"
          aria-selected={active}
          onMouseEnter={() => setHighlightedIndex(index)}
          onClick={() => selectPaciente(paciente)}
          className={classes(
            "flex w-full items-start gap-2 px-3 py-2 text-left transition",
            active ? "bg-blue-50" : "bg-white hover:bg-slate-50",
          )}
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-white text-blue-700">
            <FiUser size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-black text-slate-950">
              {paciente.nombre}
            </span>
            <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">
              RUT {formatearRut(paciente.rut)}
            </span>
            <span
              className="mt-0.5 block truncate text-[11px] font-medium text-slate-500"
              title={paciente.diagnostico}
            >
              {paciente.diagnostico}
            </span>
            <span className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                {ESTADO_LABELS[paciente.estado] ?? paciente.estado}
              </span>
              {sectorCesfam && (
                <span className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  Sector CESFAM: {sectorCesfam}
                </span>
              )}
              {sectorOficial && (
                <span className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  Sector oficial: {sectorOficial}
                </span>
              )}
              <span className="max-w-full truncate rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                {responsablePaciente(paciente)}
              </span>
            </span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <div ref={rootRef} className={classes("relative", className)}>
      <div className="group relative">
        <FiSearch
          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-[#335fdb]"
          size={15}
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Buscar paciente por RUT, nombre, sector o diagnóstico"
          aria-expanded={panelOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            highlightedIndex >= 0 && activeItems[highlightedIndex]
              ? `${listboxId}-option-${activeItems[highlightedIndex].id}`
              : undefined
          }
          placeholder="Buscar RUT, nombre, sector..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          className={classes(
            "w-full border border-zinc-200 bg-white pl-9 text-zinc-950 outline-none transition-all placeholder:text-zinc-500 focus:border-[#335fdb] focus:bg-white focus:ring-2 focus:ring-blue-100",
            size === "overlay"
              ? "rounded-2xl py-4 pr-12 text-base shadow-[0_14px_36px_-28px_rgba(51,95,219,0.75)]"
              : "rounded-lg",
            size === "mobile" && "py-2.5 pr-10 text-sm",
            size === "desktop" && "py-2 pr-10 text-xs",
            inputClassName,
          )}
        />

        {query && !loading && (
          <button
            type="button"
            aria-label="Limpiar búsqueda"
            onClick={clearSearch}
            className={classes(
              "absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100",
              size === "overlay" ? "h-8 w-8" : "h-5 w-5",
            )}
          >
            <FiX size={size === "overlay" ? 17 : 13} />
          </button>
        )}

        {loading && (
          <div
            aria-label="Buscando pacientes"
            className={classes(
              "absolute right-3 top-1/2 -translate-y-1/2 rounded-full border-2 border-[#335fdb] border-t-transparent motion-safe:animate-spin",
              size === "overlay" ? "h-5 w-5" : "h-3.5 w-3.5",
            )}
          />
        )}
      </div>

      <div
        id={listboxId}
        role="listbox"
        aria-label="Resultados de búsqueda de pacientes"
        className={classes(
          "absolute left-0 right-0 top-full z-[70] mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_42px_-24px_rgba(15,23,42,0.55)] transition duration-150 motion-reduce:transition-none",
          size === "overlay" && "mt-4 rounded-2xl",
          panelOpen
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            {showHistory ? "Historial de búsqueda" : "Vista previa"}
          </p>
          {showHistory && visibleHistory.length > 0 ? (
            <button
              type="button"
              onClick={clearHistory}
              className="text-[10px] font-bold text-blue-700 transition hover:text-[#284FC0] focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              Borrar historial
            </button>
          ) : (
            <span className="text-[10px] font-bold text-blue-700">
              {loading ? "Buscando..." : `${suggestions.length} resultado${suggestions.length === 1 ? "" : "s"}`}
            </span>
          )}
        </div>

        {error ? (
          <div className="px-3 py-3 text-xs font-semibold text-red-700">{error}</div>
        ) : showHistory && activeItems.length > 0 ? (
          <ul className="max-h-72 overflow-y-auto py-1">
            {activeItems.map((paciente, index) => renderPacienteOption(paciente, index))}
          </ul>
        ) : activeItems.length > 0 ? (
          <div className="max-h-80 overflow-y-auto py-1">
            {indexedSuggestionGroups.map((grupo) => (
              <div key={grupo.id} role="group" aria-label={grupo.label}>
                <div className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  {grupo.label}
                </div>
                <ul>{grupo.items.map(({ paciente, index }) => renderPacienteOption(paciente, index))}</ul>
              </div>
            ))}
          </div>
        ) : searched && !loading ? (
          <div className="px-3 py-4 text-center text-xs font-semibold text-slate-500">
            Sin pacientes para esta búsqueda.
          </div>
        ) : showHistory ? (
          <div className="px-3 py-4 text-center text-xs font-semibold text-slate-500">
            Sin búsquedas recientes.
          </div>
        ) : (
          <div className="px-3 py-4 text-center text-xs font-semibold text-slate-500">
            Escribe al menos 2 caracteres.
          </div>
        )}

        {!showHistory && canSearch && onViewAll && (
          <div className="border-t border-slate-100 p-2">
            <button
              type="button"
              onClick={viewAllResults}
              className="flex w-full items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              Ver todo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
