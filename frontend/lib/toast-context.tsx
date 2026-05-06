"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiCheckCircle,
  FiInfo,
  FiX,
} from "react-icons/fi";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration: number;
}

interface ToastOptions {
  title?: string;
  duration?: number;
}

type ToastInput = string;

interface ToastContextValue {
  addToast: (type: ToastType, message: ToastInput, options?: ToastOptions) => void;
  toast: {
    success: (message: ToastInput, options?: ToastOptions) => void;
    error: (message: ToastInput, options?: ToastOptions) => void;
    warning: (message: ToastInput, options?: ToastOptions) => void;
    info: (message: ToastInput, options?: ToastOptions) => void;
  };
  success: (message: ToastInput, options?: ToastOptions) => void;
  error: (message: ToastInput, options?: ToastOptions) => void;
  warning: (message: ToastInput, options?: ToastOptions) => void;
  info: (message: ToastInput, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const ICON_MAP: Record<ToastType, typeof FiCheckCircle> = {
  success: FiCheckCircle,
  error: FiAlertCircle,
  warning: FiAlertTriangle,
  info: FiInfo,
};

const COLOR_MAP: Record<ToastType, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

const ICON_COLOR_MAP: Record<ToastType, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-sky-500",
};

const DEFAULT_TITLES: Record<ToastType, string> = {
  success: "Listo",
  error: "No se pudo completar",
  warning: "Atención",
  info: "Información",
};

const PROGRESS_MAP: Record<ToastType, string> = {
  success: "bg-emerald-400",
  error: "bg-red-400",
  warning: "bg-amber-400",
  info: "bg-sky-400",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: ToastInput, options: ToastOptions = {}) => {
      const duration = options.duration ?? 5000;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => {
        const next = [...prev, { id, type, title: options.title, message, duration }];
        if (next.length > 5) next.shift();
        return next;
      });

      if (duration > 0) {
        const timer = setTimeout(() => removeToast(id), duration);
        timersRef.current.set(id, timer);
      }
    },
    [removeToast],
  );

  const success = useCallback(
    (message: ToastInput, options?: ToastOptions) => addToast("success", message, options),
    [addToast],
  );
  const error = useCallback(
    (message: ToastInput, options?: ToastOptions) => addToast("error", message, options),
    [addToast],
  );
  const warning = useCallback(
    (message: ToastInput, options?: ToastOptions) => addToast("warning", message, options),
    [addToast],
  );
  const info = useCallback(
    (message: ToastInput, options?: ToastOptions) => addToast("info", message, options),
    [addToast],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

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
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col-reverse gap-2 sm:top-4 sm:bottom-auto sm:flex-col">
        <AnimatePresence initial={false} mode="popLayout">
          {toasts.map((toast) => {
            const Icon = ICON_MAP[toast.type];
            const role = toast.type === "error" || toast.type === "warning" ? "alert" : "status";
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, x: 80, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.9, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                role={role}
                className={`pointer-events-auto overflow-hidden rounded-xl border shadow-lg backdrop-blur-sm ${COLOR_MAP[toast.type]}`}
              >
                <div className="flex items-start gap-2.5 p-3">
                  <Icon className={`mt-0.5 shrink-0 ${ICON_COLOR_MAP[toast.type]}`} size={17} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-black leading-snug">
                      {toast.title || DEFAULT_TITLES[toast.type]}
                    </p>
                    <p className="mt-0.5 text-[12px] font-medium leading-snug">{toast.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeToast(toast.id)}
                    className="shrink-0 rounded-md p-0.5 opacity-50 transition hover:opacity-100"
                    aria-label="Cerrar notificación"
                  >
                    <FiX size={14} />
                  </button>
                </div>
                {toast.duration > 0 && (
                  <motion.div
                    className={`h-0.5 ${PROGRESS_MAP[toast.type]}`}
                    initial={{ width: "100%" }}
                    animate={{ width: "0%" }}
                    transition={{ duration: toast.duration / 1000, ease: "linear" }}
                  />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
