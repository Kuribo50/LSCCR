"use client";

import { type ClipboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FiAlertTriangle,
  FiArchive,
  FiCheckCircle,
  FiClipboard,
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
  ImportacionHistorialDetalle,
  ImportacionHistorialItem,
  ImportacionPreviewRegistro,
  ImportacionPreviewResultado,
  ImportacionResultado,
} from "@/lib/types";

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

const PEGADO_HEADERS = [
  "FECHA",
  "NOMBRE",
  "RUT",
  "EDAD",
  "DESDE",
  "DIAGNÓSTICO MÉDICO",
  "PROFESIONAL DERIVADO",
  "GRADO PRIORIDAD",
  "OBSERVACIONES",
  "MAYOR O IGUAL 60",
  "DISCAPACIDAD",
  "CUIDADOR/RA",
  "OBJETIVOS DEL TRATAMIENTO (OBSERVACIONES)",
];

const SIGLAS_DESDE = [
  ["CAR", "CESFAM Alberto Reyes"],
  ["CES", "CECOSF El Santo"],
  ["CCE", "CECOSF Cerro Estanque"],
  ["HT", "Hospital de Tomé"],
  ["HH", "Hospital Higueras"],
  ["FST", "Por confirmar"],
  ["FST HT", "Por confirmar"],
  ["TMT", "Por confirmar"],
  ["TMT HT", "Por confirmar"],
];

const SIGLAS_DESDE_SET = new Set(SIGLAS_DESDE.map(([sigla]) => sigla));
const PRIORIDADES_PEGADO = new Set(["ALTA", "MEDIANA", "MEDIA", "MODERADA", "BAJA"]);
const PROFESIONALES_PEGADO = new Set([
  "KINESIOLOGO",
  "KINESIOLOGA",
  "KINESIOLOGÍA",
  "KINESIOLOGIA",
  "KINESIOLGO",
  "FONOAUDIOLOGIA",
  "FONOAUDIOLOGÍA",
  "TERAPIA OCUPACIONAL",
  "TERAPEUTA OCUPACIONAL",
]);

const PEGADO_EMPTY_ROWS = Array.from({ length: 12 }, () => [] as string[]);

const PEGADO_COLUMN_WIDTHS = [
  "92px",
  "240px",
  "124px",
  "64px",
  "88px",
  "190px",
  "150px",
  "128px",
  "210px",
  "122px",
  "116px",
  "108px",
  "250px",
];

type ModoImportacion = "archivo" | "pegado";

function parsePastedRows(texto: string) {
  const lineas = texto.split(/\r?\n/).filter((linea) => linea.trim().length > 0);
  const muestra = lineas.slice(0, 20).join("\n");
  const tabuladores = (muestra.match(/\t/g) ?? []).length;
  const puntoYComa = (muestra.match(/;/g) ?? []).length;
  const comas = (muestra.match(/,/g) ?? []).length;
  const delimitador = tabuladores > 0 ? "\t" : puntoYComa >= comas ? ";" : ",";
  return lineas.map((linea) => splitDelimitedLine(linea, delimitador));
}

