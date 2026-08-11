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
  AlignJustify, LayoutList, BarChart2, Zap, Paperclip,
  Download, FileText, ChevronRight, ChevronLeft, MessageSquare,
  Upload, Check,
} from "lucide-react";
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  useSensors, useSensor, PointerSensor, TouchSensor, MeasuringStrategy,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent, Modifier } from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import { PlazoCalculator } from "../components/PlazoCalculator";
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
  etapa?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface TaskEtapa {
  id: string;
  nombre: string;
  orden: number;
}

interface TaskFile {
  id: string;
  original_name: string;
  mimetype: string;
  size_bytes: number;
  created_at: string;
  document_name?: string | null;
  attachment_type?: string | null;
}

// ── Config ────────────────────────────────────────────────────────────────────
const TIPO_CONFIG: Record<string, { label: string; color: string; bar: string }> = {
  plazo_procesal: { label: "Plazo procesal",  color: "bg-red-100 text-red-700",         bar: "bg-red-400"     },
  vista_juicio:   { label: "Vista / Juicio",  color: "bg-purple-100 text-purple-700",   bar: "bg-purple-400"  },
  notificacion:   { label: "Notificación",    color: "bg-blue-100 text-blue-700",       bar: "bg-blue-400"    },
  reunion:        { label: "Reunión",         color: "bg-green-100 text-green-700",     bar: "bg-green-400"   },
  escrito:        { label: "Escrito",         color: "bg-indigo-100 text-indigo-700",   bar: "bg-indigo-400"  },
  gestion:        { label: "Gestión",         color: "bg-amber-100 text-amber-700",     bar: "bg-amber-400"   },
  pago:           { label: "Pago",            color: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-400" },
  llamada:        { label: "Llamada",         color: "bg-teal-100 text-teal-700",       bar: "bg-teal-400"    },
  diligencia:     { label: "Diligencia",      color: "bg-orange-100 text-orange-700",   bar: "bg-orange-400"  },
  otro:           { label: "Otro",            color: "bg-slate-100 text-slate-600",     bar: "bg-slate-300"   },
};

const ESTADO_CONFIG: Record<string, { label: string; cls: string }> = {
  pendiente:  { label: "Pendiente",  cls: "text-amber-600"   },
  urgente:    { label: "Urgente",    cls: "text-rose-600"    },
  completada: { label: "Completada", cls: "text-emerald-600" },
};

const PRIO_CONFIG: Record<string, { label: string }> = {
  alta:  { label: "Alta"  },
  media: { label: "Media" },
  baja:  { label: "Baja"  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
function isOverdue(plazo: string | null, estado: string): boolean {
  if (!plazo || estado === "completada") return false;
  // Compara solo fechas de calendario (no el instante exacto): así una tarea con
  // vencimiento "hoy" no aparece vencida horas antes de que el día termine.
  const n = new Date();
  const todayYMD = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  return plazo.slice(0, 10) < todayYMD;
}
function daysUntil(plazo: string | null): number | null {
  if (!plazo) return null;
  return Math.ceil((new Date(plazo).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
}
const clientName = (t: Task) => t.client_name_resolved || t.client_name || "—";
type TaskView = "list" | "kanban" | "gantt";

// ── TaskFormData ───────────────────────────────────────────────────────────────
interface TaskFormData {
  titulo: string; descripcion: string; plazo: string; fecha_aviso: string; estado: string;
  prioridad: string; tipo: string; expediente: string; juzgado: string; num_proc: string;
  importe: string; notas: string; etapa: string;
}
const emptyForm = (): TaskFormData => ({
  titulo: "", descripcion: "", plazo: "", fecha_aviso: "", estado: "pendiente",
  prioridad: "media", tipo: "otro", expediente: "", juzgado: "", num_proc: "",
  importe: "", notas: "", etapa: "",
});

// ── Panel lateral de tarea ────────────────────────────────────────────────────
function TaskPanel({
  task, clients, clientsLoading, clientsError,
  onClose, onSave, onDelete, saving, errorMsg, getToken,
  initialClientId = "", initialForm = null,
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
  const buildForm = useCallback((): TaskFormData => (
    task ? {
      titulo: task.titulo,
      descripcion: task.descripcion || "",
      plazo: task.plazo ? task.plazo.slice(0, 10) : "",
      fecha_aviso: (task as any).fecha_aviso ? (task as any).fecha_aviso.slice(0, 10) : "",
      estado: task.estado, prioridad: task.prioridad, tipo: task.tipo,
      expediente: task.expediente || "", juzgado: task.juzgado || "", num_proc: task.num_proc || "",
      importe: (task as any).importe != null ? String((task as any).importe) : "",
      notas: (task as any).notas || "", etapa: (task as any).etapa || "",
    } : (initialForm || emptyForm())
  ), [task, initialForm]);

  const [form, setForm] = useState<TaskFormData>(buildForm);
  const [clientId, setClientId] = useState(task?.client_id || initialClientId);
  const [activeTab, setActiveTab] = useState<"detalles" | "archivos" | "notas">("detalles");
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof TaskFormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    setForm(buildForm());
    setClientId(task?.client_id || initialClientId);
    setActiveTab("detalles");
    setFiles([]);
  }, [buildForm, task, initialClientId]);

  const loadFiles = useCallback(async () => {
    if (!task?.id) return;
    setFilesLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/${task.id}/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setFiles(data.data || []);
    } catch {}
    setFilesLoading(false);
  }, [task?.id, getToken]);

  useEffect(() => {
    if (activeTab === "archivos" && task?.id) loadFiles();
  }, [activeTab, task?.id, loadFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected?.length || !task?.id) return;
    setUploading(true);
    try {
      const token = await getToken({ skipCache: true });
      const fd = new FormData();
      for (const f of Array.from(selected)) fd.append("files", f);
      const res = await fetch(`/api/tasks/${task.id}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) await loadFiles();
    } catch {}
    setUploading(false);
    e.target.value = "";
  };

  const handleDownload = async (file: TaskFile) => {
    if (!task?.id) return;
    setDownloadingFile(file.id);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/${task.id}/files/${file.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = file.original_name; a.click();
      URL.revokeObjectURL(url);
    } catch {}
    setDownloadingFile(null);
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!task?.id) return;
    setDeletingFile(fileId);
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/tasks/${task.id}/files/${fileId}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      setFiles(prev => prev.filter(f => f.id !== fileId));
    } catch {}
    setDeletingFile(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return;
    onSave(clientId, form);
  };

  const handleQuickComplete = () => {
    if (!task || !clientId) return;
    onSave(clientId, { ...form, estado: "completada" });
  };

  const tipoConf = TIPO_CONFIG[form.tipo] || TIPO_CONFIG.otro;
  const overdue  = isOverdue(task?.plazo ?? null, task?.estado ?? "pendiente");
  const done     = task?.estado === "completada";

  const tabs = [
    { key: "detalles", label: "Detalles" },
    { key: "archivos", label: files.length > 0 ? `Archivos (${files.length})` : "Archivos" },
    { key: "notas",    label: "Notas" },
  ] as const;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex">
      <div className="flex-1 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="w-full max-w-[540px] bg-white flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-300 overflow-hidden">

        {/* Header */}
        <div className={`shrink-0 px-5 py-4 border-b border-slate-100 ${overdue && !done ? "bg-red-50/60" : "bg-white"}`}>
          <div className="flex items-center gap-3">
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0">
              <X size={16} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${tipoConf.color}`}>
                  {tipoConf.label}
                </span>
                {overdue && !done && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                    <AlertTriangle size={9} /> Vencida
                  </span>
                )}
              </div>
              <h2 className="text-sm font-bold text-slate-800 mt-1 truncate">
                {task ? task.titulo : "Nueva actuación"}
              </h2>
              {task && (
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  {clientName(task)}{task.expediente ? ` · ${task.expediente}` : ""}
                </div>
              )}
            </div>
            {task && !done && (
              <button onClick={handleQuickComplete} disabled={saving}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50">
                <CheckCircle2 size={13} /> Completar
              </button>
            )}
            {task && (
              <button onClick={() => onDelete(task.id)} disabled={saving}
                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Tabs (solo tareas existentes) */}
        {task && (
          <div className="shrink-0 flex border-b border-slate-100 bg-slate-50/50">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                  activeTab === t.key
                    ? "border-b-2 border-red-500 text-red-600 bg-white"
                    : "text-slate-500 hover:text-slate-700"
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {errorMsg && (
          <div className="shrink-0 px-5 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700 font-medium">
            {errorMsg}
          </div>
        )}

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto">

          {/* Tab Detalles */}
          {activeTab === "detalles" && (
            <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Cliente <span className="text-red-500">*</span>
                </label>
                <select value={clientId} onChange={e => setClientId(e.target.value)} required
                  disabled={!!task || clientsLoading}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-red-400 bg-white disabled:opacity-60 disabled:bg-slate-50">
                  <option value="">— Selecciona un cliente —</option>
                  {clientsLoading && <option value="">Cargando…</option>}
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {clientsError && !clientsLoading && (
                  <p className="mt-1 text-[11px] text-amber-600 font-medium">{clientsError}</p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Título <span className="text-red-500">*</span>
                </label>
                <input value={form.titulo} onChange={e => set("titulo", e.target.value)} required
                  placeholder="Nombre de la actuación…"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-red-400 text-slate-800" />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Estado</label>
                  <select value={form.estado} onChange={e => set("estado", e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-red-400 bg-white text-slate-700">
                    <option value="pendiente">Pendiente</option>
                    <option value="urgente">Urgente</option>
                    <option value="completada">Completada</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Prioridad</label>
                  <select value={form.prioridad} onChange={e => set("prioridad", e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-red-400 bg-white text-slate-700">
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tipo</label>
                  <select value={form.tipo} onChange={e => set("tipo", e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-red-400 bg-white text-slate-700">
                    {Object.entries(TIPO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">📅 Fecha límite</label>
                  <input type="date" value={form.plazo} onChange={e => set("plazo", e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
                  <PlazoCalculator onCalculate={(d) => set("plazo", d)} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">🔔 Aviso</label>
                  <input type="date" value={form.fecha_aviso} onChange={e => set("fecha_aviso", e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">🏷️ Etapa</label>
                <EtapaSelect value={form.etapa} onChange={v => set("etapa", v)} getToken={getToken} />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Ref. Expediente</label>
                <input value={form.expediente} onChange={e => set("expediente", e.target.value)} placeholder="EXP/2024/001"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400" />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Juzgado</label>
                  <input value={form.juzgado} onChange={e => set("juzgado", e.target.value)} placeholder="Juzgado nº…"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nº Proc.</label>
                  <input value={form.num_proc} onChange={e => set("num_proc", e.target.value)} placeholder="123/2024"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">💶 Importe (€)</label>
                <input type="number" step="0.01" min="0" value={form.importe} onChange={e => set("importe", e.target.value)} placeholder="0,00"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Instrucciones / Contexto</label>
                <textarea value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={3}
                  placeholder="Descripción o contexto adicional…"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-red-400 resize-none" />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button type="submit" disabled={saving || !form.titulo.trim() || !clientId}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 transition-colors">
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  {task ? "Guardar cambios" : "Crear actuación"}
                </button>
                <button type="button" onClick={onClose}
                  className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {/* Tab Archivos */}
          {activeTab === "archivos" && (
            <div className="p-5 flex flex-col gap-4">
              <input ref={fileInputRef} type="file" multiple hidden onChange={handleUpload} />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-semibold text-slate-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50/30 transition-all disabled:opacity-50">
                {uploading
                  ? <><Loader2 size={15} className="animate-spin" /> Subiendo…</>
                  : <><Upload size={15} /> Subir archivos</>}
              </button>

              {filesLoading ? (
                <div className="flex justify-center py-8"><Spinner size="sm" muted /></div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                  <Paperclip size={28} className="opacity-30" />
                  <span className="text-sm font-medium">Sin archivos adjuntos</span>
                  <span className="text-xs text-center">Sube documentos, escritos o adjuntos relacionados con esta actuación</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {files.map(f => (
                    <div key={f.id}
                      className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                        <FileText size={15} className="text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-slate-800 truncate">
                          {f.document_name || f.original_name}
                        </div>
                        <div className="text-[11px] text-slate-400">{fmtSize(f.size_bytes)} · {fmtDate(f.created_at)}</div>
                      </div>
                      <button onClick={() => handleDownload(f)} disabled={downloadingFile === f.id}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                        title="Descargar">
                        {downloadingFile === f.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                      </button>
                      <button onClick={() => handleDeleteFile(f.id)} disabled={deletingFile === f.id}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Eliminar">
                        {deletingFile === f.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab Notas */}
          {activeTab === "notas" && (
            <div className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Notas internas del letrado
                </label>
                <textarea value={form.notas} onChange={e => set("notas", e.target.value)} rows={12}
                  placeholder="Observaciones, instrucciones internas, recordatorios…"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none focus:border-red-400 resize-none text-slate-700 leading-relaxed" />
              </div>
              <button onClick={() => task && clientId && onSave(clientId, form)} disabled={saving || !task}
                className="flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 transition-colors">
                {saving && <Loader2 size={13} className="animate-spin" />}
                Guardar notas
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Barra de acciones en batch ─────────────────────────────────────────────────
function BulkActionBar({ count, onComplete, onDelete, onClear }: {
  count: number;
  onComplete: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return createPortal(
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] animate-in slide-in-from-bottom duration-200">
      <div className="flex items-center gap-1 bg-slate-900 text-white rounded-2xl shadow-2xl px-4 py-2.5 border border-slate-700">
        <span className="text-xs font-bold text-slate-300 pr-3 border-r border-slate-600">
          {count} seleccionada{count !== 1 ? "s" : ""}
        </span>
        <button onClick={onComplete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-400 hover:bg-emerald-400/10 transition-colors">
          <CheckCircle2 size={13} /> Completar
        </button>
        <button onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-400 hover:bg-red-400/10 transition-colors">
          <Trash2 size={13} /> Eliminar
        </button>
        <button onClick={onClear}
          className="ml-1 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
          <X size={14} />
        </button>
      </div>
    </div>,
    document.body
  );
}

// ── Fila de lista ─────────────────────────────────────────────────────────────
function TaskRow({
  task, onToggle, onEdit, selected, onSelect,
}: {
  task: Task;
  onToggle: (id: string, newEstado: string) => void;
  onEdit: (t: Task) => void;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const navigate  = useNavigate();
  const overdue   = isOverdue(task.plazo, task.estado);
  const done      = task.estado === "completada";
  const tipoConf  = TIPO_CONFIG[task.tipo] || TIPO_CONFIG.otro;
  const days      = daysUntil(task.plazo);

  return (
    <div className={`group flex items-center border-b border-slate-100 last:border-0 transition-colors min-h-[58px] relative
      ${selected ? "bg-red-50/40" : overdue && !done ? "hover:bg-red-50/20" : done ? "opacity-60 hover:bg-slate-50/30" : "hover:bg-slate-50/50"}
    `}>
      {/* Barra de color por tipo */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full ${tipoConf.bar} opacity-60`} />

      {/* Checkbox selección múltiple */}
      <div className="w-10 flex items-center justify-center shrink-0 pl-2">
        <button
          onClick={e => { e.stopPropagation(); onSelect(task.id); }}
          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
            selected
              ? "bg-red-600 border-red-600"
              : "border-slate-300 hover:border-red-400 group-hover:opacity-100 opacity-0"
          }`}>
          {selected && <Check size={10} className="text-white" strokeWidth={3} />}
        </button>
      </div>

      {/* Checkbox completar */}
      <div className="w-10 flex items-center justify-center shrink-0">
        <button
          onClick={e => { e.stopPropagation(); onToggle(task.id, done ? "pendiente" : "completada"); }}
          className="text-slate-300 hover:text-emerald-500 transition-colors">
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
            className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:underline">
            <Users size={9} /> {clientName(task)}
          </button>
          {(task.expediente || task.expediente_id) && (
            <button
              onClickCapture={e => { e.stopPropagation(); task.expediente_id && navigate(`/dashboard/expedientes/${task.expediente_id}`); }}
              className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:underline">
              <Briefcase size={9} /> {task.expediente || "Expediente"}
            </button>
          )}
          {(task as any).etapa && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-indigo-600">
              🏷 {(task as any).etapa}
            </span>
          )}
          {(task as any).notas && (
            <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5 max-w-[140px] truncate">
              <MessageSquare size={8} /> {(task as any).notas}
            </span>
          )}
        </div>
      </div>

      {/* Tipo */}
      <div className="w-[130px] hidden md:flex items-center justify-center shrink-0 px-2">
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg truncate ${tipoConf.color}`}>
          {tipoConf.label}
        </span>
      </div>

      {/* Fecha límite */}
      <div className="w-[130px] hidden sm:flex items-center shrink-0 px-2">
        {task.plazo ? (
          <div className="flex flex-col gap-0.5">
            <span className={`flex items-center gap-1 text-xs font-medium ${
              overdue && !done ? "text-red-600 font-bold" :
              days !== null && days <= 3 && !done ? "text-amber-600 font-bold" :
              "text-slate-500"
            }`}>
              {overdue && !done && <AlertTriangle size={9} className="shrink-0" />}
              {fmtDate(task.plazo)}
            </span>
            {days !== null && !overdue && !done && days <= 7 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md w-fit ${
                days === 0 ? "bg-amber-100 text-amber-700" :
                days <= 3  ? "bg-orange-100 text-orange-700" :
                             "bg-slate-100 text-slate-500"
              }`}>
                {days === 0 ? "Hoy" : `${days}d`}
              </span>
            )}
          </div>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </div>

      {/* Estado */}
      <div className="w-[110px] flex items-center justify-center shrink-0 px-2 pr-4">
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
          done ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
          task.estado === "urgente" ? "bg-rose-50 text-rose-600 border-rose-200" :
          "bg-amber-50 text-amber-600 border-amber-200"
        }`}>
          {ESTADO_CONFIG[task.estado]?.label}
        </span>
      </div>
    </div>
  );
}

// ── Kanban ────────────────────────────────────────────────────────────────────
// Id especial para la columna "Sin etapa" (dnd-kit necesita un id estable no vacio)
const KANBAN_SIN_ETAPA_ID = "__sin_etapa__";

const KANBAN_PALETTE = [
  { accent: "#6366f1", badgeCls: "bg-indigo-100 text-indigo-700" },
  { accent: "#0ea5e9", badgeCls: "bg-sky-100 text-sky-700"       },
  { accent: "#10b981", badgeCls: "bg-emerald-100 text-emerald-700" },
  { accent: "#f59e0b", badgeCls: "bg-amber-100 text-amber-700"   },
  { accent: "#ec4899", badgeCls: "bg-pink-100 text-pink-700"     },
  { accent: "#8b5cf6", badgeCls: "bg-violet-100 text-violet-700" },
  { accent: "#ef4444", badgeCls: "bg-red-100 text-red-700"       },
  { accent: "#14b8a6", badgeCls: "bg-teal-100 text-teal-700"     },
] as const;
function kanbanColorForIndex(i: number) {
  return KANBAN_PALETTE[i % KANBAN_PALETTE.length];
}

// Fuerza a que el CENTRO de la tarjeta arrastrada coincida siempre con la posicion
// real del puntero, sin importar en que punto de la tarjeta se hizo clic. Por
// defecto dnd-kit conserva el offset relativo del clic original, lo que puede
// hacer que la tarjeta "fantasma" se sienta lejos del cursor si se agarro cerca
// de un borde.
const kanbanCenterOnCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !activatorEvent) return transform;
  const pointer = getEventCoordinates(activatorEvent);
  if (!pointer) return transform;
  return {
    ...transform,
    x: transform.x + (pointer.x - draggingNodeRect.left - draggingNodeRect.width / 2),
    y: transform.y + (pointer.y - draggingNodeRect.top - draggingNodeRect.height / 2),
  };
};

function KanbanCardContent({
  task, onToggle, onEdit, isDragging = false,
}: {
  task: Task;
  onToggle: (id: string, newEstado: string) => void;
  onEdit:   (t: Task) => void;
  isDragging?: boolean;
}) {
  const navigate = useNavigate();
  const overdue  = isOverdue(task.plazo, task.estado);
  const days     = daysUntil(task.plazo);
  const tipoConf = TIPO_CONFIG[task.tipo] || TIPO_CONFIG.otro;
  const done     = task.estado === "completada";

  return (
    <div className={`bg-white rounded-xl border overflow-hidden flex flex-col select-none transition-all
      ${isDragging
        ? "shadow-2xl ring-2 ring-indigo-400/40 scale-[1.02] rotate-1"
        : "shadow-sm hover:shadow-md border-slate-200 hover:border-slate-300"}
    `}>
      <div className={`h-[3px] w-full ${tipoConf.bar}`} />
      <div className="p-3.5 flex flex-col gap-3">
        <div className="flex items-start gap-2.5">
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onToggle(task.id, done ? "pendiente" : "completada"); }}
            className="mt-0.5 shrink-0 text-slate-300 hover:text-emerald-500 transition-colors">
            {done ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Circle size={16} />}
          </button>
          <div className="flex-1 min-w-0">
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onEdit(task); }}
              className="text-left w-full group/title">
              <span className={`text-[13px] font-bold leading-snug block group-hover/title:text-red-600 transition-colors
                ${done ? "line-through text-slate-400" : "text-slate-800"}`}>
                {task.titulo}
              </span>
            </button>
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); task.client_id && navigate(`/dashboard/clientes/${task.client_id}`); }}
              className="text-[10px] text-slate-500 hover:text-blue-600 hover:underline font-medium mt-0.5 text-left truncate block max-w-full">
              {clientName(task)}
            </button>
          </div>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onEdit(task); }}
            className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <ChevronRight size={12} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${tipoConf.color}`}>{tipoConf.label}</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
            {(PRIO_CONFIG[task.prioridad] ?? PRIO_CONFIG.media).label}
          </span>
          {overdue && !done && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md">
              <AlertTriangle size={9} /> Vencida
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-2">
            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase mb-0.5">
              <Users size={8} /> Cliente
            </div>
            <div className="text-[10px] font-bold text-slate-700 truncate">{clientName(task)}</div>
          </div>
          <div className={`rounded-lg p-2 border ${overdue && !done ? "bg-red-50/70 border-red-100" : "bg-slate-50 border-slate-100"}`}>
            <div className={`flex items-center gap-1 text-[9px] font-bold uppercase mb-0.5 ${overdue && !done ? "text-red-400" : "text-slate-400"}`}>
              <Calendar size={8} /> Límite
            </div>
            <div className={`text-[10px] font-bold truncate ${overdue && !done ? "text-red-600" : "text-slate-700"}`}>
              {task.plazo ? fmtDate(task.plazo) : "Sin fecha"}
              {days !== null && !overdue && !done && days <= 7 && (
                <span className="ml-1 text-slate-400 font-normal">{days === 0 ? "hoy" : `${days}d`}</span>
              )}
            </div>
          </div>
        </div>

        {(task.expediente || task.juzgado) && (
          <div className="flex flex-col gap-1 pt-2.5 border-t border-slate-100">
            {task.expediente && (
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); task.expediente_id && navigate(`/dashboard/expedientes/${task.expediente_id}`); }}
                className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-indigo-600 font-medium text-left">
                <Briefcase size={9} className="shrink-0" /> {task.expediente}
              </button>
            )}
            {task.juzgado && (
              <div className="flex items-start gap-1.5 text-[10px] text-slate-400">
                <Flag size={9} className="shrink-0 mt-0.5" />
                <span className="line-clamp-2 leading-snug">{task.juzgado}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanCard({ task, onToggle, onEdit }: {
  task: Task;
  onToggle: (id: string, newEstado: string) => void;
  onEdit:   (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      style={{ opacity: isDragging ? 0 : 1, touchAction: "none" }}
      className="cursor-grab active:cursor-grabbing">
      <KanbanCardContent task={task} onToggle={onToggle} onEdit={onEdit} />
    </div>
  );
}

function KanbanLane({ id, title, accent, badgeCls, tasks, onToggle, onEdit, onAddNew, onMoveLeft, onMoveRight }: {
  id: string; title: string; accent: string; badgeCls: string; tasks: Task[];
  onToggle: (id: string, newEstado: string) => void;
  onEdit:   (t: Task) => void;
  onAddNew: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const overdueCount = useMemo(() => tasks.filter(t => isOverdue(t.plazo, t.estado)).length, [tasks]);
  const canReorder = !!(onMoveLeft || onMoveRight);

  return (
    <div className="w-[320px] flex-shrink-0 flex flex-col rounded-2xl bg-slate-100/60 border border-slate-200 shadow-sm overflow-hidden"
      style={{ maxHeight: "calc(100vh - 320px)", minHeight: 320 }}>
      <div style={{ borderTop: `3px solid ${accent}` }}
        className="px-4 py-3 bg-white/70 backdrop-blur-sm border-b border-slate-200/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {canReorder ? (
            <div className="flex items-center -ml-1 shrink-0">
              <button
                disabled={!onMoveLeft}
                onClick={onMoveLeft}
                title="Mover columna a la izquierda"
                className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-0 disabled:pointer-events-none transition-colors">
                <ChevronLeft size={13} />
              </button>
              <button
                disabled={!onMoveRight}
                onClick={onMoveRight}
                title="Mover columna a la derecha"
                className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-0 disabled:pointer-events-none transition-colors">
                <ChevronRight size={13} />
              </button>
            </div>
          ) : (
            <GripVertical size={14} className="text-slate-300 shrink-0" />
          )}
          <span className="text-sm font-extrabold text-slate-800 tracking-tight truncate">{title}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${badgeCls}`}>{tasks.length}</span>
        </div>
        <button
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors shrink-0"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onAddNew(); }}>
          <Plus size={14} />
        </button>
      </div>
      <div ref={setNodeRef}
        className={`flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 transition-colors ${isOver ? "bg-indigo-50/50" : ""}`}>
        {overdueCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200/70 rounded-xl shrink-0">
            <AlertTriangle size={10} className="text-rose-500 shrink-0" />
            <span className="text-[10px] font-extrabold text-rose-600 uppercase tracking-widest">
              {overdueCount} {overdueCount === 1 ? "vencida" : "vencidas"}
            </span>
          </div>
        )}
        {tasks.length === 0 ? (
          <div className={`flex-1 flex flex-col items-center justify-center gap-2 min-h-[160px] rounded-xl border-2 border-dashed transition-colors
            ${isOver ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200/80 bg-white/40"}`}>
            {isOver
              ? <span className="text-xs font-bold text-indigo-500">Soltar aquí</span>
              : <><span className="text-slate-300 text-2xl">·</span><span className="text-xs font-medium text-slate-400">Sin tareas</span></>}
          </div>
        ) : (
          tasks.map(t => <KanbanCard key={t.id} task={t} onToggle={onToggle} onEdit={onEdit} />)
        )}
        {tasks.length > 0 && (
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onAddNew(); }}
            className="w-full py-2.5 mt-0.5 border border-dashed border-slate-200 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-600 hover:border-slate-300 hover:bg-white/60 transition-all flex items-center justify-center gap-1.5">
            <Plus size={12} /> Añadir tarea
          </button>
        )}
      </div>
    </div>
  );
}

// ── Gantt ─────────────────────────────────────────────────────────────────────
// Reconstruye una fecha a medianoche LOCAL a partir de sus componentes de
// calendario (no via setHours sobre la instancia original, que arrastraria
// cualquier resto de hora si el Date ya tenia una hora distinta de medianoche).
function toLocalMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Mismo motivo que normalizeTaskDate en tasksController.ts: toISOString()
// convierte a UTC, lo que desplaza la fecha un dia en zonas horarias positivas
// (como España). Para guardar "que dia es" hay que leer los getters locales.
function toLocalDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function GanttBoard({ tasks, onEdit, onUpdatePlazo }: {
  tasks: Task[];
  onEdit: (t: Task) => void;
  onUpdatePlazo: (id: string, plazo: string) => void;
}) {
  const [dayWidth, setDayWidth] = useState(44);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    taskId: string; startClientX: number; originalPlazo: Date; deltaDays: number;
  } | null>(null);

  const ganttData = useMemo(() => {
    const list = tasks.filter(t => !!t.plazo).map(t => {
      const end  = toLocalMidnight(new Date(t.plazo as string));
      const src  = t.created_at || t.updated_at || t.plazo || new Date().toISOString();
      const parsed = toLocalMidnight(new Date(src));
      const start  = parsed.getTime() <= end.getTime() ? parsed : new Date(end.getTime() - 86400000 * 3);
      return { task: t, start, end };
    }).sort((a, b) => a.start.getTime() - b.start.getTime());

    if (!list.length) return null;

    const minStart = new Date(Math.min(...list.map(i => i.start.getTime())));
    const maxEnd   = new Date(Math.max(...list.map(i => i.end.getTime())));
    minStart.setDate(minStart.getDate() - 7);
    maxEnd.setDate(maxEnd.getDate() + 14);

    const totalDays = Math.max(1, Math.ceil((maxEnd.getTime() - minStart.getTime()) / 86400000) + 1);
    const dates = Array.from({ length: totalDays }, (_, i) => {
      const d = new Date(minStart); d.setDate(minStart.getDate() + i); return d;
    });
    return { list, minStart, dates, totalDays };
  }, [tasks]);

  const scrollToToday = useCallback(() => {
    if (!scrollRef.current || !ganttData) return;
    const now = new Date(); now.setHours(0,0,0,0);
    const todayOffset = Math.floor((now.getTime() - ganttData.minStart.getTime()) / 86400000);
    const targetLeft = Math.max(0, todayOffset * dayWidth - scrollRef.current.clientWidth / 3);
    scrollRef.current.scrollTo({ left: targetLeft, behavior: "smooth" });
  }, [ganttData, dayWidth]);

  useEffect(() => { scrollToToday(); }, [scrollToToday]);

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
        onUpdatePlazo(dragging.taskId, toLocalDateInputValue(newPlazo));
      }
      setDragging(null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
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
    if (last?.key === week) last.span += 1; else acc.push({ key: week, label, span: 1 });
    return acc;
  }, []);
  const todayOffset = Math.floor((new Date(new Date().setHours(0,0,0,0)).getTime() - minStart.getTime()) / 86400000);

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white overflow-hidden shadow-[0_18px_42px_rgba(15,23,42,0.06)]"
      style={{ userSelect: dragging ? "none" : undefined } as React.CSSProperties}>
      <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-extrabold text-slate-800">Cronograma</span>
          <span className="px-2.5 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-500">{list.length} tareas</span>
          <span className="px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-[11px] font-bold text-violet-600">
            {dayWidth >= 56 ? "Vista detallada" : dayWidth <= 30 ? "Vista amplia" : "Vista semanal"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={scrollToToday}
            className="px-3 py-1.5 rounded-xl border border-indigo-200 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors">
            Hoy
          </button>
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-1 py-1">
            <button onClick={() => setDayWidth(w => Math.max(20, w - 10))} title="Alejar"
              className="h-6 w-6 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
              <ZoomOut size={13} />
            </button>
            <span className="text-[11px] font-bold text-slate-500 w-8 text-center">{dayWidth}px</span>
            <button onClick={() => setDayWidth(w => Math.min(80, w + 10))} title="Acercar"
              className="h-6 w-6 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
              <ZoomIn size={13} />
            </button>
          </div>
        </div>
      </div>
      <div ref={scrollRef} className="overflow-auto">
        <div style={{ minWidth: `${380 + totalDays * dayWidth}px` }}>
          <div className="grid border-b border-slate-200 bg-slate-50/80 sticky top-0 z-10"
            style={{ gridTemplateColumns: `380px repeat(${totalDays}, ${dayWidth}px)` }}>
            <div className="px-5 py-3 text-xs font-bold uppercase tracking-[0.24em] text-slate-500 border-r border-slate-200 row-span-2 flex items-center">
              Nombre
            </div>
            <div className="col-span-full" style={{ gridColumn: `2 / span ${totalDays}` }}>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${totalDays}, ${dayWidth}px)` }}>
                {weekHeaders.map(w => (
                  <div key={w.key} className="px-2 py-1.5 text-[11px] font-bold text-slate-600 border-r border-slate-200 bg-white/70 truncate"
                    style={{ gridColumn: `span ${w.span}` }}>{w.label}</div>
                ))}
              </div>
            </div>
            {dates.map((date, i) => {
              const isToday   = i === todayOffset;
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;
              return (
                <div key={date.toISOString()}
                  className={`py-1.5 text-center border-r border-slate-100 ${isWeekend ? "bg-slate-100/60" : ""} ${isToday ? "bg-indigo-50" : ""}`}>
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
          {list.map(({ task, start, end }) => {
            const startOffset    = Math.max(0, Math.floor((start.getTime() - minStart.getTime()) / 86400000));
            const baseSpan       = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
            const tipoConf       = TIPO_CONFIG[task.tipo] || TIPO_CONFIG.otro;
            const overdue        = isOverdue(task.plazo, task.estado);
            const barTone        = task.estado === "completada" ? "bg-emerald-500/90" :
                                   task.estado === "urgente" || overdue ? "bg-rose-500/90" : "bg-indigo-500/90";
            const isDraggingThis = dragging?.taskId === task.id;
            const deltaDays      = isDraggingThis ? dragging!.deltaDays : 0;
            const visualSpan     = Math.max(1, baseSpan + deltaDays);
            const newPlazoDate   = isDraggingThis && deltaDays !== 0
              ? new Date(dragging!.originalPlazo.getTime() + deltaDays * 86400000) : null;

            return (
              <div key={task.id} className="grid border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                style={{ gridTemplateColumns: `380px repeat(${totalDays}, ${dayWidth}px)` }}>
                <button onClick={() => onEdit(task)} className="px-5 py-3 text-left border-r border-slate-200 hover:bg-white">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-3 w-3 rounded-full shrink-0 ${barTone}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-slate-800 truncate">{task.titulo}</div>
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-semibold text-blue-600 truncate">{clientName(task)}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tipoConf.color}`}>{tipoConf.label}</span>
                      </div>
                    </div>
                  </div>
                </button>
                <div className="relative" style={{ gridColumn: `2 / span ${totalDays}` }}>
                  <div className="absolute inset-0 grid pointer-events-none"
                    style={{ gridTemplateColumns: `repeat(${totalDays}, ${dayWidth}px)` }}>
                    {dates.map((date, i) => (
                      <div key={i}
                        className={`border-r border-slate-100 ${date.getDay() === 0 || date.getDay() === 6 ? "bg-slate-50/60" : ""} ${i === todayOffset ? "bg-indigo-50/40" : ""}`}
                      />
                    ))}
                  </div>
                  {todayOffset >= 0 && todayOffset < totalDays && (
                    <div className="absolute top-0 bottom-0 w-[2px] bg-indigo-400/70 z-[1] pointer-events-none"
                      style={{ left: `${todayOffset * dayWidth + dayWidth / 2}px` }} />
                  )}
                  <div className="relative min-h-[68px]">
                    <div
                      onMouseDown={task.plazo ? e => {
                        e.preventDefault();
                        setDragging({ taskId: task.id, startClientX: e.clientX, originalPlazo: new Date(task.plazo!), deltaDays: 0 });
                      } : undefined}
                      onClick={() => !isDraggingThis && onEdit(task)}
                      className={`absolute top-1/2 -translate-y-1/2 h-10 rounded-xl px-3 flex items-center gap-2 text-white shadow-md
                        ${barTone} ${task.plazo ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
                        ${isDraggingThis ? "shadow-2xl z-20 ring-2 ring-white/40 scale-y-110" : ""}`}
                      style={{
                        left: `${startOffset * dayWidth + 4}px`,
                        width: `${Math.max(visualSpan * dayWidth - 8, dayWidth - 8)}px`,
                        transition: isDraggingThis ? "none" : "width 0.15s ease",
                      }}
                      title={`${task.titulo} · ${fmtDate(task.plazo)}`}>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-extrabold truncate">{task.titulo}</div>
                        {newPlazoDate
                          ? <div className="text-[10px] text-white/90 font-bold">{deltaDays > 0 ? "+" : ""}{deltaDays}d → {fmtDate(newPlazoDate.toISOString())}</div>
                          : <div className="text-[10px] text-white/75 truncate">{fmtDate(task.plazo)}</div>}
                      </div>
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
  const [clientsError,   setClientsError]   = useState<string | null>(null);

  const [tab,          setTab]          = useState<"todas" | "plazos">("todas");
  const [filterEstado, setFilterEstado] = useState("");
  const [filterTipo,   setFilterTipo]   = useState("");
  const [filterPrio,   setFilterPrio]   = useState("");
  const [search,       setSearch]       = useState("");
  const [showFilters,  setShowFilters]  = useState(false);
  const [view,         setView]         = useState<TaskView>("list");

  const [listSortBy,  setListSortBy]  = useState<"none" | "plazo" | "titulo" | "prioridad">("none");
  const [listSortDir, setListSortDir] = useState<"asc" | "desc">("asc");
  const [showCompletadas, setShowCompletadas] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const kanbanSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  // ── Etapas del Kanban ────────────────────────────────────────
  const [etapas, setEtapas] = useState<TaskEtapa[]>([]);
  const fetchEtapas = useCallback(async () => {
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/tasks/etapas", { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok) setEtapas(data.data || []);
    } catch { /* silencioso: el Kanban simplemente mostrara solo "Sin etapa" */ }
  }, [getToken]);
  useEffect(() => { fetchEtapas(); }, [fetchEtapas]);

  const [addingEtapa, setAddingEtapa] = useState(false);
  const [newEtapaName, setNewEtapaName] = useState("");
  const [savingEtapa, setSavingEtapa] = useState(false);
  const handleCreateEtapa = async () => {
    const nombre = newEtapaName.trim();
    if (!nombre || savingEtapa) return;
    setSavingEtapa(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/tasks/etapas", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre }),
      });
      const data = await safeJson(res);
      if (res.ok) {
        setEtapas(prev => [...prev, data.data]);
        setNewEtapaName("");
        setAddingEtapa(false);
      }
    } finally {
      setSavingEtapa(false);
    }
  };

  const persistEtapaOrder = useCallback(async (orderedIds: string[]) => {
    try {
      const token = await getToken({ skipCache: true });
      await fetch("/api/tasks/etapas/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: orderedIds }),
      });
    } catch { /* silencioso: si falla, la reordenaran volviendo a intentarlo */ }
  }, [getToken]);

  const moveEtapa = (index: number, dir: -1 | 1) => {
    setEtapas(prev => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      persistEtapaOrder(next.map(e => e.id));
      return next;
    });
  };

  const [showPanel,  setShowPanel]  = useState(false);
  const [editTask,   setEditTask]   = useState<Task | null>(null);
  const [modalInitialClientId, setModalInitialClientId] = useState("");
  const [modalInitialForm,     setModalInitialForm]     = useState<TaskFormData | null>(null);
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
    } catch { setClientsError("Error de conexión al cargar clientes"); }
    finally { setClientsLoading(false); }
  }, [getToken]);

  const fetchTasks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/tasks/me", { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok) setTasks(data.data || []);
    } catch {}
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
    setShowPanel(true);
    if (clients.length === 0) fetchClients();
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("open"); nextParams.delete("clientId"); nextParams.delete("tipo");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, clients.length, fetchClients]);

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

  const listTasks = useMemo(() => {
    let list = [...filtered];
    if (listSortBy === "plazo") {
      list.sort((a, b) => {
        if (!a.plazo && !b.plazo) return 0;
        if (!a.plazo) return 1; if (!b.plazo) return -1;
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

  const stats = useMemo(() => ({
    vencidas:    tasks.filter(t => isOverdue(t.plazo, t.estado)).length,
    urgentes:    tasks.filter(t => t.estado === "urgente").length,
    pendientes:  tasks.filter(t => t.estado === "pendiente").length,
    completadas: tasks.filter(t => t.estado === "completada").length,
  }), [tasks]);

  const hasFilter = !!(filterEstado || filterTipo || filterPrio || search);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((taskList: Task[]) => {
    setSelectedIds(prev => {
      if (taskList.every(t => prev.has(t.id))) return new Set();
      return new Set(taskList.map(t => t.id));
    });
  }, []);

  const handleBulkComplete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    setTasks(prev => prev.map(t => ids.includes(t.id) ? { ...t, estado: "completada" as const } : t));
    setSelectedIds(new Set());
    await Promise.all(ids.map(async id => {
      const token = await getToken({ skipCache: true });
      return fetch(`/api/tasks/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado: "completada" }),
      });
    }));
    fetchTasks(true);
  }, [selectedIds, getToken, fetchTasks]);

  const handleBulkDelete = useCallback(async () => {
    if (!window.confirm(`¿Eliminar ${selectedIds.size} tarea${selectedIds.size !== 1 ? "s" : ""}? Esta acción no se puede deshacer.`)) return;
    const ids = Array.from(selectedIds);
    setTasks(prev => prev.filter(t => !ids.includes(t.id)));
    setSelectedIds(new Set());
    await Promise.all(ids.map(async id => {
      const token = await getToken({ skipCache: true });
      return fetch(`/api/tasks/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    }));
    fetchTasks(true);
  }, [selectedIds, getToken, fetchTasks]);

  const handleToggle = useCallback(async (id: string, newEstado: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, estado: newEstado as Task["estado"] } : t));
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/tasks/${id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado: newEstado }),
      });
    } catch { fetchTasks(true); }
  }, [getToken, fetchTasks]);

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
          titulo: task.titulo, descripcion: task.descripcion || "", plazo,
          estado: task.estado, prioridad: task.prioridad, tipo: task.tipo,
          expediente: task.expediente || "", juzgado: task.juzgado || "", num_proc: task.num_proc || "",
          importe: (task as any).importe || "", notas: (task as any).notas || "",
          etapa: (task as any).etapa || "",
          fecha_aviso: (task as any).fecha_aviso ? (task as any).fecha_aviso.slice(0, 10) : "",
        }),
      });
    } catch {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, plazo: task.plazo } : t));
    }
  }, [getToken, tasks]);

  const handleUpdateEtapa = useCallback(async (id: string, etapa: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const previousEtapa = task.etapa || "";
    setTasks(prev => prev.map(t => t.id === id ? { ...t, etapa } : t));
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          titulo: task.titulo, descripcion: task.descripcion || "", plazo: task.plazo || "",
          estado: task.estado, prioridad: task.prioridad, tipo: task.tipo,
          expediente: task.expediente || "", juzgado: task.juzgado || "", num_proc: task.num_proc || "",
          importe: (task as any).importe || "", notas: (task as any).notas || "",
          etapa,
          fecha_aviso: (task as any).fecha_aviso ? (task as any).fecha_aviso.slice(0, 10) : "",
        }),
      });
    } catch {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, etapa: previousEtapa } : t));
    }
  }, [getToken, tasks]);

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
      setShowPanel(false); setEditTask(null);
      fetchTasks(true);
    } catch { setErrorMsg("Error de conexión"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/tasks/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setShowPanel(false); setEditTask(null);
      fetchTasks(true);
    } catch {}
    finally { setSaving(false); }
  };

  const openNew = () => {
    setEditTask(null); setErrorMsg(null); setModalInitialClientId(""); setModalInitialForm(null);
    setShowPanel(true);
    if (clients.length === 0) fetchClients();
  };
  const openEdit = (t: Task) => {
    setEditTask(t); setErrorMsg(null); setModalInitialClientId(""); setModalInitialForm(null);
    setShowPanel(true);
  };

  const activeDragTask = useMemo(() => tasks.find(t => t.id === activeDragId) ?? null, [tasks, activeDragId]);
  const handleKanbanDragStart = (event: DragStartEvent) => setActiveDragId(event.active.id as string);
  const handleKanbanDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const taskId = active.id as string;
    const targetEtapa = over.id === KANBAN_SIN_ETAPA_ID ? "" : (over.id as string);
    const task = tasks.find(t => t.id === taskId);
    if (!task || (task.etapa || "") === targetEtapa) return;
    handleUpdateEtapa(taskId, targetEtapa);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-300">

      {/* Cabecera */}
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
        <button onClick={openNew}
          className="flex items-center gap-2 px-5 h-10 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm shadow-red-600/20 transition-colors">
          <Plus size={14} /> Nueva tarea
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {([
          { label: "VENCIDAS",    val: stats.vencidas,    cls: "text-rose-600",    labelCls: "text-rose-400",    bg: "bg-rose-50/70",    border: "border-rose-100",    Icon: AlertTriangle as React.FC<{ size?: number; className?: string; strokeWidth?: number }> },
          { label: "URGENTES",    val: stats.urgentes,    cls: "text-orange-500",  labelCls: "text-orange-400",  bg: "bg-orange-50/70",  border: "border-orange-100",  Icon: Zap           as React.FC<{ size?: number; className?: string; strokeWidth?: number }> },
          { label: "PENDIENTES",  val: stats.pendientes,  cls: "text-amber-600",   labelCls: "text-amber-500",   bg: "bg-amber-50/70",   border: "border-amber-100",   Icon: Clock         as React.FC<{ size?: number; className?: string; strokeWidth?: number }> },
          { label: "COMPLETADAS", val: stats.completadas, cls: "text-emerald-600", labelCls: "text-emerald-500", bg: "bg-emerald-50/70", border: "border-emerald-100", Icon: CheckCircle2  as React.FC<{ size?: number; className?: string; strokeWidth?: number }> },
        ] as const).map(s => (
          <div key={s.label} className={`group relative overflow-hidden rounded-xl border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${s.bg} ${s.border} px-5 py-5`}>
            <div className={`absolute -right-4 -bottom-4 opacity-50 group-hover:scale-110 transition-transform ${s.labelCls}`}>
              <s.Icon size={88} strokeWidth={1} />
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-widest block mb-1 relative z-10 ${s.labelCls}`}>{s.label}</span>
            <span className={`text-3xl font-black leading-none relative z-10 ${s.cls}`}>{s.val}</span>
          </div>
        ))}
      </div>

      {/* Panel principal */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-wrap gap-2">
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
                <button key={opt.key} onClick={() => { setView(opt.key as TaskView); setSelectedIds(new Set()); }}
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
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 h-8">
              <Search size={12} className="text-slate-400 shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tarea o cliente..."
                className="bg-transparent text-xs text-slate-700 placeholder-slate-400 focus:outline-none w-44" />
              {search && <button onClick={() => setSearch("")}><X size={11} className="text-slate-400" /></button>}
            </div>
            <button onClick={() => setShowFilters(v => !v)}
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

        {/* Filtros */}
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
              {["alta", "media", "baja"].map(p => (
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
          <div className="flex items-center justify-center py-16"><Spinner size="md" muted /></div>
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
            const allVisible     = [...overdueTasks, ...activeTasks];
            const allSelected    = allVisible.length > 0 && allVisible.every(t => selectedIds.has(t.id));

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
                <div className="flex items-center px-4 py-2.5 bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                  <div className="w-10 flex items-center justify-center shrink-0">
                    <button onClick={() => toggleSelectAll(allVisible)}
                      className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                        allSelected ? "bg-red-600 border-red-600" : "border-slate-300 hover:border-red-400"
                      }`}>
                      {allSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                    </button>
                  </div>
                  <div className="w-10 shrink-0" />
                  <div className="flex-1 pr-4"><SortBtn col="titulo" label="Tarea" /></div>
                  <div className="w-[130px] hidden md:block text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tipo</span>
                  </div>
                  <div className="w-[130px] hidden sm:block px-2"><SortBtn col="plazo" label="Fecha límite" /></div>
                  <div className="w-[110px] pr-4 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Estado</span>
                  </div>
                </div>

                {overdueTasks.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-4 py-2 bg-rose-50/70 border-b border-rose-100">
                      <AlertTriangle size={11} className="text-rose-500 shrink-0" />
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-600">
                        Vencidas · {overdueTasks.length}
                      </span>
                    </div>
                    <div className="border-l-[3px] border-rose-400">
                      {overdueTasks.map(t => (
                        <TaskRow key={t.id} task={t} onToggle={handleToggle} onEdit={openEdit}
                          selected={selectedIds.has(t.id)} onSelect={toggleSelect} />
                      ))}
                    </div>
                  </>
                )}

                {activeTasks.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                        Activas · {activeTasks.length}
                      </span>
                    </div>
                    {activeTasks.map(t => (
                      <TaskRow key={t.id} task={t} onToggle={handleToggle} onEdit={openEdit}
                        selected={selectedIds.has(t.id)} onSelect={toggleSelect} />
                    ))}
                  </>
                )}

                {completedTasks.length > 0 && (
                  <>
                    <button onClick={() => setShowCompletadas(v => !v)}
                      className="w-full flex items-center gap-2 px-4 py-2 bg-emerald-50/80 border-b border-emerald-100 hover:bg-emerald-100/60 transition-colors">
                      <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 flex-1 text-left">
                        Completadas · {completedTasks.length}
                      </span>
                      {showCompletadas ? <ChevronUp size={13} className="text-emerald-500" /> : <ChevronDown size={13} className="text-emerald-500" />}
                    </button>
                    {showCompletadas && completedTasks.map(t => (
                      <TaskRow key={t.id} task={t} onToggle={handleToggle} onEdit={openEdit}
                        selected={selectedIds.has(t.id)} onSelect={toggleSelect} />
                    ))}
                  </>
                )}
              </>
            );
          })()
        ) : view === "kanban" ? (
          <div className="p-5 overflow-x-auto">
            <DndContext
              sensors={kanbanSensors}
              onDragStart={handleKanbanDragStart}
              onDragEnd={handleKanbanDragEnd}
              measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
              modifiers={[kanbanCenterOnCursor]}
            >
              <div className="flex items-start gap-5 pb-3 min-h-[400px]">
                <KanbanLane id={KANBAN_SIN_ETAPA_ID} title="Sin etapa" accent="#94a3b8" badgeCls="bg-slate-100 text-slate-600"
                  tasks={filtered.filter(t => !t.etapa)}
                  onToggle={handleToggle} onEdit={openEdit} onAddNew={openNew} />
                {etapas.map((e, i) => {
                  const { accent, badgeCls } = kanbanColorForIndex(i);
                  return (
                    <KanbanLane key={e.id} id={e.nombre} title={e.nombre} accent={accent} badgeCls={badgeCls}
                      tasks={filtered.filter(t => t.etapa === e.nombre)}
                      onToggle={handleToggle} onEdit={openEdit} onAddNew={openNew}
                      onMoveLeft={i > 0 ? () => moveEtapa(i, -1) : undefined}
                      onMoveRight={i < etapas.length - 1 ? () => moveEtapa(i, 1) : undefined} />
                  );
                })}
                <div className="w-[240px] flex-shrink-0 pt-1">
                  {addingEtapa ? (
                    <div className="flex flex-col gap-2 p-3 rounded-2xl bg-slate-100/60 border border-slate-200 shadow-sm">
                      <input
                        autoFocus
                        value={newEtapaName}
                        onChange={e => setNewEtapaName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); handleCreateEtapa(); }
                          if (e.key === "Escape") { setAddingEtapa(false); setNewEtapaName(""); }
                        }}
                        placeholder="Nombre de la etapa…"
                        className="w-full px-3 h-9 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCreateEtapa}
                          disabled={savingEtapa || !newEtapaName.trim()}
                          className="flex-1 h-8 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
                          {savingEtapa ? "Guardando…" : "Crear"}
                        </button>
                        <button
                          onClick={() => { setAddingEtapa(false); setNewEtapaName(""); }}
                          className="h-8 px-3 text-xs font-semibold text-slate-500 hover:bg-slate-200 rounded-lg transition-colors">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingEtapa(true)}
                      className="w-full flex items-center justify-center gap-2 h-12 text-xs font-bold text-slate-400 hover:text-indigo-600 border-2 border-dashed border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 rounded-2xl transition-colors">
                      <Plus size={14} /> Nueva etapa
                    </button>
                  )}
                </div>
              </div>
              <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
                {activeDragTask
                  ? <KanbanCardContent task={activeDragTask} onToggle={handleToggle} onEdit={openEdit} isDragging />
                  : null}
              </DragOverlay>
            </DndContext>
          </div>
        ) : (
          <div className="p-4">
            <GanttBoard tasks={filtered} onEdit={openEdit} onUpdatePlazo={handleUpdatePlazo} />
          </div>
        )}
      </div>

      {/* Panel lateral */}
      {showPanel && (
        <TaskPanel
          task={editTask}
          clients={clients}
          clientsLoading={clientsLoading}
          clientsError={clientsError}
          onClose={() => { setShowPanel(false); setEditTask(null); setErrorMsg(null); }}
          onSave={handleSave}
          onDelete={handleDelete}
          saving={saving}
          errorMsg={errorMsg}
          getToken={getToken}
          initialClientId={modalInitialClientId}
          initialForm={modalInitialForm}
        />
      )}

      {/* Barra bulk actions */}
      <BulkActionBar
        count={selectedIds.size}
        onComplete={handleBulkComplete}
        onDelete={handleBulkDelete}
        onClear={() => setSelectedIds(new Set())}
      />
    </div>
  );
}
