import React, { useState } from "react";
import { Clock } from "lucide-react";
import { addBusinessDays, businessDaysIsoDate } from "../lib/businessDays";

// ── Calculadora de plazo (días hábiles) ─────────────────────────────────────
// Ayuda para no tener que contar festivos/fines de semana a mano al poner una
// fecha límite. No es un cómputo procesal oficial -- solo conoce festivos
// nacionales fijos + Viernes Santo, no autonómicos/locales, y "excluir agosto"
// es opcional porque no aplica igual a todos los procedimientos. Siempre hay
// que verificar la fecha resultante contra el calendario del órgano judicial.
export function PlazoCalculator({ onCalculate }: { onCalculate: (isoDate: string) => void }) {
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState(() => businessDaysIsoDate(new Date()));
  const [days, setDays] = useState("10");
  const [excludeAugust, setExcludeAugust] = useState(false);

  const apply = () => {
    const n = parseInt(days, 10);
    if (!fromDate || !Number.isFinite(n) || n <= 0) return;
    const start = new Date(`${fromDate}T12:00:00`);
    const result = addBusinessDays(start, n, { excludeAugust });
    onCalculate(businessDaysIsoDate(result));
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-red-600 transition-colors"
      >
        <Clock size={11} /> Calcular por días hábiles
      </button>
    );
  }

  return (
    <div className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:border-red-400"
        />
        <span className="shrink-0 text-[11px] text-slate-500">+</span>
        <input
          type="number"
          min={1}
          value={days}
          onChange={e => setDays(e.target.value)}
          className="w-14 shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-center focus:outline-none focus:border-red-400"
        />
        <span className="shrink-0 text-[11px] text-slate-500">días hábiles</span>
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer select-none">
        <input type="checkbox" checked={excludeAugust} onChange={e => setExcludeAugust(e.target.checked)} className="rounded border-slate-300" />
        Excluir agosto (algunos procedimientos civiles)
      </label>
      <p className="text-[10px] text-slate-400 leading-relaxed">
        Cuenta festivos nacionales fijos y Viernes Santo, no autonómicos/locales. Verifica siempre contra el calendario del órgano judicial.
      </p>
      <div className="flex justify-end gap-1.5 pt-0.5">
        <button type="button" onClick={() => setOpen(false)} className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
        <button type="button" onClick={apply} className="px-2.5 py-1 text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg">Aplicar</button>
      </div>
    </div>
  );
}
