// Reglas de la cola de llamados del lado del cliente.
// El backend (apps/pacientes/llamados.py) es quien decide; aqui solo se
// anticipa la consecuencia para mostrarla antes de registrar.

import { api } from "@/lib/api";
import type { Paciente, ResultadoLlamado } from "@/lib/types";

export const MINUTOS_PARA_DESHACER = 10;

export type MetaResultado = {
  id: ResultadoLlamado;
  label: string;
  /** Texto corto para listas e historial. */
  corto: string;
  tono: "azul" | "ambar" | "gris" | "rojo";
};

export const RESULTADOS: MetaResultado[] = [
  { id: "CONTESTA_CONFIRMADO", label: "Contesta y agenda", corto: "Contestó", tono: "azul" },
  { id: "NO_CONTESTA", label: "No contesta", corto: "No contestó", tono: "ambar" },
  { id: "REAGENDAR_LLAMADO", label: "Volver a llamar", corto: "Pidió otro día", tono: "gris" },
  { id: "NUMERO_EQUIVOCADO", label: "Número equivocado", corto: "Nº equivocado", tono: "rojo" },
  { id: "RECHAZA_ATENCION", label: "Rechaza la atención", corto: "Rechazó", tono: "rojo" },
  { id: "YA_RESUELTO", label: "Ya lo resolvió", corto: "Ya resuelto", tono: "gris" },
  { id: "OTRO", label: "Otro", corto: "Otro", tono: "gris" },
];

export const META_RESULTADO = Object.fromEntries(RESULTADOS.map((r) => [r.id, r])) as Record<ResultadoLlamado, MetaResultado>;

export function enCola(p: Paciente) {
  return p.estado === "PENDIENTE" || p.estado === "RESCATE";
}

/** Resultados que tienen sentido para este paciente. */
export function resultadosPara(p: Paciente): MetaResultado[] {
  return RESULTADOS.filter((r) => (r.id === "YA_RESUELTO" ? enCola(p) : true));
}

export type Consecuencia = {
  texto: string;
  /** El paciente cambia de estado o sale de la cola. */
  cambiaEstado: boolean;
  requiereNota: boolean;
  requiereFechaCita: boolean;
  requiereVolverALlamar: boolean;
  grave: boolean;
};

/** Lo que pasara al registrar `resultado` para `p` (espejo de la regla del backend). */
export function consecuencia(p: Paciente, resultado: ResultadoLlamado): Consecuencia {
  const base = { cambiaEstado: false, requiereNota: false, requiereFechaCita: false, requiereVolverALlamar: false, grave: false };
  const intentos = (p.intentos_estado ?? 0) + 1;
  const umbral = p.intentos_umbral ?? null;

  switch (resultado) {
    case "CONTESTA_CONFIRMADO":
      return enCola(p)
        ? { ...base, cambiaEstado: true, requiereFechaCita: true, texto: "Pasa a Ingresado y queda citado." }
        : { ...base, cambiaEstado: true, requiereFechaCita: true, texto: "Queda citado y sale de la lista por citar." };
    case "NO_CONTESTA":
      if (!enCola(p) || umbral === null) return { ...base, texto: "Solo se registra el intento; sigue por citar." };
      if (intentos >= umbral) {
        return p.estado === "PENDIENTE"
          ? { ...base, cambiaEstado: true, texto: `Intento ${intentos} de ${umbral} sin respuesta: pasa a Rescate.` }
          : { ...base, cambiaEstado: true, requiereNota: true, grave: true, texto: `Intento ${intentos} de ${umbral} en Rescate: pasa a Egreso administrativo.` };
      }
      return { ...base, texto: `Intento ${intentos} de ${umbral} sin respuesta. Sigue en ${p.estado === "RESCATE" ? "Rescate" : "Pendiente"}.` };
    case "REAGENDAR_LLAMADO":
      return { ...base, requiereVolverALlamar: true, texto: "Queda para volver a llamar en la fecha indicada. No cuenta como intento." };
    case "NUMERO_EQUIVOCADO":
      return { ...base, texto: "Se registra sin contar como intento. Corrige el teléfono en “Editar contacto”." };
    case "RECHAZA_ATENCION":
      return { ...base, cambiaEstado: true, requiereNota: true, grave: true, texto: "Pasa a Egreso voluntario." };
    case "YA_RESUELTO":
      return { ...base, cambiaEstado: true, requiereNota: true, grave: true, texto: "Pasa a Egreso administrativo." };
    case "OTRO":
      return { ...base, requiereNota: true, texto: "Solo se registra, con la observación." };
  }
}

export type DatosLlamado = {
  resultado: ResultadoLlamado;
  notas?: string;
  /** ISO, para CONTESTA_CONFIRMADO. */
  fecha_atencion?: string | null;
  /** ISO, para REAGENDAR_LLAMADO. */
  volver_a_llamar?: string | null;
};

export function registrarLlamado(p: Paciente, datos: DatosLlamado) {
  return api.post<Paciente>(`/pacientes/${p.id}/registrar-llamado/`, {
    ...datos,
    telefono_usado: p.telefono || p.telefono_recados || "",
  });
}

export function deshacerLlamado(pacienteId: number, llamadoId: number) {
  return api.post<Paciente>(`/pacientes/${pacienteId}/deshacer-llamado/`, { llamado_id: llamadoId });
}

/** Combina fecha (YYYY-MM-DD) y hora (HH:mm) locales en ISO. */
export function aIso(fecha: string, hora: string) {
  if (!fecha || !hora) return null;
  const d = new Date(`${fecha}T${hora}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function fechaKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Siguiente dia habil (lunes a viernes) a partir de hoy + `dias`. */
export function diaHabil(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return fechaKey(d);
}

/** Mensaje para el toast tras registrar, segun el estado resultante. */
export function mensajeRegistro(antes: Paciente, despues: Paciente, resultado: ResultadoLlamado) {
  const primero = antes.nombre.trim().split(/\s+/)[0] ?? "";
  const nombre = primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase();
  if (despues.estado !== antes.estado) {
    const destino: Record<string, string> = {
      INGRESADO: "ingresó y quedó citado",
      RESCATE: "pasó a Rescate",
      EGRESO_ADMINISTRATIVO: "pasó a Egreso administrativo",
      EGRESO_VOLUNTARIO: "pasó a Egreso voluntario",
    };
    return `${nombre} ${destino[despues.estado] ?? `pasó a ${despues.estado}`}.`;
  }
  if (resultado === "CONTESTA_CONFIRMADO") return `${nombre} quedó citado.`;
  if (resultado === "REAGENDAR_LLAMADO") return `Se volverá a llamar a ${nombre}.`;
  return `${META_RESULTADO[resultado].corto}: ${nombre}.`;
}
