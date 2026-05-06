"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  FiEdit2,
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
import { formatearRut, rutParaApi } from "@/lib/rut";
import type { Rol, Usuario } from "@/lib/types";

const ROL_LABELS: Record<Rol, string> = {
  KINE: "Kinesiólogo/a",
  ADMINISTRATIVO: "Administrativo/a",
  ADMIN: "Administrador/a",
};

const ROL_BADGE_CLASSES: Record<Rol, string> = {
  ADMIN: "border-blue-100 bg-blue-50 text-blue-700",
  KINE: "border-emerald-100 bg-emerald-50 text-emerald-700",
  ADMINISTRATIVO: "border-slate-100 bg-slate-50 text-slate-700",
};

const ROLES_NUEVOS: Rol[] = ["KINE", "ADMIN"];

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

export default function UsuariosPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "crear" | Usuario>(null);
  const [busqueda, setBusqueda] = useState("");
  const [rolFiltro, setRolFiltro] = useState<Rol | "TODOS">("TODOS");
  const [estadoFiltro, setEstadoFiltro] = useState<"TODOS" | "ACTIVOS" | "INACTIVOS">("TODOS");

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
    } catch {
      alert("No se pudo eliminar el usuario. Es posible que tenga registros asociados.");
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
            {(Object.entries(ROL_LABELS) as [Rol, string][]).map(([rol, label]) => (
              <option key={rol} value={rol}>
                {label}
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
                        {ROL_LABELS[usuario.rol]}
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
                          className="inline-flex items-center gap-1 rounded-md border border-blue-100 bg-white px-2.5 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50"
                        >
                          <FiEdit2 size={13} />
                          Editar
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

function UsuarioModal({
  usuario,
  onClose,
  onGuardado,
}: {
  usuario: Usuario | null;
  onClose: () => void;
  onGuardado: () => void | Promise<void>;
}) {
  const editando = usuario !== null;
  const [form, setForm] = useState({
    nombre: usuario?.nombre ?? "",
    rut: formatearRut(usuario?.rut ?? ""),
    rol: (usuario?.rol ?? "KINE") as Rol,
    password: "",
    is_active: usuario?.is_active ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function set(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        rut: rutParaApi(form.rut),
        nombre: form.nombre,
        rol: form.rol,
        is_active: form.is_active,
      };
      if (!editando) {
        body.password = form.password;
      } else if (form.password) {
        body.password = form.password;
      }

      if (editando) {
        await api.patch(`/usuarios/${usuario!.id}/`, body);
      } else {
        await api.post("/usuarios/", body);
      }
      await onGuardado();
      onClose();
    } catch (e: unknown) {
      if (e && typeof e === "object") {
        const msgs = Object.entries(e as Record<string, string[] | string>)
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
          .join(" | ");
        setError(msgs || "No se pudo guardar el usuario.");
      } else {
        setError("No se pudo guardar el usuario.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50 px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
              Usuarios
            </p>
            <h2 className="text-base font-black text-slate-950">
              {editando ? "Editar usuario" : "Nuevo usuario"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-100 bg-white text-slate-500 transition hover:bg-blue-50"
            aria-label="Cerrar"
          >
            <FiX size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 px-5 py-4">
          {error && (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </p>
          )}

          <FormField label="Nombre *">
            <input
              required
              value={form.nombre}
              onChange={(event) => set("nombre", event.target.value)}
              className="ccr-control-input w-full px-3 py-2.5 text-sm"
            />
          </FormField>

          <FormField label="RUT *">
            <input
              required
              value={form.rut}
              onChange={(event) => set("rut", formatearRut(event.target.value))}
              placeholder="12.345.678-K"
              className="ccr-control-input w-full px-3 py-2.5 font-mono text-sm"
            />
          </FormField>

          <FormField label="Rol *">
            <select
              value={form.rol}
              onChange={(event) => set("rol", event.target.value)}
              className="ccr-control-input w-full px-3 py-2.5 text-sm"
            >
              {editando && usuario?.rol === "ADMINISTRATIVO" && (
                <option value="ADMINISTRATIVO" disabled>
                  Administrativo/a (rol heredado)
                </option>
              )}
              {ROLES_NUEVOS.map((rol) => (
                <option key={rol} value={rol}>
                  {ROL_LABELS[rol]}
                </option>
              ))}
            </select>
          </FormField>
          {editando && usuario?.rol === "ADMINISTRATIVO" && (
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Rol heredado: existe por compatibilidad. Para nuevos usuarios use KINE o ADMIN.
            </p>
          )}

          <FormField label={editando ? "Nueva contraseña (opcional)" : "Contraseña *"}>
            <input
              type="password"
              required={!editando}
              minLength={8}
              value={form.password}
              onChange={(event) => set("password", event.target.value)}
              placeholder="••••••••"
              className="ccr-control-input w-full px-3 py-2.5 text-sm"
            />
          </FormField>

          {editando && (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => set("is_active", event.target.checked)}
                className="h-4 w-4 accent-[#335FDB]"
              />
              Usuario activo
            </label>
          )}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="ccr-control-button rounded-lg px-4 py-2.5 text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-[#335FDB] py-2.5 text-sm font-bold text-white transition hover:bg-[#284FC0] disabled:opacity-60"
            >
              {loading ? "Guardando..." : editando ? "Guardar cambios" : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
