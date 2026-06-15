import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Undo2, X, CheckCircle2 } from "lucide-react";

interface UndoToastProps {
  message: string;
  duration?: number;
  startedAt: number;
  onUndo: () => void;
  onDismiss: () => void;
}

interface SuccessToastProps {
  message: string;
  duration?: number;
  startedAt: number;
  onDismiss: () => void;
}

export function SuccessToast({
  message,
  duration = 4000,
  startedAt,
  onDismiss,
}: SuccessToastProps) {
  const totalSecs = duration / 1000;

  const calcRemaining = () =>
    Math.max(0, (duration - (Date.now() - startedAt)) / 1000);

  const [remaining, setRemaining] = useState(calcRemaining);

  useEffect(() => {
    setRemaining(calcRemaining());
    const interval = setInterval(() => {
      const secs = calcRemaining();
      setRemaining(secs);
      if (secs <= 0) { clearInterval(interval); onDismiss(); }
    }, 100);
    return () => clearInterval(interval);
  }, [startedAt, duration]);

  const progress = (remaining / totalSecs) * 100;

  return createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-auto">
      <div className="bg-slate-900 text-white rounded-2xl shadow-2xl overflow-hidden min-w-[320px] max-w-[440px]">
        <div className="flex items-center gap-3 px-4 py-3">
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          <span className="flex-1 text-sm font-medium">{message}</span>
          <button
            onClick={onDismiss}
            className="p-1 text-slate-400 hover:text-white transition-colors rounded shrink-0"
          >
            <X size={14} />
          </button>
        </div>
        <div className="h-0.5 bg-slate-700">
          <div
            className="h-full bg-emerald-400"
            style={{ width: `${progress}%`, transition: "width 0.1s linear" }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

export function UndoToast({
  message,
  duration = 15000,
  startedAt,
  onUndo,
  onDismiss,
}: UndoToastProps) {
  const totalSecs = duration / 1000;

  const calcRemaining = () =>
    Math.max(0, Math.ceil((duration - (Date.now() - startedAt)) / 1000));

  const [remaining, setRemaining] = useState(calcRemaining);

  useEffect(() => {
    setRemaining(calcRemaining());
    const interval = setInterval(() => {
      const secs = calcRemaining();
      setRemaining(secs);
      if (secs === 0) clearInterval(interval);
    }, 250);
    return () => clearInterval(interval);
  }, [startedAt, duration]);

  const progress = (remaining / totalSecs) * 100;

  return createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-300 pointer-events-auto">
      <div className="bg-slate-900 text-white rounded-2xl shadow-2xl overflow-hidden min-w-[320px] max-w-[440px]">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex-1 text-sm font-medium">{message}</span>
          <button
            onClick={onUndo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors shrink-0 active:scale-95"
          >
            <Undo2 size={12} />
            Deshacer ({remaining}s)
          </button>
          <button
            onClick={onDismiss}
            className="p-1 text-slate-400 hover:text-white transition-colors rounded shrink-0"
          >
            <X size={14} />
          </button>
        </div>
        <div className="h-0.5 bg-slate-700">
          <div
            className="h-full bg-blue-400"
            style={{ width: `${progress}%`, transition: "width 0.25s linear" }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
