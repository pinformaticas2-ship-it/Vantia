import { useEffect, useState, useCallback, useRef } from "react";
import { useUser, useAuth } from "@clerk/clerk-react";
import {
  Clock, Plus, CheckCircle2, Loader2, RefreshCw,
  ChevronRight, Calendar, MapPin, Video, Phone,
  ChevronDown, FileSpreadsheet, ClipboardList,
  ScanLine, ExternalLink, MoreHorizontal, LayoutGrid, X,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";

// ── Saludo por hora ──────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "Buenos días";
  if (h >= 12 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

// ── Clima (Open-Meteo, sin API key) ──────────────────────────────────────────
const WMO_EMOJI: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌧️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "❄️", 77: "❄️",
  80: "🌦️", 81: "🌧️", 82: "⛈️",
  85: "🌨️", 86: "❄️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};
function wmoEmoji(code: number): string {
  return WMO_EMOJI[code] ?? "🌡️";
}

type WeatherState = { emoji: string; temp: number; city: string } | null;

function useWeather(): WeatherState {
  const [weather, setWeather] = useState<WeatherState>(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const { latitude: lat, longitude: lon } = coords;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&timezone=auto`;
        const res  = await fetch(url);
        const data = await res.json();
        const temp = Math.round(data?.current?.temperature_2m ?? 0);
        const code = data?.current?.weathercode ?? 0;
        // Reverse geocode city (nominatim, free)
        const geo  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, {
          headers: { "Accept-Language": "es" },
        });
        const geoData = await geo.json();
        const city = geoData?.address?.city || geoData?.address?.town || geoData?.address?.village || "";
        setWeather({ emoji: wmoEmoji(code), temp, city });
      } catch { /* sin clima */ }
    }, () => { /* permiso denegado */ });
  }, []);
  return weather;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora mismo";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}
function actionIcon(type: string) {
  if (type.toLowerCase().includes("cliente"))    return "👤";
  if (type.toLowerCase().includes("expediente")) return "📁";
  if (type.toLowerCase().includes("documento"))  return "📄";
  if (type.toLowerCase().includes("sesión"))     return "🔐";
  return "⚡";
}

// ── Agenda helpers ───────────────────────────────────────────────────────────
const EVENT_STYLES: Record<string, { color: string; icon: any }> = {
  cita:    { color: "bg-blue-500",    icon: Clock },
  reunion: { color: "bg-violet-500",  icon: Clock },
  llamada: { color: "bg-green-500",   icon: Phone },
  vista:   { color: "bg-red-500",     icon: MapPin },
  plazo:   { color: "bg-amber-500",   icon: CheckCircle2 },
  video:   { color: "bg-cyan-500",    icon: Video },
  otro:    { color: "bg-slate-400",   icon: Clock },
};

function eventDayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const now  = new Date();
  const diff = Math.round((date.setHours(0,0,0,0) - now.setHours(0,0,0,0)) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return new Date(dateStr).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}

function fmtEventTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

// ── Widget picker ────────────────────────────────────────────────────────────
const ALL_WIDGETS = [
  { id: "agenda",     label: "Próximas citas",       desc: "Eventos de tu agenda de hoy y los próximos días",    icon: "📅" },
  { id: "tareas",     label: "Tareas y plazos",       desc: "Contador de tareas vencidas, urgentes y pendientes", icon: "✅" },
  { id: "actividad",  label: "Actividad reciente",    desc: "Últimas acciones realizadas en el ERP",              icon: "⚡" },
  { id: "expedientes",label: "Resumen expedientes",   desc: "Acceso rápido a expedientes abiertos",               icon: "📁" },
  { id: "facturacion",label: "Resumen facturación",   desc: "Totales facturados, cobrados y pendientes",          icon: "💶" },
];

const STORAGE_KEY = "dashboard_visible_widgets";
const DEFAULT_VISIBLE = ["agenda", "tareas", "actividad"];

function loadVisibleWidgets(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return DEFAULT_VISIBLE;
}

function WidgetPickerModal({
  visible,
  onClose,
  onSave,
}: {
  visible: string[];
  onClose: () => void;
  onSave: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(visible);
  const toggle = (id: string) =>
    setSelected(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Dashboard</p>
            <h3 className="mt-0.5 text-xl font-bold text-slate-900">Elegir elementos</h3>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50">
            <X size={16} />
          </button>
        </div>

        <div className="divide-y divide-slate-50 px-4 py-3">
          {ALL_WIDGETS.map(w => (
            <label key={w.id} className="flex cursor-pointer items-center gap-4 rounded-2xl px-3 py-3.5 hover:bg-slate-50 transition-colors">
              <span className="text-xl shrink-0">{w.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{w.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{w.desc}</p>
              </div>
              <div className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${selected.includes(w.id) ? "bg-red-600" : "bg-slate-200"}`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected.includes(w.id)}
                  onChange={() => toggle(w.id)}
                />
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${selected.includes(w.id) ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={() => { onSave(selected); onClose(); }}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DashboardHome ────────────────────────────────────────────────────────────
export default function DashboardHome() {
  const { user }    = useUser();
  const { getToken } = useAuth();
  const navigate    = useNavigate();
  const weather     = useWeather();
  const greeting    = getGreeting();
  const [showAltaMenu,    setShowAltaMenu]    = useState(false);
  const [showClienteMenu, setShowClienteMenu] = useState(false);
  const altaMenuRef    = useRef<HTMLDivElement>(null);
  const clienteMenuRef = useRef<HTMLDivElement>(null);
  const dotsMenuRef    = useRef<HTMLDivElement>(null);
  const [showDotsMenu,     setShowDotsMenu]     = useState(false);
  const [showWidgetPicker, setShowWidgetPicker] = useState(false);
  const [visibleWidgets,   setVisibleWidgets]   = useState<string[]>(loadVisibleWidgets);

  // Cerrar dropdowns al clicar fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (altaMenuRef.current && !altaMenuRef.current.contains(e.target as Node))
        setShowAltaMenu(false);
      if (clienteMenuRef.current && !clienteMenuRef.current.contains(e.target as Node))
        setShowClienteMenu(false);
      if (dotsMenuRef.current && !dotsMenuRef.current.contains(e.target as Node))
        setShowDotsMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [activity,       setActivity]       = useState<any[]>([]);
  const [actLoading,     setActLoading]     = useState(true);
  const [agendaEvents,   setAgendaEvents]   = useState<any[]>([]);
  const [agendaLoading,  setAgendaLoading]  = useState(true);
  const [taskStats,      setTaskStats]      = useState({
    vencidas: 0,
    proximas: 0,
    urgentes: 0,
    pendientes: 0,
    completadas: 0,
  });

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) { setActLoading(true); setAgendaLoading(true); }
    try {
      const token = await getToken({ skipCache: true });
      const [actRes, agendaRes, tasksRes] = await Promise.all([
        fetch("/api/activity/me?limit=10",    { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/agenda/upcoming?limit=5", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/tasks/me",               { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [actData, agendaData, tasksData] = await Promise.all([
        safeJson(actRes), safeJson(agendaRes), safeJson(tasksRes),
      ]);
      if (actRes.ok)    setActivity(actData.data || []);
      if (agendaRes.ok) setAgendaEvents(agendaData.data || []);
      if (tasksRes.ok) {
        const tasks: any[] = tasksData.data || [];
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const isFinished = (estado: string) => estado === "completada";

        const vencidas = tasks.filter((t: any) =>
          !isFinished(t.estado) && t.plazo && new Date(t.plazo) < now
        ).length;
        const proximas = tasks.filter((t: any) =>
          !isFinished(t.estado) &&
          t.plazo &&
          new Date(t.plazo) >= now &&
          new Date(t.plazo) <= sevenDaysFromNow
        ).length;
        const urgentes = tasks.filter((t: any) => t.estado === "urgente").length;
        const pendientes = tasks.filter((t: any) => t.estado === "pendiente").length;
        const completadas = tasks.filter((t: any) => t.estado === "completada").length;

        setTaskStats({ vencidas, proximas, urgentes, pendientes, completadas });
      }
    } catch (_e) {
    } finally {
      if (!silent) { setActLoading(false); setAgendaLoading(false); }
    }
  }, [getToken]);

  const saveVisibleWidgets = (ids: string[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    setVisibleWidgets(ids);
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refrescar: cada 20s, al volver a pestaña, al reconectar
  useAutoRefresh(() => fetchData(true), { intervalMs: 20_000 });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">
              {greeting}, <span className="text-red-600">{user?.firstName || "usuario"}</span>
            </h1>
            {weather && (
              <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                <span className="text-base leading-none">{weather.emoji}</span>
                <span>{weather.temp}°C</span>
                {weather.city && <span className="text-slate-400 font-normal hidden sm:inline">· {weather.city}</span>}
              </div>
            )}
          </div>
          <p className="text-slate-400 text-sm mt-0.5">
            {new Date().toLocaleDateString("es-ES", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Dropdown Alta Cliente */}
          <div className="relative" ref={clienteMenuRef}>
            <button
              onClick={() => setShowClienteMenu(v => !v)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-sm shadow-sm border transition-all select-none ${
                showClienteMenu
                  ? "bg-slate-100 text-slate-800 border-slate-300"
                  : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Plus size={15} />
              Nuevo Cliente
              <ChevronDown size={13} className={`transition-transform ${showClienteMenu ? "rotate-180" : ""}`} />
            </button>

            {showClienteMenu && (
              <div className="absolute left-0 top-full z-50 mt-2 w-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/40">
                <div className="border-b border-slate-100 px-5 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Alta de clientes</p>
                  <h3 className="mt-1 text-[15px] font-bold text-slate-900">Elige cómo quieres agregar clientes</h3>
                </div>
                <div className="px-3 py-3">
                  <button
                    onClick={() => { setShowClienteMenu(false); navigate("/dashboard/clientes/new"); }}
                    className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                      <Plus size={17} />
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-800">Crear manualmente</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">Crea un cliente desde cero introduciendo sus datos manualmente.</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { setShowClienteMenu(false); navigate("/dashboard/clientes/new?mode=dni"); }}
                    className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                      <ScanLine size={17} />
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-800">Con DNI</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">Sube anverso y reverso del DNI para rellenar la ficha automáticamente.</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { setShowClienteMenu(false); navigate("/dashboard/clientes/invitar"); }}
                    className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                      <ExternalLink size={17} />
                    </div>
                    <div>
                      <p className="text-base font-bold text-slate-800">Con enlace</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">Genera un enlace para que el cliente rellene sus datos directamente.</p>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Dropdown Alta Expediente */}
          <div className="relative -mr-1" ref={altaMenuRef}>
            <button
              onClick={() => setShowAltaMenu(v => !v)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-sm shadow-md shadow-red-200 transition-all select-none ${
                showAltaMenu ? "bg-red-800 text-white" : "bg-red-600 hover:bg-red-700 text-white"
              }`}
            >
              <Plus size={15} />
              Nuevo Expediente
              <ChevronDown size={13} className={`transition-transform ${showAltaMenu ? "rotate-180" : ""}`} />
            </button>

            {showAltaMenu && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-600">Elige cómo quieres agregar expedientes</p>
                </div>
                <div className="p-2">
                  {/* Crear manualmente */}
                  <button
                    onClick={() => { setShowAltaMenu(false); navigate("/dashboard/expedientes?nuevo=1"); }}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-600">
                      <Plus size={15} />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-slate-800">Crear manualmente</p>
                      <p className="mt-0.5 text-sm leading-6 text-slate-500">Crea un expediente desde cero introduciendo los datos</p>
                    </div>
                  </button>
                  {/* Importar CSV */}
                  <button
                    onClick={() => { setShowAltaMenu(false); navigate("/dashboard/expedientes?mode=csv"); }}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                      <FileSpreadsheet size={15} />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-slate-800">Importar desde CSV</p>
                      <p className="mt-0.5 text-sm leading-6 text-slate-500">Sube un archivo CSV con múltiples expedientes</p>
                    </div>
                  </button>
                  {/* Desde documentos */}
                  <button
                    onClick={() => { setShowAltaMenu(false); navigate("/dashboard/expedientes?mode=docs"); }}
                    className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                      <ClipboardList size={15} />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-slate-800">Desde documentos</p>
                      <p className="mt-0.5 text-sm leading-6 text-slate-500">Procesa documentos para crear expedientes</p>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Dots menu */}
          <div className="relative" ref={dotsMenuRef}>
            <button
              onClick={() => setShowDotsMenu(v => !v)}
              title="Más opciones"
              className={`flex items-center justify-center h-9 w-9 rounded-xl border transition-all ${
                showDotsMenu
                  ? "bg-slate-100 border-slate-300 text-slate-800"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <MoreHorizontal size={16} />
            </button>

            {showDotsMenu && (
              <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <button
                  onClick={() => { setShowDotsMenu(false); setShowWidgetPicker(true); }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <LayoutGrid size={14} className="text-slate-400" />
                  Elegir elementos
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* GRID PRINCIPAL */}
      {!visibleWidgets.includes("agenda") && !visibleWidgets.includes("tareas") && !visibleWidgets.includes("actividad") && !visibleWidgets.includes("expedientes") && !visibleWidgets.includes("facturacion") && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <LayoutGrid size={32} className="opacity-20" />
          <p className="text-sm">Sin elementos visibles. Pulsa <strong>···</strong> para elegir qué mostrar.</p>
        </div>
      )}

      {(visibleWidgets.includes("agenda") || visibleWidgets.includes("tareas") || visibleWidgets.includes("actividad")) && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── AGENDA MINI ── */}
        {visibleWidgets.includes("agenda") && (
          <div className={`${(visibleWidgets.includes("tareas") || visibleWidgets.includes("actividad")) ? "lg:col-span-2" : "lg:col-span-3"} bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden`}>
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={17} className="text-red-500" /> Próximas citas
              </h2>
              <Link to="/dashboard/agenda" className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1">
                Ver agenda <ChevronRight size={12} />
              </Link>
            </div>
            {agendaLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 size={18} className="animate-spin text-slate-300" />
              </div>
            ) : agendaEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-400">
                <Calendar size={28} className="opacity-20" />
                <p className="text-xs text-center">Sin próximos eventos</p>
                <Link to="/dashboard/agenda" className="text-xs font-bold text-red-500 hover:underline">+ Crear evento</Link>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {agendaEvents.map((ev: any) => {
                  const style   = EVENT_STYLES[ev.type] || EVENT_STYLES.otro;
                  const Icon    = style.icon;
                  const label   = eventDayLabel(ev.start_at);
                  const isToday = label === "Hoy";
                  return (
                    <Link key={ev.id} to="/dashboard/agenda" className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors group">
                      <div className={`w-1 h-10 rounded-full shrink-0 ${style.color}`} />
                      <div className="w-20 shrink-0 text-right">
                        <p className={`text-xs font-bold ${isToday ? "text-red-500" : "text-slate-500"}`}>{label}</p>
                        {!ev.all_day
                          ? <p className="text-sm font-black text-slate-700">{fmtEventTime(ev.start_at)}</p>
                          : <p className="text-xs text-slate-400 font-semibold">Todo el día</p>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-red-600 transition-colors">{ev.title}</p>
                        {ev.location && (
                          <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <Icon size={10} /> {ev.location}
                          </p>
                        )}
                      </div>
                      {isToday && (
                        <span className="shrink-0 text-[10px] font-bold text-red-500 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">Hoy</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── COLUMNA DERECHA ── */}
        {(visibleWidgets.includes("tareas") || visibleWidgets.includes("actividad")) && (
          <div className="space-y-5">

            {/* WIDGET TAREAS */}
            {visibleWidgets.includes("tareas") && (
              <Link to="/dashboard/tareas" className="block group">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                      <CheckCircle2 size={15} className="text-slate-400" /> Tareas
                    </h3>
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
                  </div>
                  <div className="grid grid-cols-2">
                    <div className="p-5 bg-red-50 border-r border-red-100">
                      <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Vencidas</p>
                      <p className={`text-4xl font-black leading-none ${taskStats.vencidas > 0 ? "text-red-600" : "text-slate-300"}`}>{taskStats.vencidas}</p>
                      <p className="text-[10px] text-red-300 mt-1">vencidas</p>
                    </div>
                    <div className="p-5">
                      <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1">Próximas</p>
                      <p className={`text-4xl font-black leading-none ${taskStats.proximas > 0 ? "text-amber-500" : "text-slate-300"}`}>{taskStats.proximas}</p>
                      <p className="text-[10px] text-amber-300 mt-1">esta semana</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 border-t border-slate-100">
                    <div className="p-4 text-center border-r border-slate-100">
                      <p className="text-2xl font-black text-slate-700">{taskStats.urgentes}</p>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Urgentes</p>
                    </div>
                    <div className="p-4 text-center border-r border-slate-100">
                      <p className="text-2xl font-black text-slate-700">{taskStats.pendientes}</p>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Pendientes</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-2xl font-black text-emerald-500">{taskStats.completadas}</p>
                      <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Hechas</p>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* ACTIVIDAD RECIENTE */}
            {visibleWidgets.includes("actividad") && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                    <RefreshCw size={14} className="text-slate-400" /> Actividad reciente
                  </h3>
                </div>
                {actLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 size={18} className="animate-spin text-slate-300" />
                  </div>
                ) : activity.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-8">Sin actividad reciente</p>
                ) : (
                  <ul className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
                    {activity.slice(0, 10).map((item: any, i: number) => (
                      <li key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                        <span className="text-base mt-0.5 shrink-0">{actionIcon(item.action_type || "")}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700 leading-snug line-clamp-2">{item.description || item.action_type}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(item.created_at)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

          </div>
        )}
      </div>
      )}

      {/* WIDGETS ADICIONALES */}
      {(visibleWidgets.includes("expedientes") || visibleWidgets.includes("facturacion")) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {visibleWidgets.includes("expedientes") && (
            <Link to="/dashboard/expedientes" className="block group bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-800 text-sm flex items-center gap-2">📁 Expedientes</span>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
              </div>
              <p className="text-xs text-slate-500">Accede a todos tus expedientes abiertos y activos desde aquí.</p>
            </Link>
          )}
          {visibleWidgets.includes("facturacion") && (
            <Link to="/dashboard/facturacion" className="block group bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-800 text-sm flex items-center gap-2">💶 Facturación</span>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
              </div>
              <p className="text-xs text-slate-500">Consulta facturas, cobros y estado de pagos.</p>
            </Link>
          )}
        </div>
      )}

      {showWidgetPicker && (
        <WidgetPickerModal
          visible={visibleWidgets}
          onClose={() => setShowWidgetPicker(false)}
          onSave={saveVisibleWidgets}
        />
      )}
    </div>
  );
}
