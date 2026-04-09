import React, { useEffect, useState, useCallback } from "react";
import { useUser, useAuth } from "@clerk/clerk-react";
import {
  Clock, Plus, CheckCircle2, Loader2, RefreshCw,
  ChevronRight, Calendar, MapPin, Video, Phone,
} from "lucide-react";
import { Link } from "react-router-dom";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";

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

// ── DashboardHome ────────────────────────────────────────────────────────────
export default function DashboardHome() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [activity,       setActivity]       = useState<any[]>([]);
  const [actLoading,     setActLoading]     = useState(true);
  const [agendaEvents,   setAgendaEvents]   = useState<any[]>([]);
  const [agendaLoading,  setAgendaLoading]  = useState(true);
  const [taskStats,      setTaskStats]      = useState({ vencidas: 0, proximas: 0 });

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) { setActLoading(true); setAgendaLoading(true); }
    try {
      const token = await getToken({ skipCache: true });
      const [actRes, agendaRes, tasksRes] = await Promise.all([
        fetch("/api/activity",               { headers: { Authorization: `Bearer ${token}` } }),
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
        const vencidas = tasks.filter((t: any) =>
          t.estado !== 'completado' && t.estado !== 'cancelado' &&
          t.plazo && new Date(t.plazo) < now
        ).length;
        const proximas = tasks.filter((t: any) =>
          t.estado !== 'completado' && t.estado !== 'cancelado' &&
          t.plazo && new Date(t.plazo) >= now && new Date(t.plazo) <= sevenDaysFromNow
        ).length;
        setTaskStats({ vencidas, proximas });
      }
    } catch (_e) {
    } finally {
      if (!silent) { setActLoading(false); setAgendaLoading(false); }
    }
  }, [getToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refrescar: cada 20s, al volver a pestaña, al reconectar
  useAutoRefresh(() => fetchData(true), { intervalMs: 20_000 });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* CABECERA */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Buenos días, <span className="text-red-600">{user?.firstName || "usuario"}</span>
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {new Date().toLocaleDateString("es-ES", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard/clientes/new">
            <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl hover:bg-slate-50 font-semibold text-sm shadow-sm">
              <Plus size={15} /> Nuevo Cliente
            </button>
          </Link>
          <Link
            to="/dashboard/expedientes?nuevo=1"
            className="flex items-center gap-2 bg-red-600 text-white px-3.5 py-2 rounded-xl hover:bg-red-700 font-semibold text-sm shadow-md shadow-red-200"
          >
            <Plus size={15} /> Nuevo Expediente
          </Link>
        </div>
      </div>

      {/* GRID PRINCIPAL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── AGENDA MINI ── (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Calendar size={17} className="text-red-500" /> Próximas citas
            </h2>
            <Link
              to="/dashboard/agenda"
              className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1"
            >
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
              <Link to="/dashboard/agenda" className="text-xs font-bold text-red-500 hover:underline">
                + Crear evento
              </Link>
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
                      <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-red-600 transition-colors">
                        {ev.title}
                      </p>
                      {ev.location && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Icon size={10} /> {ev.location}
                        </p>
                      )}
                    </div>
                    {isToday && (
                      <span className="shrink-0 text-[10px] font-bold text-red-500 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                        Hoy
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── COLUMNA DERECHA ── */}
        <div className="space-y-5">

          {/* WIDGET TAREAS */}
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
                  <p className={`text-4xl font-black leading-none ${taskStats.vencidas > 0 ? "text-red-600" : "text-red-300"}`}>
                    {taskStats.vencidas}
                  </p>
                  <p className="text-[10px] text-red-400 mt-1.5">tareas vencidas</p>
                </div>
                <div className="p-5 bg-orange-50">
                  <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-1">Próximas</p>
                  <p className={`text-4xl font-black leading-none ${taskStats.proximas > 0 ? "text-orange-500" : "text-orange-300"}`}>
                    {taskStats.proximas}
                  </p>
                  <p className="text-[10px] text-orange-400 mt-1.5">vencen en 7 días</p>
                </div>
              </div>
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-center">
                <span className="text-[11px] text-slate-400">Ver mis tareas y plazos →</span>
              </div>
            </div>
          </Link>

          {/* TRAZABILIDAD MINI */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Clock size={15} className="text-slate-400" /> Actividad
              </h3>
              <button onClick={() => fetchData()} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
                <RefreshCw size={12} />
              </button>
            </div>
            {actLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={18} className="animate-spin text-slate-300" />
              </div>
            ) : activity.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <p className="text-xs">Sin actividad todavía</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {activity.slice(0, 5).map((item: any) => (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <span className="text-sm">{actionIcon(item.action_type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{item.action_type}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {item.user_name && (
                          <span className="text-[10px] font-semibold text-red-500 shrink-0">{item.user_name}</span>
                        )}
                        {item.user_name && item.entity_name && <span className="text-slate-200 text-[10px]">·</span>}
                        {item.entity_name && <p className="text-[10px] text-slate-400 truncate">{item.entity_name}</p>}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(item.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
