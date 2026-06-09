import { useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useUser, useAuth } from "@clerk/clerk-react";
import {
  Clock, Plus, CheckCircle2, Loader2, RefreshCw,
  ChevronRight, Calendar, MapPin, Video, Phone,
  ChevronDown, FileSpreadsheet, ClipboardList,
  ScanLine, ExternalLink, MoreHorizontal, LayoutGrid, X, GripVertical,
  Briefcase, Users, History, MessageSquare, MessageCircle, Mail, Library,
  Receipt,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, rectSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Saludo por hora ───────────────────────────────────────────────────────────
function getGreeting(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "Buenos días";
  if (h >= 12 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

// ── Clima ─────────────────────────────────────────────────────────────────────
const WMO_EMOJI: Record<number, string> = {
  0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",
  51:"🌦️",53:"🌦️",55:"🌧️",61:"🌧️",63:"🌧️",65:"🌧️",
  71:"🌨️",73:"🌨️",75:"❄️",77:"❄️",80:"🌦️",81:"🌧️",82:"⛈️",
  85:"🌨️",86:"❄️",95:"⛈️",96:"⛈️",99:"⛈️",
};
function wmoEmoji(c: number) { return WMO_EMOJI[c] ?? "🌡️"; }
type WeatherState = { emoji: string; temp: number; city: string } | null;
function useWeather(): WeatherState {
  const [w, setW] = useState<WeatherState>(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async ({ coords: { latitude: lat, longitude: lon } }) => {
      try {
        const r  = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&timezone=auto`);
        const d  = await r.json();
        const gr = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { "Accept-Language": "es" } });
        const gd = await gr.json();
        setW({ emoji: wmoEmoji(d?.current?.weathercode ?? 0), temp: Math.round(d?.current?.temperature_2m ?? 0), city: gd?.address?.city || gd?.address?.town || gd?.address?.village || "" });
      } catch { /* sin clima */ }
    }, () => {/* sin permiso */});
  }, []);
  return w;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
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
function fmtEur(n: number) {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

// ── Agenda helpers ────────────────────────────────────────────────────────────
const EVENT_STYLES: Record<string, { color: string; icon: any }> = {
  cita:    { color: "bg-blue-500",   icon: Clock },
  reunion: { color: "bg-violet-500", icon: Clock },
  llamada: { color: "bg-green-500",  icon: Phone },
  vista:   { color: "bg-red-500",    icon: MapPin },
  plazo:   { color: "bg-amber-500",  icon: CheckCircle2 },
  video:   { color: "bg-cyan-500",   icon: Video },
  otro:    { color: "bg-slate-400",  icon: Clock },
};
function eventDayLabel(dateStr: string): string {
  const d = new Date(dateStr), now = new Date();
  const diff = Math.round((d.setHours(0,0,0,0) - now.setHours(0,0,0,0)) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return new Date(dateStr).toLocaleDateString("es-ES", { weekday:"short", day:"numeric", month:"short" });
}
function fmtTime(s: string) { return new Date(s).toLocaleTimeString("es-ES", { hour:"2-digit", minute:"2-digit" }); }

// ── Widget picker ─────────────────────────────────────────────────────────────
const ALL_WIDGETS = [
  { id:"agenda",      label:"Agenda",            desc:"Próximas citas, vistas y calendario inmediato",        icon:"📅" },
  { id:"tareas",      label:"Tareas",            desc:"Urgentes, vencidas y pendientes del usuario",          icon:"✅" },
  { id:"actividad",   label:"Actividad reciente", desc:"Tus últimas acciones en el ERP",                      icon:"⚡" },
  { id:"chat",        label:"Chat interno",      desc:"Canales, mensajes pendientes y conversación reciente", icon:"💬" },
  { id:"whatsapp",    label:"WhatsApp",          desc:"Estado del canal y mensajes programados",              icon:"📱" },
  { id:"correo",      label:"Correo",            desc:"No leídos y últimos mensajes de tu bandeja",           icon:"✉️" },
  { id:"facturacion", label:"Facturación",       desc:"Totales facturados, cobrados y pendientes",            icon:"💶" },
];
const DASHBOARD_MODULES = [
  { id: "expedientes", label: "Expedientes", desc: "Gestión de asuntos y casos", to: "/dashboard/expedientes", icon: Briefcase, tone: "bg-blue-100 text-blue-600" },
  { id: "clientes", label: "Clientes", desc: "Base de datos del despacho", to: "/dashboard/clientes", icon: Users, tone: "bg-emerald-100 text-emerald-600" },
  { id: "trazabilidad", label: "Trazabilidad", desc: "Actividad y auditoría interna", to: "/dashboard/trazabilidad", icon: History, tone: "bg-amber-100 text-amber-700" },
  { id: "agenda", label: "Agenda", desc: "Citas, vistas y calendario", to: "/dashboard/agenda", icon: Calendar, tone: "bg-cyan-100 text-cyan-700" },
  { id: "tareas", label: "Tareas", desc: "Pendientes y plazos del usuario", to: "/dashboard/tareas", icon: CheckCircle2, tone: "bg-lime-100 text-lime-700" },
  { id: "chat", label: "Chat", desc: "Mensajería interna del equipo", to: "/dashboard/chat", icon: MessageSquare, tone: "bg-violet-100 text-violet-700" },
  { id: "whatsapp", label: "WhatsApp", desc: "Comunicación con clientes", to: "/dashboard/whatsapp", icon: MessageCircle, tone: "bg-green-100 text-green-700" },
  { id: "correo", label: "Correo", desc: "Bandeja y redacción de emails", to: "/dashboard/correo", icon: Mail, tone: "bg-rose-100 text-rose-700" },
  { id: "documental", label: "Documental", desc: "CENDOJ, BOE y Lexnet", to: "/dashboard/documental", icon: Library, tone: "bg-indigo-100 text-indigo-700" },
  { id: "facturacion", label: "Facturación", desc: "Cobros, gastos y Quipu", to: "/dashboard/facturacion", icon: Receipt, tone: "bg-orange-100 text-orange-700" },
];
const STORAGE_KEY = "dashboard_visible_widgets";
const ORDER_KEY   = "dashboard_widget_order";
const DEFAULT_VISIBLE = ["agenda", "tareas", "actividad"];
const DEFAULT_ORDER   = [
  "agenda", "tareas", "actividad",
  "chat", "whatsapp", "correo", "facturacion",
];
const VALID_WIDGET_IDS = new Set(ALL_WIDGETS.map((widget) => widget.id));
function sanitizeWidgetIds(ids: string[], fallback: string[]) {
  const filtered = ids.filter((id, index) => VALID_WIDGET_IDS.has(id) && ids.indexOf(id) === index);
  return filtered.length ? filtered : fallback;
}
function loadVisible(): string[]  {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    if (r) return sanitizeWidgetIds(JSON.parse(r), DEFAULT_VISIBLE);
  } catch {/**/}
  return DEFAULT_VISIBLE;
}
function loadOrder(): string[]    {
  try {
    const r = localStorage.getItem(ORDER_KEY);
    if (r) return sanitizeWidgetIds(JSON.parse(r), DEFAULT_ORDER);
  } catch {/**/}
  return DEFAULT_ORDER;
}

function WidgetPickerModal({ visible, onClose, onSave }: { visible: string[]; onClose: () => void; onSave: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(visible);
  const toggle = (id: string) => setSel(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);

  useEffect(() => {
    const scrollEl = document.getElementById("dashboard-content") as HTMLElement | null;
    const prevScroll = scrollEl?.style.overflow ?? "";
    if (scrollEl) scrollEl.style.overflow = "hidden";
    return () => {
      if (scrollEl) scrollEl.style.overflow = prevScroll;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-transparent px-4 pb-8 pt-[10vh]">
      <div className="flex max-h-[76vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Dashboard</p>
            <h3 className="mt-1 text-xl font-bold text-slate-900">Elegir elementos</h3>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">
          {ALL_WIDGETS.map(w => (
            <label key={w.id} className="flex cursor-pointer items-center gap-4 border-b border-slate-100 py-3 last:border-b-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-xl">{w.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{w.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{w.desc}</p>
              </div>
              <div className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${sel.includes(w.id) ? "bg-red-600" : "bg-slate-200"}`}>
                <input type="checkbox" className="sr-only" checked={sel.includes(w.id)} onChange={() => toggle(w.id)} />
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${sel.includes(w.id) ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
            </label>
          ))}
        </div>
        <div className="shrink-0 flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => { onSave(sel); onClose(); }} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white hover:bg-red-700">Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ── Sortable wrapper ──────────────────────────────────────────────────────────
function SortableWidget({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const handle = (
    <button
      {...listeners} {...attributes}
      className="p-1 rounded text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none"
      title="Arrastrar para reordenar"
    >
      <GripVertical size={14} />
    </button>
  );
  return <div ref={setNodeRef} style={style}>{children(handle)}</div>;
}

// ── Billing period selector ───────────────────────────────────────────────────
const PERIODS = [
  { id: "all", label: "Todo el año" },
  { id: "q1",  label: "Trimestre 1" },
  { id: "q2",  label: "Trimestre 2" },
  { id: "q3",  label: "Trimestre 3" },
  { id: "q4",  label: "Trimestre 4" },
  { id: "m0",  label: "Enero" },
  { id: "m1",  label: "Febrero" },
  { id: "m2",  label: "Marzo" },
  { id: "m3",  label: "Abril" },
  { id: "m4",  label: "Mayo" },
  { id: "m5",  label: "Junio" },
  { id: "m6",  label: "Julio" },
  { id: "m7",  label: "Agosto" },
  { id: "m8",  label: "Septiembre" },
  { id: "m9",  label: "Octubre" },
  { id: "m10", label: "Noviembre" },
  { id: "m11", label: "Diciembre" },
];
const PERIOD_MONTHS: Record<string, number[]> = {
  q1:[0,1,2], q2:[3,4,5], q3:[6,7,8], q4:[9,10,11],
  m0:[0],m1:[1],m2:[2],m3:[3],m4:[4],m5:[5],m6:[6],m7:[7],m8:[8],m9:[9],m10:[10],m11:[11],
};

function StyledDropdown({ selected, label, options, onSelect }: {
  selected: string; label: string;
  options: { id: string; label: string }[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen]   = useState(false);
  const [pos,  setPos]    = useState({ top: 0, left: 0 });
  const btnRef            = useRef<HTMLButtonElement>(null);
  const menuRef           = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function handleOpen(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX });
    }
    setOpen(v => !v);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
      >
        {label} <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-44 overflow-y-auto max-h-72 rounded-2xl border border-slate-200 bg-white shadow-2xl py-1"
        >
          {options.map(o => (
            <button
              key={o.id}
              onClick={e => { e.preventDefault(); e.stopPropagation(); onSelect(o.id); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                o.id === selected
                  ? "text-teal-600 font-semibold hover:bg-teal-50"
                  : "text-slate-700 font-normal hover:bg-slate-50"
              }`}
            >
              <span className="w-4 shrink-0 text-teal-500">{o.id === selected ? "✓" : ""}</span>
              {o.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ── DashboardHome ─────────────────────────────────────────────────────────────
export default function DashboardHome() {
  const { user }     = useUser();
  const { getToken } = useAuth();
  const navigate     = useNavigate();
  const weather      = useWeather();
  const greeting     = getGreeting();

  const [showAltaMenu,     setShowAltaMenu]     = useState(false);
  const [showClienteMenu,  setShowClienteMenu]  = useState(false);
  const [showDotsMenu,     setShowDotsMenu]      = useState(false);
  const [showWidgetPicker, setShowWidgetPicker]  = useState(false);
  const [visibleWidgets,   setVisibleWidgets]    = useState<string[]>(loadVisible);
  const [widgetOrder,      setWidgetOrder]       = useState<string[]>(loadOrder);

  const altaMenuRef    = useRef<HTMLDivElement>(null);
  const clienteMenuRef = useRef<HTMLDivElement>(null);
  const dotsMenuRef    = useRef<HTMLDivElement>(null);
  const wasDragging    = useRef(false);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (altaMenuRef.current    && !altaMenuRef.current.contains(e.target as Node))    setShowAltaMenu(false);
      if (clienteMenuRef.current && !clienteMenuRef.current.contains(e.target as Node)) setShowClienteMenu(false);
      if (dotsMenuRef.current    && !dotsMenuRef.current.contains(e.target as Node))    setShowDotsMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const [activity,      setActivity]      = useState<any[]>([]);
  const [actLoading,    setActLoading]    = useState(true);
  const [agendaEvents,  setAgendaEvents]  = useState<any[]>([]);
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [taskStats,     setTaskStats]     = useState({ vencidas:0, proximas:0, urgentes:0, pendientes:0, completadas:0 });
  const [billingRaw,    setBillingRaw]    = useState<{ facturas: any[]; gastos: any[] } | null>(null);
  const [activityTotal, setActivityTotal] = useState(0);
  const [expStats,      setExpStats]      = useState({ total: 0, abiertos: 0, este_anio: 0, archivados: 0 });
  const [clientStats,   setClientStats]   = useState({ total: 0, activos: 0, conEmail: 0, conTelefono: 0 });
  const [chatStats,     setChatStats]     = useState({ canales: 0, noLeidos: 0, directos: 0, conActividad: 0 });
  const [waStats,       setWaStats]       = useState({ configurado: false, webhook: false, programados: 0, origen: "Sin configurar" });
  const [emailStats,    setEmailStats]    = useState({ cuentas: 0, inbox: 0, unread: 0, drafts: 0 });
  const [emailAccounts,    setEmailAccounts]    = useState<any[]>([]);
  const [emailMessages,    setEmailMessages]    = useState<any[]>([]);
  const [emailMsgLoading,  setEmailMsgLoading]  = useState(false);
  const [selectedEmailAccountId, setSelectedEmailAccountId] = useState<string>("");
  const [docStats,      setDocStats]      = useState({ providers: 0, activos: 0, highlights: 0, lexnet: false });

  // Billing period state
  const thisYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: thisYear - 2010 + 2 }, (_, i) => ({ id: String(thisYear + 1 - i), label: String(thisYear + 1 - i) }));
  const [billingYear, setBillingYear] = useState(String(thisYear));
  const [billingQtr,  setBillingQtr]  = useState("all");

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) { setActLoading(true); setAgendaLoading(true); }
    try {
      const token = await getToken({ skipCache: true });
      const headers = { Authorization: `Bearer ${token}` };
      const [
        actRes, agendaRes, tasksRes, billingRes,
        expRes, clientsRes, chatRes, chatUnreadRes,
        waStatusRes, waSchedulesRes, emailStatsRes, emailAccountsRes,
        docProvidersRes, docHighlightsRes, emailMsgsRes,
      ] = await Promise.all([
        fetch("/api/activity/me?limit=10",        { headers }),
        fetch("/api/agenda/upcoming?limit=3",     { headers }),
        fetch("/api/tasks/me",                    { headers }),
        fetch("/api/facturacion/bootstrap",       { headers }),
        fetch("/api/expedientes/stats",           { headers }),
        fetch("/api/entities?limit=500",          { headers }),
        fetch("/api/chat/canales",                { headers }),
        fetch("/api/chat/unread",                 { headers }),
        fetch("/api/whatsapp/status",             { headers }),
        fetch("/api/whatsapp/schedules",          { headers }),
        fetch("/api/email/stats",                 { headers }),
        fetch("/api/email/accounts",              { headers }),
        fetch("/api/documental/providers",        { headers }),
        fetch("/api/documental/cendoj/highlights",{ headers }),
        fetch("/api/email/messages?folder=INBOX&limit=5", { headers }),
      ]);
      const [
        actData, agendaData, tasksData, billingData,
        expData, clientsData, chatData, chatUnreadData,
        waStatusData, waSchedulesData, emailStatsData, emailAccountsData,
        docProvidersData, docHighlightsData, emailMsgsData,
      ] = await Promise.all([
        safeJson(actRes), safeJson(agendaRes), safeJson(tasksRes), safeJson(billingRes),
        safeJson(expRes), safeJson(clientsRes), safeJson(chatRes), safeJson(chatUnreadRes),
        safeJson(waStatusRes), safeJson(waSchedulesRes), safeJson(emailStatsRes), safeJson(emailAccountsRes),
        safeJson(docProvidersRes), safeJson(docHighlightsRes), safeJson(emailMsgsRes),
      ]);
      if (actRes.ok) {
        setActivity(actData.data || []);
        setActivityTotal(Number(actData.total || (actData.data || []).length || 0));
      }
      if (agendaRes.ok) setAgendaEvents(agendaData.data || []);
      if (tasksRes.ok) {
        const tasks: any[] = tasksData.data || [];
        const now = new Date(), soon = new Date(now.getTime() + 7*24*60*60*1000);
        const done = (e: string) => e === "completada";
        setTaskStats({
          vencidas:    tasks.filter((t:any) => !done(t.estado) && t.plazo && new Date(t.plazo) < now).length,
          proximas:    tasks.filter((t:any) => !done(t.estado) && t.plazo && new Date(t.plazo) >= now && new Date(t.plazo) <= soon).length,
          urgentes:    tasks.filter((t:any) => t.estado === "urgente").length,
          pendientes:  tasks.filter((t:any) => t.estado === "pendiente").length,
          completadas: tasks.filter((t:any) => t.estado === "completada").length,
        });
      }
      if (billingRes.ok) {
        const d = billingData.data || billingData;
        setBillingRaw({ facturas: d.facturas || [], gastos: d.gastos || [] });
      }
      if (expRes.ok) {
        const d = expData.data || {};
        setExpStats({
          total: Number(d.total || 0),
          abiertos: Number(d.abiertos || 0),
          este_anio: Number(d.este_anio || 0),
          archivados: Number(d.archivados || 0),
        });
      }
      if (clientsRes.ok) {
        const rows: any[] = clientsData.data || [];
        setClientStats({
          total: Number(clientsData.count || rows.length || 0),
          activos: rows.filter((row) => String(row.client_status || "").toLowerCase() !== "baja").length,
          conEmail: rows.filter((row) => Boolean(String(row.email || "").trim())).length,
          conTelefono: rows.filter((row) => Boolean(String(row.phone_1 || row.phone_mobile || "").trim())).length,
        });
      }
      if (chatRes.ok || chatUnreadRes.ok) {
        const canales: any[] = chatData.data || [];
        const unreadRows: any[] = chatUnreadData.data || [];
        setChatStats({
          canales: canales.length,
          noLeidos: unreadRows.reduce((sum, row) => sum + Number(row.no_leidos || 0), 0),
          directos: canales.filter((row) => row.tipo === "dm").length,
          conActividad: canales.filter((row) => Boolean(row.ultimo_mensaje_at)).length,
        });
      }
      if (waStatusRes.ok || waSchedulesRes.ok) {
        const status = waStatusData.data || {};
        const schedules: any[] = waSchedulesData.data || [];
        setWaStats({
          configurado: Boolean(status.configured),
          webhook: Boolean(status.webhookBaseUrlConfigured),
          programados: schedules.length,
          origen: status.configSource === "database" ? "Configurado" : status.configSource === "environment" ? "Entorno" : "Sin configurar",
        });
      }
      if (emailStatsRes.ok || emailAccountsRes.ok) {
        const stats = emailStatsData.data || {};
        const accounts: any[] = emailAccountsData.data || [];
        setEmailStats({
          cuentas: accounts.length,
          inbox: Number(stats.inbox || 0),
          unread: Number(stats.unread || 0),
          drafts: Number(stats.drafts || 0),
        });
        setEmailAccounts(accounts);
        if (!silent && accounts.length > 0) {
          setSelectedEmailAccountId(prev => prev || accounts[0].id);
        }
      }
      if (emailMsgsRes.ok) {
        setEmailMessages(emailMsgsData.data?.emails || emailMsgsData.data || []);
      }
      if (docProvidersRes.ok || docHighlightsRes.ok) {
        const providers = docProvidersData.data || {};
        const providerValues = Object.values(providers) as any[];
        const highlights: any[] = docHighlightsData.data?.highlights || [];
        setDocStats({
          providers: providerValues.length,
          activos: providerValues.filter((provider) => provider?.status === "available" || provider?.status === "prepared" || provider?.configured).length,
          highlights: highlights.length,
          lexnet: Boolean((providers as any).lexnet?.configured),
        });
      }
    } catch {/* */} finally {
      if (!silent) { setActLoading(false); setAgendaLoading(false); }
    }
  }, [getToken]);

  const saveVisible = (ids: string[]) => {
    const next = sanitizeWidgetIds(ids, DEFAULT_VISIBLE);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setVisibleWidgets(next);
  };

  const fetchEmailMessages = useCallback(async (accountId: string) => {
    setEmailMsgLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const url = `/api/email/messages?folder=INBOX&limit=5${accountId ? `&account_id=${accountId}` : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const d = await safeJson(res);
      if (res.ok) setEmailMessages(d.data?.emails || d.data || []);
    } catch {/* */} finally {
      setEmailMsgLoading(false);
    }
  }, [getToken]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), { intervalMs: 20_000 });

  // ── DnD ──────────────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  function handleDragStart(_e: DragStartEvent) { wasDragging.current = false; }
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      wasDragging.current = true;
      setWidgetOrder(order => {
        const next = arrayMove(order, order.indexOf(active.id as string), order.indexOf(over.id as string));
        localStorage.setItem(ORDER_KEY, JSON.stringify(next));
        return next;
      });
      setTimeout(() => { wasDragging.current = false; }, 200);
    }
  }
  function goTo(path: string) { if (!wasDragging.current) navigate(path); }

  const orderedVisible = [
    ...widgetOrder.filter(id => visibleWidgets.includes(id)),
    ...visibleWidgets.filter(id => !widgetOrder.includes(id)),
  ];

  // ── Billing calcs ─────────────────────────────────────────────────────────
  const billingCalc = (() => {
    if (!billingRaw) return null;
    const yr = Number(billingYear);
    const allowedMonths = billingQtr === "all" ? null : PERIOD_MONTHS[billingQtr];
    const inRange = (fecha: string) => {
      if (!fecha) return false;
      const d = new Date(fecha);
      if (d.getFullYear() !== yr) return false;
      if (allowedMonths && !allowedMonths.includes(d.getMonth())) return false;
      return true;
    };
    const facturas = billingRaw.facturas.filter((f:any) => inRange(f.fecha));
    const gastos   = billingRaw.gastos.filter((g:any) => inRange(g.fecha));
    const ingresos    = facturas.reduce((s:number, f:any) => s + Number(f.total||0), 0);
    const gastosTot   = gastos.reduce((s:number, g:any) => s + Number(g.total||0), 0);
    const total       = ingresos - gastosTot;
    const ivaIng      = ingresos * 0.21;
    const ivaGas      = gastosTot * 0.21;
    const ivaLiq      = ivaIng - ivaGas;
    return { ingresos, gastosTot, total, ivaIng, ivaGas, ivaLiq };
  })();

  // ── Widget renderers ──────────────────────────────────────────────────────
  function renderWidget(id: string, handle: ReactNode) {
    switch (id) {

      case "agenda": return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <Calendar size={15} className="text-red-500" /> Próximas citas
            </h2>
            <div className="flex items-center gap-2">
              {handle}
              <Link to="/dashboard/agenda" onClick={e => e.stopPropagation()} className="text-xs font-bold text-red-600 hover:underline flex items-center gap-0.5">
                Ver agenda <ChevronRight size={11} />
              </Link>
            </div>
          </div>
          {agendaLoading ? (
            <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
          ) : agendaEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
              <Calendar size={22} className="opacity-20" />
              <p className="text-xs">Sin próximos eventos</p>
              <Link to="/dashboard/agenda" className="text-xs font-bold text-red-500 hover:underline">+ Crear evento</Link>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {agendaEvents.map((ev:any) => {
                const sty = EVENT_STYLES[ev.type] || EVENT_STYLES.otro;
                const lbl = eventDayLabel(ev.start_at);
                return (
                  <div key={ev.id} onClick={() => goTo("/dashboard/agenda")} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors group">
                    <div className={`w-1 h-8 rounded-full shrink-0 ${sty.color}`} />
                    <div className="w-16 shrink-0 text-right">
                      <p className={`text-[10px] font-bold ${lbl==="Hoy"?"text-red-500":"text-slate-500"}`}>{lbl}</p>
                      {!ev.all_day ? <p className="text-sm font-black text-slate-700">{fmtTime(ev.start_at)}</p> : <p className="text-[10px] text-slate-400 font-semibold">Todo el día</p>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-red-600">{ev.title}</p>
                      {ev.location && <p className="text-[10px] text-slate-400 mt-0.5">{ev.location}</p>}
                    </div>
                    {lbl==="Hoy" && <span className="shrink-0 text-[10px] font-bold text-red-500 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">Hoy</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );

      case "tareas": return (
        <div onClick={() => goTo("/dashboard/tareas")} className="cursor-pointer group">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <CheckCircle2 size={14} className="text-slate-400" /> Tareas
              </h3>
              <div className="flex items-center gap-1">
                {handle}
                <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
              </div>
            </div>
            <div className="grid grid-cols-2">
              <div className="p-5 bg-red-50 border-r border-red-100">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Vencidas</p>
                <p className={`text-4xl font-black leading-none ${taskStats.vencidas>0?"text-red-600":"text-slate-300"}`}>{taskStats.vencidas}</p>
                <p className="text-[10px] text-red-300 mt-1">vencidas</p>
              </div>
              <div className="p-5">
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1">Próximas</p>
                <p className={`text-4xl font-black leading-none ${taskStats.proximas>0?"text-amber-500":"text-slate-300"}`}>{taskStats.proximas}</p>
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
        </div>
      );

      case "actividad": return (
        <div onClick={() => goTo("/dashboard/trazabilidad")} className="cursor-pointer group bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <RefreshCw size={13} className="text-slate-400" /> ⚡ Actividad reciente
            </h3>
            <div className="flex items-center gap-1">
              {handle}
              <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
            </div>
          </div>
          {actLoading ? (
            <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
          ) : activity.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">Sin actividad reciente</p>
          ) : (
            <>
            <div className="grid grid-cols-2 border-b border-slate-100">
              <div className="px-5 py-4 border-r border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Movimientos</p>
                <p className="mt-1 text-3xl font-black text-slate-800">{activityTotal}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ultimo registro</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{activity[0]?.created_at ? timeAgo(activity[0].created_at) : "Sin datos"}</p>
                <p className="mt-1 text-[10px] text-slate-400 truncate">{activity[0]?.action_type || "Actividad"}</p>
              </div>
            </div>
            <ul className="divide-y divide-slate-50 max-h-44 overflow-y-auto">
              {activity.slice(0,10).map((item:any, i:number) => (
                <li key={i} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                  <span className="text-base mt-0.5 shrink-0">{actionIcon(item.action_type||"")}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-700 leading-snug line-clamp-2">{item.description||item.action_type}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(item.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
            </>
          )}
        </div>
      );

      case "expedientes": return (
        <div onClick={() => goTo("/dashboard/expedientes")} className="cursor-pointer group bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-slate-800 text-sm flex items-center gap-2">📁 Expedientes</span>
            <div className="flex items-center gap-1">
              {handle}
              <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
            </div>
          </div>
          <p className="text-xs text-slate-500">Accede a todos tus expedientes abiertos y activos desde aquí.</p>
        </div>
      );

      case "clientes": return (
        <div onClick={() => goTo("/dashboard/clientes")} className="cursor-pointer group bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="font-bold text-slate-800 text-sm flex items-center gap-2">👥 Clientes</span>
            <div className="flex items-center gap-1">
              {handle}
              <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-100">
            <div className="bg-white px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fichas</p>
              <p className="mt-1 text-3xl font-black text-slate-800">{clientStats.total}</p>
            </div>
            <div className="bg-white px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Activos</p>
              <p className="mt-1 text-3xl font-black text-emerald-600">{clientStats.activos}</p>
            </div>
            <div className="bg-white px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Con email</p>
              <p className="mt-1 text-2xl font-black text-slate-700">{clientStats.conEmail}</p>
            </div>
            <div className="bg-white px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Con teléfono</p>
              <p className="mt-1 text-2xl font-black text-slate-700">{clientStats.conTelefono}</p>
            </div>
          </div>
        </div>
      );

      case "chat": return (
        <div onClick={() => goTo("/dashboard/chat")} className="cursor-pointer group bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="font-bold text-slate-800 text-sm flex items-center gap-2">💬 Chat interno</span>
            <div className="flex items-center gap-1">
              {handle}
              <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
            </div>
          </div>
          <div className="grid grid-cols-3">
            <div className="px-5 py-4 border-r border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Canales</p>
              <p className="mt-1 text-3xl font-black text-slate-800">{chatStats.canales}</p>
            </div>
            <div className="px-5 py-4 border-r border-slate-100 bg-violet-50/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">No leídos</p>
              <p className="mt-1 text-3xl font-black text-violet-700">{chatStats.noLeidos}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">DM</p>
              <p className="mt-1 text-3xl font-black text-slate-700">{chatStats.directos}</p>
            </div>
          </div>
        </div>
      );

      case "whatsapp": return (
        <div onClick={() => goTo("/dashboard/whatsapp")} className="cursor-pointer group bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="font-bold text-slate-800 text-sm flex items-center gap-2">📱 WhatsApp</span>
            <div className="flex items-center gap-1">
              {handle}
              <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Estado</p>
                <p className={`mt-1 text-sm font-black ${waStats.configurado ? "text-emerald-600" : "text-slate-500"}`}>
                  {waStats.configurado ? "Configurado" : "Pendiente"}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${waStats.webhook ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                {waStats.webhook ? "Webhook listo" : "Webhook pendiente"}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Programados</p>
                <p className="mt-1 text-2xl font-black text-slate-800">{waStats.programados}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Origen</p>
                <p className="mt-1 text-sm font-black text-slate-700">{waStats.origen}</p>
              </div>
            </div>
          </div>
        </div>
      );

      case "correo": return (
        <div className="group bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-slate-800 text-sm shrink-0">✉️ Correo</span>
              {emailStats.unread > 0 && (
                <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {emailStats.unread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {emailAccounts.length > 1 && (
                <select
                  value={selectedEmailAccountId}
                  onChange={(e) => { setSelectedEmailAccountId(e.target.value); fetchEmailMessages(e.target.value); }}
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-[120px] truncate rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600"
                >
                  {emailAccounts.map((acc: any) => (
                    <option key={acc.id} value={acc.id}>{acc.username || acc.email || acc.name || "Cuenta"}</option>
                  ))}
                </select>
              )}
              {emailAccounts.length === 1 && (
                <span className="max-w-[100px] truncate text-[10px] text-slate-400">{emailAccounts[0]?.username || emailAccounts[0]?.email || ""}</span>
              )}
              <div className="flex items-center gap-1">
                {handle}
                <ChevronRight size={14} onClick={() => goTo("/dashboard/correo")} className="cursor-pointer text-slate-300 group-hover:text-red-500 transition-colors" />
              </div>
            </div>
          </div>
          {emailMsgLoading ? (
            <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
          ) : emailMessages.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">Sin mensajes recientes</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {emailMessages.slice(0, 5).map((msg: any, i: number) => (
                <li key={i} onClick={() => goTo("/dashboard/correo")} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${msg.is_read ? "bg-slate-200" : "bg-blue-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800">{msg.from_name || msg.from_email || "Desconocido"}</p>
                    <p className="truncate text-xs text-slate-500">{msg.subject || "(Sin asunto)"}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-400">{msg.sent_at ? timeAgo(msg.sent_at) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );

      case "documental": return (
        <div onClick={() => goTo("/dashboard/documental")} className="cursor-pointer group bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="font-bold text-slate-800 text-sm flex items-center gap-2">📚 Documental</span>
            <div className="flex items-center gap-1">
              {handle}
              <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
            </div>
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fuentes</p>
                <p className="mt-1 text-3xl font-black text-slate-800">{docStats.providers}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Activas</p>
                <p className="mt-1 text-3xl font-black text-emerald-600">{docStats.activos}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Destacados</p>
                <p className="mt-1 text-3xl font-black text-slate-700">{docStats.highlights}</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
              LexNET: <span className={`font-bold ${docStats.lexnet ? "text-emerald-600" : "text-amber-600"}`}>{docStats.lexnet ? "preparado" : "pendiente"}</span>
            </div>
          </div>
        </div>
      );

      case "facturacion": return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <h3 className="font-bold text-slate-800 text-sm shrink-0">💶 Facturación</h3>
            <div className="flex items-center gap-1.5 flex-1 justify-end">
              <StyledDropdown
                selected={billingYear}
                label={billingYear}
                options={yearOptions}
                onSelect={setBillingYear}
              />
              <StyledDropdown
                selected={billingQtr}
                label={PERIODS.find(p => p.id === billingQtr)?.label ?? "Todo el año"}
                options={PERIODS}
                onSelect={setBillingQtr}
              />
              {handle}
              <button
                onClick={() => goTo("/dashboard/facturacion")}
                className="flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-600 px-2 py-1 text-[11px] font-bold text-slate-600 transition-colors"
              >
                Ver <ChevronRight size={11} />
              </button>
            </div>
          </div>
          {/* Body */}
          {!billingCalc ? (
            <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
          ) : (
            <div className="p-4">
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 mb-1">Ingresos</p>
                  <p className="text-sm font-black text-emerald-600 leading-tight">{fmtEur(billingCalc.ingresos)}</p>
                  <p className="text-[10px] text-slate-400 mt-1.5">IVA {fmtEur(billingCalc.ivaIng)}</p>
                  <p className="text-[10px] text-slate-400">IRPF 0,00 €</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 mb-1">Gastos</p>
                  <p className="text-sm font-black text-red-500 leading-tight">{fmtEur(billingCalc.gastosTot)}</p>
                  <p className="text-[10px] text-slate-400 mt-1.5">IVA {fmtEur(billingCalc.ivaGas)}</p>
                  <p className="text-[10px] text-slate-400">IRPF 0,00 €</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 mb-1">Total</p>
                  <p className={`text-sm font-black leading-tight ${billingCalc.total>=0?"text-slate-800":"text-red-600"}`}>{fmtEur(billingCalc.total)}</p>
                  <p className="text-[10px] text-slate-400 mt-1.5">IVA {fmtEur(billingCalc.ivaLiq)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 -mx-4 -mb-4 px-4 pb-4 bg-slate-50 rounded-b-2xl">
                <div>
                  <p className="text-[10px] text-slate-400">IVA a liquidar</p>
                  <p className="text-sm font-bold text-slate-700">{fmtEur(billingCalc.ivaLiq)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">IRPF a liquidar</p>
                  <p className="text-sm font-bold text-slate-700">0,00 €</p>
                </div>
              </div>
            </div>
          )}
        </div>
      );

      default: return null;
    }
  }

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

          {/* Nuevo Cliente */}
          <div className="relative" ref={clienteMenuRef}>
            <button onClick={() => setShowClienteMenu(v => !v)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-sm shadow-sm border transition-all select-none ${showClienteMenu?"bg-slate-100 text-slate-800 border-slate-300":"bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
              <Plus size={15} /> Nuevo Cliente <ChevronDown size={13} className={`transition-transform ${showClienteMenu?"rotate-180":""}`} />
            </button>
            {showClienteMenu && (
              <div className="absolute left-0 top-full z-50 mt-2 w-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/40">
                <div className="border-b border-slate-100 px-5 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Alta de clientes</p>
                  <h3 className="mt-1 text-[15px] font-bold text-slate-900">Elige cómo quieres agregar clientes</h3>
                </div>
                <div className="px-3 py-3">
                  {[
                    { label:"Crear manualmente", desc:"Crea un cliente desde cero introduciendo sus datos manualmente.", icon:<Plus size={17}/>, cls:"bg-emerald-100 text-emerald-600", to:"/dashboard/clientes/new" },
                    { label:"Con DNI", desc:"Sube anverso y reverso del DNI para rellenar la ficha automáticamente.", icon:<ScanLine size={17}/>, cls:"bg-blue-100 text-blue-600", to:"/dashboard/clientes/new?mode=dni" },
                    { label:"Con enlace", desc:"Genera un enlace para que el cliente rellene sus datos directamente.", icon:<ExternalLink size={17}/>, cls:"bg-amber-100 text-amber-600", to:"/dashboard/clientes/invitar" },
                  ].map(item => (
                    <button key={item.label} onClick={() => { setShowClienteMenu(false); navigate(item.to); }} className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50 transition-colors">
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.cls}`}>{item.icon}</div>
                      <div><p className="text-base font-bold text-slate-800">{item.label}</p><p className="mt-1 text-sm leading-6 text-slate-500">{item.desc}</p></div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Nuevo Expediente */}
          <div className="relative -mr-1" ref={altaMenuRef}>
            <button onClick={() => setShowAltaMenu(v => !v)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-sm shadow-md shadow-red-200 transition-all select-none ${showAltaMenu?"bg-red-800 text-white":"bg-red-600 hover:bg-red-700 text-white"}`}>
              <Plus size={15} /> Nuevo Expediente <ChevronDown size={13} className={`transition-transform ${showAltaMenu?"rotate-180":""}`} />
            </button>
            {showAltaMenu && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/40">
                <div className="border-b border-slate-100 px-5 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Alta de expedientes</p>
                  <h3 className="mt-1 text-[15px] font-bold text-slate-900">Elige cómo quieres agregar expedientes</h3>
                </div>
                <div className="px-3 py-3">
                  {[
                    { label:"Crear manualmente", desc:"Crea un expediente desde cero introduciendo los datos manualmente.", icon:<Plus size={17}/>, cls:"bg-emerald-100 text-emerald-600", to:"/dashboard/expedientes?nuevo=1" },
                    { label:"Importar desde CSV", desc:"Sube un archivo CSV con múltiples expedientes a la vez.", icon:<FileSpreadsheet size={17}/>, cls:"bg-blue-100 text-blue-600", to:"/dashboard/expedientes?mode=csv" },
                    { label:"Desde documentos", desc:"Procesa documentos para crear expedientes automáticamente.", icon:<ClipboardList size={17}/>, cls:"bg-amber-100 text-amber-700", to:"/dashboard/expedientes?mode=docs" },
                  ].map(item => (
                    <button key={item.label} onClick={() => { setShowAltaMenu(false); navigate(item.to); }} className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50 transition-colors">
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.cls}`}>{item.icon}</div>
                      <div><p className="text-base font-bold text-slate-800">{item.label}</p><p className="mt-1 text-sm leading-6 text-slate-500">{item.desc}</p></div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Dots */}
          <div className="relative" ref={dotsMenuRef}>
            <button onClick={() => setShowDotsMenu(v => !v)} title="Más opciones" className={`flex items-center justify-center h-9 w-9 rounded-xl border transition-all ${showDotsMenu?"bg-slate-100 border-slate-300 text-slate-800":"bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              <MoreHorizontal size={16} />
            </button>
            {showDotsMenu && (
              <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <button onClick={() => { setShowDotsMenu(false); setShowWidgetPicker(true); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                  <LayoutGrid size={14} className="text-slate-400" /> Elegir elementos
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* WIDGETS */}
      {orderedVisible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <LayoutGrid size={32} className="opacity-20" />
          <p className="text-sm">Sin elementos visibles. Pulsa <strong>···</strong> para elegir qué mostrar.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} autoScroll={false}>
          <SortableContext items={orderedVisible} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {orderedVisible.map(id => (
                <SortableWidget key={id} id={id}>
                  {(handle) => renderWidget(id, handle)}
                </SortableWidget>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {false && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Mapa del ERP</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">Todos los módulos disponibles</h2>
          </div>
          <p className="text-sm text-slate-400">Accesos directos a todos los módulos del sistema.</p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {DASHBOARD_MODULES.map((module) => {
            const Icon = module.icon;
            return (
              <button
                key={module.id}
                onClick={() => navigate(module.to)}
                className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-sm"
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${module.tone}`}>
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-slate-900">{module.label}</span>
                    <ChevronRight size={15} className="text-slate-300 transition-colors group-hover:text-slate-500" />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{module.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>}

      {showWidgetPicker && (
        <WidgetPickerModal visible={visibleWidgets} onClose={() => setShowWidgetPicker(false)} onSave={saveVisible} />
      )}
    </div>
  );
}
