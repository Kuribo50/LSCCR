"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { Rol, Usuario } from "@/lib/types";

const ROL_LABELS: Record<Rol, string> = {
  KINE: "Kinesiólogo/a",
  ADMINISTRATIVO: "Administrativo/a",
  ADMIN: "Administrador/a",
};

const ROL_BADGE_CLASSES: Record<Rol, string> = {
  ADMIN: "border-blue-100 bg-blue-50 text-blue-700",
  KINE: "border-emerald-100 bg-emerald-50 text-emerald-700",
  ADMINISTRATIVO: "border-amber-100 bg-amber-50 text-amber-800",
};

const ROLES_NUEVOS: Rol[] = ["KINE", "ADMIN"];
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
  if (rol === "ADMINISTRATIVO") return "Administrativo/a · Rol heredado";
  return ROL_LABELS[rol];
}

export default function UsuariosPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "crear" | Usuario>(null);
  const [busqueda, setBusqueda] = useState("");
  const [rolFiltro, setRolFiltro] = useState<Rol | "TODOS">("TODOS");
  const [estadoFiltro, setEstadoFiltro] = useState<"TODOS" | "ACTIVOS" | "INACTIVOS">("TODOS");
  const [resetLoadingId, setResetLoadingId] = useState<number | null>(null);

  useEffect(() => {
    if (user && user.rol !== "ADMIN") {
      router.replace("/pacientes");
    }
  }, [user, router]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Usuario[]>("/usuarios/");
      setUsuarios(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

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

  async function handleEliminar(id: number) {
    if (!window.confirm("¿Seguro que deseas eliminar este usuario?")) return;
    try {
      await api.delete(`/usuarios/${id}/`);
      await cargar();
      toast.success("Usuario eliminado correctamente.");
    } catch (error) {
      toast.error(
        getErrorMessage(error, "No se pudo eliminar el usuario. Es posible que tenga registros asociados."),
      );
    }
  }

  async function handleResetPassword(usuario: Usuario) {
    const rutFormateado = formatearRut(usuario.rut);
    const confirmado = window.confirm(
      `¿Resetear la contraseña de ${usuario.nombre}? Quedará como los últimos 4 dígitos del RUT ${rutFormateado}, sin dígito verificador.`,
    );
    if (!confirmado) return;

    setResetLoadingId(usuario.id);
    try {
      await api.post(`/usuarios/${usuario.id}/reset-password/`);
      toast.success("Contraseña restablecida. Use los últimos 4 dígitos del RUT, sin dígito verificador.");
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
    <div className="space-y-4 text-[13px]">
      <header className="ccr-panel rounded-xl bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
              <FiShield size={13} />
              Administración
            </p>
            <h1 className="mt-2 text-2xl font-black text-slate-950">Usuarios</h1>
            <p className="mt-1 text-sm text-slate-500">
              Gestión básica de accesos y roles operativos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setModal("crear")}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#335FDB] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#284FC0]"
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

      <section className="ccr-panel rounded-xl bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
          <div className="relative">
            <FiSearch
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-500"
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

      <section className="ccr-panel overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            {usuariosFiltrados.length} usuario{usuariosFiltrados.length !== 1 ? "s" : ""} en vista
          </p>
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700">
            Filtros en azul
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-gray-400 animate-pulse">Cargando...</div>
        ) : usuariosFiltrados.length === 0 ? (
          <div className="p-10 text-center text-sm font-semibold text-slate-500">
            Sin usuarios para los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-500">Nombre</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-500">RUT</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-500">Rol</th>
                  <th className="px-5 py-3 text-left text-xs font-bold text-slate-500">Estado</th>
                  <th className="px-5 py-3 text-right text-xs font-bold text-slate-500">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.map((usuario) => (
                  <tr key={usuario.id} className="border-b border-slate-50 transition hover:bg-blue-50/40">
                    <td className="px-5 py-3 font-bold text-slate-900">{usuario.nombre}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">
                      {formatearRut(usuario.rut)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${ROL_BADGE_CLASSES[usuario.rol]}`}
                      >
                        {etiquetaRolTabla(usuario.rol)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${
                          usuario.is_active
                            ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                            : "border-slate-100 bg-slate-50 text-slate-500"
                        }`}
                      >
                        {usuario.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setModal(usuario)}
                          className="inline-flex items-center gap-1 rounded-md bg-[#335FDB] px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#284FC0]"
                        >
                          <FiEdit2 size={13} />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleResetPassword(usuario)}
                          disabled={resetLoadingId === usuario.id}
                          className="inline-flex items-center gap-1 rounded-md border border-blue-100 bg-white px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <FiKey size={13} />
                          {resetLoadingId === usuario.id ? "Reseteando" : "Reset clave"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleEliminar(usuario.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-100 bg-white px-2.5 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50"
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
        )}
      </section>

      {modal && (
        <UsuarioModal
          usuario={modal === "crear" ? null : modal}
          onClose={() => setModal(null)}
          onGuardado={cargar}
        />
      )}
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
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    green: "border-emerald-100 bg-emerald-50 text-emerald-700",
    slate: "border-slate-100 bg-slate-50 text-slate-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
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
  const rolHeredado = usuario?.rol === "ADMINISTRATIVO";
  const subtituloDetalle = usuario ? `${usuario.nombre} · ${formatearRut(usuario.rut)}` : "";
  const [form, setForm] = useState({
    nombre: usuario?.nombre ?? "",
    rut: formatearRut(usuario?.rut ?? ""),
    rol: (usuario?.rol ?? "KINE") as Rol,
    password: "",
    confirmPassword: "",
    is_active: usuario?.is_active ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<UsuarioFieldErrors>({});

  function set<K extends keyof typeof form>(field: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field !== "is_active") {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3 py-6"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
              Usuarios
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {editando ? "Editar usuario" : "Crear usuario"}
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Gestiona acceso interno a ListaEsperaCCR.
            </p>
            {subtituloDetalle && (
              <p className="mt-1 text-xs font-semibold text-slate-400">{subtituloDetalle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            aria-label="Cerrar"
          >
            <FiX size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex max-h-[calc(92vh-102px)] flex-col">
          <div className="overflow-y-auto px-6 py-5">
            {error && (
              <p className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {error}
              </p>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Datos de acceso</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500">
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
                  <h3 className="text-sm font-black text-slate-900">Perfil y estado</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Rol operativo y disponibilidad de la cuenta.
                  </p>
                </div>

                {rolHeredado && (
                  <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-3">
                    <p className="text-xs font-black text-amber-900">
                      Administrativo/a (rol heredado)
                    </p>
                    <p className="mt-1 text-xs font-semibold text-amber-800">
                      Este rol existe por compatibilidad. Para nuevos usuarios use Kinesiólogo/a o
                      Administrador/a.
                    </p>
                  </div>
                )}

                <FormField label="Rol *" error={fieldErrors.rol}>
                  <select
                    value={form.rol}
                    onChange={(event) => set("rol", event.target.value as Rol)}
                    className="ccr-control-input w-full px-3 py-2.5 text-sm"
                  >
                    {rolHeredado && form.rol === "ADMINISTRATIVO" && (
                      <option value="ADMINISTRATIVO" disabled>
                        Administrativo/a (rol heredado)
                      </option>
                    )}
                    {ROLES_SELECCIONABLES.map((rol) => (
                      <option key={rol.value} value={rol.value}>
                        {rol.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                {editando && (
                  <div className="rounded-lg border border-slate-200 px-3 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-black text-slate-900">Estado activo</p>
                        <p className="mt-1 text-xs font-medium text-slate-500">
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
                          form.is_active ? "bg-[#335FDB]" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${
                            form.is_active ? "left-6" : "left-1"
                          }`}
                        />
                      </button>
                    </div>
                    <p className="mt-3 inline-flex rounded-full border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">
                      {form.is_active ? "Activo" : "Inactivo"}
                    </p>
                  </div>
                )}
              </section>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#335FDB] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#284FC0] disabled:cursor-not-allowed disabled:opacity-60"
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
      <span className="mb-1 block text-xs font-bold text-slate-600">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}
    </label>
  );
}
