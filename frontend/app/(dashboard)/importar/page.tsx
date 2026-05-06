"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FiAlertTriangle,
  FiArchive,
  FiCheckCircle,
  FiClock,
  FiDownload,
  FiFileText,
  FiRefreshCw,
  FiShield,
  FiTrash2,
  FiUploadCloud,
} from "react-icons/fi";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import type {
  ImportacionConflictoResponse,
  ImportacionDeletePeriodoResultado,
  ImportacionHistorialDetalle,
  ImportacionHistorialItem,
  ImportacionPreviewRegistro,
  ImportacionPreviewResultado,
  ImportacionResultado,
} from "@/lib/types";
import IngresoManual from "@/components/IngresoManual";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function estadoBadgeStyle(estado: ImportacionHistorialItem["estado"]) {
  if (estado === "COMPLETADO") {
    return { backgroundColor: "#e9f4fb", color: "#335fdb", borderColor: "#a8d4f0" };
  }
  if (estado === "CON_ERRORES") {
    return { backgroundColor: "#FFF7ED", color: "#ca8702", borderColor: "#fdcb68" };
  }
  if (estado === "REEMPLAZADO") {
    return { backgroundColor: "#F8FAFC", color: "#64748B", borderColor: "#CBD5E1" };
  }
  return { backgroundColor: "#e9f4fb", color: "#335fdb", borderColor: "#a8d4f0" };
}

function previewEstadoBadgeClass(registro: ImportacionPreviewRegistro) {
  if (registro.estado === "ERROR") {
    return "ccr-preview-status ccr-preview-status-error";
  }
  if (registro.estado === "DUPLICADO") {
    return "ccr-preview-status ccr-preview-status-duplicate";
  }
  return "ccr-preview-status ccr-preview-status-ok";
}

function previewEstadoLabel(registro: ImportacionPreviewRegistro) {
  if (registro.estado === "ERROR") return registro.error || "Error";
  if (registro.estado === "DUPLICADO") return "Recurrente";
  return "Nuevo";
}