function cleanPastedCell(valor: string) {
  return valor
    .replace(/^"+|"+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitDelimitedLine(linea: string, delimitador: string) {
  const celdas: string[] = [];
  let actual = "";
  let entreComillas = false;

  for (let index = 0; index < linea.length; index += 1) {
    const char = linea[index];
    const siguiente = linea[index + 1];

    if (char === '"') {
      if (entreComillas && siguiente === '"') {
        actual += '"';
        index += 1;
      } else {
        entreComillas = !entreComillas;
      }
      continue;
    }

    if (char === delimitador && !entreComillas) {
      celdas.push(cleanPastedCell(actual));
      actual = "";
      continue;
    }

    actual += char;
  }

  celdas.push(cleanPastedCell(actual));
  return celdas;
}

function normalizePastedLabel(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function isPastedHeaderRow(fila: string[]) {
  const labels = new Set(fila.map(normalizePastedLabel).filter(Boolean));
  if (labels.has("FECHA") || labels.has("DIAGNOSTICO MEDICO")) return true;
  return labels.has("NOMBRE") && labels.has("RUT");
}

function looksLikePastedDate(valor: string) {
  return /^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})$/.test(valor.trim());
}

function looksLikePastedRut(valor: string) {
  if (looksLikePastedDate(valor)) return false;
  const rut = valor.replace(/[^0-9Kk]/g, "").toUpperCase();
  return rut.length >= 7 && /^\d+[0-9K]$/.test(rut);
}

function looksLikePastedAge(valor: string) {
  const edad = Number(valor.trim());
  return Number.isInteger(edad) && edad > 0 && edad < 120;
}

function normalizePastedDataRow(fila: string[]) {
  const limpia = fila.map(cleanPastedCell);
  const dateIndex = limpia.findIndex(looksLikePastedDate);
  const rutIndex = limpia.findIndex(looksLikePastedRut);
  const edadIndex =
    rutIndex >= 0
      ? limpia.findIndex((celda, index) => index > rutIndex && index <= rutIndex + 3 && looksLikePastedAge(celda))
      : -1;
  const desdeIndex =
    edadIndex >= 0
      ? limpia.findIndex(
          (celda, index) =>
            index > edadIndex &&
            index <= edadIndex + 4 &&
            SIGLAS_DESDE_SET.has(normalizePastedLabel(celda)),
        )
      : -1;
  const profesionalIndex = limpia.findIndex(
    (celda, index) =>
      index > Math.max(edadIndex, desdeIndex) &&
      PROFESIONALES_PEGADO.has(normalizePastedLabel(celda)),
  );
  const prioridadIndex = limpia.findIndex(
    (celda, index) =>
      index > profesionalIndex && PRIORIDADES_PEGADO.has(normalizePastedLabel(celda)),
  );

  if (dateIndex < 0 || rutIndex < 0 || edadIndex < 0 || profesionalIndex < 0 || prioridadIndex < 0) {
    return limpia;
  }

  const date = limpia[dateIndex] ?? "";
  const nombre = limpia.slice(dateIndex + 1, rutIndex).filter(Boolean).join(" ").trim() || limpia[1] || "";
  const rut = limpia[rutIndex] ?? "";
  const edad = limpia[edadIndex] ?? "";
  const desde = desdeIndex >= 0 ? limpia[desdeIndex] ?? "" : "";
  const diagnosticoStart = desdeIndex >= 0 ? desdeIndex + 1 : edadIndex + 1;
  const diagnostico = limpia.slice(diagnosticoStart, profesionalIndex).filter(Boolean).join(" ").trim();
  const tail = limpia.slice(prioridadIndex + 1);

  return [
    date,
    nombre,
    rut,
    edad,
    desde,
    diagnostico,
    limpia[profesionalIndex] ?? "",
    limpia[prioridadIndex] ?? "",
    tail[0] ?? "",
    tail[1] ?? "",
    tail[2] ?? "",
    tail[3] ?? "",
    tail.slice(4).filter(Boolean).join(" "),
  ];
}

function parsePastedDataRows(texto: string) {
  return parsePastedRows(texto)
    .filter((fila) => !isPastedHeaderRow(fila))
    .filter((fila) => {
      const noVacias = fila.filter(Boolean);
      return noVacias.length > 0 && !(noVacias.length === 1 && looksLikePastedDate(noVacias[0]));
    })
    .map(normalizePastedDataRow);
}

function formatPeriodoDetectado(label: string) {
  const match = label.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return label;
  const anio = match[1];
  const mes = Number(match[2]);
  return `${MESES[mes - 1] ?? match[2]} ${anio}`;
}

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
  if (registro.estado === "REVISION") {
    return "ccr-preview-status ccr-preview-status-duplicate";
  }
  return "ccr-preview-status ccr-preview-status-ok";
}

