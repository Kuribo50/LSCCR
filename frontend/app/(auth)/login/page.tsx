"use client";

import { useEffect, useState, FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { formatearRut, rutParaApi } from "@/lib/rut";
import logoHorizontal from "../../../public/logoHorizontal.png";
import type { IconType } from "react-icons";
import {
  FiActivity,
  FiCheck,
  FiCheckCircle,
  FiEye,
  FiEyeOff,
  FiLock,
  FiMoon,
  FiShield,
  FiSun,
  FiUser,
} from "react-icons/fi";

const DEMO_PASSWORD = "Ccr2025*";
const DEFAULT_RUT = "66666666K";
const REMEMBER_RUT_KEY = "ccr-login-rut";
const REMEMBER_SESSION_KEY = "ccr-login-remember";
const LOGIN_THEME_KEY = "ccr-login-theme";

type QuickUser = {
  id: string;
  nombre: string;
  rut: string;
  icon: IconType;
  tone: "blue" | "green" | "indigo";
};

const QUICK_USERS: QuickUser[] = [
  {
    id: "admin",
    nombre: "Administrador CCR",
    rut: "66666666K",
    icon: FiShield,
    tone: "indigo",
  },
  {
    id: "kine-seba-salgado",
    nombre: "Sebastián Salgado",
    rut: "11111111K",
    icon: FiActivity,
    tone: "blue",
  },
  {
    id: "kine-seba-campos",
    nombre: "Sebastián Campos",
    rut: "22222222K",
    icon: FiActivity,
    tone: "blue",
  },
  {
    id: "kine-mane",
    nombre: "Mane Sáez",
    rut: "33333333K",
    icon: FiActivity,
    tone: "green",
  },
  {
    id: "kine-pilar",
    nombre: "Pilar Alarcón",
    rut: "77777777K",
    icon: FiActivity,
    tone: "green",
  },
  {
    id: "kine-karen",
    nombre: "Karen Torres",
    rut: "88888888K",
    icon: FiActivity,
    tone: "green",
  },
];

function quickAccessClasses(tone: QuickUser["tone"], selected: boolean) {
  const selectedClasses = {
    blue: "border-white bg-white text-sky-950 shadow-sky-950/20",
    green: "border-white bg-white text-emerald-950 shadow-emerald-950/20",
    indigo: "border-white bg-white text-indigo-950 shadow-indigo-950/20",
  };

  if (selected) {
    return selectedClasses[tone];
  }

  return "border-white/16 bg-white/10 text-white shadow-slate-950/10 hover:border-white/35 hover:bg-white/18";
}

function normalizeLoginError(rawMessage: string) {
  const lower = rawMessage.toLowerCase();
  if (lower.includes("no active account") || lower.includes("credentials")) {
    return {
      title: "Credenciales incorrectas",
      detail: "Revisa el RUT y la contraseña. Si el usuario existe, confirma que la cuenta esté activa.",
    };
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return {
      title: "No se pudo conectar",
      detail: "Verifica que el servidor esté encendido y vuelve a intentar.",
    };
  }
  return {
    title: "No se pudo iniciar sesión",
    detail: rawMessage || "Ocurrió un problema al validar las credenciales.",
  };
}

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [rut, setRut] = useState(formatearRut(DEFAULT_RUT));
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [selectedQuickRut, setSelectedQuickRut] = useState(DEFAULT_RUT);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<"rut" | "password" | null>(null);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(LOGIN_THEME_KEY);
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const shouldUseDark = savedTheme ? savedTheme === "dark" : Boolean(prefersDark);
    setDarkMode(shouldUseDark);
    document.documentElement.classList.toggle("dark", shouldUseDark);

    const savedRemember = window.localStorage.getItem(REMEMBER_SESSION_KEY);
    const shouldRemember = savedRemember !== "false";
    setRememberSession(shouldRemember);

    const savedRut = window.localStorage.getItem(REMEMBER_RUT_KEY);
    if (shouldRemember && savedRut) {
      setRut(formatearRut(savedRut));
      setSelectedQuickRut(savedRut.replace(/[^0-9Kk]/g, "").toUpperCase());
    }
  }, []);

  function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem(LOGIN_THEME_KEY, next ? "dark" : "light");
  }

  function handleQuickUserSelect(rutUsuario: string) {
    setSelectedQuickRut(rutUsuario);
    setError(null);
    setRut(formatearRut(rutUsuario));
    setPassword(DEMO_PASSWORD);
  }

  function handleRememberChange(checked: boolean) {
    setRememberSession(checked);
    window.localStorage.setItem(REMEMBER_SESSION_KEY, String(checked));
    if (!checked) {
      window.localStorage.removeItem(REMEMBER_RUT_KEY);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    toast.info("Validando credenciales...");

    try {
      const rutApi = rutParaApi(rut);
      await login(rutApi, password);
      if (rememberSession) {
        window.localStorage.setItem(REMEMBER_RUT_KEY, rutApi);
      }
      toast.success("Ingreso exitoso. Cargando panel...");
      window.setTimeout(() => router.replace("/inicio"), 450);
    } catch (err: unknown) {
      const errorData = err as { non_field_errors?: string[]; detail?: string; message?: string };
      const rawMessage =
        errorData.non_field_errors?.[0] ||
        errorData.detail ||
        errorData.message ||
        "Error al iniciar sesión.";
      const normalized = normalizeLoginError(rawMessage);
      setError(normalized);
      toast.error(`${normalized.title}: ${normalized.detail}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ccr-login-background relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4 sm:p-6">
      <button
        type="button"
        onClick={toggleDarkMode}
        aria-label={darkMode ? "Activar modo claro" : "Activar modo oscuro"}
        className="ccr-login-theme-toggle group fixed right-4 top-4 z-20 inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/75 px-4 py-2 text-xs font-black text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white focus:outline-none focus:ring-4 focus:ring-sky-200 dark:!border-white/10 dark:!bg-slate-950/70 dark:!text-white dark:focus:!ring-sky-500/25"
      >
        {darkMode ? <FiSun size={16} /> : <FiMoon size={16} />}
        <span>{darkMode ? "Modo claro" : "Modo oscuro"}</span>
      </button>

      <div className="ccr-login-shell ccr-login-enter relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[2.75rem] bg-white shadow-2xl shadow-slate-900/18 dark:!bg-slate-950 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="hidden min-h-[720px] bg-gradient-to-br from-[#0b72bf] via-[#075494] to-[#07305f] p-7 text-white dark:!from-[#02111f] dark:!via-[#07305f] dark:!to-[#0f172a] lg:flex lg:flex-col lg:justify-center">
          <div className="mx-auto mb-7 max-w-[285px] rounded-[1.4rem] bg-white p-3 shadow-2xl shadow-slate-950/20">
            <Image
              src={logoHorizontal}
              alt="Centro Comunitario de Rehabilitación CESFAM Dr. Alberto Reyes"
              className="h-auto w-full object-contain"
              priority
            />
          </div>

          <div className="rounded-[2rem] border border-white/12 bg-white/8 p-4 shadow-2xl shadow-slate-950/20">
            <div className="mb-4 px-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100">
                Accesos rápidos
              </p>
              <p className="mt-1 text-xs font-bold text-sky-100/80">
                Selecciona un perfil para cargar sus credenciales.
              </p>
            </div>

            <div className="grid gap-2">
              {QUICK_USERS.map((user) => {
                const Icon = user.icon;
                const selected = selectedQuickRut === user.rut;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleQuickUserSelect(user.rut)}
                    aria-pressed={selected}
                    className={`group flex min-h-[58px] items-center gap-2 rounded-2xl border px-3 py-2 text-left shadow-lg outline-none backdrop-blur transition duration-150 hover:-translate-y-0.5 focus:ring-4 focus:ring-white/30 ${quickAccessClasses(user.tone, selected)}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-900 shadow-sm transition group-hover:scale-105">
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black">{user.nombre}</span>
                      <span className="mt-0.5 block truncate text-[10px] font-black tracking-wide opacity-65">
                        {formatearRut(user.rut)}
                      </span>
                    </span>
                    {selected && <FiCheck className="shrink-0" size={16} />}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="relative flex min-h-[720px] w-full flex-col justify-center bg-white px-2 py-8 dark:!bg-white sm:px-6 lg:px-12">
          <div className="mx-auto w-full max-w-xl">
            <div className="ccr-login-panel mb-6 flex justify-center lg:hidden">
              <Image
                src={logoHorizontal}
                alt="Centro Comunitario de Rehabilitación CESFAM Dr. Alberto Reyes"
                className="h-auto w-full max-w-sm object-contain drop-shadow-[0_18px_34px_rgba(15,23,42,0.16)]"
                priority
              />
            </div>

            <div className="mb-6 grid grid-cols-2 gap-2 rounded-[1.75rem] bg-gradient-to-br from-sky-700 via-blue-900 to-slate-950 p-3 lg:hidden">
              {QUICK_USERS.map((user) => {
                const Icon = user.icon;
                const selected = selectedQuickRut === user.rut;
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleQuickUserSelect(user.rut)}
                    aria-pressed={selected}
                    className={`group flex min-h-[58px] items-center gap-2 rounded-2xl border px-3 py-2 text-left shadow-lg outline-none backdrop-blur transition duration-150 hover:-translate-y-0.5 focus:ring-4 focus:ring-sky-200 dark:focus:!ring-sky-500/25 ${quickAccessClasses(user.tone, selected)}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-900 shadow-sm transition group-hover:scale-105 dark:!bg-white/90">
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black">{user.nombre}</span>
                      <span className="mt-0.5 block truncate text-[10px] font-black tracking-wide opacity-65">
                        {formatearRut(user.rut)}
                      </span>
                    </span>
                    {selected && <FiCheck className="shrink-0" size={16} />}
                  </button>
                );
              })}
            </div>

            <div className="flex min-h-[520px] rounded-[2rem] border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10 sm:p-8">
            <form onSubmit={handleSubmit} className="flex w-full flex-col justify-center space-y-5" noValidate>
              <div className="space-y-2">
                <label htmlFor="rut" className="ml-1 text-xs font-black uppercase tracking-[0.15em] text-slate-600">
                  Nombre de usuario / RUT
                </label>
                <div className="group relative">
                  <FiUser
                    className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 transition duration-200 ${
                      focusedInput === "rut" ? "scale-110 text-sky-600" : "text-slate-400"
                    }`}
                    size={19}
                  />
                  <input
                    id="rut"
                    type="text"
                    inputMode="text"
                    autoComplete="username"
                    value={rut}
                    onChange={(e) => {
                      const nextRut = e.target.value.replace(/[^0-9Kk]/g, "").toUpperCase();
                      setRut(formatearRut(e.target.value));
                      setSelectedQuickRut(QUICK_USERS.some((user) => user.rut === nextRut) ? nextRut : "");
                      setError(null);
                    }}
                    onFocus={() => setFocusedInput("rut")}
                    onBlur={() => setFocusedInput(null)}
                    placeholder="11.111.111-K"
                    maxLength={12}
                    required
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "login-error" : undefined}
                    className="ccr-login-input w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-base font-bold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="ml-1 text-xs font-black uppercase tracking-[0.15em] text-slate-600">
                  Contraseña
                </label>
                <div className="group relative">
                  <FiLock
                    className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 transition duration-200 ${
                      focusedInput === "password" ? "scale-110 text-sky-600" : "text-slate-400"
                    }`}
                    size={19}
                  />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    onFocus={() => setFocusedInput("password")}
                    onBlur={() => setFocusedInput(null)}
                    placeholder="Ingresa tu contraseña"
                    required
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "login-error" : undefined}
                    className="ccr-login-input w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-14 text-base font-bold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-100"
                  >
                    {showPassword ? <FiEyeOff size={19} /> : <FiEye size={19} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm">
                <label htmlFor="remember-session" className="flex cursor-pointer items-center gap-3 font-bold text-slate-700">
                  <input
                    id="remember-session"
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(event) => handleRememberChange(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-300"
                  />
                  Mantener sesión iniciada
                </label>
              </div>

              {error && (
                <p id="login-error" role="alert" className="sr-only">
                  {error.title}. {error.detail}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !rut.trim() || !password.trim()}
                className="ccr-login-submit flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 via-blue-700 to-indigo-700 px-4 py-4 text-base font-black text-white shadow-xl shadow-blue-700/25 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-blue-700/30 focus:outline-none focus:ring-4 focus:ring-sky-200 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Verificando credenciales
                  </>
                ) : (
                  <>
                    <FiCheckCircle size={18} />
                    Entrar al sistema
                  </>
                )}
              </button>

              <p className="text-center text-xs font-bold text-slate-500">
                Sistema de gestión de lista de espera CCR
              </p>
            </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