function PreviewMetric({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: number;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  const toneClass = {
    blue: "text-blue-800",
    green: "text-[#1B5E3B]",
    amber: "text-amber-700",
    red: "text-red-700",
  };
  return (
    <div className="rounded-xl border border-[#D4E4D4] bg-white px-3 py-3 text-center">
      <p className={`text-2xl font-black ${toneClass[tone]}`}>{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-slate-500">{label}</p>
    </div>
  );
}

export default function ImportarPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportacionPreviewResultado | null>(
    null,
  );
  const [resultado, setResultado] = useState<ImportacionResultado | null>(null);
  const [historial, setHistorial] = useState<ImportacionHistorialItem[]>([]);
  const [detalleHistorial, setDetalleHistorial] = useState<
    Record<string, ImportacionHistorialDetalle>
  >({});
  const [expandido, setExpandido] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [descargandoPlantilla, setDescargandoPlantilla] = useState(false);
  const [conflicto, setConflicto] =
    useState<ImportacionConflictoResponse | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [mesGestion, setMesGestion] = useState(() => new Date().getMonth() + 1);
  const [anioGestion, setAnioGestion] = useState(() => new Date().getFullYear());
  const [detalleGestion, setDetalleGestion] =
    useState<ImportacionHistorialDetalle | null>(null);
  const [detalleGestionLoading, setDetalleGestionLoading] = useState(false);
  const [deletePeriodoConfirm, setDeletePeriodoConfirm] = useState(false);
  const [deletePeriodoLoading, setDeletePeriodoLoading] = useState(false);
  const [deleteCorteConfirmId, setDeleteCorteConfirmId] = useState<number | null>(null);
  const [deleteCorteLoadingId, setDeleteCorteLoadingId] = useState<number | null>(null);

  useEffect(() => {
    if (user && !["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) {
      router.replace("/pacientes");
    }
  }, [user, router]);

  useEffect(() => {
    if (user && ["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) {
      void cargarHistorial();
    }
  }, [user]);

  useEffect(() => {
    if (user && ["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) {
      setDeletePeriodoConfirm(false);
      setDeleteCorteConfirmId(null);
      void cargarDetalleGestion(mesGestion, anioGestion);
    }
  }, [user, mesGestion, anioGestion]);

  // Auto-previsualizar al seleccionar archivo
  useEffect(() => {
    if (archivo && !previewLoading && !resultado) {
      handlePrevisualizar();
    }
  }, [archivo]);

  const registrosPreview = useMemo(
    () => preview?.registros ?? [],
    [preview],
  );
  const historialAgrupado = useMemo(() => {
    const grupos = new Map<
      string,
      {
        key: string;
        periodoLabel: string;
        mes: number;
        anio: number;
        items: ImportacionHistorialItem[];
        usuarios: string[];
        activo: ImportacionHistorialItem | null;
      }
    >();

    for (const item of historial) {
      const mes = item.mes_datos ?? item.mes;
      const anio = item.anio_datos ?? item.anio;
      const key = `${mes}-${anio}`;
      const existente = grupos.get(key);
      if (existente) {
        existente.items.push(item);
      } else {
        grupos.set(key, {
          key,
          periodoLabel: item.periodo_label,
          mes,
          anio,
          items: [item],
          usuarios: [],
          activo: null,
        });
      }
    }

    return Array.from(grupos.values())
      .map((grupo) => {
        grupo.items.sort(
          (a, b) =>
            new Date(b.fecha_subida).getTime() -
            new Date(a.fecha_subida).getTime(),
        );
        grupo.usuarios = Array.from(
          new Set(
            grupo.items
              .map((item) => item.usuario_nombre)
              .filter(Boolean) as string[],
          ),
        );
        grupo.activo =
          grupo.items.find((item) => item.estado !== "REEMPLAZADO") ??
          grupo.items[0] ??
          null;
        return grupo;
      })
      .sort((a, b) => {
        if (a.anio !== b.anio) return b.anio - a.anio;
        return b.mes - a.mes;
      });
  }, [historial]);

  async function cargarHistorial() {
    setHistorialLoading(true);
    try {
      const data = await api.get<ImportacionHistorialItem[]>(
        "/importar/historial/",
      );
      setHistorial(data);
    } catch {
      setHistorial([]);
    } finally {
      setHistorialLoading(false);
    }
  }

  async function cargarDetalleGestion(mes = mesGestion, anio = anioGestion) {
    setDetalleGestionLoading(true);
    try {
      const data = await api.get<ImportacionHistorialDetalle>(
        `/importar/historial/${mes}/${anio}/`,
      );
      setDetalleGestion(data);
      setDetalleHistorial((prev) => ({ ...prev, [`${mes}-${anio}`]: data }));
    } catch {
      setDetalleGestion({
        mes,
        anio,
        mes_label: MESES[mes - 1] ?? String(mes),
        items: [],
      });
    } finally {
      setDetalleGestionLoading(false);
    }
  }

  async function refrescarGestionActual() {
    await cargarHistorial();
    await cargarDetalleGestion(mesGestion, anioGestion);
  }

  async function cargarDetalle(item: ImportacionHistorialItem) {
    const mes = item.mes_datos ?? item.mes;
    const anio = item.anio_datos ?? item.anio;
    const key = `${mes}-${anio}`;
    if (detalleHistorial[key]) {
      setExpandido(expandido === key ? null : key);
      return;
    }

    try {
      const data = await api.get<ImportacionHistorialDetalle>(
        `/importar/historial/${mes}/${anio}/`,
      );
      setDetalleHistorial((prev) => ({ ...prev, [key]: data }));
      setExpandido(expandido === key ? null : key);
    } catch {
      setExpandido(expandido === key ? null : key);
    }
  }

  async function handlePrevisualizar() {
    if (!archivo) return;
    setPreviewLoading(true);
    setError("");
    setResultado(null);
    setConflicto(null);

    try {
      const form = new FormData();
      form.append("archivo", archivo);
      form.append("mes", String(mesGestion));
      form.append("anio", String(anioGestion));
      const data = await api.postForm<ImportacionPreviewResultado>(
        "/importar/previsualizar/",
        form,
      );
      setPreview(data);
      toast.info(`Previsualización cargada: ${data.total} registros detectados.`);
    } catch (e: unknown) {
      setPreview(null);
      const message = getErrorMessage(e, "No se pudo previsualizar el archivo.");
      setError(message);
      toast.error(message);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function importarArchivo(forzarReemplazo = false, suplementar = false) {
    if (!archivo) return;
    setImportLoading(true);
    setError("");
    setResultado(null);

    try {
      const form = new FormData();
      form.append("archivo", archivo);
      form.append("mes", String(mesGestion));
      form.append("anio", String(anioGestion));
      if (forzarReemplazo) {
        form.append("forzar_reemplazo", "true");
      }
      if (suplementar) {
        form.append("modo_suplementar", "true");
      }
      const data = await api.postForm<ImportacionResultado>(
        "/importar/derivaciones/",
        form,
      );
      setResultado(data);
      setConflicto(null);
      if (data.errores_count || data.errores?.length) {
        toast.warning("Importación completada con observaciones para revisar.");
      } else {
        toast.success("Importación completada correctamente.");
      }
      await refrescarGestionActual();
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "tipo" in e &&
        (e as ImportacionConflictoResponse).tipo === "conflicto_mes"
      ) {
        setConflicto(e as ImportacionConflictoResponse);
        toast.warning("Ya existe una importación para ese periodo.");
      } else {
        const message = getErrorMessage(e, "Error al importar el archivo.");
        setError(message);
        toast.error(message);
      }
    } finally {
      setImportLoading(false);
    }
  }

  async function descargarPlantilla() {
    setDescargandoPlantilla(true);
    setError("");
    try {
      toast.info("Descarga de plantilla iniciada.");
      const blob = await api.getBlob("/importar/plantilla/");
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Plantilla_Derivaciones_CCR.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Plantilla descargada correctamente.");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "No se pudo descargar la plantilla.");
      setError(message);
      toast.error(message);
    } finally {
      setDescargandoPlantilla(false);
    }
  }

  async function handleReset() {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    setResetLoading(true);
    setError("");
    setResetConfirm(false);
    try {
      await api.delete("/importar/reset/");
      setHistorial([]);
      setPreview(null);
      setResultado(null);
      setArchivo(null);
      if (fileRef.current) fileRef.current.value = "";
      await refrescarGestionActual();
      window.dispatchEvent(new CustomEvent("ccr:refresh-sidebar"));
      toast.success("Población reseteada correctamente.");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "No se pudo resetear la población.");
      setError(message);
      toast.error(message);
    } finally {
      setResetLoading(false);
    }
  }

  async function handleDeletePeriodo() {
    if (!deletePeriodoConfirm) {
      setDeletePeriodoConfirm(true);
      return;
    }

    setDeletePeriodoLoading(true);
    setError("");
    try {
      await api.delete<ImportacionDeletePeriodoResultado>(
        `/importar/historial/${mesGestion}/${anioGestion}/`,
      );
      setDeletePeriodoConfirm(false);
      await refrescarGestionActual();
      window.dispatchEvent(new CustomEvent("ccr:refresh-sidebar"));
      toast.success("Mes seleccionado borrado correctamente.");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "No se pudo borrar el mes seleccionado.");
      setError(message);
      toast.error(message);
    } finally {
      setDeletePeriodoLoading(false);
    }
  }

  async function handleDeleteCorte(item: ImportacionHistorialItem) {
    if (deleteCorteConfirmId !== item.id) {
      setDeleteCorteConfirmId(item.id);
      return;
    }

    setDeleteCorteLoadingId(item.id);
    setError("");
    try {
      await api.delete(`/importar/historial/corte/${item.id}/`);
      setDeleteCorteConfirmId(null);
      await refrescarGestionActual();
      window.dispatchEvent(new CustomEvent("ccr:refresh-sidebar"));
      toast.success("Corte seleccionado borrado correctamente.");
    } catch (e: unknown) {
      const message = getErrorMessage(e, "No se pudo borrar el corte seleccionado.");
      setError(message);
      toast.error(message);
    } finally {
      setDeleteCorteLoadingId(null);
    }
  }

  if (!user || !["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) return null;
  return (
    <div className="ccr-dashboard-content space-y-5">
      <header className="ccr-panel ccr-dashboard-card overflow-hidden rounded-xl">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-700 shadow-sm dark:!border-[#262626] dark:!bg-[#202020] dark:!text-[#8fc4d6]">
              <FiUploadCloud size={24} />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700 dark:!text-[#8fc4d6]">
                Gestión de derivaciones
              </p>
              <h1 className="mt-1 text-2xl font-black text-slate-900 dark:!text-white">
                Importar derivaciones
              </h1>
              <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600 dark:!text-[#b5d8e3]">
                Carga archivos Excel, revisa la previsualización y administra cortes mensuales sin salir del flujo.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link href="/historial-mensual" className="ccr-control-button inline-flex items-center justify-center gap-2 px-4 py-2 text-xs">
              <FiArchive size={14} />
              Historial mensual
            </Link>
            <Link href="/importar/revision" className="ccr-control-button inline-flex items-center justify-center gap-2 px-4 py-2 text-xs">
              <FiAlertTriangle size={14} />
              Revisar observaciones
            </Link>
            {user?.rol === "ADMIN" && (
              <button
                type="button"
                onClick={handleReset}
                disabled={resetLoading}
                className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  resetConfirm
                    ? "border-red-500 bg-red-600 text-white hover:bg-red-700"
                    : "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100"
                }`}
              >
                {resetConfirm ? <FiAlertTriangle size={14} /> : <FiTrash2 size={14} />}
                {resetLoading
                  ? "Reseteando..."
                  : resetConfirm
                    ? "Confirmar borrado"
                    : "Resetear población"}
              </button>
            )}
          </div>
        </div>
        {resetConfirm && user?.rol === "ADMIN" && (
          <div className="border-t border-red-100 bg-red-50 px-5 py-3 text-xs font-semibold text-red-700 dark:!border-red-500/30 dark:!bg-red-500/10 dark:!text-red-200">
            Se eliminarán pacientes sin asignar. Los pacientes asignados se conservan.
          </div>
        )}
      </header>

      <section className="ccr-panel ccr-dashboard-card rounded-xl p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-700 dark:!border-[#262626] dark:!bg-[#202020] dark:!text-[#8fc4d6]">
                <FiClock size={18} />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:!text-white">Gestión por corte mensual</h2>
                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:!text-[#b5d8e3]">
                  Selecciona un mes para cargar automáticamente sus cortes y administrar su contenido.
                </p>
              </div>
            </div>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto] xl:max-w-2xl">
            <select
              value={mesGestion}
              onChange={(event) => setMesGestion(Number(event.target.value))}
              className="ccr-control-input px-3 py-2.5 text-sm font-semibold"
            >
              {MESES.map((mes, index) => (
                <option key={mes} value={index + 1}>
                  {mes}
                </option>
              ))}
            </select>
            <select
              value={anioGestion}
              onChange={(event) => setAnioGestion(Number(event.target.value))}
              className="ccr-control-input px-3 py-2.5 text-sm font-semibold"
            >
              {Array.from({ length: 7 }, (_, index) => new Date().getFullYear() + 1 - index).map((anio) => (
                <option key={anio} value={anio}>
                  {anio}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleDeletePeriodo()}
              disabled={deletePeriodoLoading || !detalleGestion || detalleGestion.items.length === 0}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                deletePeriodoConfirm
                  ? "border-red-500 bg-red-600 text-white hover:bg-red-700"
                  : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              <FiTrash2 size={14} />
              {deletePeriodoLoading
                ? "Borrando..."
                : deletePeriodoConfirm
                  ? "Confirmar borrar mes"
                  : "Borrar mes"}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-blue-100 bg-white p-4 dark:!border-[#262626] dark:!bg-[#111111]">
          {detalleGestionLoading ? (
            <p className="text-sm font-semibold text-slate-500 dark:!text-[#b5d8e3]">Cargando cortes del mes...</p>
          ) : detalleGestion && detalleGestion.items.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-black text-slate-900 dark:!text-white">
                  {detalleGestion.mes_label} {detalleGestion.anio}
                </p>
                <p className="text-xs font-semibold text-slate-500 dark:!text-[#b5d8e3]">
                  {detalleGestion.items.length} corte{detalleGestion.items.length !== 1 ? "s" : ""} registrado{detalleGestion.items.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {detalleGestion.items.map((item) => (
                  <article key={item.id} className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 dark:!border-[#262626] dark:!bg-[#202020]">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-black text-slate-900 dark:!text-white">{item.archivo_nombre}</p>
                        <p className="mt-1 text-[11px] font-medium text-slate-500 dark:!text-[#b5d8e3]">
                          {new Date(item.fecha_subida).toLocaleString("es-CL")}
                        </p>
                      </div>
                      <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold" style={estadoBadgeStyle(item.estado)}>
                        {item.estado_label}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                      <div className="rounded-lg bg-white px-2 py-1.5 dark:!bg-[#111111]">
                        <p className="font-black text-slate-900 dark:!text-white">{item.registros_importados}</p>
                        <p className="text-slate-400 dark:!text-[#6ab0c8]">importados</p>
                      </div>
                      <div className="rounded-lg bg-white px-2 py-1.5 dark:!bg-[#111111]">
                        <p className="font-black text-amber-600">{item.duplicados}</p>
                        <p className="text-slate-400 dark:!text-[#6ab0c8]">recurrentes</p>
                      </div>
                      <div className="rounded-lg bg-white px-2 py-1.5 dark:!bg-[#111111]">
                        <p className="font-black text-red-600">{item.errores.length}</p>
                        <p className="text-slate-400 dark:!text-[#6ab0c8]">errores</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/lista-espera?importacion=${item.id}`)}
                        className="ccr-control-button px-3 py-1.5 text-[11px]"
                      >
                        Ver pacientes
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCorte(item)}
                        disabled={deleteCorteLoadingId === item.id}
                        className={`rounded-lg border px-3 py-1.5 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          deleteCorteConfirmId === item.id
                            ? "border-red-500 bg-red-600 text-white hover:bg-red-700"
                            : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        }`}
                      >
                        {deleteCorteLoadingId === item.id
                          ? "Borrando..."
                          : deleteCorteConfirmId === item.id
                            ? "Confirmar borrar"
                            : "Borrar corte"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/40 px-4 py-8 text-center dark:!border-[#262626] dark:!bg-[#202020]">
              <p className="text-sm font-black text-slate-700 dark:!text-white">
                No hay cortes para {MESES[mesGestion - 1]} {anioGestion}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:!text-[#b5d8e3]">
                Cuando subas una planilla de este periodo aparecerá aquí automáticamente.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="ccr-panel ccr-dashboard-card rounded-xl p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:!text-white">Archivo de importación</h2>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:!text-[#b5d8e3]">
                Usa la plantilla oficial para mantener columnas y formatos compatibles.
              </p>
              <p className="mt-2 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-800 dark:!border-[#262626] dark:!bg-[#202020] dark:!text-[#daebf1]">
                Periodo seleccionado: {MESES[mesGestion - 1]} {anioGestion}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void descargarPlantilla()}
              disabled={descargandoPlantilla}
              className="ccr-control-button inline-flex items-center justify-center gap-2 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FiDownload size={14} />
              {descargandoPlantilla ? "Descargando..." : "Plantilla .xlsx"}
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">
                Archivo Excel
              </label>
              <div
                className={`group cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${
                  archivo
                    ? "border-blue-300 bg-blue-50/70 dark:!border-[#262626] dark:!bg-[#202020]"
                    : "border-blue-200 bg-white hover:border-blue-500 hover:bg-blue-50/70 dark:!border-[#262626] dark:!bg-[#111111] dark:hover:!bg-[#202020]"
                }`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.currentTarget.style.borderColor = "#335fdb";
                }}
                onDragLeave={(event) => {
                  event.currentTarget.style.borderColor = "";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.currentTarget.style.borderColor = "";
                  const file = event.dataTransfer.files?.[0];
                  if (file) {
                    setArchivo(file);
                    setPreview(null);
                    setResultado(null);
                    setError("");
                    setConflicto(null);
                  }
                }}
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-700 shadow-sm transition group-hover:-translate-y-0.5 dark:!border-[#262626] dark:!bg-[#202020] dark:!text-[#8fc4d6]">
                  <FiFileText size={24} />
                </div>
                {archivo ? (
                  <div className="mt-4">
                    <p className="text-sm font-black text-blue-800 dark:!text-white">{archivo.name}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500 dark:!text-[#b5d8e3]">
                      {(archivo.size / 1024).toFixed(1)} KB · haz clic o arrastra para cambiar
                    </p>
                  </div>
                ) : (
                  <div className="mt-4">
                    <p className="text-sm font-bold text-slate-700 dark:!text-white">
                      Arrastra el archivo aquí o selecciona desde tu equipo
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-400 dark:!text-[#6ab0c8]">Formatos: .xlsx / .xls</p>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(event) => {
                  setArchivo(event.target.files?.[0] ?? null);
                  setPreview(null);
                  setResultado(null);
                  setError("");
                  setConflicto(null);
                }}
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:!border-red-500/30 dark:!bg-red-500/10 dark:!text-red-200">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => void importarArchivo(false)}
                disabled={!archivo || !preview || preview.total === 0 || importLoading}
                className="ccr-control-button ccr-control-button-primary inline-flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FiCheckCircle size={16} />
                {importLoading ? "Importando..." : "Confirmar e importar"}
              </button>
              {archivo && !previewLoading && !preview && (
                <button
                  type="button"
                  onClick={handlePrevisualizar}
                  className="ccr-control-button inline-flex items-center justify-center gap-2 px-4 py-3 text-sm"
                >
                  <FiRefreshCw size={15} />
                  Reintentar previsualización
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="ccr-panel ccr-dashboard-card rounded-xl p-5">
          {preview ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:!text-white">Previsualización del archivo</h2>
                  <p className="mt-1 text-xs font-medium text-slate-500 dark:!text-[#b5d8e3]">
                    Revisa el corte antes de guardar pacientes y observaciones.
                  </p>
                </div>
                {(preview.errores_count ?? preview.errores.length) > 0 && (
                  <Link href="/importar/revision" className="ccr-control-button inline-flex items-center justify-center gap-2 px-3 py-2 text-xs">
                    <FiAlertTriangle size={13} />
                    Ir a revisión
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                <PreviewMetric label="Total detectados" value={preview.total} />
                <PreviewMetric label="Nuevos" value={preview.nuevos ?? preview.validos} tone="green" />
                <PreviewMetric label="Recurrentes" value={preview.recurrentes ?? preview.duplicados} tone="amber" />
                <PreviewMetric label="Errores" value={preview.errores_count ?? preview.errores.length} tone="red" />
                <PreviewMetric label="Meses detectados" value={Object.keys(preview.meses_detectados).length} />
              </div>

              {Object.keys(preview.meses_detectados).length > 0 && (
                <div className="rounded-xl border border-[#D4E4D4] bg-[#E7F3EC] px-3 py-2">
                  <p className="text-[11px] font-black uppercase tracking-wide text-[#1B5E3B]">Meses detectados</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(preview.meses_detectados).map(([mes, total]) => (
                      <span key={mes} className="rounded-full border border-[#D4E4D4] bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700">
                        {mes}: {total}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {registrosPreview.length > 0 ? (
                <div className="ccr-preview-shell overflow-hidden rounded-xl">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-700">
                      Registros detectados
                    </p>
                    <p className="text-[11px] font-bold text-[#335fdb]">
                      {preview.registros.length} registros
                    </p>
                  </div>
                  <div className="max-h-[640px] overflow-auto">
                    <table className="w-full min-w-[980px] border-collapse text-xs">
                      <thead className="sticky top-0 z-10 bg-white">
                        <tr className="border-b border-slate-200">
                          {["Estado", "Hoja", "Fila", "Fecha", "Paciente", "RUT", "Diagnóstico", "Prioridad", "Categoría"].map((label) => (
                            <th key={label} className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide text-slate-500">
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {registrosPreview.map((registro, index) => (
                          <tr key={`${registro.hoja ?? "SIN"}-${registro.fila}-${index}-compacto`} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex max-w-[150px] items-center ${previewEstadoBadgeClass(registro)}`}>
                                <span className="truncate">{previewEstadoLabel(registro)}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-slate-600">{registro.hoja || "-"}</td>
                            <td className="px-3 py-2.5 font-mono text-slate-500">{registro.fila}</td>
                            <td className="px-3 py-2.5 text-slate-600">{registro.fecha_derivacion || "-"}</td>
                            <td className="max-w-[210px] px-3 py-2.5 font-bold text-slate-800">
                              <span className="block truncate">{registro.nombre || "-"}</span>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-slate-600">{registro.rut || "-"}</td>
                            <td className="max-w-[190px] px-3 py-2.5 text-slate-700">
                              <span className="block truncate">{registro.diagnostico || "-"}</span>
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-slate-600">{registro.prioridad || "-"}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-600">{registro.categoria || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-semibold text-amber-800 dark:!border-amber-300/40 dark:!bg-amber-400/15 dark:!text-amber-100">
                  No se encontraron filas compatibles en el Excel. Revisa que la planilla tenga encabezados como Nombre, RUT, Diagnóstico y Fecha de derivación.
                </div>
              )}

              {preview.errores.length > 0 && (
                <div className="max-h-32 overflow-auto rounded-xl border border-red-100 bg-red-50 p-3 text-[11px] text-red-700 dark:!border-red-400/40 dark:!bg-red-500/15 dark:!text-red-100">
                  <p className="mb-1 font-black">Errores detectados</p>
                  {preview.errores.slice(0, 5).map((item, index) => (
                    <p key={index}>Fila {item.fila}: {item.motivo}</p>
                  ))}
                  {preview.errores.length > 5 && <p>Y {preview.errores.length - 5} más.</p>}
                </div>
              )}
            </div>
          ) : previewLoading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-white text-center dark:!border-[#262626] dark:!bg-[#111111]">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
              <p className="mt-4 text-sm font-bold text-slate-600 dark:!text-[#daebf1]">Analizando archivo...</p>
            </div>
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-white/80 text-center dark:!border-[#262626] dark:!bg-[#111111]">
              <FiShield className="text-blue-300" size={38} />
              <p className="mt-3 text-sm font-bold text-slate-500 dark:!text-[#daebf1]">El resumen aparecerá aquí</p>
              <p className="mt-1 text-xs text-slate-400 dark:!text-[#6ab0c8]">Selecciona un archivo para comenzar.</p>
            </div>
          )}
        </div>
      </section>

      {resultado && (
        <section className="ccr-panel ccr-dashboard-card rounded-xl p-5">
          <h2 className="text-base font-black text-slate-900 dark:!text-white">Resultado final</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:!border-[#262626] dark:!bg-[#111111]">
              <p className="text-2xl font-black text-slate-900 dark:!text-white">{resultado.total}</p>
              <p className="text-xs font-semibold text-slate-500 dark:!text-[#b5d8e3]">Total detectado</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:!border-[#262626] dark:!bg-[#202020]">
              <p className="text-2xl font-black text-blue-800 dark:!text-white">{resultado.importados}</p>
              <p className="text-xs font-semibold text-blue-700 dark:!text-[#b5d8e3]">Importados</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-2xl font-black text-amber-700">{resultado.duplicados}</p>
              <p className="text-xs font-semibold text-amber-700">Duplicados</p>
            </div>
          </div>

          {(resultado.errores.length > 0 || resultado.duplicados > 0) && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm dark:!border-[#262626] dark:!bg-[#202020] sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold text-blue-900 dark:!text-white">
                Se guardaron recurrentes y errores de datos en la bandeja de revisión del corte.
              </p>
              <Link href="/importar/revision" className="ccr-control-button ccr-control-button-primary inline-flex items-center justify-center gap-2 px-3 py-2 text-xs">
                <FiAlertTriangle size={13} />
                Abrir revisión
              </Link>
            </div>
          )}

          {resultado.errores.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-bold text-red-700 dark:!text-red-100">Detalle de errores enviados a revisión</p>
                <Link href="/importar/revision" className="ccr-control-button inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs">
                  <FiAlertTriangle size={13} />
                  Abrir revisión
                </Link>
              </div>
              <p className="mb-3 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-800 dark:!border-amber-300/30 dark:!bg-amber-400/10 dark:!text-amber-100">
                Estos registros quedan guardados para revisión. Si el RUT coincide con una ficha operativa existente, se agrega una observación en el historial del paciente.
              </p>
              <div className="max-h-48 space-y-1 overflow-auto">
                {resultado.errores.map((err, index) => (
                  <div key={index} className="flex gap-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs">
                    <span className="font-mono text-red-500">{err.hoja ? `${err.hoja} · ` : ""}Fila {err.fila}</span>
                    <span className="text-red-700">{err.motivo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="ccr-panel ccr-dashboard-card rounded-xl p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900 dark:!text-white">Historial de cortes mensuales</h2>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:!text-[#b5d8e3]">
              Revisa qué se procesó, quién subió el corte y si un período fue reemplazado.
            </p>
          </div>
          {historialLoading && <span className="text-xs font-semibold text-slate-400">Cargando historial...</span>}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {historialAgrupado.map((grupo) => {
            const expanded = expandido === grupo.key;
            const detalle = detalleHistorial[grupo.key];
            const activo = grupo.activo;
            const tachado = activo?.estado === "REEMPLAZADO";

            if (!activo) return null;

            return (
              <article key={grupo.key} className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm dark:!border-[#262626] dark:!bg-[#111111]" style={{ opacity: tachado ? 0.72 : 1 }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:!text-white" style={{ textDecoration: tachado ? "line-through" : "none" }}>
                      {grupo.periodoLabel}
                    </h3>
                    <p className="mt-1 text-[11px] font-medium text-slate-500 dark:!text-[#b5d8e3]">
                      {grupo.items.length} corte{grupo.items.length !== 1 ? "s" : ""} registrado{grupo.items.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <span className="rounded-full border px-2.5 py-1 text-[11px] font-bold" style={estadoBadgeStyle(activo.estado)}>
                    {activo.estado_label}
                  </span>
                </div>

                <div className="mt-3 space-y-1 text-xs font-medium text-slate-600 dark:!text-[#b5d8e3]">
                  <p>{activo.registros_importados} registros importados</p>
                  <p>Última carga: {new Date(activo.fecha_subida).toLocaleString("es-CL")}</p>
                  <p>Usuario{grupo.usuarios.length !== 1 ? "s" : ""}: {grupo.usuarios.join(", ") || "No disponible"}</p>
                </div>

                <button type="button" onClick={() => void cargarDetalle(activo)} className="ccr-control-button mt-4 px-3 py-1.5 text-xs">
                  {expanded ? "Ocultar detalle" : "Ver detalle"}
                </button>

                {expanded && (
                  <div className="mt-3 space-y-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3 dark:!border-[#262626] dark:!bg-[#202020]">
                    {detalle?.items?.map((detalleItem) => (
                      <div key={detalleItem.id} className="space-y-1 border-b border-blue-100 pb-2 last:border-b-0 last:pb-0 dark:!border-[#262626]">
                        <p className="text-[11px] font-bold text-slate-700 dark:!text-white">
                          {new Date(detalleItem.fecha_subida).toLocaleString("es-CL")}
                        </p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-slate-500 dark:!text-[#b5d8e3]">
                            Estado: {detalleItem.estado_label} · Duplicados: {detalleItem.duplicados}
                          </p>
                          <button type="button" onClick={() => router.push(`/lista-espera?importacion=${detalleItem.id}`)} className="text-[10px] font-black text-blue-700 hover:underline dark:!text-[#8fc4d6]">
                            Ver corte
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:!text-[#b5d8e3]">
                          Subido por: <span className="font-bold text-slate-700 dark:!text-white">{detalleItem.usuario_nombre || "No disponible"}</span>
                        </p>
                        {detalleItem.errores.length > 0 ? (
                          <div className="space-y-1">
                            {detalleItem.errores.map((err, index) => (
                              <div key={`${detalleItem.id}-${index}`} className="rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-700">
                                {err.hoja ? `${err.hoja} · ` : ""}Fila {err.fila}: {err.motivo}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-500 dark:!text-[#b5d8e3]">Sin errores registrados.</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <IngresoManual />

      {conflicto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="ccr-panel w-full max-w-xl rounded-xl p-5">
            <h2 className="text-lg font-black text-slate-900 dark:!text-white">Ya existen datos para estos meses</h2>
            <p className="mt-2 text-sm font-medium text-slate-600 dark:!text-[#b5d8e3]">{conflicto.mensaje}</p>

            <div className="mt-4 space-y-2">
              {conflicto.conflictos.map((item) => (
                <div key={`${item.mes}-${item.anio}-${item.importacion_id}`} className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm text-slate-700 dark:!border-[#262626] dark:!bg-[#202020] dark:!text-[#daebf1]">
                  <p className="font-bold">{item.hoja} {item.anio}</p>
                  <p className="text-xs text-slate-500 dark:!text-[#b5d8e3]">
                    Importación previa: {item.importados_previos} registros · {new Date(item.fecha_subida_previa).toLocaleString("es-CL")}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs font-medium text-slate-500 dark:!text-[#b5d8e3]">
              Complementar suma meses de espera a pacientes existentes y agrega los nuevos sin borrar lo anterior.
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button type="button" onClick={() => setConflicto(null)} className="ccr-control-button order-last px-4 py-2 text-sm sm:order-first">
                Cancelar
              </button>
              <button type="button" onClick={() => void importarArchivo(false, true)} className="ccr-control-button ccr-control-button-primary px-4 py-2 text-sm">
                Complementar datos
              </button>
              <button type="button" onClick={() => void importarArchivo(true)} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100">
              Sobrescribir y limpiar mes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
