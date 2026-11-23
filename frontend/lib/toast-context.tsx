"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import hotToast, { ToastBar, Toaster } from "react-hot-toast";
import { FiAlertTriangle, FiInfo } from "react-icons/fi";

/**
 * Avisos de la app sobre react-hot-toast (https://react-hot-toast.com).
 * Se mantiene la API `useToast()` para no tocar las pantallas que ya la usan.
 * react-hot-toast trae éxito y error; advertencia e información usan su aviso
 * base con un ícono propio.
 */

type ToastType = "success" | "error" | "warning" | "info";

interface ToastOptions {
  title?: string;
  duration?: number;
}

type ToastInput = string;
type Mostrar = (message: ToastInput, options?: ToastOptions) => void;

interface ToastContextValue {
  addToast: (
    type: ToastType,
    message: ToastInput,
    options?: ToastOptions,
  ) => void;
  toast: { success: Mostrar; error: Mostrar; warning: Mostrar; info: Mostrar };
  success: Mostrar;
  error: Mostrar;
  warning: Mostrar;
  info: Mostrar;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function contenido(message: string, title?: string): string | ReactElement {
  if (!title) return message;
  return (
    <span>
      <strong className="block font-semibold">{title}</strong>
      {message}
    </span>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const addToast = useCallback(
    (type: ToastType, message: ToastInput, options: ToastOptions = {}) => {
      const duration =
        options.duration === 0 ? Infinity : (options.duration ?? 5000);
      const texto = contenido(message, options.title);
      if (type === "success") hotToast.success(texto, { duration });
      else if (type === "error") hotToast.error(texto, { duration });
      else if (type === "warning")
        hotToast(texto, {
          duration,
          icon: (
            <FiAlertTriangle size={18} className="shrink-0 text-amber-500" />
          ),
          style: {
            background: "#fffbeb",
            color: "#92400e",
            border: "1px solid #fde68a",
          },
        });
      else
        hotToast(texto, {
          duration,
          icon: <FiInfo size={18} className="shrink-0 text-blue-500" />,
        });
    },
    [],
  );

  const success = useCallback<Mostrar>(
    (m, o) => addToast("success", m, o),
    [addToast],
  );
  const error = useCallback<Mostrar>(
    (m, o) => addToast("error", m, o),
    [addToast],
  );
  const warning = useCallback<Mostrar>(
    (m, o) => addToast("warning", m, o),
    [addToast],
  );
  const info = useCallback<Mostrar>(
    (m, o) => addToast("info", m, o),
    [addToast],
  );

  const toast = useMemo(
    () => ({ success, error, warning, info }),
    [success, error, warning, info],
  );
  const contextValue = useMemo(
    () => ({ addToast, toast, success, error, warning, info }),
    [addToast, toast, success, error, warning, info],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Arriba al centro, sobre la barra superior. */}
      <Toaster
        position="top-center"
        gutter={8}
        containerStyle={{ top: 12 }}
        toastOptions={{
          style: { fontSize: 13, maxWidth: 380 },
          // Verde más oscuro para el check de éxito.
          // Éxito en verde: fondo, borde y texto.
          success: {
            iconTheme: { primary: "#15803d", secondary: "#ffffff" },
            style: {
              background: "#f0fdf4",
              color: "#166534",
              border: "1px solid #bbf7d0",
            },
          },
        }}
      >
        {(t) => (
          <ToastBar
            toast={t}
            // Entrada y salida más largas y con curva suave (keyframes en globals.css).
            style={{
              ...t.style,
              animation: t.visible
                ? "ccr-toast-entrar 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards"
                : "ccr-toast-salir 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards",
            }}
          />
        )}
      </Toaster>
    </ToastContext.Provider>
  );
}
