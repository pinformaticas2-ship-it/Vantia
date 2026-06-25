import React, {
  useEffect, useState, useCallback, useMemo, useRef,
} from "react";
import { Spinner } from "../components/Spinner";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2, Circle, AlertTriangle, Clock, Plus, X,
  Loader2, Search, Filter, Trash2, Edit3, Flag,
  Briefcase, Users, Calendar, MoreHorizontal, GripVertical,
  ArrowUpDown, ChevronDown, ChevronUp, ZoomIn, ZoomOut,
  AlignJustify, LayoutList, BarChart2, Zap,
} from "lucide-react";
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import { createPortal } from "react-dom";
import { EtapaSelect } from "../components/EtapaSelect";
import BackButton from "../components/BackButton";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Task {
  id: string;
  client_id: string;
  client_name: string | null;
  client_name_resolved?: string | null;
  titulo: string;
  descripcion: string | null;
  plazo: string | null;
  estado: "pendiente" | "urgente" | "completada";
  prioridad: "alta" | "media" | "baja";
  tipo: string;
  expediente: string | null;
  expediente_id: string | null;
  juzgado: string | null;
  num_proc: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ── Config ────────────────────────────────────────────────────────────────────
const TIPO_CONFIG: Record<string, { label: string; color: string }> = {
  plazo_procesal: { label: "Plazo procesal",   color: "bg-red-100 text-red-700"     },
  vista_juicio:   { label: "Vista / Juicio",   color: "bg-purple-100 text-purple-700"},
  notificacion:   { label: "Notificación",     color: "bg-blue-100 text-blue-700"   },
  reunion:        { label: "Reunión",          color: "bg-green-100 text-green-700" },
  escrito:        { label: "Escrito",          color: "bg-indigo-100 text-indigo-700"},
  gestion:        { label: "Gestión",          color: "bg-amber-100 text-amber-700" },
  pago:           { label: "Pago",             color: "bg-emerald-100 text-emerald-700"},
  llamada:        { label: "Llamada",          color: "bg-teal-100 text-teal-700"   },
  diligencia:     { label: "Diligencia",       color: "bg-orange-100 text-orange-700"},
  otro:           { label: "Otro",             color: "bg-slate-100 text-slate-600" },
};

const ESTADO_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  pendiente:  { label: "Pendiente",  cls: "text-amber-600",  dot: "bg-amber-400"  },
  urgente:    { label: "Urgente",    cls: "text-red-600",    dot: "bg-red-500"    },
  completada: { label: "Completada", cls: "text-emerald-600", dot: "bg-emerald-400"},
};