function previewEstadoLabel(registro: ImportacionPreviewRegistro) {
  if (registro.estado === "ERROR") return registro.error || "Error";
  if (registro.estado === "DUPLICADO") return "Recurrente";
  if (registro.estado === "REVISION") return registro.motivo_revision || "Revisar";
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

function PreviewCountBadges({
  title,
  counts,
}: {
  title: string;
  counts?: Record<string, number>;
}) {
  const entries = Object.entries(counts ?? {}).filter(([, total]) => total > 0);
  if (entries.length === 0) return null;
  return (
    <div className="rounded-xl border border-[#D4E4D4] bg-white px-3 py-2">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <div className="mt-2 flex max-h-20 flex-wrap gap-2 overflow-auto">
        {entries.slice(0, 12).map(([label, total]) => (
          <span
            key={`${title}-${label}`}
            className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-800"
          >
            {label}: {total}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ImportarPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [modoImportacion, setModoImportacion] = useState<ModoImportacion>("archivo");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [textoPegado, setTextoPegado] = useState("");
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
  const [autoPreviewPegado, setAutoPreviewPegado] = useState(false);
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [descargandoPlantilla, setDescargandoPlantilla] = useState(false);
  const [conflicto, setConflicto] =
    useState<ImportacionConflictoResponse | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [mesGestion, setMesGestion] = useState(() => new Date().getMonth() + 1);
  const [anioGestion, setAnioGestion] = useState(() => new Date().getFullYear());

  const cargarHistorial = useCallback(async () => {
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
  }, []);

  const cargarDetalleGestion = useCallback(
    async (mes = mesGestion, anio = anioGestion) => {
      try {
        const data = await api.get<ImportacionHistorialDetalle>(
          `/importar/historial/${mes}/${anio}/`,
        );
        setDetalleHistorial((prev) => ({ ...prev, [`${mes}-${anio}`]: data }));
      } catch {
        setDetalleHistorial((prev) => ({
          ...prev,
          [`${mes}-${anio}`]: {
            mes,
            anio,
            mes_label: MESES[mes - 1] ?? String(mes),
            items: [],
          },
        }));
      }
    },
    [anioGestion, mesGestion],
  );

  const refrescarGestionActual = useCallback(async () => {
    await cargarHistorial();
    await cargarDetalleGestion(mesGestion, anioGestion);
  }, [anioGestion, cargarDetalleGestion, cargarHistorial, mesGestion]);

  const handlePrevisualizar = useCallback(async () => {
    if (!archivo) return;
    setPreviewLoading(true);
    setError("");
    setResultado(null);
    setConflicto(null);

    try {
      const form = new FormData();
      form.append("archivo", archivo);
      const data = await api.postForm<ImportacionPreviewResultado>(
        "/importar/previsualizar/",
        form,
      );
      setPreview(data);
      setConfirmImportOpen(false);
      toast.info(`Previsualización cargada: ${data.total} registros detectados.`);
    } catch (e: unknown) {
      setPreview(null);
      const message = getErrorMessage(e, "No se pudo previsualizar el archivo.");
      setError(message);
      toast.error(message);
    } finally {
      setPreviewLoading(false);
    }
  }, [archivo, toast]);

  const handlePrevisualizarPegado = useCallback(async () => {
    if (!textoPegado.trim()) {
      setError("Pega las filas de datos desde la hoja de cálculo.");
      return;
    }
    setPreviewLoading(true);
    setError("");
    setResultado(null);
    setConflicto(null);

    try {
      const data = await api.post<ImportacionPreviewResultado>(
        "/importar/previsualizar-pegado/",
        {
          texto: textoPegado,
        },
      );
      setPreview(data);
      setConfirmImportOpen(false);
      toast.info(`Previsualización cargada: ${data.total} registros detectados.`);
    } catch (e: unknown) {
      setPreview(null);
      const message = getErrorMessage(e, "No se pudo previsualizar la planilla pegada.");
      setError(message);
      toast.error(message);
    } finally {
      setPreviewLoading(false);
    }
  }, [textoPegado, toast]);

  useEffect(() => {
    if (user && !["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) {
      router.replace("/pacientes");
    }
  }, [user, router]);

  useEffect(() => {
    if (user && ["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) {
      void cargarHistorial();
    }
  }, [cargarHistorial, user]);

  useEffect(() => {
    if (user && ["ADMIN", "ADMINISTRATIVO"].includes(user.rol)) {
      void cargarDetalleGestion(mesGestion, anioGestion);
    }
  }, [anioGestion, cargarDetalleGestion, mesGestion, user]);

  // Auto-previsualizar al seleccionar archivo
  useEffect(() => {
    if (modoImportacion === "archivo" && archivo) {
      void handlePrevisualizar();
    }
  }, [archivo, handlePrevisualizar, modoImportacion]);

  useEffect(() => {
    if (modoImportacion === "pegado" && autoPreviewPegado && textoPegado.trim()) {
      setAutoPreviewPegado(false);
      void handlePrevisualizarPegado();
    }
  }, [autoPreviewPegado, handlePrevisualizarPegado, modoImportacion, textoPegado]);

  const registrosPreview = useMemo(
    () => preview?.registros ?? [],
    [preview],
  );
  const filasPegadas = useMemo(
    () => parsePastedDataRows(textoPegado).slice(0, 12),
    [textoPegado],
  );
  const filasPlanillaPegado = filasPegadas.length > 0 ? filasPegadas : PEGADO_EMPTY_ROWS;
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

  async function importarArchivo(forzarReemplazo = false, suplementar = false) {
    if (!archivo) return;
    setImportLoading(true);
    setError("");
    setResultado(null);

    try {
      const form = new FormData();
      form.append("archivo", archivo);
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
      setConfirmImportOpen(false);
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

  function aplicarTextoPegado(texto: string, mensaje?: string) {
    setTextoPegado(texto);
    setPreview(null);
    setResultado(null);
    setError("");
    setConflicto(null);
    setConfirmImportOpen(false);
    setAutoPreviewPegado(Boolean(texto.trim()));
    if (mensaje) toast.success(mensaje);
  }

  function handlePegarEnGrilla(event: ClipboardEvent<HTMLDivElement>) {
    const texto = event.clipboardData.getData("text");
    if (!texto.trim()) return;
    event.preventDefault();
    aplicarTextoPegado(texto, "Datos pegados en la grilla.");
  }

  async function pegarDesdePortapapeles() {
    try {
      const texto = await navigator.clipboard.readText();
      if (!texto.trim()) {
        toast.warning("El portapapeles está vacío.");
        return;
      }
      aplicarTextoPegado(texto, "Datos pegados desde el portapapeles.");
    } catch {
      toast.error("No se pudo leer el portapapeles. Usa Ctrl + V dentro del recuadro.");
    }
  }

  async function importarPegado(forzarReemplazo = false, suplementar = false) {
    if (!textoPegado.trim()) return;
    setImportLoading(true);
    setError("");
    setResultado(null);

    try {
      const data = await api.post<ImportacionResultado>(
        "/importar/derivaciones-pegado/",
        {
          texto: textoPegado,
          forzar_reemplazo: forzarReemplazo,
          modo_suplementar: suplementar,
        },
      );
      setResultado(data);
      setConfirmImportOpen(false);
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
        const message = getErrorMessage(e, "Error al importar la planilla pegada.");
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
      setTextoPegado("");
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

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-blue-100 bg-white p-1.5 shadow-sm dark:!border-[#262626] dark:!bg-[#111111]">
            {[
              { value: "archivo" as const, label: "Subir Excel", icon: FiFileText },
              { value: "pegado" as const, label: "Pegar planilla", icon: FiClipboard },
            ].map((opcion) => {
              const Icon = opcion.icon;
              const active = modoImportacion === opcion.value;
              const isArchivo = opcion.value === "archivo";
              return (
                <button
                  key={opcion.value}
                  type="button"
                  onClick={() => {
                    setModoImportacion(opcion.value);
                    setPreview(null);
                    setResultado(null);
                    setError("");
                    setConflicto(null);
                    setConfirmImportOpen(false);
                    setAutoPreviewPegado(false);
                  }}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-black transition ${
                    active && isArchivo
                      ? "border-emerald-200 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                      : active
                        ? "border-blue-200 bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                        : isArchivo
                          ? "border-transparent text-emerald-700 hover:border-emerald-100 hover:bg-emerald-50 dark:!text-emerald-300 dark:hover:!bg-[#18251e]"
                          : "border-transparent text-blue-700 hover:border-blue-100 hover:bg-blue-50 dark:!text-[#8fc4d6] dark:hover:!bg-[#202020]"
                  }`}
                >
                  <Icon size={14} />
                  {opcion.label}
                </button>
              );
            })}
          </div>

          <div className="ccr-panel ccr-dashboard-card rounded-xl p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:!text-white">
                Importación {modoImportacion === "archivo" ? "por Excel" : "por pegado"}
              </h2>
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

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 dark:!border-[#262626] dark:!bg-[#202020]">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
              <label className="block">
                <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">
                  Mes de referencia
                </span>
                <select
                  value={mesGestion}
                  onChange={(event) => {
                    setMesGestion(Number(event.target.value));
                    setPreview(null);
                    setResultado(null);
                    setError("");
                    setConflicto(null);
                  }}
                  className="ccr-control-input px-3 py-2.5 text-sm font-semibold"
                >
                  {MESES.map((mes, index) => (
                    <option key={`import-${mes}`} value={index + 1}>
                      {mes}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">
                  Año de referencia
                </span>
                <select
                  value={anioGestion}
                  onChange={(event) => {
                    setAnioGestion(Number(event.target.value));
                    setPreview(null);
                    setResultado(null);
                    setError("");
                    setConflicto(null);
                  }}
                  className="ccr-control-input px-3 py-2.5 text-sm font-semibold"
                >
                  {Array.from({ length: 7 }, (_, index) => new Date().getFullYear() + 1 - index).map((anio) => (
                    <option key={`import-${anio}`} value={anio}>
                      {anio}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-2 text-[11px] font-semibold text-slate-500 dark:!text-[#b5d8e3]">
              La previsualización e importación usan las fechas reales de la planilla. El periodo detectado aparecerá en el resumen.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            {modoImportacion === "archivo" ? (
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:!text-[#8fc4d6]">
                  Archivo Excel completo
                </label>
                <div
                  className={`group cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${
                    archivo
                      ? "border-emerald-300 bg-emerald-50/70 dark:!border-[#1f4a35] dark:!bg-[#14251d]"
                      : "border-emerald-200 bg-white hover:border-emerald-500 hover:bg-emerald-50/70 dark:!border-[#1f4a35] dark:!bg-[#111111] dark:hover:!bg-[#14251d]"
                  }`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.currentTarget.style.borderColor = "#059669";
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
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-emerald-200 bg-white text-emerald-700 shadow-sm transition group-hover:-translate-y-0.5 dark:!border-[#1f4a35] dark:!bg-[#202020] dark:!text-emerald-300">
                    <FiFileText size={24} />
                  </div>
                  {archivo ? (
                    <div className="mt-4">
                      <p className="text-sm font-black text-emerald-800 dark:!text-white">{archivo.name}</p>
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
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="mb-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void pegarDesdePortapapeles()}
                      className="ccr-control-button inline-flex shrink-0 items-center justify-center gap-2 px-3 py-2 text-xs"
                    >
                      <FiClipboard size={14} />
                      Pegar datos
                    </button>
                  </div>
                  <div
                    tabIndex={0}
                    role="group"
                    aria-label="Grilla para pegar derivaciones"
                    onPaste={handlePegarEnGrilla}
                    className="ccr-data-table ccr-operational-table overflow-hidden rounded-xl border-2 border-dashed border-blue-200 bg-white outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 dark:!border-[#262626] dark:!bg-[#111111]"
                  >
                    <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:!border-[#262626] dark:!bg-[#202020]">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-wide text-slate-700 dark:!text-white">
                          Grilla de pegado
                        </p>
                        <p className="text-[11px] font-semibold text-slate-500 dark:!text-[#b5d8e3]">
                          Clic sobre la tabla y pega con Ctrl + V. No necesitas copiar encabezados.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[11px] font-black text-blue-800 dark:!border-[#262626] dark:!bg-[#111111] dark:!text-[#8fc4d6]">
                          {previewLoading && modoImportacion === "pegado" ? "Previsualizando..." : `${filasPegadas.length} filas`}
                        </span>
                        {textoPegado.trim() && (
                          <button
                            type="button"
                            onClick={() => aplicarTextoPegado("")}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:!border-[#262626] dark:!bg-[#111111] dark:!text-[#daebf1]"
                          >
                            Limpiar
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[360px] overflow-auto">
                      <table className="w-full min-w-[1900px] table-fixed border-collapse text-[11px]">
                        <thead className="sticky top-0 z-10">
                          <tr>
                            <th className="w-10 border-b border-r border-slate-300 bg-slate-100 px-2 py-2 text-center font-black text-slate-500 dark:!border-[#333] dark:!bg-[#202020] dark:!text-[#8fc4d6]">
                              #
                            </th>
                            {PEGADO_HEADERS.map((header, index) => (
                              <th
                                key={header}
                                style={{ width: PEGADO_COLUMN_WIDTHS[index] }}
                                className="border-b border-r border-slate-300 bg-slate-100 px-2 py-2 text-left font-black uppercase tracking-[0.02em] text-slate-700 last:border-r-0 dark:!border-[#333] dark:!bg-[#202020] dark:!text-[#daebf1]"
                              >
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filasPlanillaPegado.map((fila, rowIndex) => (
                            <tr key={`${rowIndex}-${fila.join("-")}`} className="ccr-table-row">
                              <td className="border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] font-bold text-slate-400 dark:!border-[#262626] dark:!bg-[#181818]">
                                {rowIndex + 1}
                              </td>
                              {PEGADO_HEADERS.map((header, cellIndex) => {
                                const value = fila[cellIndex] || "";
                                const placeholder =
                                  !filasPegadas.length && rowIndex === 0 && cellIndex === 0
                                    ? "Pega aquí con Ctrl + V"
                                    : "";
                                return (
                                  <td
                                    key={`${header}-${cellIndex}`}
                                    className="h-8 truncate border-b border-r border-slate-200 px-2 py-1 font-mono text-[11px] font-semibold text-slate-700 last:border-r-0 dark:!border-[#262626] dark:!text-[#daebf1]"
                                  >
                                    {value || (
                                      <span className="font-sans text-[11px] font-bold text-slate-300 dark:!text-[#566]">
                                        {placeholder}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <textarea
                      value={textoPegado}
                      onChange={(event) => aplicarTextoPegado(event.target.value)}
                      placeholder={`2/2/2026\tELISA DEL CARMEN BUSTOS SILVA\t4989993-9\t75\tCAR\tCOXARTROSIS (GES)\tKINESIOLOGO\tALTA\t\t\t\t\t`}
                      spellCheck={false}
                      className="sr-only"
                      tabIndex={-1}
                    />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:!border-red-500/30 dark:!bg-red-500/10 dark:!text-red-200">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setConfirmImportOpen(true)}
                disabled={
                  importLoading ||
                  !preview ||
                  preview.total === 0 ||
                  (modoImportacion === "archivo" ? !archivo : !textoPegado.trim())
                }
                className="ccr-control-button ccr-control-button-primary inline-flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FiCheckCircle size={16} />
                {importLoading ? "Importando..." : "Confirmar e importar"}
              </button>
              {(modoImportacion === "archivo" ? archivo : textoPegado.trim()) && !previewLoading && !preview && (
                <button
                  type="button"
                  onClick={() =>
                    modoImportacion === "archivo"
                      ? void handlePrevisualizar()
                      : void handlePrevisualizarPegado()
                  }
                  className="ccr-control-button inline-flex items-center justify-center gap-2 px-4 py-3 text-sm"
                >
                  <FiRefreshCw size={15} />
                  {modoImportacion === "archivo" ? "Reintentar previsualización" : "Previsualizar planilla"}
                </button>
              )}
            </div>
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
                <PreviewMetric label="Válidos" value={preview.validos} tone="green" />
                <PreviewMetric label="Con kine asignado" value={preview.con_kine_asignado ?? 0} tone="blue" />
                <PreviewMetric label="Ingresados" value={preview.ingresados ?? 0} tone="green" />
                <PreviewMetric label="Pendientes" value={preview.pendientes ?? 0} />
                <PreviewMetric label="Históricos" value={preview.asignado_historico ?? 0} tone="amber" />
                <PreviewMetric label="Recurrentes" value={preview.recurrentes ?? preview.duplicados} tone="amber" />
                <PreviewMetric label="Errores" value={preview.errores_count ?? preview.errores.length} tone="red" />
                <PreviewMetric label="Sin kine" value={preview.sin_kine_asignado ?? 0} />
                <PreviewMetric label="Meses" value={Object.keys(preview.periodos_detectados ?? preview.meses_detectados).length} />
              </div>

              <div className="grid gap-2 lg:grid-cols-3">
                <PreviewCountBadges
                  title="Conteo por SectorCesfam"
                  counts={preview.conteo_sector_cesfam}
                />
                <PreviewCountBadges
                  title="Conteo por CATEGORIA"
                  counts={preview.conteo_categoria}
                />
                <PreviewCountBadges
                  title="Conteo por KINE ASIGNADO"
                  counts={preview.conteo_kine_asignado}
                />
              </div>

              {Object.keys(preview.periodos_detectados ?? preview.meses_detectados).length > 0 && (
                <div className="rounded-xl border border-[#D4E4D4] bg-[#E7F3EC] px-3 py-2">
                  <p className="text-[11px] font-black uppercase tracking-wide text-[#1B5E3B]">Periodos detectados</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(preview.periodos_detectados ?? preview.meses_detectados).map(([mes, total]) => (
                      <span key={mes} className="rounded-full border border-[#D4E4D4] bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700">
                        {formatPeriodoDetectado(mes)}: {total}
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
                    <table className="w-full min-w-[1280px] border-collapse text-xs">
                      <thead className="sticky top-0 z-10 bg-white">
                        <tr className="border-b border-slate-200">
                          {[
                            "Estado",
                            "Hoja",
                            "Fila",
                            "Fecha",
                            "SECTOR OFICIAL",
                            "SectorCesfam",
                            "Paciente",
                            "RUT",
                            "Edad",
                            "KINE asignado",
                            "Estado sugerido",
                            "Diagnóstico",
                            "Profesional",
                            "Prioridad",
                            "Categoría",
                            "Asignado histórico",
                          ].map((label) => (
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
                            <td className="max-w-[150px] px-3 py-2.5 text-slate-600">
                              <span className="block truncate">{registro.sector_oficial || "-"}</span>
                            </td>
                            <td className="max-w-[150px] px-3 py-2.5 font-semibold text-slate-600">
                              <span className="block truncate">{registro.sector_cesfam || "-"}</span>
                            </td>
                            <td className="max-w-[210px] px-3 py-2.5 font-bold text-slate-800">
                              <span className="block truncate">{registro.nombre || "-"}</span>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-slate-600">{registro.rut || "-"}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-600">{registro.edad || "-"}</td>
                            <td className="max-w-[170px] px-3 py-2.5 font-semibold text-slate-600">
                              <span className="block truncate">{registro.kine_asignado || "Sin asignar"}</span>
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-slate-600">{registro.estado_sugerido || "PENDIENTE"}</td>
                            <td className="max-w-[190px] px-3 py-2.5 text-slate-700">
                              <span className="block truncate">{registro.diagnostico || "-"}</span>
                            </td>
                            <td className="max-w-[150px] px-3 py-2.5 text-slate-600">
                              <span className="block truncate">{registro.profesional || "-"}</span>
                            </td>
                            <td className="px-3 py-2.5 font-semibold text-slate-600">{registro.prioridad || "-"}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-600">{registro.categoria || "-"}</td>
                            <td className="px-3 py-2.5 font-semibold text-slate-600">
                              {registro.asignado_historico ? "SI" : "NO"}
                            </td>
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
              <p className="mt-4 text-sm font-bold text-slate-600 dark:!text-[#daebf1]">
                {modoImportacion === "archivo" ? "Analizando archivo..." : "Analizando planilla pegada..."}
              </p>
            </div>
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-white/80 text-center dark:!border-[#262626] dark:!bg-[#111111]">
              <FiShield className="text-blue-300" size={38} />
              <p className="mt-3 text-sm font-bold text-slate-500 dark:!text-[#daebf1]">El resumen aparecerá aquí</p>
              <p className="mt-1 text-xs text-slate-400 dark:!text-[#6ab0c8]">
                {modoImportacion === "archivo"
                  ? "Selecciona un archivo para comenzar."
                  : "Pega la planilla y previsualiza antes de importar."}
              </p>
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

          {resultado.errores.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm dark:!border-[#262626] dark:!bg-[#202020] sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold text-blue-900 dark:!text-white">
                Solo los errores quedaron en revisión. Los válidos se cargaron y los recurrentes se registraron automáticamente en historial.
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
                Estos registros no se cargaron en lista de espera. Corrígelos o resuélvelos desde revisión.
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

      {confirmImportOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="ccr-panel w-full max-w-lg rounded-xl p-5">
            <h2 className="text-lg font-black text-slate-900 dark:!text-white">
              Confirmar importación
            </h2>
            <p className="mt-2 text-sm font-medium text-slate-600 dark:!text-[#b5d8e3]">
              Se subirá la planilla usando los periodos detectados por sus fechas reales. Revisa la previsualización antes de confirmar.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                <p className="text-lg font-black text-blue-800">{preview.total}</p>
                <p className="font-bold text-slate-500">detectados</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2">
                <p className="text-lg font-black text-emerald-700">{preview.validos}</p>
                <p className="font-bold text-slate-500">nuevos</p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                <p className="text-lg font-black text-amber-700">{preview.recurrentes ?? preview.duplicados}</p>
                <p className="font-bold text-slate-500">recurrentes</p>
              </div>
              <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                <p className="text-lg font-black text-red-700">{preview.errores_count ?? preview.errores.length}</p>
                <p className="font-bold text-slate-500">errores</p>
              </div>
            </div>
            {(preview.errores_count ?? preview.errores.length) > 0 && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                Hay errores en la previsualización. Esos registros no se cargarán en lista de espera y quedarán en revisión; los válidos y recurrentes se procesarán automáticamente.
              </p>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmImportOpen(false)}
                className="ccr-control-button px-4 py-2 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={importLoading}
                onClick={() => {
                  setConfirmImportOpen(false);
                  if (modoImportacion === "archivo") {
                    void importarArchivo(false);
                  } else {
                    void importarPegado(false);
                  }
                }}
                className="ccr-control-button ccr-control-button-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {importLoading ? "Importando..." : "Sí, importar corte"}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <button
                type="button"
                onClick={() =>
                  modoImportacion === "archivo"
                    ? void importarArchivo(false, true)
                    : void importarPegado(false, true)
                }
                className="ccr-control-button ccr-control-button-primary px-4 py-2 text-sm"
              >
                Complementar datos
              </button>
              <button
                type="button"
                onClick={() =>
                  modoImportacion === "archivo"
                    ? void importarArchivo(true)
                    : void importarPegado(true)
                }
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100"
              >
              Sobrescribir y limpiar mes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
