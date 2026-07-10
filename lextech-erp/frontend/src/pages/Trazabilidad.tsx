import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Spinner } from "../components/Spinner";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import {
  History, RefreshCw, User, AlertCircle, Search, X,
  Users, Activity, Filter,
  ExternalLink, LogIn, LogOut, Server, Shield, Eye,
  Upload, Download, Plus, Edit2, Trash2, Globe,
  FolderOpen, UserPlus, Monitor,
} from "lucide-react";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface UserSummary {
  user_id: string;
  user_name: string;
  total_actions: number;
  total_logins: number;
  total_logouts: number;
  last_action_at: string;
  first_action_at: string;
  last_login_at: string | null;
  last_ip: string | null;
  last_device_id: string | null;
  event_types: string[] | null;
  entity_types: string[] | null;
}

interface ActivityItem {
  id: string;
  user_id: string;
  user_name: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  event_type: string;
  ip_address: string | null;
  session_id: string | null;
  user_agent: string | null;
  device_id: string | null;
  created_at: string;
}

type TimelineEntry =
  | { type: "separator"; label: string; key: string }
  | { type: "item"; data: ActivityItem };

// ── Helpers de tiempo ─────────────────────────────────────────────────────────
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h}h`;
  const days = Math.floor(h / 24);
  return `Hace ${days}d`;
}
function fmtFull(d: string) {
  return new Date(d).toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}
function initials(n: string) {
  return n.split(/[\s_]+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
}
function isOnlineNow(lastActionAt: string) {
  return Date.now() - new Date(lastActionAt).getTime() < 15 * 60 * 1000;
}

// ── Avatar colors ─────────────────────────────────────────────────────────────
const COLORS = [
  { bg: "bg-indigo-100", text: "text-indigo-600", border: "border-indigo-200" },
  { bg: "bg-rose-100",   text: "text-rose-600",   border: "border-rose-200"   },
  { bg: "bg-sky-100",    text: "text-sky-600",     border: "border-sky-200"   },
  { bg: "bg-emerald-100",text: "text-emerald-600", border: "border-emerald-200"},
  { bg: "bg-amber-100",  text: "text-amber-600",   border: "border-amber-200" },
  { bg: "bg-violet-100", text: "text-violet-600",  border: "border-violet-200"},
  { bg: "bg-teal-100",   text: "text-teal-600",    border: "border-teal-200"  },
  { bg: "bg-orange-100", text: "text-orange-600",  border: "border-orange-200"},
];
function colorIdx(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % COLORS.length;
}

// ── UA parsing ────────────────────────────────────────────────────────────────
function parseBrowser(ua: string | null): string | null {
  if (!ua) return null;
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua)) return "Safari";
  return null;
}
function parseOS(ua: string | null): string | null {
  if (!ua) return null;
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  return null;
}

// ── Event config ──────────────────────────────────────────────────────────────
interface EventConfig {
  nodeBg: string;
  nodeText: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  isError?: boolean;
}

function getEventConfig(item: ActivityItem): EventConfig {
  const et = item.event_type;
  const etype = item.entity_type?.toUpperCase() || "";
  switch (et) {
    case "LOGIN":
      return { nodeBg: "bg-emerald-100", nodeText: "text-emerald-600", Icon: LogIn,    title: "Inicio de sesión exitoso" };
    case "LOGOUT":
      return { nodeBg: "bg-orange-100",  nodeText: "text-orange-500",  Icon: LogOut,   title: "Cierre de sesión" };
    case "AUTH_ERROR":
      return { nodeBg: "bg-red-100",     nodeText: "text-red-600",     Icon: Shield,   title: "Intento de acceso denegado", isError: true };
    case "SERVER_START":
      return { nodeBg: "bg-blue-100",    nodeText: "text-blue-600",    Icon: Server,   title: "Servidor iniciado" };
    case "CREATE":
      if (etype === "CLIENT")     return { nodeBg: "bg-purple-100", nodeText: "text-purple-600", Icon: UserPlus,    title: "Nuevo cliente creado" };
      if (etype === "EXPEDIENTE") return { nodeBg: "bg-blue-100",   nodeText: "text-blue-600",   Icon: FolderOpen,  title: "Nuevo expediente creado" };
      return { nodeBg: "bg-emerald-100", nodeText: "text-emerald-600", Icon: Plus, title: item.action_type || "Creación" };
    case "UPDATE":
      if (etype === "EXPEDIENTE") return { nodeBg: "bg-blue-100",   nodeText: "text-blue-600",   Icon: FolderOpen, title: "Expediente modificado" };
      if (etype === "CLIENT")     return { nodeBg: "bg-indigo-100", nodeText: "text-indigo-600", Icon: Edit2,      title: "Cliente modificado" };
      return { nodeBg: "bg-yellow-100", nodeText: "text-yellow-600", Icon: Edit2, title: item.action_type || "Modificación" };
    case "DELETE":
      return { nodeBg: "bg-red-100",    nodeText: "text-red-600",    Icon: Trash2,   title: item.action_type || "Eliminación", isError: true };
    case "EXPORT":
      return { nodeBg: "bg-violet-100", nodeText: "text-violet-600", Icon: Download, title: "Exportación de datos" };
    case "DOWNLOAD":
      return { nodeBg: "bg-slate-200",  nodeText: "text-slate-600",  Icon: Download, title: "Descarga de archivo" };
    case "UPLOAD":
      return { nodeBg: "bg-teal-100",   nodeText: "text-teal-600",   Icon: Upload,   title: "Subida de archivo" };
    case "VIEW":
      return { nodeBg: "bg-slate-100",  nodeText: "text-slate-500",  Icon: Eye,      title: "Consulta" };
    default:
      return { nodeBg: "bg-slate-100",  nodeText: "text-slate-500",  Icon: Activity, title: item.action_type || "Acción" };
  }
}

// ── Entity nav map ─────────────────────────────────────────────────────────────
const ENTITY_ROUTE: Record<string, string> = {
  CLIENT: "/dashboard/clientes",
  EXPEDIENTE: "/dashboard/expedientes",
};
const ENTITY_COLOR: Record<string, string> = {
  CLIENT:     "bg-purple-50 text-purple-700 hover:bg-purple-100",
  EXPEDIENTE: "bg-blue-50 text-blue-700 hover:bg-blue-100",
};

// ── Filtros ───────────────────────────────────────────────────────────────────
const EVENT_OPTS = [
  { value: "",             label: "Todos los eventos" },
  { value: "LOGIN",        label: "Solo logins"       },
  { value: "LOGOUT",       label: "Solo logouts"      },
  { value: "CREATE",       label: "Creaciones"        },
  { value: "UPDATE",       label: "Ediciones"         },
  { value: "DELETE",       label: "Borrados"          },
  { value: "EXPORT",       label: "Exportaciones"     },
  { value: "AUTH_ERROR",   label: "Errores de acceso" },
];
const ENTITY_OPTS = [
  { value: "",           label: "Todos los módulos" },
  { value: "CLIENT",     label: "Clientes"          },
  { value: "EXPEDIENTE", label: "Expedientes"       },
  { value: "FILE",       label: "Archivos"          },
];

// ═══════════════════════════════════════════════════════════════════════════════
export default function Trazabilidad() {
  const { getToken } = useAuth();
  const nav = useNavigate();

  const [users, setUsers]             = useState<UserSummary[]>([]);
  const [selected, setSelected]       = useState<UserSummary | null>(null);
  const [items, setItems]             = useState<ActivityItem[]>([]);
  const [total, setTotal]             = useState(0);
  const [loadUsers, setLoadUsers]     = useState(true);
  const [loadItems, setLoadItems]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch]           = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  const hdr = useCallback(async () => {
    const t = await getToken();
    return { Authorization: `Bearer ${t}` };
  }, [getToken]);

  // ── Fetch usuarios ──────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/activity/users", { headers: await hdr() });
    const d = await safeJson(res);
    if (res.ok) setUsers(d.data || []);
    setLoadUsers(false);
  }, [hdr]);

  // ── Fetch items de un usuario ───────────────────────────────────────────────
  const fetchItems = useCallback(async (
    userId: string,
    evType: string,
    offset: number,
    append = false
  ) => {
    if (append) setLoadingMore(true);
    else setLoadItems(true);
    const params = new URLSearchParams({ limit: "300", offset: String(offset) });
    if (evType) params.set("event_type", evType);
    const res = await fetch(`/api/activity/user/${userId}?${params}`, { headers: await hdr() });
    const d = await safeJson(res);
    if (res.ok) {
      const newItems: ActivityItem[] = d.data || [];
      setItems(prev => append ? [...prev, ...newItems] : newItems);
      setTotal(d.total ?? 0);
    }
    if (append) setLoadingMore(false);
    else setLoadItems(false);
  }, [hdr]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useAutoRefresh(fetchUsers, { intervalMs: 30000 });

  useEffect(() => {
    if (selected) fetchItems(selected.user_id, eventFilter, 0);
  }, [selected, eventFilter, fetchItems]);

  const filteredUsers = useMemo(() =>
    users.filter(u =>
      u.user_name.toLowerCase().includes(search.toLowerCase()) ||
      (u.last_ip || "").includes(search)
    ), [users, search]);

  const filteredItems = useMemo(() =>
    items.filter(i => {
      if (!entityFilter) return true;
      // Los archivos se registran como entity_type='CLIENT' (para que aparezcan en el
      // historial del cliente), nunca como 'FILE' — hay que detectarlos por el texto.
      if (entityFilter === "FILE") return /^(archivo|documento)/i.test(i.action_type || "");
      return i.entity_type === entityFilter;
    }),
    [items, entityFilter]);

  // ── Timeline con separadores de fecha ──────────────────────────────────────
  const timeline = useMemo<TimelineEntry[]>(() => {
    let lastDay = "";
    const entries: TimelineEntry[] = [];
    for (const item of filteredItems) {
      const d = new Date(item.created_at);
      const today = new Date();
      const yesterday = new Date(Date.now() - 86400000);
      let label: string;
      if (d.toDateString() === today.toDateString()) {
        label = "Hoy";
      } else if (d.toDateString() === yesterday.toDateString()) {
        label = `Ayer, ${d.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}`;
      } else {
        label = d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
      }
      if (label !== lastDay) {
        entries.push({ type: "separator", label, key: `sep-${label}-${item.id}` });
        lastDay = label;
      }
      entries.push({ type: "item", data: item });
    }
    return entries;
  }, [filteredItems]);

  const hasMore = items.length < total && items.length > 0;

  const handleSelect = (u: UserSummary) => {
    setSelected(prev => prev?.user_id === u.user_id ? null : u);
    setItems([]);
    setTotal(0);
  };

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#f4f6f8]">

      {/* HEADER DEL MÓDULO */}
      <div className="px-6 py-5 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center border border-red-100 shrink-0">
            <History size={18} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-800 leading-none tracking-tight mb-1">Trazabilidad</h1>
            <p className="text-xs font-medium text-slate-500">Auditoría completa de sesiones y acciones del sistema</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-md text-xs font-semibold text-slate-600 flex items-center gap-2">
            <Users size={13} /> {users.length} usuarios
          </div>
          <button
            onClick={fetchUsers}
            className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-2"
          >
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>
      </div>

      {/* SPLIT VIEW */}
      <main className="flex-1 flex overflow-hidden">

        {/* PANEL IZQUIERDO — Lista de usuarios */}
        <div className="w-80 shrink-0 flex flex-col bg-white border-r border-slate-200 z-10">

          {/* Buscador */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar usuario o IP..."
                className="block w-full pl-8 pr-8 py-2 bg-white border border-slate-200 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-colors shadow-sm"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadUsers && (
              <div className="flex items-center justify-center py-10">
                <Spinner size="sm" muted />
              </div>
            )}
            {!loadUsers && filteredUsers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <User size={28} className="text-slate-300" />
                <p className="text-sm text-slate-400">Sin actividad registrada</p>
              </div>
            )}
            {filteredUsers.map(u => {
              const ci = colorIdx(u.user_id);
              const col = COLORS[ci];
              const isActive = selected?.user_id === u.user_id;
              const online = isOnlineNow(u.last_action_at);
              return (
                <div
                  key={u.user_id}
                  onClick={() => handleSelect(u)}
                  className={`p-4 cursor-pointer relative group transition-colors ${isActive ? "bg-red-50/40" : "hover:bg-slate-50"}`}
                >
                  {/* Acento lateral rojo */}
                  {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600 rounded-r-sm" />}

                  <div className="flex gap-3 pl-2">
                    {/* Avatar con dot de estado */}
                    <div className="relative shrink-0">
                      <div className={`w-10 h-10 rounded-full ${col.bg} ${col.text} flex items-center justify-center font-bold text-sm border ${col.border}`}>
                        {initials(u.user_name)}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-white rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className={`text-sm font-bold truncate ${isActive ? "text-slate-900" : "text-slate-700 group-hover:text-slate-900"} transition-colors`}>
                        {u.user_name}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {u.total_actions} acciones · {u.total_logins} logins
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        {u.last_ip && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <Globe size={9} /> {u.last_ip}
                          </span>
                        )}
                        <span className={`text-[10px] font-medium ${online ? "text-emerald-600" : "text-slate-400"}`}>
                          {online ? "Activo ahora" : timeAgo(u.last_action_at)}
                        </span>
                      </div>
                    </div>

                    <svg
                      className={`w-3 h-3 text-slate-300 self-center shrink-0 transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PANEL DERECHO — Timeline */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#f4f6f8]">

          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-white">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
                <History size={28} className="text-slate-300" />
              </div>
              <p className="text-slate-500 font-semibold">Selecciona un usuario</p>
              <p className="text-slate-400 text-sm">para ver su historial completo de actividad</p>
            </div>
          ) : (
            <>
              {/* Cabecera del usuario seleccionado */}
              <div className="px-8 py-6 bg-white border-b border-slate-200 shrink-0 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-full ${COLORS[colorIdx(selected.user_id)].bg} ${COLORS[colorIdx(selected.user_id)].text} flex items-center justify-center font-bold text-xl shrink-0 border ${COLORS[colorIdx(selected.user_id)].border} shadow-sm`}>
                    {initials(selected.user_name)}
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2 leading-tight">
                      {selected.user_name}
                      {isOnlineNow(selected.last_action_at) && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase tracking-wider border border-emerald-200">
                          Online
                        </span>
                      )}
                    </h2>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                        <Activity size={11} className="text-amber-400" /> {selected.total_actions} acciones totales
                      </span>
                      <span className="text-slate-200">|</span>
                      <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
                        <LogIn size={11} /> {selected.total_logins} logins
                      </span>
                      <span className="text-slate-200">|</span>
                      <span className="text-xs font-semibold text-orange-500 flex items-center gap-1.5">
                        <LogOut size={11} /> {selected.total_logouts} logouts
                      </span>
                      {selected.last_ip && (
                        <>
                          <span className="text-slate-200">|</span>
                          <span className="text-xs text-slate-500 flex items-center gap-1.5 font-mono">
                            <Globe size={11} /> {selected.last_ip} (última)
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Barra de filtros */}
              <div className="px-8 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <Filter size={13} className="text-slate-400" />
                  <select
                    value={eventFilter}
                    onChange={e => setEventFilter(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300 appearance-none pr-7 cursor-pointer"
                    style={{ backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center", backgroundSize: "1em" }}
                  >
                    {EVENT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <select
                    value={entityFilter}
                    onChange={e => setEntityFilter(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-300 appearance-none pr-7 cursor-pointer"
                    style={{ backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center", backgroundSize: "1em" }}
                  >
                    {ENTITY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <span className="text-xs font-medium text-slate-500">Mostrando {filteredItems.length} de {total} registros</span>
              </div>

              {/* TIMELINE */}
              <div className="flex-1 overflow-y-auto p-8">
                {loadItems && (
                  <div className="flex items-center justify-center py-12">
                    <Spinner size="sm" muted />
                  </div>
                )}

                {!loadItems && filteredItems.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 gap-2">
                    <AlertCircle size={28} className="text-slate-300" />
                    <p className="text-sm text-slate-400">Sin registros para los filtros seleccionados</p>
                  </div>
                )}

                {!loadItems && timeline.length > 0 && (
                  <div className="max-w-4xl relative">
                    {/* Línea vertical continua */}
                    <div className="absolute left-[23px] top-4 bottom-16 w-0.5 bg-slate-200 rounded-full" />

                    <div className="flex flex-col gap-6">
                      {timeline.map(entry => {
                        if (entry.type === "separator") {
                          return (
                            <div key={entry.key} className="flex items-center justify-center my-2">
                              <span className="bg-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-wider py-1 px-4 rounded-full relative z-10">
                                {entry.label}
                              </span>
                            </div>
                          );
                        }

                        const item = entry.data;
                        const cfg = getEventConfig(item);
                        const browser = parseBrowser(item.user_agent);
                        const os = parseOS(item.user_agent);
                        const browserLabel = [browser, os].filter(Boolean).join(" / ");
                        const isRecent = Date.now() - new Date(item.created_at).getTime() < 3600000;
                        const entityRoute = item.entity_type ? ENTITY_ROUTE[item.entity_type.toUpperCase()] : null;
                        const entityColorCls = item.entity_type ? (ENTITY_COLOR[item.entity_type.toUpperCase()] || "bg-slate-100 text-slate-600 hover:bg-slate-200") : "";
                        const showDescription = !["LOGIN", "LOGOUT", "SERVER_START", "AUTH_ERROR"].includes(item.event_type) && item.action_type;

                        return (
                          <div key={item.id} className="relative flex items-start gap-6 group">
                            {/* Nodo del icono */}
                            <div className={`w-12 h-12 rounded-full ${cfg.nodeBg} ${cfg.nodeText} flex items-center justify-center shrink-0 border-4 border-[#f4f6f8] relative z-10 shadow-sm`}>
                              <cfg.Icon size={18} />
                            </div>

                            {/* Tarjeta del evento */}
                            <div className={`flex-1 bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow border ${cfg.isError ? "border-red-200" : "border-slate-200"}`}>
                              <div className="flex items-start justify-between gap-4 mb-1">
                                <h3 className={`text-sm font-bold ${cfg.isError ? "text-red-700" : "text-slate-800"}`}>
                                  {cfg.title}
                                </h3>
                                <span className="text-xs font-medium text-slate-400 shrink-0">
                                  {isRecent ? timeAgo(item.created_at) : fmtTime(item.created_at)}
                                </span>
                              </div>

                              {showDescription && (
                                <p className={`text-xs mt-1 ${cfg.isError ? "text-red-500/80" : "text-slate-500"}`}>
                                  {item.action_type}
                                </p>
                              )}

                              {/* Metadata chips */}
                              <div className={`flex flex-wrap items-center gap-2 mt-3 pt-3 border-t ${cfg.isError ? "border-red-50" : "border-slate-100"}`}>
                                {item.ip_address && (
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-semibold ${cfg.isError ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>
                                    <Globe size={10} /> {item.ip_address}
                                  </span>
                                )}
                                {browserLabel && (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold">
                                    <Monitor size={10} /> {browserLabel}
                                  </span>
                                )}
                                {item.entity_name && item.entity_id && entityRoute && (
                                  <button
                                    onClick={() => nav(`${entityRoute}/${item.entity_id}`)}
                                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold transition-colors ${entityColorCls}`}
                                  >
                                    <ExternalLink size={10} /> {item.entity_name}
                                  </button>
                                )}
                                {item.entity_name && (!item.entity_id || !entityRoute) && (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold">
                                    {item.entity_name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Botón cargar más */}
                      <div className="flex items-center justify-center mt-4 pb-8">
                        {hasMore ? (
                          <button
                            onClick={() => fetchItems(selected.user_id, eventFilter, items.length, true)}
                            disabled={loadingMore}
                            className="bg-white border border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold py-2 px-6 rounded-full relative z-10 shadow-sm transition-all disabled:opacity-60 flex items-center gap-2"
                          >
                            {loadingMore
                              ? <><RefreshCw size={12} className="animate-spin" /> Cargando...</>
                              : "Cargar registros anteriores"
                            }
                          </button>
                        ) : items.length > 0 && (
                          <span className="text-[11px] text-slate-400 relative z-10">
                            — Fin del historial —
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
