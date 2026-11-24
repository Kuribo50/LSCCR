"use client";

import {
  type ClipboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FiAlertTriangle,
  FiCalendar,
  FiCheckCircle,
  FiClipboard,
  FiClock,
  FiDownload,
  FiFileText,
  FiRefreshCw,
  FiRepeat,
  FiUploadCloud,
  FiUserPlus,
  FiX,
} from "react-icons/fi";
import RevertirCarga from "@/components/RevertirCarga";
import FondoPestana from "@/components/FondoPestana";
import MenuAcciones from "@/components/MenuAcciones";
import SelectFiltro from "@/components/SelectFiltro";
import ImportarPrevisualizacion, {
  type CorreccionesMap,
} from "@/components/ImportarPrevisualizacion";
import { puedeRevisarCarga, puedeCargarDerivaciones } from "@/lib/roles";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/lib/toast-context";
import type {
  ImportacionConflictoResponse,
  ImportacionPreviewResultado,
  ImportacionResultado,
} from "@/lib/types";
import { sinAcentos } from "@/lib/utils";
import { avisarCargaImportada, useAlCambiarCargas } from "@/lib/cargasEventos";

/** Mes y año que menciona el nombre del archivo ("Derivaciones CCR Octubre 2026.xlsx"), si lo hay. */
function periodoDesdeNombre(
  nombre: string,
): { mes: number; anio: number | null } | null {
  const limpio = sinAcentos(nombre).toLowerCase();
  const idx = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ].findIndex((m) => limpio.includes(m));
  if (idx < 0) return null;
  const anio = limpio.match(/(20\d{2})/);
  return { mes: idx + 1, anio: anio ? Number(anio[1]) : null };
}

// =============================================================================
// Tipos, constantes y helpers de importacion
// =============================================================================

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
const PRIORIDADES_PEGADO = new Set([
  "ALTA",
  "MEDIANA",
  "MEDIA",
  "MODERADA",
  "BAJA",
]);
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
  // Soporta pegado desde Excel/Sheets con tabulador, punto y coma o coma.
  const lineas = texto
    .split(/\r?\n/)
    .filter((linea) => linea.trim().length > 0);
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
  return sinAcentos(valor).toUpperCase().trim();
}

function isPastedHeaderRow(fila: string[]) {
  const labels = new Set(fila.map(normalizePastedLabel).filter(Boolean));
  if (labels.has("FECHA") || labels.has("DIAGNOSTICO MEDICO")) return true;
  return labels.has("NOMBRE") && labels.has("RUT");
}

function looksLikePastedDate(valor: string) {
  return /^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})$/.test(
    valor.trim(),
  );
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
  // Algunas planillas pegadas llegan corridas por celdas vacias. Esta funcion
  // detecta fecha, RUT, edad, profesional y prioridad para reconstruir columnas.
  const limpia = fila.map(cleanPastedCell);
  const dateIndex = limpia.findIndex(looksLikePastedDate);
  const rutIndex = limpia.findIndex(looksLikePastedRut);
  const edadIndex =
    rutIndex >= 0
      ? limpia.findIndex(
          (celda, index) =>
            index > rutIndex &&
            index <= rutIndex + 3 &&
            looksLikePastedAge(celda),
        )
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
      index > profesionalIndex &&
      PRIORIDADES_PEGADO.has(normalizePastedLabel(celda)),
  );

  if (
    dateIndex < 0 ||
    rutIndex < 0 ||
    edadIndex < 0 ||
    profesionalIndex < 0 ||
    prioridadIndex < 0
  ) {
    return limpia;
  }

  const date = limpia[dateIndex] ?? "";
  const nombre =
    limpia
      .slice(dateIndex + 1, rutIndex)
      .filter(Boolean)
      .join(" ")
      .trim() ||
    limpia[1] ||
    "";
  const rut = limpia[rutIndex] ?? "";
  const edad = limpia[edadIndex] ?? "";
  const desde = desdeIndex >= 0 ? (limpia[desdeIndex] ?? "") : "";
  const diagnosticoStart = desdeIndex >= 0 ? desdeIndex + 1 : edadIndex + 1;
  const diagnostico = limpia
    .slice(diagnosticoStart, profesionalIndex)
    .filter(Boolean)
    .join(" ")
    .trim();
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
      return (
        noVacias.length > 0 &&
        !(noVacias.length === 1 && looksLikePastedDate(noVacias[0]))
      );
    })
    .map(normalizePastedDataRow);
}

// =============================================================================
// Componente principal
// =============================================================================

