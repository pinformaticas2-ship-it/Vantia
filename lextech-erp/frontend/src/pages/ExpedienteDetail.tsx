import React, { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  Edit3,
  Loader2,
  AlertCircle,
  FolderOpen,
  Users,
  ClipboardList,
  MoreHorizontal,
  Activity,
  Paperclip,
  RefreshCw,
  Calendar,
  Hash,
  User,
  StickyNote,
  AlertTriangle,
  Scale,
  Plus,
  Trash2,
  X,
  Check,
  Search,
  Briefcase,
  Clock,
  Gavel,
  CheckCircle2,
  Link2,
} from "lucide-react";
import { safeJson } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import {
  TIPOS,
  ESTADOS,
  EXP_EMPTY,
  TabKey,
  ExpedienteModal,
} from "../components/ExpedienteModal";
import { FilesTabPanel } from "../components/FilesTabPanel";
import { EtapaSelect } from "../components/EtapaSelect";
import BackButton from "../components/BackButton";

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtMoney(v: any) {
  if (v == null || v === "") return "—";
  return (
    Number(v).toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

const Section = ({
  title,
  icon: Icon,
  children,
  cols = 3,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  cols?: number;
}) => (
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
      <Icon size={14} className="text-slate-400" />
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{title}</h3>
    </div>
    <div
      className={`p-4 grid gap-4 ${
        cols === 4
          ? "grid-cols-2 md:grid-cols-4"
          : cols === 2
            ? "grid-cols-1 md:grid-cols-2"
            : "grid-cols-2 md:grid-cols-3"
      }`}
    >
      {children}
    </div>
  </div>
);

const Field = ({
  label,
  value,
  mono = false,
  wide = false,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  wide?: boolean;
}) => (
  <div className={wide ? "col-span-2 md:col-span-3" : ""}>
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
    <p className={`text-sm font-medium ${mono ? "font-mono text-slate-600" : "text-slate-700"}`}>
      {value || <span className="text-slate-300 font-normal">—</span>}
    </p>
  </div>
);

const Indicador = ({
  label,
  value,
  color = "text-slate-700",
}: {
  label: string;
  value: string;
  color?: string;
}) => (
  <div className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
    <span className="text-xs text-slate-500">{label}</span>
    <span className={`text-xs font-bold ${color}`}>{value}</span>
  </div>
);

type DetailTabKey = "perfil" | TabKey | "relacionados";

const DETAIL_TABS: { key: DetailTabKey; label: string; icon: any }[] = [
  { key: "perfil", label: "Datos", icon: User },
  { key: "notas", label: "Notas", icon: StickyNote },
  { key: "clientes", label: "Cliente", icon: Users },
  { key: "contrarios", label: "Contrarios", icon: Users },
  { key: "relacionados", label: "Expedientes relacionados", icon: Link2 },
  { key: "tareas", label: "Tareas / Plazos", icon: AlertTriangle },
  { key: "adjuntos", label: "Adjuntos", icon: Paperclip },
  { key: "historial", label: "Historial expediente", icon: Activity },
];

function EmptyTab({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-14 flex flex-col items-center gap-3 text-slate-300">
      <Icon size={32} className="opacity-20" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

interface Nota {
  id: string;
  content: string;
  category: string;
  priority: string;
  color: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function TabNotas({
  expedienteId,
  legacyNote,
  onLegacyUpdated,
}: {
  expedienteId: string;
  legacyNote?: string | null;
  onLegacyUpdated?: (next: string) => void;
}) {
  const { getToken } = useAuth();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [nueva, setNueva] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categoria, setCategoria] = useState("general");
  const [prioridad, setPrioridad] = useState("normal");
  const [color, setColor] = useState("#FCD34D");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [legacySaving, setLegacySaving] = useState(false);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getToken({ skipCache: true });
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, [getToken]);

  const colores = [
    { nombre: "Amarillo", valor: "#FCD34D" },
    { nombre: "Rojo", valor: "#FECACA" },
    { nombre: "Verde", valor: "#BBFBCC" },
    { nombre: "Azul", valor: "#BFDBFE" },
    { nombre: "Rosa", valor: "#FBCFE8" },
    { nombre: "Púrpura", valor: "#E9D5FF" },
  ];

  const categorias = [
    { nombre: "General", valor: "general" },
    { nombre: "Urgente", valor: "urgente" },
    { nombre: "Seguimiento", valor: "seguimiento" },
    { nombre: "Recordatorio", valor: "recordatorio" },
    { nombre: "Comercial", valor: "comercial" },
    { nombre: "Legal", valor: "legal" },
    { nombre: "Otro", valor: "otro" },
  ];

  const prioridades = [
    { nombre: "Baja", valor: "baja" },
    { nombre: "Normal", valor: "normal" },
    { nombre: "Alta", valor: "alta" },
    { nombre: "Urgente", valor: "urgente" },
  ];

  const cargarNotas = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const headers = await authHeaders();
      const response = await fetch(`/api/expedientes/${expedienteId}/notes`, { headers });
      if (response.ok) {
        const data = await response.json();
        setNotas(data.data || []);
      }
    } catch (error) {
      if (!silent) console.error("Error cargando notas expediente:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authHeaders, expedienteId]);

  useEffect(() => {
    if (expedienteId) cargarNotas();
  }, [expedienteId, cargarNotas]);

  useAutoRefresh(() => cargarNotas(true), { intervalMs: 30_000, enabled: !!expedienteId });

  const addNota = async () => {
    if (!nueva.trim()) return;
    setSaving(true);
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/expedientes/${expedienteId}/notes`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          content: nueva.trim(),
          category: categoria,
          priority: prioridad,
          color,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotas((prev) => [data.data, ...prev]);
        setNueva("");
        setCategoria("general");
        setPrioridad("normal");
        setColor("#FCD34D");
      }
    } catch (error) {
      console.error("Error guardando nota expediente:", error);
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (notaId: string) => {
    if (notaId === "__legacy__") {
      try {
        setLegacySaving(true);
        const headers = await authHeaders();
        const response = await fetch(`/api/expedientes/${expedienteId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ observaciones: editContent.trim() || null }),
        });
        const data = await safeJson(response);
        if (response.ok) {
          onLegacyUpdated?.(data?.data?.observaciones || editContent.trim());
          setEditingId(null);
          setEditContent("");
        }
      } catch (error) {
        console.error("Error actualizando observación del expediente:", error);
      } finally {
        setLegacySaving(false);
      }
      return;
    }

    if (!editContent.trim()) return;
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/expedientes/${expedienteId}/notes/${notaId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ content: editContent.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotas((prev) => prev.map((n) => (n.id === notaId ? data.data : n)));
        setEditingId(null);
        setEditContent("");
      }
    } catch (error) {
      console.error("Error editando nota expediente:", error);
    }
  };

  const confirmDeleteNota = async () => {
    if (!confirmDeleteId) return;
    const notaId = confirmDeleteId;
    setConfirmDeleteId(null);

    if (notaId === "__legacy__") {
      try {
        setLegacySaving(true);
        const headers = await authHeaders();
        const response = await fetch(`/api/expedientes/${expedienteId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ observaciones: null }),
        });
        if (response.ok) {
          onLegacyUpdated?.("");
        }
      } catch (error) {
        console.error("Error eliminando observación del expediente:", error);
      } finally {
        setLegacySaving(false);
      }
      return;
    }

    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/expedientes/${expedienteId}/notes/${notaId}`, {
        method: "DELETE",
        headers,
      });
      if (response.ok) {
        setNotas((prev) => prev.filter((n) => n.id !== notaId));
      }
    } catch (error) {
      console.error("Error eliminando nota expediente:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const visibleNotas = [
    ...(legacyNote?.trim()
      ? [{
          id: "__legacy__",
          content: legacyNote.trim(),
          category: "general",
          priority: "normal",
          color: "#FCD34D",
          created_by: "Sistema",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          isLegacy: true,
        }]
      : []),
    ...notas,
  ] as Array<Nota & { isLegacy?: boolean }>;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Nueva nota</p>
        <textarea
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          placeholder="Escribe una nota sobre este expediente..."
          rows={3}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
        />

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Categoría</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-red-400">
              {categorias.map((c) => <option key={c.valor} value={c.valor}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Prioridad</label>
            <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-red-400">
              {prioridades.map((p) => <option key={p.valor} value={p.valor}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Color</label>
            <div className="flex gap-1">
              {colores.map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  onClick={() => setColor(c.valor)}
                  className={`h-8 w-8 rounded-lg border-2 transition-all ${color === c.valor ? "border-slate-900" : "border-transparent"}`}
                  style={{ backgroundColor: c.valor }}
                  title={c.nombre}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={addNota}
            disabled={saving || !nueva.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded-xl active:scale-95 transition-all"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Guardar nota
          </button>
        </div>
      </div>

      {visibleNotas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center gap-3 text-slate-400">
          <StickyNote size={36} className="opacity-20" />
          <p className="text-sm font-medium">No hay notas todavía</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleNotas.map((n) => (
            <div key={n.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden" style={{ borderLeft: `4px solid ${n.color}` }}>
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {categorias.find((c) => c.valor === n.category)?.nombre || n.category}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    n.priority === "urgente" ? "bg-red-100 text-red-600" :
                    n.priority === "alta" ? "bg-orange-100 text-orange-600" :
                    n.priority === "normal" ? "bg-blue-100 text-blue-600" :
                    "bg-slate-100 text-slate-600"
                  }`}>
                    {prioridades.find((p) => p.valor === n.priority)?.nombre || n.priority}
                  </span>
                </div>

                {editingId === n.id && !n.isLegacy ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-400"
                    rows={3}
                  />
                ) : (
                  <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{n.content}</p>
                )}

                <p className="text-[10px] text-slate-400">
                  {n.created_by && !/^user_[A-Za-z0-9]+$/.test(n.created_by) ? n.created_by : "Usuario"}{!n.isLegacy ? ` · ${new Date(n.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
                </p>

                {!n.isLegacy && (
                <div className="flex gap-2 justify-end pt-2">
                  {editingId === n.id ? (
                    <>
                      <button type="button" disabled={legacySaving} onClick={() => saveEdit(n.id)} className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg transition-all disabled:opacity-50">
                        <Check size={12} /> Guardar
                      </button>
                      <button type="button" onClick={() => { setEditingId(null); setEditContent(""); }} className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">
                        <X size={12} /> Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => { setEditingId(n.id); setEditContent(n.content); }} className="px-3 py-1 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all">
                        Editar
                      </button>
                      <button type="button" disabled={legacySaving} onClick={() => setConfirmDeleteId(n.id)} className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-all disabled:opacity-50">
                        <Trash2 size={12} /> Eliminar
                      </button>
                    </>
                  )}
                </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-5 space-y-4">
            <div className="space-y-1">
              <h4 className="text-base font-bold text-slate-900">Eliminar nota</h4>
              <p className="text-sm text-slate-500">Esta acción no se puede deshacer.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button type="button" onClick={confirmDeleteNota} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface TareaForm {
  titulo: string; descripcion: string; plazo: string; fecha_aviso: string;
  estado: string; prioridad: string; expediente: string;
  tipo: string; juzgado: string; num_proc: string;
  importe: string; notas: string; etapa: string; expediente_id?: string;
}

const TAREA_EMPTY: TareaForm = {
  titulo: "", descripcion: "", plazo: "", fecha_aviso: "",
  estado: "pendiente", prioridad: "media", expediente: "",
  tipo: "otro", juzgado: "", num_proc: "",
  importe: "", notas: "", etapa: "", expediente_id: "",
};

const TIPO_CONFIG: Record<string, { label: string; color: string }> = {
  plazo_procesal: { label: "Plazo Procesal", color: "bg-red-100 text-red-700" },
  vista_juicio: { label: "Vista / Juicio", color: "bg-purple-100 text-purple-700" },
  notificacion: { label: "Notificación", color: "bg-blue-100 text-blue-700" },
  reunion: { label: "Reunión", color: "bg-green-100 text-green-700" },
  escrito: { label: "Escrito", color: "bg-indigo-100 text-indigo-700" },
  gestion: { label: "Gestión", color: "bg-amber-100 text-amber-700" },
  pago: { label: "Pago / Factura", color: "bg-emerald-100 text-emerald-700" },
  llamada: { label: "Llamada", color: "bg-teal-100 text-teal-700" },
  diligencia: { label: "Diligencia", color: "bg-orange-100 text-orange-700" },
  otro: { label: "Otro", color: "bg-slate-100 text-slate-500" },
};

function TabTareas({
  expedienteId,
  clienteId,
  expedienteRef,
  juzgado,
  numProc,
}: {
  expedienteId: string;
  clienteId?: string | null;
  expedienteRef?: string | null;
  juzgado?: string | null;
  numProc?: string | null;
}) {
  const { getToken } = useAuth();
  const [tareas, setTareas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TareaForm>({
    ...TAREA_EMPTY,
    expediente: expedienteRef || "",
    expediente_id: expedienteId,
    juzgado: juzgado || "",
    num_proc: numProc || "",
  });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TareaForm>(TAREA_EMPTY);
  const [filter, setFilter] = useState<"todas"|"pendiente"|"urgente"|"completada">("todas");
  const [filterTipo, setFilterTipo] = useState("");
  const [filterPrio, setFilterPrio] = useState("");
  const [filterVencidas, setFilterVencidas] = useState(false);
  const [search, setSearch] = useState("");
  const [confirmDeleteTareaId, setConfirmDeleteTareaId] = useState<string | null>(null);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      expediente: expedienteRef || "",
      expediente_id: expedienteId,
      juzgado: juzgado || "",
      num_proc: numProc || "",
    }));
  }, [expedienteRef, expedienteId, juzgado, numProc]);

  const estadoStyle: Record<string, string> = {
    pendiente: "bg-amber-100 text-amber-700",
    urgente: "bg-red-100 text-red-700",
    completada: "bg-emerald-100 text-emerald-700",
  };
  const estadoLabel: Record<string, string> = {
    pendiente: "Pendiente", urgente: "Urgente", completada: "Completada",
  };

  const fetchTareas = useCallback(async () => {
    setFetchError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/me`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok) {
        setTareas((data.data || []).filter((t: any) => t.expediente_id === expedienteId));
      } else {
        setFetchError(data.error || "Error al cargar tareas");
      }
    } catch (e: any) {
      setFetchError(e.message || "Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }, [expedienteId, getToken]);

  useEffect(() => { fetchTareas(); }, [fetchTareas]);

  const handleCreate = async () => {
    if (!form.titulo.trim() || !clienteId) return;
    setSaving(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/client/${clienteId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, expediente_id: expedienteId, expediente: expedienteRef || "" }),
      });
      const data = await safeJson(res);
      if (res.ok) {
        setTareas((prev) => [data.data, ...prev]);
        setForm({
          ...TAREA_EMPTY,
          expediente: expedienteRef || "",
          expediente_id: expedienteId,
          juzgado: juzgado || "",
          num_proc: numProc || "",
        });
        setShowForm(false);
        window.dispatchEvent(new CustomEvent("historial-changed"));
      } else {
        setFetchError(data.error || "No se pudo crear la tarea");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEstado = async (t: any) => {
    const nuevoEstado = t.estado === "completada" ? "pendiente" : "completada";
    const token = await getToken({ skipCache: true });
    const res = await fetch(`/api/tasks/${t.id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    if (res.ok) setTareas((prev) => prev.map((x) => x.id === t.id ? { ...x, estado: nuevoEstado } : x));
  };

  const startEdit = (t: any) => {
    setEditId(t.id);
    setEditForm({
      titulo: t.titulo || "",
      descripcion: t.descripcion || "",
      plazo: t.plazo ? t.plazo.slice(0, 10) : "",
      fecha_aviso: t.fecha_aviso ? t.fecha_aviso.slice(0, 10) : "",
      estado: t.estado,
      prioridad: t.prioridad,
      expediente: t.expediente || expedienteRef || "",
      tipo: t.tipo || "otro",
      juzgado: t.juzgado || "",
      num_proc: t.num_proc || "",
      importe: t.importe != null ? String(t.importe) : "",
      notas: t.notas || "",
      etapa: t.etapa || "",
      expediente_id: t.expediente_id || expedienteId,
    });
  };

  const saveEdit = async () => {
    if (!editId || !editForm.titulo.trim()) return;
    setSaving(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...editForm, expediente_id: expedienteId, expediente: expedienteRef || "" }),
      });
      const data = await safeJson(res);
      if (res.ok) {
        setTareas((prev) => prev.map((x) => x.id === editId ? data.data : x));
        setEditId(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteTarea = async () => {
    if (!confirmDeleteTareaId) return;
    const taskId = confirmDeleteTareaId;
    setConfirmDeleteTareaId(null);
    const token = await getToken({ skipCache: true });
    const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      setTareas((prev) => prev.filter((x) => x.id !== taskId));
      window.dispatchEvent(new CustomEvent("historial-changed"));
    }
  };

  const isVencida = (t: any) => t.plazo && t.estado !== "completada" && new Date(t.plazo) < new Date();
  const fmtPlazo = (d: string) => d ? new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }) : null;

  const visible = tareas.filter((t) => {
    if (filter !== "todas" && t.estado !== filter) return false;
    if (filterTipo && t.tipo !== filterTipo) return false;
    if (filterPrio && t.prioridad !== filterPrio) return false;
    if (filterVencidas && !isVencida(t)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [t.titulo, t.descripcion, t.expediente, t.juzgado, t.num_proc, t.created_by].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={22} className="animate-spin text-slate-300" /></div>;

  if (fetchError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center gap-3 text-center">
        <AlertCircle size={28} className="text-red-400" />
        <div>
          <p className="text-sm font-semibold text-red-700">No se pudieron cargar las tareas</p>
          <p className="text-xs text-red-500 mt-1">{fetchError}</p>
        </div>
        <button onClick={fetchTareas} className="mt-1 px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 text-xs">
            {(["todas","pendiente","urgente","completada"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg font-semibold capitalize transition-colors ${filter === f ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {f === "todas" ? `Todas (${tareas.length})` : f === "pendiente" ? `Pendientes (${tareas.filter((x) => x.estado === "pendiente").length})` : f === "urgente" ? `Urgentes (${tareas.filter((x) => x.estado === "urgente").length})` : `Completadas (${tareas.filter((x) => x.estado === "completada").length})`}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setShowForm((v) => !v); setForm({ ...TAREA_EMPTY, expediente: expedienteRef || "", expediente_id: expedienteId, juzgado: juzgado || "", num_proc: numProc || "" }); }}
            disabled={!clienteId}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-sm active:scale-95 transition-all disabled:opacity-50"
          >
            <Plus size={15} /> Nueva tarea
          </button>
        </div>

        {!clienteId && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Para crear tareas desde el expediente, primero debe haber un cliente vinculado.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tarea..." className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-red-400 bg-white" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={11} /></button>}
          </div>
          <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400 bg-white text-slate-600">
            <option value="">Todos los tipos</option>
            {Object.entries(TIPO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <div className="flex gap-1">
            {[["", "Todas"], ["alta", "Alta"], ["media", "Media"], ["baja", "Baja"]].map(([val, label]) => (
              <button key={val} onClick={() => setFilterPrio(val)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                filterPrio === val ? val === "alta" ? "bg-red-600 text-white" : val === "media" ? "bg-amber-500 text-white" : val === "baja" ? "bg-slate-500 text-white" : "bg-slate-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => setFilterVencidas((v) => !v)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${filterVencidas ? "bg-red-100 text-red-700 border border-red-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
            <AlertTriangle size={11} /> Vencidas
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white border border-red-200 rounded-xl p-5 space-y-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nueva tarea / plazo</p>
          <input value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} placeholder="Título de la tarea *" autoFocus className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" />
          <textarea value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} placeholder="Descripción / instrucciones (opcional)" rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2 md:col-span-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo de tarea</label>
              <select value={form.tipo} onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5">
                {Object.entries(TIPO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha límite</label>
              <input type="date" value={form.plazo} onChange={(e) => setForm((p) => ({ ...p, plazo: e.target.value }))} min={new Date().toISOString().split("T")[0]} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado</label>
              <select value={form.estado} onChange={(e) => setForm((p) => ({ ...p, estado: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5">
                <option value="pendiente">Pendiente</option>
                <option value="urgente">Urgente</option>
                <option value="completada">Completada</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prioridad</label>
              <select value={form.prioridad} onChange={(e) => setForm((p) => ({ ...p, prioridad: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expediente</label>
              <input value={form.expediente} onChange={(e) => setForm((p) => ({ ...p, expediente: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Juzgado / Tribunal</label>
              <input value={form.juzgado} onChange={(e) => setForm((p) => ({ ...p, juzgado: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nº Procedimiento</label>
              <input value={form.num_proc} onChange={(e) => setForm((p) => ({ ...p, num_proc: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha de aviso</label>
              <input type="date" value={form.fecha_aviso} onChange={(e) => setForm((p) => ({ ...p, fecha_aviso: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Importe (€)</label>
              <input type="number" step="0.01" min="0" value={form.importe} onChange={(e) => setForm((p) => ({ ...p, importe: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Etapa</label>
              <EtapaSelect value={form.etapa} onChange={(v) => setForm((p) => ({ ...p, etapa: v }))} getToken={getToken} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notas internas</label>
              <textarea value={form.notas} onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 mt-0.5" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors">Cancelar</button>
            <button type="button" onClick={handleCreate} disabled={saving || !form.titulo.trim() || !clienteId} className="flex items-center gap-2 px-5 py-1.5 text-sm font-bold text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 rounded-lg active:scale-95 transition-all">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Guardar tarea
            </button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-14 flex flex-col items-center gap-3 text-slate-400">
          <CheckCircle2 size={36} className="opacity-20" />
          <p className="font-medium text-sm">{(search || filterTipo || filterPrio || filterVencidas) ? "No hay tareas con esos filtros" : filter !== "todas" ? `Sin tareas en estado "${filter}"` : "Sin tareas"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((t) => (
            <div key={t.id} className={`bg-white border rounded-xl p-4 flex items-start gap-3 transition-colors ${t.estado === "completada" ? "border-slate-100 opacity-60" : isVencida(t) ? "border-red-200 bg-red-50/30" : "border-slate-200 hover:border-slate-300"}`}>
              <button onClick={() => handleToggleEstado(t)} className={`mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${t.estado === "completada" ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-red-400"}`}>
                {t.estado === "completada" && <CheckCircle2 size={10} className="text-white" />}
              </button>

              {editId === t.id ? (
                <div className="flex-1 space-y-3">
                  <input value={editForm.titulo} onChange={(e) => setEditForm((p) => ({ ...p, titulo: e.target.value }))} placeholder="Título *" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-red-400" />
                  <textarea value={editForm.descripcion} onChange={(e) => setEditForm((p) => ({ ...p, descripcion: e.target.value }))} rows={2} placeholder="Descripción" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:border-red-400" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Tipo</p>
                      <select value={editForm.tipo} onChange={(e) => setEditForm((p) => ({ ...p, tipo: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400">
                        {Object.entries(TIPO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Fecha límite</p>
                      <input type="date" value={editForm.plazo} onChange={(e) => setEditForm((p) => ({ ...p, plazo: e.target.value }))} min={new Date().toISOString().split("T")[0]} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Estado</p>
                      <select value={editForm.estado} onChange={(e) => setEditForm((p) => ({ ...p, estado: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400">
                        <option value="pendiente">Pendiente</option>
                        <option value="urgente">Urgente</option>
                        <option value="completada">Completada</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Prioridad</p>
                      <select value={editForm.prioridad} onChange={(e) => setEditForm((p) => ({ ...p, prioridad: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400">
                        <option value="alta">Alta</option>
                        <option value="media">Media</option>
                        <option value="baja">Baja</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Expediente</p>
                      <input value={editForm.expediente} onChange={(e) => setEditForm((p) => ({ ...p, expediente: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Juzgado / Tribunal</p>
                      <input value={editForm.juzgado} onChange={(e) => setEditForm((p) => ({ ...p, juzgado: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Nº Procedimiento</p>
                      <input value={editForm.num_proc} onChange={(e) => setEditForm((p) => ({ ...p, num_proc: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Fecha de aviso</p>
                      <input type="date" value={editForm.fecha_aviso} onChange={(e) => setEditForm((p) => ({ ...p, fecha_aviso: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Importe (€)</p>
                      <input type="number" step="0.01" min="0" value={editForm.importe} onChange={(e) => setEditForm((p) => ({ ...p, importe: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Etapa</p>
                      <EtapaSelect value={editForm.etapa} onChange={(v) => setEditForm((p) => ({ ...p, etapa: v }))} getToken={getToken} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Notas internas</p>
                      <textarea value={editForm.notas} onChange={(e) => setEditForm((p) => ({ ...p, notas: e.target.value }))} rows={2} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:border-red-400" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setEditId(null)} className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700">Cancelar</button>
                    <button type="button" onClick={saveEdit} disabled={saving} className="px-4 py-1 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg disabled:opacity-50">
                      {saving ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold mb-1.5 ${t.estado === "completada" ? "line-through text-slate-400" : "text-slate-800"}`}>{t.titulo}</p>
                  {t.descripcion && <p className="text-xs text-slate-500 mb-2 line-clamp-2 leading-relaxed">{t.descripcion}</p>}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${TIPO_CONFIG[t.tipo]?.color || "bg-slate-100 text-slate-500 border-slate-200"}`}>{TIPO_CONFIG[t.tipo]?.label || "Otro"}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${estadoStyle[t.estado]}`}>{estadoLabel[t.estado]}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${t.prioridad === "alta" ? "bg-red-50 text-red-600 border-red-200" : t.prioridad === "media" ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-slate-50 text-slate-400 border-slate-200"}`}>↑ {t.prioridad}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                    <span className={`flex items-center gap-1 font-medium ${isVencida(t) ? "text-red-600" : t.plazo ? "text-slate-400" : "text-slate-300"}`}>
                      <Calendar size={10} />
                      {t.plazo ? <>{fmtPlazo(t.plazo)}{isVencida(t) && <span className="font-bold text-red-600 ml-1">VENCIDA</span>}</> : "Sin fecha límite"}
                    </span>
                    <span className="flex items-center gap-1 text-slate-300"><Clock size={10} /> Creada {new Date(t.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    {t.expediente && <span className="flex items-center gap-1 text-slate-400"><Briefcase size={10} /> {t.expediente}</span>}
                    {t.num_proc && <span className="flex items-center gap-1 text-slate-400"><Hash size={10} /> {t.num_proc}</span>}
                    {t.juzgado && <span className="flex items-center gap-1 text-slate-400"><Gavel size={10} /> {t.juzgado}</span>}
                    {t.fecha_aviso && <span className={`flex items-center gap-1 font-medium ${new Date(t.fecha_aviso) < new Date() && t.estado !== "completada" ? "text-amber-600" : "text-slate-400"}`}>Aviso: {fmtPlazo(t.fecha_aviso)}</span>}
                    {t.importe != null && Number(t.importe) > 0 && <span className="flex items-center gap-1 text-emerald-600 font-semibold">{Number(t.importe).toLocaleString("es-ES", { minimumFractionDigits: 2 })} €</span>}
                    {t.etapa && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">{t.etapa}</span>}
                    {t.created_by && <span className="flex items-center gap-1 text-slate-400"><User size={10} /> {/^user_[A-Za-z0-9]+$/.test(t.created_by) ? "Usuario" : t.created_by}</span>}
                  </div>
                  {t.notas && <div className="mt-2 px-2 py-1.5 bg-amber-50 border border-amber-100 rounded-lg text-[11px] text-amber-800 leading-relaxed"><span className="font-bold">Nota: </span>{t.notas}</div>}
                </div>
              )}

              {editId !== t.id && (
                <div className="flex flex-col items-end gap-1.5 shrink-0 ml-2">
                  <button type="button" onClick={() => startEdit(t)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                    <Edit3 size={12} /> Editar
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteTareaId(t.id)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                    <Trash2 size={12} /> Borrar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDeleteTareaId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDeleteTareaId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 size={18} className="text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Eliminar tarea</h3>
                  <p className="text-sm text-slate-500">Esta acción no se puede deshacer.</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button type="button" onClick={() => setConfirmDeleteTareaId(null)} className="flex-1 px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={confirmDeleteTarea} className="flex-1 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabAdjuntosExpediente({
  expedienteId,
}: {
  expedienteId: string;
}) {
  return (
    <FilesTabPanel entityId={expedienteId} />
  );
}

function TabExpedientesRelacionados({
  expedienteId,
  currentRef,
}: {
  expedienteId: string;
  currentRef: string;
}) {
  const { getToken } = useAuth();
  const [related, setRelated] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [associateError, setAssociateError] = useState("");

  const loadRelated = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/expedientes/${expedienteId}/related`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los expedientes relacionados");
      setRelated(data.data || []);
    } catch (_e) {
      if (!silent) setRelated([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [expedienteId, getToken]);

  useEffect(() => {
    loadRelated();
  }, [loadRelated]);

  useAutoRefresh(() => loadRelated(true), { intervalMs: 30_000, enabled: !!expedienteId });

  const relatedIds = useMemo(() => new Set(related.map((item) => item.id)), [related]);

  const searchExpedientes = useCallback(async (searchValue: string) => {
    try {
      setSearching(true);
      setSearchError("");
      const token = await getToken({ skipCache: true });
      const term = searchValue.trim();
      const url = term
        ? `/api/expedientes?limit=100&q=${encodeURIComponent(term)}`
        : `/api/expedientes?limit=100`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "No se pudieron buscar expedientes");
      setSearchResults((data.data || []).filter((item: any) => item.id !== expedienteId && !relatedIds.has(item.id)));
    } catch (e: any) {
      setSearchResults([]);
      setSearchError(e?.message || "No se pudieron buscar expedientes");
    } finally {
      setSearching(false);
    }
  }, [expedienteId, getToken, relatedIds]);

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const term = query.trim();
    if (!term) {
      setHasSearched(false);
      setSearchResults([]);
      return;
    }
    setHasSearched(true);
    await searchExpedientes(term);
  };

  useEffect(() => {
    if (!showModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showModal]);

  const associateExpediente = async (relatedId: string) => {
    try {
      setSavingId(relatedId);
      setAssociateError("");
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/expedientes/${expedienteId}/related`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ related_expediente_id: relatedId }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "No se pudo asociar el expediente");
      await loadRelated(true);
      setShowModal(false);
      setQuery("");
      setHasSearched(false);
      setSearchResults([]);
    } catch (e: any) {
      setAssociateError(e?.message || "No se pudo asociar el expediente");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-slate-400" />
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Expedientes relacionados</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowModal(true);
              setQuery("");
              setHasSearched(false);
              setSearchError("");
              setAssociateError("");
              setSearchResults([]);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm active:scale-95 transition-all"
          >
            <Plus size={12} />
            Asociar expedientes
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 size={15} className="animate-spin" />
              Cargando expedientes relacionados...
            </div>
          ) : related.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white border border-slate-200 text-slate-300">
                <Link2 size={20} />
              </div>
              <p className="text-sm font-semibold text-slate-700">Todavía no hay expedientes relacionados</p>
              <p className="mt-1 text-xs text-slate-400">Puedes asociar otros expedientes del sistema para tenerlos agrupados aquí.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {related.map((item) => {
                const ref = item.ref_expediente || `${item.anio}/${item.num_exp}`;
                const relatedSummary = [
                  item.cliente_nombre,
                  item.tipo_proc,
                  item.juzgado,
                  item.fecha_inicio ? `Alta ${fmtDate(item.fecha_inicio)}` : null,
                ].filter(Boolean);
                return (
                  <Link
                    key={item.id}
                    to={`/dashboard/expedientes/${item.id}`}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-blue-600 hover:underline break-words">
                        {item.descripcion || `Expediente ${ref}`}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 break-words">
                        {ref}
                      </p>
                      {relatedSummary.length > 0 && (
                        <p className="mt-2 text-xs text-slate-400 break-words">
                          {relatedSummary.join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-500">
                        {item.estado || "abierto"}
                      </span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase text-blue-600">
                        {TIPOS[item.tipo]?.label || "Expediente"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showModal && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm px-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-2xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Relacionar expediente</p>
                <h3 className="text-lg font-bold text-slate-900">Asociar expedientes a {currentRef}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    value={query}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setQuery(nextValue);
                      if (!nextValue.trim()) {
                        setHasSearched(false);
                        setSearchResults([]);
                      }
                    }}
                    placeholder="Buscar por referencia, descripción, NIG, juzgado..."
                    autoFocus
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-colors focus:border-slate-300 focus:bg-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!query.trim() || searching}
                  className="inline-flex items-center gap-2 px-4 py-3 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                  Buscar
                </button>
              </form>

              {searchError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {searchError}
                </div>
              )}

              {associateError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {associateError}
                </div>
              )}

              <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70">
                {!hasSearched ? (
                  <div className="px-5 py-10 text-center">
                    <p className="text-sm font-medium text-slate-600">Empieza escribiendo para buscar expedientes</p>
                    <p className="mt-1 text-xs text-slate-400">Busca por referencia, descripción, NIG o juzgado.</p>
                  </div>
                ) : searching ? (
                  <div className="flex items-center gap-2 px-5 py-8 text-sm text-slate-400">
                    <Loader2 size={15} className="animate-spin" />
                    Buscando expedientes...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <p className="text-sm font-medium text-slate-600">No hay expedientes disponibles para asociar</p>
                    <p className="mt-1 text-xs text-slate-400">Prueba con otra búsqueda o revisa si ya están relacionados.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {searchResults.map((item) => {
                      const ref = item.ref_expediente || `${item.anio}/${item.num_exp}`;
                      return (
                        <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-4">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 break-words">
                              {item.descripcion || `Expediente ${ref}`}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 break-words">
                              {ref}
                              {item.nig ? ` · NIG ${item.nig}` : ""}
                              {item.juzgado ? ` · ${item.juzgado}` : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => associateExpediente(item.id)}
                            disabled={savingId === item.id}
                            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                          >
                            {savingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <span className="text-[12px] leading-none">🤝</span>}
                            Asociar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function splitClientName(fullName?: string | null) {
  const clean = (fullName || "").trim().replace(/\s+/g, " ");
  if (!clean) return { first_name: "", last_name: "" };
  const parts = clean.split(" ");
  if (parts.length === 1) return { first_name: clean, last_name: "" };
  return {
    first_name: parts.slice(0, -1).join(" "),
    last_name: parts.slice(-1).join(" "),
  };
}

function initialsFromName(name?: string | null) {
  const clean = (name || "").trim();
  if (!clean) return "CL";
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "CL";
}

export default function ExpedienteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getToken } = useAuth();

  const [exp, setExp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<DetailTabKey>("perfil");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState<any[]>([]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab && DETAIL_TABS.some((item) => item.key === requestedTab)) {
      setTab(requestedTab as DetailTabKey);
    }
  }, [searchParams]);

  const fetchExp = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/expedientes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await safeJson(res);
      if (!res.ok) throw new Error(d.error || "No se pudo cargar el expediente");
      setExp(d.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  const fetchClientes = useCallback(async () => {
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/entities?limit=500", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await safeJson(res);
      if (res.ok) setClientes(d.data || []);
    } catch {}
  }, [getToken]);

  useEffect(() => {
    fetchExp();
    fetchClientes();
  }, [fetchExp, fetchClientes]);

  const handleSave = async (form: typeof EXP_EMPTY) => {
    setSaving(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/expedientes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const d = await safeJson(res);
      if (!res.ok) {
        alert(d.error || "Error al guardar");
        return;
      }
      setEditing(false);
      await fetchExp();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400">
        <Loader2 className="animate-spin text-red-600 mb-3" size={32} />
        <p className="text-sm animate-pulse">Cargando expediente...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/dashboard/expedientes">
          <BackButton label="Volver a expedientes" />
        </Link>
        <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle size={20} className="shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-sm">Error al cargar</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
          <button
            onClick={fetchExp}
            className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <RefreshCw size={12} /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!exp) return null;

  const tipoConf = TIPOS[exp.tipo] || TIPOS.otro;
  const estadoConf = ESTADOS[exp.estado] || ESTADOS.abierto;
  const fallbackClientName = exp.cliente_nombre || exp.persona_contacto || "";
  const draftClientName = splitClientName(fallbackClientName);
  const linkedClient = exp.cliente_id
    ? clientes.find((client) => client.id === exp.cliente_id)
    : null;
  const linkedClientDisplayName = linkedClient
    ? linkedClient.commercial_name || [linkedClient.first_name, linkedClient.last_name].filter(Boolean).join(" ").trim() || exp.cliente_nombre || "Sin asignar"
    : fallbackClientName;
  const linkedClientSummary = [
    linkedClient?.nif_cif,
    linkedClient?.type,
    linkedClient?.phone_mobile || linkedClient?.phone_1,
    linkedClient?.email,
    linkedClient?.address_town,
  ].filter(Boolean);

  if (editing) {
    const initial: typeof EXP_EMPTY = {
      anio: exp.anio,
      ref_propia: exp.ref_propia || "",
      ref_expediente: exp.ref_expediente || "",
      descripcion: exp.descripcion || "",
      tipo: exp.tipo || "judicial",
      cliente_id: exp.cliente_id || "",
      cliente_nombre: exp.cliente_nombre || "",
      contrario: exp.contrario || "",
      procurador: exp.procurador || "",
      juzgado: exp.juzgado || "",
      tipo_proc: exp.tipo_proc || "",
      num_autos: exp.num_autos || "",
      nig: exp.nig || "",
      estado: exp.estado || "abierto",
      observaciones: exp.observaciones || "",
      fecha_inicio: exp.fecha_inicio ? exp.fecha_inicio.slice(0, 10) : "",
      fecha_cierre: exp.fecha_cierre ? exp.fecha_cierre.slice(0, 10) : "",
      importe: exp.importe ? String(exp.importe) : "",
      tipos_asunto: exp.tipos_asunto || "",
      cuantia_principal: exp.cuantia_principal ? String(exp.cuantia_principal) : "",
      intereses: exp.intereses ? String(exp.intereses) : "",
      costas: exp.costas ? String(exp.costas) : "",
      cuantia_total: exp.cuantia_total ? String(exp.cuantia_total) : "",
      indeterminado: exp.indeterminado || false,
      etapa: exp.etapa || "",
      persona_contacto: exp.persona_contacto || "",
      contacto: exp.contacto || "",
      centro: exp.centro || "",
      color: exp.color || "ninguno",
      ...(exp.num_exp ? { num_exp: exp.num_exp } : {}),
    } as typeof EXP_EMPTY;

    return (
      <ExpedienteModal
        editId={id}
        initial={initial}
        clientes={clientes}
        onSave={handleSave}
        onClose={() => setEditing(false)}
        saving={saving}
      />
    );
  }

  return (
    <div className="flex gap-6 animate-in fade-in duration-500">
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/dashboard/expedientes" className="hover:text-slate-800 transition-colors">
              Expedientes
            </Link>
            <span>/</span>
            <span className="text-slate-800 font-medium truncate">
              {exp.descripcion || `${exp.anio}/${exp.num_exp}`}
            </span>
          </div>
          <div className="flex gap-2">
            <BackButton onClick={() => navigate("/dashboard/expedientes")} />
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm active:scale-95 transition-all"
            >
              <Edit3 size={14} /> Editar
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-200 shrink-0">
              <FolderOpen size={28} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 truncate">
                  {exp.descripcion || "Sin descripción"}
                </h1>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${estadoConf.color}`}>
                  {estadoConf.label}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tipoConf.color}`}>
                  {tipoConf.label}
                </span>
              </div>
              {exp.tipos_asunto && <p className="text-slate-500 text-sm mt-0.5">{exp.tipos_asunto}</p>}
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                <span className="flex items-center gap-1 font-mono">
                  <Hash size={11} />
                  {exp.anio}/{exp.num_exp}
                </span>
                {exp.ref_expediente && (
                  <span className="flex items-center gap-1 font-mono">
                    <Hash size={11} />
                    {exp.ref_expediente}
                  </span>
                )}
                {exp.fecha_inicio && (
                  <span className="flex items-center gap-1">
                    <Calendar size={11} /> Alta: {fmtDate(exp.fecha_inicio)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex border-b border-slate-100 overflow-x-auto">
            {DETAIL_TABS.map((tabItem) => {
              const Icon = tabItem.icon;
              const active = tab === tabItem.key;
              return (
                <button
                  key={tabItem.key}
                  onClick={() => setTab(tabItem.key)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-[12px] font-bold whitespace-nowrap transition-all border-b-2 ${
                    active
                      ? "border-red-600 text-red-600 bg-red-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={13} />
                  {tabItem.label}
                </button>
              );
            })}
          </div>

          <div className="p-5">
            {tab === "perfil" && (
              <div className="space-y-4">
                <Section title="Identificación" icon={FolderOpen} cols={4}>
                  <Field label="Núm. expediente" value={`${exp.anio}/${exp.num_exp}`} mono />
                  <Field label="Fecha alta" value={fmtDate(exp.fecha_inicio)} />
                  <Field label="Fecha cierre" value={fmtDate(exp.fecha_cierre)} />
                  <Field label="Estado" value={estadoConf.label} />
                  <Field label="Descripción" value={exp.descripcion} wide />
                  <Field label="Tipo" value={tipoConf.label} />
                  <Field label="Tipos de asunto" value={exp.tipos_asunto} />
                  <Field label="Etapa" value={exp.etapa} />
                </Section>

                <Section title="Procedimiento judicial" icon={Scale} cols={3}>
                  <Field label="Tipo de procedimiento" value={exp.tipo_proc} />
                  <Field label="Juzgado / Tribunal" value={exp.juzgado} />
                  <Field label="Procurador propio" value={exp.procurador} />
                  <Field label="N.I.G." value={exp.nig} mono />
                  <Field label="Núm. autos" value={exp.num_autos} mono />
                </Section>

                <Section title="Cuantías económicas" icon={ClipboardList} cols={4}>
                  <Field label="Cuantía principal" value={fmtMoney(exp.cuantia_principal)} />
                  <Field label="Intereses" value={fmtMoney(exp.intereses)} />
                  <Field label="Costas" value={fmtMoney(exp.costas)} />
                  <Field label="Cuantía total" value={fmtMoney(exp.cuantia_total)} />
                  <Field label="Importe" value={fmtMoney(exp.importe)} />
                  <Field label="Indeterminada" value={exp.indeterminado ? "Sí" : "No"} />
                </Section>

                <Section title="Partes y referencias" icon={MoreHorizontal} cols={4}>
                  <Field label="Cliente" value={exp.cliente_nombre} />
                  <Field label="Parte contraria" value={exp.contrario} />
                  <Field label="Persona contacto" value={exp.persona_contacto} />
                  <Field label="Contacto" value={exp.contacto} />
                  <Field label="Ref. propia" value={exp.ref_propia} mono />
                  <Field label="Ref. expediente" value={exp.ref_expediente} mono />
                  <Field label="Centro" value={exp.centro} />
                  <Field label="Color" value={exp.color !== "ninguno" ? exp.color : "—"} />
                </Section>
              </div>
            )}

            {tab === "notas" && (
              <TabNotas
                expedienteId={id!}
                legacyNote={exp.observaciones}
                onLegacyUpdated={(next) => setExp((prev: any) => (prev ? { ...prev, observaciones: next || null } : prev))}
              />
            )}

            {tab === "clientes" && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                  <Users size={14} className="text-slate-400" />
                  <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Cliente vinculado</h3>
                </div>
                <div className="p-5 space-y-2">
                  {exp.cliente_id ? (
                    <Link
                      to={`/dashboard/clientes/${exp.cliente_id}`}
                      className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      {linkedClient?.photo_url ? (
                        <img
                          src={linkedClient.photo_url}
                          alt={linkedClientDisplayName || "Cliente"}
                          className="h-14 w-14 rounded-2xl object-cover border border-slate-200 bg-white"
                        />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-600">
                          {initialsFromName(linkedClientDisplayName)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-blue-600 hover:underline">{linkedClientDisplayName || "Sin asignar"}</p>
                        {linkedClientSummary.length > 0 && (
                          <p className="mt-1 text-xs text-slate-500 break-words">{linkedClientSummary.join(" · ")}</p>
                        )}
                        {exp.persona_contacto && (
                          <p className="mt-2 text-xs text-slate-500">Contacto expediente: {exp.persona_contacto}</p>
                        )}
                      </div>
                    </Link>
                  ) : fallbackClientName ? (
                    <>
                      <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-600">
                          {initialsFromName(fallbackClientName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800">{fallbackClientName}</p>
                          <p className="mt-1 text-xs text-slate-500">Cliente detectado en el expediente, aún no dado de alta en el ERP.</p>
                          {exp.persona_contacto && (
                            <p className="mt-2 text-xs text-slate-500">Contacto expediente: {exp.persona_contacto}</p>
                          )}
                        </div>
                      </div>
                      <Link
                        to={`/dashboard/clientes/new?mode=manual&expediente_id=${encodeURIComponent(id || "")}&first_name=${encodeURIComponent(draftClientName.first_name)}&last_name=${encodeURIComponent(draftClientName.last_name)}&commercial_name=${encodeURIComponent(fallbackClientName)}`}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm active:scale-95 transition-all"
                      >
                        Dar de alta a este cliente
                      </Link>
                    </>
                  ) : (
                    <p className="text-sm text-slate-300">Sin asignar</p>
                  )}
                  {exp.contacto && <p className="text-sm text-slate-500">{exp.contacto}</p>}
                </div>
              </div>
            )}

            {tab === "contrarios" && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                  <Users size={14} className="text-slate-400" />
                  <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Parte contraria</h3>
                </div>
                <div className="p-5">
                  <p className="text-sm text-slate-700 font-medium">
                    {exp.contrario || <span className="text-slate-300 font-normal">—</span>}
                  </p>
                </div>
              </div>
            )}

            {tab === "relacionados" && (
              <TabExpedientesRelacionados
                expedienteId={id!}
                currentRef={exp.ref_expediente || `${exp.anio}/${exp.num_exp}`}
              />
            )}

            {tab === "juzgados" && (
              <Section title="Juzgado y procedimiento" icon={Scale} cols={3}>
                <Field label="Juzgado / Tribunal" value={exp.juzgado} />
                <Field label="Tipo de procedimiento" value={exp.tipo_proc} />
                <Field label="N.I.G." value={exp.nig} mono />
                <Field label="Núm. autos" value={exp.num_autos} mono />
                <Field label="Procurador propio" value={exp.procurador} />
              </Section>
            )}

            {tab === "tareas" && (
              <TabTareas
                expedienteId={id!}
                clienteId={exp.cliente_id}
                expedienteRef={exp.ref_expediente || `${exp.anio}/${exp.num_exp}`}
                juzgado={exp.juzgado}
                numProc={exp.num_autos}
              />
            )}
            {tab === "adjuntos" && (
              <TabAdjuntosExpediente
                expedienteId={id!}
              />
            )}
            {tab === "historial" && <EmptyTab icon={Activity} label="Sin historial por ahora" />}
          </div>
        </div>
      </div>

      <aside className="w-52 shrink-0 space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden sticky top-6">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Indicadores</h3>
          </div>
          <div className="px-4 py-3">
            <Indicador label="Días sin actuaciones" value="0 días" />
            <Indicador label="Total cobrado" value="0 €" color="text-emerald-600" />
            <Indicador label="Imp. cobros pdtes." value="0 €" color="text-amber-600" />
            <Indicador label="Total prov. recibidas" value="0 €" color="text-slate-600" />
            <Indicador label="Nº exptes relac." value="0" color="text-blue-600" />
            <Indicador label="Saldo total exp." value="0 €" />
            <Indicador label="Pdte. facturar" value="0 €" color="text-red-600" />
          </div>
        </div>
      </aside>
    </div>
  );
}
