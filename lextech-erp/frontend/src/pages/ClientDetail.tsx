import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  Edit3, Loader2, AlertCircle,
  Mail, Phone, MapPin, User, Briefcase,
  Calendar, Hash, FileText, Shield, StickyNote,
  Paperclip, Clock, AlertTriangle, CheckCircle2,
  Upload, Plus, Trash2, ChevronRight, Gavel,
  FolderOpen, Eye, Download, X, Check, Sparkles, ExternalLink,
  ScrollText, Receipt, Scale, UserCheck,
  MessageSquare, FileSignature, ShieldAlert, FilePlus,
  FilePlus2, Search, ChevronDown, ChevronRight as ChevronR,
  Banknote, TrendingUp, TrendingDown, BadgeEuro,
} from "lucide-react";
import { safeJson, resolveApiUrl } from "../lib/api";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import { EtapaSelect } from "../components/EtapaSelect";
import BackButton from "../components/BackButton";

// ── helpers ───────────────────────────────────────────────────
const statusColor: Record<string, string> = {
  Alta:       "bg-emerald-100 text-emerald-700",
  Baja:       "bg-red-100 text-red-700",
  Suspendido: "bg-amber-100 text-amber-700",
  Potencial:  "bg-blue-100 text-blue-700",
};
const typeColor: Record<string, string> = {
  CLIENTE:   "bg-slate-100 text-slate-700",
  CONTRARIO: "bg-red-100 text-red-700",
  JUZGADO:   "bg-blue-100 text-blue-700",
  PERITO:    "bg-purple-100 text-purple-700",
  PROVEEDOR: "bg-amber-100 text-amber-700",
};

const Section = ({ title, icon: Icon, children }: any) => (
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
      <Icon size={14} className="text-slate-400" />
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{title}</h3>
    </div>
    <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
      {children}
    </div>
  </div>
);

