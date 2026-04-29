import React, {
  useEffect, useState, useCallback, useMemo, useRef,
} from "react";
import { useAuth } from "@clerk/clerk-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2, Circle, AlertTriangle, Clock, Plus, X,
  Loader2, Search, Filter, Trash2, Edit3, Flag,
  Briefcase, Users, Calendar, ChevronRight,
} from "lucide-react";
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
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <span className="font-bold text-slate-800 text-sm">{task ? "Editar tarea" : "Nueva tarea"}</span>
          <BackButton onClick={onClose} />
        </div>

        {errorMsg && (
          <div className="px-5 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700 font-medium">{errorMsg}</div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 overflow-y-auto max-h-[72vh]">
          {/* Cliente */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Cliente <span className="text-red-500">*</span></label>
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              required
              disabled={!!task || clientsLoading}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-red-400 bg-white disabled:opacity-60"
            >
              <option value="">— Selecciona un cliente —</option>
              {clientsLoading && <option value="">— Cargando clientes… —</option>}
              {clientsError && !clientsLoading && <option value="">— No se pudieron cargar los clientes —</option>}
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {clientsError && !clientsLoading && (
              <p className="mt-1 text-[11px] font-medium text-amber-600">{clientsError}</p>
            )}
          </div>

          {/* Título */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Título <span className="text-red-500">*</span></label>
            <input
              value={form.titulo}
              onChange={e => set("titulo", e.target.value)}
              required
              placeholder="Descripción breve de la tarea…"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400"
            />
          </div>

          {/* Tipo + Prioridad */}
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

          {/* Estado + Plazo */}
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

          {/* Expediente ref */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Ref. Expediente</label>
            <input value={form.expediente} onChange={e => set("expediente", e.target.value)}
              placeholder="Ej: EXP/2024/001"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400" />
          </div>

          {/* Juzgado + Nº Proc */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Juzgado / Tribunal</label>
              <input value={form.juzgado} onChange={e => set("juzgado", e.target.value)}
                placeholder="Juzgado nº…"
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nº Procedimiento</label>
              <input value={form.num_proc} onChange={e => set("num_proc", e.target.value)}
                placeholder="123/2024"
                className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400" />
            </div>
          </div>

          {/* Etapa */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">🏷️ Etapa</label>
            <EtapaSelect value={form.etapa} onChange={v => set("etapa", v)} getToken={getToken} />
          </div>

          {/* Fecha aviso + Importe */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">🔔 Fecha de aviso</label>
              <input type="date" value={form.fecha_aviso} onChange={e => set("fecha_aviso", e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
              <p className="text-[10px] text-slate-400 mt-0.5">Recordatorio antes del plazo</p>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">💶 Importe (€)</label>
              <input type="number" step="0.01" min="0" value={form.importe}
                onChange={e => set("importe", e.target.value)}
                placeholder="0,00"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
              <p className="text-[10px] text-slate-400 mt-0.5">Honorarios, tasas, pagos...</p>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Instrucciones / Contexto</label>
            <textarea value={form.descripcion} onChange={e => set("descripcion", e.target.value)}
              rows={2} placeholder="Descripción o contexto adicional…"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400 resize-none" />
          </div>

          {/* Notas internas */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">📝 Notas internas</label>
            <textarea value={form.notas} onChange={e => set("notas", e.target.value)}
              rows={2} placeholder="Observaciones internas del letrado…"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400 resize-none" />
          </div>

          {/* Botones */}
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

// ── Componente tarjeta de tarea ───────────────────────────────────────────────
function TaskCard({
  task,
  onToggle,
  onEdit,
}: {
  task: Task;
  onToggle: (id: string, newEstado: string) => void;
  onEdit: (t: Task) => void;
}) {
  const navigate = useNavigate();
  const overdue  = isOverdue(task.plazo, task.estado);
  const days     = daysUntil(task.plazo);
  const tipoConf = TIPO_CONFIG[task.tipo] || TIPO_CONFIG.otro;
  const prioConf = PRIO_CONFIG[task.prioridad] || PRIO_CONFIG.media;
  const done     = task.estado === "completada";

  return (
    <div className={`bg-white rounded-xl border transition-all group ${
      task.estado === "urgente" ? "border-red-200 shadow-sm shadow-red-100"
      : done ? "border-slate-100 opacity-60"
      : "border-slate-200 hover:shadow-sm"
    }`}>
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Prioridad bar */}
        <div className={`w-0.5 self-stretch rounded-full shrink-0 ${prioConf.bar}`} />

        {/* Checkbox */}
        <button
          onClick={() => onToggle(task.id, done ? "pendiente" : "completada")}
          className="mt-0.5 shrink-0 text-slate-400 hover:text-emerald-500 transition-colors"
          title={done ? "Marcar pendiente" : "Marcar completada"}
        >
          {done
            ? <CheckCircle2 size={18} className="text-emerald-500" />
            : <Circle size={18} />
          }
        </button>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-tight ${done ? "line-through text-slate-400" : "text-slate-800"}`}>
            {task.titulo}
          </p>

          {task.descripcion && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{task.descripcion}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {/* Cliente */}
            <button
              onClick={() => task.client_id && navigate(`/dashboard/clientes/${task.client_id}`)}
              className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-semibold"
            >
              <Users size={9} /> {clientName(task)}
            </button>

            {/* Expediente */}
            {(task.expediente || task.expediente_id) && (
              <button
                onClick={() => task.expediente_id && navigate(`/dashboard/expedientes/${task.expediente_id}`)}
                className={`flex items-center gap-1 text-[10px] font-semibold ${task.expediente_id ? "text-violet-600 hover:text-violet-800" : "text-slate-400"}`}
              >
                <Briefcase size={9} /> {task.expediente || "Expediente"}
              </button>
            )}

            {/* Tipo badge */}
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tipoConf.color}`}>
              {tipoConf.label}
            </span>

            {/* Fecha límite */}
            {task.plazo && (
              <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${
                overdue ? "text-red-600" : days !== null && days <= 3 ? "text-amber-600" : "text-slate-500"
              }`}>
                <Clock size={9} />
                {overdue ? "VENCIDA · " : ""}
                {fmtDate(task.plazo)}
                {days !== null && !overdue && days <= 7 && (
                  <span className="ml-0.5">· {days === 0 ? "hoy" : `${days}d`}</span>
                )}
              </span>
            )}

            {/* Estado urgente */}
            {task.estado === "urgente" && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-600">
                <Flag size={9} /> Urgente
              </span>
            )}

            {/* Fecha aviso */}
            {(task as any).fecha_aviso && (
              <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${
                new Date((task as any).fecha_aviso) < new Date() && !done ? "text-amber-600" : "text-slate-400"
              }`}>
                🔔 {fmtDate((task as any).fecha_aviso)}
              </span>
            )}

            {/* Importe */}
            {(task as any).importe != null && Number((task as any).importe) > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600">
                💶 {Number((task as any).importe).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
              </span>
            )}

            {/* Etapa */}
            {(task as any).etapa && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                🏷️ {(task as any).etapa}
              </span>
            )}
          </div>

          {/* Notas internas */}
          {(task as any).notas && !done && (
            <div className="mt-1.5 px-2 py-1 bg-amber-50 border border-amber-100 rounded-lg text-[10px] text-amber-800 leading-relaxed">
              <span className="font-bold">📝 </span>{(task as any).notas}
            </div>
          )}
        </div>

        {/* Editar */}
        <button
          onClick={() => onEdit(task)}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all shrink-0"
        >
          <Edit3 size={13} />
        </button>
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
  const [tab,         setTab]         = useState<"todas" | "plazos">("todas");
  const [filterEstado, setFilterEstado] = useState("");
  const [filterTipo,   setFilterTipo]   = useState("");
  const [filterPrio,   setFilterPrio]   = useState("");
  const [search,       setSearch]       = useState("");
  const [showFilters,  setShowFilters]  = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editTask,  setEditTask]  = useState<Task | null>(null);
  const [modalInitialClientId, setModalInitialClientId] = useState("");
  const [modalInitialForm, setModalInitialForm] = useState<TaskFormData | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const prefillHandledRef = useRef("");

  const fetchClients = useCallback(async () => {
    setClientsLoading(true);
    setClientsError(null);
    try {
      const token = await getToken({ skipCache: true });
      const clientsRes = await fetch("/api/entities?limit=500", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const clientsData = await safeJson(clientsRes);
      if (!clientsRes.ok) {
        setClientsError(clientsData?.error || "No se pudieron cargar los clientes");
        return;
      }
      const mapped = (clientsData.data || []).map((c: any) => ({
        id: c.id,
        name:
          c.commercial_name ||
          `${c.first_name || ""} ${c.last_name || ""}`.trim() ||
          c.nif_cif ||
          c.internal_number ||
          c.id,
      }));
      setClients(mapped);
      if (mapped.length === 0) {
        setClientsError("No hay clientes disponibles para asignar a la tarea");
      }
    } catch (_e) {
      setClientsError("Error de conexión al cargar clientes");
    } finally {
      setClientsLoading(false);
    }
  }, [getToken]);

  const fetchTasks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const tasksRes = await fetch("/api/tasks/me", { headers: { Authorization: `Bearer ${token}` } });
      const tasksData = await safeJson(tasksRes);
      if (tasksRes.ok)   setTasks(tasksData.data || []);
    } catch (_e) {}
    finally { if (!silent) setLoading(false); }
  }, [getToken]);

  useEffect(() => {
    fetchTasks();
    fetchClients();
  }, [fetchTasks, fetchClients]);
  useAutoRefresh(() => fetchTasks(true), { intervalMs: 30_000 });

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "plazos" || tabParam === "todas") {
      setTab(tabParam);
    }

    if (searchParams.get("open") !== "new") return;

    const signature = searchParams.toString();
    if (prefillHandledRef.current === signature) return;
    prefillHandledRef.current = signature;

    setEditTask(null);
    setErrorMsg(null);
    setModalInitialClientId(searchParams.get("clientId") || "");
    setModalInitialForm({
      ...emptyForm(),
      tipo: searchParams.get("tipo") || "otro",
    });
    setShowModal(true);
    if (clients.length === 0) fetchClients();

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("open");
    nextParams.delete("clientId");
    nextParams.delete("tipo");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, clients.length, fetchClients]);

  // Filtrado
  const filtered = useMemo(() => {
    let list = tasks;
    if (tab === "plazos") list = list.filter(t => !!t.plazo);
    if (filterEstado) list = list.filter(t => t.estado === filterEstado);
    if (filterTipo)   list = list.filter(t => t.tipo   === filterTipo);
    if (filterPrio)   list = list.filter(t => t.prioridad === filterPrio);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(t =>
      (t.titulo || "").toLowerCase().includes(q) ||
      (clientName(t)).toLowerCase().includes(q) ||
      (t.expediente || "").toLowerCase().includes(q) ||
      (t.descripcion || "").toLowerCase().includes(q)
    );
    return list;
  }, [tasks, tab, filterEstado, filterTipo, filterPrio, search]);

  // Stats
  const stats = useMemo(() => ({
    vencidas:   tasks.filter(t => isOverdue(t.plazo, t.estado)).length,
    urgentes:   tasks.filter(t => t.estado === "urgente").length,
    pendientes: tasks.filter(t => t.estado === "pendiente").length,
    completadas:tasks.filter(t => t.estado === "completada").length,
  }), [tasks]);

  const hasFilter = !!(filterEstado || filterTipo || filterPrio || search);

  // Cambiar estado rápido
  const handleToggle = async (id: string, newEstado: string) => {
    const token = await getToken({ skipCache: true });
    await fetch(`/api/tasks/${id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ estado: newEstado }),
    });
    fetchTasks(true);
  };

  // Guardar tarea (create / update)
  const handleSave = async (clientId: string, data: TaskFormData) => {
    setSaving(true); setErrorMsg(null);
    try {
      const token = await getToken({ skipCache: true });
      const url    = editTask ? `/api/tasks/${editTask.id}` : `/api/tasks/client/${clientId}`;
      const method = editTask ? "PUT" : "POST";
      const res = await fetch(url, {
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

  // Eliminar tarea
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

  const openNew  = () => {
    setEditTask(null);
    setErrorMsg(null);
    setModalInitialClientId("");
    setModalInitialForm(null);
    setShowModal(true);
    if (clients.length === 0) fetchClients();
  };
  const openEdit = (t: Task) => {
    setEditTask(t);
    setErrorMsg(null);
    setModalInitialClientId("");
    setModalInitialForm(null);
    setShowModal(true);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">

      {/* ── Cabecera ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-red-50 rounded-xl flex items-center justify-center">
            <CheckCircle2 size={18} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900 leading-tight">Tareas y Plazos</h1>
            <p className="text-xs text-slate-400">Solo tus tareas asignadas</p>
          </div>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm"
        >
          <Plus size={13} /> Nueva tarea
        </button>
      </div>

      {/* ── Stats ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Vencidas",   val: stats.vencidas,   cls: "text-red-600",     bg: "bg-red-50 border-red-100"     },
          { label: "Urgentes",   val: stats.urgentes,   cls: "text-orange-600",  bg: "bg-orange-50 border-orange-100"},
          { label: "Pendientes", val: stats.pendientes, cls: "text-amber-600",   bg: "bg-amber-50 border-amber-100"  },
          { label: "Completadas",val: stats.completadas,cls: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100"},
        ].map(s => (
          <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.bg}`}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
            <p className={`text-2xl font-extrabold mt-0.5 ${s.cls}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* ── Tabs + Filtros ────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Tabs */}
        {(["todas", "plazos"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
              tab === t
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {t === "todas" ? "Todas" : "Solo con plazo"}
          </button>
        ))}

        <div className="flex-1" />

        {/* Búsqueda */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
          <Search size={12} className="text-slate-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar tarea o cliente…"
            className="bg-transparent text-xs text-slate-700 placeholder-slate-300 focus:outline-none w-40"
          />
          {search && <button onClick={() => setSearch("")}><X size={11} className="text-slate-400" /></button>}
        </div>

        {/* Filtrar */}
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
            showFilters || hasFilter
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Filter size={11} /> Filtrar
          {hasFilter && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
        </button>
      </div>

      {/* Filtros expandibles */}
      {showFilters && (
        <div className="flex items-center gap-2 flex-wrap bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Estado:</span>
            {["pendiente", "urgente", "completada"].map(e => (
              <button key={e} onClick={() => setFilterEstado(filterEstado === e ? "" : e)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
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
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
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

      {/* ── Lista de tareas ───────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
          <CheckCircle2 size={32} className="opacity-20" />
          <p className="font-semibold text-slate-500">
            {hasFilter || tab === "plazos" ? "Sin tareas con esos filtros" : "No tienes tareas todavía"}
          </p>
          {!hasFilter && tab === "todas" && (
            <button onClick={openNew} className="text-sm font-bold text-red-500 hover:underline">
              + Crear primera tarea
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Vencidas al top */}
          {filtered.some(t => isOverdue(t.plazo, t.estado)) && (
            <>
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest px-1 flex items-center gap-1">
                <AlertTriangle size={10} /> Vencidas
              </p>
              {filtered.filter(t => isOverdue(t.plazo, t.estado)).map(t => (
                <TaskCard key={t.id} task={t} onToggle={handleToggle} onEdit={openEdit} />
              ))}
              {filtered.some(t => !isOverdue(t.plazo, t.estado)) && (
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 pt-2">Resto</p>
              )}
            </>
          )}
          {filtered.filter(t => !isOverdue(t.plazo, t.estado)).map(t => (
            <TaskCard key={t.id} task={t} onToggle={handleToggle} onEdit={openEdit} />
          ))}
        </div>
      )}

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
