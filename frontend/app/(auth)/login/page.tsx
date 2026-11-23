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
  FiAlertCircle,
  FiArrowRight,
  FiCheck,
  FiEye,
  FiEyeOff,
  FiLock,
  FiMoon,
  FiShield,
  FiSun,
  FiUploadCloud,
  FiUser,
} from "react-icons/fi";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const DEMO_PASSWORD = "Ccr2025*";
const DEFAULT_RUT = "66666666K";
const REMEMBER_RUT_KEY = "ccr-login-rut";
const REMEMBER_SESSION_KEY = "ccr-login-remember";
const LOGIN_THEME_KEY = "ccr-login-theme";
const BRAND_ALT = "Centro Comunitario de Rehabilitación CESFAM Dr. Alberto Reyes";

// Accesos rapidos visibles solo en modo demo (NEXT_PUBLIC_DEMO_MODE=true).
type QuickUser = {
  id: string;
  nombre: string;
  rut: string;
  rol: string;
  icon: IconType;
};

const QUICK_GROUPS: { titulo: string; usuarios: QuickUser[] }[] = [
  {
    titulo: "Administración",
    usuarios: [
      { id: "admin", nombre: "Administrador CCR", rut: "66666666K", rol: "Administrador", icon: FiShield },
      // Médico: carga las derivaciones extraídas de TrakCare.
      { id: "medico", nombre: "Médico CCR", rut: "99999999K", rol: "Médico", icon: FiUploadCloud },
    ],
  },
  {
    titulo: "Profesionales",
    usuarios: [
      { id: "kine-seba-salgado", nombre: "Sebastián Salgado", rut: "11111111K", rol: "Profesional", icon: FiActivity },
      { id: "kine-seba-campos", nombre: "Sebastián Campos", rut: "22222222K", rol: "Profesional", icon: FiActivity },
      { id: "kine-mane", nombre: "Mane Sáez", rut: "33333333K", rol: "Profesional encargada", icon: FiActivity },
      { id: "kine-pilar", nombre: "Pilar Alarcón", rut: "77777777K", rol: "Profesional", icon: FiActivity },
      { id: "kine-karen", nombre: "Karen Torres", rut: "88888888K", rol: "Profesional", icon: FiActivity },
    ],
  },
];

const QUICK_USERS = QUICK_GROUPS.flatMap((grupo) => grupo.usuarios);

