"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClipboard,
  FiExternalLink,
  FiFileText,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type {
  ImportacionRevisionActionResultado,
  ImportacionRevisionEstado,
  ImportacionRevisionItem,
  ImportacionRevisionResultado,
  ImportacionRevisionTipo,
} from "@/lib/types";
import { formatearRut, limpiarRut } from "@/lib/rut";

const TYPE_FILTERS: Array<{ label: string; value: "TODOS" | ImportacionRevisionTipo }> = [
  { label: "Todos", value: "TODOS" },
  { label: "Errores", value: "ERROR" },
  { label: "Recurrentes", value: "RECURRENTE" },
];

const STATUS_FILTERS: Array<{ label: string; value: "TODOS" | ImportacionRevisionEstado }> = [
  { label: "Pendientes", value: "PENDIENTE" },
  { label: "Resueltos", value: "RESUELTO" },
  { label: "Descartados", value: "DESCARTADO" },
  { label: "Todos", value: "TODOS" },
];

type RevisionForm = {
  nombre: string;
  rut: string;
  fecha_derivacion: string;
  edad: string;
  diagnostico: string;
  prioridad: string;
  percapita_desde: string;
  profesional: string;
  observaciones: string;
};

function badgeClass(item: ImportacionRevisionItem) {
  if (item.estado_revision === "RESUELTO") {
    return "border-green-200 bg-green-50 text-green-700 dark:!border-green-400/40 dark:!bg-green-500/15 dark:!text-green-100";
  }
  if (item.estado_revision === "DESCARTADO") {
    return "border-slate-200 bg-slate-50 text-slate-500 dark:!border-[#262626] dark:!bg-[#111111] dark:!text-[#6ab0c8]";
  }
  if (item.tipo === "ERROR") {
    return item.requiere_revision
      ? "border-red-200 bg-red-50 text-red-700 dark:!border-red-400/40 dark:!bg-red-500/15 dark:!text-red-100"
      : "border-amber-200 bg-amber-50 text-amber-700 dark:!border-amber-300/40 dark:!bg-amber-400/15 dark:!text-amber-100";
  }
  return "border-blue-200 bg-blue-50 text-blue-800 dark:!border-[#262626] dark:!bg-[#202020] dark:!text-white";
}

function estadoRevisionLabel(item: ImportacionRevisionItem) {
  if (item.estado_revision === "RESUELTO") return "Resuelto";
  if (item.estado_revision === "DESCARTADO") return "Descartado";
  if (item.tipo === "RECURRENTE") return "Se mantiene";
  if (item.requiere_revision) return "Revisar datos";
  return "Vinculado a ficha";
}

