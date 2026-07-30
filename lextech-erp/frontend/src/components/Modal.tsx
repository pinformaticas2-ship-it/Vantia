import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// ── Modal/Sheet reutilizable ──────────────────────────────────────────────
// Antes cada modal de la app tenía su propio "fixed inset-0 + createPortal"
// escrito a mano, siempre centrado con un max-w-* fijo -- en móvil eso
// desbordaba o quedaba diminuto. Este componente centraliza el patrón:
//   - variant="sheet" (por defecto): pantalla completa en móvil, diálogo
//     centrado con `maxWidth` en pantallas sm y superiores.
//   - variant="confirm": siempre un diálogo pequeño y centrado (con margen
//     lateral en móvil), pensado para confirmaciones tipo "¿Eliminar?".
// Usa createPortal a document.body como ya hacían ExpedienteModal,
// AdjuntosModal, ColumnVisibilityModal y BookingPageSettingsModal.

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  iconTone?: "brand" | "danger";
  children?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: "sheet" | "confirm";
  /** Solo aplica en sm: y superiores (variant="sheet") o siempre (variant="confirm"). */
  maxWidth?: string;
  zIndex?: number;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  iconTone = "brand",
  children,
  footer,
  variant = "sheet",
  maxWidth = "max-w-2xl",
  zIndex = 100,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const iconWrapCls = iconTone === "danger" ? "bg-rose-100 text-rose-600" : "bg-red-50 text-red-600 border border-red-100";

  if (variant === "confirm") {
    return createPortal(
      <div className="fixed inset-0 flex items-center justify-center bg-black/30 p-4" style={{ zIndex }} onClick={onClose}>
        <div
          className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {(title || icon) && (
            <div className="mb-4 flex items-start gap-3">
              {icon && <div className={`shrink-0 rounded-xl p-2 ${iconWrapCls}`}>{icon}</div>}
              <div>
                {title && <h3 className="text-sm font-bold text-slate-900">{title}</h3>}
                {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
              </div>
            </div>
          )}
          <div className="text-sm text-slate-600">{children}</div>
          {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" style={{ zIndex }} onClick={onClose}>
      <div
        className={`flex max-h-[92vh] sm:max-h-[88vh] w-full ${maxWidth} flex-col overflow-hidden bg-white shadow-2xl rounded-t-3xl sm:rounded-3xl border-t sm:border border-slate-200 animate-modal-in`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || icon) && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 sm:px-6 py-4">
            <div className="flex min-w-0 items-center gap-3">
              {icon && <div className={`shrink-0 rounded-xl p-2 ${iconWrapCls}`}>{icon}</div>}
              <div className="min-w-0">
                {title && <h2 className="truncate text-base sm:text-lg font-extrabold text-slate-800">{title}</h2>}
                {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-xl border border-slate-200 p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
              title="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6 py-5 modules-scrollbar">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100 px-5 sm:px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
