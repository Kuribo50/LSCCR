"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Modal, ModalOverlay, Dialog } from "react-aria-components";
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
  const iconMap = {
    danger: FiTrash2,
    warning: FiAlertTriangle,
    info: FiAlertTriangle,
  };

  const iconColorMap = {
    danger: "text-red-600 bg-red-100 dark:bg-red-400/10 dark:text-red-200",
    warning: "text-amber-600 bg-amber-100 dark:bg-amber-400/10 dark:text-amber-200",
    info: "text-blue-600 bg-blue-50 dark:bg-blue-400/10 dark:text-blue-200",
  };

  const btnMap = {
    danger: "bg-red-600 hover:bg-red-700 text-white",
    warning: "bg-amber-600 hover:bg-amber-700 text-white",
    info: "bg-blue-500 hover:bg-blue-600 text-white",
  };

  const Icon = iconMap[variant];

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open && !loading) onCancel(); }}
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
    >
      <Modal className="w-full max-w-md">
        <Dialog aria-label={title} className="outline-none">
          <AnimatePresence>
            {isOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="fixed inset-0 bg-black/50 backdrop-blur-sm dark:bg-black/75"
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
                        <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-gray-600 dark:text-ink-black-200">{message}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2.5 border-t border-gray-100 bg-gray-50/70 px-6 py-4 dark:border-[#2a2a2a] dark:bg-[#181818]">
                    <button
                      type="button"
                      onClick={onCancel}
                      disabled={loading}
                      className="ccr-button-cancel"
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
              </>
            )}
          </AnimatePresence>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
