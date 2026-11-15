"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { FiCalendar, FiPlus, FiRefreshCw, FiSearch, FiUsers } from "react-icons/fi";
import MultiSelectFiltro from "@/components/MultiSelectFiltro";
import {
  BadgeTipoGrupo,
  type Candidato,
  candidatoDe,
  DetalleGrupo,
  GrupoModal,
  gruposPorPaciente,
  nombreLegible,
} from "@/components/GruposPacientesVistas";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import { useAPI, unwrapResults } from "@/lib/swr";
import type { GrupoPacientes, Paciente, PaginatedResponse } from "@/lib/types";
import { normalizeRut, normalizeSearchText } from "@/lib/utils";

const ActividadesGrupalesModal = dynamic(() => import("@/components/ActividadesGrupalesModal"), { ssr: false });
const FichaPaciente = dynamic(() => import("@/components/FichaPaciente"), { ssr: false });

type Filtro = "ACTIVOS" | "PERMANENTES" | "TEMPORALES" | "ARCHIVADOS";
type Panel = { tipo: "detalle"; id: number } | null;

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "ACTIVOS", label: "Activos" },
  { id: "PERMANENTES", label: "Permanentes" },
  { id: "TEMPORALES", label: "Temporales" },
  { id: "ARCHIVADOS", label: "Archivados" },
];

// useSearchParams necesita un limite de Suspense para el prerender.
export default function GruposPage() {
  return (
    <Suspense fallback={null}>
      <GruposContenido />
    </Suspense>
  );
}

