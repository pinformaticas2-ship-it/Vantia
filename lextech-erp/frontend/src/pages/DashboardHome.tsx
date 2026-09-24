import { useEffect, useState, useCallback, useRef, useMemo, ReactNode, useContext } from "react";
import { SidebarContext } from "../layouts/DashboardLayout";
import { Spinner } from "../components/Spinner";
import { createPortal } from "react-dom";
import { useUser, useAuth } from "@clerk/clerk-react";
import {
  Clock, Plus, CheckCircle2, Loader2, RefreshCw,
  ChevronRight, Calendar, MapPin, Video, Phone,
  ChevronDown, FileSpreadsheet, ClipboardList,
  ScanLine, ExternalLink, MoreHorizontal, LayoutGrid, X, GripVertical,
  Briefcase, Users, History, MessageSquare, MessageCircle, Mail, Library,
  Receipt, Reply, MailOpen, ArrowRight, Check, Trash2, Eye,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragStartEvent, DragOverEvent, DragOverlay, useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
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
const EVENT_BADGE: Record<string, { label: string; color: string; dot: string }> = {
  cita:    { label: "Confirmada",  color: "bg-blue-50 text-blue-600 border border-blue-100",     dot: "bg-blue-400" },
  reunion: { label: "Reunión",     color: "bg-violet-50 text-violet-600 border border-violet-100", dot: "bg-violet-400" },
  llamada: { label: "Llamada",     color: "bg-green-50 text-green-600 border border-green-100",  dot: "bg-green-400" },
  vista:   { label: "Importante",  color: "bg-red-50 text-red-600 border border-red-100",        dot: "bg-red-400" },
  plazo:   { label: "Plazo",       color: "bg-amber-50 text-amber-600 border border-amber-100",  dot: "bg-amber-400" },
  video:   { label: "Videollamada",color: "bg-cyan-50 text-cyan-600 border border-cyan-100",     dot: "bg-cyan-400" },
  otro:    { label: "Evento",      color: "bg-slate-100 text-slate-500 border border-slate-200", dot: "bg-slate-400" },
};
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

// ── Masonry: cada columna apila sus tarjetas por su cuenta, sin esperar a
// que las otras columnas terminen su fila -- así una tarjeta corta no deja
// un hueco vacío debajo solo porque su vecina es más alta (lo que pasaba
// con una rejilla CSS normal, donde toda la fila se estira a la altura de
// la más alta). El precio es que el reordenar-arrastrando ahora tiene que
// saber mover tarjetas ENTRE columnas, no solo dentro de una lista plana.
const COLUMNS_KEY = "dashboard_widget_columns";
const NUM_COLUMNS = 3;

function reconcileColumns(cols: string[][], visible: string[]): string[][] {
  const validSet = new Set(visible);
  const placed = new Set<string>();
  const next = cols.map((col) => col.filter((id) => {
    if (!validSet.has(id) || placed.has(id)) return false;
    placed.add(id);
    return true;
  }));
  for (const id of visible) {
    if (placed.has(id)) continue;
    let shortest = 0;
    for (let i = 1; i < next.length; i++) if (next[i].length < next[shortest].length) shortest = i;
    next[shortest].push(id);
    placed.add(id);
  }
  return next;
}

function loadColumns(visible: string[], order: string[]): string[][] {
  let cols: string[][] | null = null;
  try {
    const r = localStorage.getItem(COLUMNS_KEY);
    if (r) {
      const parsed = JSON.parse(r);
      if (Array.isArray(parsed) && parsed.length === NUM_COLUMNS && parsed.every((c) => Array.isArray(c))) {
        cols = parsed;
      }
    }
  } catch {/**/}

  if (!cols) {
    // Sin columnas guardadas todavía: migrar el orden plano anterior
    // (dashboard_widget_order) repartiéndolo por turnos entre columnas.
    cols = Array.from({ length: NUM_COLUMNS }, () => [] as string[]);
    order.forEach((id, idx) => { cols![idx % NUM_COLUMNS].push(id); });
  }

  return reconcileColumns(cols, visible);
}

function MasonryColumn({ id, items, children }: { id: string; items: string[]; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <SortableContext items={items} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className="flex flex-col gap-4 min-h-[40px]">
        {children}
      </div>
    </SortableContext>
  );
}

function WidgetPickerModal({ visible, isAdmin, onClose, onSave }: { visible: string[]; isAdmin: boolean; onClose: () => void; onSave: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(visible);
  const toggle = (id: string) => setSel(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  const availableWidgets = ALL_WIDGETS.filter(w => w.id !== "facturacion" || isAdmin);

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
          {availableWidgets.map(w => (
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

// ── Vista previa de correo (widget "Correo" del dashboard) ────────────────────
// Cuerpo renderizado en un iframe con sandbox, igual que el lector completo de
// Email.tsx -- así un HTML de correo con <script>/estilos raros no puede tocar
// el resto de la página, sin necesidad de sanitizar el HTML a mano.
function linkifyPlainTextDash(escapedText: string): string {
  return escapedText
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/([\w.+-]+@[\w-]+\.[\w.-]+)(?![^<]*>)/g, '<a href="mailto:$1">$1</a>');
}
function buildEmailPreviewDoc(bodyHtml?: string | null, bodyText?: string | null): string {
  const looksLikeHtml = bodyText && /<[a-z][\s\S]*>/i.test(bodyText);
  const html = bodyHtml || (looksLikeHtml ? bodyText : null);
  const content = html
    || (bodyText
      ? `<pre style="font-family:inherit;white-space:pre-wrap;word-break:break-word;margin:0;padding:0">${linkifyPlainTextDash(bodyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))}</pre>`
      : '<p style="color:#9ca3af;font-style:italic;margin:0">Sin contenido</p>');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">
<style>
  html,body{margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;color:#1f2937;line-height:1.7;background:#fff;word-break:break-word;overflow-wrap:break-word;padding:16px}
  a{color:#2563eb}a:hover{text-decoration:underline}
  img{max-width:100%!important;height:auto}
  *{box-sizing:border-box}
  blockquote{border-left:3px solid #e2e8f0;margin:8px 0;padding:4px 14px;color:#64748b}
  table{max-width:100%!important;border-collapse:collapse}
  pre{white-space:pre-wrap;word-break:break-word;font-family:inherit}
  p{margin:0 0 6px}
</style></head><body>${content}</body></html>`;
}

function EmailPreviewModal({
  data, loading, deleting, onClose, onReply, onOpenFull, onDelete,
}: {
  data: any | null;
  loading: boolean;
  deleting: boolean;
  onClose: () => void;
  onReply: () => void;
  onOpenFull: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    const scrollEl = document.getElementById("dashboard-content") as HTMLElement | null;
    const prevScroll = scrollEl?.style.overflow ?? "";
    if (scrollEl) scrollEl.style.overflow = "hidden";
    return () => { if (scrollEl) scrollEl.style.overflow = prevScroll; };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-900/40 px-4 pb-8 pt-[8vh]" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          {loading || !data ? (
            <div className="flex items-center gap-2 text-sm text-slate-400"><Spinner size="sm" muted /> Cargando…</div>
          ) : (
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate">{data.subject || "(Sin asunto)"}</h3>
              <p className="mt-1 text-xs text-slate-500 truncate">
                <span className="font-semibold text-slate-700">{data.from_name || data.from_email || "Desconocido"}</span>
                {data.from_name && data.from_email ? ` · ${data.from_email}` : ""}
                {data.sent_at ? ` · ${new Date(data.sent_at).toLocaleString("es-ES")}` : ""}
              </p>
            </div>
          )}
          <button onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading || !data ? (
            <div className="flex items-center justify-center py-16"><Spinner muted /></div>
          ) : (
            <iframe
              srcDoc={buildEmailPreviewDoc(data.body_html, data.body_text)}
              title="Vista previa del correo"
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              className="block w-full border-0"
              style={{ height: "50vh" }}
            />
          )}
        </div>
        <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            onClick={onDelete}
            disabled={deleting || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Eliminar
          </button>
          <button
            onClick={onReply}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Reply size={13} /> Responder
          </button>
          <button
            onClick={onOpenFull}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
          >
            <ExternalLink size={13} /> Abrir completo
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Sortable wrapper ──────────────────────────────────────────────────────────
function SortableWidget({ id, children, className, animDelay = 0 }: { id: string; children: (handle: ReactNode) => ReactNode; className?: string; animDelay?: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    boxShadow: isDragging ? "0 8px 24px rgba(15,23,42,0.12)" : undefined,
    zIndex: isDragging ? 50 : undefined,
    cursor: isDragging ? "grabbing" : undefined,
    animationDelay: `${animDelay}ms`,
  };
  const handle = (
    <button
      {...listeners} {...attributes}
      className="p-1 rounded text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing touch-none"
      title="Arrastrar para reordenar"
    >
      <GripVertical size={14} />
    </button>
  );
  return <div ref={setNodeRef} style={style} className={`anim-fade-up ${className ?? ''}`}>{children(handle)}</div>;
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
  // Tesorería (widget "Facturación") es solo para administradores.
  const isAdmin = (user?.publicMetadata as any)?.role === "admin";
  const weather      = useWeather();
  const greeting     = getGreeting();
  const { isCollapsed } = useContext(SidebarContext);

  const [showAltaMenu,     setShowAltaMenu]     = useState(false);
  const [showClienteMenu,  setShowClienteMenu]  = useState(false);
  const [showDotsMenu,     setShowDotsMenu]      = useState(false);
  const [showWidgetPicker, setShowWidgetPicker]  = useState(false);
  const [visibleWidgets,   setVisibleWidgets]    = useState<string[]>(loadVisible);
  const [columns,          setColumns]           = useState<string[][]>(() => loadColumns(loadVisible(), loadOrder()));
  const [activeId,         setActiveId]          = useState<string | null>(null);
  const [isDesktopMasonry, setIsDesktopMasonry]  = useState(() => (
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true
  ));

  const altaMenuRef    = useRef<HTMLDivElement>(null);
  const clienteMenuRef = useRef<HTMLDivElement>(null);
  const dotsMenuRef    = useRef<HTMLDivElement>(null);
  const wasDragging    = useRef(false);

  // Debajo de 768px un solo carril de tarjetas no puede tener huecos por
  // definición (no hay filas con las que desalinearse), así que ahí no hace
  // falta lógica de masonry -- solo se aplana el resultado para mostrarlo.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktopMasonry(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

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
  const [billingError,  setBillingError]  = useState(false);
  const [billingRetrying, setBillingRetrying] = useState(false);
  const [activityTotal, setActivityTotal] = useState(0);
  const [expStats,      setExpStats]      = useState({ total: 0, abiertos: 0, este_anio: 0, archivados: 0 });
  const [clientStats,   setClientStats]   = useState({ total: 0, activos: 0, conEmail: 0, conTelefono: 0 });
  const [chatStats,     setChatStats]     = useState({ canales: 0, noLeidos: 0, directos: 0, conActividad: 0 });
  const [waStats,       setWaStats]       = useState({ configurado: false, webhook: false, programados: 0, origen: "Sin configurar" });
  const [emailStats,    setEmailStats]    = useState({ cuentas: 0, inbox: 0, unread: 0, drafts: 0 });
  // Cuentas IMAP y perfiles de Gmail se guardan por separado y se combinan
  // con useMemo -- antes se mezclaban a mano dentro de fetchData(), así que
  // si esa petición conjunta (14 fetches en paralelo) fallaba o tardaba, el
  // selector se quedaba vacío sin ninguna pista de por qué. Ahora el Gmail
  // se pide aparte, de forma aislada, y si falla no arrastra a nada más.
  const [imapAccountsRaw, setImapAccountsRaw] = useState<any[]>([]);
  const [gmailProfilesRaw, setGmailProfilesRaw] = useState<any[]>([]);
  const emailAccounts = useMemo(() => [
    ...imapAccountsRaw.map((a: any) => ({
      id: a.id, type: 'imap' as const,
      label: a.username || a.email || a.label || 'Cuenta',
    })),
    ...gmailProfilesRaw.map((p: any) => ({
      id: p.id, type: 'gmail' as const,
      label: p.email || p.display_name || 'Gmail',
    })),
  ], [imapAccountsRaw, gmailProfilesRaw]);
  const [emailMessages,    setEmailMessages]    = useState<any[]>([]);
  const [emailMsgLoading,  setEmailMsgLoading]  = useState(false);
  const [selectedEmailAccountId, setSelectedEmailAccountId] = useState<string>("");
  const [emailAccountMenuOpen, setEmailAccountMenuOpen] = useState(false);
  const emailAccountMenuRef = useRef<HTMLDivElement | null>(null);
  const [openMenuEmailId,      setOpenMenuEmailId]      = useState<string | null>(null);
  const emailMenuRef = useRef<HTMLDivElement | null>(null);
  const [previewEmailId,   setPreviewEmailId]   = useState<string | null>(null);
  const [previewEmailData, setPreviewEmailData] = useState<any | null>(null);
  const [previewLoading,   setPreviewLoading]   = useState(false);
  const [deletingEmailId,  setDeletingEmailId]  = useState<string | null>(null);
  const [docStats,      setDocStats]      = useState({ providers: 0, activos: 0, lexnet: false });

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
      // Una sola de estas 14 peticiones fallando a nivel de red ("Failed to
      // fetch": extensión del navegador, hiccup puntual de conexión...)
      // rechazaba el Promise.all ENTERO, así que ningún widget del Dashboard
      // se actualizaba ese ciclo -- ni siquiera los que sí habían ido bien.
      // Cada fetch se blinda por separado con un "Response" sintético (no
      // ok) en vez de dejar que tumbe a los demás.
      const safeFetch = (url: string) => fetch(url, { headers }).catch(
        () => new Response(null, { status: 599, statusText: 'network-error' }),
      );
      const [
        actRes, agendaRes, tasksRes, billingRes,
        expRes, clientsRes, chatRes, chatUnreadRes,
        waStatusRes, waSchedulesRes, emailStatsRes, emailAccountsRes,
        docProvidersRes, emailMsgsRes,
      ] = await Promise.all([
        safeFetch("/api/activity/me?limit=10"),
        safeFetch("/api/agenda/upcoming?limit=3"),
        safeFetch("/api/tasks/me"),
        safeFetch("/api/facturacion/bootstrap"),
        safeFetch("/api/expedientes/stats"),
        safeFetch("/api/entities?limit=500"),
        safeFetch("/api/chat/canales"),
        safeFetch("/api/chat/unread"),
        safeFetch("/api/whatsapp/status"),
        safeFetch("/api/whatsapp/schedules"),
        safeFetch("/api/email/stats"),
        safeFetch("/api/email/accounts"),
        safeFetch("/api/documental/providers"),
        safeFetch("/api/email/messages?folder=INBOX&limit=5"),
      ]);
      // Mismo criterio para el parseo: si uno solo no es JSON válido (p.ej.
      // el "Response" sintético de arriba, o un 502/504 en HTML), que no
      // tumbe la lectura de los otros 13.
      const [
        actData, agendaData, tasksData, billingData,
        expData, clientsData, chatData, chatUnreadData,
        waStatusData, waSchedulesData, emailStatsData, emailAccountsData,
        docProvidersData, emailMsgsData,
      ] = await Promise.all([
        safeJson(actRes).catch(() => ({})), safeJson(agendaRes).catch(() => ({})),
        safeJson(tasksRes).catch(() => ({})), safeJson(billingRes).catch(() => ({})),
        safeJson(expRes).catch(() => ({})), safeJson(clientsRes).catch(() => ({})),
        safeJson(chatRes).catch(() => ({})), safeJson(chatUnreadRes).catch(() => ({})),
        safeJson(waStatusRes).catch(() => ({})), safeJson(waSchedulesRes).catch(() => ({})),
        safeJson(emailStatsRes).catch(() => ({})), safeJson(emailAccountsRes).catch(() => ({})),
        safeJson(docProvidersRes).catch(() => ({})), safeJson(emailMsgsRes).catch(() => ({})),
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
        setBillingError(false);
      } else {
        setBillingError(true);
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
        setEmailStats(prev => ({
          ...prev,
          inbox: Number(stats.inbox || 0),
          unread: Number(stats.unread || 0),
          drafts: Number(stats.drafts || 0),
        }));
        setImapAccountsRaw(emailAccountsData.data || []);
      }
      if (emailMsgsRes.ok) {
        setEmailMessages(emailMsgsData.data?.emails || emailMsgsData.data || []);
      }
      if (docProvidersRes.ok) {
        const providers = docProvidersData.data || {};
        const providerValues = Object.values(providers) as any[];
        setDocStats({
          providers: providerValues.length,
          activos: providerValues.filter((provider) => provider?.status === "available" || provider?.status === "prepared" || provider?.configured).length,
          lexnet: Boolean((providers as any).lexnet?.configured),
        });
      }
    } catch { setBillingError(true); } finally {
      if (!silent) { setActLoading(false); setAgendaLoading(false); }
    }
  }, [getToken]);

  // Reintento aislado del bloque de Facturación: evita re-pedir las otras 13
  // llamadas de fetchData() solo para recuperarse de un fallo puntual de esta.
  const retryBilling = useCallback(async () => {
    setBillingRetrying(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/facturacion/bootstrap", { headers: { Authorization: `Bearer ${token}` } });
      const d = await safeJson(res);
      if (res.ok) {
        const data = d.data || d;
        setBillingRaw({ facturas: data.facturas || [], gastos: data.gastos || [] });
        setBillingError(false);
      } else {
        setBillingError(true);
      }
    } catch {
      setBillingError(true);
    } finally {
      setBillingRetrying(false);
    }
  }, [getToken]);

  const saveVisible = (ids: string[]) => {
    const next = sanitizeWidgetIds(ids, DEFAULT_VISIBLE);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setVisibleWidgets(next);
  };

  // Cada cuenta del selector puede ser una cuenta IMAP o un perfil de Gmail
  // -- el backend distingue una de otra por un parámetro de query distinto
  // (account_id vs gmail_profile_id), así que hay que mirar el tipo antes
  // de pedir nada.
  const emailAccountQueryParam = useCallback((accountId: string) => {
    if (!accountId) return '';
    const acc = emailAccounts.find((a: any) => a.id === accountId);
    if (!acc) return '';
    return acc.type === 'gmail' ? `gmail_profile_id=${accountId}` : `account_id=${accountId}`;
  }, [emailAccounts]);

  const fetchEmailMessages = useCallback(async (accountId: string) => {
    setEmailMsgLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const param = emailAccountQueryParam(accountId);
      const url = `/api/email/messages?folder=INBOX&limit=5${param ? `&${param}` : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const d = await safeJson(res);
      if (res.ok) setEmailMessages(d.data?.emails || d.data || []);
    } catch {/* */} finally {
      setEmailMsgLoading(false);
    }
  }, [getToken, emailAccountQueryParam]);

  // Contador de "no leídos" de la cuenta seleccionada -- antes el badge de
  // "Correo" siempre mostraba el total mezclando todas las cuentas, así que
  // elegir una cuenta en el selector no cambiaba si parecía que "había
  // recibido algo" o no.
  const fetchEmailStatsForAccount = useCallback(async (accountId: string) => {
    try {
      const token = await getToken({ skipCache: true });
      const param = emailAccountQueryParam(accountId);
      const url = `/api/email/stats${param ? `?${param}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const d = await safeJson(res);
      if (res.ok) {
        const stats = d.data || {};
        setEmailStats(prev => ({
          ...prev,
          inbox: Number(stats.inbox || 0),
          unread: Number(stats.unread || 0),
          drafts: Number(stats.drafts || 0),
        }));
      }
    } catch {/* */}
  }, [getToken, emailAccountQueryParam]);

  // Al elegir una cuenta en el selector (o al resolverse la selección por
  // defecto tras cargar), refrescar el contador de no-leídos de esa cuenta
  // en concreto.
  useEffect(() => {
    if (!selectedEmailAccountId) return;
    void fetchEmailStatsForAccount(selectedEmailAccountId);
  }, [selectedEmailAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Perfiles de Gmail para el selector -- petición propia e independiente
  // del resto de fetchData() (14 llamadas en paralelo): si esa petición
  // conjunta tarda, falla o se reintenta, esto no depende de ella para
  // aparecer, y si esta en concreto falla no arrastra a nada más.
  const [gmailProfilesDebug, setGmailProfilesDebug] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;

    const attempt = async (retry: boolean): Promise<void> => {
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch('/api/email/profiles?provider=google', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await safeJson(res);
        if (cancelled) return;
        if (res.ok) {
          setGmailProfilesRaw(Array.isArray(d.data) ? d.data : []);
          setGmailProfilesDebug(Array.isArray(d.data) && d.data.length === 0 ? 'La cuenta respondió pero sin ninguna cuenta de Gmail para esta organización.' : null);
        } else {
          // Visible directamente en el widget -- así se ve el motivo real sin
          // tener que abrir herramientas de desarrollador.
          setGmailProfilesDebug(`No se pudo cargar Gmail (HTTP ${res.status}): ${d?.error || 'sin detalle'}`);
        }
      } catch (e: any) {
        // "Failed to fetch" suele ser un hiccup puntual de red -- se
        // reintenta una vez a los 2s antes de darlo por perdido.
        if (cancelled) return;
        if (retry) { setTimeout(() => void attempt(false), 2000); return; }
        setGmailProfilesDebug(`No se pudo cargar Gmail: ${e?.message || 'error de red'}`);
      }
    };

    void attempt(true);
    return () => { cancelled = true; };
  }, [getToken]);

  // Selección por defecto (la primera cuenta disponible, sea IMAP o Gmail)
  // en cuanto se resuelve el listado combinado -- ya no depende de en qué
  // orden lleguen las dos peticiones (IMAP vs Gmail).
  useEffect(() => {
    if (!selectedEmailAccountId && emailAccounts.length > 0) {
      setSelectedEmailAccountId(emailAccounts[0].id);
    }
  }, [emailAccounts, selectedEmailAccountId]);

  useEffect(() => {
    setEmailStats(prev => ({ ...prev, cuentas: emailAccounts.length }));
  }, [emailAccounts.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emailMenuRef.current && !emailMenuRef.current.contains(e.target as Node)) {
        setOpenMenuEmailId(null);
      }
      if (emailAccountMenuRef.current && !emailAccountMenuRef.current.contains(e.target as Node)) {
        setEmailAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markEmailRead = useCallback(async (msgId: string) => {
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/email/messages/${msgId}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      setEmailMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_read: true } : m));
      setEmailStats(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
    } catch {/* */}
  }, [getToken]);

  // Vista previa sin salir del dashboard -- GET /messages/:id ya marca el
  // correo como leído en servidor (igual que abrirlo en la bandeja normal),
  // así que se replica ese efecto en el estado local de la tarjeta.
  const openEmailPreview = useCallback(async (msg: any) => {
    setOpenMenuEmailId(null);
    setPreviewEmailId(msg.id);
    setPreviewEmailData(null);
    setPreviewLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/email/messages/${msg.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await safeJson(res);
      if (res.ok) {
        setPreviewEmailData(d.data);
        if (!msg.is_read) {
          setEmailMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
          setEmailStats(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
        }
      }
    } catch {/* */} finally {
      setPreviewLoading(false);
    }
  }, [getToken]);

  const closeEmailPreview = useCallback(() => {
    setPreviewEmailId(null);
    setPreviewEmailData(null);
  }, []);

  const deleteEmailMsg = useCallback(async (msg: any) => {
    setOpenMenuEmailId(null);
    setDeletingEmailId(msg.id);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/email/messages/${msg.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setEmailMessages(prev => prev.filter(m => m.id !== msg.id));
        setEmailStats(prev => ({
          ...prev,
          inbox: Math.max(0, prev.inbox - 1),
          unread: msg.is_read ? prev.unread : Math.max(0, prev.unread - 1),
        }));
        setPreviewEmailId(cur => cur === msg.id ? null : cur);
        setPreviewEmailData((cur: any) => cur?.id === msg.id ? null : cur);
      }
    } catch {/* */} finally {
      setDeletingEmailId(null);
    }
  }, [getToken]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(() => fetchData(true), { intervalMs: 20_000 });

  // Tesorería (widget "Facturación") solo cuenta como "visible" para el
  // reparto en columnas si el usuario es admin -- igual que antes.
  const effectiveVisible = useMemo(
    () => visibleWidgets.filter(id => id !== "facturacion" || isAdmin),
    [visibleWidgets, isAdmin],
  );
  const effectiveVisibleKey = effectiveVisible.join(",");
  useEffect(() => {
    setColumns(prev => {
      const next = reconcileColumns(prev, effectiveVisible);
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
      return next;
    });
    // effectiveVisible se recalcula cada render -- se compara por su
    // contenido (la key) para no reconciliar en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveVisibleKey]);

  // ── DnD (masonry: reordenar dentro de una columna y mover entre columnas) ──
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function findColumnIndex(id: string, cols: string[][]): number {
    return cols.findIndex(col => col.includes(id));
  }

  function handleDragStart(e: DragStartEvent) {
    wasDragging.current = false;
    setActiveId(e.active.id as string);
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId_ = active.id as string;
    const overId = over.id as string;
    if (activeId_ === overId) return;

    setColumns(prev => {
      const fromCol = findColumnIndex(activeId_, prev);
      let toCol = findColumnIndex(overId, prev);
      if (toCol === -1) {
        // El cursor está sobre una columna vacía (o el hueco tras su última
        // tarjeta), no sobre otra tarjeta -- over.id es entonces el id de la
        // propia columna (ver MasonryColumn).
        const idx = prev.findIndex((_, i) => `col-${i}` === overId);
        toCol = idx;
      }
      if (fromCol === -1 || toCol === -1 || fromCol === toCol) return prev;

      const next = prev.map(col => [...col]);
      next[fromCol].splice(next[fromCol].indexOf(activeId_), 1);
      const overIndexInCol = next[toCol].indexOf(overId);
      next[toCol].splice(overIndexInCol >= 0 ? overIndexInCol : next[toCol].length, 0, activeId_);
      return next;
    });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const activeId_ = active.id as string;
    const overId = over.id as string;
    if (activeId_ === overId) return;

    wasDragging.current = true;
    setColumns(prev => {
      const fromCol = findColumnIndex(activeId_, prev);
      const toCol = findColumnIndex(overId, prev);
      let next = prev;
      if (fromCol !== -1 && toCol === fromCol) {
        const col = prev[fromCol];
        next = prev.map((c, i) => i === fromCol
          ? arrayMove(col, col.indexOf(activeId_), col.indexOf(overId))
          : c);
      }
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
      return next;
    });
    setTimeout(() => { wasDragging.current = false; }, 200);
  }

  function goTo(path: string) { if (!wasDragging.current) navigate(path); }

  const orderedVisible = effectiveVisible;
  // Para pantallas < 768px, un único carril con todas las tarjetas en el
  // mismo orden en que aparecen las columnas -- ahí no hace falta (ni se
  // ofrece) arrastrar para reordenar, ver comentario en isDesktopMasonry.
  const flatMobileOrder = columns.flat().filter(id => effectiveVisible.includes(id));

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
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {handle}
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <Calendar size={15} className="text-[#ab0433]" />
              </div>
              <h2 className="font-semibold text-slate-800 text-base">Próximas citas</h2>
            </div>
            <Link to="/dashboard/agenda" onClick={e => e.stopPropagation()} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5">
              Ver agenda <ChevronRight size={11} />
            </Link>
          </div>
          {agendaLoading ? (
            <div className="flex items-center justify-center py-8"><Spinner size="sm" muted /></div>
          ) : agendaEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-300">
              <Calendar size={28} className="opacity-30" />
              <p className="text-sm font-medium text-slate-500">Sin próximas citas</p>
              <Link to="/dashboard/agenda" className="text-xs font-bold text-indigo-500 hover:underline">+ Crear evento</Link>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {agendaEvents.map((ev: any, idx: number) => {
                const badge = EVENT_BADGE[ev.type] || EVENT_BADGE.otro;
                const d = new Date(ev.start_at);
                const month = d.toLocaleDateString("es-ES", { month: "short" }).toUpperCase().replace(".", "");
                const day = d.getDate();
                const timeStr = ev.all_day
                  ? "Todo el día"
                  : ev.end_at
                    ? `${fmtTime(ev.start_at)} - ${fmtTime(ev.end_at)}`
                    : fmtTime(ev.start_at);
                const isFirst = idx === 0;
                return (
                  <div key={ev.id} onClick={() => goTo("/dashboard/agenda")} className="flex items-start gap-4 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                    <div className={`flex-none min-w-[56px] py-2 rounded-md flex flex-col items-center justify-center ${isFirst ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
                      <span className="text-[9px] font-bold uppercase leading-none">{month}</span>
                      <span className="text-base font-bold leading-tight mt-0.5">{day}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{ev.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 truncate flex items-center gap-1">
                        ⏰ {timeStr}{ev.location ? ` · ${ev.location}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full ${badge.color}`}>{badge.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );

      case "tareas": return (
        <div onClick={() => goTo("/dashboard/tareas")} className="cursor-pointer group">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300 transition-colors">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {handle}
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={14} className="text-[#ab0433]" />
                </div>
                <h3 className="font-semibold text-slate-800 text-base">Tareas</h3>
              </div>
              <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
            </div>
            <div className="p-4 grid grid-cols-2 gap-3 mb-1">
              <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-4">
                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-2">Vencidas</p>
                <p className={`text-4xl font-black leading-none ${taskStats.vencidas>0?"text-rose-600":"text-slate-200"}`}>{taskStats.vencidas}</p>
                <p className="text-[10px] text-rose-300 mt-2">revisar hoy</p>
              </div>
              <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4">
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-2">Próximas</p>
                <p className={`text-4xl font-black leading-none ${taskStats.proximas>0?"text-amber-500":"text-slate-200"}`}>{taskStats.proximas}</p>
                <p className="text-[10px] text-amber-300 mt-2">esta semana</p>
              </div>
            </div>
            <div className="grid grid-cols-3 border-t border-slate-100">
              <div className="p-4 text-center border-r border-slate-100 hover:bg-slate-50 transition-colors">
                <p className="text-lg font-bold text-slate-700">{taskStats.urgentes}</p>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Urgentes</p>
              </div>
              <div className="p-4 text-center border-r border-slate-100 hover:bg-slate-50 transition-colors">
                <p className="text-lg font-bold text-slate-700">{taskStats.pendientes}</p>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Pendientes</p>
              </div>
              <div className="p-4 text-center hover:bg-slate-50 transition-colors">
                <p className="text-lg font-bold text-emerald-500">{taskStats.completadas}</p>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Hechas</p>
              </div>
            </div>
          </div>
        </div>
      );

      case "actividad": return (
        <div onClick={() => goTo("/dashboard/trazabilidad")} className="cursor-pointer group bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300 transition-colors">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {handle}
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <RefreshCw size={13} className="text-[#ab0433]" />
              </div>
              <h3 className="font-semibold text-slate-800 text-base">Actividad reciente</h3>
            </div>
            <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
          </div>
          {actLoading ? (
            <div className="flex items-center justify-center py-8"><Spinner size="sm" muted /></div>
          ) : activity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-8 gap-3 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center">
                <History size={24} className="text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">No hay actividad reciente</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">Los movimientos de tus expedientes, tareas completadas y nuevos documentos aparecerán aquí.</p>
              </div>
              <button onClick={() => goTo("/dashboard/trazabilidad")} className="mt-1 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                Ver historial completo
              </button>
            </div>
          ) : (
            <>
            <div className="grid grid-cols-2 border-b border-slate-100">
              <div className="px-5 py-4 border-r border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Movimientos</p>
                <p className="mt-1 text-xl font-bold text-slate-800">{activityTotal}</p>
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
        <div onClick={() => goTo("/dashboard/expedientes")} className="cursor-pointer group bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300 transition-colors">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {handle}
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <Briefcase size={14} className="text-[#ab0433]" />
              </div>
              <h3 className="font-semibold text-slate-800 text-base">Expedientes</h3>
            </div>
            <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
          </div>
          <div className="px-5 py-4">
            <p className="text-xs text-slate-500">Accede a todos tus expedientes abiertos y activos desde aquí.</p>
          </div>
        </div>
      );

      case "clientes": return (
        <div onClick={() => goTo("/dashboard/clientes")} className="cursor-pointer group bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300 transition-colors">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {handle}
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <Users size={14} className="text-[#ab0433]" />
              </div>
              <h3 className="font-semibold text-slate-800 text-base">Clientes</h3>
            </div>
            <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-100">
            <div className="bg-white px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fichas</p>
              <p className="mt-1 text-xl font-bold text-slate-800">{clientStats.total}</p>
            </div>
            <div className="bg-white px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Activos</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">{clientStats.activos}</p>
            </div>
            <div className="bg-white px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Con email</p>
              <p className="mt-1 text-lg font-bold text-slate-700">{clientStats.conEmail}</p>
            </div>
            <div className="bg-white px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Con teléfono</p>
              <p className="mt-1 text-lg font-bold text-slate-700">{clientStats.conTelefono}</p>
            </div>
          </div>
        </div>
      );

      case "chat": return (
        <div onClick={() => goTo("/dashboard/chat")} className="cursor-pointer group bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300 transition-colors">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {handle}
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <MessageSquare size={14} className="text-[#ab0433]" />
              </div>
              <h3 className="font-semibold text-slate-800 text-base">Chat interno</h3>
            </div>
            <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
          </div>
          <div className="grid grid-cols-3">
            <div className="px-5 py-4 border-r border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Canales</p>
              <p className="mt-1 text-xl font-bold text-slate-800">{chatStats.canales}</p>
            </div>
            <div className="px-5 py-4 border-r border-slate-100 bg-violet-50/50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">No leídos</p>
              <p className="mt-1 text-xl font-bold text-violet-700">{chatStats.noLeidos}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">DM</p>
              <p className="mt-1 text-xl font-bold text-slate-700">{chatStats.directos}</p>
            </div>
          </div>
        </div>
      );

      case "whatsapp": return (
        <div onClick={() => goTo("/dashboard/whatsapp")} className="cursor-pointer group bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300 transition-colors">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {handle}
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <MessageCircle size={14} className="text-[#ab0433]" />
              </div>
              <h3 className="font-semibold text-slate-800 text-base">WhatsApp</h3>
            </div>
            <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Estado</p>
                <p className={`mt-1 text-sm font-bold ${waStats.configurado ? "text-emerald-600" : "text-slate-500"}`}>
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
                <p className="mt-1 text-lg font-bold text-slate-800">{waStats.programados}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Origen</p>
                <p className="mt-1 text-sm font-bold text-slate-700">{waStats.origen}</p>
              </div>
            </div>
          </div>
        </div>
      );

      case "correo": return (
        <div className="group bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {handle}
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <Mail size={14} className="text-[#ab0433]" />
              </div>
              <h3 className="font-semibold text-slate-800 text-base shrink-0">Correo</h3>
              {emailStats.unread > 0 && (
                <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                  {emailStats.unread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {emailAccounts.length > 0 && (
                <div className="relative" ref={emailAccountMenuRef} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setEmailAccountMenuOpen((v) => !v)}
                    className="bg-white border border-slate-200 hover:border-slate-300 rounded-full px-3 py-1 flex items-center gap-1.5 transition-colors"
                  >
                    <span className="text-[10px] font-medium text-slate-600 truncate max-w-[130px]">
                      {emailAccounts.find((a: any) => a.id === selectedEmailAccountId)?.label || "Cuenta"}
                    </span>
                    <ChevronDown size={9} className={`text-slate-400 transition-transform ${emailAccountMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {emailAccountMenuOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-56 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl z-30 py-1.5">
                      {emailAccounts.map((acc: any) => {
                        const label = acc.label || "Cuenta";
                        const active = acc.id === selectedEmailAccountId;
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => {
                              setSelectedEmailAccountId(acc.id);
                              fetchEmailMessages(acc.id);
                              setEmailAccountMenuOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-xs transition-colors ${
                              active ? "text-blue-700 font-semibold bg-blue-50/60" : "text-slate-600 hover:bg-slate-50 font-medium"
                            }`}
                          >
                            <span className="truncate">{label}</span>
                            {active && <Check size={13} className="shrink-0 text-blue-600" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              <ChevronRight size={14} onClick={() => goTo("/dashboard/correo")} className="cursor-pointer text-slate-300 group-hover:text-red-500 transition-colors" />
            </div>
          </div>
          {gmailProfilesDebug && (
            <p className="px-4 py-1.5 text-[10px] text-amber-600 bg-amber-50 border-b border-amber-100">
              {gmailProfilesDebug}
            </p>
          )}
          {emailMsgLoading ? (
            <div className="flex items-center justify-center py-8"><Spinner size="sm" muted /></div>
          ) : emailMessages.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">Sin mensajes recientes</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100/80" ref={emailMenuRef}>
              {emailMessages.slice(0, 5).map((msg: any, i: number) => (
                <div
                  key={i}
                  className={`group relative flex cursor-pointer items-start gap-3.5 p-4 pr-9 hover:bg-slate-50 transition-colors ${!msg.is_read ? "bg-blue-50/20" : ""} ${deletingEmailId === msg.id ? "opacity-40 pointer-events-none" : ""}`}
                  onClick={() => openEmailPreview(msg)}
                >
                  {!msg.is_read && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500" />}
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${!msg.is_read ? "bg-blue-500 shadow-sm shadow-blue-500/30" : "bg-slate-200 border border-slate-300"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <h4 className={`truncate text-[13px] pr-2 ${!msg.is_read ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>
                        {msg.from_name || msg.from_email || "Desconocido"}
                      </h4>
                      <span className={`shrink-0 whitespace-nowrap text-[10px] ${!msg.is_read ? "font-bold text-blue-600" : "font-medium text-slate-400"}`}>
                        {msg.sent_at ? timeAgo(msg.sent_at) : ""}
                      </span>
                    </div>
                    <p className={`truncate text-xs ${!msg.is_read ? "font-medium text-slate-800" : "text-slate-500"}`}>
                      {msg.subject || "(Sin asunto)"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setOpenMenuEmailId(openMenuEmailId === msg.id ? null : msg.id); }}
                    className="absolute right-2 top-3 rounded-lg p-1 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-500 group-hover:opacity-100"
                  >
                    <MoreHorizontal size={15} />
                  </button>

                  {openMenuEmailId === msg.id && (
                    <div
                      className="absolute right-3 top-8 z-30 w-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        onClick={() => openEmailPreview(msg)}
                      >
                        <Eye size={13} className="text-slate-400" /> Vista previa
                      </button>
                      <button
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        onClick={() => { setOpenMenuEmailId(null); navigate(`/dashboard/correo?openEmail=${msg.id}`); }}
                      >
                        <ExternalLink size={13} className="text-slate-400" /> Ver correo
                      </button>
                      <button
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        onClick={() => { setOpenMenuEmailId(null); navigate(`/dashboard/correo?openEmail=${msg.id}&reply=1`); }}
                      >
                        <Reply size={13} className="text-slate-400" /> Responder
                      </button>
                      {!msg.is_read && (
                        <button
                          className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                          onClick={() => { setOpenMenuEmailId(null); markEmailRead(msg.id); }}
                        >
                          <MailOpen size={13} className="text-slate-400" /> Marcar como leído
                        </button>
                      )}
                      <button
                        className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                        onClick={() => deleteEmailMsg(msg)}
                      >
                        <Trash2 size={13} /> Eliminar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => goTo("/dashboard/correo")}
            className="mt-auto px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-blue-600 uppercase tracking-wider transition-colors"
          >
            Abrir bandeja de entrada <ArrowRight size={11} />
          </button>
        </div>
      );

      case "documental": return (
        <div onClick={() => goTo("/dashboard/documental")} className="cursor-pointer group bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300 transition-colors">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {handle}
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <Library size={14} className="text-[#ab0433]" />
              </div>
              <h3 className="font-semibold text-slate-800 text-base">Documental</h3>
            </div>
            <ChevronRight size={14} className="text-slate-300 group-hover:text-red-500 transition-colors" />
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fuentes</p>
                <p className="mt-1 text-xl font-bold text-slate-800">{docStats.providers}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Activas</p>
                <p className="mt-1 text-xl font-bold text-emerald-600">{docStats.activos}</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
              LexNET: <span className={`font-bold ${docStats.lexnet ? "text-emerald-600" : "text-amber-600"}`}>{docStats.lexnet ? "preparado" : "pendiente"}</span>
            </div>
          </div>
        </div>
      );

      case "facturacion": return (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 shrink-0">
              {handle}
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                <Receipt size={14} className="text-[#ab0433]" />
              </div>
              <h3 className="font-semibold text-slate-800 text-base">Facturación</h3>
            </div>
            <div className="flex items-center gap-1.5 justify-end">
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
              <button
                onClick={() => goTo("/dashboard/facturacion")}
                className="flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-600 px-2 py-1 text-[11px] font-bold text-slate-600 transition-colors"
              >
                Ver <ChevronRight size={11} />
              </button>
            </div>
          </div>
          {/* Body */}
          {billingError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <p className="text-xs text-slate-500">No se pudieron cargar los datos de facturación.</p>
              <button
                onClick={retryBilling}
                disabled={billingRetrying}
                className="flex items-center gap-1.5 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-600 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition-colors disabled:opacity-50"
              >
                {billingRetrying ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                Reintentar
              </button>
            </div>
          ) : !billingCalc ? (
            <div className="flex items-center justify-center py-8"><Spinner size="sm" muted /></div>
          ) : (
            <div className="p-4">
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 mb-1">Ingresos</p>
                  <p className="text-sm font-bold text-emerald-600 leading-tight">{fmtEur(billingCalc.ingresos)}</p>
                  <p className="text-[10px] text-slate-400 mt-1.5">IVA {fmtEur(billingCalc.ivaIng)}</p>
                  <p className="text-[10px] text-slate-400">IRPF 0,00 €</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 mb-1">Gastos</p>
                  <p className="text-sm font-bold text-red-500 leading-tight">{fmtEur(billingCalc.gastosTot)}</p>
                  <p className="text-[10px] text-slate-400 mt-1.5">IVA {fmtEur(billingCalc.ivaGas)}</p>
                  <p className="text-[10px] text-slate-400">IRPF 0,00 €</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 mb-1">Total</p>
                  <p className={`text-sm font-bold leading-tight ${billingCalc.total>=0?"text-slate-800":"text-red-600"}`}>{fmtEur(billingCalc.total)}</p>
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
    <div className="space-y-6">

      {/* CABECERA */}
      <div className="relative z-20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 anim-fade-up">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
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
          <p className="text-sm text-slate-500 mt-1 capitalize">
            {new Date().toLocaleDateString("es-ES", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
          </p>
        </div>
        <div className="flex gap-2 items-center">

          {/* Nuevo Cliente */}
          <div className="relative" ref={clienteMenuRef}>
            <button onClick={() => setShowClienteMenu(v => !v)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold text-sm shadow-sm border transition-all select-none ${showClienteMenu?"bg-slate-100 text-slate-800 border-slate-300":"bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
              <Plus size={15} /> Nuevo Cliente <ChevronDown size={13} className={`transition-transform ${showClienteMenu?"rotate-180":""}`} />
            </button>
            {showClienteMenu && (
              <div className="absolute left-0 top-full z-50 mt-2 w-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/40">
                <div className="border-b border-slate-100 px-5 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Alta de clientes</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">Elige cómo quieres agregar clientes</h3>
                </div>
                <div className="px-3 py-3">
                  {[
                    { label:"Crear manualmente", desc:"Crea un cliente desde cero introduciendo sus datos manualmente.", icon:<Plus size={17}/>, cls:"bg-emerald-100 text-emerald-600", to:"/dashboard/clientes/new" },
                    { label:"Con DNI", desc:"Sube anverso y reverso del DNI para rellenar la ficha automáticamente.", icon:<ScanLine size={17}/>, cls:"bg-blue-100 text-blue-600", to:"/dashboard/clientes/new?mode=dni" },
                    { label:"Con enlace", desc:"Genera un enlace para que el cliente rellene sus datos directamente.", icon:<ExternalLink size={17}/>, cls:"bg-amber-100 text-amber-600", to:"/dashboard/clientes/invitar" },
                    { label:"Importar CSV", desc:"Sube un archivo CSV con múltiples clientes a la vez.", icon:<FileSpreadsheet size={17}/>, cls:"bg-sky-100 text-sky-700", to:"/dashboard/clientes/importar-csv" },
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
            <button onClick={() => setShowAltaMenu(v => !v)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold text-sm shadow-md shadow-red-200 transition-all select-none ${showAltaMenu?"bg-red-800 text-white":"bg-red-600 hover:bg-red-700 text-white"}`}>
              <Plus size={15} /> Nuevo Expediente <ChevronDown size={13} className={`transition-transform ${showAltaMenu?"rotate-180":""}`} />
            </button>
            {showAltaMenu && (
              <div className="absolute right-0 top-full z-50 mt-2 w-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/40">
                <div className="border-b border-slate-100 px-5 py-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Alta de expedientes</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-900">Elige cómo quieres agregar expedientes</h3>
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
            <button onClick={() => setShowDotsMenu(v => !v)} title="Más opciones" className={`flex items-center justify-center h-9 w-9 rounded-lg border transition-all ${showDotsMenu?"bg-slate-100 border-slate-300 text-slate-800":"bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
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
      ) : !isDesktopMasonry ? (
        // < 768px: un solo carril, sin drag-and-drop (con una única columna
        // no hay huecos que evitar ni filas que desalinear).
        <div className="flex flex-col gap-4">
          {flatMobileOrder.map((id, idx) => (
            <div key={id} className="anim-fade-up" style={{ animationDelay: `${Math.min(idx, 8) * 70}ms` }}>
              {renderWidget(id, null)}
            </div>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} autoScroll={false}>
          <div className={`grid gap-4 items-start grid-cols-1 ${isCollapsed ? "lg:grid-cols-3" : "xl:grid-cols-3"} md:grid-cols-2`}>
            {columns.map((col, colIdx) => (
              <MasonryColumn key={`col-${colIdx}`} id={`col-${colIdx}`} items={col}>
                {col.map((id, idx) => (
                  <SortableWidget key={id} id={id} animDelay={Math.min(colIdx + idx, 8) * 70}>
                    {(handle) => renderWidget(id, handle)}
                  </SortableWidget>
                ))}
              </MasonryColumn>
            ))}
          </div>
          <DragOverlay>
            {activeId ? (
              <div className="rounded-xl shadow-2xl shadow-slate-900/20 rotate-1">
                {renderWidget(activeId, null)}
              </div>
            ) : null}
          </DragOverlay>
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
        <WidgetPickerModal visible={visibleWidgets} isAdmin={isAdmin} onClose={() => setShowWidgetPicker(false)} onSave={saveVisible} />
      )}

      {previewEmailId && (
        <EmailPreviewModal
          data={previewEmailData}
          loading={previewLoading}
          deleting={deletingEmailId === previewEmailId}
          onClose={closeEmailPreview}
          onReply={() => { const id = previewEmailId; closeEmailPreview(); navigate(`/dashboard/correo?openEmail=${id}&reply=1`); }}
          onOpenFull={() => { const id = previewEmailId; closeEmailPreview(); navigate(`/dashboard/correo?openEmail=${id}`); }}
          onDelete={() => deleteEmailMsg({ id: previewEmailId, is_read: true })}
        />
      )}
    </div>
  );
}
