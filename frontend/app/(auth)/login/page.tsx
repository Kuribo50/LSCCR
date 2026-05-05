"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { Rol } from "@/lib/types";
import { formatearRut, rutParaApi } from "@/lib/rut";
import type { IconType } from "react-icons";
import {
  FiActivity,
  FiAlertCircle,
  FiClipboard,
  FiEye,
  FiEyeOff,
  FiKey,
  FiLock,
  FiShield,
  FiUser,
} from "react-icons/fi";

const ROL_LABELS: Record<string, string> = {
  KINE: "Kinesiólogo/a",
  ADMINISTRATIVO: "Administrativo/a",
  ADMIN: "Administrador/a",
};

const DEMO_PASSWORD = "Ccr2025*";

type QuickUser = {
  id: string;
  nombre: string;
  rut: string;
  rol: Rol;
  icon: IconType;
  iconColor: string;
};

const QUICK_USERS: QuickUser[] = [
  {
    id: "admin",
    nombre: "Administrador",
    rut: "66666666K",
    rol: "ADMIN",
    icon: FiShield,
    iconColor: "#3D4AA3",
  },
  {
    id: "kine-seba-salgado",
    nombre: "Seba Salgado",
    rut: "11111111K",
    rol: "KINE",
    icon: FiActivity,
    iconColor: "#335fdb",
  },
  {
    id: "admin-administrativa",
    nombre: "Administrativa",
    rut: "55555555K",
    rol: "ADMINISTRATIVO",
    icon: FiClipboard,
    iconColor: "#0E7490",
  },
  {
    id: "kine-seba-campos",
    nombre: "Seba Campos",
    rut: "22222222K",
    rol: "KINE",
    icon: FiActivity,
    iconColor: "#7C3AED",
  },
  {
    id: "kine-mane",
    nombre: "Mane",
    rut: "33333333K",
    rol: "KINE",
    icon: FiActivity,
    iconColor: "#059669",
  },
  {
    id: "kine-ma-ignacia",
    nombre: "Ma Ignacia",
    rut: "44444444K",
    rol: "KINE",
    icon: FiActivity,
    iconColor: "#c90603",
  },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [rut, setRut] = useState(formatearRut(QUICK_USERS[0].rut));
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [selectedQuickRut, setSelectedQuickRut] = useState(QUICK_USERS[0].rut);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleQuickUserSelect(rutUsuario: string) {
    setSelectedQuickRut(rutUsuario);
    setError("");
    setRut(formatearRut(rutUsuario));
    setPassword(DEMO_PASSWORD);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(rutParaApi(rut), password);
      router.replace("/inicio");
    } catch (err: unknown) {
      const errorData = err as { non_field_errors?: string[]; detail?: string };
      const rawMessage =
        errorData.non_field_errors?.[0] ||
        errorData.detail ||
        "Error al iniciar sesión.";
      setError(rawMessage.toLowerCase().includes("no active account") 
        ? "No se encontró una cuenta activa para estas credenciales."
        : rawMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-5xl ccr-fade-up overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_24px_48px_-28px_rgba(15,23,42,0.28)]">
      <div className="grid md:grid-cols-[40%_60%] min-h-[600px]">
        {/* Panel Lateral (Modo Dev / Accesos Rápidos) */}
        <aside className="relative flex flex-col bg-[linear-gradient(160deg,#0f172a_0%,#1e293b_100%)] p-8 text-white overflow-hidden">
          <div className="pointer-events-none absolute -left-12 -top-12 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="pointer-events-none absolute top-1/4 right-8 h-4 w-4 rounded-full bg-white/20" />
          <div className="pointer-events-none absolute bottom-1/4 left-12 h-6 w-6 rounded-full bg-white/10" />
          
          <div className="relative z-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/20 text-white mb-6 shadow-lg border border-blue-400/10">
              <FiActivity size={24} />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Acceso Rápido</h2>
            <p className="mt-2 text-sm text-white/60 leading-relaxed max-w-[20ch]">
              Selecciona un entorno de pruebas para ingresar.
            </p>
          </div>

          <div className="relative z-10 mt-8 space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
             {QUICK_USERS.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => handleQuickUserSelect(user.rut)}
                  className={`ccr-interactive w-full flex items-center gap-4 rounded-lg border p-3.5 outline-none ${
                    selectedQuickRut === user.rut
                      ? "border-blue-300/60 bg-blue-500/20 shadow-lg"
                      : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-white shadow-inner`}>
                     <user.icon size={16} style={{ color: user.iconColor }} />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="font-bold text-sm truncate leading-tight">{user.nombre}</p>
                    <p className="text-[9px] uppercase tracking-wider text-white/50 font-bold mt-0.5">{ROL_LABELS[user.rol]}</p>
                  </div>
                </button>
              ))}
          </div>

          <div className="mt-8 relative z-10 py-6 px-4 border-t border-white/10 text-center opacity-30">
            <FiShield size={16} className="mx-auto mb-2" />
          </div>
        </aside>

        {/* Panel Formulario */}
        <main className="flex flex-col justify-center p-8 lg:p-14 bg-[radial-gradient(circle_at_85%_10%,#ecf5f8_0%,transparent_40%)]">
          <div className="mb-10 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-5 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm border border-gray-200">
                <FiKey size={22} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500">Seguridad Institucional</p>
                <h1 className="text-2xl font-extrabold text-gray-900">Iniciar Sesión</h1>
              </div>
            </div>
            <FiShield className="text-blue-600/20" size={32} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 max-w-sm mx-auto w-full">
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-600 ml-1">RUT</label>
              <div className="relative group">
                <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                <input
                  type="text"
                  value={rut}
                  onChange={(e) => setRut(formatearRut(e.target.value))}
                  placeholder="11.111.111-K"
                  maxLength={12}
                  required
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-4 pl-12 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 shadow-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-gray-600 ml-1">Contraseña</label>
              <div className="relative group">
                <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  required
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-4 pl-12 pr-12 text-sm outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50 shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors"
                >
                  {showPassword ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-xs font-medium text-red-600">
                <FiAlertCircle className="shrink-0" size={16} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 rounded-lg bg-[linear-gradient(135deg,#335fdb_0%,#284fc0_100%)] py-4 text-sm font-bold tracking-wide text-white shadow-xl shadow-blue-600/20 transition-all hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Verificando..." : "Acceder al Sistema"}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}
