import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ChevronsLeft, ChevronsRight, SlidersHorizontal, X } from "lucide-react";

type ColumnItem = {
  key: string;
  label: string;
};

type Props = {
  open: boolean;
  title: string;
  sourceLabel: string;
  targetLabel: string;
  availableItems: ColumnItem[];
  visibleItems: ColumnItem[];
  onMoveToVisible: (keys: string[]) => void;
  onMoveToAvailable: (keys: string[]) => void;
  onMoveAllToVisible: () => void;
  onMoveAllToAvailable: () => void;
  onClose: () => void;
};

export default function ColumnVisibilityModal({
  open,
  title,
  sourceLabel,
  targetLabel,
  availableItems,
  visibleItems,
  onMoveToVisible,
  onMoveToAvailable,
  onMoveAllToVisible,
  onMoveAllToAvailable,
  onClose,
}: Props) {
  const [selectedAvailable, setSelectedAvailable] = useState<string[]>([]);
  const [selectedVisible, setSelectedVisible] = useState<string[]>([]);

  const availableSet = useMemo(() => new Set(availableItems.map((item) => item.key)), [availableItems]);
  const visibleSet = useMemo(() => new Set(visibleItems.map((item) => item.key)), [visibleItems]);

  React.useEffect(() => {
    if (!open) return;
    setSelectedAvailable((prev) => prev.filter((key) => availableSet.has(key)));
    setSelectedVisible((prev) => prev.filter((key) => visibleSet.has(key)));
  }, [open, availableSet, visibleSet]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const renderColumnList = (
    items: ColumnItem[],
    selected: string[],
    setSelected: React.Dispatch<React.SetStateAction<string[]>>,
  ) => (
    <div className="h-[42vh] overflow-auto rounded-2xl border border-slate-200 bg-white">
      {items.length === 0 ? (
        <div className="flex h-full items-center justify-center px-6 text-sm text-slate-400">
          No hay columnas en este bloque
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => {
            const checked = selected.includes(item.key);
            return (
              <label
                key={item.key}
                className={`flex cursor-pointer items-center gap-3 px-4 py-3 text-sm transition-colors ${
                  checked ? "bg-red-50 text-red-700" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSelected((prev) =>
                      prev.includes(item.key) ? prev.filter((value) => value !== item.key) : [...prev, item.key]
                    )
                  }
                  className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                />
                <span>{item.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-transparent p-5">
      <div className="w-full max-w-6xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50">
              <SlidersHorizontal size={16} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-400">Elige y ordena los campos que quieres ver en la tabla</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700"
            title="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_84px_minmax(0,1fr)] gap-6 px-6 py-6">
          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800">Campos disponibles</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  {availableItems.length}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
                {sourceLabel}
              </div>
            </div>
            {renderColumnList(availableItems, selectedAvailable, setSelectedAvailable)}
          </div>

          <div className="flex flex-col items-center justify-center gap-3">
            <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-2">
              <button
                type="button"
                onClick={() => {
                  if (!selectedAvailable.length) return;
                  onMoveToVisible(selectedAvailable);
                  setSelectedAvailable([]);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                title="Añadir seleccionados"
              >
                <ArrowRight size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedVisible.length) return;
                  onMoveToAvailable(selectedVisible);
                  setSelectedVisible([]);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                title="Quitar seleccionados"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="my-0.5 h-px w-6 bg-slate-200" />
              <button
                type="button"
                onClick={() => {
                  onMoveAllToVisible();
                  setSelectedAvailable([]);
                  setSelectedVisible([]);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                title="Añadir todos"
              >
                <ChevronsRight size={18} />
              </button>
              <button
                type="button"
                onClick={() => {
                  onMoveAllToAvailable();
                  setSelectedAvailable([]);
                  setSelectedVisible([]);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                title="Quitar todos"
              >
                <ChevronsLeft size={18} />
              </button>
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800">Campos visibles</h3>
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                  {visibleItems.length}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
                {targetLabel}
              </div>
            </div>
            {renderColumnList(visibleItems, selectedVisible, setSelectedVisible)}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-4">
          <p className="text-xs text-slate-400">
            {visibleItems.length} campo{visibleItems.length === 1 ? "" : "s"} visible{visibleItems.length === 1 ? "" : "s"} en la tabla
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-red-600 px-5 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700"
          >
            Listo
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
