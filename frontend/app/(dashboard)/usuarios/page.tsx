"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  FiEdit2,
  FiKey,
  FiPlus,
  FiSearch,
  FiShield,
  FiTrash2,
  FiUserCheck,
  FiUserX,
  FiX,
} from "react-icons/fi";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getErrorMessage } from "@/lib/errors";
import { formatearRut, rutParaApi } from "@/lib/rut";
import { useToast } from "@/lib/toast-context";
import { useAPI, unwrapResults } from "@/lib/swr";
import type { PaginatedResponse, Rol, Usuario } from "@/lib/types";
import { ROL_LABELS } from "@/lib/types";
import { TableSkeleton } from "@/components/Skeleton";
import ConfirmDialog from "@/components/ConfirmDialog";

const ROL_BADGE_CLASSES: Record<Rol, string> = {
  ADMIN: "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-100",
  KINE: "border-green-100 bg-green-50 text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-100",
  MEDICO: "border-amber-100 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100",
};

const ROLES_NUEVOS: Rol[] = ["KINE", "MEDICO", "ADMIN"];
const ROLES_SELECCIONABLES = ROLES_NUEVOS.map((rol) => ({
  value: rol,
  label: ROL_LABELS[rol],
}));

function normalizarBusqueda(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-CL")
    .trim();
}

function normalizarRut(value: string) {
  return value.toLowerCase().replace(/[^0-9k]/g, "");
}

function etiquetaRolTabla(rol: Rol) {
  return ROL_LABELS[rol];
}