function normalizeLoginError(rawMessage: string) {
  const lower = rawMessage.toLowerCase();
  if (
    lower.includes("no active account") ||
    lower.includes("credentials") ||
    lower.includes("cuenta de usuario activa") ||
    lower.includes("credenciales")
  ) {
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

const INPUT =
  "h-11 w-full rounded-lg border border-[color:var(--border-input)] bg-[color:var(--bg-input)] text-[14px] font-semibold text-[color:var(--text-primary)] outline-none transition-colors placeholder:font-medium placeholder:text-[color:var(--text-placeholder)] hover:border-slate-300 focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-focus-ring)] dark:hover:border-ink-black-500";

/** Fila de acceso demo, al estilo de las listas del panel (Llamados, Grupos). */
function AccesoRapido({ usuario, seleccionado, onClick }: { usuario: QuickUser; seleccionado: boolean; onClick: () => void }) {
  const Icon = usuario.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={seleccionado}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--brand-focus-ring)] ${
        seleccionado
          ? "border-blue-300 bg-blue-50/70 dark:border-blue-500/50 dark:bg-blue-500/10"
          : "border-transparent hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--bg-hover)]"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          seleccionado
            ? "bg-[color:var(--action)] text-white"
            : "bg-[color:var(--bg-elevated)] text-[color:var(--text-muted)] ring-1 ring-inset ring-[color:var(--border-subtle)]"
        }`}
      >
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold text-[color:var(--text-primary)]">{usuario.nombre}</span>
        <span className="block truncate text-[11px] font-semibold tabular-nums text-[color:var(--text-subtle)]">
          {usuario.rol} · {formatearRut(usuario.rut)}
        </span>
      </span>
      {seleccionado && <FiCheck className="shrink-0 text-[color:var(--action)]" size={15} aria-hidden="true" />}
    </button>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [rut, setRut] = useState(IS_DEMO ? formatearRut(DEFAULT_RUT) : "");
  const [password, setPassword] = useState(IS_DEMO ? DEMO_PASSWORD : "");
  const [selectedQuickRut, setSelectedQuickRut] = useState(IS_DEMO ? DEFAULT_RUT : "");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Preferencias locales del login: no participan en autenticacion backend.
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
    if (!IS_DEMO) return;
    // Carga credenciales demo sin autenticar todavia; el submit sigue pasando
    // por SimpleJWT y validaciones reales del backend.
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

    try {
      const rutApi = rutParaApi(rut);
      await login(rutApi, password);
      if (rememberSession) {
        window.localStorage.setItem(REMEMBER_RUT_KEY, rutApi);
      }
      toast.success("Sesión iniciada");
      window.setTimeout(() => router.replace("/inicio"), 350);
    } catch (err: unknown) {
      const errorData = err as { non_field_errors?: string[]; detail?: string; message?: string };
      const rawMessage =
        errorData.non_field_errors?.[0] ||
        errorData.detail ||
        errorData.message ||
        "Error al iniciar sesión.";
      setError(normalizeLoginError(rawMessage));
    } finally {
      setLoading(false);
    }
  }

  const accesos = IS_DEMO && (
    <div className="space-y-3">
      {QUICK_GROUPS.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="px-1 pb-1 text-[11px] font-bold text-[color:var(--text-subtle)]">{grupo.titulo}</p>
          <div className="space-y-1">
            {grupo.usuarios.map((usuario) => (
              <AccesoRapido
                key={usuario.id}
                usuario={usuario}
                seleccionado={selectedQuickRut === usuario.rut}
                onClick={() => handleQuickUserSelect(usuario.rut)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="ccr-login-background relative isolate flex min-h-screen w-full flex-col overflow-hidden">
      <header className="relative z-10 flex items-center justify-end px-4 pt-4 sm:px-6">
        <button
          type="button"
          onClick={toggleDarkMode}
          aria-label={darkMode ? "Activar modo claro" : "Activar modo oscuro"}
          className="ccr-control-button inline-flex items-center gap-2"
        >
          {darkMode ? <FiSun size={14} aria-hidden="true" /> : <FiMoon size={14} aria-hidden="true" />}
          {darkMode ? "Modo claro" : "Modo oscuro"}
        </button>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-6 sm:px-6">
        <div
          className={`ccr-login-card ccr-page-enter grid w-full overflow-hidden rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--bg-card)] shadow-[var(--shadow-lift)] ${
            IS_DEMO ? "max-w-[960px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]" : "max-w-[440px]"
          }`}
        >
          {/* Marca y accesos demo */}
          {IS_DEMO && (
            <aside className="hidden flex-col border-r border-[color:var(--border-subtle)] bg-[color:var(--bg-elevated)] p-6 lg:flex">
              <Image src={logoHorizontal} alt={BRAND_ALT} className="h-auto w-[220px] object-contain" sizes="220px" priority />
              <div className="mt-6">
                <p className="text-[13px] font-extrabold text-[color:var(--text-primary)]">Accesos de prueba</p>
                <p className="mt-0.5 text-[12px] font-medium text-[color:var(--text-muted)]">
                  Elige un perfil para cargar sus credenciales.
                </p>
              </div>
              <div className="mt-4">{accesos}</div>
            </aside>
          )}

          {/* Formulario */}
          <section className="flex flex-col justify-center p-6 sm:p-10">
            <Image
              src={logoHorizontal}
              alt={BRAND_ALT}
              className={`mb-8 h-auto w-[220px] object-contain ${IS_DEMO ? "lg:hidden" : ""}`}
              sizes="220px"
              priority
            />

            <div className="mb-6">
              <h1 className="text-[22px] font-extrabold tracking-tight text-[color:var(--text-primary)]">Iniciar sesión</h1>
              <p className="mt-1 text-[13px] font-medium text-[color:var(--text-muted)]">
                Lista de Espera CCR · CESFAM Dr. Alberto Reyes
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="rut" className="text-[12px] font-bold text-[color:var(--text-secondary)]">
                  RUT
                </label>
                <div className="relative">
                  <FiUser className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-placeholder)]" size={16} aria-hidden="true" />
                  <input
                    id="rut"
                    type="text"
                    inputMode="text"
                    autoComplete="username"
                    value={rut}
                    onChange={(e) => {
                      const nextRut = e.target.value.replace(/[^0-9Kk]/g, "").toUpperCase();
                      setRut(formatearRut(e.target.value));
                      setSelectedQuickRut(IS_DEMO && QUICK_USERS.some((user) => user.rut === nextRut) ? nextRut : "");
                      setError(null);
                    }}
                    placeholder="11.111.111-K"
                    maxLength={12}
                    required
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "login-error" : undefined}
                    className={`${INPUT} pl-9 pr-3 tabular-nums`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-[12px] font-bold text-[color:var(--text-secondary)]">
                  Contraseña
                </label>
                <div className="relative">
                  <FiLock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-placeholder)]" size={16} aria-hidden="true" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    placeholder="Ingresa tu contraseña"
                    required
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "login-error" : undefined}
                    className={`${INPUT} pl-9 pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--text-placeholder)] outline-none transition-colors hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-focus-ring)]"
                  >
                    {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                  </button>
                </div>
              </div>

              <label htmlFor="remember-session" className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[color:var(--text-secondary)]">
                <input
                  id="remember-session"
                  type="checkbox"
                  checked={rememberSession}
                  onChange={(event) => handleRememberChange(event.target.checked)}
                  className="h-4 w-4 rounded border-[color:var(--border-input)] text-[color:var(--action)] focus:ring-[color:var(--brand-focus-ring)]"
                />
                Recordar mi RUT en este equipo
              </label>

              {error && (
                <div
                  id="login-error"
                  role="alert"
                  className="ccr-login-alert flex gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-500/30 dark:bg-red-500/10"
                >
                  <FiAlertCircle className="mt-0.5 shrink-0 text-red-600 dark:text-red-300" size={16} aria-hidden="true" />
                  <div>
                    <p className="text-[13px] font-bold text-red-800 dark:text-red-200">{error.title}</p>
                    <p className="mt-0.5 text-[12px] font-medium text-red-700 dark:text-red-200/90">{error.detail}</p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !rut.trim() || !password.trim()}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[color:var(--action)] px-4 text-[14px] font-bold text-white outline-none transition-colors hover:bg-[color:var(--action-hover)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-focus-ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                    Verificando…
                  </>
                ) : (
                  <>
                    Entrar
                    <FiArrowRight size={16} aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            {/* En pantallas chicas los accesos de prueba van bajo el formulario. */}
            {IS_DEMO && (
              <div className="mt-8 border-t border-[color:var(--border-subtle)] pt-5 lg:hidden">
                <p className="mb-3 text-[13px] font-extrabold text-[color:var(--text-primary)]">Accesos de prueba</p>
                {accesos}
              </div>
            )}

            <p className="mt-8 text-[11px] font-medium text-[color:var(--text-subtle)]">
              ¿Olvidaste tu contraseña? Pide al administrador del sistema que la reinicie.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
