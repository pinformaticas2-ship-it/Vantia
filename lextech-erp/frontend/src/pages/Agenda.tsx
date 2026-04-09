import React, {
  useEffect, useState, useCallback, useMemo, useRef,
} from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  Calendar, ChevronLeft, ChevronRight, Plus, X,
  Loader2, Clock, MapPin, Briefcase, Users,
  Trash2, Edit3, CheckCircle2, AlertCircle,
  Phone, Video, FileText, Flag, Circle,
  RefreshCw, ExternalLink, Link2, Unlink,
} from "lucide-react";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import { createPortal } from "react-dom";
import BackButton from "../components/BackButton";

// ── Google Calendar Types ─────────────────────────────────────────────────────
interface GCalEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end:   { dateTime?: string; date?: string };
  htmlLink: string;
  status: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

const GCAL_SCOPES   = "https://www.googleapis.com/auth/calendar.readonly";
const GCAL_TOKEN_KEY = "lextech-gcal-token-v1";
const GCAL_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface AgendaEvent {
  id: string;
  user_id: string;
  user_name: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  type: string;
  status: string;
  expediente_id: string | null;
  cliente_id: string | null;
  location: string | null;
  color: string | null;
}

// ── Config de tipos de evento ─────────────────────────────────────────────────
const EVENT_TYPES: Record<string, { label: string; color: string; bg: string; dot: string; icon: any }> = {
  cita:    { label: "Cita",       color: "text-blue-700",   bg: "bg-blue-500",   dot: "bg-blue-500",   icon: Users },
  vista:   { label: "Vista oral", color: "text-red-700",    bg: "bg-red-500",    dot: "bg-red-500",    icon: Flag },
  reunion: { label: "Reunión",    color: "text-violet-700", bg: "bg-violet-500", dot: "bg-violet-500", icon: Users },
  plazo:   { label: "Plazo",      color: "text-amber-700",  bg: "bg-amber-500",  dot: "bg-amber-500",  icon: AlertCircle },
  llamada: { label: "Llamada",    color: "text-green-700",  bg: "bg-green-500",  dot: "bg-green-500",  icon: Phone },
  video:   { label: "Videollamada", color: "text-cyan-700", bg: "bg-cyan-500",   dot: "bg-cyan-500",   icon: Video },
  otro:    { label: "Otro",       color: "text-slate-700",  bg: "bg-slate-400",  dot: "bg-slate-400",  icon: Circle },
};

