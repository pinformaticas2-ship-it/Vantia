import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";

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
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/35 p-5 backdrop-blur-[2px]">
      <div className="w-full max-w-6xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
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
              <h3 className="text-sm font-bold text-slate-800">Campos disponibles</h3>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
                {sourceLabel}
              </div>
            </div>
            {renderColumnList(availableItems, selectedAvailable, setSelectedAvailable)}
          </div>

          <div className="flex flex-col items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (!selectedAvailable.length) return;
                onMoveToVisible(selectedAvailable);
                setSelectedAvailable([]);
              }}
              className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-600 transition-colors hover:bg-slate-50 hover:text-red-700"
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
              className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-600 transition-colors hover:bg-slate-50 hover:text-red-700"
              title="Quitar seleccionados"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                onMoveAllToVisible();
                setSelectedAvailable([]);
                setSelectedVisible([]);
              }}
              className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-600 transition-colors hover:bg-slate-50 hover:text-red-700"
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
              className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-600 transition-colors hover:bg-slate-50 hover:text-red-700"
              title="Quitar todos"
            >
              <ChevronsLeft size={18} />
            </button>
          </div>

          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-slate-800">Campos visibles</h3>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
                {targetLabel}
              </div>
            </div>
            {renderColumnList(visibleItems, selectedVisible, setSelectedVisible)}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