function toInputDate(value: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formFromItem(item: ImportacionRevisionItem): RevisionForm {
  return {
    nombre: item.paciente_nombre || item.nombre || "",
    rut: formatearRut(item.paciente_rut || item.rut || ""),
    fecha_derivacion: toInputDate(item.fecha_derivacion || item.fecha_original),
    edad: item.edad ? String(item.edad) : "",
    diagnostico: item.diagnostico || "",
    prioridad: item.prioridad || "MODERADA",
    percapita_desde: item.percapita_desde || "",
    profesional: item.profesional || "",
    observaciones: item.observaciones || "",
  };
}

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function RevisionImportacionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<ImportacionRevisionResultado | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tipo, setTipo] = useState<"TODOS" | ImportacionRevisionTipo>("TODOS");
  const [estado, setEstado] = useState<"TODOS" | ImportacionRevisionEstado>("PENDIENTE");
  const [search, setSearch] = useState("");
  const [seleccionado, setSeleccionado] = useState<ImportacionRevisionItem | null>(null);
  const [form, setForm] = useState<RevisionForm | null>(null);
  const [resolucion, setResolucion] = useState("");
  const [modalError, setModalError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (user && !["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) {
      router.replace("/inicio");
    }
  }, [user, router]);

  async function cargarRevision() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("estado", estado);
      if (tipo !== "TODOS") params.set("tipo", tipo);
      const response = await api.get<ImportacionRevisionResultado>(`/importar/revision/?${params.toString()}`);
      setData(response);
    } catch {
      setData({ total: 0, pendientes: 0, resueltos: 0, descartados: 0, items: [] });
      setError("No se pudo cargar la revisión de importaciones.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user && ["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) {
      void cargarRevision();
    }
  }, [user, tipo, estado]);

  function abrirRevision(item: ImportacionRevisionItem) {
    setSeleccionado(item);
    setForm(formFromItem(item));
    setResolucion(item.resolucion || "");
    setModalError("");
  }

  function cerrarRevision() {
    if (actionLoading) return;
    setSeleccionado(null);
    setForm(null);
    setResolucion("");
    setModalError("");
  }

  async function enviarAccion(accion: "COMPLETAR" | "DESCARTAR") {
    if (!seleccionado) return;
    setActionLoading(true);
    setModalError("");
    try {
      const payload = {
        accion,
        resolucion,
        paciente: form
          ? {
              ...form,
              rut: limpiarRut(form.rut),
            }
          : undefined,
      };
      await api.patch<ImportacionRevisionActionResultado>(
        `/importar/revision/${seleccionado.importacion_id}/${seleccionado.revision_index}/`,
        payload,
      );
      cerrarRevision();
      await cargarRevision();
      window.dispatchEvent(new CustomEvent("ccr:refresh-sidebar"));
    } catch (e: unknown) {
      if (e && typeof e === "object" && "detail" in e) {
        setModalError((e as { detail: string }).detail);
      } else {
        setModalError("No se pudo actualizar la revisión.");
      }
    } finally {
      setActionLoading(false);
    }
  }

  const itemsFiltrados = useMemo(() => {
    const items = data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [
        item.nombre,
        item.paciente_nombre ?? "",
        item.rut,
        item.diagnostico,
        item.motivo,
        item.hoja,
        item.periodo_label,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data, search]);

  if (!user || !["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) return null;

  return (
    <div className="ccr-dashboard-content space-y-5">
      <header className="ccr-panel ccr-dashboard-card overflow-hidden rounded-xl">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-700 shadow-sm dark:!border-[#262626] dark:!bg-[#202020] dark:!text-[#8fc4d6]">
              <FiClipboard size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700 dark:!text-[#8fc4d6]">
                Bandeja operativa
              </p>
              <h1 className="mt-1 text-2xl font-black text-slate-900 dark:!text-white">
                Revisión de importación
              </h1>
              <p className="mt-1 max-w-3xl text-sm font-medium text-slate-600 dark:!text-[#b5d8e3]">
                Revisa recurrentes y errores de datos. Desde aquí puedes completar ficha o descartar para limpiar la bandeja.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void cargarRevision()}
              className="ccr-button-refresh inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold"
            >
              <FiRefreshCw size={14} />
              Recargar
            </button>
            <Link href="/importar" className="ccr-control-button ccr-control-button-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-xs">
              <FiFileText size={14} />
              Volver a importar
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="ccr-panel rounded-xl border border-blue-100 bg-white p-4 dark:!border-[#262626] dark:!bg-[#111111]">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">Pendientes</p>
          <p className="mt-1 text-2xl font-black text-blue-800 dark:!text-white">{data?.pendientes ?? 0}</p>
        </div>
        <div className="ccr-panel rounded-xl border border-green-100 bg-white p-4 dark:!border-green-400/30 dark:!bg-[#111111]">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">Resueltos</p>
          <p className="mt-1 text-2xl font-black text-green-700 dark:!text-green-100">{data?.resueltos ?? 0}</p>
        </div>
        <div className="ccr-panel rounded-xl border border-slate-200 bg-white p-4 dark:!border-[#262626] dark:!bg-[#111111]">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">Descartados</p>
          <p className="mt-1 text-2xl font-black text-slate-700 dark:!text-white">{data?.descartados ?? 0}</p>
        </div>
        <div className="ccr-panel rounded-xl border border-amber-100 bg-white p-4 dark:!border-amber-300/30 dark:!bg-[#111111]">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">Mostrando</p>
          <p className="mt-1 text-2xl font-black text-amber-600 dark:!text-amber-100">{itemsFiltrados.length}</p>
        </div>
      </section>

      <section className="ccr-panel ccr-dashboard-card rounded-xl p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setEstado(filter.value)}
                className={classes(
                  "rounded-lg border px-3 py-2 text-xs font-black transition",
                  estado === filter.value
                    ? "border-blue-400 bg-blue-700 text-white shadow-sm dark:!border-[#2f63c7] dark:!bg-[#335fdb]"
                    : "border-blue-100 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 dark:!border-[#262626] dark:!bg-[#111111] dark:!text-[#b5d8e3] dark:hover:!bg-[#202020]",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 lg:flex-row">
            <div className="flex flex-wrap gap-2">
              {TYPE_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setTipo(filter.value)}
                  className={classes(
                    "rounded-lg border px-3 py-2 text-xs font-black transition",
                    tipo === filter.value
                      ? "border-blue-300 bg-blue-100 text-blue-900 dark:!border-blue-400/60 dark:!bg-blue-500/20 dark:!text-white"
                      : "border-blue-100 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 dark:!border-[#262626] dark:!bg-[#111111] dark:!text-[#b5d8e3] dark:hover:!bg-[#202020]",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="relative w-full lg:w-80">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nombre, RUT o motivo"
                className="ccr-control-input w-full py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:!border-red-500/30 dark:!bg-red-500/10 dark:!text-red-100">
          {error}
        </div>
      )}

      <section className="ccr-panel ccr-data-table overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-blue-100 px-5 py-4 dark:!border-[#262626]">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:!text-white">Lista de observaciones</h2>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:!text-[#b5d8e3]">
              Cada fila queda pendiente hasta resolverla o descartarla.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm font-bold text-slate-500 dark:!text-[#b5d8e3]">Cargando revisión...</div>
        ) : itemsFiltrados.length === 0 ? (
          <div className="p-8 text-center">
            <FiCheckCircle className="mx-auto text-blue-400" size={34} />
            <p className="mt-3 text-sm font-black text-slate-700 dark:!text-white">Bandeja limpia</p>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:!text-[#b5d8e3]">No hay observaciones con los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="overflow-auto bg-white dark:!bg-[#151515]">
            <table className="w-full min-w-[1180px] border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="ccr-table-head border-b border-blue-200 bg-blue-50 dark:!border-[#262626] dark:!bg-[#202020]">
                  {[
                    "Paciente",
                    "RUT",
                    "Periodo",
                    "Origen",
                    "Diagnóstico",
                    "Motivo",
                    "Estado",
                    "Acciones",
                  ].map((label) => (
                    <th key={label} className="border-r border-blue-100 px-3 py-3 text-left text-[11px] font-black uppercase tracking-wide text-blue-950 last:border-r-0 dark:!border-[#262626] dark:!text-white">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itemsFiltrados.map((item) => (
                  <tr key={item.id} className="ccr-table-row border-b border-blue-50 bg-white transition hover:bg-blue-50/70 dark:!border-[#262626] dark:!bg-[#151515] dark:hover:!bg-[#202020]">
                    <td className="px-3 py-3 font-bold text-slate-800 dark:!text-white">
                      <span className="block max-w-[220px] truncate">{item.paciente_nombre || item.nombre || "Paciente sin nombre"}</span>
                      <span className="mt-0.5 block text-[10px] font-semibold text-slate-400 dark:!text-[#6ab0c8]">
                        {item.paciente_id_ccr || "Sin ficha operativa vinculada"}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-slate-600 dark:!text-[#b5d8e3]">{item.rut ? formatearRut(item.rut) : "-"}</td>
                    <td className="px-3 py-3 font-semibold text-slate-600 dark:!text-[#b5d8e3]">{item.periodo_label}</td>
                    <td className="px-3 py-3 text-slate-600 dark:!text-[#b5d8e3]">{item.hoja || "Sin hoja"} · fila {item.fila ?? "-"}</td>
                    <td className="max-w-[210px] px-3 py-3 text-slate-700 dark:!text-[#daebf1]"><span className="block truncate">{item.diagnostico || "Sin diagnóstico"}</span></td>
                    <td className="max-w-[260px] px-3 py-3 text-slate-600 dark:!text-[#b5d8e3]"><span className="block truncate">{item.motivo || item.accion}</span></td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${badgeClass(item)}`}>
                        {estadoRevisionLabel(item)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => abrirRevision(item)} className="ccr-control-button ccr-control-button-primary px-3 py-1.5 text-xs">
                          Revisar
                        </button>
                        {item.paciente_rut && (
                          <Link href={`/paciente/${limpiarRut(item.paciente_rut)}`} className="ccr-control-button inline-flex items-center gap-1 px-3 py-1.5 text-xs">
                            <FiExternalLink size={12} /> Ficha
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {seleccionado && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="ccr-panel max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-xl shadow-2xl">
            <div className="flex items-start justify-between border-b border-blue-100 px-5 py-4 dark:!border-[#262626]">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 dark:!text-[#8fc4d6]">Revisar observación</p>
                <h2 className="mt-1 text-xl font-black text-slate-900 dark:!text-white">
                  {seleccionado.paciente_nombre || seleccionado.nombre || "Paciente sin nombre"}
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:!text-[#b5d8e3]">
                  {seleccionado.periodo_label} · {seleccionado.hoja || "Sin hoja"} · fila {seleccionado.fila ?? "-"}
                </p>
              </div>
              <button type="button" onClick={cerrarRevision} className="ccr-control-button p-2">
                <FiX size={16} />
              </button>
            </div>

            <div className="max-h-[calc(92vh-78px)] overflow-y-auto p-5">
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-3">
                  <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4 text-sm dark:!border-amber-300/30 dark:!bg-amber-400/10">
                    <p className="font-black text-amber-800 dark:!text-amber-100">Por qué está aquí</p>
                    <p className="mt-2 font-semibold text-amber-800 dark:!text-amber-100">{seleccionado.motivo || seleccionado.tipo_label}</p>
                    <p className="mt-2 text-xs font-medium text-amber-700 dark:!text-amber-100">{seleccionado.accion}</p>
                  </div>

                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs dark:!border-[#262626] dark:!bg-[#202020]">
                    <p className="font-black uppercase tracking-wide text-blue-900 dark:!text-white">Ficha actual</p>
                    <div className="mt-3 space-y-2 text-slate-600 dark:!text-[#b5d8e3]">
                      <p><span className="font-black">Estado:</span> {estadoRevisionLabel(seleccionado)}</p>
                      <p><span className="font-black">Ficha:</span> {seleccionado.paciente_id_ccr || "No vinculada"}</p>
                      <p><span className="font-black">Responsable CCR:</span> {seleccionado.kine_asignado_nombre || "Sin asignar"}</p>
                      <p><span className="font-black">Archivo:</span> {seleccionado.archivo_nombre}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">
                      Nombre
                      <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="ccr-control-input mt-1 w-full px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">
                      RUT
                      <input value={form.rut} onChange={(e) => setForm({ ...form, rut: formatearRut(e.target.value) })} className="ccr-control-input mt-1 w-full px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">
                      Fecha derivación
                      <input type="date" value={form.fecha_derivacion} onChange={(e) => setForm({ ...form, fecha_derivacion: e.target.value })} className="ccr-control-input mt-1 w-full px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">
                      Edad
                      <input type="number" min="0" value={form.edad} onChange={(e) => setForm({ ...form, edad: e.target.value })} className="ccr-control-input mt-1 w-full px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6] sm:col-span-2">
                      Diagnóstico
                      <input value={form.diagnostico} onChange={(e) => setForm({ ...form, diagnostico: e.target.value })} className="ccr-control-input mt-1 w-full px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">
                      Prioridad
                      <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} className="ccr-control-input mt-1 w-full px-3 py-2.5 text-sm">
                        <option value="ALTA">Alta</option>
                        <option value="MEDIANA">Mediana</option>
                        <option value="MODERADA">Moderada</option>
                        <option value="LICENCIA_MEDICA">Licencia médica</option>
                      </select>
                    </label>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">
                      Percápita / desde
                      <input value={form.percapita_desde} onChange={(e) => setForm({ ...form, percapita_desde: e.target.value })} className="ccr-control-input mt-1 w-full px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6] sm:col-span-2">
                      Profesional
                      <input value={form.profesional} onChange={(e) => setForm({ ...form, profesional: e.target.value })} className="ccr-control-input mt-1 w-full px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6] sm:col-span-2">
                      Observaciones del paciente
                      <textarea value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} rows={3} className="ccr-control-input mt-1 w-full px-3 py-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6] sm:col-span-2">
                      Resolución del funcionario
                      <textarea value={resolucion} onChange={(e) => setResolucion(e.target.value)} rows={3} placeholder="Ej: se corrigió fecha, se confirmó duplicado, se descarta por no corresponder..." className="ccr-control-input mt-1 w-full px-3 py-2.5 text-sm" />
                    </label>
                  </div>

                  {modalError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:!border-red-400/40 dark:!bg-red-500/15 dark:!text-red-100">
                      {modalError}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 border-t border-blue-100 pt-4 dark:!border-[#262626] sm:flex-row sm:justify-end">
                    <button type="button" disabled={actionLoading} onClick={() => void enviarAccion("DESCARTAR")} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:!border-red-500 dark:!bg-red-950 dark:!text-red-100">
                      <FiTrash2 size={15} />
                      Descartar
                    </button>
                    <button type="button" disabled={actionLoading} onClick={() => void enviarAccion("COMPLETAR")} className="ccr-control-button ccr-control-button-primary px-4 py-2 text-sm disabled:opacity-50">
                      {actionLoading ? "Guardando..." : "Completar y crear ficha"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
