"use client";

import type { IconType } from "react-icons";
import {
  FiAlertCircle,
  FiInbox,
  FiRefreshCw,
  FiSearch,
  FiUsers,
  FiWifiOff,
} from "react-icons/fi";

type EmptyVariant = "default" | "search" | "error" | "offline";

const ICONS: Record<EmptyVariant, IconType> = {
  default: FiInbox,
  search: FiSearch,
  error: FiAlertCircle,
  offline: FiWifiOff,
};

const TITLES: Record<EmptyVariant, string> = {
  default: "Sin registros",
  search: "Sin resultados",
  error: "Error al cargar",
  offline: "Sin conexión",
};

interface EmptyStateProps {
  variant?: EmptyVariant;
  icon?: IconType;
  title?: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  compact?: boolean;
}

export default function EmptyState({
  variant = "default",
  icon,
  title,
  message,
  action,
  compact = false,
}: EmptyStateProps) {
  const Icon = icon ?? ICONS[variant];
  const displayTitle = title ?? TITLES[variant];

  const defaultMessages: Record<EmptyVariant, string> = {
    default: "No hay pacientes en esta sección actualmente.",
    search: "Prueba con otros filtros o términos de búsqueda.",
    error: "Ocurrió un problema al cargar los datos. Intenta nuevamente.",
    offline:
      "Verifica tu conexión a internet e intenta recargar la página.",
  };

  const displayMessage = message ?? defaultMessages[variant];

  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
          <Icon className="text-gray-400" size={24} />
        </div>
        <p className="text-[13px] font-semibold text-gray-500">{displayMessage}</p>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-50 hover:shadow-sm"
          >
            <FiRefreshCw size={13} />
            {action.label}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-12 text-center">
      <div
        className={`mb-5 flex items-center justify-center rounded-3xl bg-gray-100 ${
          variant === "error" ? "bg-red-50" : ""
        } ${variant === "offline" ? "bg-amber-50" : ""}`}
        style={{ width: 88, height: 88 }}
      >
        <Icon
          size={36}
          className={
            variant === "error"
              ? "text-red-400"
              : variant === "offline"
                ? "text-amber-400"
                : "text-gray-400"
          }
        />
      </div>

      <h3 className="text-base font-bold text-gray-700">{displayTitle}</h3>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-gray-500">
        {displayMessage}
      </p>

      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 active:scale-[0.98]"
        >
          <FiRefreshCw size={15} />
          {action.label}
        </button>
      )}
    </div>
  );
}