const STATUS_OPTS = [
  { value: "pendiente",  label: "Pendiente",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "completado", label: "Completado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "cancelado",  label: "Cancelado",  cls: "bg-slate-100 text-slate-500 border-slate-200" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const DIAS    = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES   = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
function fmtTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
function localDatetimeInput(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function inputToISO(val: string): string {
  if (!val) return "";
  return new Date(val).toISOString();
}

// Generar días del calendario para un mes dado
function buildCalendarDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  // lunes = 0, domingo = 6
  let startDow = firstDay.getDay() - 1; // JS: 0=dom → ajustar a lunes=0
  if (startDow < 0) startDow = 6;
  const days: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  // completar hasta múltiplo de 7
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

// ── Formulario vacío ──────────────────────────────────────────────────────────
const emptyForm = (date?: string) => ({
  title: "",
  description: "",
  start_at: date ? `${date}T09:00` : localDatetimeInput(new Date().toISOString()),
  end_at: date ? `${date}T10:00` : localDatetimeInput(new Date(Date.now() + 3600000).toISOString()),
  all_day: false,
  type: "cita",
  status: "pendiente",
  location: "",
  expediente_id: "",
  cliente_id: "",
});

// ── Modal de evento ───────────────────────────────────────────────────────────
function EventModal({
  event,
  defaultDate,
  onClose,
  onSave,
  onDelete,
  saving,
  errorMsg,
}: {
  event: AgendaEvent | null;
  defaultDate: string | null;
  onClose: () => void;
  onSave: (data: any) => void;
  onDelete: (id: string) => void;
  saving: boolean;
  errorMsg: string | null;
}) {
  const [form, setForm] = useState(event
    ? {
        title:        event.title,
        description:  event.description || "",
        start_at:     localDatetimeInput(event.start_at),
        end_at:       localDatetimeInput(event.end_at),
        all_day:      event.all_day,
        type:         event.type,
        status:       event.status,
        location:     event.location || "",
        expediente_id: event.expediente_id || "",
        cliente_id:   event.cliente_id || "",
      }
    : emptyForm(defaultDate || undefined)
  );

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const typeConf = EVENT_TYPES[form.type] || EVENT_TYPES.otro;
  const statusConf = STATUS_OPTS.find(s => s.value === form.status) || STATUS_OPTS[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      start_at: inputToISO(form.start_at),
      end_at:   form.end_at ? inputToISO(form.end_at) : null,
      expediente_id: form.expediente_id || null,
      cliente_id:    form.cliente_id    || null,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        {/* cabecera */}
        <div className={`px-5 py-4 flex items-center justify-between ${typeConf.bg} text-white`}>
          <div className="flex items-center gap-2.5">
            <typeConf.icon size={18} />
            <span className="font-bold text-sm">{event ? "Editar evento" : "Nuevo evento"}</span>
          </div>
          <BackButton onClick={onClose} variant="dark" />
        </div>

        {errorMsg && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {/* Título */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Título <span className="text-red-500">*</span></label>
            <input
              value={form.title}
              onChange={e => set("title", e.target.value)}
              placeholder="Ej: Reunión cliente García, Vista oral J1ª…"
              required
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-200"
            />
          </div>

          {/* Tipo + Estado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={e => set("type", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-red-400 bg-white"
              >
                {Object.entries(EVENT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Estado</label>
              <select
                value={form.status}
                onChange={e => set("status", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-red-400 bg-white"
              >
                {STATUS_OPTS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Todo el día */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.all_day}
              onChange={e => set("all_day", e.target.checked)}
              className="rounded border-slate-300 text-red-600 focus:ring-red-400"
            />
            <span className="text-sm text-slate-700 font-medium">Todo el día</span>
          </label>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {form.all_day ? "Fecha" : "Inicio"} <span className="text-red-500">*</span>
              </label>
              <input
                type={form.all_day ? "date" : "datetime-local"}
                value={form.all_day ? form.start_at.slice(0, 10) : form.start_at}
                onChange={e => set("start_at", form.all_day ? e.target.value + "T00:00" : e.target.value)}
                required
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-red-400"
              />
            </div>
            {!form.all_day && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Fin</label>
                <input
                  type="datetime-local"
                  value={form.end_at}
                  onChange={e => set("end_at", e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-red-400"
                />
              </div>
            )}
          </div>

          {/* Lugar */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Lugar / ubicación</label>
            <input
              value={form.location}
              onChange={e => set("location", e.target.value)}
              placeholder="Ej: Sala A, Juzgado nº3, Online…"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-red-400"
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Notas</label>
            <textarea
              value={form.description}
              onChange={e => set("description", e.target.value)}
              placeholder="Notas adicionales sobre el evento…"
              rows={2}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-red-400 resize-none"
            />
          </div>

          {/* Botones */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            {event ? (
              <button
                type="button"
                onClick={() => onDelete(event.id)}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-semibold px-3 py-2 rounded-xl hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} /> Eliminar
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !form.title.trim()}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 size={12} className="animate-spin" />}
                {event ? "Guardar cambios" : "Crear evento"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Componente principal Agenda ───────────────────────────────────────────────
export default function Agenda() {
  const { getToken } = useAuth();

  // Estado del calendario
  const today = useMemo(() => new Date(), []);
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string>(isoDate(today));

  // Datos LexTech
  const [events,   setEvents]   = useState<AgendaEvent[]>([]);
  const [loading,  setLoading]  = useState(true);

  // ── Google Calendar ──────────────────────────────────────────────────────────
  const [gcalToken,    setGcalToken]    = useState<string | null>(() => {
    try { return sessionStorage.getItem(GCAL_TOKEN_KEY); } catch { return null; }
  });
  const [gcalEvents,   setGcalEvents]   = useState<GCalEvent[]>([]);
  const [gcalLoading,  setGcalLoading]  = useState(false);
  const [gcalError,    setGcalError]    = useState<string | null>(null);
  const [gcalEnabled,  setGcalEnabled]  = useState(!!gcalToken);

  const fetchGcalEvents = useCallback(async (token: string, year: number, month: number) => {
    setGcalLoading(true);
    setGcalError(null);
    try {
      const from = new Date(year, month - 1, 15).toISOString();
      const to   = new Date(year, month + 2, 15).toISOString();
      const res  = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(from)}&timeMax=${encodeURIComponent(to)}` +
        `&maxResults=250&orderBy=startTime&singleEvents=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.status === 401) {
        // Token expirado
        setGcalToken(null);
        setGcalEnabled(false);
        try { sessionStorage.removeItem(GCAL_TOKEN_KEY); } catch {}
        setGcalError("Sesión de Google expirada. Reconecta.");
        return;
      }
      const data = await res.json();
      setGcalEvents(data.items || []);
    } catch {
      setGcalError("Error al obtener eventos de Google Calendar.");
    } finally {
      setGcalLoading(false);
    }
  }, []);

  const connectGcal = useCallback(() => {
    if (!GCAL_CLIENT_ID || GCAL_CLIENT_ID === "TU_CLIENT_ID.apps.googleusercontent.com") {
      setGcalError("Configura VITE_GOOGLE_CLIENT_ID en el archivo .env del frontend.");
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      setGcalError("El script de Google aún no está cargado. Recarga la página.");
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GCAL_CLIENT_ID,
      scope: GCAL_SCOPES,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          setGcalError("Error al autenticar con Google: " + (resp.error || "desconocido"));
          return;
        }
        const token = resp.access_token;
        setGcalToken(token);
        setGcalEnabled(true);
        setGcalError(null);
        try { sessionStorage.setItem(GCAL_TOKEN_KEY, token); } catch {}
        fetchGcalEvents(token, viewYear, viewMonth);
      },
    });
    client.requestAccessToken();
  }, [fetchGcalEvents, viewMonth, viewYear]);

  const disconnectGcal = useCallback(() => {
    setGcalToken(null);
    setGcalEnabled(false);
    setGcalEvents([]);
    setGcalError(null);
    try { sessionStorage.removeItem(GCAL_TOKEN_KEY); } catch {}
  }, []);

  // Re-fetch gcal events cuando cambia el mes o el token
  useEffect(() => {
    if (gcalToken && gcalEnabled) {
      fetchGcalEvents(gcalToken, viewYear, viewMonth);
    }
  }, [gcalToken, gcalEnabled, viewYear, viewMonth, fetchGcalEvents]);

  // Convertir GCalEvent → estructura compatible para mostrar en el calendario
  const gcalEventsByDay = useMemo(() => {
    const map: Record<string, GCalEvent[]> = {};
    for (const ev of gcalEvents) {
      const dateStr = ev.start.dateTime
        ? ev.start.dateTime.slice(0, 10)
        : ev.start.date || "";
      if (!dateStr) continue;
      if (!map[dateStr]) map[dateStr] = [];
      map[dateStr].push(ev);
    }
    return map;
  }, [gcalEvents]);

  // Modal
  const [showModal,    setShowModal]    = useState(false);
  const [editEvent,    setEditEvent]    = useState<AgendaEvent | null>(null);
  const [defaultDate,  setDefaultDate]  = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Modal Google Calendar event (solo lectura)
  const [gcalModal,    setGcalModal]    = useState<GCalEvent | null>(null);

  // Cargar eventos del mes visible + buffer
  const fetchEvents = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      // Cargar todo el mes más un buffer de 2 semanas
      const from = new Date(viewYear, viewMonth - 1, 15).toISOString();
      const to   = new Date(viewYear, viewMonth + 2, 15).toISOString();
      const res  = await fetch(
        `/api/agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await safeJson(res);
      if (res.ok) setEvents(data.data || []);
    } catch (_e) {}
    finally { if (!silent) setLoading(false); }
  }, [getToken, viewYear, viewMonth]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useAutoRefresh(() => fetchEvents(true), { intervalMs: 30_000 });

  // Navegar mes
  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDay(isoDate(today));
  };

  // Índice de eventos por día
  const eventsByDay = useMemo(() => {
    const map: Record<string, AgendaEvent[]> = {};
    for (const ev of events) {
      const key = ev.start_at.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    return map;
  }, [events]);

  // Eventos del día seleccionado
  const dayEvents = useMemo(() =>
    (eventsByDay[selectedDay] || []).sort((a, b) =>
      a.start_at.localeCompare(b.start_at)
    ), [eventsByDay, selectedDay]);

  // Días del calendario
  const calDays = useMemo(() => buildCalendarDays(viewYear, viewMonth), [viewYear, viewMonth]);

  // Guardar evento (crear o editar)
  const handleSave = async (data: any) => {
    setSaving(true); setErrorMsg(null);
    try {
      const token = await getToken({ skipCache: true });
      const url    = editEvent ? `/api/agenda/${editEvent.id}` : "/api/agenda";
      const method = editEvent ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      const json = await safeJson(res);
      if (!res.ok) { setErrorMsg(json?.error || "Error al guardar"); return; }
      setShowModal(false);
      setEditEvent(null);
      await fetchEvents(true);
    } catch (_e) {
      setErrorMsg("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  // Eliminar evento
  const handleDelete = async (id: string) => {
    setSaving(true); setErrorMsg(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/agenda/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const j = await safeJson(res); setErrorMsg(j?.error || "Error al eliminar"); return; }
      setShowModal(false);
      setEditEvent(null);
      setDeleteConfirm(null);
      await fetchEvents(true);
    } catch (_e) {
      setErrorMsg("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const openNew = (date?: string) => {
    setEditEvent(null);
    setDefaultDate(date || selectedDay);
    setErrorMsg(null);
    setShowModal(true);
  };
  const openEdit = (ev: AgendaEvent) => {
    setEditEvent(ev);
    setErrorMsg(null);
    setShowModal(true);
  };

  const todayStr = isoDate(today);

  return (
    <div className="flex flex-col animate-in fade-in duration-500 -mx-6 -mt-6 h-[calc(100vh-80px)]">
      {/* ── Cabecera ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-red-50 rounded-xl flex items-center justify-center">
            <Calendar size={18} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 leading-tight">Agenda</h1>
            <p className="text-xs text-slate-400">Calendario y eventos del despacho</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Navegación mes */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-1">
            <button onClick={prevMonth} className="p-2 hover:text-red-600 rounded-lg transition-colors text-slate-500">
              <ChevronLeft size={15} />
            </button>
            <span className="font-bold text-slate-800 text-sm px-1 min-w-[130px] text-center">
              {MESES[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} className="p-2 hover:text-red-600 rounded-lg transition-colors text-slate-500">
              <ChevronRight size={15} />
            </button>
          </div>
          <button
            onClick={goToday}
            className="px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Hoy
          </button>

          {/* ── Google Calendar ── */}
          {gcalEnabled ? (
            <div className="flex items-center gap-1">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-emerald-200 rounded-xl">
                <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_16dp.png" alt="GCal" className="w-4 h-4" />
                <span className="text-xs font-semibold text-emerald-700">Google Calendar</span>
                {gcalLoading && <Loader2 size={11} className="animate-spin text-emerald-500" />}
              </div>
              <button
                onClick={() => gcalToken && fetchGcalEvents(gcalToken, viewYear, viewMonth)}
                disabled={gcalLoading}
                title="Sincronizar ahora"
                className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} className={`text-slate-500 ${gcalLoading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={disconnectGcal}
                title="Desconectar Google Calendar"
                className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-red-50 hover:border-red-200 transition-colors"
              >
                <Unlink size={13} className="text-slate-400 hover:text-red-500" />
              </button>
            </div>
          ) : (
            <button
              onClick={connectGcal}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
            >
              <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_16dp.png" alt="GCal" className="w-4 h-4" />
              Conectar Google Calendar
            </button>
          )}

          {gcalError && (
            <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-lg max-w-xs truncate" title={gcalError}>
              ⚠ {gcalError}
            </span>
          )}

          <button
            onClick={() => openNew()}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm transition-colors"
          >
            <Plus size={13} /> Nuevo evento
          </button>
        </div>
      </div>

      {/* ── Cuerpo: calendario + panel día ────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Rejilla calendario ─────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-slate-100">
          {/* Días de la semana */}
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 shrink-0">
            {DIAS.map(d => (
              <div key={d} className="py-2.5 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                {d}
              </div>
            ))}
          </div>

          {/* Celdas */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 size={22} className="animate-spin text-slate-300" />
              </div>
            ) : (
              <div className="grid grid-cols-7 auto-rows-fr min-h-full">
                {calDays.map((date, idx) => {
                  if (!date) {
                    return <div key={`empty-${idx}`} className="border-b border-r border-slate-50 bg-slate-50/40 min-h-[90px]" />;
                  }
                  const key  = isoDate(date);
                  const isToday  = key === todayStr;
                  const isSel    = key === selectedDay;
                  const dayEvs   = eventsByDay[key] || [];
                  const dayGcal  = gcalEventsByDay[key] || [];
                  const totalEvs = dayEvs.length + dayGcal.length;
                  const maxShow  = 3;
                  const lexShow  = dayEvs.slice(0, maxShow);
                  const gcalShow = dayGcal.slice(0, Math.max(0, maxShow - lexShow.length));
                  const overflow = totalEvs - lexShow.length - gcalShow.length;

                  return (
                    <div
                      key={key}
                      onClick={() => setSelectedDay(key)}
                      className={`border-b border-r border-slate-100 min-h-[90px] p-1.5 cursor-pointer transition-colors ${
                        isSel   ? "bg-red-50/60"
                        : isToday ? "bg-amber-50/40"
                        : "hover:bg-slate-50"
                      }`}
                    >
                      {/* Número día */}
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                          isToday ? "bg-red-600 text-white"
                          : isSel  ? "text-red-600"
                          : "text-slate-600"
                        }`}>
                          {date.getDate()}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); openNew(key); }}
                          className="opacity-0 hover:opacity-100 p-0.5 text-slate-300 hover:text-red-500 transition-opacity"
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      {/* Eventos LexTech */}
                      <div className="space-y-0.5">
                        {lexShow.map(ev => {
                          const tc = EVENT_TYPES[ev.type] || EVENT_TYPES.otro;
                          return (
                            <div
                              key={ev.id}
                              onClick={e => { e.stopPropagation(); setSelectedDay(key); openEdit(ev); }}
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold truncate cursor-pointer hover:opacity-80 transition-opacity ${
                                ev.status === "cancelado" ? "opacity-40 line-through" : ""
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tc.dot}`} />
                              <span className="truncate text-slate-700">
                                {!ev.all_day && <span className="text-slate-400 mr-0.5">{fmtTime(ev.start_at)}</span>}
                                {ev.title}
                              </span>
                            </div>
                          );
                        })}
                        {/* Eventos Google Calendar */}
                        {gcalShow.map(ev => {
                          const timeStr = ev.start.dateTime
                            ? new Date(ev.start.dateTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
                            : null;
                          return (
                            <div
                              key={`gcal-${ev.id}`}
                              onClick={e => { e.stopPropagation(); setSelectedDay(key); setGcalModal(ev); }}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold truncate cursor-pointer hover:opacity-80 transition-opacity"
                            >
                              <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_16dp.png" alt="" className="w-2 h-2 shrink-0" />
                              <span className="truncate text-blue-700">
                                {timeStr && <span className="text-blue-400 mr-0.5">{timeStr}</span>}
                                {ev.summary}
                              </span>
                            </div>
                          );
                        })}
                        {overflow > 0 && (
                          <div className="text-[10px] text-slate-400 font-semibold px-1.5">
                            +{overflow} más
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Panel día seleccionado ──────────────────────────── */}
        <aside className="w-64 shrink-0 flex flex-col overflow-hidden bg-white">
          {/* cabecera panel */}
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-800 capitalize">
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("es-ES", {
                    weekday: "long", day: "numeric", month: "long"
                  })}
                </p>
                {selectedDay === todayStr && (
                  <span className="text-[10px] font-bold text-red-500">Hoy</span>
                )}
              </div>
              <button
                onClick={() => openNew(selectedDay)}
                className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                title="Añadir evento en este día"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>

          {/* lista de eventos del día */}
          <div className="flex-1 overflow-y-auto py-2">
            {dayEvents.length === 0 && (gcalEventsByDay[selectedDay] || []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-300">
                <Calendar size={24} className="opacity-30" />
                <p className="text-xs text-slate-400 text-center">Sin eventos<br />en este día</p>
              </div>
            ) : (
              <div className="space-y-1 px-3">
                {/* Eventos LexTech */}
                {dayEvents.map(ev => {
                  const tc = EVENT_TYPES[ev.type] || EVENT_TYPES.otro;
                  const stConf = STATUS_OPTS.find(s => s.value === ev.status) || STATUS_OPTS[0];
                  return (
                    <button
                      key={ev.id}
                      onClick={() => openEdit(ev)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border hover:shadow-sm transition-all group ${
                        ev.status === "cancelado"
                          ? "opacity-50 border-slate-100 bg-slate-50"
                          : "border-slate-100 bg-white hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${tc.dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold text-slate-800 truncate ${ev.status === "cancelado" ? "line-through" : ""}`}>
                            {ev.title}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {!ev.all_day && (
                              <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                                <Clock size={9} /> {fmtTime(ev.start_at)}
                                {ev.end_at && <> – {fmtTime(ev.end_at)}</>}
                              </span>
                            )}
                            {ev.all_day && (
                              <span className="text-[10px] text-slate-400">Todo el día</span>
                            )}
                          </div>
                          {ev.location && (
                            <p className="text-[10px] text-slate-400 flex items-center gap-0.5 mt-0.5 truncate">
                              <MapPin size={9} /> {ev.location}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-semibold text-slate-500">{tc.label}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${stConf.cls}`}>
                              {stConf.label}
                            </span>
                          </div>
                        </div>
                        <Edit3 size={11} className="text-slate-200 group-hover:text-slate-400 shrink-0 mt-0.5 transition-colors" />
                      </div>
                    </button>
                  );
                })}

                {/* Eventos Google Calendar */}
                {(gcalEventsByDay[selectedDay] || []).map(ev => {
                  const startTime = ev.start.dateTime
                    ? new Date(ev.start.dateTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
                    : null;
                  const endTime = ev.end.dateTime
                    ? new Date(ev.end.dateTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
                    : null;
                  return (
                    <button
                      key={`gcal-${ev.id}`}
                      onClick={() => setGcalModal(ev)}
                      className="w-full text-left px-3 py-2.5 rounded-xl border border-blue-100 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-200 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-start gap-2">
                        <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_16dp.png" alt="GCal" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-blue-800 truncate">{ev.summary}</p>
                          {(startTime || !ev.start.dateTime) && (
                            <span className="text-[10px] text-blue-500 flex items-center gap-0.5 mt-0.5">
                              <Clock size={9} />
                              {startTime ? <>{startTime}{endTime && <> – {endTime}</>}</> : "Todo el día"}
                            </span>
                          )}
                          {ev.location && (
                            <p className="text-[10px] text-blue-400 flex items-center gap-0.5 mt-0.5 truncate">
                              <MapPin size={9} /> {ev.location}
                            </p>
                          )}
                          <span className="text-[10px] font-semibold text-blue-400 mt-1 block">Google Calendar</span>
                        </div>
                        <ExternalLink size={10} className="text-blue-200 group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Modal crear/editar LexTech ────────────────────────── */}
      {showModal && (
        <EventModal
          event={editEvent}
          defaultDate={defaultDate}
          onClose={() => { setShowModal(false); setEditEvent(null); setErrorMsg(null); }}
          onSave={handleSave}
          onDelete={handleDelete}
          saving={saving}
          errorMsg={errorMsg}
        />
      )}

      {/* ── Modal detalle Google Calendar (solo lectura) ──────── */}
      {gcalModal && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setGcalModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Cabecera */}
            <div className="px-5 py-4 flex items-center justify-between bg-blue-600 text-white">
              <div className="flex items-center gap-2.5">
                <img src="https://www.gstatic.com/images/branding/product/1x/calendar_2020q4_16dp.png" alt="GCal" className="w-5 h-5" />
                <span className="font-bold text-sm">Google Calendar</span>
              </div>
              <button onClick={() => setGcalModal(null)} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Título */}
              <h2 className="text-lg font-bold text-slate-800">{gcalModal.summary}</h2>

              {/* Fecha y hora */}
              <div className="flex items-start gap-2 text-sm text-slate-600">
                <Clock size={15} className="text-blue-500 mt-0.5 shrink-0" />
                <div>
                  {gcalModal.start.dateTime ? (
                    <>
                      <p>{new Date(gcalModal.start.dateTime).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                      <p className="text-slate-500">
                        {new Date(gcalModal.start.dateTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                        {gcalModal.end.dateTime && <> – {new Date(gcalModal.end.dateTime).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</>}
                      </p>
                    </>
                  ) : (
                    <>
                      <p>{gcalModal.start.date ? new Date(gcalModal.start.date + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}</p>
                      <p className="text-slate-400">Todo el día</p>
                    </>
                  )}
                </div>
              </div>

              {/* Lugar */}
              {gcalModal.location && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <MapPin size={15} className="text-blue-500 shrink-0" />
                  <span>{gcalModal.location}</span>
                </div>
              )}

              {/* Descripción */}
              {gcalModal.description && (
                <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600 max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {gcalModal.description.replace(/<[^>]+>/g, "")}
                </div>
              )}

              {/* Estado */}
              <div className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500" />
                <span className="text-xs text-slate-500 capitalize">{gcalModal.status}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex items-center justify-between">
              <span className="text-xs text-slate-400">Solo lectura · Google Calendar</span>
              <a
                href={gcalModal.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
              >
                <ExternalLink size={12} /> Abrir en Google
              </a>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