const Field = ({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) => (
  <div>
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
    <p className={`text-sm text-slate-700 font-medium ${mono ? "font-mono" : ""}`}>
      {value || <span className="text-slate-300 font-normal">—</span>}
    </p>
  </div>
);

const EI = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100";

const EF = ({ label, children }: { label: string; mono?: boolean; children: React.ReactNode }) => (
  <div>
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
    {children}
  </div>
);

const Indicador = ({ label, value, color = "text-slate-700" }: any) => (
  <div className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
    <span className="text-xs text-slate-500">{label}</span>
    <span className={`text-xs font-bold ${color}`}>{value}</span>
  </div>
);

// ── Tabs ──────────────────────────────────────────────────────
const TABS = [
  { id: "perfil",      label: "Perfil",         icon: User },
  { id: "expedientes", label: "Expedientes",     icon: Briefcase },
  { id: "economico",   label: "Económico",       icon: Banknote },
  { id: "agenda",      label: "Agenda",          icon: Calendar },
  { id: "historial",   label: "Historial",       icon: Clock },
  { id: "notas",       label: "Notas",           icon: StickyNote },
  { id: "tareas",      label: "Tareas / Plazos", icon: AlertTriangle },
  { id: "adjuntos",    label: "Adjuntos",        icon: Paperclip },
];

// ── Tab: Perfil ───────────────────────────────────────────────
function TabPerfil({ client, formatDate, age }: any) {
  return (
    <div className="space-y-4">
      <Section title="Identificación" icon={User}>
        <Field label="Tipo documento"      value={client.document_type} />
        <Field label="NIF / CIF"           value={client.nif_cif} mono />
        <Field label="Naturaleza jurídica" value={client.legal_nature} />
        <Field label="Sexo"                value={client.gender === "M" ? "Masculino" : client.gender === "F" ? "Femenino" : client.gender} />
        <Field label="Fecha nacimiento"    value={formatDate(client.birth_date)} />
        <Field label="Edad"                value={age !== null ? `${age} años` : null} />
        <Field label="Nacionalidad"        value={client.nationality} />
        <Field label="País expedición"     value={client.expedition_country} />
      </Section>

      <Section title="Dirección" icon={MapPin}>
        <div className="col-span-2 md:col-span-3">
          <Field label="Dirección" value={client.address_street} />
        </div>
        <Field label="Población"     value={client.address_town} />
        <Field label="Código postal" value={client.address_cp} />
        <Field label="Provincia"     value={client.address_province} />
        <Field label="País"          value={client.address_country} />
      </Section>

      <Section title="Contacto" icon={Phone}>
        <div className="col-span-2 md:col-span-3">
          <Field label="Correo electrónico" value={client.email} />
        </div>
        <Field label="Teléfono"   value={client.phone_1} />
        <Field label="Móvil"      value={client.phone_mobile} />
        <Field label="Teléfono 2" value={client.phone_2} />
        <Field label="Teléfono 3" value={client.phone_3} />
        <Field label="Fax"        value={client.phone_fax} />
        <Field label="Web"        value={client.website} />
      </Section>

      <Section title="Administración" icon={Shield}>
        <Field label="Estado"                     value={client.client_status} />
        <Field label="Fecha alta"                 value={formatDate(client.date_alta)} />
        <Field label="Fecha baja"                 value={formatDate(client.date_baja)} />
        <Field label="LOPD"                       value={client.lopd} />
        <Field label="Comunicaciones comerciales" value={client.commercial_communications} />
        <Field label="Centro"                     value={client.center} />
        <Field label="Alta por"                   value={client.created_by} />
        <Field label="Fecha registro"             value={formatDate(client.created_at)} />
      </Section>
    </div>
  );
}

// ── Tab: Expedientes ──────────────────────────────────────────
const ESTADO_COLOR: Record<string, string> = {
  abierto:    "bg-emerald-100 text-emerald-700",
  cerrado:    "bg-slate-100   text-slate-500",
  suspendido: "bg-amber-100   text-amber-700",
  archivado:  "bg-red-100     text-red-600",
};
const TIPO_SHORT: Record<string, string> = {
  judicial:         "JUDICIAL",
  extrajudicial:    "EXTRAJUDICIAL",
  monitorio:        "MONITORIO",
  obligacion_hacer: "OBLIG. HACER",
  prejudicial:      "PREJUDICIAL",
  diligencias:      "DILIGENCIAS",
  penal:            "PENAL",
  laboral:          "LABORAL",
  contencioso:      "CONTENCIOSO",
  otro:             "OTRO",
};

function TabExpedientes({ clientId }: { clientId: string }) {
  const { getToken } = useAuth();
  const navigate     = useNavigate();
  const [expedientes, setExpedientes] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch(`/api/expedientes?clienteId=${clientId}&limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const data = await res.json();
        if (!cancelled) setExpedientes(data.data || []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Error al cargar expedientes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, getToken]);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={28} className="animate-spin text-red-400" />
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700 text-sm">{error}</div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">
          {expedientes.length} expediente{expedientes.length !== 1 ? "s" : ""} vinculado{expedientes.length !== 1 ? "s" : ""}
        </p>
        <Link
          to="/dashboard/expedientes?nuevo=1"
          className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm active:scale-95 transition-all"
        >
          <Plus size={15} /> Nuevo expediente
        </Link>
      </div>

      {expedientes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 flex flex-col items-center gap-3 text-slate-400">
          <Gavel size={40} className="opacity-20" />
          <p className="font-medium text-sm">No hay expedientes vinculados</p>
          <p className="text-xs text-slate-300">Crea un expediente y asígnale este cliente</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Referencia</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Asunto</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Tipo</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell">Contrario</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell">Apertura</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {expedientes.map((exp: any) => (
                <tr
                  key={exp.id}
                  onClick={() => window.open(`/dashboard/expedientes/${exp.id}`, "_blank")}
                  className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-bold text-red-700">
                      {exp.anio}/{String(exp.num_exp).padStart(3, "0")}
                    </span>
                    {exp.ref_propia && (
                      <span className="block text-[10px] text-slate-400 font-normal">{exp.ref_propia}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-[220px]">
                    <span className="text-sm font-medium text-slate-800 line-clamp-1">{exp.descripcion || "—"}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                      {TIPO_SHORT[exp.tipo] || exp.tipo || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ESTADO_COLOR[exp.estado] || "bg-slate-100 text-slate-500"}`}>
                      {exp.estado?.charAt(0).toUpperCase() + exp.estado?.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell max-w-[160px]">
                    <span className="truncate block">{exp.contrario || <span className="text-slate-300">—</span>}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap hidden lg:table-cell">
                    {exp.fecha_inicio ? new Date(exp.fecha_inicio).toLocaleDateString("es-ES") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-red-400 transition-colors inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: Historial ────────────────────────────────────────────
interface ActividadEntry {
  id: string;
  user_id: string;
  user_name: string;
  avatar_url?: string | null;
  action_type: string;
  created_at: string;
}

const activityAvatarUrl = (url?: string | null) => {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? url : `/${url}`;
};

function activityInitials(name?: string | null) {
  const safeName = name && !/^user_[A-Za-z0-9]+$/.test(name) ? name : "Usuario";
  return safeName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "U";
}

// Ícono y color según tipo de movimiento
function actividadMeta(action: string): { dot: string; badge: string; label: string; detail: string } {
  const lower = action.toLowerCase();
  const colonIdx = action.indexOf(":");
  const label  = colonIdx >= 0 ? action.slice(0, colonIdx).trim() : action;
  const detail = colonIdx >= 0 ? action.slice(colonIdx + 1).trim() : "";

  if (lower.startsWith("nuevo cliente"))     return { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", label, detail };
  if (lower.startsWith("datos del cliente")) return { dot: "bg-sky-500",     badge: "bg-sky-100 text-sky-700",         label, detail };
  if (lower.startsWith("archivo subido"))    return { dot: "bg-blue-500",    badge: "bg-blue-100 text-blue-700",        label, detail };
  if (lower.startsWith("archivo eliminado")) return { dot: "bg-red-400",     badge: "bg-red-100 text-red-600",          label, detail };
  if (lower.startsWith("documento creado"))  return { dot: "bg-indigo-500",  badge: "bg-indigo-100 text-indigo-700",    label, detail };
  if (lower.startsWith("nota añadida"))      return { dot: "bg-amber-500",   badge: "bg-amber-100 text-amber-700",      label, detail };
  if (lower.startsWith("nota eliminada"))    return { dot: "bg-orange-400",  badge: "bg-orange-100 text-orange-700",    label, detail };
  return                                            { dot: "bg-slate-400",   badge: "bg-slate-100 text-slate-600",      label, detail };
}

function TabHistorial({ clientId }: { clientId: string }) {
  const { getToken } = useAuth();
  const [actividades, setActividades] = useState<ActividadEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const lastFetchRef                  = useRef<number>(0);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })
      + " · " + d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  };

  // Carga silenciosa (sin mostrar spinner) para polling
  const fetchActividades = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/activity/client/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setActividades(data.data);
        lastFetchRef.current = Date.now();
      } else {
        setError(data.error || "Error al cargar el historial");
      }
    } catch (e: any) {
      setError(e.message || "Error de red");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [clientId, getToken]);

  // Carga inicial
  useEffect(() => { fetchActividades(true); }, [fetchActividades]);

  // Polling cada 10 segundos como fallback
  useEffect(() => {
    const id = setInterval(() => fetchActividades(false), 10000);
    return () => clearInterval(id);
  }, [fetchActividades]);

  // Actualización instantánea cuando se hace una acción en la página
  useEffect(() => {
    const handler = () => fetchActividades(false);
    window.addEventListener('historial-changed', handler);
    return () => window.removeEventListener('historial-changed', handler);
  }, [fetchActividades]);

  // Refresh al recuperar foco de ventana
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastFetchRef.current > 10000) fetchActividades(false);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchActividades]);

  return (
    <div className="space-y-3">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {loading ? "Cargando…" : `${actividades.length} movimiento${actividades.length !== 1 ? "s" : ""} registrado${actividades.length !== 1 ? "s" : ""}`}
        </p>
        <button
          onClick={() => fetchActividades(false)}
          disabled={loading || refreshing}
          className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors disabled:opacity-50"
        >
          <Loader2 size={12} className={(loading || refreshing) ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      {/* Línea de tiempo */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-14 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 size={28} className="animate-spin opacity-40" />
            <p className="text-sm">Cargando historial…</p>
          </div>
        ) : error ? (
          <div className="p-10 flex flex-col items-center gap-2 text-red-400">
            <AlertCircle size={26} className="opacity-60" />
            <p className="text-sm font-medium">{error}</p>
            <button onClick={() => fetchActividades(true)} className="text-xs text-red-500 underline mt-1">Reintentar</button>
          </div>
        ) : actividades.length === 0 ? (
          <div className="p-14 flex flex-col items-center gap-3 text-slate-300">
            <Clock size={36} className="opacity-60" />
            <p className="text-sm font-medium text-slate-400">Sin movimientos registrados</p>
            <p className="text-xs text-slate-400">Los movimientos aparecerán aquí automáticamente</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {actividades.map((a, idx) => {
              const { dot, badge, label, detail } = actividadMeta(a.action_type);
              const displayName = a.user_name && !/^user_[A-Za-z0-9]+$/.test(a.user_name) ? a.user_name : "Usuario";
              const avatarUrl = activityAvatarUrl(a.avatar_url);
              return (
                <div key={a.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
                  {/* Línea vertical + punto */}
                  <div className="flex flex-col items-center pt-1 shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${dot} shrink-0`} />
                    {idx < actividades.length - 1 && (
                      <span className="w-px flex-1 bg-slate-100 mt-1" style={{ minHeight: 16 }} />
                    )}
                  </div>
                  {/* Contenido */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge}`}>{label}</span>
                      {detail && <span className="text-sm text-slate-700 truncate">{detail}</span>}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(a.created_at)}</p>
                  </div>
                  {/* Usuario */}
                  <div className="hidden md:flex items-center gap-2 shrink-0 pt-0.5">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={displayName} className="h-7 w-7 rounded-full object-cover border border-slate-200" />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-red-100 text-red-700 text-[10px] font-bold flex items-center justify-center border border-red-200">
                        {activityInitials(displayName)}
                      </div>
                    )}
                    <span className="text-[11px] text-slate-400">
                      {displayName}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: Notas ────────────────────────────────────────────────
// ── Tab: Notas ─────────────────────────────────────────────────
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

function TabNotas({ clientId }: { clientId: string }) {
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

  // Helper: cabeceras con token JWT de Clerk
  const authHeaders = async (): Promise<Record<string, string>> => {
    const token = await getToken({ skipCache: true });
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  // Colores disponibles para las notas
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

  // Cargar notas
  const cargarNotas = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const headers = await authHeaders();
      const response = await fetch(`/api/entities/${clientId}/notes`, { headers });
      if (response.ok) {
        const data = await response.json();
        setNotas(data.data || []);
      } else if (!silent) {
        console.error("Error cargando notas:", response.statusText);
      }
    } catch (error) {
      if (!silent) console.error("Error cargando notas:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (clientId) cargarNotas();
  }, [clientId, cargarNotas]);

  // Auto-refrescar notas cada 30s
  useAutoRefresh(() => cargarNotas(true), { intervalMs: 30_000, enabled: !!clientId });

  // Agregar nueva nota
  const addNota = async () => {
    if (!nueva.trim()) return;
    setSaving(true);
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/entities/${clientId}/notes`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          content: nueva.trim(),
          category: categoria,
          priority: prioridad,
          color: color,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotas(prev => [data.data, ...prev]);
        window.dispatchEvent(new CustomEvent('historial-changed'));
        setNueva("");
        setCategoria("general");
        setPrioridad("normal");
        setColor("#FCD34D");
      } else {
        console.error("Error guardando nota:", response.statusText);
      }
    } catch (error) {
      console.error("Error guardando nota:", error);
    } finally {
      setSaving(false);
    }
  };

  // Editar nota
  const startEdit = (nota: Nota) => {
    setEditingId(nota.id);
    setEditContent(nota.content);
  };

  const saveEdit = async (notaId: string) => {
    if (!editContent.trim()) return;
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/entities/${clientId}/notes/${notaId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ content: editContent.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotas(prev => prev.map(n => n.id === notaId ? data.data : n));
        setEditingId(null);
        setEditContent("");
      }
    } catch (error) {
      console.error("Error editando nota:", error);
    }
  };

  // Eliminar nota — muestra modal de confirmación
  const deleteNota = (notaId: string) => setConfirmDeleteId(notaId);

  const confirmDeleteNota = async () => {
    if (!confirmDeleteId) return;
    const notaId = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      const headers = await authHeaders();
      const response = await fetch(`/api/entities/${clientId}/notes/${notaId}`, {
        method: "DELETE",
        headers,
      });
      if (response.ok) {
        setNotas(prev => prev.filter(n => n.id !== notaId));
        window.dispatchEvent(new CustomEvent('historial-changed'));
      }
    } catch (error) {
      console.error("Error eliminando nota:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Nueva nota */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Nueva nota</p>
        <textarea
          value={nueva}
          onChange={e => setNueva(e.target.value)}
          placeholder="Escribe una nota sobre este cliente…"
          rows={3}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
        />

        {/* Opciones de personalización */}
        <div className="grid grid-cols-3 gap-3">
          {/* Categoría */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Categoría</label>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-red-400"
            >
              {categorias.map(c => <option key={c.valor} value={c.valor}>{c.nombre}</option>)}
            </select>
          </div>

          {/* Prioridad */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Prioridad</label>
            <select
              value={prioridad}
              onChange={e => setPrioridad(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-red-400"
            >
              {prioridades.map(p => <option key={p.valor} value={p.valor}>{p.nombre}</option>)}
            </select>
          </div>

          {/* Color */}
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Color</label>
            <div className="flex gap-1">
              {colores.map(c => (
                <button
                  key={c.valor}
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
            onClick={addNota}
            disabled={saving || !nueva.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded-xl active:scale-95 transition-all"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Guardar nota
          </button>
        </div>
      </div>

      {/* Lista notas */}
      {notas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center gap-3 text-slate-400">
          <StickyNote size={36} className="opacity-20" />
          <p className="text-sm font-medium">No hay notas todavía</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notas.map(n => (
            <div key={n.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden" style={{ borderLeft: `4px solid ${n.color}` }}>
              <div className="p-4 space-y-2">
                {/* Badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {categorias.find(c => c.valor === n.category)?.nombre || n.category}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    n.priority === "urgente" ? "bg-red-100 text-red-600" :
                    n.priority === "alta" ? "bg-orange-100 text-orange-600" :
                    n.priority === "normal" ? "bg-blue-100 text-blue-600" :
                    "bg-slate-100 text-slate-600"
                  }`}>
                    {prioridades.find(p => p.valor === n.priority)?.nombre || n.priority}
                  </span>
                </div>

                {/* Contenido */}
                {editingId === n.id ? (
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-400"
                    rows={3}
                  />
                ) : (
                  <p className="text-sm text-slate-800 leading-relaxed">{n.content}</p>
                )}

                {/* Meta */}
                <p className="text-[10px] text-slate-400">
                  {n.created_by && !/^user_[A-Za-z0-9]+$/.test(n.created_by) ? n.created_by : 'Usuario'} · {new Date(n.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>

                {/* Acciones */}
                <div className="flex gap-2 justify-end pt-2">
                  {editingId === n.id ? (
                    <>
                      <button
                        onClick={() => saveEdit(n.id)}
                        className="px-3 py-1 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg transition-all"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 transition-all"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(n)}
                        className="p-1 text-neutral-300 hover:text-red-600 transition-colors"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => deleteNota(n.id)}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal confirmación borrar nota ── */}
      {confirmDeleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 size={18} className="text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Eliminar nota</h3>
                  <p className="text-sm text-slate-500 mt-0.5">Esta acción no se puede deshacer.</p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDeleteNota}
                  className="flex-1 px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Tareas / Plazos ──────────────────────────────────────
// ── Formulario inline de nueva tarea ──────────────────────────
interface TareaForm {
  titulo: string; descripcion: string; plazo: string; fecha_aviso: string;
  estado: string; prioridad: string; expediente: string;
  tipo: string; juzgado: string; num_proc: string;
  importe: string; notas: string; etapa: string;
}
const TAREA_EMPTY: TareaForm = {
  titulo: "", descripcion: "", plazo: "", fecha_aviso: "",
  estado: "pendiente", prioridad: "media", expediente: "",
  tipo: "otro", juzgado: "", num_proc: "",
  importe: "", notas: "", etapa: "",
};

const TIPO_CONFIG: Record<string, { label: string; color: string }> = {
  plazo_procesal: { label: "Plazo Procesal",  color: "bg-red-100 text-red-700" },
  vista_juicio:   { label: "Vista / Juicio",  color: "bg-purple-100 text-purple-700" },
  notificacion:   { label: "Notificación",    color: "bg-blue-100 text-blue-700" },
  reunion:        { label: "Reunión",         color: "bg-green-100 text-green-700" },
  escrito:        { label: "Escrito",         color: "bg-indigo-100 text-indigo-700" },
  gestion:        { label: "Gestión",         color: "bg-amber-100 text-amber-700" },
  pago:           { label: "Pago / Factura",  color: "bg-emerald-100 text-emerald-700" },
  llamada:        { label: "Llamada",         color: "bg-teal-100 text-teal-700" },
  diligencia:     { label: "Diligencia",      color: "bg-orange-100 text-orange-700" },
  otro:           { label: "Otro",            color: "bg-slate-100 text-slate-500" },
};

function TabTareas({ clientId, autoOpen = false, initialTaskType = "" }: { clientId: string; autoOpen?: boolean; initialTaskType?: string }) {
  const { getToken } = useAuth();
  const [tareas, setTareas]       = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState<TareaForm>(TAREA_EMPTY);
  const [saving, setSaving]       = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [editForm, setEditForm]   = useState<TareaForm>(TAREA_EMPTY);
  const [filter, setFilter]       = useState<"todas"|"pendiente"|"urgente"|"completada">("todas");
  const [filterTipo, setFilterTipo]     = useState("");
  const [filterPrio, setFilterPrio]     = useState("");
  const [filterVencidas, setFilterVencidas] = useState(false);
  const [search, setSearch]             = useState("");
  const [confirmDeleteTareaId, setConfirmDeleteTareaId] = useState<string | null>(null);

  useEffect(() => {
    if (!autoOpen) return;
    setShowForm(true);
    setEditId(null);
    setForm(prev => ({
      ...TAREA_EMPTY,
      tipo: initialTaskType || prev.tipo || "otro",
    }));
  }, [autoOpen, initialTaskType]);

  const estadoStyle: Record<string, string> = {
    pendiente:  "bg-amber-100 text-amber-700",
    urgente:    "bg-red-100 text-red-700",
    completada: "bg-emerald-100 text-emerald-700",
  };
  const estadoLabel: Record<string, string> = {
    pendiente: "Pendiente", urgente: "Urgente", completada: "Completada",
  };
  const prioridadStyle: Record<string, string> = {
    alta: "text-red-500", media: "text-amber-500", baja: "text-slate-400",
  };

  const fetchTareas = useCallback(async () => {
    setFetchError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/client/${clientId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok) setTareas(data.data || []);
      else setFetchError(data.error || "Error al cargar tareas");
    } catch (e: any) {
      setFetchError(e.message || "Error de conexión con el servidor");
    } finally { setLoading(false); }
  }, [clientId, getToken]);

  useEffect(() => { fetchTareas(); }, [fetchTareas]);

  const handleCreate = async () => {
    if (!form.titulo.trim()) return;
    setSaving(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/client/${clientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await safeJson(res);
      if (res.ok) {
        setTareas(prev => [data.data, ...prev]);
        setForm(TAREA_EMPTY);
        setShowForm(false);
        window.dispatchEvent(new CustomEvent('historial-changed'));
      }
    } finally { setSaving(false); }
  };

  const handleToggleEstado = async (t: any) => {
    const nuevoEstado = t.estado === "completada" ? "pendiente" : "completada";
    const token = await getToken({ skipCache: true });
    const res = await fetch(`/api/tasks/${t.id}/estado`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    if (res.ok) setTareas(prev => prev.map(x => x.id === t.id ? { ...x, estado: nuevoEstado } : x));
  };

  const handleDelete = (id: string) => setConfirmDeleteTareaId(id);

  const confirmDeleteTarea = async () => {
    if (!confirmDeleteTareaId) return;
    const id = confirmDeleteTareaId;
    setConfirmDeleteTareaId(null);
    const token = await getToken({ skipCache: true });
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      setTareas(prev => prev.filter(x => x.id !== id));
      window.dispatchEvent(new CustomEvent('historial-changed'));
    }
  };

  const startEdit = (t: any) => {
    setEditId(t.id);
    setEditForm({
      titulo:      t.titulo || "",
      descripcion: t.descripcion || "",
      plazo:       t.plazo ? t.plazo.slice(0, 10) : "",
      fecha_aviso: t.fecha_aviso ? t.fecha_aviso.slice(0, 10) : "",
      estado:      t.estado,
      prioridad:   t.prioridad,
      expediente:  t.expediente || "",
      tipo:        t.tipo || "otro",
      juzgado:     t.juzgado || "",
      num_proc:    t.num_proc || "",
      importe:     t.importe != null ? String(t.importe) : "",
      notas:       t.notas || "",
      etapa:       t.etapa || "",
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
        body: JSON.stringify(editForm),
      });
      const data = await safeJson(res);
      if (res.ok) {
        setTareas(prev => prev.map(x => x.id === editId ? data.data : x));
        setEditId(null);
      }
    } finally { setSaving(false); }
  };

  const isVencida = (t: any) => t.plazo && t.estado !== "completada" && new Date(t.plazo) < new Date();
  const fmtPlazo = (d: string) => {
    if (!d) return null;
    return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  };
  const visible = tareas.filter(t => {
    if (filter !== "todas" && t.estado !== filter) return false;
    if (filterTipo && t.tipo !== filterTipo) return false;
    if (filterPrio && t.prioridad !== filterPrio) return false;
    if (filterVencidas && !isVencida(t)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = [t.titulo, t.descripcion, t.expediente, t.juzgado, t.num_proc, t.created_by]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 size={22} className="animate-spin text-slate-300" />
    </div>
  );

  if (fetchError) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center gap-3 text-center">
      <AlertCircle size={28} className="text-red-400" />
      <div>
        <p className="text-sm font-semibold text-red-700">No se pudieron cargar las tareas</p>
        <p className="text-xs text-red-500 mt-1">{fetchError}</p>
      </div>
      <button onClick={fetchTareas}
        className="mt-1 px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
        Reintentar
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="space-y-2">
        {/* Fila 1: estado + botón nueva */}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 text-xs">
            {(["todas","pendiente","urgente","completada"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg font-semibold capitalize transition-colors ${filter === f ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {f === "todas"      ? `Todas (${tareas.length})` :
                 f === "pendiente"  ? `Pendientes (${tareas.filter(x => x.estado === "pendiente").length})` :
                 f === "urgente"    ? `Urgentes (${tareas.filter(x => x.estado === "urgente").length})` :
                                     `Completadas (${tareas.filter(x => x.estado === "completada").length})`}
              </button>
            ))}
          </div>
          <button onClick={() => { setShowForm(v => !v); setForm(TAREA_EMPTY); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-sm active:scale-95 transition-all">
            <Plus size={15} /> Nueva tarea
          </button>
        </div>

        {/* Fila 2: búsqueda + tipo + prioridad + vencidas */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Búsqueda */}
          <div className="relative flex-1 min-w-[160px]">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar tarea…"
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-red-400 bg-white"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                <X size={11} />
              </button>
            )}
          </div>

          {/* Tipo */}
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-red-400 bg-white text-slate-600">
            <option value="">Todos los tipos</option>
            {Object.entries(TIPO_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {/* Prioridad */}
          <div className="flex gap-1">
            {[["", "Todas"], ["alta", "Alta"], ["media", "Media"], ["baja", "Baja"]].map(([val, label]) => (
              <button key={val} onClick={() => setFilterPrio(val)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                  filterPrio === val
                    ? val === "alta"  ? "bg-red-600 text-white"
                    : val === "media" ? "bg-amber-500 text-white"
                    : val === "baja"  ? "bg-slate-500 text-white"
                    : "bg-slate-700 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {/* Vencidas */}
          <button onClick={() => setFilterVencidas(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              filterVencidas ? "bg-red-100 text-red-700 border border-red-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}>
            <AlertTriangle size={11} /> Vencidas
          </button>

          {/* Limpiar filtros */}
          {(filterTipo || filterPrio || filterVencidas || search) && (
            <button onClick={() => { setFilterTipo(""); setFilterPrio(""); setFilterVencidas(false); setSearch(""); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X size={11} /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Formulario nueva tarea */}
      {showForm && (
        <div className="bg-white border border-red-200 rounded-xl p-5 space-y-4 shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nueva tarea / plazo</p>

          {/* Título */}
          <input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
            placeholder="Título de la tarea *" autoFocus
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" />

          {/* Descripción */}
          <textarea value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))}
            placeholder="Descripción / instrucciones (opcional)" rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" />

          {/* Fila 1: Tipo + Fecha límite + Estado + Prioridad */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2 md:col-span-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo de tarea</label>
              <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5">
                {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha límite</label>
              <input type="date" value={form.plazo} onChange={e => setForm(p => ({ ...p, plazo: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado</label>
              <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5">
                <option value="pendiente">Pendiente</option>
                <option value="urgente">Urgente</option>
                <option value="completada">Completada</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prioridad</label>
              <select value={form.prioridad} onChange={e => setForm(p => ({ ...p, prioridad: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5">
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>

          {/* Fila 2: Expediente + Juzgado/Tribunal + Nº Procedimiento */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expediente</label>
              <input value={form.expediente} onChange={e => setForm(p => ({ ...p, expediente: e.target.value }))}
                placeholder="EXP-2024-001"
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Juzgado / Tribunal</label>
              <input value={form.juzgado} onChange={e => setForm(p => ({ ...p, juzgado: e.target.value }))}
                placeholder="Juzgado de 1ª Instancia nº 3"
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nº Procedimiento</label>
              <input value={form.num_proc} onChange={e => setForm(p => ({ ...p, num_proc: e.target.value }))}
                placeholder="123/2024"
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5" />
            </div>
          </div>

          {/* Fila 3: Fecha aviso + Importe */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">🔔 Fecha de aviso</label>
              <input type="date" value={form.fecha_aviso} onChange={e => setForm(p => ({ ...p, fecha_aviso: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5" />
              <p className="text-[10px] text-slate-400 mt-0.5">Recordatorio antes del plazo límite</p>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">💶 Importe (€)</label>
              <input type="number" step="0.01" min="0" value={form.importe}
                onChange={e => setForm(p => ({ ...p, importe: e.target.value }))}
                placeholder="0,00"
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5" />
              <p className="text-[10px] text-slate-400 mt-0.5">Para pagos, honorarios, tasas...</p>
            </div>
          </div>

          {/* Fila 4: Etapa + Notas internas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">🏷️ Etapa</label>
              <EtapaSelect value={form.etapa} onChange={v => setForm(p => ({ ...p, etapa: v }))} getToken={getToken} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">📝 Notas internas</label>
              <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
                rows={2} placeholder="Observaciones internas, apuntes del letrado..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 mt-0.5" />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors">
              Cancelar
            </button>
            <button onClick={handleCreate} disabled={saving || !form.titulo.trim()}
              className="flex items-center gap-2 px-5 py-1.5 text-sm font-bold text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 rounded-lg active:scale-95 transition-all">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Guardar tarea
            </button>
          </div>
        </div>
      )}

      {/* Lista de tareas */}
      {visible.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-14 flex flex-col items-center gap-3 text-slate-400">
          <CheckCircle2 size={36} className="opacity-20" />
          <p className="font-medium text-sm">
            {(search || filterTipo || filterPrio || filterVencidas) ? "No hay tareas con esos filtros" : filter !== "todas" ? `Sin tareas en estado "${filter}"` : "Sin tareas"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(t => (
            <div key={t.id}
              className={`bg-white border rounded-xl p-4 flex items-start gap-3 transition-colors ${
                t.estado === "completada" ? "border-slate-100 opacity-60" :
                isVencida(t) ? "border-red-200 bg-red-50/30" : "border-slate-200 hover:border-slate-300"
              }`}>

              {/* Checkbox */}
              <button onClick={() => handleToggleEstado(t)}
                className={`mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                  t.estado === "completada" ? "bg-emerald-500 border-emerald-500" : "border-slate-300 hover:border-red-400"
                }`}>
                {t.estado === "completada" && <CheckCircle2 size={10} className="text-white" />}
              </button>

              {/* Contenido */}
              {editId === t.id ? (
                <div className="flex-1 space-y-3">
                  {/* Título */}
                  <input value={editForm.titulo} onChange={e => setEditForm(p => ({ ...p, titulo: e.target.value }))}
                    placeholder="Título *"
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-red-400" />
                  {/* Descripción */}
                  <textarea value={editForm.descripcion} onChange={e => setEditForm(p => ({ ...p, descripcion: e.target.value }))}
                    rows={2} placeholder="Descripción"
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:border-red-400" />
                  {/* Fila 1 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Tipo</p>
                      <select value={editForm.tipo} onChange={e => setEditForm(p => ({ ...p, tipo: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400">
                        {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Fecha límite</p>
                      <input type="date" value={editForm.plazo} onChange={e => setEditForm(p => ({ ...p, plazo: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Estado</p>
                      <select value={editForm.estado} onChange={e => setEditForm(p => ({ ...p, estado: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400">
                        <option value="pendiente">Pendiente</option>
                        <option value="urgente">Urgente</option>
                        <option value="completada">Completada</option>
                      </select>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Prioridad</p>
                      <select value={editForm.prioridad} onChange={e => setEditForm(p => ({ ...p, prioridad: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400">
                        <option value="alta">Alta</option>
                        <option value="media">Media</option>
                        <option value="baja">Baja</option>
                      </select>
                    </div>
                  </div>
                  {/* Fila 2 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Expediente</p>
                      <input value={editForm.expediente} onChange={e => setEditForm(p => ({ ...p, expediente: e.target.value }))}
                        placeholder="EXP-2024-001"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Juzgado / Tribunal</p>
                      <input value={editForm.juzgado} onChange={e => setEditForm(p => ({ ...p, juzgado: e.target.value }))}
                        placeholder="Juzgado de 1ª Instancia nº 3"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Nº Procedimiento</p>
                      <input value={editForm.num_proc} onChange={e => setEditForm(p => ({ ...p, num_proc: e.target.value }))}
                        placeholder="123/2024"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
                    </div>
                  </div>
                  {/* Fila 3: Aviso + Importe */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">🔔 Fecha de aviso</p>
                      <input type="date" value={editForm.fecha_aviso} onChange={e => setEditForm(p => ({ ...p, fecha_aviso: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">💶 Importe (€)</p>
                      <input type="number" step="0.01" min="0" value={editForm.importe}
                        onChange={e => setEditForm(p => ({ ...p, importe: e.target.value }))}
                        placeholder="0,00"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-red-400" />
                    </div>
                  </div>
                  {/* Etapa + Notas internas */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">🏷️ Etapa</p>
                      <EtapaSelect value={editForm.etapa} onChange={v => setEditForm(p => ({ ...p, etapa: v }))} getToken={getToken} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">📝 Notas internas</p>
                      <textarea value={editForm.notas} onChange={e => setEditForm(p => ({ ...p, notas: e.target.value }))}
                        rows={2} placeholder="Observaciones internas..."
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:border-red-400" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditId(null)} className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700">Cancelar</button>
                    <button onClick={saveEdit} disabled={saving}
                      className="px-4 py-1 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg disabled:opacity-50">
                      {saving ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-w-0">
                  {/* Título */}
                  <p className={`text-sm font-semibold mb-1.5 ${t.estado === "completada" ? "line-through text-slate-400" : "text-slate-800"}`}>
                    {t.titulo}
                  </p>

                  {/* Descripción */}
                  {t.descripcion && (
                    <p className="text-xs text-slate-500 mb-2 line-clamp-2 leading-relaxed">{t.descripcion}</p>
                  )}

                  {/* Badges de tipo + estado + prioridad */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                      TIPO_CONFIG[t.tipo]?.color || "bg-slate-100 text-slate-500 border-slate-200"
                    }`}>
                      {TIPO_CONFIG[t.tipo]?.label || "Otro"}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${estadoStyle[t.estado]}`}>
                      {estadoLabel[t.estado]}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      t.prioridad === "alta"  ? "bg-red-50 text-red-600 border-red-200" :
                      t.prioridad === "media" ? "bg-amber-50 text-amber-600 border-amber-200" :
                                               "bg-slate-50 text-slate-400 border-slate-200"
                    }`}>
                      ↑ {t.prioridad}
                    </span>
                  </div>

                  {/* Metadatos */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                    {/* Fecha límite — siempre visible */}
                    <span className={`flex items-center gap-1 font-medium ${isVencida(t) ? "text-red-600" : t.plazo ? "text-slate-400" : "text-slate-300"}`}>
                      <Calendar size={10} />
                      {t.plazo ? (
                        <>{fmtPlazo(t.plazo)}{isVencida(t) && <span className="font-bold text-red-600 ml-1">VENCIDA</span>}</>
                      ) : "Sin fecha límite"}
                    </span>
                    {/* Fecha de creación */}
                    <span className="flex items-center gap-1 text-slate-300">
                      <Clock size={10} /> Creada {new Date(t.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                    {t.expediente && (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Briefcase size={10} /> {t.expediente}
                      </span>
                    )}
                    {t.num_proc && (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Hash size={10} /> {t.num_proc}
                      </span>
                    )}
                    {t.juzgado && (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Gavel size={10} /> {t.juzgado}
                      </span>
                    )}
                    {t.fecha_aviso && (
                      <span className={`flex items-center gap-1 font-medium ${new Date(t.fecha_aviso) < new Date() && t.estado !== 'completada' ? 'text-amber-600' : 'text-slate-400'}`}>
                        🔔 Aviso: {fmtPlazo(t.fecha_aviso)}
                      </span>
                    )}
                    {t.importe != null && Number(t.importe) > 0 && (
                      <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                        💶 {Number(t.importe).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                      </span>
                    )}
                    {t.etapa && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        🏷️ {t.etapa}
                      </span>
                    )}
                    {t.created_by && (
                      <span className="flex items-center gap-1 text-slate-400">
                        <User size={10} /> {/^user_[A-Za-z0-9]+$/.test(t.created_by) ? 'Usuario' : t.created_by}
                      </span>
                    )}
                  </div>
                  {/* Notas internas */}
                  {t.notas && (
                    <div className="mt-2 px-2 py-1.5 bg-amber-50 border border-amber-100 rounded-lg text-[11px] text-amber-800 leading-relaxed">
                      <span className="font-bold">📝 Nota: </span>{t.notas}
                    </div>
                  )}
                </div>
              )}

              {/* Acciones — siempre visibles */}
              {editId !== t.id && (
                <div className="flex flex-col items-end gap-1.5 shrink-0 ml-2">
                  <button onClick={() => startEdit(t)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                    <Edit3 size={12} /> Editar
                  </button>
                  <button onClick={() => handleDelete(t.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                    <Trash2 size={12} /> Borrar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Modal confirmación borrar tarea ── */}
      {confirmDeleteTareaId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setConfirmDeleteTareaId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}>
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
              <button onClick={() => setConfirmDeleteTareaId(null)}
                className="flex-1 px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                Cancelar
              </button>
              <button onClick={confirmDeleteTarea}
                className="flex-1 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Plantillas de documentos para despacho de abogados ────────
const PLANTILLAS = [
  {
    id: "encargo",
    label: "Hoja de Encargo",
    desc: "Encargo profesional obligatorio (Ley 34/2006)",
    icon: ScrollText,
    color: "bg-blue-50 text-blue-600 border-blue-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Hoja de Encargo — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.6}
h1{font-size:18px;text-align:center;margin-bottom:4px}h2{font-size:13px;text-align:center;color:#555;margin-top:0}
.datos{border:1px solid #ccc;padding:16px;border-radius:4px;margin:20px 0}
.fila{display:grid;grid-template-columns:160px 1fr;gap:4px;margin-bottom:6px}
.etiq{font-weight:bold;color:#444}.firma{margin-top:60px;display:flex;justify-content:space-between}
.bloque-firma{text-align:center;width:45%}.linea{border-top:1px solid #333;margin-top:40px;padding-top:6px}
p{margin:8px 0}</style></head><body>
<h1>HOJA DE ENCARGO PROFESIONAL</h1>
<h2>Despacho de Abogados</h2>
<div class="datos">
  <div class="fila"><span class="etiq">Cliente:</span><span>${c.first_name} ${c.last_name || ""}</span></div>
  <div class="fila"><span class="etiq">NIF/CIF:</span><span>${c.nif_cif || "—"}</span></div>
  <div class="fila"><span class="etiq">Domicilio:</span><span>${c.address_street || "—"}, ${c.address_town || ""} ${c.address_cp || ""}</span></div>
  <div class="fila"><span class="etiq">Teléfono:</span><span>${c.phone_1 || c.phone_mobile || "—"}</span></div>
  <div class="fila"><span class="etiq">Email:</span><span>${c.email || "—"}</span></div>
</div>
<p><strong>Objeto del encargo:</strong></p>
<p>_______________________________________________________________________________________________________________</p>
<p>_______________________________________________________________________________________________________________</p>
<p><strong>Honorarios estimados:</strong> __________ € + IVA</p>
<p><strong>Forma de pago:</strong> ____________________________________________</p>
<p><strong>Provisión de fondos:</strong> __________ €</p>
<p>El cliente declara haber sido informado de los derechos que le asisten conforme a la Ley 34/2006, así como de la posibilidad de recurrir al Colegio de Abogados en caso de discrepancia sobre honorarios.</p>
<div class="firma">
  <div class="bloque-firma"><div class="linea">El Letrado/a</div></div>
  <div class="bloque-firma"><div class="linea">El Cliente</div></div>
</div>
<p style="text-align:center;margin-top:30px;font-size:11px;color:#999">Fecha: ${new Date().toLocaleDateString("es-ES")}</p>
</body></html>`,
  },
  {
    id: "contrato",
    label: "Contrato de Servicios",
    desc: "Contrato de prestación de servicios jurídicos",
    icon: FileSignature,
    color: "bg-indigo-50 text-indigo-600 border-indigo-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Contrato de Servicios — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.7}
h1{font-size:17px;text-align:center}h2{font-size:13px;margin-top:20px;text-transform:uppercase;color:#333}
.firma{margin-top:60px;display:flex;justify-content:space-between}
.bloque-firma{text-align:center;width:45%}.linea{border-top:1px solid #333;margin-top:40px;padding-top:6px}
p{margin:6px 0}</style></head><body>
<h1>CONTRATO DE PRESTACIÓN DE SERVICIOS JURÍDICOS</h1>
<p>En _______________, a ${new Date().toLocaleDateString("es-ES")}.</p>
<h2>REUNIDOS</h2>
<p><strong>De una parte:</strong> D./Dña. _______________________, Letrado/a colegiado/a nº _______, con domicilio profesional en _________________________.</p>
<p><strong>De otra parte:</strong> D./Dña. <strong>${c.first_name} ${c.last_name || ""}</strong>, con NIF <strong>${c.nif_cif || "—"}</strong>, domiciliado/a en ${c.address_street || "—"}, ${c.address_town || ""} (en adelante, "el Cliente").</p>
<h2>ACUERDAN</h2>
<p><strong>PRIMERO. Objeto.</strong> El Letrado/a se compromete a prestar al Cliente los servicios jurídicos consistentes en: _______________________________________________.</p>
<p><strong>SEGUNDO. Duración.</strong> El presente contrato tendrá vigencia desde la fecha de su firma hasta la finalización del asunto objeto del encargo.</p>
<p><strong>TERCERO. Honorarios.</strong> Los honorarios profesionales se fijan en __________ €, más el IVA correspondiente.</p>
<p><strong>CUARTO. Confidencialidad.</strong> El Letrado/a queda obligado al secreto profesional respecto de toda información que le sea revelada por el Cliente.</p>
<p><strong>QUINTO. Legislación aplicable.</strong> El presente contrato se rige por la legislación española vigente.</p>
<div class="firma">
  <div class="bloque-firma"><div class="linea">El Letrado/a</div></div>
  <div class="bloque-firma"><div class="linea">El Cliente</div></div>
</div>
</body></html>`,
  },
  {
    id: "factura",
    label: "Factura de Honorarios",
    desc: "Factura de honorarios profesionales",
    icon: Receipt,
    color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Factura — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222}
.cabecera{display:flex;justify-content:space-between;margin-bottom:30px}
.titulo{font-size:28px;font-weight:bold;color:#c0392b}
table{width:100%;border-collapse:collapse;margin:20px 0}
th{background:#f5f5f5;padding:10px;text-align:left;border:1px solid #ddd;font-size:12px}
td{padding:10px;border:1px solid #ddd;font-size:13px}
.total{font-size:16px;font-weight:bold;text-align:right;margin-top:10px}
.pie{margin-top:40px;font-size:11px;color:#888;text-align:center}</style></head><body>
<div class="cabecera">
  <div><div class="titulo">FACTURA</div><p>Nº: _____ / ${new Date().getFullYear()}<br>Fecha: ${new Date().toLocaleDateString("es-ES")}</p></div>
  <div style="text-align:right"><strong>Despacho de Abogados</strong><br>___________________________<br>CIF: ___________<br>Tel: ___________</div>
</div>
<p><strong>Facturado a:</strong><br>${c.first_name} ${c.last_name || ""}<br>NIF: ${c.nif_cif || "—"}<br>${c.address_street || ""}, ${c.address_town || ""}</p>
<table>
  <thead><tr><th>Descripción</th><th style="width:100px;text-align:right">Importe</th></tr></thead>
  <tbody>
    <tr><td>Honorarios profesionales por _________________________</td><td style="text-align:right">__________ €</td></tr>
    <tr><td>Suplidos y gastos</td><td style="text-align:right">__________ €</td></tr>
    <tr><td style="text-align:right"><strong>Base imponible</strong></td><td style="text-align:right">__________ €</td></tr>
    <tr><td style="text-align:right">IVA (21%)</td><td style="text-align:right">__________ €</td></tr>
    <tr><td style="text-align:right"><strong>TOTAL</strong></td><td style="text-align:right"><strong>__________ €</strong></td></tr>
  </tbody>
</table>
<p><strong>Forma de pago:</strong> _________________________ | <strong>IBAN:</strong> ES__ ____ ____ ____ ____ ____</p>
<div class="pie">Documento emitido el ${new Date().toLocaleDateString("es-ES")} · Conservar a efectos fiscales</div>
</body></html>`,
  },
  {
    id: "poder",
    label: "Poder de Representación",
    desc: "Apoderamiento para actuaciones judiciales",
    icon: Scale,
    color: "bg-amber-50 text-amber-600 border-amber-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Poder de Representación — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.7}
h1{font-size:16px;text-align:center;text-transform:uppercase}
.firma{margin-top:80px;display:flex;justify-content:center}
.bloque-firma{text-align:center;width:50%}.linea{border-top:1px solid #333;margin-top:60px;padding-top:6px}</style></head><body>
<h1>PODER DE REPRESENTACIÓN APUD ACTA</h1>
<p>Don/Doña <strong>${c.first_name} ${c.last_name || ""}</strong>, mayor de edad, con NIF <strong>${c.nif_cif || "—"}</strong>, domiciliado/a en <strong>${c.address_street || "—"}, ${c.address_town || ""}</strong>,</p>
<p><strong>OTORGA PODER</strong> a favor del/la Letrado/a _______________________, colegiado/a nº _______, para que en su nombre y representación:</p>
<p>— Intervenga en el procedimiento relativo a _______________________________________________</p>
<p>— Realice cuantos actos y gestiones sean necesarios para la defensa de sus intereses.</p>
<p>— Pueda interponer recursos, firmar escritos y comparecer ante cualquier órgano judicial o administrativo.</p>
<p>El presente apoderamiento se entiende conferido con carácter general para el asunto indicado.</p>
<p>En _______________, a ${new Date().toLocaleDateString("es-ES")}.</p>
<div class="firma"><div class="bloque-firma"><div class="linea">Firma del poderdante<br><small>${c.first_name} ${c.last_name || ""}</small></div></div></div>
</body></html>`,
  },
  {
    id: "carta",
    label: "Carta al Cliente",
    desc: "Comunicación formal al cliente",
    icon: MessageSquare,
    color: "bg-slate-50 text-slate-600 border-slate-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Carta — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.7}
.membrete{text-align:right;margin-bottom:30px;font-size:12px}
.destinatario{margin:20px 0}.asunto{font-weight:bold;margin:20px 0}
.firma{margin-top:60px}</style></head><body>
<div class="membrete">
  <strong>Despacho de Abogados</strong><br>
  ___________________________<br>
  Tel: ___________ | Email: ___________<br>
  Fecha: ${new Date().toLocaleDateString("es-ES")}
</div>
<div class="destinatario">
  <strong>${c.first_name} ${c.last_name || ""}</strong><br>
  ${c.address_street || "—"}<br>
  ${c.address_cp || ""} ${c.address_town || ""}<br>
  ${c.email || ""}
</div>
<div class="asunto">ASUNTO: _______________________________________________</div>
<p>Estimado/a cliente:</p>
<p>_______________________________________________________________________________________________________________</p>
<p>_______________________________________________________________________________________________________________</p>
<p>_______________________________________________________________________________________________________________</p>
<p>Quedamos a su disposición para cualquier consulta.</p>
<div class="firma">
  <p>Atentamente,</p>
  <p>___________________________<br>Letrado/a</p>
</div>
</body></html>`,
  },
  {
    id: "nda",
    label: "Acuerdo de Confidencialidad",
    desc: "NDA entre despacho y cliente",
    icon: ShieldAlert,
    color: "bg-purple-50 text-purple-600 border-purple-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>NDA — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.7}
h1{font-size:16px;text-align:center;text-transform:uppercase}
h2{font-size:13px;margin-top:16px;text-transform:uppercase}
.firma{margin-top:60px;display:flex;justify-content:space-between}
.bloque-firma{text-align:center;width:45%}.linea{border-top:1px solid #333;margin-top:40px;padding-top:6px}</style></head><body>
<h1>ACUERDO DE CONFIDENCIALIDAD</h1>
<p>En _______________, a ${new Date().toLocaleDateString("es-ES")}.</p>
<h2>PARTES</h2>
<p><strong>El Despacho:</strong> _______________________, con CIF ___________, con domicilio en ___________________________.</p>
<p><strong>El Cliente:</strong> ${c.first_name} ${c.last_name || ""}, con NIF ${c.nif_cif || "—"}, con domicilio en ${c.address_street || "—"}, ${c.address_town || ""}.</p>
<h2>OBJETO</h2>
<p>Ambas partes acuerdan mantener la más estricta confidencialidad sobre toda la información intercambiada en el marco de la relación profesional, incluyendo datos personales, documentación aportada y estrategia jurídica.</p>
<h2>DURACIÓN</h2>
<p>El presente acuerdo tendrá vigencia durante toda la relación profesional y subsistirá durante un período de 5 años tras su finalización.</p>
<div class="firma">
  <div class="bloque-firma"><div class="linea">El Despacho</div></div>
  <div class="bloque-firma"><div class="linea">El Cliente</div></div>
</div>
</body></html>`,
  },
  {
    id: "lopd",
    label: "Consentimiento RGPD",
    desc: "Cláusula de protección de datos",
    icon: UserCheck,
    color: "bg-teal-50 text-teal-600 border-teal-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>RGPD — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.7}
h1{font-size:16px;text-align:center}h2{font-size:12px;text-transform:uppercase;margin-top:14px}
.firma{margin-top:50px;display:flex;justify-content:center}
.bloque-firma{text-align:center;width:50%}.linea{border-top:1px solid #333;margin-top:40px;padding-top:6px}
small{font-size:10px;color:#888}</style></head><body>
<h1>CLÁUSULA DE PROTECCIÓN DE DATOS PERSONALES (RGPD)</h1>
<p>En cumplimiento del Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD), le informamos:</p>
<h2>Responsable del Tratamiento</h2>
<p>Despacho de Abogados ___________________________, CIF: ___________, Domicilio: ___________________________.</p>
<h2>Finalidad</h2>
<p>La gestión de la relación profesional, defensa de sus intereses ante organismos judiciales y administrativos, así como el cumplimiento de obligaciones legales.</p>
<h2>Legitimación</h2>
<p>Ejecución de contrato de prestación de servicios jurídicos y cumplimiento de obligaciones legales.</p>
<h2>Destinatarios</h2>
<p>Sus datos no serán cedidos a terceros salvo obligación legal o requerimiento judicial.</p>
<h2>Derechos</h2>
<p>Puede ejercer sus derechos de acceso, rectificación, supresión, limitación, portabilidad y oposición dirigiéndose al correo: ___________</p>
<p><strong>DECLARO</strong> haber sido informado/a de los anteriores extremos y <strong>CONSIENTO</strong> el tratamiento de mis datos personales para las finalidades indicadas.</p>
<p>Nombre: <strong>${c.first_name} ${c.last_name || ""}</strong> · NIF: <strong>${c.nif_cif || "—"}</strong></p>
<div class="firma"><div class="bloque-firma"><div class="linea">Firma<br><small>${new Date().toLocaleDateString("es-ES")}</small></div></div></div>
</body></html>`,
  },
  {
    id: "reclamacion",
    label: "Carta de Reclamación",
    desc: "Requerimiento previo a demanda",
    icon: FilePlus,
    color: "bg-orange-50 text-orange-600 border-orange-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Carta de Reclamación</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.7}
.ref{font-size:11px;color:#888;margin-bottom:20px}h1{font-size:15px;text-align:center;text-transform:uppercase}
.firma{margin-top:60px}</style></head><body>
<h1>REQUERIMIENTO PREVIO — CARTA DE RECLAMACIÓN</h1>
<p class="ref">Fecha: ${new Date().toLocaleDateString("es-ES")} | Ref: ___________</p>
<p><strong>Dirigido a:</strong> ___________________________<br>Domicilio: ___________________________</p>
<p>En nombre y representación de D./Dña. <strong>${c.first_name} ${c.last_name || ""}</strong>, con NIF <strong>${c.nif_cif || "—"}</strong>, me dirijo a Ud. con el fin de:</p>
<p><strong>PRIMERO.</strong> Exponer que _______________________________________________________________________________________________________________</p>
<p><strong>SEGUNDO.</strong> Requerir formalmente a Ud. para que en el plazo de ___ días hábiles desde la recepción de la presente: _______________________________________________</p>
<p><strong>TERCERO.</strong> Advertir que, de no atenderse el presente requerimiento en el plazo indicado, mi representado/a se verá obligado/a a ejercitar las acciones judiciales que en Derecho correspondan.</p>
<div class="firma">
  <p>Letrado/a<br>___________________________</p>
</div>
</body></html>`,
  },
];

// ── Helpers de archivos ────────────────────────────────────────
function fileIcon(mime: string, name: string) {
  const n = name.toLowerCase();
  // Imágenes
  if (mime.startsWith("image/"))
    return { icon: "🖼️", color: "bg-emerald-100 text-emerald-600", label: "Imagen" };
  // PDF
  if (mime === "application/pdf")
    return { icon: "📄", color: "bg-red-100 text-red-600", label: "PDF" };
  // Word
  if (mime.includes("word") || n.endsWith(".doc") || n.endsWith(".docx"))
    return { icon: "📝", color: "bg-blue-100 text-blue-600", label: "Word" };
  // Excel
  if (mime.includes("excel") || mime.includes("spreadsheet") || n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv"))
    return { icon: "📊", color: "bg-green-100 text-green-600", label: "Excel" };
  // PowerPoint
  if (mime.includes("presentation") || mime.includes("powerpoint") || n.endsWith(".pptx") || n.endsWith(".ppt"))
    return { icon: "📑", color: "bg-orange-100 text-orange-600", label: "PPT" };
  // Audio
  if (mime.startsWith("audio/"))
    return { icon: "🎵", color: "bg-purple-100 text-purple-600", label: "Audio" };
  // Video
  if (mime.startsWith("video/"))
    return { icon: "🎬", color: "bg-pink-100 text-pink-600", label: "Video" };
  // ZIP / comprimidos
  if (mime.includes("zip") || mime.includes("rar") || mime.includes("compress") || n.endsWith(".zip") || n.endsWith(".rar") || n.endsWith(".7z"))
    return { icon: "🗜️", color: "bg-amber-100 text-amber-600", label: "ZIP" };
  // Email
  if (n.endsWith(".eml") || n.endsWith(".msg"))
    return { icon: "✉️", color: "bg-cyan-100 text-cyan-600", label: "Email" };
  // Texto plano
  if (mime.startsWith("text/"))
    return { icon: "📃", color: "bg-slate-100 text-slate-600", label: "Texto" };
  // XML / JSON
  if (mime.includes("xml") || mime.includes("json"))
    return { icon: "📋", color: "bg-indigo-100 text-indigo-600", label: "Datos" };
  return { icon: "📎", color: "bg-slate-100 text-slate-500", label: "Archivo" };
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewable(mime: string) {
  return mime === "application/pdf" || mime.startsWith("image/") || mime.startsWith("text/");
}

function isWordFile(mime: string, name: string) {
  const n = name.toLowerCase();
  return mime.includes("word") || mime.includes("officedocument.wordprocessingml") || mime.includes("opendocument.text") ||
    ['.doc','.docx','.odt','.rtf','.dot','.dotx'].some(e => n.endsWith(e));
}

function isExcelFile(mime: string, name: string) {
  const n = name.toLowerCase();
  return (
    mime.includes("excel") ||
    mime.includes("spreadsheetml") ||
    mime.includes("spreadsheet") ||
    n.endsWith(".xlsx") ||
    n.endsWith(".xls") ||
    n.endsWith(".xlsm") ||
    n.endsWith(".xlsb") ||
    n.endsWith(".csv")
  );
}

// ── Tab: Adjuntos ─────────────────────────────────────────────
function TabAdjuntos({ clientId, client }: { clientId: string; client: any }) {
  const { getToken } = useAuth();

  const [files, setFiles]           = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [preview, setPreview]       = useState<{ url: string; name: string; mime: string; fileId?: string; appType?: 'word' | 'excel' } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [genLoading, setGenLoading] = useState<string | null>(null);
  // DocPlant templates
  const [docPlantFolders, setDocPlantFolders] = useState<{ name: string; files: { name: string; path: string; ext: string }[] }[]>([]);
  const [docPlantLoading, setDocPlantLoading] = useState(false);
  const [docPlantError, setDocPlantError]     = useState<string | null>(null);
  const [templateTab, setTemplateTab] = useState<'docplant' | 'generated'>('docplant');
  const [templateSearch, setTemplateSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  // Preview panel de plantillas
  const [selectedTpl, setSelectedTpl] = useState<{ path: string; name: string; ext: string } | null>(null);
  const [tplPreviewHtml, setTplPreviewHtml] = useState<string | null>(null);
  const [tplPreviewUrl, setTplPreviewUrl] = useState<string | null>(null);
  const [tplPreviewMime, setTplPreviewMime] = useState<string | null>(null);
  const [tplPreviewLoading, setTplPreviewLoading] = useState(false);
  // Thumbnails de imágenes (blobURL por fileId)
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const loadingThumbIds = useRef<Set<string>>(new Set());
  const previewBlobUrl  = useRef<string | null>(null);
  const tplPreviewBlobUrl = useRef<string | null>(null);
  const tplPreviewAbort  = useRef<AbortController | null>(null);
  const openUrlCache     = useRef<Map<string, string>>(new Map());
  // Cache de vistas previas: evita re-fetch del mismo archivo
  const previewCache = useRef<Map<string, { url: string; name: string; mime: string; appType?: 'word' | 'excel' }>>(new Map());
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // Modal para editar nombre y tipo de adjunto
  const [editingFile, setEditingFile] = useState<{ id: string; document_name: string; attachment_type: string } | null>(null);
  const [editDocName, setEditDocName] = useState('');
  const [editAttachmentType, setEditAttachmentType] = useState('Sin clasificar');
  const [savingMetadata, setSavingMetadata] = useState(false);
  // Plantilla pendiente de guardar
  const [pendingTemplate, setPendingTemplate] = useState<{ filePath: string; fileName: string } | null>(null);
  // Cola de archivos pendientes de adjuntar (mostrar modal uno a uno)
  const [uploadQueue, setUploadQueue]       = useState<File[]>([]);
  const [uploadQueueTotal, setUploadQueueTotal] = useState(0);
  const pendingUploadFile = useRef<File | null>(null);
  // Vista previa de Word
  const [wordPreview, setWordPreview] = useState<{ id: string; name: string; mime: string } | null>(null);

  const revokePreviewEntry = useCallback((fileId: string) => {
    const cached = previewCache.current.get(fileId);
    if (cached?.url?.startsWith('blob:')) {
      try { URL.revokeObjectURL(cached.url); } catch (_) {}
    }
    previewCache.current.delete(fileId);
    if (previewBlobUrl.current === cached?.url) {
      previewBlobUrl.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const entry of previewCache.current.values()) {
        if (entry.url?.startsWith('blob:')) {
          try { URL.revokeObjectURL(entry.url); } catch (_) {}
        }
      }
      previewCache.current.clear();
      if (previewBlobUrl.current) {
        try { URL.revokeObjectURL(previewBlobUrl.current); } catch (_) {}
        previewBlobUrl.current = null;
      }
    };
  }, []);

  // ── Cargar thumbnails de imágenes ─────────────────────────────
  const loadThumb = useCallback(async (fileId: string) => {
    if (loadingThumbIds.current.has(fileId)) return;
    loadingThumbIds.current.add(fileId);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${clientId}/${fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setThumbs(prev => ({ ...prev, [fileId]: url }));
    } catch (_e) {
      loadingThumbIds.current.delete(fileId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // ── Descargar archivo con autenticación ──────────────────────
  const downloadWithAuth = useCallback(async (fileId: string, fileName: string) => {
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${clientId}/${fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Error al descargar: ${err.error || res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (_e) {
      alert('Error al descargar el archivo');
    }
  }, [clientId, getToken]);

  // ── Cargar archivos ──────────────────────────────────────────
  // silent=true: refresco en segundo plano — no muestra spinner
  const loadFiles = useCallback(async (silent = false) => {
    if (!silent) setLoadingFiles(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${clientId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok) {
        const fileList: any[] = data.data || [];
        setFiles(fileList);
        for (const f of fileList) {
          if (f.mimetype?.startsWith('image/')) loadThumb(f.id);
          if (f.open_token) {
            const resolved = resolveApiUrl(`/api/files/dl/${f.open_token}`);
            const abs = /^https?:\/\//i.test(resolved) ? resolved : `${window.location.origin}${resolved}`;
            openUrlCache.current.set(f.id, abs);
          }
        }
      }
    } catch (_e) {}
    finally { if (!silent) setLoadingFiles(false); }
  }, [clientId, loadThumb]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // Auto-refrescar adjuntos cada 45s y al volver a la pestaña — silencioso (sin spinner)
  useAutoRefresh(() => loadFiles(true), { intervalMs: 45_000, enabled: !!clientId });

  // ── Abrir modal para el primer archivo de la cola ────────────
  const openNextUploadModal = useCallback((file: File, queue: File[], total: number) => {
    pendingUploadFile.current = file;
    setUploadQueue(queue);
    setUploadQueueTotal(total);
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    setEditDocName(baseName);
    setEditAttachmentType('Sin clasificar');
    setEditingFile({ id: 'PENDING_UPLOAD', document_name: baseName, attachment_type: 'Sin clasificar' });
  }, []);

  // ── Interceptar selección: mostrar modal en lugar de subir directo ──
  const enqueueFiles = useCallback((fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    const [first, ...rest] = arr;
    openNextUploadModal(first, rest, arr.length);
  }, [openNextUploadModal]);

  // ── Subir UN archivo con nombre y tipo ya confirmados ────────
  const uploadSingleFile = async () => {
    const file = pendingUploadFile.current;
    if (!file) return;
    setSavingMetadata(true);
    try {
      const token = await getToken({ skipCache: true });
      const fd = new FormData();
      fd.append('files', file);
      const res = await fetch(`/api/files/${clientId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        const fileId = data.data?.[0]?.id;
        if (fileId) {
          // Aplicar nombre y tipo seleccionados
          await fetch(`/api/files/${clientId}/${fileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              document_name: editDocName.trim() || null,
              attachment_type: editAttachmentType,
            }),
          });
        }
        await loadFiles();
        window.dispatchEvent(new CustomEvent('historial-changed'));
      }
    } catch (_e) {}
    finally {
      setSavingMetadata(false);
      setEditingFile(null);
      pendingUploadFile.current = null;
      // Procesar siguiente archivo de la cola
      if (uploadQueue.length > 0) {
        const [next, ...rest] = uploadQueue;
        openNextUploadModal(next, rest, uploadQueueTotal);
      } else {
        setUploadQueueTotal(0);
      }
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const items = e.dataTransfer.items;
    const fileArr: File[] = [];
    for (const item of Array.from(items)) {
      const f = item.getAsFile();
      if (f) fileArr.push(f);
    }
    enqueueFiles(fileArr);
  }, [enqueueFiles]);

  // ── Borrar archivo ───────────────────────────────────────────
  const handleDelete = async (fileId: string) => {
    const token = await getToken({ skipCache: true });
    await fetch(`/api/files/${clientId}/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setFiles(prev => prev.filter(f => f.id !== fileId));
    revokePreviewEntry(fileId);
    if (preview?.fileId === fileId) setPreview(null);
    window.dispatchEvent(new CustomEvent('historial-changed'));
  };

  const openWithApp = useCallback(async (f: any) => {
    const ext = (f.original_name || '').split('.').pop()?.toLowerCase() ?? '';
    const wordExts  = ['doc','docx','odt','rtf','dot','dotx'];
    const excelExts = ['xls','xlsx','xlsm','xlsb','ods','csv'];
    const pptExts   = ['ppt','pptx','odp'];
    const isOffice  = wordExts.includes(ext) || excelExts.includes(ext) || pptExts.includes(ext);

    if (isOffice) {
      // Synchronous path: use pre-fetched URL (preserves user gesture for Chrome protocol handler).
      // Chrome silently drops ms-word:/ms-excel: navigation after any await, so this MUST be sync.
      const tempUrl = openUrlCache.current.get(f.id);
      openUrlCache.current.delete(f.id);
      // Silently refresh file list to get fresh open_token for next click
      void loadFiles(true);

      if (tempUrl) {
        const scheme = wordExts.includes(ext) ? 'ms-word'
          : excelExts.includes(ext) ? 'ms-excel'
          : 'ms-powerpoint';
        const uri = `${scheme}:ofe|u|${tempUrl}`;
        const b64 = btoa(uri).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        window.location.href = `vantia:${b64}`;
        return;
      }
      // Fallback: download so the user can open manually while backend token is unavailable
      downloadWithAuth(f.id, f.original_name);
      return;
    }

    try {
      const authToken = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${clientId}/${f.id}/download`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc: 'application/msword',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xls: 'application/vnd.ms-excel',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ppt: 'application/vnd.ms-powerpoint',
        odt: 'application/vnd.oasis.opendocument.text',
        ods: 'application/vnd.oasis.opendocument.spreadsheet',
      };
      const mime = mimeMap[ext] || blob.type || 'application/octet-stream';
      const blobUrl = URL.createObjectURL(new Blob([blob], { type: mime }));
      const a = document.createElement('a');
      a.href = blobUrl;
      if (mime !== 'application/pdf' && !mime.startsWith('image/') && !mime.startsWith('text/')) {
        a.download = f.original_name || 'archivo';
      }
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
    } catch (_e) {}
  }, [clientId, getToken, loadFiles, downloadWithAuth]);

  const openInWord = openWithApp;

  // ── Vista previa ─────────────────────────────────────────────
  const openPreview = async (f: any) => {
    // Servir desde caché si ya fue cargado antes
    const cached = previewCache.current.get(f.id);
    if (cached) {
      setPreview(cached);
      return;
    }

    const token = await getToken({ skipCache: true });

    // Para cualquier tipo no PDF/imagen: intentar conversión a PDF via LibreOffice
    const isPdf = f.mimetype === 'application/pdf';
    const isImage = f.mimetype?.startsWith('image/');
    if (!isPdf && !isImage) {
      const pdfRes = await fetch(`/api/files/${clientId}/${f.id}/preview-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const contentType = pdfRes.headers.get('content-type') || '';
      if (pdfRes.ok && contentType.includes('application/pdf')) {
        const blob = await pdfRes.blob();
        const url = URL.createObjectURL(blob);
        previewBlobUrl.current = url;
        const entry = { url, name: f.original_name, mime: 'application/pdf', fileId: f.id };
        previewCache.current.set(f.id, entry);
        setPreview(entry);
        return;
      }
      setPreview({ url: '', name: f.original_name, mime: 'unsupported', fileId: f.id });
      return;
    }

    const endpoint = `/api/files/${clientId}/${f.id}/download`;

    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      setPreview({ url: '', name: f.original_name, mime: 'error', fileId: f.id });
      return;
    }

    if (isExcelFile(f.mimetype || '', f.original_name || '')) {
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      previewBlobUrl.current = url;
      const entry = { url, name: f.original_name, mime: 'text/html', fileId: f.id, appType: 'excel' as const };
      previewCache.current.set(f.id, entry);
      setPreview(entry);
    } else {
      const mime = f.mimetype || 'application/octet-stream';
      const previewable = mime === 'application/pdf' || mime.startsWith('image/') || mime.startsWith('text/');
      if (!previewable) {
        setPreview({ url: '', name: f.original_name, mime: 'unsupported', fileId: f.id });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      previewBlobUrl.current = url;
      const entry = { url, name: f.original_name, mime, fileId: f.id };
      previewCache.current.set(f.id, entry);
      setPreview(entry);
    }
  };

  // ── Mostrar modal para crear documento en blanco ──────────────
  const showCreateBlankModal = () => {
    setEditingFile({ id: 'NEW_BLANK', document_name: '', attachment_type: 'Sin clasificar' });
    setEditDocName('');
    setEditAttachmentType('Sin clasificar');
  };

  // ── Documento en blanco (después de ingresar nombre y tipo) ────
  const createBlankDoc = async () => {
    if (!editingFile || editingFile.id !== 'NEW_BLANK') return;
    setSavingMetadata(true);
    const token = await getToken({ skipCache: true });
    try {
      // POST a nueva ruta que guarda directamente en BD con metadatos
      const res = await fetch(`/api/files/${clientId}/create-blank`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          document_name: editDocName,
          attachment_type: editAttachmentType,
        }),
      });
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const data = await res.json();
      if (data.success && data.data) {
        setEditingFile(null);
        await loadFiles();
      }
    } catch (_e) {
      // Error al crear documento
    } finally {
      setSavingMetadata(false);
    }
  };

  // ── Cargar preview de una plantilla en el panel derecho ───────
  const loadTplPreview = async (file: { path: string; name: string; ext: string }) => {
    if (tplPreviewAbort.current) tplPreviewAbort.current.abort();
    const abort = new AbortController();
    tplPreviewAbort.current = abort;

    setSelectedTpl(file);
    setTplPreviewHtml(null);
    if (tplPreviewBlobUrl.current) {
      URL.revokeObjectURL(tplPreviewBlobUrl.current);
      tplPreviewBlobUrl.current = null;
    }
    setTplPreviewUrl(null);
    setTplPreviewMime(null);
    setTplPreviewLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      if (abort.signal.aborted) return;
      const isWordTemplate = file.ext === '.doc' || file.ext === '.docx';

      if (isWordTemplate) {
        const pdfRes = await fetch(`/api/files/templates/preview-pdf?path=${encodeURIComponent(file.path)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abort.signal,
        });
        const contentType = pdfRes.headers.get('content-type') || '';
        if (pdfRes.ok && contentType.includes('application/pdf')) {
          const blob = await pdfRes.blob();
          if (abort.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          tplPreviewBlobUrl.current = url;
          setTplPreviewUrl(url);
          setTplPreviewMime('application/pdf');
          return;
        }
      }

      const res = await fetch(`/api/files/templates/preview?path=${encodeURIComponent(file.path)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abort.signal,
      });
      const html = await res.text();
      if (abort.signal.aborted) return;
      setTplPreviewHtml(html);
      setTplPreviewMime('text/html');
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setTplPreviewHtml(`<html><body style="padding:20px;font-family:sans-serif;color:#dc2626"><p>Error al cargar vista previa</p><p style="font-size:11px;color:#999">${e.message}</p></body></html>`);
      setTplPreviewMime('text/html');
    } finally {
      if (!abort.signal.aborted) setTplPreviewLoading(false);
    }
  };

  // ── Abrir modal plantillas y cargar DocPlant ──────────────────
  const openTemplatesModal = async (forceReload = false) => {
    setShowTemplates(true);
    setTemplateTab('docplant');
    setTemplateSearch('');
    setSelectedTpl(null);
    setTplPreviewHtml(null);
    if (tplPreviewBlobUrl.current) {
      URL.revokeObjectURL(tplPreviewBlobUrl.current);
      tplPreviewBlobUrl.current = null;
    }
    setTplPreviewUrl(null);
    setTplPreviewMime(null);
    if (docPlantFolders.length > 0 && !forceReload) return; // ya cargado
    setDocPlantLoading(true);
    setDocPlantError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch('/api/files/templates', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (data.success) {
        setDocPlantFolders(data.data || []);
        if (data.data && data.data.length > 0) {
          setExpandedFolders(new Set([data.data[0].name]));
        } else {
          setDocPlantError(data.warning || 'No se encontraron plantillas en la carpeta DocPlant.');
        }
      } else {
        setDocPlantError(data.error || 'Error al cargar plantillas.');
      }
    } catch (e: any) {
      setDocPlantError(e.message || 'Error de conexión al cargar plantillas.');
    } finally {
      setDocPlantLoading(false);
    }
  };

  // ── Mostrar modal para adjuntar plantilla ──────────────────────
  const showTemplateModal = (filePath: string, fileName: string) => {
    setPendingTemplate({ filePath, fileName });
    // Extraer nombre sin extensión para usar como nombre de documento
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    setEditingFile({ id: 'PENDING_TEMPLATE', document_name: '', attachment_type: 'Sin clasificar' });
    setEditDocName(baseName);
    setEditAttachmentType('Sin clasificar');
  };

  // ── Adjuntar plantilla de DocPlant (después de ingresar nombre y tipo) ────
  const downloadDocPlantTemplate = async () => {
    if (!pendingTemplate) return;
    setSavingMetadata(true);
    const token = await getToken({ skipCache: true });
    try {
      const res = await fetch(`/api/files/templates/download?path=${encodeURIComponent(pendingTemplate.filePath)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      // Usar documento_name si se proporcionó, si no usar fileName
      const finalFileName = editDocName.trim() ? `${editDocName}.${pendingTemplate.fileName.split('.').pop()}` : pendingTemplate.fileName;
      const file = new File([blob], finalFileName, { type: blob.type });
      const fd = new FormData();
      fd.append('files', file);
      const uploadRes = await fetch(`/api/files/${clientId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (uploadRes.ok) {
        const data = await uploadRes.json();
        const fileId = data.data?.[0]?.id;
        if (fileId) {
          // Actualizar metadatos si se proporcionó nombre diferente
          if (editDocName.trim() || editAttachmentType !== 'Sin clasificar') {
            await fetch(`/api/files/${clientId}/${fileId}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                document_name: editDocName.trim() || null,
                attachment_type: editAttachmentType,
              }),
            });
          }
          await loadFiles();
        }
        setShowTemplates(false);
        setEditingFile(null);
        setPendingTemplate(null);
      }
    } catch (_e) {
      // Error al descargar plantilla
    } finally {
      setSavingMetadata(false);
    }
  };

  // ── Guardar metadatos del archivo (nombre y tipo) ──────────────
  const saveFileMetadata = async () => {
    if (!editingFile) return;
    setSavingMetadata(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${clientId}/${editingFile.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          document_name: editDocName,
          attachment_type: editAttachmentType,
        }),
      });
      if (res.ok) {
        previewCache.current.delete(editingFile.id); // invalidar caché (nombre puede haber cambiado)
        await loadFiles(); // Recargar lista
        setEditingFile(null);
      }
    } catch (_e) {}
    finally { setSavingMetadata(false); }
  };

  // ── Generar documento desde plantilla — guardar como adjunto ──
  const generateDoc = async (plantilla: typeof PLANTILLAS[0]) => {
    setGenLoading(plantilla.id);
    try {
      const html = plantilla.generate(client);
      const fileName = `${plantilla.id}_${client.first_name}_${client.last_name || ""}_${new Date().toISOString().split("T")[0]}.html`;
      const file = new File([new Blob([html], { type: "text/html;charset=utf-8" })], fileName, { type: "text/html" });
      const fd = new FormData();
      fd.append("files", file);
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${clientId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) await loadFiles();
      setShowTemplates(false);
    } catch (_e) {
    } finally {
      setGenLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra de acciones */}
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <p className="text-sm text-slate-500">
          {loadingFiles ? "Cargando…" : `${files.length} ${files.length === 1 ? "archivo" : "archivos"}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {/* Importar carpeta */}
          <button
            onClick={() => folderInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all"
          >
            <FolderOpen size={13} /> Importar carpeta
          </button>
          {/* Subir archivos */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all"
          >
            <Upload size={13} /> Subir archivo
          </button>
          {/* Nuevo documento en blanco */}
          <button
            onClick={showCreateBlankModal}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all"
          >
            <FilePlus2 size={13} /> Nuevo
          </button>
          {/* Crear desde plantilla */}
          <button
            onClick={() => openTemplatesModal()}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm active:scale-95 transition-all"
          >
            <Sparkles size={13} /> Usar plantilla
          </button>
        </div>
      </div>

      {/* Inputs ocultos */}
      <input
        ref={fileInputRef} type="file" multiple className="hidden"
        onChange={e => { if (e.target.files) { enqueueFiles(e.target.files); e.target.value = ''; } }}
      />
      <input
        ref={folderInputRef} type="file" multiple className="hidden"
        {...({ webkitdirectory: "true", directory: "true" } as any)}
        onChange={e => { if (e.target.files) { enqueueFiles(e.target.files); e.target.value = ''; } }}
      />

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer transition-all
          ${isDragOver ? "border-red-400 bg-red-50/50 scale-[1.01]" : "border-slate-200 hover:border-red-300 hover:bg-red-50/20"}`}
      >
        {uploading
          ? <><Loader2 size={26} className="text-red-500 animate-spin" /><p className="text-sm font-medium text-red-600">Subiendo archivos…</p></>
          : <><Upload size={26} className={isDragOver ? "text-red-500" : "text-slate-400"} />
              <p className={`text-sm font-medium ${isDragOver ? "text-red-600" : "text-slate-500"}`}>Arrastra archivos o carpetas aquí</p>
              <p className="text-xs text-slate-400">PDF, Word, Excel, imágenes — máx. 50 MB por archivo</p></>
        }
      </div>

      {/* Layout: lista + preview */}
      <div className="flex gap-3 items-start">
        {/* Lista de archivos */}
        <div className={`${preview ? "w-[42%] shrink-0" : "w-full"} transition-all duration-300`}>
          {loadingFiles ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 flex justify-center">
              <Loader2 size={24} className="animate-spin text-red-500" />
            </div>
          ) : files.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center gap-2 text-slate-400">
              <FileText size={36} className="opacity-20" />
              <p className="text-sm font-medium">No hay documentos adjuntos</p>
              <p className="text-xs text-slate-300">Sube archivos o crea documentos con las plantillas</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Archivo</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden lg:table-cell">Documento</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Tipo</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Tamaño</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Fecha</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden xl:table-cell">Modificado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {files.map((f: any) => {
                    const fi = fileIcon(f.mimetype, f.original_name);
                    const canPreview = isPreviewable(f.mimetype);
                    const canWord    = isWordFile(f.mimetype, f.original_name);
                    const canExcel   = isExcelFile(f.mimetype, f.original_name);
                    const handleNameClick = canWord || canExcel
                      ? () => openWithApp(f)
                      : canPreview
                        ? () => openPreview(f)
                        : undefined;
                    return (
                      <tr key={f.id} className="hover:bg-slate-50/60 transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {/* Thumbnail para imágenes, icono con color para el resto */}
                            {f.mimetype?.startsWith('image/') && thumbs[f.id]
                              ? (
                                <img
                                  src={thumbs[f.id]}
                                  alt=""
                                  className="h-10 w-10 rounded-lg object-cover shrink-0 border border-slate-100 shadow-sm cursor-pointer hover:scale-105 transition-transform"
                                  onClick={handleNameClick}
                                />
                              ) : (
                                <span
                                  className={`h-10 w-10 rounded-lg flex items-center justify-center text-lg shrink-0 ${fi.color} ${f.mimetype?.startsWith('image/') ? 'animate-pulse' : ''} cursor-pointer hover:scale-105 transition-transform`}
                                  onClick={() => { if (f.mimetype?.startsWith('image/')) loadThumb(f.id); else if (canPreview || canWord || canExcel) handleNameClick?.(); }}
                                >
                                  {fi.icon}
                                </span>
                              )
                            }
                            <div className="min-w-0">
                              <button
                                onClick={handleNameClick}
                                className={`text-sm font-medium text-slate-700 text-left truncate block max-w-[180px] ${(canPreview || canWord || canExcel) ? "hover:text-red-600 hover:underline cursor-pointer" : ""}`}
                                title={canWord ? "Abrir en Word" : canExcel ? "Abrir en Excel" : f.original_name}
                            >
                              {f.original_name}
                            </button>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${fi.color}`}>
                                {fi.label}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 hidden lg:table-cell max-w-[150px] truncate" title={f.document_name || "Sin nombre"}>
                          {f.document_name || <span className="text-slate-400 italic">Sin nombre</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 hidden md:table-cell">
                          <span className={`px-2 py-1 rounded text-[10px] font-medium ${fi.color}`}>
                            {f.attachment_type || 'Sin clasificar'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 hidden md:table-cell">{fmtSize(f.size_bytes)}</td>
                        <td className="px-4 py-3 text-xs text-slate-400 hidden md:table-cell">
                          {new Date(f.created_at).toLocaleDateString("es-ES")}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 hidden xl:table-cell">
                          {f.updated_at && f.updated_at !== f.created_at
                            ? new Date(f.updated_at).toLocaleDateString("es-ES")
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Vista previa — no se toca */}
                            {(canPreview || canWord || canExcel) && (
                              <button onClick={() => openPreview(f)} title="Vista previa"
                                className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors">
                                <Eye size={14} />
                              </button>
                            )}
                            {/* Editar metadatos */}
                            <button
                              title="Editar"
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              onClick={() => {
                                setEditingFile({ id: f.id, document_name: f.document_name || '', attachment_type: f.attachment_type || 'Sin clasificar' });
                                setEditDocName(f.document_name || '');
                                setEditAttachmentType(f.attachment_type || 'Sin clasificar');
                              }}
                            >
                              <Edit3 size={14} />
                            </button>
                            {/* Abrir en app nativa / navegador */}
                            <button
                              title={canWord ? "Abrir en Word" : canExcel ? "Abrir en Excel" : f.mimetype === 'application/pdf' ? "Abrir PDF" : "Abrir"}
                              className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                              onClick={() => openWithApp(f)}
                            >
                              <ExternalLink size={14} />
                            </button>
                            <button onClick={() => handleDelete(f.id)} title="Eliminar"
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Panel de vista previa ── */}
        {preview && (
          <div
            className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col shadow-lg"
            style={{ position: "sticky", top: 16, height: "calc(100vh - 200px)" }}
          >
            {/* Cabecera del panel */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100 shrink-0 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {/* Icono según tipo */}
                <span className="text-base shrink-0">
                  {preview.mime === "application/pdf" ? "📄"
                    : preview.mime.startsWith("image/") ? "🖼️"
                    : preview.appType === 'excel' ? "📊"
                    : "📝"}
                </span>
                <p className="text-xs font-bold text-slate-700 truncate" title={preview.name}>
                  {preview.name}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* Abrir en app nativa */}
                {preview.fileId && (
                  <button
                    onClick={() => openWithApp({ id: preview.fileId!, original_name: preview.name })}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 px-2 py-1 rounded-lg transition-colors border border-neutral-200"
                  >
                    <ExternalLink size={11} /> Abrir
                  </button>
                )}
                {/* Abrir en pestaña nueva */}
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Abrir en nueva pestaña"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
                {/* Cerrar */}
                <button
                  onClick={() => {
                    setPreview(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Cerrar vista previa"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Contenido de la preview */}
            <div className="flex-1 overflow-hidden relative">

              {/* ── PDF: visor nativo completo con zoom y páginas ── */}
              {preview.mime === "application/pdf" && (
                <iframe
                  src={`${preview.url}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
                  className="w-full h-full border-0"
                  title={preview.name}
                  style={{ minHeight: 0 }}
                />
              )}

              {/* ── Imágenes: visor con fondo oscuro y tamaño completo ── */}
              {preview.mime.startsWith("image/") && (
                <div className="w-full h-full flex items-center justify-center bg-slate-800 overflow-auto p-3">
                  <img
                    src={preview.url}
                    alt={preview.name}
                    className="max-w-full max-h-full object-contain rounded shadow-2xl"
                    style={{ maxHeight: "calc(100vh - 260px)" }}
                  />
                </div>
              )}

              {/* ── Word / HTML: iframe con estilos completos ── */}
              {preview.mime === "text/html" && (
                <iframe
                  src={preview.url}
                  className="w-full h-full border-0 bg-white"
                  title={preview.name}
                  sandbox="allow-same-origin allow-scripts"
                  style={{ minHeight: 0 }}
                />
              )}

              {/* ── Texto plano ── */}
              {preview.mime.startsWith("text/") && preview.mime !== "text/html" && (
                <iframe
                  src={preview.url}
                  className="w-full h-full border-0 bg-white"
                  title={preview.name}
                  style={{ minHeight: 0 }}
                />
              )}

              {/* ── Error / Sin preview ── */}
              {(preview.mime === "error" || preview.mime === "unsupported") && (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 p-8">
                  <span className="text-5xl">📎</span>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-600 mb-1">Vista previa no disponible</p>
                    <p className="text-xs text-slate-400">Este formato no se puede mostrar directamente.</p>
                  </div>
                  {preview.fileId && (
                    <button
                      onClick={() => downloadWithAuth(preview.fileId!, preview.name)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <Download size={14} />
                      Descargar archivo
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal plantillas */}
      {showTemplates && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => {
          if (tplPreviewBlobUrl.current) {
            URL.revokeObjectURL(tplPreviewBlobUrl.current);
            tplPreviewBlobUrl.current = null;
          }
          setTplPreviewUrl(null);
          setTplPreviewMime(null);
          setShowTemplates(false);
        }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl mx-4 overflow-hidden flex flex-col" style={{ height: '88vh' }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 shrink-0 bg-slate-50">
              <div className="flex items-center gap-3">
                <Sparkles size={16} className="text-red-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Plantillas del despacho</h2>
                  <p className="text-[11px] text-slate-400">Selecciona una plantilla para previsualizarla</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Tabs inline en el header */}
                <button
                  onClick={() => setTemplateTab('docplant')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${templateTab === 'docplant' ? 'bg-red-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  📁 Plantillas
                </button>
                <button
                  onClick={() => setTemplateTab('generated')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${templateTab === 'generated' ? 'bg-red-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  ✨ Generar
                </button>
                <div className="w-px h-5 bg-slate-200 mx-1" />
                <button onClick={() => {
                  if (tplPreviewBlobUrl.current) {
                    URL.revokeObjectURL(tplPreviewBlobUrl.current);
                    tplPreviewBlobUrl.current = null;
                  }
                  setTplPreviewUrl(null);
                  setTplPreviewMime(null);
                  setShowTemplates(false);
                }} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Tab: DocPlant — split layout */}
            {templateTab === 'docplant' && (
              <div className="flex flex-1 overflow-hidden">

                {/* LEFT: árbol de carpetas/archivos */}
                <div className="w-72 shrink-0 border-r border-slate-100 flex flex-col overflow-hidden bg-white">
                  {/* Search */}
                  <div className="px-3 py-2.5 border-b border-slate-100 shrink-0">
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={templateSearch}
                        onChange={e => setTemplateSearch(e.target.value)}
                        placeholder="Buscar plantilla…"
                        className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* File tree */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {docPlantLoading ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                        <Loader2 size={22} className="animate-spin text-red-500" />
                        <p className="text-xs">Cargando plantillas…</p>
                      </div>
                    ) : docPlantError ? (
                      <div className="p-3">
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                          <p className="text-xs font-bold text-amber-700 mb-1">Error al cargar</p>
                          <p className="text-[11px] text-amber-600">{docPlantError}</p>
                        </div>
                        <button
                          onClick={() => openTemplatesModal(true)}
                          className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all"
                        >
                          <Loader2 size={11} /> Reintentar
                        </button>
                      </div>
                    ) : docPlantFolders.length === 0 ? (
                      <p className="text-center text-xs text-slate-400 py-8">No se encontraron plantillas</p>
                    ) : (() => {
                      const q = templateSearch.toLowerCase().trim();
                      const filteredFolders = docPlantFolders.map(folder => ({
                        ...folder,
                        files: q ? folder.files.filter(f => f.name.toLowerCase().includes(q)) : folder.files,
                      })).filter(f => f.files.length > 0);

                      if (filteredFolders.length === 0) return <p className="text-center text-xs text-slate-400 py-6">Sin resultados</p>;

                      return filteredFolders.map(folder => {
                        const isOpen = q ? true : expandedFolders.has(folder.name);
                        return (
                          <div key={folder.name}>
                            {/* Folder header */}
                            <button
                              onClick={() => {
                                setExpandedFolders(prev => {
                                  const next = new Set(prev);
                                  if (next.has(folder.name)) next.delete(folder.name);
                                  else next.add(folder.name);
                                  return next;
                                });
                              }}
                              className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
                            >
                              <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                                <FolderOpen size={13} className="text-amber-500 shrink-0" />
                                <span className="truncate">{folder.name}</span>
                                <span className="text-[10px] font-normal text-slate-400 shrink-0">({folder.files.length})</span>
                              </span>
                              {isOpen ? <ChevronDown size={12} className="text-slate-400 shrink-0" /> : <ChevronR size={12} className="text-slate-400 shrink-0" />}
                            </button>
                            {/* Files */}
                            {isOpen && (
                              <div className="ml-3 border-l border-slate-100 pl-2 space-y-0.5 mt-0.5 mb-1">
                                {folder.files.map(f => {
                                  const isSelected = selectedTpl?.path === f.path;
                                  return (
                                    <button
                                      key={f.path}
                                      onClick={() => loadTplPreview(f)}
                                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${isSelected ? 'bg-red-50 text-red-700' : 'hover:bg-neutral-50 text-neutral-600'}`}
                                    >
                                      <span className="shrink-0 text-xs">{f.ext === '.docx' ? '📝' : '📄'}</span>
                                      <span className="text-xs truncate flex-1" title={f.name}>{f.name.replace(/\.[^.]+$/, '')}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* RIGHT: preview panel */}
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                  {!selectedTpl ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
                      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="opacity-30"><rect x="8" y="4" width="32" height="40" rx="3" fill="#94a3b8"/><rect x="13" y="14" width="22" height="2" rx="1" fill="white"/><rect x="13" y="20" width="22" height="2" rx="1" fill="white"/><rect x="13" y="26" width="14" height="2" rx="1" fill="white"/></svg>
                      <p className="text-sm">Selecciona una plantilla para previsualizar</p>
                    </div>
                  ) : (
                    <>
                      {/* Preview toolbar */}
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm">{selectedTpl.ext === '.docx' ? '📝' : '📄'}</span>
                          <span className="text-xs font-semibold text-slate-700 truncate">{selectedTpl.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono uppercase shrink-0">{selectedTpl.ext}</span>
                        </div>
                        <button
                          onClick={() => showTemplateModal(selectedTpl.path, selectedTpl.name)}
                          className="shrink-0 ml-3 flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-lg active:scale-95 transition-all"
                        >
                          <Download size={12} /> Seleccionar
                        </button>
                      </div>
                      {/* Preview content */}
                      <div className="flex-1 overflow-hidden relative">
                        {tplPreviewLoading ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
                            <Loader2 size={28} className="animate-spin text-red-500" />
                            <p className="text-sm">Cargando vista previa…</p>
                          </div>
                        ) : tplPreviewMime === 'application/pdf' && tplPreviewUrl ? (
                          <iframe
                            key={tplPreviewUrl}
                            src={`${tplPreviewUrl}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
                            className="w-full h-full border-0"
                            title="Vista previa de plantilla"
                          />
                        ) : tplPreviewHtml ? (
                          <iframe
                            key={selectedTpl?.path}
                            srcDoc={tplPreviewHtml}
                            className="w-full h-full border-0"
                            title="Vista previa de plantilla"
                            sandbox="allow-same-origin"
                          />
                        ) : null}
                      </div>
                    </>
                  )}
                </div>

              </div>
            )}

            {/* Tab: Generated */}
            {templateTab === 'generated' && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-5 grid grid-cols-2 gap-3">
                  {PLANTILLAS.map(p => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => generateDoc(p)}
                        disabled={genLoading === p.id}
                        className={`flex items-start gap-3 p-4 border rounded-xl text-left hover:shadow-md active:scale-[0.98] transition-all ${p.color} hover:opacity-90`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {genLoading === p.id ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold leading-snug">{p.label}</p>
                          <p className="text-[11px] opacity-70 mt-0.5">{p.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400">
                  Documentos pre-rellenados con datos de <strong>{client.first_name} {client.last_name || ""}</strong> · Se generan como HTML apto para Word
                </div>
              </div>
            )}

          </div>
        </div>,
        document.body
      )}

      {/* Modal vista previa de Word */}
      {wordPreview && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setWordPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <FileText size={20} className="text-neutral-700" />
                <div>
                  <p className="text-sm font-bold text-slate-900">Vista previa</p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">{wordPreview.name}</p>
                </div>
              </div>
              <button onClick={() => setWordPreview(null)} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Este es un documento Word. Para editarlo, abrelo en Microsoft Word.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setWordPreview(null);
                    openInWord({ id: wordPreview.id, original_name: wordPreview.name });
                  }}
                  className="flex-1 px-4 py-2.5 bg-red-700 text-white font-medium text-sm rounded-lg hover:bg-red-800 transition-colors flex items-center justify-center gap-2"
                >
                  <Download size={14} />
                  Abrir en Word
                </button>
                <button
                  onClick={() => setWordPreview(null)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-medium text-sm rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal editar metadatos del archivo */}
      {editingFile && createPortal(
        <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEditingFile(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingFile.id === 'NEW_BLANK'
                    ? 'Nuevo documento'
                    : editingFile.id === 'PENDING_TEMPLATE'
                    ? 'Usar plantilla'
                    : editingFile.id === 'PENDING_UPLOAD'
                    ? 'Adjuntar archivo'
                    : 'Editar documento'}
                </h2>
                {editingFile.id === 'PENDING_UPLOAD' && uploadQueueTotal > 1 && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Archivo {uploadQueueTotal - uploadQueue.length} de {uploadQueueTotal}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setEditingFile(null);
                  if (editingFile.id === 'PENDING_UPLOAD') {
                    setUploadQueue([]); setUploadQueueTotal(0); pendingUploadFile.current = null;
                  }
                }}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Contenido */}
            <div className="p-6 space-y-4">
              {/* Nombre del documento */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Nombre del documento</label>
                <input
                  type="text"
                  value={editDocName}
                  onChange={(e) => setEditDocName(e.target.value)}
                  placeholder="Ej: 1. - Consentimiento"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  autoFocus
                />
                {editingFile.id === 'PENDING_UPLOAD' && pendingUploadFile.current && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Archivo: <span className="font-medium text-slate-500">{pendingUploadFile.current.name}</span>
                  </p>
                )}
              </div>

              {/* Tipo de adjunto */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Tipo de adjunto</label>
                <select
                  value={editAttachmentType}
                  onChange={(e) => setEditAttachmentType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                >
                  <option value="Sin clasificar">Sin clasificar</option>
                  <option value="AUTO">AUTO</option>
                  <option value="ESCRITO PROCESAL">ESCRITO PROCESAL</option>
                  <option value="FACTURAS">FACTURAS</option>
                  <option value="PODER">PODER</option>
                  <option value="EVIDENCIA">EVIDENCIA</option>
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => {
                  setEditingFile(null);
                  if (editingFile.id === 'PENDING_UPLOAD') {
                    setUploadQueue([]); setUploadQueueTotal(0); pendingUploadFile.current = null;
                  }
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
              >
                {editingFile.id === 'PENDING_UPLOAD' && uploadQueueTotal > 1 ? 'Cancelar todo' : 'Cancelar'}
              </button>
              <button
                onClick={() => {
                  if (editingFile.id === 'NEW_BLANK') createBlankDoc();
                  else if (editingFile.id === 'PENDING_TEMPLATE') downloadDocPlantTemplate();
                  else if (editingFile.id === 'PENDING_UPLOAD') uploadSingleFile();
                  else saveFileMetadata();
                }}
                disabled={savingMetadata || (editingFile.id !== 'PENDING_UPLOAD' && !editDocName.trim())}
                className="flex-1 px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {savingMetadata
                  ? 'Subiendo...'
                  : editingFile.id === 'NEW_BLANK'
                  ? 'Crear'
                  : editingFile.id === 'PENDING_TEMPLATE'
                  ? 'Usar'
                  : editingFile.id === 'PENDING_UPLOAD'
                  ? (uploadQueue.length > 0 ? `Adjuntar (${uploadQueueTotal - uploadQueue.length}/${uploadQueueTotal})` : 'Adjuntar')
                  : 'Guardar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Panel lateral de indicadores con datos reales ────────────
function PanelIndicadores({ clientId, onTabChange }: { clientId: string; onTabChange: (tab: string) => void }) {
  const { getToken } = useAuth();
  const [ind, setInd]         = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [indError, setIndError] = useState<string | null>(null);

  const fetchIndicators = useCallback(async () => {
    setIndError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/indicators/${clientId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok) setInd(data.data);
      else setIndError(data.error || "Error al cargar indicadores");
    } catch (e: any) {
      setIndError(e.message || "Error de conexión");
    } finally { setLoading(false); }
  }, [clientId, getToken]);

  useEffect(() => { fetchIndicators(); }, [fetchIndicators]);

  // Refrescar cuando cambia algo en el cliente (tareas, notas, archivos...)
  useEffect(() => {
    const handler = () => fetchIndicators();
    window.addEventListener('historial-changed', handler);
    return () => window.removeEventListener('historial-changed', handler);
  }, [fetchIndicators]);

  // Usa == null para capturar tanto null como undefined
  const fmt = (n: number | null | undefined, suffix = "") =>
    n == null ? "—" : `${n}${suffix}`;

  return (
    <aside className="w-52 shrink-0 space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden sticky top-6">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Indicadores</h3>
          {loading && <Loader2 size={11} className="animate-spin text-slate-300" />}
        </div>

        <div className="px-4 py-3">
          {indError && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-600 leading-snug">
              {indError}
              <button onClick={fetchIndicators} className="block mt-1 font-bold underline">Reintentar</button>
            </div>
          )}
          {/* Tareas */}
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tareas</p>
          <Indicador label="Total tareas"      value={fmt(ind?.total_tareas)} />
          <Indicador label="Pendientes"        value={fmt(ind?.tareas_pendientes)}
            color={ind?.tareas_pendientes > 0 ? "text-amber-600" : "text-slate-700"} />
          <Indicador label="Urgentes"          value={fmt(ind?.tareas_urgentes)}
            color={ind?.tareas_urgentes > 0 ? "text-red-600" : "text-slate-700"} />
          <Indicador label="Vencidas"          value={fmt(ind?.tareas_vencidas)}
            color={ind?.tareas_vencidas > 0 ? "text-red-700 font-bold" : "text-slate-700"} />
          <Indicador label="Completadas"       value={fmt(ind?.tareas_completadas)}
            color={ind?.tareas_completadas > 0 ? "text-emerald-600" : "text-slate-700"} />

          {/* Documentación */}
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-3 mb-1.5">Documentación</p>
          <Indicador label="Archivos"          value={fmt(ind?.total_archivos)} />
          <Indicador label="Notas"             value={fmt(ind?.total_notas)} />

          {/* Actividad */}
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-3 mb-1.5">Actividad</p>
          <Indicador label="Actuaciones"        value={fmt(ind?.total_actuaciones)}
            color={ind?.total_actuaciones > 0 ? "text-blue-600" : "text-slate-700"} />
          <Indicador label="Expedientes"        value={fmt(ind?.total_expedientes)}
            color={ind?.total_expedientes > 0 ? "text-indigo-600" : "text-slate-700"} />
          <Indicador label="Días sin actuac."  value={fmt(ind?.dias_sin_actuacion, " días")}
            color={ind?.dias_sin_actuacion > 30 ? "text-amber-600" : "text-slate-700"} />
          <Indicador label="Días desde alta"   value={fmt(ind?.dias_desde_alta, " días")} />
          <Indicador label="Estado"            value={ind?.client_status || "—"}
            color={ind?.client_status === "Alta" ? "text-emerald-600" :
                   ind?.client_status === "Baja" ? "text-red-600" : "text-slate-700"} />
          <Indicador label="Domicilio"
            value={ind?.tiene_domicilio ? "Sí" : "No"}
            color={ind?.tiene_domicilio ? "text-emerald-600" : "text-red-500"} />
        </div>

        {/* Acciones rápidas */}
        <div className="px-4 pb-4 space-y-2 border-t border-slate-100 pt-3 mt-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Acciones</p>
          <button onClick={() => onTabChange("tareas")}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors">
            <AlertTriangle size={13} className="text-amber-500" /> Ver tareas
          </button>
          <button onClick={() => onTabChange("adjuntos")}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors">
            <Paperclip size={13} className="text-red-500" /> Adjuntos
          </button>
        </div>
      </div>
    </aside>
  );
}

// ── Tab: Económico ────────────────────────────────────────────
function TabEconomico({ clientId }: { clientId: string }) {
  const { getToken } = useAuth();
  const [billing, setBilling] = useState<{ facturas: any[]; gastos: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  function fmtMoney(v: any) {
    if (v == null || v === "") return "—";
    return Number(v).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }
  function fmtDate(d: string | null | undefined) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch("/api/facturacion/bootstrap", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          const data = d.data || d;
          setBilling({ facturas: data.facturas || [], gastos: data.gastos || [] });
        }
      } catch { /* */ } finally { setLoading(false); }
    })();
  }, [clientId, getToken]);

  const ESTADO_BADGE: Record<string, string> = {
    cobrada:  "bg-emerald-100 text-emerald-700",
    pendiente:"bg-amber-100 text-amber-700",
    vencida:  "bg-red-100 text-red-700",
  };

  const clientFacturas = (billing?.facturas || []).filter((f: any) => f.client_id === clientId);
  const totalFacturado = clientFacturas.reduce((s: number, f: any) => s + Number(f.total || 0), 0);
  const totalCobrado   = clientFacturas.filter((f: any) => f.estado === "cobrada").reduce((s: number, f: any) => s + Number(f.total || 0), 0);
  const totalPendiente = clientFacturas.filter((f: any) => f.estado !== "cobrada").reduce((s: number, f: any) => s + Number(f.total || 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <BadgeEuro size={15} className="text-slate-400" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Facturado</p>
          </div>
          <p className="text-2xl font-black text-slate-800">{fmtMoney(totalFacturado)}</p>
          <p className="text-xs text-slate-400 mt-1">{clientFacturas.length} factura{clientFacturas.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={15} className="text-emerald-500" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Cobrado</p>
          </div>
          <p className="text-2xl font-black text-emerald-600">{fmtMoney(totalCobrado)}</p>
          <p className="text-xs text-slate-400 mt-1">facturas cobradas</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown size={15} className="text-amber-500" />
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Pendiente</p>
          </div>
          <p className="text-2xl font-black text-amber-600">{fmtMoney(totalPendiente)}</p>
          <p className="text-xs text-slate-400 mt-1">por cobrar</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote size={14} className="text-slate-400" />
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Facturas del cliente</h3>
          </div>
          <Link to="/dashboard/facturacion" className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1">
            Ir a facturación <ChevronRight size={11} />
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={18} className="animate-spin text-slate-300" />
          </div>
        ) : clientFacturas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-300">
            <Banknote size={28} className="opacity-30" />
            <p className="text-sm font-medium">Sin facturas vinculadas a este cliente</p>
            <Link to="/dashboard/facturacion" className="mt-1 text-xs font-bold text-red-500 hover:underline">Crear factura</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Núm.</th>
                <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Expediente</th>
                <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fecha</th>
                <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vencimiento</th>
                <th className="px-5 py-3 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total</th>
                <th className="px-5 py-3 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {clientFacturas.map((f: any) => (
                <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-slate-700 font-semibold">{f.num}</td>
                  <td className="px-5 py-3 text-xs text-slate-500 max-w-[200px] truncate">{f.expediente_ref || "—"}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{fmtDate(f.fecha)}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{fmtDate(f.vencimiento)}</td>
                  <td className="px-5 py-3 text-xs font-bold text-slate-800 text-right">{fmtMoney(f.total)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${ESTADO_BADGE[f.estado] || "bg-slate-100 text-slate-600"}`}>
                      {f.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Tab: Agenda ───────────────────────────────────────────────
function TabAgenda({ clientId }: { clientId: string }) {
  const { getToken } = useAuth();
  const [events, setEvents] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);

  function fmtDate(d: string | null | undefined) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch("/api/agenda?limit=500", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          setEvents((d.data || d) as any[]);
        }
      } catch { /* */ } finally { setLoading(false); }
    })();
  }, [clientId, getToken]);

  const TYPE_BADGE: Record<string, string> = {
    cita:    "bg-blue-100 text-blue-700",
    plazo:   "bg-red-100 text-red-700",
    reunion: "bg-purple-100 text-purple-700",
    juicio:  "bg-orange-100 text-orange-700",
    otro:    "bg-slate-100 text-slate-600",
  };
  const STATUS_BADGE: Record<string, string> = {
    pendiente:  "bg-amber-100 text-amber-700",
    completado: "bg-emerald-100 text-emerald-700",
    cancelado:  "bg-slate-100 text-slate-500",
  };

  const clientEvents = (events || []).filter((e: any) => e.cliente_id === clientId);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-slate-400" />
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Eventos de agenda</h3>
        </div>
        <Link to="/dashboard/agenda" className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1">
          Ir a agenda <ChevronRight size={11} />
        </Link>
      </div>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={18} className="animate-spin text-slate-300" />
        </div>
      ) : clientEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-300">
          <Calendar size={28} className="opacity-30" />
          <p className="text-sm font-medium">Sin eventos vinculados a este cliente</p>
          <Link to="/dashboard/agenda" className="mt-1 text-xs font-bold text-red-500 hover:underline">Crear evento</Link>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Título</th>
              <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Tipo</th>
              <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fecha inicio</th>
              <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fecha fin</th>
              <th className="px-5 py-3 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {clientEvents.map((e: any) => (
              <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-3 text-xs text-slate-700 font-medium">{e.title}</td>
                <td className="px-5 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${TYPE_BADGE[e.type] || "bg-slate-100 text-slate-600"}`}>
                    {e.type || "—"}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-slate-500">{fmtDate(e.start_at)}</td>
                <td className="px-5 py-3 text-xs text-slate-500">{e.end_at ? fmtDate(e.end_at) : "—"}</td>
                <td className="px-5 py-3 text-center">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${STATUS_BADGE[e.status] || "bg-slate-100 text-slate-600"}`}>
                    {e.status || "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────
export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const setEF = (key: string, val: any) => setEditForm((prev: any) => ({ ...prev, [key]: val }));
  const initialTab = searchParams.get("tab") || "perfil";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [photoZoom, setPhotoZoom] = useState(false);
  // Lazy-mount: tabs mount the first time they're visited and stay mounted (hidden via CSS)
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(new Set(["perfil", initialTab]));
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setMountedTabs(prev => { const s = new Set(prev); s.add(tabId); return s; });
  };

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab && requestedTab !== activeTab) {
      setActiveTab(requestedTab);
      setMountedTabs(prev => { const s = new Set(prev); s.add(requestedTab); return s; });
    }
  }, [searchParams, activeTab]);

  useEffect(() => {
    if (searchParams.get("openTask") !== "new") return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("openTask");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const fetchClient = useCallback(async (silent = false) => {
    if (!id) return;
    try {
      if (!silent) setLoading(true);
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/entities/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await safeJson(res);
      if (res.ok) setClient(result.data);
      else if (!silent) throw new Error(result.error || "Cliente no encontrado");
    } catch (err: any) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id, getToken]);

  useEffect(() => { fetchClient(); }, [fetchClient]);

  // Auto-refrescar datos del cliente: cada 30s, al volver a pestaña
  useAutoRefresh(() => fetchClient(true), { intervalMs: 30_000, enabled: !!id });

  // Auto-start inline edit when navigated with ?edit=1
  const autoEditRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("edit") !== "1" || !client || autoEditRef.current) return;
    autoEditRef.current = true;
    setEditForm({
      first_name: client.first_name || "",
      last_name: client.last_name || "",
      commercial_name: client.commercial_name || "",
      type: client.type || "CLIENTE",
      client_status: client.client_status || "Alta",
      document_type: client.document_type || "DNI",
      nif_cif: client.nif_cif || "",
      legal_nature: client.legal_nature || "",
      gender: client.gender || "",
      birth_date: client.birth_date ? client.birth_date.slice(0, 10) : "",
      nationality: client.nationality || "",
      expedition_country: client.expedition_country || "",
      address_street: client.address_street || "",
      address_town: client.address_town || "",
      address_cp: client.address_cp || "",
      address_province: client.address_province || "",
      address_country: client.address_country || "",
      email: client.email || "",
      phone_1: client.phone_1 || "",
      phone_mobile: client.phone_mobile || "",
      phone_2: client.phone_2 || "",
      phone_3: client.phone_3 || "",
      phone_fax: client.phone_fax || "",
      website: client.website || "",
      date_alta: client.date_alta ? client.date_alta.slice(0, 10) : "",
      date_baja: client.date_baja ? client.date_baja.slice(0, 10) : "",
      lopd: client.lopd || "",
      commercial_communications: client.commercial_communications || "",
      center: client.center || "",
    });
    setEditing(true);
    setActiveTab("perfil");
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <Loader2 className="animate-spin text-red-600 mb-3" size={32} />
      <p className="text-sm animate-pulse">Cargando ficha...</p>
    </div>
  );

  if (error || !client) return (
    <div className="space-y-4">
      <Link to="/dashboard/clientes">
        <BackButton />
      </Link>
      <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle size={20} className="shrink-0" />
        <span className="text-sm">{error || "Cliente no encontrado"}</span>
      </div>
    </div>
  );

  const initials = [(client.first_name || ""), (client.last_name || "")]
    .map((s: string) => s.charAt(0).toUpperCase()).join("") || "?";

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }) : null;

  const age = client.birth_date
    ? Math.floor((Date.now() - new Date(client.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null;

  const startEdit = () => {
    setEditForm({
      first_name: client.first_name || "",
      last_name: client.last_name || "",
      commercial_name: client.commercial_name || "",
      type: client.type || "CLIENTE",
      client_status: client.client_status || "Alta",
      document_type: client.document_type || "DNI",
      nif_cif: client.nif_cif || "",
      legal_nature: client.legal_nature || "",
      gender: client.gender || "",
      birth_date: client.birth_date ? client.birth_date.slice(0, 10) : "",
      nationality: client.nationality || "",
      expedition_country: client.expedition_country || "",
      address_street: client.address_street || "",
      address_town: client.address_town || "",
      address_cp: client.address_cp || "",
      address_province: client.address_province || "",
      address_country: client.address_country || "",
      email: client.email || "",
      phone_1: client.phone_1 || "",
      phone_mobile: client.phone_mobile || "",
      phone_2: client.phone_2 || "",
      phone_3: client.phone_3 || "",
      phone_fax: client.phone_fax || "",
      website: client.website || "",
      date_alta: client.date_alta ? client.date_alta.slice(0, 10) : "",
      date_baja: client.date_baja ? client.date_baja.slice(0, 10) : "",
      lopd: client.lopd || "",
      commercial_communications: client.commercial_communications || "",
      center: client.center || "",
    });
    setEditing(true);
    setActiveTab("perfil");
  };

  const handleSaveClient = async () => {
    if (!editForm?.first_name?.trim() && !editForm?.commercial_name?.trim()) return;
    setSaving(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/entities/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(editForm),
      });
      const d = await safeJson(res);
      if (!res.ok) { alert(d.error || "Error al guardar"); return; }
      setEditing(false);
      setEditForm(null);
      await fetchClient();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-6 animate-in fade-in duration-500">

      {/* ── COLUMNA PRINCIPAL ──────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Breadcrumb + acciones */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/dashboard/clientes" className="hover:text-slate-800 transition-colors">Clientes</Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">{client.first_name} {client.last_name}</span>
          </div>
          <div className="flex gap-2">
            <BackButton onClick={() => navigate("/dashboard/clientes")} />
            {editing ? (
              <>
                <button
                  onClick={() => { setEditing(false); setEditForm(null); }}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm active:scale-95 transition-all"
                >
                  <X size={14} /> Cancelar
                </button>
                <button
                  onClick={handleSaveClient}
                  disabled={saving || (!editForm?.first_name?.trim() && !editForm?.commercial_name?.trim())}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl shadow-sm active:scale-95 transition-all"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Guardar cambios
                </button>
              </>
            ) : (
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm active:scale-95 transition-all"
              >
                <Edit3 size={14} /> Editar
              </button>
            )}
          </div>
        </div>

        {/* Header tarjeta del cliente */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-4">
            {client.photo_url
              ? (
                <button
                  onClick={() => setPhotoZoom(true)}
                  className="shrink-0 rounded-xl overflow-hidden shadow focus:outline-none focus:ring-2 focus:ring-red-400 cursor-zoom-in"
                  title="Ver foto ampliada"
                >
                  <img src={client.photo_url} alt="Foto" className="h-16 w-16 object-cover hover:scale-105 transition-transform duration-200" />
                </button>
              )
              : (
                <div className="h-16 w-16 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-red-200 shrink-0">
                  {initials}
                </div>
              )
            }

            {/* Lightbox foto */}
            {photoZoom && client.photo_url && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
                onClick={() => setPhotoZoom(false)}
              >
                <div className="relative max-w-2xl w-full mx-4" onClick={e => e.stopPropagation()}>
                  <img
                    src={client.photo_url}
                    alt="Foto ampliada"
                    className="w-full rounded-2xl shadow-2xl object-contain max-h-[90vh]"
                  />
                  <button
                    onClick={() => setPhotoZoom(false)}
                    className="absolute -top-3 -right-3 bg-white rounded-full p-1.5 shadow-lg text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <X size={16} />
                  </button>
                  <p className="text-center text-white/70 text-xs mt-3">
                    {client.first_name} {client.last_name}
                  </p>
                </div>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 truncate">
                  {client.first_name} {client.last_name}
                </h1>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor[client.client_status] || "bg-slate-100 text-slate-600"}`}>
                  {client.client_status || "Alta"}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${typeColor[client.type] || "bg-slate-100 text-slate-600"}`}>
                  {client.type || "Cliente"}
                </span>
              </div>
              {client.commercial_name && <p className="text-slate-500 text-sm mt-0.5">{client.commercial_name}</p>}
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                {client.nif_cif && (
                  <span className="flex items-center gap-1 font-mono"><Hash size={11} />{client.nif_cif}</span>
                )}
                {client.internal_number && (
                  <span className="flex items-center gap-1">Nº {client.internal_number}</span>
                )}
                {client.date_alta && (
                  <span className="flex items-center gap-1"><Calendar size={11} /> Alta: {formatDate(client.date_alta)}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── TABS ────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Barra de tabs */}
          <div className="flex border-b border-slate-100 overflow-x-auto">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-[12px] font-bold whitespace-nowrap transition-all border-b-2 ${
                    active
                      ? "border-red-600 text-red-600 bg-red-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Contenido del tab activo — lazy-mount: monta al primer acceso, oculta con CSS */}
          <div className="p-5">
            <div style={{ display: activeTab === "perfil" ? "block" : "none" }}>
              {!editing && <TabPerfil client={client} formatDate={formatDate} age={age} />}
              {editing && editForm && (
                <div className="space-y-4">
                  {/* Datos principales */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                      <User size={14} className="text-slate-400" />
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Datos principales</h3>
                    </div>
                    <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                      <EF label="Nombre"><input value={editForm.first_name} onChange={e => setEF("first_name", e.target.value)} className={EI} placeholder="Nombre" /></EF>
                      <EF label="Apellidos"><input value={editForm.last_name} onChange={e => setEF("last_name", e.target.value)} className={EI} placeholder="Apellidos" /></EF>
                      <EF label="Nombre comercial"><input value={editForm.commercial_name} onChange={e => setEF("commercial_name", e.target.value)} className={EI} placeholder="Nombre comercial / empresa" /></EF>
                      <EF label="Tipo">
                        <select value={editForm.type} onChange={e => setEF("type", e.target.value)} className={EI}>
                          {["CLIENTE","CONTRARIO","JUZGADO","PERITO","PROVEEDOR"].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </EF>
                      <EF label="Estado">
                        <select value={editForm.client_status} onChange={e => setEF("client_status", e.target.value)} className={EI}>
                          {["Alta","Baja","Suspendido","Potencial"].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </EF>
                    </div>
                  </div>

                  {/* Identificación */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                      <FileText size={14} className="text-slate-400" />
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Identificación</h3>
                    </div>
                    <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                      <EF label="Tipo documento">
                        <select value={editForm.document_type} onChange={e => setEF("document_type", e.target.value)} className={EI}>
                          {["DNI","NIE","NIF","CIF","Pasaporte","Otro"].map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </EF>
                      <EF label="NIF / CIF"><input value={editForm.nif_cif} onChange={e => setEF("nif_cif", e.target.value)} className={EI + " font-mono"} placeholder="00000000A" /></EF>
                      <EF label="Naturaleza jurídica"><input value={editForm.legal_nature} onChange={e => setEF("legal_nature", e.target.value)} className={EI} /></EF>
                      <EF label="Sexo">
                        <select value={editForm.gender} onChange={e => setEF("gender", e.target.value)} className={EI}>
                          <option value="">—</option>
                          <option value="M">Masculino</option>
                          <option value="F">Femenino</option>
                          <option value="Otro">Otro</option>
                        </select>
                      </EF>
                      <EF label="Fecha nacimiento"><input type="date" value={editForm.birth_date} onChange={e => setEF("birth_date", e.target.value)} className={EI} /></EF>
                      <EF label="Nacionalidad"><input value={editForm.nationality} onChange={e => setEF("nationality", e.target.value)} className={EI} /></EF>
                      <EF label="País expedición"><input value={editForm.expedition_country} onChange={e => setEF("expedition_country", e.target.value)} className={EI} /></EF>
                    </div>
                  </div>

                  {/* Dirección */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                      <MapPin size={14} className="text-slate-400" />
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Dirección</h3>
                    </div>
                    <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="col-span-2 md:col-span-3">
                        <EF label="Dirección"><input value={editForm.address_street} onChange={e => setEF("address_street", e.target.value)} className={EI} placeholder="Calle, número, piso…" /></EF>
                      </div>
                      <EF label="Población"><input value={editForm.address_town} onChange={e => setEF("address_town", e.target.value)} className={EI} /></EF>
                      <EF label="Código postal"><input value={editForm.address_cp} onChange={e => setEF("address_cp", e.target.value)} className={EI} /></EF>
                      <EF label="Provincia"><input value={editForm.address_province} onChange={e => setEF("address_province", e.target.value)} className={EI} /></EF>
                      <EF label="País"><input value={editForm.address_country} onChange={e => setEF("address_country", e.target.value)} className={EI} /></EF>
                    </div>
                  </div>

                  {/* Contacto */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                      <Phone size={14} className="text-slate-400" />
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Contacto</h3>
                    </div>
                    <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="col-span-2 md:col-span-3">
                        <EF label="Correo electrónico"><input type="email" value={editForm.email} onChange={e => setEF("email", e.target.value)} className={EI} placeholder="correo@ejemplo.com" /></EF>
                      </div>
                      <EF label="Teléfono"><input value={editForm.phone_1} onChange={e => setEF("phone_1", e.target.value)} className={EI} /></EF>
                      <EF label="Móvil"><input value={editForm.phone_mobile} onChange={e => setEF("phone_mobile", e.target.value)} className={EI} /></EF>
                      <EF label="Teléfono 2"><input value={editForm.phone_2} onChange={e => setEF("phone_2", e.target.value)} className={EI} /></EF>
                      <EF label="Teléfono 3"><input value={editForm.phone_3} onChange={e => setEF("phone_3", e.target.value)} className={EI} /></EF>
                      <EF label="Fax"><input value={editForm.phone_fax} onChange={e => setEF("phone_fax", e.target.value)} className={EI} /></EF>
                      <EF label="Web"><input value={editForm.website} onChange={e => setEF("website", e.target.value)} className={EI} placeholder="https://…" /></EF>
                    </div>
                  </div>

                  {/* Administración */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                      <Shield size={14} className="text-slate-400" />
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Administración</h3>
                    </div>
                    <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                      <EF label="Fecha alta"><input type="date" value={editForm.date_alta} onChange={e => setEF("date_alta", e.target.value)} className={EI} /></EF>
                      <EF label="Fecha baja"><input type="date" value={editForm.date_baja} onChange={e => setEF("date_baja", e.target.value)} className={EI} /></EF>
                      <EF label="LOPD"><input value={editForm.lopd} onChange={e => setEF("lopd", e.target.value)} className={EI} /></EF>
                      <EF label="Comunicaciones comerciales"><input value={editForm.commercial_communications} onChange={e => setEF("commercial_communications", e.target.value)} className={EI} /></EF>
                      <EF label="Centro"><input value={editForm.center} onChange={e => setEF("center", e.target.value)} className={EI} /></EF>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {mountedTabs.has("expedientes") && (
              <div style={{ display: activeTab === "expedientes" ? "block" : "none" }}>
                <TabExpedientes clientId={id!} />
              </div>
            )}
            {mountedTabs.has("economico") && (
              <div style={{ display: activeTab === "economico" ? "block" : "none" }}>
                <TabEconomico clientId={id!} />
              </div>
            )}
            {mountedTabs.has("agenda") && (
              <div style={{ display: activeTab === "agenda" ? "block" : "none" }}>
                <TabAgenda clientId={id!} />
              </div>
            )}
            {mountedTabs.has("historial") && (
              <div style={{ display: activeTab === "historial" ? "block" : "none" }}>
                <TabHistorial clientId={id!} />
              </div>
            )}
            {mountedTabs.has("notas") && (
              <div style={{ display: activeTab === "notas" ? "block" : "none" }}>
                <TabNotas clientId={id!} />
              </div>
            )}
            {mountedTabs.has("tareas") && (
              <div style={{ display: activeTab === "tareas" ? "block" : "none" }}>
                <TabTareas
                  clientId={id!}
                  autoOpen={searchParams.get("openTask") === "new"}
                  initialTaskType={searchParams.get("taskType") || ""}
                />
              </div>
            )}
            {mountedTabs.has("adjuntos") && (
              <div style={{ display: activeTab === "adjuntos" ? "block" : "none" }}>
                <TabAdjuntos clientId={id!} client={client} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PANEL INDICADORES ───────────────────────────────── */}
      <PanelIndicadores clientId={id!} onTabChange={handleTabChange} />
    </div>
  );
}