export default function UsuariosPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [modal, setModal] = useState<null | "crear" | Usuario>(null);
  const [busqueda, setBusqueda] = useState("");
  const [rolFiltro, setRolFiltro] = useState<Rol | "TODOS">("TODOS");
  const [estadoFiltro, setEstadoFiltro] = useState<"TODOS" | "ACTIVOS" | "INACTIVOS">("TODOS");
  const [resetLoadingId, setResetLoadingId] = useState<number | null>(null);
  const [resetCandidate, setResetCandidate] = useState<Usuario | null>(null);
  const [claveTemporal, setClaveTemporal] = useState<{ nombre: string; clave: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Usuario | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (user && user.rol !== "ADMIN") {
      router.replace("/pacientes");
    }
  }, [user, router]);

  const {
    data: swrData,
    isLoading: loading,
    mutate,
  } = useAPI<Usuario[] | PaginatedResponse<Usuario>>("/usuarios/");
  const usuarios = unwrapResults(swrData);

  const usuariosFiltrados = useMemo(
    () =>
      usuarios.filter((usuario) => {
        if (busqueda.trim()) {
          const queryTexto = normalizarBusqueda(busqueda);
          const queryRut = normalizarRut(busqueda);
          const coincideNombre = normalizarBusqueda(usuario.nombre).includes(queryTexto);
          const coincideRut = normalizarRut(usuario.rut).includes(queryRut);
          if (!coincideNombre && !coincideRut) return false;
        }

        if (rolFiltro !== "TODOS" && usuario.rol !== rolFiltro) return false;
        if (estadoFiltro === "ACTIVOS" && !usuario.is_active) return false;
        if (estadoFiltro === "INACTIVOS" && usuario.is_active) return false;
        return true;
      }),
    [busqueda, estadoFiltro, rolFiltro, usuarios],
  );

  const resumen = useMemo(
    () => ({
      total: usuarios.length,
      activos: usuarios.filter((usuario) => usuario.is_active).length,
      inactivos: usuarios.filter((usuario) => !usuario.is_active).length,
      admins: usuarios.filter((usuario) => usuario.rol === "ADMIN").length,
    }),
    [usuarios],
  );
  const activeFilterCount = [
    busqueda.trim(),
    rolFiltro !== "TODOS",
    estadoFiltro !== "TODOS",
  ].filter(Boolean).length;

  async function confirmarEliminar() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/usuarios/${deleteTarget.id}/`);
      await mutate();
      toast.success("Usuario eliminado correctamente.");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(
        getErrorMessage(error, "No se pudo eliminar el usuario. Puede tener registros asociados."),
      );
    } finally {
      setDeleteLoading(false);
    }
  }

  async function confirmarResetPassword() {
    if (!resetCandidate) return;
    setResetLoadingId(resetCandidate.id);
    try {
      const respuesta = await api.post<{ detail: string; nueva_password: string }>(
        `/usuarios/${resetCandidate.id}/reset-password/`,
      );
      setClaveTemporal({ nombre: resetCandidate.nombre, clave: respuesta.nueva_password });
      setResetCandidate(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "No se pudo resetear la contraseña."));
    } finally {
      setResetLoadingId(null);
    }
  }

  function limpiarFiltros() {
    setBusqueda("");
    setRolFiltro("TODOS");
    setEstadoFiltro("TODOS");
  }

  if (!user || user.rol !== "ADMIN") return null;

  return (
    <div className="ccr-page-fill space-y-4 text-[13px]">
      <header className="ccr-panel rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#2a2a2a] dark:bg-[#0f0f10]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">
              <FiShield size={13} />
              Administración
            </p>
            <h1 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Usuarios</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-ink-black-200">
              Gestión básica de accesos y roles operativos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModal("crear")}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-transparent !bg-blue-500 px-4 py-2 text-xs font-bold !text-white transition hover:!bg-blue-700"
          >
            <FiPlus size={14} />
            Nuevo usuario
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <UsuarioStat icon={<FiShield />} label="Total" value={resumen.total} tone="blue" />
          <UsuarioStat icon={<FiUserCheck />} label="Activos" value={resumen.activos} tone="green" />
          <UsuarioStat icon={<FiUserX />} label="Inactivos" value={resumen.inactivos} tone="slate" />
          <UsuarioStat icon={<FiShield />} label="Admins" value={resumen.admins} tone="amber" />
        </div>
      </header>

      <section className="ccr-panel rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[#2a2a2a] dark:bg-[#0f0f10]">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
          <div className="relative">
            <FiSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-500 dark:text-blue-300"
              size={15}
            />
            <input
              type="text"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              className="ccr-control-input w-full px-9 py-2.5 text-xs"
              placeholder="Buscar por nombre o RUT"
            />
          </div>

          <select
            value={rolFiltro}
            onChange={(event) => setRolFiltro(event.target.value as Rol | "TODOS")}
            className="ccr-control-input px-3 py-2.5 text-xs"
          >
            <option value="TODOS">Todos los roles</option>
            {ROLES_SELECCIONABLES.map((rol) => (
              <option key={rol.value} value={rol.value}>
                {rol.label}
              </option>
            ))}
          </select>

          <select
            value={estadoFiltro}
            onChange={(event) =>
              setEstadoFiltro(event.target.value as "TODOS" | "ACTIVOS" | "INACTIVOS")
            }
            className="ccr-control-input px-3 py-2.5 text-xs"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="ACTIVOS">Activos</option>
            <option value="INACTIVOS">Inactivos</option>
          </select>

          <button
            type="button"
            onClick={limpiarFiltros}
            className="ccr-control-button inline-flex items-center justify-center rounded-lg px-3 py-2.5 text-xs"
          >
            Limpiar filtros
          </button>
        </div>
      </section>

      <section className="ccr-fill ccr-panel ccr-data-table ccr-operational-table relative overflow-hidden rounded-lg bg-white shadow-sm dark:bg-[#0f0f10]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-[#262626]">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600 dark:text-ink-black-200">
            {usuariosFiltrados.length} usuario{usuariosFiltrados.length !== 1 ? "s" : ""} en vista
          </p>
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 dark:bg-blue-400/10 dark:text-blue-100">
            {activeFilterCount} filtro{activeFilterCount !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <div className="p-3">
            <TableSkeleton rows={6} />
          </div>
        ) : usuariosFiltrados.length === 0 ? (
          <div className="ccr-fill-grow p-10 text-center text-sm font-semibold text-slate-500 dark:text-ink-black-200">
            Sin usuarios para los filtros seleccionados.
          </div>
        ) : (
          <>
            <div className="ccr-table-scroll overflow-auto border-b border-gray-100 [animation:tableFadeIn_260ms_ease-out] dark:border-[#262626]">
              <table className="w-full min-w-[920px] table-fixed text-[12px]">
                <thead className="sticky top-0 z-10">
                  <tr className="ccr-table-head border-b border-slate-200 bg-slate-50/90 dark:border-[#262626] dark:bg-[#202020]">
                    <th className="w-[260px] text-left text-xs font-bold text-slate-600 dark:text-ink-black-100">Nombre</th>
                    <th className="w-[150px] text-left text-xs font-bold text-slate-600 dark:text-ink-black-100">RUT</th>
                    <th className="w-[220px] text-left text-xs font-bold text-slate-600 dark:text-ink-black-100">Rol</th>
                    <th className="w-[120px] text-left text-xs font-bold text-slate-600 dark:text-ink-black-100">Estado</th>
                    <th className="w-[300px] text-right text-xs font-bold text-slate-600 dark:text-ink-black-100">Acciones</th>
                </tr>
              </thead>
              <tbody className="ccr-stagger">
                {usuariosFiltrados.map((usuario) => (
                  <tr key={usuario.id} className="ccr-table-row bg-white dark:bg-[#151515]">
                    <td className="font-bold text-slate-900 dark:text-white">{usuario.nombre}</td>
                    <td className="font-mono text-xs text-slate-600 dark:text-ink-black-200">
                      {formatearRut(usuario.rut)}
                    </td>
                    <td>
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${ROL_BADGE_CLASSES[usuario.rol]}`}
                      >
                        {etiquetaRolTabla(usuario.rol)}
                      </span>
                      {usuario.es_encargado && (
                        <span className="ml-1.5 inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-100">
                          Encargado
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${
                          usuario.is_active
                            ? "border-green-100 bg-green-50 text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-100"
                            : "border-slate-100 bg-slate-50 text-slate-500 dark:border-slate-400/25 dark:bg-slate-400/10 dark:text-slate-200"
                        }`}
                      >
                        {usuario.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setModal(usuario)}
                          className="inline-flex items-center gap-1 rounded-md border border-transparent !bg-blue-500 px-2.5 py-1.5 text-xs font-bold !text-white transition hover:!bg-blue-700"
                        >
                          <FiEdit2 size={13} />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetCandidate(usuario)}
                          disabled={resetLoadingId === usuario.id}
                          className="inline-flex items-center gap-1 rounded-md border !border-amber-500 !bg-amber-500 px-2.5 py-1.5 text-xs font-bold !text-white transition hover:!border-amber-600 hover:!bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <FiKey size={13} />
                          {resetLoadingId === usuario.id ? "Reseteando" : "Reset clave"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(usuario)}
                          className="inline-flex items-center gap-1 rounded-md border !border-red-600 !bg-red-600 px-2.5 py-1.5 text-xs font-bold !text-white transition hover:!border-red-700 hover:!bg-red-700"
                        >
                          <FiTrash2 size={13} />
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            <div className="flex flex-col gap-1 border-t border-gray-200 bg-gray-50/50 px-4 py-2 text-[11px] font-medium text-gray-600 dark:border-[#262626] dark:bg-[#0f0f10] dark:text-ink-black-200 sm:flex-row sm:items-center sm:justify-between">
              <p>
                {usuariosFiltrados.length} usuario{usuariosFiltrados.length !== 1 ? "s" : ""} en la tabla
              </p>
              <p className="text-gray-400 dark:text-ink-black-400">
                Mostrando {usuariosFiltrados.length} de {usuarios.length}
              </p>
            </div>
          </>
        )}
      </section>

      {modal && (
        <UsuarioModal
          usuario={modal === "crear" ? null : modal}
          onClose={() => setModal(null)}
          onGuardado={() => void mutate()}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(resetCandidate)}
        onCancel={() => {
          if (resetLoadingId === null) setResetCandidate(null);
        }}
        onConfirm={() => void confirmarResetPassword()}
        title="Resetear clave"
        message={
          resetCandidate
            ? `Se generará una clave temporal para ${resetCandidate.nombre} (${formatearRut(resetCandidate.rut)}). Deberá cambiarla en su próximo ingreso.`
            : ""
        }
        confirmLabel="Resetear clave"
        cancelLabel="Cancelar"
        variant="warning"
        loading={resetLoadingId !== null}
      />

      <ConfirmDialog
        isOpen={Boolean(claveTemporal)}
        onCancel={() => setClaveTemporal(null)}
        onConfirm={() => {
          if (claveTemporal) {
            void navigator.clipboard
              ?.writeText(claveTemporal.clave)
              .then(() => toast.success("Clave copiada."))
              .catch(() => toast.error("No se pudo copiar la clave."));
          }
          setClaveTemporal(null);
        }}
        title="Clave temporal generada"
        message={
          claveTemporal
            ? `Clave temporal de ${claveTemporal.nombre}: ${claveTemporal.clave}\n\nEntréguela al usuario. No se volverá a mostrar y deberá cambiarla al ingresar.`
            : ""
        }
        confirmLabel="Copiar y cerrar"
        cancelLabel="Cerrar"
        variant="info"
      />

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onCancel={() => {
          if (!deleteLoading) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmarEliminar()}
        title="Eliminar usuario"
        message={
          deleteTarget
            ? `¿Seguro que deseas eliminar a ${deleteTarget.nombre} (${formatearRut(deleteTarget.rut)})? Esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        variant="danger"
        loading={deleteLoading}
      />
    </div>
  );
}

function UsuarioStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: "blue" | "green" | "slate" | "amber";
}) {
  const tones = {
    blue: "border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-100",
    green: "border-green-100 bg-green-50 text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-100",
    slate: "border-slate-100 bg-slate-50 text-slate-700 dark:border-slate-400/25 dark:bg-slate-400/10 dark:text-slate-100",
    amber: "border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100",
  };

  return (
    <div className={`rounded-lg border px-3 py-3 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em]">
          {icon}
          {label}
        </span>
        <strong className="text-lg">{value}</strong>
      </div>
    </div>
  );
}

type UsuarioFormField = "rut" | "nombre" | "rol" | "password" | "confirmPassword";
type UsuarioFieldErrors = Partial<Record<UsuarioFormField, string>>;

function mensajeRutFrontend(mensaje: string) {
  if (mensaje.includes("Ya existe")) return "Ya existe un usuario con este RUT.";
  if (mensaje.includes("obligatorio") || mensaje.includes("blank")) return "Debe ingresar un RUT.";
  if (mensaje.includes("formato")) return "El RUT ingresado no es válido.";
  return mensaje;
}

function leerPrimerMensaje(value: unknown) {
  if (Array.isArray(value)) return String(value[0] ?? "");
  if (typeof value === "string") return value;
  return "";
}

function extraerErroresUsuario(error: unknown) {
  const fieldErrors: UsuarioFieldErrors = {};
  let general = "No se pudo guardar el usuario.";

  if (!error || typeof error !== "object") return { fieldErrors, general };

  Object.entries(error as Record<string, unknown>).forEach(([key, value]) => {
    const mensaje = leerPrimerMensaje(value);
    if (!mensaje) return;

    if (key === "rut") fieldErrors.rut = mensajeRutFrontend(mensaje);
    else if (key === "nombre") fieldErrors.nombre = mensaje;
    else if (key === "rol") fieldErrors.rol = mensaje;
    else if (key === "password") fieldErrors.password = mensaje;
    else general = mensaje;
  });

  if (Object.keys(fieldErrors).length > 0) general = "";
  return { fieldErrors, general };
}

function UsuarioModal({
  usuario,
  onClose,
  onGuardado,
}: {
  usuario: Usuario | null;
  onClose: () => void;
  onGuardado: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const editando = usuario !== null;
  const subtituloDetalle = usuario ? `${usuario.nombre} · ${formatearRut(usuario.rut)}` : "";
  const [form, setForm] = useState({
    nombre: usuario?.nombre ?? "",
    rut: formatearRut(usuario?.rut ?? ""),
    rol: (usuario?.rol ?? "KINE") as Rol,
    password: "",
    confirmPassword: "",
    is_active: usuario?.is_active ?? true,
    es_encargado: usuario?.es_encargado ?? false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<UsuarioFieldErrors>({});

  function set<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field !== "is_active" && field !== "es_encargado") {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function validarFormulario() {
    const nextErrors: UsuarioFieldErrors = {};
    const rutNormalizado = rutParaApi(form.rut);

    if (!rutNormalizado) {
      nextErrors.rut = "Debe ingresar un RUT.";
    } else if (rutNormalizado.length < 2) {
      nextErrors.rut = "El RUT ingresado no es válido.";
    }

    if (!form.nombre.trim()) nextErrors.nombre = "Debe ingresar un nombre.";
    if (!form.rol) nextErrors.rol = "Debe seleccionar un rol.";
    if (!editando && !form.password) nextErrors.password = "Debe ingresar una contraseña.";
    if (form.password && form.password.length < 8) {
      nextErrors.password = "La contraseña debe tener al menos 8 caracteres.";
    }
    if (form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = "Las contraseñas no coinciden.";
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!validarFormulario()) return;

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        rut: rutParaApi(form.rut),
        nombre: form.nombre.trim(),
        rol: form.rol,
        is_active: form.is_active,
        // Solo un profesional puede ser encargado (el backend también lo exige).
        es_encargado: form.rol === "KINE" && form.es_encargado,
      };
      if (form.password) body.password = form.password;

      if (editando) {
        await api.patch(`/usuarios/${usuario!.id}/`, body);
      } else {
        await api.post("/usuarios/", body);
      }
      await onGuardado();
      toast.success(editando ? "Usuario actualizado correctamente." : "Usuario creado correctamente.");
      onClose();
    } catch (e: unknown) {
      const errores = extraerErroresUsuario(e);
      setFieldErrors(errores.fieldErrors);
      setError(errores.general);
      toast.error(errores.general || getErrorMessage(e, "No se pudo guardar el usuario."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3 py-6 backdrop-blur-sm dark:bg-black/70"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-[#2a2a2a] dark:bg-[#111111]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 dark:border-[#2a2a2a]">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300">
              Usuarios
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">
              {editando ? "Editar usuario" : "Crear usuario"}
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500 dark:text-ink-black-200">
              Gestiona acceso interno a ListaEsperaCCR.
            </p>
            {subtituloDetalle && (
              <p className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-500">{subtituloDetalle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-[#2a2a2a] dark:bg-[#151515] dark:text-ink-black-200 dark:hover:bg-[#202020] dark:hover:text-white"
            aria-label="Cerrar"
          >
            <FiX size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex max-h-[calc(92vh-102px)] flex-col">
          <div className="overflow-y-auto px-6 py-5">
            {error && (
              <p className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-100">
                {error}
              </p>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Datos de acceso</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500 dark:text-ink-black-200">
                    Identificación y credenciales del usuario.
                  </p>
                </div>

                <FormField label="RUT *" error={fieldErrors.rut}>
                  <input
                    required
                    value={form.rut}
                    onBlur={() => set("rut", formatearRut(form.rut))}
                    onChange={(event) => set("rut", event.target.value)}
                    placeholder="12.345.678-K"
                    className="ccr-control-input w-full px-3 py-2.5 font-mono text-sm"
                  />
                </FormField>

                <FormField label="Nombre *" error={fieldErrors.nombre}>
                  <input
                    required
                    value={form.nombre}
                    onChange={(event) => set("nombre", event.target.value)}
                    className="ccr-control-input w-full px-3 py-2.5 text-sm"
                  />
                </FormField>

                <FormField
                  label={editando ? "Nueva contraseña (opcional)" : "Contraseña *"}
                  error={fieldErrors.password}
                >
                  <input
                    type="password"
                    required={!editando}
                    minLength={8}
                    value={form.password}
                    onChange={(event) => set("password", event.target.value)}
                    className="ccr-control-input w-full px-3 py-2.5 text-sm"
                  />
                </FormField>

                <FormField label="Confirmar contraseña" error={fieldErrors.confirmPassword}>
                  <input
                    type="password"
                    required={!editando || Boolean(form.password)}
                    minLength={form.password ? 8 : undefined}
                    value={form.confirmPassword}
                    onChange={(event) => set("confirmPassword", event.target.value)}
                    className="ccr-control-input w-full px-3 py-2.5 text-sm"
                  />
                </FormField>
              </section>

              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Perfil y estado</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500 dark:text-ink-black-200">
                    Rol operativo y disponibilidad de la cuenta.
                  </p>
                </div>


                <FormField label="Rol *" error={fieldErrors.rol}>
                  <select
                    value={form.rol}
                    onChange={(event) => set("rol", event.target.value as Rol)}
                    className="ccr-control-input w-full px-3 py-2.5 text-sm"
                  >
                    {ROLES_SELECCIONABLES.map((rol) => (
                      <option key={rol.value} value={rol.value}>
                        {rol.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                {form.rol === "KINE" && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 dark:border-[#2a2a2a] dark:bg-[#151515]">
                    <input
                      type="checkbox"
                      checked={form.es_encargado}
                      onChange={(event) => set("es_encargado", event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                    <span>
                      <span className="block text-xs font-black text-slate-900 dark:text-white">Profesional encargado</span>
                      <span className="mt-1 block text-xs font-medium text-slate-500 dark:text-ink-black-200">
                        Resuelve la Revisión de carga y corrige a fondo los datos de los pacientes. Puede haber más de uno.
                      </span>
                    </span>
                  </label>
                )}

                {editando && (
                  <div className="rounded-lg border border-slate-200 px-3 py-3 dark:border-[#2a2a2a] dark:bg-[#151515]">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-black text-slate-900 dark:text-white">Estado activo</p>
                        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-ink-black-200">
                          Controla si la cuenta puede iniciar sesión.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.is_active}
                        aria-label="Cambiar estado activo"
                        onClick={() => set("is_active", !form.is_active)}
                        className={`relative h-6 w-11 rounded-full transition ${
                          form.is_active ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600"
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${
                            form.is_active ? "left-6" : "left-1"
                          }`}
                        />
                      </button>
                    </div>
                    <p className="mt-3 inline-flex rounded-full border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600 dark:border-slate-400/25 dark:bg-slate-400/10 dark:text-slate-100">
                      {form.is_active ? "Activo" : "Inactivo"}
                    </p>
                  </div>
                )}
              </section>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4 dark:border-[#2a2a2a] dark:bg-[#181818] sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-[#2a2a2a] dark:bg-[#151515] dark:text-ink-black-50 dark:hover:bg-[#202020]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Guardando..." : editando ? "Guardar cambios" : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-600 dark:text-ink-black-50">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs font-semibold text-red-600 dark:text-red-300">{error}</span>}
    </label>
  );
}