const PRIO_CONFIG: Record<string, { label: string; bar: string }> = {
  alta:  { label: "Alta",  bar: "bg-red-500"    },
  media: { label: "Media", bar: "bg-amber-400"  },
  baja:  { label: "Baja",  bar: "bg-slate-300"  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
function isOverdue(plazo: string | null, estado: string): boolean {
  if (!plazo || estado === "completada") return false;
  return new Date(plazo) < new Date();
}
function daysUntil(plazo: string | null): number | null {
  if (!plazo) return null;
  return Math.ceil((new Date(plazo).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
}
const clientName = (t: Task) => t.client_name_resolved || t.client_name || "—";
type TaskView = "list" | "kanban" | "gantt";

// ── Modal crear/editar tarea ──────────────────────────────────────────────────
interface TaskFormData {
  titulo: string; descripcion: string; plazo: string; fecha_aviso: string; estado: string;
  prioridad: string; tipo: string; expediente: string; juzgado: string; num_proc: string;
  importe: string; notas: string; etapa: string;
}
const emptyForm = (): TaskFormData => ({
  titulo:"", descripcion:"", plazo:"", fecha_aviso:"", estado:"pendiente",
  prioridad:"media", tipo:"otro", expediente:"", juzgado:"", num_proc:"",
  importe:"", notas:"", etapa:"",
});

function TaskModal({
  task, clients, clientsLoading, clientsError, onClose, onSave, onDelete, saving, errorMsg, getToken, initialClientId = "", initialForm = null,
}: {
  task: Task | null;
  clients: { id: string; name: string }[];
  clientsLoading: boolean;
  clientsError: string | null;
  onClose: () => void;
  onSave: (clientId: string, data: TaskFormData) => void;
  onDelete: (id: string) => void;
  saving: boolean;
  errorMsg: string | null;
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>;
  initialClientId?: string;
  initialForm?: TaskFormData | null;
}) {
  const buildFormFromProps = useCallback((): TaskFormData => (
    task ? {
    titulo: task.titulo, descripcion: task.descripcion || "",
    plazo: task.plazo ? task.plazo.slice(0,10) : "",
    fecha_aviso: (task as any).fecha_aviso ? (task as any).fecha_aviso.slice(0,10) : "",
    estado: task.estado, prioridad: task.prioridad, tipo: task.tipo,
    expediente: task.expediente || "", juzgado: task.juzgado || "", num_proc: task.num_proc || "",
    importe: (task as any).importe != null ? String((task as any).importe) : "",
    notas: (task as any).notas || "",
    etapa: (task as any).etapa || "",
  } : (initialForm || emptyForm())), [task, initialForm]);
  const [form, setForm] = useState<TaskFormData>(buildFormFromProps);
  const [clientId, setClientId] = useState(task?.client_id || initialClientId);
  const set = (k: keyof TaskFormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    setForm(buildFormFromProps());
    setClientId(task?.client_id || initialClientId);
  }, [buildFormFromProps, task, initialClientId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return;
    onSave(clientId, form);
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <span className="font-bold text-slate-800 text-sm">{task ? "Editar tarea" : "Nueva tarea"}</span>
          <BackButton onClick={onClose} />
        </div>
        {errorMsg && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700 font-medium">{errorMsg}</div>
        )}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto max-h-[72vh]">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Cliente <span className="text-red-500">*</span></label>
            <select value={clientId} onChange={e => setClientId(e.target.value)} required disabled={!!task || clientsLoading}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-red-400 bg-white disabled:opacity-60">
              <option value="">— Selecciona un cliente —</option>
              {clientsLoading && <option value="">— Cargando clientes… —</option>}
              {clientsError && !clientsLoading && <option value="">— No se pudieron cargar los clientes —</option>}
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {clientsError && !clientsLoading && <p className="mt-1 text-[11px] font-medium text-amber-600">{clientsError}</p>}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Título <span className="text-red-500">*</span></label>
            <input value={form.titulo} onChange={e => set("titulo", e.target.value)} required placeholder="Descripción breve de la tarea…"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo</label>
              <select value={form.tipo} onChange={e => set("tipo", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 bg-white">
                {Object.entries(TIPO_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Prioridad</label>
              <select value={form.prioridad} onChange={e => set("prioridad", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 bg-white">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Estado</label>
              <select value={form.estado} onChange={e => set("estado", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 bg-white">
                <option value="pendiente">Pendiente</option>
                <option value="urgente">Urgente</option>
                <option value="completada">Completada</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Fecha límite</label>
              <input type="date" value={form.plazo} onChange={e => set("plazo", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Ref. Expediente</label>
            <input value={form.expediente} onChange={e => set("expediente", e.target.value)} placeholder="Ej: EXP/2024/001"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Juzgado / Tribunal</label>
              <input value={form.juzgado} onChange={e => set("juzgado", e.target.value)} placeholder="Juzgado nº…"
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nº Procedimiento</label>
              <input value={form.num_proc} onChange={e => set("num_proc", e.target.value)} placeholder="123/2024"
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">🏷️ Etapa</label>
            <EtapaSelect value={form.etapa} onChange={v => set("etapa", v)} getToken={getToken} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">🔔 Fecha de aviso</label>
              <input type="date" value={form.fecha_aviso} onChange={e => set("fecha_aviso", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
              <p className="text-[10px] text-slate-400 mt-0.5">Recordatorio antes del plazo</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">💶 Importe (€)</label>
              <input type="number" step="0.01" min="0" value={form.importe} onChange={e => set("importe", e.target.value)} placeholder="0,00"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
              <p className="text-[10px] text-slate-400 mt-0.5">Honorarios, tasas, pagos...</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Instrucciones / Contexto</label>
            <textarea value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={2}
              placeholder="Descripción o contexto adicional…"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">📝 Notas internas</label>
            <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={2}
              placeholder="Observaciones internas del letrado…"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400 resize-none" />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            {task ? (
              <button type="button" onClick={() => onDelete(task.id)} disabled={saving}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-semibold px-3 py-2 rounded-xl hover:bg-red-50 transition-colors">
                <Trash2 size={13} /> Eliminar
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
              <button type="submit" disabled={saving || !form.titulo.trim() || !clientId}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50">
                {saving && <Loader2 size={12} className="animate-spin" />}
                {task ? "Guardar cambios" : "Crear tarea"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Vista Lista – fila ────────────────────────────────────────────────────────
function TaskRow({
  task, onToggle, onEdit,
}: {
  task: Task;
  onToggle: (id: string, newEstado: string) => void;
  onEdit: (t: Task) => void;
}) {
  const navigate = useNavigate();
  const overdue  = isOverdue(task.plazo, task.estado);
  const done     = task.estado === "completada";
  const tipoConf = TIPO_CONFIG[task.tipo] || TIPO_CONFIG.otro;
  const days     = daysUntil(task.plazo);

  return (
    <div className={`group flex items-center border-b border-slate-100 last:border-0 transition-colors min-h-[58px]
      ${overdue && !done ? "hover:bg-red-50/30" : done ? "opacity-60 hover:bg-slate-50/30" : "hover:bg-slate-50/50"}
    `}>
      {/* Checkbox */}
      <div className="w-12 flex items-center justify-center shrink-0 py-3">
        <button
          onClick={e => { e.stopPropagation(); onToggle(task.id, done ? "pendiente" : "completada"); }}
          className="text-slate-300 hover:text-emerald-500 transition-colors"
        >
          {done ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Circle size={16} />}
        </button>
      </div>

      {/* Título + meta */}
      <div className="flex-1 py-3 min-w-0 pr-4 cursor-pointer" onClick={() => onEdit(task)}>
        <div className={`text-[13px] font-semibold leading-5 ${done ? "line-through text-slate-400" : "text-slate-800"}`}>
          {task.titulo}
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <button
            onClickCapture={e => { e.stopPropagation(); task.client_id && navigate(`/dashboard/clientes/${task.client_id}`); }}
            className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:underline"
          >
            <Users size={9} /> {clientName(task)}
          </button>
          {(task.expediente || task.expediente_id) && (
            <button
              onClickCapture={e => { e.stopPropagation(); task.expediente_id && navigate(`/dashboard/expedientes/${task.expediente_id}`); }}
              className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:underline"
            >
              <Briefcase size={9} /> {task.expediente || "Expediente"}
            </button>
          )}
          {(task as any).etapa && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-indigo-600">
              🏷 {(task as any).etapa}
            </span>
          )}
          {(task as any).notas && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5 max-w-[180px] truncate">
              💬 {(task as any).notas}
            </span>
          )}
        </div>
      </div>

      {/* Tipo */}
      <div className="w-[140px] flex items-center justify-center shrink-0 px-2">
        <span className={`text-[11px] font-semibold px-3 py-1 rounded-lg truncate ${tipoConf.color}`}>
          {tipoConf.label}
        </span>
      </div>

      {/* Fecha límite */}
      <div className="w-[140px] flex items-center shrink-0 px-2">
        {task.plazo ? (
          <span className={`flex items-center gap-1 text-xs font-medium ${
            overdue && !done ? "text-red-600 font-bold" :
            days !== null && days <= 3 && !done ? "text-amber-600 font-bold" :
            "text-slate-500"
          }`}>
            {overdue && !done && <AlertTriangle size={10} className="shrink-0" />}
            {fmtDate(task.plazo)}
            {days !== null && !overdue && !done && days <= 7 && (
              <span className="text-slate-400 text-[10px]">{days === 0 ? "hoy" : `${days}d`}</span>
            )}
          </span>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </div>

      {/* Estado */}
      <div className="w-[120px] flex items-center justify-center shrink-0 px-2 pr-4">
        <span className={`text-[11px] font-semibold px-3 py-1 rounded-lg border ${
          done ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
          task.estado === "urgente" ? "bg-red-50 text-red-600 border-red-200" :
          "bg-amber-50 text-amber-600 border-amber-200"
        }`}>
          {ESTADO_CONFIG[task.estado]?.label}
        </span>
      </div>
    </div>
  );
}

// ── Kanban – tarjeta visual (sin hooks) ───────────────────────────────────────
function KanbanCardContent({
  task, onToggle, onEdit, isDragging = false,
}: {
  task: Task;
  onToggle: (id: string, newEstado: string) => void;
  onEdit: (t: Task) => void;
  isDragging?: boolean;
}) {
  const overdue  = isOverdue(task.plazo, task.estado);
  const days     = daysUntil(task.plazo);
  const tipoConf = TIPO_CONFIG[task.tipo] || TIPO_CONFIG.otro;
  const prioConf = PRIO_CONFIG[task.prioridad] || PRIO_CONFIG.media;
  const done     = task.estado === "completada";

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm transition-all flex flex-col gap-3 relative group
      ${isDragging ? "shadow-2xl rotate-1 scale-105 ring-2 ring-indigo-300" : "hover:shadow-md hover:border-red-300"}
      ${overdue && !done ? "border-red-200" : "border-slate-200"}
    `}>
      {/* Cabecera: checkbox + título + editar */}
      <div className="flex items-start gap-3">
        <button
          onClick={e => { e.stopPropagation(); onToggle(task.id, done ? "pendiente" : "completada"); }}
          className="mt-0.5 shrink-0 text-slate-300 hover:text-emerald-500 transition-colors"
        >
          {done ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Circle size={18} />}
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={() => onEdit(task)} className="text-left w-full">
            <h4 className={`text-[13px] font-bold leading-tight group-hover:text-red-600 transition-colors truncate ${done ? "line-through text-slate-400" : "text-slate-800"}`}>
              {task.titulo}
            </h4>
          </button>
          <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">{clientName(task)}</p>
        </div>
        <button
          onClick={() => onEdit(task)}
          className="shrink-0 w-6 h-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors"
        >
          <Edit3 size={10} />
        </button>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`flex items-center gap-1 text-[10px] font-bold text-slate-600`}>
          <span className={`h-1.5 w-1.5 rounded-full ${(PRIO_CONFIG[task.prioridad] || PRIO_CONFIG.media).bar}`} />
          {tipoConf.label}
        </span>
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200/60">
          {(PRIO_CONFIG[task.prioridad] || PRIO_CONFIG.media).label}
        </span>
        {task.estado === "urgente" && (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-100">Urgente</span>
        )}
      </div>

      {/* Mini grid: cliente + fecha */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex flex-col gap-0.5">
          <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
            <Users size={9} className="text-slate-300" /> Cliente
          </span>
          <span className="text-[10px] font-bold text-slate-700 truncate">{clientName(task)}</span>
        </div>
        <div className={`rounded-lg p-2 flex flex-col gap-0.5 border ${overdue && !done ? "bg-red-50/50 border-red-100" : "bg-slate-50 border-slate-100"}`}>
          <span className={`text-[9px] font-bold uppercase flex items-center gap-1 ${overdue && !done ? "text-red-400" : "text-slate-400"}`}>
            <Calendar size={9} className={overdue && !done ? "text-red-300" : "text-slate-300"} /> Límite
          </span>
          <span className={`text-[10px] font-bold truncate ${overdue && !done ? "text-red-600" : "text-slate-700"}`}>
            {task.plazo ? fmtDate(task.plazo) : "Sin fecha"}
            {days !== null && !overdue && days <= 7 && (
              <span className="ml-1 text-slate-400">{days === 0 ? "hoy" : `${days}d`}</span>
            )}
          </span>
        </div>
      </div>

      {/* Footer */}
      {(task.expediente || task.juzgado) && (
        <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-100">
          {task.expediente && (
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
              <Briefcase size={10} className="text-slate-400 shrink-0" />
              <span className="hover:text-indigo-600 hover:underline cursor-pointer truncate">{task.expediente}</span>
            </div>
          )}
          {task.juzgado && (
            <div className="flex items-start gap-1.5 text-[10px] font-medium text-slate-500">
              <Flag size={10} className="text-slate-400 shrink-0 mt-0.5" />
              <span className="line-clamp-2 leading-snug">{task.juzgado}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Kanban – tarjeta arrastrable ──────────────────────────────────────────────
function KanbanCard({
  task, onToggle, onEdit,
}: {
  task: Task;
  onToggle: (id: string, newEstado: string) => void;
  onEdit: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  return (
    <div ref={setNodeRef} style={{ opacity: isDragging ? 0.25 : 1 }}>
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <KanbanCardContent task={task} onToggle={onToggle} onEdit={onEdit} isDragging={false} />
      </div>
    </div>
  );
}

// ── Kanban – columna con drop zone ────────────────────────────────────────────
function KanbanLane({
  id, title, tasks, onToggle, onEdit, onAddNew,
}: {
  id: string;
  title: string;
  tasks: Task[];
  onToggle: (id: string, newEstado: string) => void;
  onEdit: (t: Task) => void;
  onAddNew: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const overdueCount = useMemo(() => tasks.filter(t => isOverdue(t.plazo, t.estado)).length, [tasks]);

  const badgeCls = id === "pendiente"
    ? "bg-amber-100 text-amber-700"
    : id === "urgente"
    ? "bg-red-100 text-red-700"
    : "bg-emerald-100 text-emerald-700";

  return (
    <div className={`w-[340px] flex-shrink-0 flex flex-col max-h-full rounded-2xl border overflow-hidden shadow-sm transition-all
      ${isOver ? "border-indigo-300 shadow-[0_0_0_2px_rgba(99,102,241,0.2)]" : "border-slate-200 bg-slate-100/50"}
    `}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200/60 flex items-center justify-between bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-2 cursor-grab">
          <GripVertical size={14} className="text-slate-300" />
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badgeCls}`}>{tasks.length}</span>
        </div>
        <button className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors">
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Contenido */}
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto p-3 flex flex-col gap-3 transition-colors ${isOver ? "bg-indigo-50/40" : ""}`}
      >
        {overdueCount > 0 && (
          <div className="bg-red-50 border border-red-200/60 rounded-xl px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={11} className="text-red-500 shrink-0" />
            <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">{overdueCount} Vencidas</span>
          </div>
        )}
        {tasks.length === 0 ? (
          <div className={`flex-1 flex items-center justify-center min-h-[140px] rounded-xl border-2 border-dashed text-xs font-medium transition-colors
            ${isOver ? "border-indigo-300 bg-indigo-50/60 text-indigo-500" : "border-slate-300/70 bg-slate-50/50 text-slate-400"}
          `}>
            {isOver ? "Soltar aquí" : "Sin tareas"}
          </div>
        ) : (
          tasks.map(task => (
            <KanbanCard key={task.id} task={task} onToggle={onToggle} onEdit={onEdit} />
          ))
        )}
        <button
          onClick={onAddNew}
          className="w-full py-2.5 border border-slate-200 rounded-xl text-slate-500 hover:bg-white hover:border-slate-300 hover:text-slate-700 hover:shadow-sm font-semibold text-sm transition-all flex items-center justify-center gap-2 group"
        >
          <Plus size={13} className="text-slate-400 group-hover:text-slate-500" /> Añadir tarea
        </button>
      </div>
    </div>
  );
}

// ── Gantt ─────────────────────────────────────────────────────────────────────
function GanttBoard({
  tasks, onEdit, onUpdatePlazo,
}: {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onUpdatePlazo: (id: string, plazo: string) => void;
}) {
  const [dayWidth, setDayWidth] = useState(44);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    taskId: string;
    startClientX: number;
    originalPlazo: Date;
    deltaDays: number;
  } | null>(null);

  const ganttData = useMemo(() => {
    const list = tasks
      .filter(t => !!t.plazo)
      .map(t => {
        const end  = new Date(t.plazo as string);
        const src  = t.created_at || t.updated_at || t.plazo || new Date().toISOString();
        const parsed = new Date(src);
        const start  = parsed.getTime() <= end.getTime() ? parsed : new Date(end.getTime() - 86400000 * 3);
        return { task: t, start, end };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    if (!list.length) return null;

    const minStart = new Date(Math.min(...list.map(i => i.start.getTime())));
    const maxEnd   = new Date(Math.max(...list.map(i => i.end.getTime())));
    minStart.setHours(0,0,0,0);
    maxEnd.setHours(0,0,0,0);

    // Pad 7 days before/after for comfortable dragging
    minStart.setDate(minStart.getDate() - 7);
    maxEnd.setDate(maxEnd.getDate() + 14);

    const totalDays = Math.max(1, Math.ceil((maxEnd.getTime() - minStart.getTime()) / 86400000) + 1);
    const dates = Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(minStart);
      d.setDate(minStart.getDate() + i);
      return d;
    });

    return { list, minStart, dates, totalDays };
  }, [tasks]);

  // Scroll to today on mount and on "Hoy" click
  const scrollToToday = useCallback(() => {
    if (!scrollRef.current || !ganttData) return;
    const now = new Date();
    now.setHours(0,0,0,0);
    const todayOffset = Math.floor((now.getTime() - ganttData.minStart.getTime()) / 86400000);
    const targetLeft = Math.max(0, todayOffset * dayWidth - scrollRef.current.clientWidth / 3);
    scrollRef.current.scrollTo({ left: targetLeft, behavior: "smooth" });
  }, [ganttData, dayWidth]);

  useEffect(() => { scrollToToday(); }, [scrollToToday]);

  // Drag event handlers
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const deltaDays = Math.round((e.clientX - dragging.startClientX) / dayWidth);
      setDragging(d => d ? { ...d, deltaDays } : null);
    };
    const onUp = () => {
      if (dragging.deltaDays !== 0) {
        const newPlazo = new Date(dragging.originalPlazo);
        newPlazo.setDate(newPlazo.getDate() + dragging.deltaDays);
        onUpdatePlazo(dragging.taskId, newPlazo.toISOString().slice(0, 10));
      }
      setDragging(null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging, dayWidth, onUpdatePlazo]);

  if (!ganttData) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-20 text-center text-sm font-medium text-slate-400">
        No hay tareas con fecha límite para mostrar en Gantt.
      </div>
    );
  }

  const { list, minStart, dates, totalDays } = ganttData;

  const weekHeaders = dates.reduce<Array<{ label: string; span: number; key: string }>>((acc, date) => {
    const weekNum = Math.ceil((((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(date.getFullYear(), 0, 1).getDay() + 1) / 7);
    const week = `${date.getFullYear()}-${weekNum}`;
    const label = `W${weekNum} · ${date.toLocaleDateString("es-ES", { month: "short", day: "numeric" })}`;
    const last = acc[acc.length - 1];
    if (last?.key === week) last.span += 1;
    else acc.push({ key: week, label, span: 1 });
    return acc;
  }, []);

  const todayOffset = Math.floor((new Date(new Date().setHours(0,0,0,0)).getTime() - minStart.getTime()) / 86400000);

  return (
    <div
      className="rounded-[24px] border border-slate-200 bg-white overflow-hidden shadow-[0_18px_42px_rgba(15,23,42,0.06)]"
      style={{ userSelect: dragging ? "none" : undefined } as React.CSSProperties}
    >
      {/* Header toolbar */}
      <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-extrabold text-slate-800">Cronograma</span>
          <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-500">{list.length} tareas</span>
          <span className="px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-[11px] font-bold text-violet-600">
            {dayWidth >= 56 ? "Vista detallada" : dayWidth <= 30 ? "Vista amplia" : "Vista semanal"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={scrollToToday}
            className="px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors"
          >
            Hoy
          </button>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1">
            <button
              onClick={() => setDayWidth(w => Math.max(20, w - 10))}
              className="h-6 w-6 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
              title="Alejar"
            >
              <ZoomOut size={13} />
            </button>
            <span className="text-[11px] font-bold text-slate-500 w-8 text-center">{dayWidth}px</span>
            <button
              onClick={() => setDayWidth(w => Math.min(80, w + 10))}
              className="h-6 w-6 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
              title="Acercar"
            >
              <ZoomIn size={13} />
            </button>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="overflow-auto">
        <div style={{ minWidth: `${380 + totalDays * dayWidth}px` }}>

          {/* Header fechas */}
          <div
            className="grid border-b border-slate-200 bg-slate-50/80 sticky top-0 z-10"
            style={{ gridTemplateColumns: `380px repeat(${totalDays}, ${dayWidth}px)` }}
          >
            <div className="px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-slate-500 border-r border-slate-200 row-span-2 flex items-center">
              Nombre
            </div>
            {/* Week row */}
            <div className="col-span-full" style={{ gridColumn: `2 / span ${totalDays}` }}>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${totalDays}, ${dayWidth}px)` }}>
                {weekHeaders.map(w => (
                  <div key={w.key} className="px-2 py-1.5 text-[11px] font-bold text-slate-600 border-r border-slate-200 bg-white/70 truncate"
                    style={{ gridColumn: `span ${w.span}` }}>
                    {w.label}
                  </div>
                ))}
              </div>
            </div>
            {/* Day row */}
            {dates.map((date, i) => {
              const isToday = i === todayOffset;
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              return (
                <div key={date.toISOString()}
                  className={`py-1.5 text-center border-r border-slate-100 ${isWeekend ? "bg-slate-100/60" : ""} ${isToday ? "bg-indigo-50" : ""}`}
                >
                  <div className={`text-[11px] font-bold ${isToday ? "text-indigo-600" : "text-slate-700"}`}>
                    {date.toLocaleDateString("es-ES", { day: "2-digit" })}
                  </div>
                  {dayWidth >= 36 && (
                    <div className={`text-[9px] uppercase ${isToday ? "text-indigo-400" : "text-slate-400"}`}>
                      {date.toLocaleDateString("es-ES", { weekday: "short" })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Task rows */}
          {list.map(({ task, start, end }) => {
            const startOffset = Math.max(0, Math.floor((start.getTime() - minStart.getTime()) / 86400000));
            const baseSpan   = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
            const tipoConf   = TIPO_CONFIG[task.tipo] || TIPO_CONFIG.otro;
            const overdue    = isOverdue(task.plazo, task.estado);
            const barTone    = task.estado === "completada"
              ? "bg-emerald-500/90"
              : task.estado === "urgente" || overdue
                ? "bg-red-500/90"
                : "bg-indigo-500/90";

            const isDraggingThis = dragging?.taskId === task.id;
            const deltaDays = isDraggingThis ? dragging!.deltaDays : 0;

            // For dragging: we visually shift the end of the bar
            const visualSpan = Math.max(1, baseSpan + deltaDays);
            const newPlazoDate = isDraggingThis && deltaDays !== 0
              ? new Date(dragging!.originalPlazo.getTime() + deltaDays * 86400000)
              : null;

            return (
              <div key={task.id}
                className="grid border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                style={{ gridTemplateColumns: `380px repeat(${totalDays}, ${dayWidth}px)` }}
              >
                {/* Name column */}
                <button onClick={() => onEdit(task)} className="px-5 py-3 text-left border-r border-slate-200 hover:bg-white">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-3 w-3 rounded-full shrink-0 ${barTone}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-slate-800 truncate">{task.titulo}</div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-semibold text-blue-600 truncate">{clientName(task)}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tipoConf.color}`}>{tipoConf.label}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{PRIO_CONFIG[task.prioridad]?.label || "Media"}</span>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Timeline column */}
                <div className="relative" style={{ gridColumn: `2 / span ${totalDays}` }}>
                  {/* Background grid */}
                  <div className="absolute inset-0 grid pointer-events-none"
                    style={{ gridTemplateColumns: `repeat(${totalDays}, ${dayWidth}px)` }}>
                    {dates.map((date, i) => (
                      <div key={i}
                        className={`border-r border-slate-100 ${date.getDay() === 0 || date.getDay() === 6 ? "bg-slate-50/60" : ""} ${i === todayOffset ? "bg-indigo-50/40" : ""}`}
                      />
                    ))}
                  </div>

                  {/* Today line */}
                  {todayOffset >= 0 && todayOffset < totalDays && (
                    <div className="absolute top-0 bottom-0 w-[2px] bg-indigo-400/70 z-[1] pointer-events-none"
                      style={{ left: `${todayOffset * dayWidth + dayWidth / 2}px` }} />
                  )}

                  <div className="relative min-h-[68px]">
                    {/* Task bar */}
                    <div
                      onMouseDown={task.plazo ? e => {
                        e.preventDefault();
                        setDragging({
                          taskId: task.id,
                          startClientX: e.clientX,
                          originalPlazo: new Date(task.plazo!),
                          deltaDays: 0,
                        });
                      } : undefined}
                      onClick={() => !isDraggingThis && onEdit(task)}
                      className={`absolute top-1/2 -translate-y-1/2 h-10 rounded-xl px-3 flex items-center gap-2 text-white shadow-md
                        ${barTone}
                        ${task.plazo ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
                        ${isDraggingThis ? "shadow-2xl z-20 ring-2 ring-white/40 scale-y-110" : ""}
                      `}
                      style={{
                        left: `${startOffset * dayWidth + 4}px`,
                        width: `${Math.max(visualSpan * dayWidth - 8, dayWidth - 8)}px`,
                        transition: isDraggingThis ? "none" : "width 0.15s ease",
                      }}
                      title={`${task.titulo} · ${fmtDate(task.plazo)}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-extrabold truncate">{task.titulo}</div>
                        {newPlazoDate ? (
                          <div className="text-[10px] text-white/90 font-bold">
                            {deltaDays > 0 ? "+" : ""}{deltaDays}d → {fmtDate(newPlazoDate.toISOString())}
                          </div>
                        ) : (
                          <div className="text-[10px] text-white/75 truncate">{fmtDate(task.plazo)}</div>
                        )}
                      </div>
                      {/* Resize handle hint */}
                      {dayWidth >= 40 && (
                        <div className="flex gap-0.5 shrink-0 opacity-60">
                          <div className="w-0.5 h-4 bg-white/70 rounded" />
                          <div className="w-0.5 h-4 bg-white/70 rounded" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Tareas() {
  const { getToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks,   setTasks]   = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);

  // Filtros
  const [tab,          setTab]          = useState<"todas" | "plazos">("todas");
  const [filterEstado, setFilterEstado] = useState("");
  const [filterTipo,   setFilterTipo]   = useState("");
  const [filterPrio,   setFilterPrio]   = useState("");
  const [search,       setSearch]       = useState("");
  const [showFilters,  setShowFilters]  = useState(false);
  const [view,         setView]         = useState<TaskView>("list");

  // Lista – ordenación y secciones
  const [listSortBy,  setListSortBy]  = useState<"none" | "plazo" | "titulo" | "prioridad">("none");
  const [listSortDir, setListSortDir] = useState<"asc" | "desc">("asc");
  const [showCompletadas, setShowCompletadas] = useState(false);

  // Kanban – drag state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editTask,  setEditTask]  = useState<Task | null>(null);
  const [modalInitialClientId, setModalInitialClientId] = useState("");
  const [modalInitialForm, setModalInitialForm] = useState<TaskFormData | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const prefillHandledRef = useRef("");

  const fetchClients = useCallback(async () => {
    setClientsLoading(true); setClientsError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/entities?limit=500", { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (!res.ok) { setClientsError(data?.error || "No se pudieron cargar los clientes"); return; }
      const mapped = (data.data || []).map((c: any) => ({
        id: c.id,
        name: c.commercial_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.nif_cif || c.internal_number || c.id,
      }));
      setClients(mapped);
      if (mapped.length === 0) setClientsError("No hay clientes disponibles");
    } catch (_e) { setClientsError("Error de conexión al cargar clientes"); }
    finally { setClientsLoading(false); }
  }, [getToken]);

  const fetchTasks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/tasks/me", { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok) setTasks(data.data || []);
    } catch (_e) {}
    finally { if (!silent) setLoading(false); }
  }, [getToken]);

  useEffect(() => { fetchTasks(); fetchClients(); }, [fetchTasks, fetchClients]);
  useAutoRefresh(() => fetchTasks(true), { intervalMs: 30_000 });

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "plazos" || tabParam === "todas") setTab(tabParam);
    if (searchParams.get("open") !== "new") return;
    const signature = searchParams.toString();
    if (prefillHandledRef.current === signature) return;
    prefillHandledRef.current = signature;
    setEditTask(null); setErrorMsg(null);
    setModalInitialClientId(searchParams.get("clientId") || "");
    setModalInitialForm({ ...emptyForm(), tipo: searchParams.get("tipo") || "otro" });
    setShowModal(true);
    if (clients.length === 0) fetchClients();
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("open"); nextParams.delete("clientId"); nextParams.delete("tipo");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, clients.length, fetchClients]);

  // Filtrado
  const filtered = useMemo(() => {
    let list = tasks;
    if (tab === "plazos") list = list.filter(t => !!t.plazo);
    if (filterEstado) list = list.filter(t => t.estado === filterEstado);
    if (filterTipo)   list = list.filter(t => t.tipo === filterTipo);
    if (filterPrio)   list = list.filter(t => t.prioridad === filterPrio);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(t =>
      (t.titulo || "").toLowerCase().includes(q) ||
      clientName(t).toLowerCase().includes(q) ||
      (t.expediente || "").toLowerCase().includes(q) ||
      (t.descripcion || "").toLowerCase().includes(q)
    );
    return list;
  }, [tasks, tab, filterEstado, filterTipo, filterPrio, search]);

  // Ordenación lista
  const listTasks = useMemo(() => {
    let list = [...filtered];
    if (listSortBy === "plazo") {
      list.sort((a, b) => {
        if (!a.plazo && !b.plazo) return 0;
        if (!a.plazo) return 1;
        if (!b.plazo) return -1;
        const d = new Date(a.plazo).getTime() - new Date(b.plazo).getTime();
        return listSortDir === "asc" ? d : -d;
      });
    } else if (listSortBy === "titulo") {
      list.sort((a, b) => { const d = a.titulo.localeCompare(b.titulo, "es"); return listSortDir === "asc" ? d : -d; });
    } else if (listSortBy === "prioridad") {
      const ord: Record<string, number> = { alta: 0, media: 1, baja: 2 };
      list.sort((a, b) => { const d = (ord[a.prioridad] ?? 1) - (ord[b.prioridad] ?? 1); return listSortDir === "asc" ? d : -d; });
    }
    return list;
  }, [filtered, listSortBy, listSortDir]);

  const toggleSort = (col: typeof listSortBy) => {
    if (listSortBy === col) setListSortDir(d => d === "asc" ? "desc" : "asc");
    else { setListSortBy(col); setListSortDir("asc"); }
  };

  // Stats
  const stats = useMemo(() => ({
    vencidas:   tasks.filter(t => isOverdue(t.plazo, t.estado)).length,
    urgentes:   tasks.filter(t => t.estado === "urgente").length,
    pendientes: tasks.filter(t => t.estado === "pendiente").length,
    completadas:tasks.filter(t => t.estado === "completada").length,
  }), [tasks]);

  const hasFilter = !!(filterEstado || filterTipo || filterPrio || search);

  // Cambiar estado (optimistic)
  const handleToggle = useCallback(async (id: string, newEstado: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, estado: newEstado as Task["estado"] } : t));
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/tasks/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado: newEstado }),
      });
    } catch (_e) { fetchTasks(true); }
  }, [getToken, fetchTasks]);

  // Actualizar fecha límite desde Gantt (optimistic)
  const handleUpdatePlazo = useCallback(async (id: string, plazo: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, plazo } : t));
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          titulo: task.titulo,
          descripcion: task.descripcion || "",
          plazo,
          estado: task.estado,
          prioridad: task.prioridad,
          tipo: task.tipo,
          expediente: task.expediente || "",
          juzgado: task.juzgado || "",
          num_proc: task.num_proc || "",
          importe: (task as any).importe || "",
          notas: (task as any).notas || "",
          etapa: (task as any).etapa || "",
          fecha_aviso: (task as any).fecha_aviso ? (task as any).fecha_aviso.slice(0, 10) : "",
        }),
      });
    } catch (_e) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, plazo: task.plazo } : t));
    }
  }, [getToken, tasks]);

  // Guardar tarea (create / update)
  const handleSave = async (clientId: string, data: TaskFormData) => {
    setSaving(true); setErrorMsg(null);
    try {
      const token  = await getToken({ skipCache: true });
      const url    = editTask ? `/api/tasks/${editTask.id}` : `/api/tasks/client/${clientId}`;
      const method = editTask ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(data),
      });
      const json = await safeJson(res);
      if (!res.ok) { setErrorMsg(json?.error || "Error al guardar"); return; }
      setShowModal(false); setEditTask(null);
      fetchTasks(true);
    } catch (_e) { setErrorMsg("Error de conexión"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/tasks/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setShowModal(false); setEditTask(null);
      fetchTasks(true);
    } catch (_e) {}
    finally { setSaving(false); }
  };

  const openNew = () => {
    setEditTask(null); setErrorMsg(null); setModalInitialClientId(""); setModalInitialForm(null);
    setShowModal(true);
    if (clients.length === 0) fetchClients();
  };
  const openEdit = (t: Task) => {
    setEditTask(t); setErrorMsg(null); setModalInitialClientId(""); setModalInitialForm(null);
    setShowModal(true);
  };

  // Kanban drag handlers
  const activeDragTask = useMemo(() => tasks.find(t => t.id === activeDragId) ?? null, [tasks, activeDragId]);

  const handleKanbanDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };
  const handleKanbanDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const taskId      = active.id as string;
    const targetEstado = over.id as string;
    if (!["pendiente", "urgente", "completada"].includes(targetEstado)) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.estado === targetEstado) return;
    handleToggle(taskId, targetEstado);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-300">

      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 leading-tight">Tareas y Plazos</h1>
            <p className="text-xs font-medium text-slate-400 mt-0.5">Solo tus tareas asignadas</p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-5 h-10 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm shadow-red-600/20 transition-colors"
        >
          <Plus size={14} /> Nueva tarea
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {([
          { label: "VENCIDAS",    val: stats.vencidas,    cls: "text-red-600",     labelCls: "text-red-400",     bg: "bg-red-50/70",     border: "border-red-100",     iconCls: "text-red-100",    Icon: AlertTriangle as React.FC<{ size?: number; className?: string; strokeWidth?: number }> },
          { label: "URGENTES",    val: stats.urgentes,    cls: "text-orange-500",  labelCls: "text-orange-400",  bg: "bg-orange-50/70",  border: "border-orange-100",  iconCls: "text-orange-100", Icon: Zap           as React.FC<{ size?: number; className?: string; strokeWidth?: number }> },
          { label: "PENDIENTES",  val: stats.pendientes,  cls: "text-amber-600",   labelCls: "text-amber-500",   bg: "bg-amber-50/70",   border: "border-amber-100",   iconCls: "text-amber-100",  Icon: Clock         as React.FC<{ size?: number; className?: string; strokeWidth?: number }> },
          { label: "COMPLETADAS", val: stats.completadas, cls: "text-emerald-600", labelCls: "text-emerald-500", bg: "bg-emerald-50/70", border: "border-emerald-100", iconCls: "text-emerald-100",Icon: CheckCircle2  as React.FC<{ size?: number; className?: string; strokeWidth?: number }> },
        ] as const).map(s => (
          <div key={s.label} className={`group relative overflow-hidden rounded-xl border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${s.bg} ${s.border} px-5 py-5`}>
            <div className={`absolute -right-4 -bottom-4 opacity-50 group-hover:scale-110 transition-transform ${s.iconCls}`}>
              <s.Icon size={88} strokeWidth={1} />
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-widest block mb-1 relative z-10 ${s.labelCls}`}>{s.label}</span>
            <span className={`text-3xl font-black leading-none relative z-10 ${s.cls}`}>{s.val}</span>
          </div>
        ))}
      </div>

      {/* ── Panel principal ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-wrap gap-2">
          {/* Left: tabs + view selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
              {(["todas", "plazos"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    tab === t ? "bg-slate-800 text-white shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}>
                  {t === "todas" ? "Todas" : "Solo con plazo"}
                </button>
              ))}
            </div>
            <div className="flex items-center bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
              {([
                { key: "list",   label: "Lista",  Icon: AlignJustify },
                { key: "kanban", label: "Kanban", Icon: LayoutList   },
                { key: "gantt",  label: "Gantt",  Icon: BarChart2    },
              ] as const).map(opt => (
                <button key={opt.key} onClick={() => setView(opt.key as TaskView)}
                  className={`flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md transition-all ${
                    view === opt.key
                      ? "font-bold text-white bg-slate-800 shadow-sm"
                      : "font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}>
                  <opt.Icon size={12} /> {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: search + filter */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 h-8">
              <Search size={12} className="text-slate-400 shrink-0" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar tarea o cliente..."
                className="bg-transparent text-xs text-slate-700 placeholder-slate-400 focus:outline-none w-44"
              />
              {search && <button onClick={() => setSearch("")}><X size={11} className="text-slate-400" /></button>}
            </div>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-3 h-8 text-xs font-semibold border rounded-lg transition-colors ${
                showFilters || hasFilter
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}>
              <Filter size={11} /> Filtrar
              {hasFilter && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
            </button>
          </div>
        </div>

        {/* Filtros expandibles */}
        {showFilters && (
          <div className="flex items-center gap-2 flex-wrap px-5 py-3 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Estado:</span>
              {["pendiente", "urgente", "completada"].map(e => (
                <button key={e} onClick={() => setFilterEstado(filterEstado === e ? "" : e)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                    filterEstado === e ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}>
                  {ESTADO_CONFIG[e]?.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Prioridad:</span>
              {["alta","media","baja"].map(p => (
                <button key={p} onClick={() => setFilterPrio(filterPrio === p ? "" : p)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                    filterPrio === p ? "bg-red-600 text-white border-red-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}>
                  {PRIO_CONFIG[p]?.label}
                </button>
              ))}
            </div>
            {hasFilter && (
              <button onClick={() => { setFilterEstado(""); setFilterTipo(""); setFilterPrio(""); setSearch(""); }}
                className="ml-auto text-xs text-red-500 font-semibold hover:text-red-700">
                Limpiar filtros
              </button>
            )}
          </div>
        )}

        {/* Contenido */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="md" muted />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <CheckCircle2 size={36} className="text-slate-200" />
            <p className="font-semibold text-slate-400">
              {hasFilter || tab === "plazos" ? "Sin tareas con esos filtros" : "No tienes tareas todavía"}
            </p>
            {!hasFilter && tab === "todas" && (
              <button onClick={openNew} className="text-sm font-bold text-red-500 hover:underline">
                + Crear primera tarea
              </button>
            )}
          </div>
        ) : view === "list" ? (
          (() => {
            const overdueTasks   = listTasks.filter(t => isOverdue(t.plazo, t.estado));
            const activeTasks    = listTasks.filter(t => !isOverdue(t.plazo, t.estado) && t.estado !== "completada");
            const completedTasks = listTasks.filter(t => t.estado === "completada");

            const SortBtn = ({ col, label }: { col: typeof listSortBy; label: string }) => (
              <button onClick={() => toggleSort(col)}
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 transition-colors">
                {label}
                <ArrowUpDown size={9} className={listSortBy === col ? "text-red-500" : ""} />
                {listSortBy === col && <span className="text-red-500">{listSortDir === "asc" ? "↑" : "↓"}</span>}
              </button>
            );

            return (
              <>
                {/* Cabecera columnas */}
                <div className="flex items-center px-4 py-2.5 bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                  <div className="w-12 shrink-0" />
                  <div className="flex-1 pr-4"><SortBtn col="titulo" label="Tarea" /></div>
                  <div className="w-[140px] text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tipo</span>
                  </div>
                  <div className="w-[140px] px-2"><SortBtn col="plazo" label="Fecha límite" /></div>
                  <div className="w-[120px] pr-4 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Estado</span>
                  </div>
                </div>

                {/* Grupo Vencidas */}
                {overdueTasks.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-4 py-2 bg-red-50/70 border-b border-red-100">
                      <AlertTriangle size={11} className="text-red-500 shrink-0" />
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-red-600">
                        Vencidas · {overdueTasks.length}
                      </span>
                    </div>
                    <div className="border-l-[3px] border-red-400">
                      {overdueTasks.map(t => <TaskRow key={t.id} task={t} onToggle={handleToggle} onEdit={openEdit} />)}
                    </div>
                  </>
                )}

                {/* Grupo Activas */}
                {activeTasks.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                        Activas · {activeTasks.length}
                      </span>
                    </div>
                    {activeTasks.map(t => <TaskRow key={t.id} task={t} onToggle={handleToggle} onEdit={openEdit} />)}
                  </>
                )}

                {/* Grupo Completadas (colapsable) */}
                {completedTasks.length > 0 && (
                  <>
                    <button
                      onClick={() => setShowCompletadas(v => !v)}
                      className="w-full flex items-center gap-2 px-4 py-2 bg-emerald-50/80 border-y border-emerald-100 hover:bg-emerald-100/60 transition-colors"
                    >
                      <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 flex-1 text-left">
                        Completadas · {completedTasks.length}
                      </span>
                      {showCompletadas
                        ? <ChevronUp size={13} className="text-emerald-500" />
                        : <ChevronDown size={13} className="text-emerald-500" />}
                    </button>
                    {showCompletadas && completedTasks.map(t => (
                      <TaskRow key={t.id} task={t} onToggle={handleToggle} onEdit={openEdit} />
                    ))}
                  </>
                )}
              </>
            );
          })()
        ) : view === "kanban" ? (
          <div className="p-5 overflow-x-auto">
            <DndContext onDragStart={handleKanbanDragStart} onDragEnd={handleKanbanDragEnd}>
              <div className="flex items-start gap-5 pb-3 min-h-[400px]">
                <KanbanLane
                  id="pendiente"
                  title="Pendientes"
                  tasks={filtered.filter(t => t.estado === "pendiente")}
                  onToggle={handleToggle}
                  onEdit={openEdit}
                  onAddNew={openNew}
                />
                <KanbanLane
                  id="urgente"
                  title="Urgentes"
                  tasks={filtered.filter(t => t.estado === "urgente")}
                  onToggle={handleToggle}
                  onEdit={openEdit}
                  onAddNew={openNew}
                />
                <KanbanLane
                  id="completada"
                  title="Completadas"
                  tasks={filtered.filter(t => t.estado === "completada")}
                  onToggle={handleToggle}
                  onEdit={openEdit}
                  onAddNew={openNew}
                />
              </div>
              <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
                {activeDragTask ? (
                  <KanbanCardContent
                    task={activeDragTask}
                    onToggle={handleToggle}
                    onEdit={openEdit}
                    isDragging
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        ) : (
          <div className="p-4">
            <GanttBoard tasks={filtered} onEdit={openEdit} onUpdatePlazo={handleUpdatePlazo} />
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <TaskModal
          task={editTask}
          clients={clients}
          clientsLoading={clientsLoading}
          clientsError={clientsError}
          onClose={() => { setShowModal(false); setEditTask(null); setErrorMsg(null); }}
          onSave={handleSave}
          onDelete={handleDelete}
          saving={saving}
          errorMsg={errorMsg}
          getToken={getToken}
          initialClientId={modalInitialClientId}
          initialForm={modalInitialForm}
        />
      )}
    </div>
  );
}
