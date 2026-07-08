import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@clerk/clerk-react";
import { X, Loader2, CalendarClock } from "lucide-react";
import { safeJson } from "../lib/api";

const WEEKDAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

const DURATIONS = [15, 30, 45, 60];

export interface BookingPage {
  id: string;
  token: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  weekdays: number[];
  start_time: string;
  end_time: string;
  advance_days: number;
  min_notice_hours: number;
  active: boolean;
}

export function BookingPageSettingsModal({
  page,
  onClose,
  onSaved,
}: {
  page: BookingPage | null;
  onClose: () => void;
  onSaved: (page: BookingPage) => void;
}) {
  const { getToken } = useAuth();
  const [form, setForm] = useState({
    title: page?.title || "Reserva una cita",
    description: page?.description || "",
    duration_minutes: page?.duration_minutes || 30,
    buffer_minutes: page?.buffer_minutes ?? 0,
    weekdays: page?.weekdays?.length ? page.weekdays : [1, 2, 3, 4, 5],
    start_time: page?.start_time?.slice(0, 5) || "09:00",
    end_time: page?.end_time?.slice(0, 5) || "18:00",
    advance_days: page?.advance_days || 30,
    min_notice_hours: page?.min_notice_hours ?? 12,
    active: page?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const toggleWeekday = (d: number) => {
    setForm(f => ({
      ...f,
      weekdays: f.weekdays.includes(d) ? f.weekdays.filter(x => x !== d) : [...f.weekdays, d].sort(),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/agenda/booking/mine", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const json = await safeJson(res);
      if (!res.ok || !json.success) { setError(json?.error || "Error al guardar"); return; }
      onSaved(json.data);
    } catch (_e) {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_40px_100px_rgba(15,23,42,0.22)]">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2">
            <CalendarClock size={16} className="text-red-600" />
            <h2 className="text-sm font-bold text-slate-800">Página de reservas</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Título</label>
            <input
              value={form.title}
              onChange={e => set("title", e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 focus:border-red-400 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Descripción (opcional)</label>
            <textarea
              value={form.description}
              onChange={e => set("description", e.target.value)}
              rows={2}
              placeholder="Qué tipo de cita se puede reservar aquí…"
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 focus:border-red-400 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Duración</label>
              <select
                value={form.duration_minutes}
                onChange={e => set("duration_minutes", parseInt(e.target.value, 10))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 focus:border-red-400 focus:bg-white focus:outline-none"
              >
                {DURATIONS.map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Margen entre citas</label>
              <select
                value={form.buffer_minutes}
                onChange={e => set("buffer_minutes", parseInt(e.target.value, 10))}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 focus:border-red-400 focus:bg-white focus:outline-none"
              >
                {[0, 5, 10, 15, 30].map(d => <option key={d} value={d}>{d === 0 ? "Sin margen" : `${d} min`}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Hora inicio</label>
              <input
                type="time"
                value={form.start_time}
                onChange={e => set("start_time", e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 focus:border-red-400 focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Hora fin</label>
              <input
                type="time"
                value={form.end_time}
                onChange={e => set("end_time", e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 focus:border-red-400 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700">Días disponibles</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map(d => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleWeekday(d.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    form.weekdays.includes(d.value) ? "bg-red-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Antelación máxima</label>
              <input
                type="number"
                min={1}
                max={180}
                value={form.advance_days}
                onChange={e => set("advance_days", parseInt(e.target.value, 10) || 1)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 focus:border-red-400 focus:bg-white focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-slate-400">días vista</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Aviso mínimo</label>
              <input
                type="number"
                min={0}
                max={240}
                value={form.min_notice_hours}
                onChange={e => set("min_notice_hours", parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 focus:border-red-400 focus:bg-white focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-slate-400">horas antes</p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.active}
              onChange={e => set("active", e.target.checked)}
              className="rounded border-slate-300 text-red-600 focus:ring-red-300"
            />
            Página activa (se puede reservar)
          </label>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || form.weekdays.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
