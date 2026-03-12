import React, { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/clerk-react";
import {
  Clock, Plus, CheckCircle2, Loader2, RefreshCw,
  ChevronRight, Calendar, MapPin, Video, Phone,
} from "lucide-react";
import { Link } from "react-router-dom";
import { safeJson } from "../lib/api";

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

// ── Agenda placeholder ───────────────────────────────────────────────────────
const today = new Date();
const d = (offset: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
const fmt = (date: Date) => date.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });

const AGENDA_EVENTS = [
  { id: 1, date: d(0),  time: "10:00", title: "Reunión con cliente Martínez", type: "reunion",    place: "Sala A" },
  { id: 2, date: d(0),  time: "16:30", title: "Llamada Exp-0034 — parte contraria", type: "llamada", place: "Tel." },
  { id: 3, date: d(1),  time: "09:00", title: "Vista oral Juzgado 1ª Instancia nº5", type: "juicio",  place: "Juzgado" },
  { id: 4, date: d(2),  time: "12:00", title: "Firma de escritura notarial", type: "firma",    place: "Notaría" },
  { id: 5, date: d(3),  time: "11:30", title: "Videoconferencia perito económico", type: "video",    place: "Online" },
];

const EVENT_STYLES: Record<string, { color: string; icon: any }> = {
  reunion:  { color: "bg-blue-500",    icon: Clock },
  llamada:  { color: "bg-green-500",   icon: Phone },
  juicio:   { color: "bg-red-500",     icon: MapPin },
  firma:    { color: "bg-amber-500",   icon: CheckCircle2 },
  video:    { color: "bg-violet-500",  icon: Video },
};

function dayLabel(date: Date): string {
  const diff = Math.round((date.getTime() - today.setHours(0,0,0,0)) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return fmt(date);
}

// ── DashboardHome ────────────────────────────────────────────────────────────
export default function DashboardHome() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [activity, setActivity]     = useState<any[]>([]);
  const [actLoading, setActLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setActLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const res   = await fetch("/api/activity", { headers: { Authorization: `Bearer ${token}` } });
      const data  = await safeJson(res);
      if (res.ok) setActivity(data.data || []);
    } catch (_e) {
    } finally { setActLoading(false); }
  };

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
          <button className="flex items-center gap-2 bg-red-600 text-white px-3.5 py-2 rounded-xl hover:bg-red-700 font-semibold text-sm shadow-md shadow-red-200">
            <Plus size={15} /> Nuevo Expediente
          </button>
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

          <div className="divide-y divide-slate-50">
            {AGENDA_EVENTS.map((ev) => {
              const style = EVENT_STYLES[ev.type] || EVENT_STYLES.reunion;
              const Icon  = style.icon;
              const label = dayLabel(ev.date);
              const isToday = label === "Hoy";
              return (
                <Link key={ev.id} to="/dashboard/agenda" className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors group">
                  {/* color bar */}
                  <div className={`w-1 h-10 rounded-full shrink-0 ${style.color}`} />

                  {/* fecha / hora */}
                  <div className="w-20 shrink-0 text-right">
                    <p className={`text-xs font-bold ${isToday ? "text-red-500" : "text-slate-500"}`}>{label}</p>
                    <p className="text-sm font-black text-slate-700">{ev.time}</p>
                  </div>

                  {/* título y lugar */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-red-600 transition-colors">
                      {ev.title}
                    </p>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <Icon size={10} /> {ev.place}
                    </p>
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

          <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400">
              Conecta el módulo Agenda para ver eventos reales · <Link to="/dashboard/agenda" className="text-red-500 font-semibold hover:underline">Ir a Agenda</Link>
            </p>
          </div>
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
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Caducadas</p>
                  <p className="text-4xl font-black text-red-600 leading-none">0</p>
                  <p className="text-[10px] text-red-400 mt-1.5">tareas vencidas</p>
                </div>
                <div className="p-5 bg-orange-50">
                  <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-1">Próximas</p>
                  <p className="text-4xl font-black text-orange-500 leading-none">0</p>
                  <p className="text-[10px] text-orange-400 mt-1.5">vencen pronto</p>
                </div>
              </div>
              <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-center">
                <span className="text-[11px] text-slate-400">Módulo de tareas · próximamente</span>
              </div>
            </div>
          </Link>

          {/* TRAZABILIDAD MINI */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Clock size={15} className="text-slate-400" /> Actividad
              </h3>
              <button onClick={fetchData} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600">
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
                      {item.entity_name && <p className="text-[11px] text-slate-400 truncate">{item.entity_name}</p>}
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
