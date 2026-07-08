import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Spinner } from "../components/Spinner";
import { Scale, Loader2, AlertCircle, CheckCircle2, CalendarClock, ChevronRight } from "lucide-react";

interface PageInfo {
  title: string;
  description: string | null;
  duration_minutes: number;
  owner_name: string | null;
  advance_days: number;
}

type PageState = "loading" | "invalid" | "picking" | "booking" | "submitting" | "done" | "error";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function maxDateISO(advanceDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + advanceDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AgendaBookingPublic() {
  const { token } = useParams<{ token: string }>();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [info, setInfo] = useState<PageInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [date, setDate] = useState(todayISO());
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", email: "", notes: "" });
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setPageState("invalid"); return; }
    fetch(`/api/agenda/booking/public/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) { setInfo(d.data); setPageState("picking"); }
        else { setErrorMsg(d.error || "Enlace no válido"); setPageState("invalid"); }
      })
      .catch(() => { setErrorMsg("No se pudo conectar con el servidor."); setPageState("invalid"); });
  }, [token]);

  useEffect(() => {
    if (pageState !== "picking" && pageState !== "booking") return;
    if (!token || !date) return;
    let cancelled = false;
    setLoadingSlots(true);
    setSelectedTime(null);
    fetch(`/api/agenda/booking/public/${token}/slots?date=${date}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setSlots(d.success ? (d.data || []) : []); })
      .catch(() => { if (!cancelled) setSlots([]); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [token, date, pageState]);

  const pickSlot = (time: string) => {
    setSelectedTime(time);
    setPageState("booking");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setFieldError("El nombre es obligatorio."); return; }
    if (!form.email.trim()) { setFieldError("El email es obligatorio."); return; }
    setFieldError(null);
    setPageState("submitting");
    try {
      const res = await fetch(`/api/agenda/booking/public/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, time: selectedTime, ...form }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setPageState("done");
      } else {
        setErrorMsg(d.error || "Error al confirmar la cita.");
        setPageState("error");
      }
    } catch {
      setErrorMsg("No se pudo conectar con el servidor.");
      setPageState("error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="flex items-center gap-2 mb-8">
        <div className="p-2 bg-red-600 rounded-xl">
          <Scale className="w-6 h-6 text-white" />
        </div>
        <span className="text-xl font-bold text-slate-800 tracking-tight">Vantia Legis</span>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
        {pageState === "loading" && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Spinner size="lg" label="Verificando enlace..." />
          </div>
        )}

        {pageState === "invalid" && (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="p-4 bg-red-50 rounded-full mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Enlace no disponible</h2>
            <p className="text-sm text-slate-500">{errorMsg || "Este enlace no es válido o la página no está activa."}</p>
          </div>
        )}

        {pageState === "error" && (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="p-4 bg-red-50 rounded-full mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">No se pudo confirmar la cita</h2>
            <p className="text-sm text-slate-500 mb-4">{errorMsg}</p>
            <button onClick={() => setPageState("picking")} className="text-sm text-red-600 hover:underline">
              Elegir otro horario
            </button>
          </div>
        )}

        {pageState === "done" && (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="p-4 bg-emerald-50 rounded-full mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Cita confirmada</h2>
            <p className="text-sm text-slate-500">
              {new Date(`${date}T${selectedTime}:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}, a las {selectedTime}.
              Te esperamos.
            </p>
          </div>
        )}

        {(pageState === "picking" || pageState === "booking" || pageState === "submitting") && info && (
          <div className="p-8">
            <div className="mb-6 flex items-start gap-3">
              <div className="p-2.5 bg-red-50 rounded-xl shrink-0">
                <CalendarClock className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-800 mb-1">{info.title}</h2>
                <p className="text-sm text-slate-500">
                  {info.description || `Cita de ${info.duration_minutes} minutos`}
                  {info.owner_name && <> con <strong>{info.owner_name}</strong></>}.
                </p>
              </div>
            </div>

            {pageState !== "booking" && pageState !== "submitting" ? (
              <>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
                <input
                  type="date"
                  value={date}
                  min={todayISO()}
                  max={maxDateISO(info.advance_days)}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />

                <label className="block text-xs font-medium text-slate-600 mt-4 mb-2">Horarios disponibles</label>
                {loadingSlots ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                  </div>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No hay huecos disponibles ese día. Prueba otra fecha.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => pickSlot(s)}
                        className="px-3 py-2 text-sm font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                <button
                  type="button"
                  onClick={() => setPageState("picking")}
                  className="text-xs text-slate-400 hover:text-slate-600 mb-3"
                >
                  ← Elegir otro horario
                </button>
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {new Date(`${date}T${selectedTime}:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}, a las <strong>{selectedTime}</strong>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Nombre <span className="text-red-500">*</span></label>
                    <input
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Juan García"
                      required
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Correo electrónico <span className="text-red-500">*</span></label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="juan@ejemplo.com"
                      required
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Notas (opcional)</label>
                    <textarea
                      value={form.notes}
                      onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Cuéntanos brevemente el motivo de la cita…"
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                    />
                  </div>
                </div>

                {fieldError && (
                  <p className="mt-3 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {fieldError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={pageState === "submitting"}
                  className="mt-6 w-full flex items-center justify-center gap-2 px-5 py-3 bg-red-600 text-white text-sm font-semibold rounded-xl hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  {pageState === "submitting" ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Confirmando...</>
                  ) : (
                    <>Confirmar cita <ChevronRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
