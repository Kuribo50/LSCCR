"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FiCheck, FiChevronDown, FiPlus, FiX } from "react-icons/fi";
import { normalizeSearchText } from "@/lib/utils";

export interface OpcionAutocompletar {
  value: string;
  label: string;
  /** Clase de color para un punto a la izquierda (ej. "bg-[#4CA35A]"). */
  dot?: string;
  /** Texto chico a la derecha (ej. rol o cantidad). */
  detalle?: string;
}

/**
 * Selector con búsqueda: se escribe para filtrar y se elige con clic o Enter.
 * Con `permitirLibre` acepta un texto que no esté en la lista.
 * Con `onAgregar`, un texto nuevo muestra «Agregar …» para sumarlo al catálogo.
 */
export default function Autocompletar({
  value,
  onChange,
  opciones,
  placeholder = "Buscar...",
  permitirLibre = false,
  ariaLabel,
  className = "",
  onAgregar,
}: {
  value: string;
  onChange: (value: string) => void;
  opciones: OpcionAutocompletar[];
  placeholder?: string;
  permitirLibre?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Guarda un texto nuevo en el catálogo; después queda elegido. */
  onAgregar?: (texto: string) => void | Promise<void>;
}) {
  const seleccion = opciones.find((o) => o.value === value);
  const [abierto, setAbierto] = useState(false);
  const mostrado = seleccion?.label ?? value;
  const [texto, setTexto] = useState(mostrado);
  const [activo, setActivo] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const listaId = useId();

  useEffect(() => {
    if (!abierto) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  });

  const filtradas = useMemo(() => {
    const q = normalizeSearchText(texto);
    const exacta = seleccion && texto === seleccion.label;
    if (!q || exacta) return opciones.slice(0, 60);
    return opciones.filter((o) => normalizeSearchText(o.label).includes(q)).slice(0, 60);
  }, [texto, opciones, seleccion]);

  const textoNuevo = texto.trim();
  const puedeAgregar =
    Boolean(onAgregar) &&
    abierto &&
    textoNuevo.length > 0 &&
    !opciones.some((o) => normalizeSearchText(o.label) === normalizeSearchText(textoNuevo));

  async function agregar() {
    if (!onAgregar || !textoNuevo) return;
    await onAgregar(textoNuevo);
    onChange(textoNuevo);
    setTexto(textoNuevo);
    setAbierto(false);
  }

  function elegir(op: OpcionAutocompletar) {
    onChange(op.value);
    setTexto(op.label);
    setAbierto(false);
  }

  function cerrar() {
    setAbierto(false);
    if (permitirLibre) {
      const t = texto.trim();
      const coincide = opciones.find((o) => normalizeSearchText(o.label) === normalizeSearchText(t));
      onChange(coincide ? coincide.value : t);
      if (coincide) setTexto(coincide.label);
    } else {
      setTexto(seleccion?.label ?? "");
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <input
        value={abierto ? texto : mostrado}
        aria-label={ariaLabel}
        role="combobox"
        aria-controls={listaId}
        aria-expanded={abierto}
        aria-autocomplete="list"
        placeholder={placeholder}
        onFocus={() => {
          // Un valor que no está en la lista no filtra: se muestran todas las opciones.
          setTexto(seleccion || permitirLibre ? mostrado : "");
          setAbierto(true);
          setActivo(0);
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setActivo(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAbierto(true);
            setActivo((i) => Math.min(i + 1, filtradas.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActivo((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (abierto && filtradas[activo]) elegir(filtradas[activo]);
            else if (puedeAgregar) void agregar();
            else cerrar();
          } else if (e.key === "Escape") {
            e.stopPropagation();
            cerrar();
          } else if (e.key === "Tab") {
            cerrar();
          }
        }}
        className="ccr-control-input w-full py-2 pl-3 pr-14 text-sm"
      />
      <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1">
        {value && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Limpiar"
            onClick={() => {
              onChange("");
              setTexto("");
            }}
            className="pointer-events-auto rounded p-0.5 text-slate-500 dark:text-slate-400 hover:text-slate-700"
          >
            <FiX size={13} />
          </button>
        )}
        <FiChevronDown size={14} className={`text-slate-500 dark:text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
      </div>

      {abierto && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-[0_18px_48px_-16px_rgba(22,24,27,0.35)] dark:border-ink-black-600 dark:bg-ink-black-800"
        >
          {puedeAgregar && (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                void agregar();
              }}
              className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 text-[13px] font-bold text-blue-700 hover:bg-blue-50 dark:border-ink-black-700 dark:text-blue-300 dark:hover:bg-blue-500/10"
            >
              <FiPlus size={13} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">Agregar «{textoNuevo.toUpperCase()}»</span>
            </li>
          )}
          {filtradas.length === 0 ? (
            !puedeAgregar && (
              <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
                {permitirLibre && texto.trim() ? `Se usará "${texto.trim()}"` : "Sin resultados"}
              </li>
            )
          ) : (
            filtradas.map((op, i) => (
              <li
                key={op.value}
                role="option"
                aria-selected={op.value === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(op);
                }}
                onMouseEnter={() => setActivo(i)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] ${
                  i === activo ? "bg-blue-50 dark:bg-blue-500/10" : ""
                } text-slate-800 dark:text-ink-black-100`}
              >
                {op.dot && <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${op.dot}`} />}
                <span className="min-w-0 flex-1 truncate">{op.label}</span>
                {op.detalle && <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">{op.detalle}</span>}
                {op.value === value && <FiCheck size={13} className="shrink-0 text-blue-600" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
