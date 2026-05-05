"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FiAlertTriangle, FiTrash2 } from "react-icons/fi";

interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  loading?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  const bgMap = {
    danger: "bg-red-50 border border-red-100",
    warning: "bg-amber-50 border border-amber-100",
    info: "bg-sky-50 border border-sky-100",
  };

  const iconMap = {
    danger: FiTrash2,
    warning: FiAlertTriangle,
    info: FiAlertTriangle,
  };

  const iconColorMap = {
    danger: "text-red-600 bg-red-100",
    warning: "text-amber-600 bg-amber-100",
    info: "text-sky-600 bg-sky-100",
  };

  const btnMap = {
    danger: "bg-red-600 hover:bg-red-700 text-white",
    warning: "bg-amber-600 hover:bg-amber-700 text-white",
    info: "bg-sky-600 hover:bg-sky-700 text-white",
  };

  const Icon = iconMap[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm dark:bg-black/75"
            onClick={loading ? undefined : onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 6 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="relative w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-[#2a2a2a] dark:bg-[#111111]"
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconColorMap[variant]}`}>
                  <Icon size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">{title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-gray-600 dark:text-[#b5d8e3]">{message}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 border-t border-gray-100 bg-gray-50/70 px-6 py-4 dark:border-[#2a2a2a] dark:bg-[#181818]">
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-[#2a2a2a] dark:bg-[#151515] dark:text-[#ecf5f8] dark:hover:bg-[#242424]"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className={`rounded-xl px-4 py-2.5 text-[13px] font-semibold transition disabled:opacity-50 ${btnMap[variant]}`}
              >
                {loading ? "Procesando..." : confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