function GruposContenido() {
  const { user } = useAuth();
  const { toast } = useToast();
  const reducir = useReducedMotion();
  const [fichaPaciente, setFichaPaciente] = useState<Paciente | null>(null);
  const esKine = user?.rol === "KINE";
  const puedeCrear = user?.rol === "KINE" || user?.rol === "ADMIN";

  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("ACTIVOS");
  const [responsables, setResponsables] = useState<string[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [citando, setCitando] = useState<GrupoPacientes | null>(null);
  const [actividadesAbiertas, setActividadesAbiertas] = useState(false);
  const [actividadAbierta, setActividadAbierta] = useState<number | null>(null);
  // Crear o editar se hace en un modal, igual que "Editar paciente".
  const [modalGrupo, setModalGrupo] = useState<{ grupo?: GrupoPacientes } | null>(null);

  const { data, isLoading, mutate } = useAPI<GrupoPacientes[] | PaginatedResponse<GrupoPacientes>>(
    user ? "/grupos-pacientes/?incluir_inactivos=1" : null,
  );
  const grupos = useMemo(() => unwrapResults(data), [data]);
  const { data: dataPacientes } = useAPI<Paciente[] | PaginatedResponse<Paciente>>(
    user ? (esKine ? "/pacientes/?estado=INGRESADO&solo_mios=1" : "/pacientes/?estado=INGRESADO") : null,
  );
  const pacientes = useMemo(() => unwrapResults(dataPacientes).filter((p) => p.estado === "INGRESADO"), [dataPacientes]);
  const candidatos = useMemo<Candidato[]>(
    () => pacientes.map(candidatoDe).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [pacientes],
  );
  const porPaciente = useMemo(() => gruposPorPaciente(grupos), [grupos]);

  // Un temporal vencido sigue activo hasta que alguien lo archive, pero no cuenta como vigente.
  const activos = grupos.filter((g) => g.activo && !g.vencido);
  const vencidos = grupos.filter((g) => g.activo && g.vencido).length;
  const pacientesEnGrupos = porPaciente.size;
  const enVarios = Array.from(porPaciente.values()).filter((l) => l.length > 1).length;

  const opcionesResponsable = useMemo(() => {
    const mapa = new Map<string, { label: string; total: number }>();
    grupos.forEach((g) => {
      if (!g.responsable) return;
      const k = String(g.responsable);
      mapa.set(k, { label: g.responsable_nombre ?? "Sin nombre", total: (mapa.get(k)?.total ?? 0) + 1 });
    });
    return Array.from(mapa.entries())
      .map(([value, v]) => ({ value, label: v.label, total: v.total }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [grupos]);

  // Si la busqueda coincide con un paciente, se indica en la tarjeta del grupo.
  const visibles = useMemo(() => {
    const q = normalizeSearchText(busqueda);
    const rut = normalizeRut(busqueda);
    return grupos
      .filter((g) => {
        if (filtro === "ARCHIVADOS") return !g.activo;
        if (!g.activo) return false;
        if (filtro === "PERMANENTES") return g.tipo === "PERMANENTE";
        if (filtro === "TEMPORALES") return g.tipo === "TEMPORAL";
        return true;
      })
      .filter((g) => responsables.length === 0 || responsables.includes(String(g.responsable)))
      .map((g) => {
        if (!q) return { grupo: g, coincidencias: [] as string[] };
        const coincidencias = g.miembros
          .filter((m) => normalizeSearchText(m.nombre).includes(q) || (!!rut && normalizeRut(m.rut).includes(rut)))
          .map((m) => nombreLegible(m.nombre));
        const porNombre = normalizeSearchText(g.nombre).includes(q) || normalizeSearchText(g.descripcion).includes(q);
        return porNombre || coincidencias.length ? { grupo: g, coincidencias } : null;
      })
      .filter((x): x is { grupo: GrupoPacientes; coincidencias: string[] } => x !== null)
      // Los vencidos van al final: siguen a mano, pero no estorban a los vigentes.
      .sort((a, b) => Number(!!a.grupo.vencido) - Number(!!b.grupo.vencido));
  }, [busqueda, filtro, grupos, responsables]);

  // /grupos?id=N abre ese grupo (p. ej. desde la ficha del paciente).
  const searchParams = useSearchParams();
  const idUrl = Number(searchParams.get("id")) || null;
  const [idAplicado, setIdAplicado] = useState<number | null>(null);
  const grupoUrl = idUrl && idUrl !== idAplicado ? grupos.find((x) => x.id === idUrl) : undefined;
  if (grupoUrl) {
    // Se aplica una vez por id (durante el render, sin efecto): deja visible el grupo pedido.
    setIdAplicado(grupoUrl.id);
    setBusqueda("");
    setResponsables([]);
    setFiltro(grupoUrl.activo ? "ACTIVOS" : "ARCHIVADOS");
    setPanel({ tipo: "detalle", id: grupoUrl.id });
    setFichaPaciente(null);
  }

  // La URL refleja el grupo abierto, para recargar o compartir sin perder la seleccion.
  function seleccionar(id: number) {
    setPanel({ tipo: "detalle", id });
    setIdAplicado(id);
    window.history.replaceState(null, "", `/grupos?id=${id}`);
  }

  // Sin eleccion explicita se muestra el primer grupo de la lista.
  const panelActivo: Panel = panel ?? (visibles[0] ? { tipo: "detalle", id: visibles[0].grupo.id } : null);
  const idSeleccionado = panelActivo?.id ?? null;

  async function recargar() {
    await mutate();
  }

  // La ficha necesita el paciente completo, no solo los datos del miembro.
  async function abrirFicha(id: number) {
    try {
      setFichaPaciente(await api.get<Paciente>(`/pacientes/${id}/`));
    } catch (err) {
      toast.error(getErrorMessage(err, "No se pudo abrir la ficha del paciente."));
    }
  }

  if (!user) return null;

  return (
    <div className="ccr-page-fill space-y-3 text-[13px]">
      <header className="ccr-panel rounded-2xl px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-950 dark:text-white">Grupos de pacientes</h1>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-ink-black-300">
              <span className="font-bold tabular-nums text-blue-600 dark:text-blue-300">{activos.length}</span> grupo{activos.length !== 1 ? "s" : ""} activo{activos.length !== 1 ? "s" : ""}
              {" · "}
              <span className="font-bold tabular-nums text-slate-800 dark:text-ink-black-100">{pacientesEnGrupos}</span> paciente{pacientesEnGrupos !== 1 ? "s" : ""} en grupos
              {enVarios > 0 && (
                <>
                  {" · "}
                  <span className="font-bold tabular-nums text-slate-800 dark:text-ink-black-100">{enVarios}</span> en más de uno
                </>
              )}
              {vencidos > 0 && (
                <>
                  {" · "}
                  <span className="font-bold tabular-nums text-amber-700 dark:text-amber-300">{vencidos}</span>{" "}
                  <span className="text-amber-700 dark:text-amber-300">vencido{vencidos !== 1 ? "s" : ""} por revisar</span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void mutate()} className="ccr-control-button" title="Volver a cargar">
              <FiRefreshCw size={13} aria-hidden="true" />
              Actualizar
            </button>
            <button type="button" onClick={() => setActividadesAbiertas(true)} className="ccr-control-button">
              <FiCalendar size={13} aria-hidden="true" />
              Actividades
            </button>
            {puedeCrear && (
              <button type="button" onClick={() => setModalGrupo({})} className="ccr-control-button-primary">
                <FiPlus size={14} aria-hidden="true" />
                Nuevo grupo
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <FiSearch className="ccr-waitlist-search-icon pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" size={15} aria-hidden="true" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="ccr-control-input w-full pl-9 pr-3"
              placeholder="Buscar grupo o paciente"
              aria-label="Buscar grupo o paciente"
            />
          </div>
          <div className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-ink-black-900" role="tablist" aria-label="Filtrar grupos">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filtro === f.id}
                onClick={() => {
                  setFiltro(f.id);
                  setPanel(null);
                }}
                className={`h-7 rounded-md px-3 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                  filtro === f.id ? "bg-white text-blue-700 shadow-sm dark:bg-ink-black-700 dark:text-blue-200" : "text-slate-500 hover:text-slate-900 dark:text-ink-black-300"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {!esKine && opcionesResponsable.length > 1 && (
            <MultiSelectFiltro label="Responsable" textoTodos values={responsables} opciones={opcionesResponsable} onChange={setResponsables} />
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(250px,310px)_minmax(0,1fr)]">
        {/* Lista de grupos */}
        <section className="ccr-panel flex min-h-0 flex-col overflow-hidden rounded-2xl" aria-label="Lista de grupos">
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="space-y-2 p-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-ink-black-700" />
                ))}
              </div>
            ) : visibles.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <FiUsers className="mx-auto text-slate-300" size={26} aria-hidden="true" />
                <p className="mt-2 text-sm font-bold text-slate-700 dark:text-ink-black-100">
                  {busqueda ? "Sin grupos que coincidan" : filtro === "ARCHIVADOS" ? "No hay grupos archivados" : "Aún no hay grupos"}
                </p>
                {!busqueda && filtro !== "ARCHIVADOS" && puedeCrear && (
                  <p className="mt-1 text-xs font-medium text-slate-500">Crea uno con &quot;Nuevo grupo&quot;.</p>
                )}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {visibles.map(({ grupo: g, coincidencias }, i) => {
                  const activo = idSeleccionado === g.id;
                  return (
                    <motion.li
                      key={g.id}
                      layout={!reducir}
                      initial={reducir ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: reducir ? 0 : Math.min(i, 10) * 0.035 }}
                    >
                      <button
                        type="button"
                        onClick={() => seleccionar(g.id)}
                        aria-current={activo ? "true" : undefined}
                        className={`relative w-full rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/30 ${
                          activo
                            ? "border-blue-300 bg-blue-50/70 dark:border-blue-500/50 dark:bg-blue-500/10"
                            : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-ink-black-600 dark:hover:bg-ink-black-700"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-extrabold text-slate-900 dark:text-ink-black-50">{g.nombre}</span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold tabular-nums text-slate-500">
                            <FiUsers size={11} aria-hidden="true" />
                            {g.total_miembros}
                          </span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <BadgeTipoGrupo grupo={g} />
                          {!esKine && g.responsable_nombre && (
                            <span className="truncate text-[11px] font-medium text-slate-500 dark:text-ink-black-300">{g.responsable_nombre}</span>
                          )}
                        </span>
                        {coincidencias.length > 0 && (
                          <span className="mt-1 block truncate text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                            Incluye a {coincidencias.slice(0, 2).join(", ")}
                            {coincidencias.length > 2 ? ` y ${coincidencias.length - 2} más` : ""}
                          </span>
                        )}
                      </button>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Detalle o formulario */}
        <section className="ccr-panel flex min-h-0 flex-col overflow-hidden rounded-2xl" aria-label="Detalle del grupo">
          <AnimatePresence mode="wait" initial={false}>
          {panelActivo ? (
            <motion.div
              key={panelActivo.id}
              initial={reducir ? false : { opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducir ? undefined : { opacity: 0, x: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex min-h-0 flex-1 flex-col"
            >
            <DetalleGrupo
              key={panelActivo.id}
              usuario={user}
              grupo={grupos.find((g) => g.id === panelActivo.id)}
              candidatos={candidatos}
              otrosGrupos={porPaciente}
              onAbrirGrupo={(id) => {
                setFiltro("ACTIVOS");
                setBusqueda("");
                seleccionar(id);
              }}
              onAbrirActividad={(id) => setActividadAbierta(id)}
              onAbrirPaciente={(id) => void abrirFicha(id)}
              onEditar={(g) => setModalGrupo({ grupo: g })}
              onCitar={(g) => setCitando(g)}
              onCambio={recargar}
            />
            </motion.div>
          ) : (
            <div key="vacio" className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <FiUsers className="text-slate-300" size={32} aria-hidden="true" />
              <p className="mt-2 text-sm font-bold text-slate-700 dark:text-ink-black-100">Elige un grupo para ver sus pacientes</p>
              <p className="mt-1 max-w-sm text-xs font-medium text-slate-500">
                Un paciente puede estar en varios grupos a la vez. Desde aquí puedes agregarlos, quitarlos o citar al grupo a una actividad.
              </p>
            </div>
          )}
          </AnimatePresence>
        </section>
      </div>

      {fichaPaciente && (
        <FichaPaciente
          paciente={fichaPaciente}
          usuario={user}
          onClose={() => setFichaPaciente(null)}
          onRefresh={() => void mutate()}
        />
      )}

      {modalGrupo && (
        <GrupoModal
          usuario={user}
          grupo={modalGrupo.grupo}
          candidatos={candidatos}
          onClose={() => setModalGrupo(null)}
          onGuardado={async (guardado) => {
            await recargar();
            setModalGrupo(null);
            setFiltro(guardado.activo ? "ACTIVOS" : "ARCHIVADOS");
            setBusqueda("");
            seleccionar(guardado.id);
          }}
        />
      )}

      {(citando || actividadesAbiertas || actividadAbierta) && (
        <ActividadesGrupalesModal
          usuario={user}
          pacientesDisponibles={pacientes}
          grupoParaCitar={citando ?? undefined}
          actividadInicial={actividadAbierta ?? undefined}
          onClose={() => {
            setCitando(null);
            setActividadesAbiertas(false);
            setActividadAbierta(null);
          }}
          onCambio={() => void mutate()}
        />
      )}
    </div>
  );
}