export default function ImportarPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [modoImportacion, setModoImportacion] =
    useState<ModoImportacion>("archivo");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [textoPegado, setTextoPegado] = useState("");
  const [preview, setPreview] = useState<ImportacionPreviewResultado | null>(
    null,
  );
  const [resultado, setResultado] = useState<ImportacionResultado | null>(null);

  // Si la carga se revierte desde otra parte (aviso global o Historial), el resultado ya no aplica.
  useAlCambiarCargas(({ revertida }) => {
    if (revertida && resultado?.importaciones?.some((corte) => corte.id === revertida.corteId)) {
      setResultado(null);
    }
  });
  const [error, setError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const panelPreviewRef = useRef<HTMLDivElement>(null);
  const hayPreview = preview !== null;
  const [importLoading, setImportLoading] = useState(false);
  const [confirmImportOpen, setConfirmImportOpen] = useState(false);
  const [descargandoPlantilla, setDescargandoPlantilla] = useState(false);
  const [conflicto, setConflicto] =
    useState<ImportacionConflictoResponse | null>(null);
  // Mes de corte elegido por el usuario. 0 = detectarlo por las fechas de la planilla.
  const [mesCorte, setMesCorte] = useState(0);
  // true cuando el corte se preseleccionó por el nombre del archivo (no lo eligió el usuario).
  const [corteDesdeNombre, setCorteDesdeNombre] = useState(false);
  const [anioCorte, setAnioCorte] = useState(() => new Date().getFullYear());
  // Los refs evitan que editar dispare de nuevo la previsualizacion automatica.
  const periodoRef = useRef<{ mes: number; anio: number } | null>(null);
  const correccionesRef = useRef<CorreccionesMap>({});
  const periodoForzado =
    mesCorte > 0 ? { mes: mesCorte, anio: anioCorte } : null;

  /** Opciones comunes de previsualizar/importar: mes de corte y correcciones. */
  const opcionesCarga = useCallback(() => {
    const periodo = periodoRef.current;
    const lista = Object.values(correccionesRef.current).filter(
      (c) => c.descartar || Object.keys(c.campos).length > 0,
    );
    return {
      periodo_mes: periodo?.mes,
      periodo_anio: periodo?.anio,
      correcciones: lista.length > 0 ? lista : undefined,
    };
  }, []);

  const handlePrevisualizar = useCallback(async (archivoElegido: File | null = archivo) => {
    // Previsualizar no crea pacientes; solo pide al backend validacion,
    // conteos y observaciones de revision antes de confirmar importacion.
    if (!archivoElegido) return;
    setPreviewLoading(true);
    setError("");
    setResultado(null);
    setConflicto(null);

    try {
      const form = new FormData();
      form.append("archivo", archivoElegido);
      const opciones = opcionesCarga();
      if (opciones.periodo_mes) {
        form.append("periodo_mes", String(opciones.periodo_mes));
        form.append("periodo_anio", String(opciones.periodo_anio));
      }
      if (opciones.correcciones)
        form.append("correcciones", JSON.stringify(opciones.correcciones));
      const data = await api.postForm<ImportacionPreviewResultado>(
        "/importar/previsualizar/",
        form,
      );
      setPreview(data);
      setConfirmImportOpen(false);
      toast.info(`Archivo cargado: ${data.total} registros detectados.`);
    } catch (e: unknown) {
      setPreview(null);
      const message = getErrorMessage(
        e,
        "No se pudo previsualizar el archivo.",
      );
      setError(message);
      toast.error(message);
    } finally {
      setPreviewLoading(false);
    }
  }, [archivo, opcionesCarga, toast]);

  const handlePrevisualizarPegado = useCallback(async (texto: string = textoPegado) => {
    // Mismo contrato que archivo, pero el backend recibe una planilla temporal
    // generada desde texto pegado.
    if (!texto.trim()) {
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
          texto,
          ...opcionesCarga(),
        },
      );
      setPreview(data);
      setConfirmImportOpen(false);
      toast.info(`Archivo cargado: ${data.total} registros detectados.`);
    } catch (e: unknown) {
      setPreview(null);
      const message = getErrorMessage(
        e,
        "No se pudo previsualizar la planilla pegada.",
      );
      setError(message);
      toast.error(message);
    } finally {
      setPreviewLoading(false);
    }
  }, [opcionesCarga, textoPegado, toast]);

  useEffect(() => {
    if (user && !puedeCargarDerivaciones(user)) {
      router.replace("/pacientes");
    }
  }, [user, router]);

  const filasPegadas = useMemo(
    () => parsePastedDataRows(textoPegado).slice(0, 12),
    [textoPegado],
  );
  const filasPlanillaPegado =
    filasPegadas.length > 0 ? filasPegadas : PEGADO_EMPTY_ROWS;
  async function importarArchivo(forzarReemplazo = false, suplementar = false) {
    // Confirmacion final: este paso si crea pacientes y observaciones de revision.
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
      const opciones = opcionesCarga();
      if (opciones.periodo_mes) {
        form.append("periodo_mes", String(opciones.periodo_mes));
        form.append("periodo_anio", String(opciones.periodo_anio));
      }
      if (opciones.correcciones)
        form.append("correcciones", JSON.stringify(opciones.correcciones));
      const data = await api.postForm<ImportacionResultado>(
        "/importar/derivaciones/",
        form,
      );
      setResultado(data);
      avisarCargaImportada();
      setConfirmImportOpen(false);
      setConflicto(null);
      const conError = data.errores_count ?? data.errores?.length ?? 0;
      if (conError > 0) {
        toast.warning(
          `Importación realizada. ${conError} registro${conError !== 1 ? "s" : ""} con error ${conError !== 1 ? "quedaron" : "quedó"} en Revisión de carga.`,
        );
      } else {
        toast.success("Importación realizada correctamente.");
      }
      reiniciarFormulario();
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "tipo" in e &&
        (e as ImportacionConflictoResponse).tipo === "conflicto_mes"
      ) {
        setConflicto(e as ImportacionConflictoResponse);
        toast.warning("Ya existe una carga para el periodo seleccionado.");
      } else {
        const message = getErrorMessage(e, "No se pudo importar el archivo.");
        setError(message);
        toast.error(message);
      }
    } finally {
      setImportLoading(false);
    }
  }

  /** Deja el formulario listo para una nueva carga (el resultado se mantiene visible). */
  function reiniciarFormulario() {
    limpiarCorrecciones();
    setArchivo(null);
    setPreview(null);
    setTextoPegado("");
    setMesCorte(0);
    setCorteDesdeNombre(false);
    periodoRef.current = null;
    if (fileRef.current) fileRef.current.value = "";
  }

  function limpiarCorrecciones() {
    correccionesRef.current = {};
  }

  function revalidar() {
    return modoImportacion === "archivo"
      ? handlePrevisualizar()
      : handlePrevisualizarPegado();
  }

  function cambiarMesCorte(valor: string) {
    const mes = Number(valor);
    setCorteDesdeNombre(false);
    setMesCorte(mes);
    periodoRef.current = mes > 0 ? { mes, anio: anioCorte } : null;
    setResultado(null);
    setConflicto(null);
    if (preview) void revalidar();
  }

  function cambiarAnioCorte(valor: string) {
    const anio = Number(valor);
    setCorteDesdeNombre(false);
    setAnioCorte(anio);
    periodoRef.current = mesCorte > 0 ? { mes: mesCorte, anio } : null;
    setResultado(null);
    setConflicto(null);
    if (preview) void revalidar();
  }

  /** Selecciona el archivo y, si su nombre indica un mes, deja ese corte preseleccionado. */
  function elegirArchivo(file: File) {
    limpiarCorrecciones();
    const detectado = periodoDesdeNombre(file.name);
    if (detectado) {
      const anio = detectado.anio ?? anioCorte;
      setMesCorte(detectado.mes);
      setAnioCorte(anio);
      setCorteDesdeNombre(true);
      periodoRef.current = { mes: detectado.mes, anio };
      toast.info(
        `Corte preseleccionado: ${MESES[detectado.mes - 1]} ${anio} (según el nombre del archivo).`,
      );
    }
    setArchivo(file);
    setPreview(null);
    setResultado(null);
    setError("");
    setConflicto(null);
    // Auto-previsualiza al seleccionar archivo para detectar errores antes de importar.
    void handlePrevisualizar(file);
  }

  function aplicarTextoPegado(texto: string, mensaje?: string) {
    limpiarCorrecciones();
    setTextoPegado(texto);
    setPreview(null);
    setResultado(null);
    setError("");
    setConflicto(null);
    setConfirmImportOpen(false);
    if (mensaje) toast.success(mensaje);
    // Auto-previsualiza el texto pegado.
    if (texto.trim()) void handlePrevisualizarPegado(texto);
  }

  function handlePegarEnGrilla(event: ClipboardEvent<HTMLDivElement>) {
    const texto = event.clipboardData.getData("text");
    if (!texto.trim()) return;
    event.preventDefault();
    aplicarTextoPegado(texto, "Datos pegados correctamente.");
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
      toast.error("No se pudo leer el portapapeles.");
    }
  }

  async function importarPegado(forzarReemplazo = false, suplementar = false) {
    // Importacion desde texto pegado mantiene los mismos controles de conflicto
    // que la carga por archivo mensual.
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
          ...opcionesCarga(),
        },
      );
      setResultado(data);
      avisarCargaImportada();
      setConfirmImportOpen(false);
      setConflicto(null);
      const conError = data.errores_count ?? data.errores?.length ?? 0;
      if (conError > 0) {
        toast.warning(
          `Importación realizada. ${conError} registro${conError !== 1 ? "s" : ""} con error ${conError !== 1 ? "quedaron" : "quedó"} en Revisión de carga.`,
        );
      } else {
        toast.success("Importación realizada correctamente.");
      }
      reiniciarFormulario();
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "tipo" in e &&
        (e as ImportacionConflictoResponse).tipo === "conflicto_mes"
      ) {
        setConflicto(e as ImportacionConflictoResponse);
        toast.warning("Ya existe una carga para el periodo seleccionado.");
      } else {
        const message = getErrorMessage(e, "No se pudo importar la planilla.");
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
      toast.info("Descarga iniciada.");
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

  // Al terminar de analizar, lleva al usuario a la previsualización (queda debajo del formulario).
  useEffect(() => {
    if (!hayPreview) return;
    panelPreviewRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [hayPreview]);

  if (!user || !puedeCargarDerivaciones(user)) return null;

  const vistaPrevia = preview ? (
    <ImportarPrevisualizacion preview={preview} />
  ) : null;

  // Cortes mensuales a los que irá la carga (según el mes elegido o las fechas de la planilla).
  const periodosDestino: { mes: number; anio: number; total: number | null }[] =
    (() => {
      if (!preview) return [];
      if (periodoForzado) return [{ ...periodoForzado, total: preview.total }];
      const conteo = new Map<
        string,
        { mes: number; anio: number; total: number }
      >();
      for (const r of preview.registros) {
        const m = (r.fecha_derivacion ?? "").match(
          /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/,
        );
        if (!m) continue;
        const mes = Number(m[2]);
        if (mes < 1 || mes > 12) continue;
        const clave = `${m[3]}-${mes}`;
        const actual = conteo.get(clave);
        if (actual) actual.total += 1;
        else conteo.set(clave, { mes, anio: Number(m[3]), total: 1 });
      }
      return Array.from(conteo.values()).sort(
        (a, b) => a.anio - b.anio || a.mes - b.mes,
      );
    })();

  // Filas cuya fecha real cae en un mes distinto al corte elegido.
  const filasFueraDelCorte: { mes: number; anio: number; total: number }[] =
    (() => {
      if (!preview || !periodoForzado) return [];
      const conteo = new Map<
        string,
        { mes: number; anio: number; total: number }
      >();
      for (const r of preview.registros) {
        const m = (r.fecha_derivacion ?? "").match(
          /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/,
        );
        if (!m) continue;
        const mes = Number(m[2]);
        const anio = Number(m[3]);
        if (mes === periodoForzado.mes && anio === periodoForzado.anio)
          continue;
        const clave = `${anio}-${mes}`;
        const actual = conteo.get(clave);
        if (actual) actual.total += 1;
        else conteo.set(clave, { mes, anio, total: 1 });
      }
      return Array.from(conteo.values()).sort(
        (a, b) => a.anio - b.anio || a.mes - b.mes,
      );
    })();
  const totalFueraDelCorte = filasFueraDelCorte.reduce(
    (a, p) => a + p.total,
    0,
  );

  const hayOrigen =
    modoImportacion === "archivo" ? !!archivo : !!textoPegado.trim();
  // Acento del modo activo: verde para Subir Excel, azul para Pegar planilla.
  const acento =
    modoImportacion === "archivo"
      ? { solido: "bg-emerald-600" }
      : { solido: "bg-blue-600" };

  return (
    <div className="ccr-dashboard-content space-y-5">
      <section className="grid grid-cols-1 gap-5">
        <div className="space-y-3">
          <div className="ccr-panel ccr-dashboard-card overflow-hidden rounded-2xl">
            {/* Encabezado */}
            <div className="flex items-center justify-between gap-4 p-5 pb-4">
              <div className="min-w-0">
                <h1 className="sr-only">Importar derivaciones</h1>
                <ol className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  {[
                    { n: 1, label: "Origen de datos", done: hayOrigen },
                    { n: 2, label: "Previsualización", done: !!preview },
                    { n: 3, label: "Confirmación", done: !!resultado },
                  ].map((paso, i) => (
                    <li key={paso.n} className="inline-flex items-center gap-2">
                      {i > 0 && (
                        <span
                          className="hidden h-px w-5 bg-slate-300 sm:block dark:bg-[#333]"
                          aria-hidden
                        />
                      )}
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                          paso.done
                            ? `${acento.solido} text-white`
                            : "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                        }`}
                      >
                        {paso.done ? (
                          <FiCheckCircle size={12} />
                        ) : (
                          <span className="tabular-nums">{paso.n}</span>
                        )}
                        {paso.label}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <MenuAcciones
                  acciones={[
                    {
                      label: descargandoPlantilla ? "Descargando…" : "Plantilla .xlsx",
                      detalle: "Planilla modelo para completar",
                      tono: "verde",
                      icon: <FiDownload size={13} aria-hidden="true" />,
                      onClick: () => void descargarPlantilla(),
                      disabled: descargandoPlantilla,
                    },
                    {
                      label: "Historial de cortes",
                      detalle: "Ver las cargas anteriores",
                      tono: "gris",
                      icon: <FiClock size={13} aria-hidden="true" />,
                      onClick: () => router.push("/historial-mensual"),
                    },
                  ]}
                />
              </div>
            </div>

            {/* Pestañas subrayadas: el color de la activa es verde (Excel) o azul (pegado) */}
            <div
              role="tablist"
              className="flex gap-6 border-b border-slate-200 px-5 dark:!border-[#262626]"
            >
              {[
                {
                  value: "archivo" as const,
                  label: "Subir Excel",
                  detalle: "Archivo .xlsx / .xls",
                  icon: FiFileText,
                  solido: "bg-emerald-600",
                  texto: "text-emerald-700 dark:!text-emerald-300",
                },
                {
                  value: "pegado" as const,
                  label: "Pegar planilla",
                  detalle: "Copiar desde Excel",
                  icon: FiClipboard,
                  solido: "bg-blue-600",
                  texto: "text-blue-700 dark:!text-ink-black-100",
                },
              ].map((opcion) => {
                const Icon = opcion.icon;
                const active = modoImportacion === opcion.value;
                return (
                  <button
                    key={opcion.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      limpiarCorrecciones();
                      setModoImportacion(opcion.value);
                      setPreview(null);
                      setResultado(null);
                      setError("");
                      setConflicto(null);
                      setConfirmImportOpen(false);
                      if (opcion.value === "archivo" && archivo) void handlePrevisualizar(archivo);
                    }}
                    className={`relative inline-flex items-center gap-2.5 px-1 pb-3 pt-2 text-sm font-bold transition-colors duration-300 ${
                      active
                        ? opcion.texto
                        : "text-slate-500 hover:text-slate-600 dark:!text-ink-black-400"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="flex flex-col items-start leading-tight">
                      {opcion.label}
                      <span className="text-[10px] font-semibold opacity-70">
                        {opcion.detalle}
                      </span>
                    </span>
                    {active && (
                      <FondoPestana
                        id="importar-modo"
                        className={`!top-auto !h-[3px] rounded-full ${opcion.solido}`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="p-5">
              <div className="mt-4 rounded-xl bg-[var(--bg-elevated)] p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Corte mensual
                </p>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px]">
                  <SelectFiltro
                    label="Mes del corte"
                    value={String(mesCorte)}
                    onChange={cambiarMesCorte}
                    opciones={[
                      { value: "0", label: "Según fechas de la planilla" },
                      ...MESES.map((mes, index) => ({
                        value: String(index + 1),
                        label: mes,
                      })),
                    ]}
                  />
                  <div
                    className={
                      mesCorte === 0 ? "pointer-events-none opacity-50" : ""
                    }
                  >
                    <SelectFiltro
                      label="Año"
                      value={String(anioCorte)}
                      onChange={cambiarAnioCorte}
                      opciones={Array.from({ length: 7 }, (_, index) => {
                        const anio = new Date().getFullYear() + 1 - index;
                        return { value: String(anio), label: String(anio) };
                      })}
                    />
                  </div>
                </div>
                {corteDesdeNombre && mesCorte > 0 && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white">
                    <FiCheckCircle size={12} />
                    Detectado por el nombre del archivo
                  </p>
                )}
                <p className="mt-2 text-[11px] font-semibold leading-relaxed text-[var(--text-muted)]">
                  {mesCorte === 0
                    ? "Cada derivación se agrupa en el mes de su fecha. Elige un mes si toda la planilla pertenece a un mismo corte."
                    : `Toda la planilla se guardará como corte de ${MESES[mesCorte - 1]} ${anioCorte}. Las fechas de derivación no cambian.`}
                </p>
              </div>

              <div className="mt-5 space-y-4">
                {modoImportacion === "archivo" ? (
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:!text-ink-black-300">
                      Archivo Excel completo
                    </label>
                    {!archivo && (
                      <div
                        className="group cursor-pointer rounded-2xl border-2 border-dashed border-blue-200 bg-[var(--bg-elevated)] p-8 text-center transition hover:border-blue-500 hover:bg-blue-50/70 dark:!border-[#262626] dark:hover:!bg-[#151b2e]"
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
                          if (file) elegirArchivo(file);
                        }}
                      >
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-700 transition group-hover:-translate-y-0.5 dark:!bg-[#202020] dark:!text-ink-black-300">
                          <FiFileText size={24} />
                        </div>
                        <div className="mt-4">
                          <p className="text-sm font-bold text-slate-700 dark:!text-white">
                            Arrastra el archivo aquí o selecciona desde tu
                            equipo
                          </p>
                          <p className="mt-1 text-xs font-medium text-slate-500 dark:!text-ink-black-400">
                            Formatos: .xlsx / .xls
                          </p>
                        </div>
                      </div>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        if (file) elegirArchivo(file);
                        else {
                          setArchivo(null);
                          setPreview(null);
                        }
                      }}
                    />
                    {archivo && (
                      <div
                        ref={panelPreviewRef}
                        className="ccr-data-table ccr-operational-table scroll-mt-4 overflow-hidden rounded-xl border-2 border-dashed border-blue-200 bg-white dark:!border-[#262626] dark:!bg-[#111111]"
                      >
                        <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:!border-[#262626] dark:!bg-[#202020]">
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-black uppercase tracking-wide text-slate-700 dark:!text-white">
                              {archivo.name}
                            </p>
                            <p className="text-[11px] font-semibold text-slate-500 dark:!text-ink-black-200">
                              {(archivo.size / 1024).toFixed(1)} KB ·{" "}
                              {previewLoading && !preview
                                ? "Analizando archivo..."
                                : `${preview?.total ?? 0} filas`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="ccr-control-button inline-flex shrink-0 items-center justify-center gap-2 px-3 py-1.5 text-[11px]"
                          >
                            <FiFileText size={13} />
                            Cambiar archivo
                          </button>
                        </div>
                        <div>
                          {vistaPrevia ?? (
                            <div className="flex min-h-[160px] flex-col items-center justify-center text-center">
                              {previewLoading ? (
                                <>
                                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
                                  <p className="mt-3 text-sm font-bold text-slate-600 dark:!text-ink-black-100">
                                    Analizando archivo...
                                  </p>
                                </>
                              ) : (
                                <p className="text-sm font-semibold text-slate-500">
                                  No hay previsualización disponible.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
                            <p className="text-[11px] font-semibold text-slate-500 dark:!text-ink-black-200">
                              Clic sobre la tabla y pega con Ctrl + V. No
                              necesitas copiar encabezados.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[11px] font-black text-blue-800 dark:!border-[#262626] dark:!bg-[#111111] dark:!text-ink-black-300">
                              {previewLoading && modoImportacion === "pegado"
                                ? "Previsualizando..."
                                : `${filasPegadas.length} filas`}
                            </span>
                            {textoPegado.trim() && (
                              <button
                                type="button"
                                onClick={() => aplicarTextoPegado("")}
                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50 dark:!border-[#262626] dark:!bg-[#111111] dark:!text-ink-black-100"
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
                                <th className="w-10 border-b border-r border-slate-300 bg-slate-100 px-2 py-2 text-center font-black text-slate-500 dark:!border-[#333] dark:!bg-[#202020] dark:!text-ink-black-300">
                                  #
                                </th>
                                {PEGADO_HEADERS.map((header, index) => (
                                  <th
                                    key={header}
                                    style={{
                                      width: PEGADO_COLUMN_WIDTHS[index],
                                    }}
                                    className="border-b border-r border-slate-300 bg-slate-100 px-2 py-2 text-left font-black uppercase tracking-[0.02em] text-slate-700 last:border-r-0 dark:!border-[#333] dark:!bg-[#202020] dark:!text-ink-black-100"
                                  >
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {filasPlanillaPegado.map((fila, rowIndex) => (
                                <tr
                                  key={`${rowIndex}-${fila.join("-")}`}
                                  className="ccr-table-row"
                                >
                                  <td className="border-b border-r border-slate-200 bg-slate-50 px-2 py-1 text-center font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 dark:!border-[#262626] dark:!bg-[#181818]">
                                    {rowIndex + 1}
                                  </td>
                                  {PEGADO_HEADERS.map((header, cellIndex) => {
                                    const value = fila[cellIndex] || "";
                                    const placeholder =
                                      !filasPegadas.length &&
                                      rowIndex === 0 &&
                                      cellIndex === 0
                                        ? "Pega aquí con Ctrl + V"
                                        : "";
                                    return (
                                      <td
                                        key={`${header}-${cellIndex}`}
                                        className="h-8 truncate border-b border-r border-slate-200 px-2 py-1 font-mono text-[11px] font-semibold text-slate-700 last:border-r-0 dark:!border-[#262626] dark:!text-ink-black-100"
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
                          onChange={(event) =>
                            aplicarTextoPegado(event.target.value)
                          }
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
                      !hayOrigen
                    }
                    className="ccr-control-button ccr-control-button-primary inline-flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FiCheckCircle size={16} />
                    {importLoading ? "Importando..." : "Confirmar e importar"}
                  </button>
                  {hayOrigen && !previewLoading && !preview && (
                    <button
                      type="button"
                      onClick={() => void revalidar()}
                      className="ccr-control-button inline-flex items-center justify-center gap-2 px-4 py-3 text-sm"
                    >
                      <FiRefreshCw size={15} />
                      {modoImportacion === "archivo"
                        ? "Reintentar previsualización"
                        : "Previsualizar planilla"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {modoImportacion === "pegado" && (preview || previewLoading) && (
          <div
            ref={panelPreviewRef}
            className="ccr-panel ccr-dashboard-card scroll-mt-4 rounded-xl p-5"
          >
            {preview ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:!border-[#262626]">
                {vistaPrevia}
              </div>
            ) : previewLoading ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-white text-center dark:!border-[#262626] dark:!bg-[#111111]">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
                <p className="mt-4 text-sm font-bold text-slate-600 dark:!text-ink-black-100">
                  Analizando planilla pegada...
                </p>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {resultado && (
        <section className="ccr-panel ccr-dashboard-card rounded-xl p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-black text-slate-900 dark:!text-white">
              Resultado final
            </h2>
            {/* Durante 10 minutos quien cargó puede deshacer la subida completa. */}
            {resultado.revertible_hasta && resultado.importaciones?.[0] && (
              <RevertirCarga
                corteId={resultado.importaciones[0].id}
                hasta={resultado.revertible_hasta}
                descripcion={resultado.importaciones
                  .map((c) => c.periodo_label)
                  .join(", ")}
                onRevertida={() => {
                  setResultado(null);
                }}
              />
            )}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            <div className="rounded-xl bg-[var(--bg-elevated)] p-4">
              <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:!text-white">
                {resultado.total}
              </p>
              <p className="text-xs font-semibold text-slate-500 dark:!text-ink-black-200">
                Total detectado
              </p>
            </div>
            <div className="rounded-xl bg-blue-50 p-4 dark:!bg-[#202020]">
              <p className="text-2xl font-extrabold tabular-nums text-blue-800 dark:!text-white">
                {resultado.importados}
              </p>
              <p className="text-xs font-semibold text-blue-700 dark:!text-ink-black-200">
                Importados
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 p-4">
              <p className="text-2xl font-extrabold tabular-nums text-amber-700">
                {resultado.recurrentes ?? resultado.duplicados}
              </p>
              <p className="text-xs font-semibold text-amber-700">
                Recurrentes
              </p>
            </div>
            <div className="rounded-xl bg-red-50 p-4 dark:!bg-red-500/10">
              <p className="text-2xl font-extrabold tabular-nums text-red-700">
                {resultado.errores_count ?? resultado.errores.length}
              </p>
              <p className="text-xs font-semibold text-red-700">Con error</p>
            </div>
          </div>

          {(resultado.telefonos_completados ?? 0) > 0 && (
            <p className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-xs font-semibold text-green-800">
              {resultado.telefonos_completados === 1
                ? "Además se completó el teléfono de 1 paciente ya registrado."
                : `Además se completaron los teléfonos de ${resultado.telefonos_completados} pacientes ya registrados.`}
            </p>
          )}

          {resultado.errores.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm dark:!border-[#262626] dark:!bg-[#202020] sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold text-blue-900 dark:!text-white">
                Solo los errores quedaron en revisión. Los válidos se cargaron y
                los recurrentes se registraron automáticamente en historial.
              </p>
              {puedeRevisarCarga(user) ? (
                <Link
                  href="/importar/revision"
                  className="ccr-control-button ccr-control-button-primary inline-flex items-center justify-center gap-2 px-3 py-2 text-xs"
                >
                  <FiAlertTriangle size={13} />
                  Abrir revisión
                </Link>
              ) : (
                <span className="text-xs font-bold text-blue-900 dark:!text-white">
                  Los corrige el profesional encargado.
                </span>
              )}
            </div>
          )}

          {resultado.errores.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-bold text-red-700 dark:!text-red-100">
                  Detalle de errores enviados a revisión
                </p>
                {puedeRevisarCarga(user) && (
                  <Link
                    href="/importar/revision"
                    className="ccr-control-button inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs"
                  >
                    <FiAlertTriangle size={13} />
                    Abrir revisión
                  </Link>
                )}
              </div>
              <p className="mb-3 rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs font-semibold text-amber-800 dark:!border-amber-300/30 dark:!bg-amber-400/10 dark:!text-amber-100">
                Estos registros no se cargaron en lista de espera. El
                profesional encargado los corrige o descarta en Revisión de
                carga.
              </p>
              <div className="max-h-48 space-y-1 overflow-auto">
                {resultado.errores.map((err, index) => (
                  <div
                    key={index}
                    className="flex gap-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs"
                  >
                    <span className="font-mono text-red-500">
                      {err.hoja ? `${err.hoja} · ` : ""}Fila {err.fila}
                    </span>
                    <span className="text-red-700">{err.motivo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {confirmImportOpen && preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirmar-importacion-titulo"
          onClick={() => setConfirmImportOpen(false)}
        >
          <div
            className="ccr-panel flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Encabezado */}
            <div className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-6 py-5 dark:!border-[#262626]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:!bg-[#151b2e] dark:!text-ink-black-300">
                <FiUploadCloud size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="confirmar-importacion-titulo"
                  className="text-lg font-black text-slate-900 dark:!text-white"
                >
                  Confirmar importación
                </h2>
                <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:!text-ink-black-200">
                  {modoImportacion === "archivo" && archivo
                    ? archivo.name
                    : "Planilla pegada"}{" "}
                  · {preview.total} registros detectados
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmImportOpen(false)}
                aria-label="Cerrar"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:!bg-[#202020]"
              >
                <FiX size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {/* Corte de destino */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  Se registrará como corte de
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {periodosDestino.length > 0 ? (
                    periodosDestino.map((p) => (
                      <span
                        key={`${p.anio}-${p.mes}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800 dark:!bg-[#151b2e] dark:!text-ink-black-100"
                      >
                        <FiCalendar size={12} />
                        {MESES[p.mes - 1]} {p.anio}
                        {p.total != null && (
                          <span className="font-semibold text-blue-500 dark:!text-ink-black-300">
                            · {p.total}
                          </span>
                        )}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-semibold text-slate-500">
                      Periodo según las fechas de la planilla
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[11px] font-medium text-slate-500 dark:!text-ink-black-200">
                  Las fechas reales de derivación no se modifican: definen el
                  tiempo de espera de cada paciente.
                </p>
              </div>

              {/* Qué ocurrirá */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  Qué ocurrirá
                </p>
                <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-[#262626] dark:!border-[#262626]">
                  {[
                    {
                      n: preview.nuevos ?? preview.validos,
                      titulo: "Pacientes nuevos",
                      detalle: "Se agregan a la lista de espera.",
                      tono: "text-blue-700 bg-blue-50 dark:!bg-[#151b2e] dark:!text-ink-black-100",
                      icono: <FiUserPlus size={15} />,
                    },
                    {
                      n: preview.recurrentes ?? preview.duplicados,
                      titulo: "Pacientes recurrentes",
                      detalle:
                        "Ya existen: se suma el diagnóstico a su registro.",
                      tono: "text-amber-700 bg-amber-50 dark:!bg-amber-400/10",
                      icono: <FiRepeat size={15} />,
                    },
                    {
                      n: preview.errores_count ?? preview.errores.length,
                      titulo: "Registros con error",
                      detalle: "No se cargan; quedan en Revisión de carga.",
                      tono: "text-red-700 bg-red-50 dark:!bg-red-500/10",
                      icono: <FiAlertTriangle size={15} />,
                    },
                  ].map((fila) => (
                    <li
                      key={fila.titulo}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${fila.tono}`}
                      >
                        {fila.icono}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 dark:!text-white">
                          {fila.titulo}
                        </p>
                        <p className="text-xs font-medium text-slate-500 dark:!text-ink-black-200">
                          {fila.detalle}
                        </p>
                      </div>
                      <span className="text-xl font-black tabular-nums text-slate-900 dark:!text-white">
                        {fila.n}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {totalFueraDelCorte > 0 && periodoForzado && (
                <div className="flex gap-2.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-xs font-semibold leading-relaxed text-blue-900 dark:!border-[#2b3f78] dark:!bg-[#151b2e] dark:!text-ink-black-100">
                  <FiCalendar className="mt-0.5 shrink-0" size={14} />
                  <p>
                    {totalFueraDelCorte} registros tienen fecha de otro mes (
                    {filasFueraDelCorte
                      .map(
                        (p) =>
                          `${p.total} de ${MESES[p.mes - 1].toLowerCase()} ${p.anio}`,
                      )
                      .join(", ")}
                    ). Se guardan en el corte de {MESES[periodoForzado.mes - 1]}{" "}
                    {periodoForzado.anio}, pero conservan su fecha real de
                    derivación.
                  </p>
                </div>
              )}

              {(preview.errores_count ?? preview.errores.length) > 0 && (
                <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs font-semibold leading-relaxed text-amber-800 dark:!border-amber-400/30 dark:!bg-amber-400/10 dark:!text-amber-100">
                  <FiAlertTriangle className="mt-0.5 shrink-0" size={14} />
                  <p>
                    Hay registros con error. Se importará el resto y los errores
                    podrán corregirse después en Revisión de carga.
                  </p>
                </div>
              )}
            </div>

            {/* Acciones */}
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:!border-[#262626] dark:!bg-[#181818]">
              <p className="text-[11px] font-medium text-slate-500 dark:!text-ink-black-200">
                Podrás deshacer la carga durante los primeros 10 minutos.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setConfirmImportOpen(false)}
                  className="ccr-button-cancel px-4 text-sm"
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
                  className="ccr-control-button ccr-control-button-primary inline-flex items-center justify-center gap-2 px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FiCheckCircle size={15} />
                  {importLoading ? "Importando..." : "Importar corte"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {conflicto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="ccr-panel w-full max-w-xl rounded-xl p-5">
            <h2 className="text-lg font-black text-slate-900 dark:!text-white">
              Ya existen datos para estos meses
            </h2>
            <p className="mt-2 text-sm font-medium text-slate-600 dark:!text-ink-black-200">
              {conflicto.mensaje}
            </p>

            <div className="mt-4 space-y-2">
              {conflicto.conflictos.map((item) => (
                <div
                  key={`${item.mes}-${item.anio}-${item.importacion_id}`}
                  className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm text-slate-700 dark:!border-[#262626] dark:!bg-[#202020] dark:!text-ink-black-100"
                >
                  <p className="font-bold">
                    {item.hoja} {item.anio}
                  </p>
                  <p className="text-xs text-slate-500 dark:!text-ink-black-200">
                    Importación previa: {item.importados_previos} registros ·{" "}
                    {new Date(item.fecha_subida_previa).toLocaleString("es-CL")}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs font-medium text-slate-500 dark:!text-ink-black-200">
              Complementar suma meses de espera a pacientes existentes y agrega
              los nuevos sin borrar lo anterior.
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => setConflicto(null)}
                className="ccr-button-cancel order-last px-4 text-sm sm:order-first"
              >
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
