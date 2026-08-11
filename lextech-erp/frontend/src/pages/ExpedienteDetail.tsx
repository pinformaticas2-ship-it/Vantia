import React, { useEffect, useState, useCallback, useMemo, useRef, useContext } from "react";
import { SidebarContext } from "../layouts/DashboardLayout";
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
  Upload,
  Download,
  ExternalLink,
  FilePlus2,
  Sparkles,
  Eye,
  RefreshCw,
  Calendar,
  ChevronDown,
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
  Mail,
  Send,
  Banknote,
  TrendingUp,
  TrendingDown,
  BadgeEuro,
  ChevronRight,
  ChevronLeft,
  Copy,
  ClipboardPaste,
  Lock,
  Unlock,
  FolderPlus,
  FileX,
  FileText,
  MessageSquare,
  Video,
} from "lucide-react";
import { safeJson, resolveApiUrl } from "../lib/api";
import { Spinner } from "../components/Spinner";
import { useAutoRefresh } from "../lib/useAutoRefresh";
import { usePasteFiles, setErpClipboard } from "../lib/usePasteFiles";
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
import { UndoToast } from "../components/UndoToast";
import { useUndoDelete } from "../lib/useUndoDelete";

// ── Google Meet (vía Google Calendar) para el evento rápido del expediente ──
// Mismas claves que el módulo Agenda (Agenda.tsx) para compartir la sesión
// de Google ya conectada por el usuario sin pedirle que se autentique dos veces.
const GCAL_TOKEN_KEY = "lextech-gcal-token-v1";
const GCAL_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const GCAL_SCOPES = "https://www.googleapis.com/auth/calendar";

function requestGoogleCalendarToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!GCAL_CLIENT_ID || GCAL_CLIENT_ID === "TU_CLIENT_ID.apps.googleusercontent.com") {
      reject(new Error("Configura VITE_GOOGLE_CLIENT_ID en el archivo .env del frontend."));
      return;
    }
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      reject(new Error("El script de Google aún no está cargado. Recarga la página."));
      return;
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GCAL_CLIENT_ID,
      scope: GCAL_SCOPES,
      callback: (resp: { access_token?: string; error?: string }) => {
        if (resp.error || !resp.access_token) {
          reject(new Error("Error al autenticar con Google: " + (resp.error || "desconocido")));
          return;
        }
        resolve(resp.access_token);
      },
    });
    client.requestAccessToken();
  });
}

async function createGoogleMeetEvent(token: string, data: { title: string; description?: string | null; start_at: string; end_at: string; guestEmail?: string | null }) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: data.title,
      description: data.description || "",
      start: { dateTime: data.start_at },
      end: { dateTime: data.end_at },
      conferenceData: {
        createRequest: {
          requestId: `meet-${crypto.randomUUID()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      // Sin esto el correo queda guardado en el ERP pero Google Calendar
      // nunca le manda la invitación con el enlace de Meet al invitado.
      ...(data.guestEmail?.trim() ? { attendees: [{ email: data.guestEmail.trim() }] } : {}),
    }),
  });
  const json = await safeJson(res);
  if (!res.ok) {
    if (res.status === 401) throw new Error("GCAL_AUTH_EXPIRED");
    throw new Error(json?.error?.message || "No se pudo crear el evento en Google Calendar.");
  }
  return json;
}

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

const EI = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100";

const EF = ({ label, children }: { label: string; mono?: boolean; children: React.ReactNode }) => (
  <div>
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
    {children}
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

type DetailTabKey = "perfil" | TabKey | "relacionados" | "actuacion" | "economico" | "agenda" | "cronologia" | "correo" | "conversaciones";

const DETAIL_TABS: { key: DetailTabKey; label: string; icon: any }[] = [
  { key: "perfil",          label: "Datos",                  icon: User },
  { key: "clientes",        label: "Propio",                 icon: Users },
  { key: "contrarios",      label: "Contrarios",             icon: Users },
  { key: "adjuntos",        label: "Adjuntos",               icon: Paperclip },
  { key: "agenda",          label: "Agenda",                 icon: Calendar },
  { key: "actuacion",       label: "Actuaciones",            icon: ClipboardList },
  { key: "tareas",          label: "Tareas / Plazos",        icon: AlertTriangle },
  { key: "economico",       label: "Económico",              icon: Banknote },
  { key: "notas",           label: "Notas",                  icon: StickyNote },
  { key: "correo",          label: "Correo",                 icon: Mail },
  { key: "conversaciones",  label: "Conversaciones",         icon: MessageSquare },
  { key: "historial",       label: "Historial expediente",   icon: Activity },
  { key: "cronologia",      label: "Cronología",             icon: Clock },
  { key: "relacionados",    label: "Exp. relacionados",      icon: Link2 },
];

const NOTIF_TIPOS = [
  { value: "cedula_emplazamiento",    label: "Cédula de emplazamiento" },
  { value: "providencia",             label: "Providencia" },
  { value: "auto",                    label: "Auto" },
  { value: "sentencia",               label: "Sentencia" },
  { value: "diligencia_ordenacion",   label: "Diligencia de ordenación" },
  { value: "decreto",                 label: "Decreto" },
  { value: "citacion",                label: "Citación" },
  { value: "requerimiento",           label: "Requerimiento" },
  { value: "notificacion",            label: "Notificación" },
  { value: "exhorto",                 label: "Exhorto" },
  { value: "otro",                    label: "Otro" },
];

const NOTIF_TIPO_COLORS: Record<string, string> = {
  cedula_emplazamiento:  "bg-orange-100 text-orange-700 border-orange-200",
  providencia:           "bg-blue-100 text-blue-700 border-blue-200",
  auto:                  "bg-purple-100 text-purple-700 border-purple-200",
  sentencia:             "bg-emerald-100 text-emerald-700 border-emerald-200",
  diligencia_ordenacion: "bg-slate-100 text-slate-600 border-slate-200",
  decreto:               "bg-slate-100 text-slate-600 border-slate-200",
  citacion:              "bg-sky-100 text-sky-700 border-sky-200",
  requerimiento:         "bg-red-100 text-red-700 border-red-200",
  notificacion:          "bg-amber-100 text-amber-700 border-amber-200",
  exhorto:               "bg-indigo-100 text-indigo-700 border-indigo-200",
  otro:                  "bg-slate-100 text-slate-500 border-slate-200",
};

const NOTIF_DOT_COLORS: Record<string, string> = {
  cedula_emplazamiento:  "bg-orange-400",
  providencia:           "bg-blue-400",
  auto:                  "bg-purple-400",
  sentencia:             "bg-emerald-400",
  diligencia_ordenacion: "bg-slate-400",
  decreto:               "bg-slate-400",
  citacion:              "bg-sky-400",
  requerimiento:         "bg-red-400",
  notificacion:          "bg-amber-400",
  exhorto:               "bg-indigo-400",
  otro:                  "bg-slate-300",
};

const NOTIF_ESTADO_BADGE: Record<string, string> = {
  pendiente:   "bg-amber-100 text-amber-700",
  respondida:  "bg-emerald-100 text-emerald-700",
  archivada:   "bg-slate-100 text-slate-500",
};

const EMPTY_NOTIF = {
  tipo: "notificacion",
  titulo: "",
  descripcion: "",
  fecha_recepcion: new Date().toISOString().slice(0, 10),
  fecha_limite: "",
  estado: "pendiente",
};

function CronologiaTab({
  expedienteId,
  expediente,
  notificaciones,
  loading,
  getToken,
  onRefresh,
  locked = false,
}: {
  expedienteId: string;
  expediente: any;
  notificaciones: any[] | null;
  loading: boolean;
  getToken: any;
  onRefresh: () => void;
  locked?: boolean;
}) {
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({ ...EMPTY_NOTIF });
  const [saving, setSaving] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [filterEstado, setFilterEstado] = React.useState<string>("todas");
  const [removedNotifIds, setRemovedNotifIds] = React.useState<string[]>([]);

  const { pending: pendingNotifDelete, startDelete: startNotifDelete, undo: undoNotifDelete, dismiss: dismissNotifDelete } = useUndoDelete<any>({
    onDelete: async (id: string) => {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/expedientes/${expedienteId}/notificaciones/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      onRefresh();
    },
  });

  const tipoLabel = (tipo: string) =>
    NOTIF_TIPOS.find((t) => t.value === tipo)?.label || tipo;

  const filtered = (notificaciones || []).filter(
    (n: any) => (filterEstado === "todas" || n.estado === filterEstado) && !removedNotifIds.includes(n.id)
  );

  async function handleSave() {
    if (!form.titulo || !form.fecha_recepcion) return;
    setSaving(true);
    try {
      const token = await getToken({ skipCache: true });
      const url = editId
        ? `/api/expedientes/${expedienteId}/notificaciones/${editId}`
        : `/api/expedientes/${expedienteId}/notificaciones`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          fecha_limite: form.fecha_limite || null,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setEditId(null);
        setForm({ ...EMPTY_NOTIF });
        onRefresh();
      }
    } catch { /* */ } finally { setSaving(false); }
  }

  function handleDelete(nid: string) {
    const item = (notificaciones || []).find((n: any) => n.id === nid);
    if (!item) return;
    setConfirmDelete(null);
    setRemovedNotifIds(prev => [...prev, nid]);
    startNotifDelete(nid, item);
  }

  function handleUndoNotif() {
    const item = undoNotifDelete();
    if (item) setRemovedNotifIds(prev => prev.filter(id => id !== item.id));
  }

  function startEdit(n: any) {
    setForm({
      tipo: n.tipo,
      titulo: n.titulo,
      descripcion: n.descripcion || "",
      fecha_recepcion: n.fecha_recepcion?.slice(0, 10) || "",
      fecha_limite: n.fecha_limite?.slice(0, 10) || "",
      estado: n.estado,
    });
    setEditId(n.id);
    setShowForm(true);
  }

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
          <AlertTriangle size={13} className="shrink-0" /> Expediente cerrado — no se pueden añadir ni modificar notificaciones.
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Línea de tiempo</h3>
          <p className="text-xs text-slate-400">Cronología de notificaciones judiciales</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filtro estado */}
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
          >
            <option value="todas">Todas</option>
            <option value="pendiente">Pendientes</option>
            <option value="respondida">Respondidas</option>
            <option value="archivada">Archivadas</option>
          </select>
          {!locked && (
            <button
              onClick={() => { setShowForm(true); setEditId(null); setForm({ ...EMPTY_NOTIF }); }}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 transition-colors"
            >
              <Plus size={12} /> Nueva
            </button>
          )}
        </div>
      </div>

      {/* Formulario nueva / editar */}
      {showForm && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {editId ? "Editar notificación" : "Nueva notificación"}
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tipo *</label>
              <select
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
              >
                {NOTIF_TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Estado</label>
              <select
                value={form.estado}
                onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
              >
                <option value="pendiente">Pendiente</option>
                <option value="respondida">Respondida</option>
                <option value="archivada">Archivada</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Título *</label>
              <input
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Ej. Cédula de emplazamiento — Juicio Ordinario 673/25"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fecha recepción *</label>
              <input
                type="date"
                value={form.fecha_recepcion}
                onChange={(e) => setForm((f) => ({ ...f, fecha_recepcion: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fecha límite respuesta</label>
              <input
                type="date"
                value={form.fecha_limite}
                onChange={(e) => setForm((f) => ({ ...f, fecha_limite: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Descripción / observaciones</label>
              <textarea
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                rows={2}
                placeholder="Detalles adicionales de la notificación..."
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); setEditId(null); }}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.titulo || !form.fecha_recepcion}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {editId ? "Guardar cambios" : "Añadir"}
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-14">
          <Spinner size="sm" muted />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-300">
          <Clock size={32} className="opacity-20" />
          <p className="text-sm font-medium">Sin notificaciones registradas</p>
          {!locked && (
            <button
              onClick={() => { setShowForm(true); setEditId(null); setForm({ ...EMPTY_NOTIF }); }}
              className="mt-1 text-xs font-bold text-red-500 hover:underline"
            >
              Añadir primera notificación
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* Línea vertical */}
          <div className="absolute left-[19px] top-3 bottom-3 w-px bg-slate-200" />

          <div className="space-y-0">
            {filtered.map((n: any, idx: number) => {
              const dotColor = NOTIF_DOT_COLORS[n.tipo] || "bg-slate-300";
              const badgeColor = NOTIF_TIPO_COLORS[n.tipo] || "bg-slate-100 text-slate-600 border-slate-200";
              const today = new Date();
              const limite = n.fecha_limite ? new Date(n.fecha_limite) : null;
              const isOverdue = limite && limite < today && n.estado === "pendiente";
              return (
                <div key={n.id} className="relative flex gap-4 pb-6 last:pb-0">
                  {/* Dot */}
                  <div className="relative z-10 flex-shrink-0 mt-1">
                    <div className={`w-[10px] h-[10px] rounded-full border-2 border-white shadow-sm ${dotColor} mt-1`} />
                  </div>

                  {/* Card */}
                  <div className={`flex-1 rounded-xl border bg-white px-5 py-4 transition-shadow hover:shadow-sm ${isOverdue ? "border-red-200" : "border-slate-200"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Tipo badge + título */}
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeColor}`}>
                            {tipoLabel(n.tipo)}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${NOTIF_ESTADO_BADGE[n.estado] || "bg-slate-100 text-slate-500"}`}>
                            {n.estado}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-slate-800 leading-snug">{n.titulo}</p>
                        {/* Expediente context line */}
                        {expediente && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {[expediente.tipo_proc, expediente.num_autos, expediente.juzgado]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                        {n.descripcion && (
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{n.descripcion}</p>
                        )}
                        {/* Fecha límite */}
                        {n.fecha_limite && (
                          <div className={`inline-flex items-center gap-1.5 mt-2 rounded-full border px-2.5 py-1 text-xs font-bold ${isOverdue ? "bg-red-50 border-red-200 text-red-600" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                            <Calendar size={11} />
                            {new Date(n.fecha_limite).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })}
                            <span className="font-normal opacity-70">(Fecha límite de respuesta)</span>
                            {isOverdue && <span className="ml-1 font-bold text-red-600">— VENCIDA</span>}
                          </div>
                        )}
                      </div>

                      {/* Fecha recepción + acciones */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <span className="text-xs font-semibold text-slate-400 whitespace-nowrap">
                          {new Date(n.fecha_recepcion).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEdit(n)}
                            className="p-1 rounded text-slate-300 hover:text-slate-600 transition-colors"
                            title="Editar"
                          >
                            <Edit3 size={12} />
                          </button>
                          {confirmDelete === n.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleDelete(n.id)} className="p-1 rounded text-red-500 hover:text-red-700"><Check size={12} /></button>
                              <button onClick={() => setConfirmDelete(null)} className="p-1 rounded text-slate-400 hover:text-slate-600"><X size={12} /></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(n.id)}
                              className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {pendingNotifDelete && (
        <UndoToast
          message="Notificación eliminada"
          startedAt={pendingNotifDelete.startedAt}
          onUndo={handleUndoNotif}
          onDismiss={dismissNotifDelete}
        />
      )}
    </div>
  );
}

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
  locked = false,
}: {
  expedienteId: string;
  legacyNote?: string | null;
  onLegacyUpdated?: (next: string) => void;
  locked?: boolean;
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

  const { pending: pendingNotaDelete, startDelete: startNotaDelete, undo: undoNotaDelete, dismiss: dismissNotaDelete } = useUndoDelete<Nota>({
    onDelete: async (id: string) => {
      const headers = await authHeaders();
      await fetch(`/api/expedientes/${expedienteId}/notes/${id}`, { method: "DELETE", headers });
    },
  });

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

    const nota = notas.find((n) => n.id === notaId);
    if (!nota) return;
    setNotas((prev) => prev.filter((n) => n.id !== notaId));
    startNotaDelete(notaId, nota);
  };

  const handleUndoNota = () => {
    const item = undoNotaDelete();
    if (item) setNotas((prev) => [...prev, item]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="xl" muted />
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
      {locked && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
          <AlertTriangle size={13} className="shrink-0" /> Expediente cerrado — no se pueden añadir ni modificar notas.
        </div>
      )}
      {!locked && (
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
      )}

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
                    n.priority === "urgente" ? "bg-rose-100 text-rose-600" :
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

                {!n.isLegacy && !locked && (
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
        <div className="fixed inset-0 z-50 bg-transparent flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-5 space-y-4">
            <div className="space-y-1">
              <h4 className="text-base font-bold text-slate-900">Eliminar nota</h4>
              <p className="text-sm text-slate-500">Tendrás 15 segundos para deshacer.</p>
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

      {pendingNotaDelete && (
        <UndoToast
          message="Nota eliminada"
          startedAt={pendingNotaDelete.startedAt}
          onUndo={handleUndoNota}
          onDismiss={dismissNotaDelete}
        />
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
  actuacion: { label: "Actuación", color: "bg-fuchsia-100 text-fuchsia-700" },
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
  initialCreate = false,
  initialType = "",
  locked = false,
}: {
  expedienteId: string;
  clienteId?: string | null;
  expedienteRef?: string | null;
  juzgado?: string | null;
  numProc?: string | null;
  initialCreate?: boolean;
  initialType?: string;
  locked?: boolean;
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

  // Videollamada (Google Meet) opcional al crear la tarea/plazo -- mismo
  // patrón y misma sesión de Google (sessionStorage compartido) que la
  // pestaña Agenda del expediente.
  const [gcalToken, setGcalToken] = useState<string | null>(() => {
    try { return sessionStorage.getItem(GCAL_TOKEN_KEY); } catch { return null; }
  });
  const [gcalError, setGcalError] = useState<string | null>(null);
  const [withMeet, setWithMeet] = useState(false);
  const [meetHora, setMeetHora] = useState("10:00");
  const [guestEmail, setGuestEmail] = useState("");

  const connectGcal = async () => {
    setGcalError(null);
    try {
      const token = await requestGoogleCalendarToken();
      setGcalToken(token);
      try { sessionStorage.setItem(GCAL_TOKEN_KEY, token); } catch {}
    } catch (e: any) {
      setGcalError(e.message || "No se pudo conectar con Google Calendar.");
    }
  };

  const { pending: pendingTareaDelete, startDelete: startTareaDelete, undo: undoTareaDelete, dismiss: dismissTareaDelete } = useUndoDelete<any>({
    onDelete: async (id: string) => {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/tasks/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      window.dispatchEvent(new CustomEvent("historial-changed"));
    },
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      expediente: expedienteRef || "",
      expediente_id: expedienteId,
      juzgado: juzgado || "",
      num_proc: numProc || "",
    }));
  }, [expedienteRef, expedienteId, juzgado, numProc]);

  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!initialCreate || autoOpenedRef.current || !clienteId) return;
    autoOpenedRef.current = true;
    setShowForm(true);
    setForm({
      ...TAREA_EMPTY,
      expediente: expedienteRef || "",
      expediente_id: expedienteId,
      juzgado: juzgado || "",
      num_proc: numProc || "",
      tipo: initialType || TAREA_EMPTY.tipo,
    });
  }, [clienteId, expedienteId, expedienteRef, initialCreate, initialType, juzgado, numProc]);

  const estadoStyle: Record<string, string> = {
    pendiente: "bg-amber-100 text-amber-700",
    urgente: "bg-rose-100 text-rose-700",
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
        let createdTask = data.data;

        // Videollamada opcional. La tarea, si tiene fecha límite o de aviso,
        // ya se sincroniza SOLA con un evento de agenda (backend, tabla
        // client_tasks.agenda_event_id) -- en vez de crear un evento nuevo
        // (que quedaría duplicado y sin enlazar con la tarea, así que nunca
        // se vería "unirse a la llamada" en la propia tarea), se reutiliza
        // ese evento ya vinculado: se le pone la hora exacta de la llamada
        // (en vez de quedarse como bloque de "todo el día") y se le añade
        // el Meet. El meet_url resultante se guarda también en la propia
        // tarea para poder mostrar el botón de unirse en la lista.
        if (withMeet && gcalToken && form.plazo) {
          const linkedAgendaId = createdTask.agenda_event_id;
          if (!linkedAgendaId) {
            setGcalError("La tarea se guardó, pero no se pudo enlazar con un evento de agenda para añadirle la videollamada.");
          } else {
            try {
              // Google Calendar exige RFC3339 completo (con zona horaria) en
              // start.dateTime/end.dateTime -- un "2026-07-30T10:00:00" suelto
              // (sin Z ni offset) lo rechaza con 400 Bad Request. new Date(...)
              // interpreta la hora local del navegador y toISOString() la
              // convierte a UTC con el sufijo Z, que sí es válido.
              const startAt = new Date(`${form.plazo}T${meetHora}:00`).toISOString();
              const endAt = new Date(new Date(startAt).getTime() + 3600000).toISOString();
              const existingRes = await fetch(`/api/agenda/${linkedAgendaId}`, { headers: { Authorization: `Bearer ${token}` } });
              const existingData = await safeJson(existingRes);
              const baseEvent = existingRes.ok ? existingData.data : {};
              const googleCreated = await createGoogleMeetEvent(gcalToken, {
                title: form.titulo.trim(), description: form.descripcion || null,
                start_at: startAt, end_at: endAt, guestEmail,
              });
              const meetUrl = googleCreated?.hangoutLink || googleCreated?.conferenceData?.entryPoints?.[0]?.uri || null;
              const putRes = await fetch(`/api/agenda/${linkedAgendaId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  ...baseEvent,
                  start_at: startAt, end_at: endAt, all_day: false, type: "cita", status: "pendiente",
                  source: "manual", external_provider: "google",
                  external_id: googleCreated?.id, external_url: googleCreated?.htmlLink, meet_url: meetUrl,
                }),
              });
              if (putRes.ok && meetUrl) {
                createdTask = { ...createdTask, meet_url: meetUrl };
              }
            } catch (meetErr: any) {
              if (meetErr.message === "GCAL_AUTH_EXPIRED") {
                setGcalToken(null);
                try { sessionStorage.removeItem(GCAL_TOKEN_KEY); } catch {}
                setGcalError("La tarea se guardó, pero tu sesión de Google había caducado y no se pudo crear la videollamada. Conecta de nuevo e inténtalo otra vez.");
              } else {
                setGcalError(`La tarea se guardó, pero no se pudo crear la videollamada: ${meetErr.message || "error desconocido"}.`);
              }
            }
          }
        }

        setTareas((prev) => [createdTask, ...prev]);
        setForm({
          ...TAREA_EMPTY,
          expediente: expedienteRef || "",
          expediente_id: expedienteId,
          juzgado: juzgado || "",
          num_proc: numProc || "",
        });
        setWithMeet(false); setGuestEmail("");
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
    setTareas((prev) => prev.map((x) => x.id === t.id ? { ...x, estado: nuevoEstado } : x));
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/${t.id}/estado`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTareas((prev) => prev.map((x) => x.id === t.id ? { ...x, estado: t.estado } : x));
    }
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

  const confirmDeleteTarea = () => {
    if (!confirmDeleteTareaId) return;
    const taskId = confirmDeleteTareaId;
    const tarea = tareas.find((x) => x.id === taskId);
    if (!tarea) return;
    setConfirmDeleteTareaId(null);
    setTareas((prev) => prev.filter((x) => x.id !== taskId));
    startTareaDelete(taskId, tarea);
  };

  const handleUndoTarea = () => {
    const item = undoTareaDelete();
    if (item) setTareas((prev) => [...prev, item]);
  };

  // Compara solo fechas de calendario (no el instante exacto): así una tarea con
  // vencimiento "hoy" no aparece vencida horas antes de que el día termine.
  const todayYMD = () => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  };
  const isVencida = (t: any) => t.plazo && t.estado !== "completada" && String(t.plazo).slice(0, 10) < todayYMD();
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

  if (loading) return <div className="flex items-center justify-center py-16"><Spinner size="md" muted /></div>;

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
      {locked && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
          <AlertTriangle size={13} className="shrink-0" /> Expediente cerrado — no se pueden añadir ni modificar tareas.
        </div>
      )}
      {/* Persiste aunque el formulario de creación ya se haya cerrado --
          si solo viviera dentro del formulario, se perdía de vista en
          cuanto la tarea se guardaba (el formulario se cierra siempre,
          haya fallado o no la videollamada). */}
      {gcalError && (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          <span>{gcalError}</span>
          <button type="button" onClick={() => setGcalError(null)} className="shrink-0 text-amber-500 hover:text-amber-700"><X size={12} /></button>
        </div>
      )}
      <div className="space-y-2">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 text-xs">
            {(["todas","pendiente","urgente","completada"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg font-semibold capitalize transition-colors ${filter === f ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {f === "todas" ? `Todas (${tareas.length})` : f === "pendiente" ? `Pendientes (${tareas.filter((x) => x.estado === "pendiente").length})` : f === "urgente" ? `Urgentes (${tareas.filter((x) => x.estado === "urgente").length})` : `Completadas (${tareas.filter((x) => x.estado === "completada").length})`}
              </button>
            ))}
          </div>
          {!locked && (
            <button
              onClick={() => { setShowForm((v) => !v); setForm({ ...TAREA_EMPTY, expediente: expedienteRef || "", expediente_id: expedienteId, juzgado: juzgado || "", num_proc: numProc || "" }); }}
              disabled={!clienteId}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl shadow-sm active:scale-95 transition-all disabled:opacity-50"
            >
              <Plus size={15} /> Nueva tarea
            </button>
          )}
        </div>

        {!clienteId && !locked && (
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

          <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center gap-4">
              {gcalToken ? (
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={withMeet} onChange={(e) => setWithMeet(e.target.checked)} className="rounded" disabled={!form.plazo} />
                  <Video size={12} className="text-emerald-600" /> Añadir videollamada (Google Meet)
                </label>
              ) : (
                <button type="button" onClick={connectGcal} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-600 transition-colors">
                  <Video size={12} /> Conectar Google Meet
                </button>
              )}
              {gcalToken && !form.plazo && (
                <span className="text-[11px] text-slate-400">Indica la fecha límite para poder añadir la videollamada ahí.</span>
              )}
            </div>
            {withMeet && form.plazo && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hora de la videollamada</label>
                  <input type="time" value={meetHora} onChange={(e) => setMeetHora(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5 bg-white" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invitar por correo (opcional)</label>
                  <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="correo@ejemplo.com" className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 mt-0.5 bg-white" />
                </div>
              </div>
            )}
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
                    {t.meet_url && (
                      <a href={t.meet_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors">
                        <Video size={10} /> Unirse a videollamada
                      </a>
                    )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDeleteTareaId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 size={18} className="text-red-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Eliminar tarea</h3>
                  <p className="text-sm text-slate-500">Tendrás 15 segundos para deshacer.</p>
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

      {pendingTareaDelete && (
        <UndoToast
          message="Tarea eliminada"
          startedAt={pendingTareaDelete.startedAt}
          onUndo={handleUndoTarea}
          onDismiss={dismissTareaDelete}
        />
      )}
    </div>
  );
}

function TabAdjuntosExpediente({
  expedienteId,
  locked = false,
}: {
  expedienteId: string;
  locked?: boolean;
}) {
  return (
    <div className="space-y-3">
      {locked && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
          <AlertTriangle size={13} className="shrink-0" /> Expediente cerrado — solo lectura. No se pueden subir ni eliminar adjuntos.
        </div>
      )}
      <FilesTabPanel entityId={expedienteId} alwaysShowPreview locked={locked} />
    </div>
  );
}

// ── Helpers locales para ActuacionAdjuntosPanel ─────────────────────────────
function fileIconAct(mime: string, name: string) {
  const n = (name || "").toLowerCase();
  if (mime?.startsWith("image/"))   return { icon: "🖼️", color: "bg-emerald-100 text-emerald-600", label: "Imagen" };
  if (mime === "application/pdf")   return { icon: "📄", color: "bg-red-100 text-red-600",     label: "PDF" };
  if (mime?.includes("word") || n.endsWith(".doc") || n.endsWith(".docx")) return { icon: "📝", color: "bg-blue-100 text-blue-600", label: "Word" };
  if (mime?.includes("excel") || mime?.includes("spreadsheet") || n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")) return { icon: "📊", color: "bg-green-100 text-green-600", label: "Excel" };
  if (mime?.includes("presentation") || n.endsWith(".pptx")) return { icon: "📑", color: "bg-orange-100 text-orange-600", label: "PPT" };
  if (mime?.startsWith("text/"))    return { icon: "📃", color: "bg-slate-100 text-slate-600", label: "Texto" };
  return { icon: "📎", color: "bg-slate-100 text-slate-500", label: "Archivo" };
}
function fmtSizeAct(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function isPrevAct(mime: string) { return mime === "application/pdf" || mime?.startsWith("image/") || mime?.startsWith("text/"); }
function isPdfAct(mime: string, name: string) {
  const n = (name || "").toLowerCase();
  return mime === "application/pdf" || n.endsWith(".pdf");
}
function isWordAct(mime: string, name: string) { const n = (name || "").toLowerCase(); return mime?.includes("word") || mime?.includes("officedocument.wordprocessingml") || n.endsWith(".doc") || n.endsWith(".docx"); }
function isExcelAct(mime: string, name: string) { const n = (name || "").toLowerCase(); return mime?.includes("excel") || mime?.includes("spreadsheetml") || n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv"); }
function openMailDraft(subject: string, body?: string, extra?: { to?: string; expediente_id?: string; open_templates?: boolean; open_attachments?: boolean }) {
  const params = new URLSearchParams({ compose: '1', subject });
  if (body?.trim()) params.set("body", body);
  if (extra?.to) params.set("to", extra.to);
  if (extra?.expediente_id) params.set("expediente_id", extra.expediente_id);
  if (extra?.open_templates) params.set("open_templates", "1");
  if (extra?.open_attachments) params.set("open_attachments", "1");
  window.location.href = `/dashboard/correo?${params.toString()}`;
}

function MailDropdownBtn({
  mainLabel,
  mainIcon: MainIcon,
  onMain,
  mailSubject,
  mailBody,
  mailTo,
  expedienteId,
  disabled,
  size = "sm",
  variant = "outline",
}: {
  mainLabel: string;
  mainIcon: any;
  onMain: () => void;
  mailSubject: string;
  mailBody?: string;
  mailTo?: string;
  expedienteId?: string;
  disabled?: boolean;
  size?: "xs" | "sm";
  variant?: "outline" | "primary";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const send = (opts?: { open_templates?: boolean; open_attachments?: boolean }) => {
    setOpen(false);
    openMailDraft(mailSubject, mailBody, { to: mailTo, expediente_id: expedienteId, ...opts });
  };

  const isXs = size === "xs";
  const isPrimary = variant === "primary";
  const mainCls = isPrimary
    ? "text-white bg-red-600 hover:bg-red-700 border-red-600"
    : "text-slate-600 bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300";
  const chevCls = isPrimary
    ? "text-white bg-red-600 hover:bg-red-700 border-red-600 border-l-red-500"
    : "text-slate-500 bg-white hover:bg-slate-100 border-slate-200";

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => { onMain(); setOpen(false); }}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 ${isXs ? "px-3 py-1.5 text-xs" : "px-3 py-2 text-xs"} ${isPrimary ? "font-bold" : "font-semibold"} ${mainCls} border ${isXs ? "rounded-l-lg" : "rounded-l-xl"} transition-colors disabled:opacity-50`}
      >
        <MainIcon size={isXs ? 12 : 13} /> {mainLabel}
      </button>
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={`inline-flex items-center ${isXs ? "px-1.5 py-1.5" : "px-1.5 py-2"} ${chevCls} border border-l-0 ${isXs ? "rounded-r-lg" : "rounded-r-xl"} transition-colors disabled:opacity-50`}
      >
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[9999] mt-1.5 min-w-[210px] rounded-2xl border border-slate-200 bg-white py-1.5 shadow-2xl shadow-slate-300/40">
          <button type="button" onClick={() => send()}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700">
            <Mail size={12} className="shrink-0 text-slate-400" /> Enviar correo
          </button>
          <div className="my-1 h-px bg-slate-100" />
          <button type="button" onClick={() => send({ open_templates: true })}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700">
            <Sparkles size={12} className="shrink-0 text-slate-400" /> Con Plantilla
          </button>
          <button type="button" onClick={() => send({ open_attachments: true })}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700">
            <Paperclip size={12} className="shrink-0 text-slate-400" /> Con Adjuntos
          </button>
          <button type="button" onClick={() => send({ open_templates: true, open_attachments: true })}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-red-50 hover:text-red-700">
            <Mail size={12} className="shrink-0 text-slate-400" /> Con Plantilla y Adjuntos
          </button>
        </div>
      )}
    </div>
  );
}

function launchOfficeUrl(url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function encodeVantiaPayload(payload: unknown) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function ActuacionAdjuntosPanel({ taskId, locked = false }: { taskId: string; locked?: boolean }) {
  const { getToken } = useAuth();
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteFileId, setConfirmDeleteFileId] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState<any | null>(null);

  const { pending: pendingFileDelete, startDelete: startFileDelete, undo: undoFileDelete, dismiss: dismissFileDelete } = useUndoDelete<any>({
    onDelete: async (id: string) => {
      const token = await getToken({ skipCache: true });
      await fetch(`/api/tasks/${taskId}/files/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    },
  });
  const [editDocName, setEditDocName] = useState("");
  const [editAttachmentType, setEditAttachmentType] = useState("Sin clasificar");
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [docPlantFolders, setDocPlantFolders] = useState<{ name: string; files: { name: string; path: string; ext: string }[] }[]>([]);
  const [docPlantLoading, setDocPlantLoading] = useState(false);
  const [selectedTpl, setSelectedTpl] = useState<{ path: string; name: string; ext: string } | null>(null);
  const [query, setQuery] = useState("");
  // Preview
  const [preview, setPreview] = useState<{ url: string; name: string; mime: string; fileId: string } | null>(null);
  const [pdfOpenMenu, setPdfOpenMenu] = useState<{ file: any; x: number; y: number } | null>(null);
  const [openingMessage, setOpeningMessage] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const loadingThumbIds = useRef<Set<string>>(new Set());
  const previewCache = useRef<Map<string, { url: string; name: string; mime: string; fileId: string }>>(new Map());
  const openUrlCache = useRef<Map<string, string>>(new Map());
  const pendingUploadFile = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const openingMessageTimer = useRef<number | null>(null);
  const [pasteToastAct, setPasteToastAct] = useState<string | null>(null);
  const pasteToastActTimer = useRef<number | null>(null);

  const showPasteToastAct = useCallback((msg: string) => {
    setPasteToastAct(msg);
    if (pasteToastActTimer.current) window.clearTimeout(pasteToastActTimer.current);
    pasteToastActTimer.current = window.setTimeout(() => setPasteToastAct(null), 3000);
  }, []);

  const copyActFileToClipboard = useCallback(async (file: any) => {
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/${taskId}/files/${file.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      if (file.mimetype?.startsWith("image/") && typeof ClipboardItem !== "undefined") {
        try { await navigator.clipboard.write([new ClipboardItem({ [file.mimetype]: blob })]); } catch (_) {}
      }
      setErpClipboard({ blob, name: file.original_name, type: file.mimetype || "application/octet-stream" });
      showPasteToastAct(`📋 Copiado: ${file.original_name}`);
    } catch (_) {}
  }, [taskId, getToken, showPasteToastAct]);

  // ref para el handler de paste (se actualiza en cada render con las funciones correctas)
  const pasteActHandlerRef = useRef<((files: File[]) => void) | null>(null);

  useEffect(() => {
    return () => {
      for (const entry of previewCache.current.values()) {
        if (entry.url?.startsWith("blob:")) try { URL.revokeObjectURL(entry.url); } catch (_) {}
      }
      previewCache.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!pdfOpenMenu) return;
    const closeMenu = () => setPdfOpenMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPdfOpenMenu(null);
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pdfOpenMenu]);

  const showOpeningMessage = useCallback((message: string) => {
    setOpeningMessage(message);
    if (openingMessageTimer.current) window.clearTimeout(openingMessageTimer.current);
    openingMessageTimer.current = window.setTimeout(() => {
      setOpeningMessage(null);
      openingMessageTimer.current = null;
    }, 4000);
  }, []);

  const loadFiles = useCallback(async (silent = false) => {
    try {
      if (!silent) { setLoading(true); setError(null); }
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/${taskId}/files`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok) {
        const fileList = data.data || [];
        setFiles(fileList);
        fileList.forEach((file: any) => {
          if (!file?.open_token) return;
          const resolved = resolveApiUrl(`/api/tasks/files/dl/${file.open_token}`);
          const absoluteUrl = /^https?:\/\//i.test(resolved) ? resolved : `${window.location.origin}${resolved}`;
          openUrlCache.current.set(file.id, absoluteUrl);
        });
      }
      else if (!silent) setError(data?.error || "No se pudieron cargar los adjuntos.");
    } finally { if (!silent) setLoading(false); }
  }, [getToken, taskId]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const uploadFiles = useCallback(async (fileList: File[] | FileList | null, metadata?: { document_name?: string | null; attachment_type?: string }) => {
    if (!fileList || !Array.from(fileList).length) return;
    setUploading(true); setError(null);
    try {
      const token = await getToken({ skipCache: true });
      const fd = new FormData();
      Array.from(fileList).forEach((file) => fd.append("files", file));
      const res = await fetch(`/api/tasks/${taskId}/files`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const data = await safeJson(res);
      if (!res.ok) { setError(data?.error || "No se pudieron subir los adjuntos."); return; }
      if (metadata && Array.isArray(data?.data)) {
        await Promise.all(data.data.map((item: any) =>
          fetch(`/api/tasks/${taskId}/files/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(metadata) })
        ));
      }
      await loadFiles();
    } finally { setUploading(false); }
  }, [getToken, loadFiles, taskId]);

  const loadThumb = useCallback(async (fileId: string) => {
    if (loadingThumbIds.current.has(fileId)) return;
    loadingThumbIds.current.add(fileId);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/${taskId}/files/${fileId}/download`, { headers: { Authorization: `Bearer ${token}` } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setThumbs((prev) => ({ ...prev, [fileId]: url }));
    } catch (_) { loadingThumbIds.current.delete(fileId); }
  }, [getToken, taskId]);

  const openWithApp = useCallback(async (file: any) => {
    const ext = (file.original_name || '').split('.').pop()?.toLowerCase() ?? '';
    const wordExts = ['doc','docx','odt','rtf','dot','dotx'];
    const excelExts = ['xls','xlsx','xlsm','xlsb','ods','csv'];
    const pptExts = ['ppt','pptx','odp'];
    const isOffice = wordExts.includes(ext) || excelExts.includes(ext) || pptExts.includes(ext);

    if (isOffice) {
      const tempUrl = openUrlCache.current.get(file.id);
      openUrlCache.current.delete(file.id);
      void loadFiles(true);

      if (tempUrl) {
        const b64 = encodeVantiaPayload({
          url: tempUrl,
          syncUrl: `${tempUrl}/sync`,
          name: file.original_name || `documento.${ext || 'bin'}`,
        });
        window.location.href = `vantia:${b64}`;
        return;
      }
    }

    const token = await getToken({ skipCache: true });
    const res = await fetch(`/api/tasks/${taskId}/files/${file.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.original_name || "archivo";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [getToken, loadFiles, taskId]);

  const getTempOpenUrl = useCallback(async (fileId: string) => {
    const cached = openUrlCache.current.get(fileId);
    if (cached) return cached;

    const token = await getToken({ skipCache: true });
    const res = await fetch(`/api/tasks/${taskId}/files/${fileId}/temp-token`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await safeJson(res);
    if (!res.ok || !data?.token) {
      throw new Error(data?.error || "No se pudo generar el acceso temporal.");
    }

    const resolved = resolveApiUrl(`/api/tasks/files/dl/${data.token}`);
    const absoluteUrl = /^https?:\/\//i.test(resolved) ? resolved : `${window.location.origin}${resolved}`;
    openUrlCache.current.set(fileId, absoluteUrl);
    return absoluteUrl;
  }, [getToken, taskId]);

  const openPdfInBrowser = useCallback(async (file: any) => {
    try {
      showOpeningMessage("Abriendo con navegador...");
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/${taskId}/files/${file.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.error || "No se pudo abrir el PDF en el navegador.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (_) {
      setOpeningMessage(null);
      setError("No se pudo abrir el PDF en el navegador.");
    }
  }, [getToken, taskId, showOpeningMessage]);

  const openPdfWithPdfStudio = useCallback(async (file: any) => {
    try {
      showOpeningMessage("Abriendo con PDF Studio...");
      const tempUrl = await getTempOpenUrl(file.id);
      const b64 = encodeVantiaPayload({
        url: tempUrl,
        syncUrl: `${tempUrl}/sync`,
        name: file.original_name || "documento.pdf",
        preferredApp: "pdfstudio",
      });
      window.location.href = `vantia:${b64}`;
    } catch (error: any) {
      setOpeningMessage(null);
      setError(error?.message || "No se pudo abrir el PDF en PDF Studio.");
    }
  }, [getTempOpenUrl, showOpeningMessage]);

  const showPdfOpenMenu = useCallback((event: React.MouseEvent, file: any) => {
    event.preventDefault();
    event.stopPropagation();
    setPdfOpenMenu({ file, x: event.clientX, y: event.clientY });
  }, []);

  const openPreview = useCallback(async (file: any) => {
    const cached = previewCache.current.get(file.id);
    if (cached) { setPreview(cached); return; }
    try {
      const token = await getToken({ skipCache: true });
      const isWord = isWordAct(file.mimetype || "", file.original_name || "");
      const isExcel = isExcelAct(file.mimetype || "", file.original_name || "");
      const isDirectPreview = isPrevAct(file.mimetype || "");
      const previewEndpoint = isWord
        ? `/api/tasks/${taskId}/files/${file.id}/preview-pdf`
        : isExcel
          ? `/api/tasks/${taskId}/files/${file.id}/preview-excel`
          : isDirectPreview
            ? `/api/tasks/${taskId}/files/${file.id}/download`
            : null;
      if (!previewEndpoint) {
        setError("Este tipo de archivo no tiene vista previa en la actuación. Usa el botón de descarga si lo necesitas.");
        return;
      }
      let res = await fetch(previewEndpoint, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok && isWord) {
        res = await fetch(`/api/tasks/${taskId}/files/${file.id}/preview-html`, { headers: { Authorization: `Bearer ${token}` } });
      }
      if (!res.ok) {
        setError("No se pudo generar la vista previa de este adjunto.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const mime = isWord
        ? (res.headers.get("content-type")?.includes("pdf") ? "application/pdf" : "text/html")
        : isExcel
          ? "text/html"
          : (file.mimetype || res.headers.get("content-type") || "");
      const entry = { url, name: file.original_name, mime, fileId: file.id };
      previewCache.current.set(file.id, entry);
      setPreview(entry);
    } catch (_) {}
  }, [getToken, taskId]);

  const handleDownload = async (fileId: string, fileName: string) => {
    const token = await getToken({ skipCache: true });
    const res = await fetch(`/api/tasks/${taskId}/files/${fileId}/download`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const handlePrimaryOpen = useCallback((file: any) => {
    if (isWordAct(file.mimetype || "", file.original_name || "") || isExcelAct(file.mimetype || "", file.original_name || "")) {
      void openWithApp(file);
      return;
    }
    void openPreview(file);
  }, [openPreview, openWithApp]);

  const isPreviewSourcePdf = useCallback((fileId?: string) => {
    if (!fileId) return false;
    const sourceFile = files.find((item) => item.id === fileId);
    return !!sourceFile && isPdfAct(sourceFile.mimetype || "", sourceFile.original_name || "");
  }, [files]);

  const handlePreviewOpen = useCallback((event: React.MouseEvent | null, fileId: string, fileName: string) => {
    const sourceFile = files.find((item) => item.id === fileId);
    if (sourceFile && isPdfAct(sourceFile.mimetype || "", sourceFile.original_name || "") && event) {
      showPdfOpenMenu(event, sourceFile);
      return;
    }
    if (sourceFile) {
      if (isWordAct(sourceFile.mimetype || "", sourceFile.original_name || "") || isExcelAct(sourceFile.mimetype || "", sourceFile.original_name || "")) {
        void openWithApp(sourceFile);
        return;
      }
      if (sourceFile.mimetype?.startsWith("image/") || sourceFile.mimetype?.startsWith("text/")) {
        void handleDownload(fileId, fileName);
        return;
      }
    }
    void handleDownload(fileId, fileName);
  }, [files, handleDownload, openWithApp, showPdfOpenMenu]);

  const openMetadataForUpload = (file: File) => {
    pendingUploadFile.current = file;
    setEditDocName(file.name.replace(/\.[^/.]+$/, ""));
    setEditAttachmentType("Sin clasificar");
    setEditingFile({ id: "PENDING_UPLOAD", original_name: file.name });
  };

  const handleSingleUpload = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (file) openMetadataForUpload(file);
  };

  const handleFolderImport = (fileList: FileList | null) => {
    if (fileList?.length) uploadFiles(fileList);
  };

  // Actualizar el ref en cada render con las funciones correctas
  pasteActHandlerRef.current = (pasted: File[]) => {
    if (locked) return;
    showPasteToastAct(`Pegando ${pasted.length} archivo${pasted.length > 1 ? "s" : ""}…`);
    if (pasted.length === 1) openMetadataForUpload(pasted[0]);
    else handleFolderImport(pasted as unknown as FileList);
  };

  // Hook de pegado — usa el ref para siempre tener las últimas funciones
  // eslint-disable-next-line react-hooks/exhaustive-deps
  usePasteFiles(useCallback((files: File[]) => pasteActHandlerRef.current?.(files), []), !locked);

  const handleSaveMetadata = async () => {
    if (!editingFile) return;
    if (editingFile.id === "PENDING_UPLOAD") {
      const file = pendingUploadFile.current;
      if (!file) return;
      await uploadFiles([file], { document_name: editDocName.trim() || null, attachment_type: editAttachmentType });
      pendingUploadFile.current = null;
      setEditingFile(null);
      return;
    }
    const token = await getToken({ skipCache: true });
    const res = await fetch(`/api/tasks/${taskId}/files/${editingFile.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ document_name: editDocName.trim() || null, attachment_type: editAttachmentType }),
    });
    const data = await safeJson(res);
    if (res.ok) {
      setFiles((prev) => prev.map((item) => item.id === editingFile.id ? data.data : item));
      setEditingFile(null);
    } else { setError(data?.error || "No se pudo actualizar el adjunto."); }
  };

  const handleDelete = (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    setConfirmDeleteFileId(null);
    setFiles((prev) => prev.filter((item) => item.id !== fileId));
    if (preview?.fileId === fileId) setPreview(null);
    startFileDelete(fileId, file);
  };

  const handleUndoFile = () => {
    const item = undoFileDelete();
    if (item) setFiles((prev) => [...prev, item]);
  };

  const loadTemplates = useCallback(async () => {
    setDocPlantLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/files/templates", { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok) setDocPlantFolders(data.data || []);
      else setError(data?.error || "No se pudieron cargar las plantillas.");
    } finally { setDocPlantLoading(false); }
  }, [getToken]);

  const attachTemplate = async () => {
    if (!selectedTpl) return;
    setUploading(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/templates/download?path=${encodeURIComponent(selectedTpl.path)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      const file = new File([blob], selectedTpl.name, { type: blob.type || "application/octet-stream" });
      await uploadFiles([file], { document_name: selectedTpl.name.replace(/\.[^/.]+$/, ""), attachment_type: "Sin clasificar" });
      setShowTemplates(false); setSelectedTpl(null);
    } finally { setUploading(false); }
  };

  const createBlankDocument = async () => {
    setUploading(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/files/templates/blank.docx", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      const file = new File([blob], `Nueva actuacion ${new Date().toLocaleDateString("es-ES").replace(/\//g, "-")}.docx`, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      openMetadataForUpload(file);
    } finally { setUploading(false); }
  };

  const filteredFolders = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return docPlantFolders;
    return docPlantFolders.map((folder) => ({ ...folder, files: folder.files.filter((f) => f.name.toLowerCase().includes(q)) })).filter((folder) => folder.files.length > 0);
  }, [docPlantFolders, templateSearch]);

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter((file) =>
      [file.original_name, file.document_name, file.attachment_type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [files, query]);

  const _mailActiveFile = preview ? files.find((item) => item.id === preview.fileId) : null;
  const _mailSubjectAct = _mailActiveFile
    ? `Adjunto de actuación: ${_mailActiveFile.document_name || _mailActiveFile.original_name}`
    : "Adjuntos de la actuación";
  const _mailBodyAct = _mailActiveFile
    ? `Hola,\n\nTe escribo en relación con el adjunto "${_mailActiveFile.document_name || _mailActiveFile.original_name}" asociado a esta actuación.\n\nTipo: ${_mailActiveFile.attachment_type || "Sin clasificar"}\nFecha: ${_mailActiveFile.created_at ? new Date(_mailActiveFile.created_at).toLocaleDateString("es-ES") : "Sin fecha"}\n\nRevisa el expediente para consultar o compartir el archivo correspondiente.`
    : "Hola,\n\nTe escribo en relación con los adjuntos asociados a esta actuación.\n\nPuedes revisar los documentos directamente desde el expediente en el ERP.";

  return (
    <div className="space-y-4">
      {/* Toast de pegado */}
      {pasteToastAct && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800">
          <ClipboardPaste size={13} className="shrink-0" /> {pasteToastAct}
        </div>
      )}
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-400">{uploading ? "Subiendo..." : `${files.length} archivo${files.length !== 1 ? "s" : ""}`}</span>
          <div className="relative min-w-[250px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar adjuntos..."
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-red-400"
            />
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <MailDropdownBtn
            mainLabel="Enviar correo"
            mainIcon={Mail}
            onMain={() => openMailDraft(_mailSubjectAct, _mailBodyAct)}
            mailSubject={_mailSubjectAct}
            mailBody={_mailBodyAct}
            size="xs"
          />
          {!locked && (
            <>
              <button type="button" onClick={() => folderInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-colors">
                <FolderOpen size={12} /> Importar carpeta
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-colors">
                <Upload size={12} /> Subir archivo
              </button>
              <button type="button" onClick={createBlankDocument} disabled={uploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 rounded-lg transition-colors disabled:opacity-50">
                <FilePlus2 size={12} /> Nuevo documento
              </button>
              <button type="button"
                onClick={() => { setShowTemplates(true); if (!docPlantFolders.length) void loadTemplates(); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
                <Sparkles size={12} /> Usar plantilla
              </button>
            </>
          )}
        </div>
        <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { handleSingleUpload(e.target.files); e.currentTarget.value = ""; }} />
        <input ref={folderInputRef} type="file" multiple {...({ webkitdirectory: "", directory: "" } as any)} className="hidden" onChange={(e) => { handleFolderImport(e.target.files); e.currentTarget.value = ""; }} />
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      {/* Lista + Preview */}
      <div className="hidden">
        {/* File list */}
        <div
          className={`${preview ? "w-[48%] shrink-0" : "w-full"} overflow-y-auto transition-all duration-300`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFolderImport(e.dataTransfer.files); }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner size="sm" muted label="Cargando adjuntos..." />
            </div>
          ) : files.length === 0 ? (
            <div className={`m-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${isDragOver ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50/60"}`}>
              <Upload size={22} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">Arrastra archivos aqui</p>
              <p className="mt-1 text-xs text-slate-400">PDF, Word, Excel, imagenes — max. 50 MB</p>
              {!locked && <p className="mt-1 text-[10px] text-slate-300 flex items-center justify-center gap-1"><ClipboardPaste size={10} /> Ctrl+V para pegar</p>}
            </div>
          ) : (
            <table className={`w-full text-left transition-colors ${isDragOver ? "ring-2 ring-inset ring-red-300" : ""}`}>
              <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Archivo</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Documento</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tam.</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredFiles.map((file) => {
                  const fi = fileIconAct(file.mimetype, file.original_name);
                  const canPrev = isPrevAct(file.mimetype);
                  const canWord = isWordAct(file.mimetype, file.original_name);
                  const canExcel = isExcelAct(file.mimetype, file.original_name);
                  const isPdf = isPdfAct(file.mimetype, file.original_name);
                  const isActive = preview?.fileId === file.id;
                  return (
                    <tr key={file.id} className={`hover:bg-slate-50/70 transition-colors group ${isActive ? "bg-red-50/40" : ""}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {file.mimetype?.startsWith("image/") && thumbs[file.id] ? (
                            <img src={thumbs[file.id]} alt="" className="h-8 w-8 rounded object-cover shrink-0 cursor-pointer hover:scale-105 transition-transform" onClick={() => handlePrimaryOpen(file)} />
                          ) : (
                            <span
                              className={`h-8 w-8 rounded flex items-center justify-center text-sm shrink-0 ${fi.color} cursor-pointer`}
                              onClick={(event) => {
                                if (file.mimetype?.startsWith("image/")) loadThumb(file.id);
                                else if (isPdf) showPdfOpenMenu(event, file);
                                else if (canPrev || canWord || canExcel) handlePrimaryOpen(file);
                              }}
                            >
                              {fi.icon}
                            </span>
                          )}
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={isPdf ? (event) => showPdfOpenMenu(event, file) : () => { if (canPrev || canWord || canExcel) handlePrimaryOpen(file); }}
                              className={`text-xs font-medium text-slate-700 text-left truncate block max-w-[140px] ${(canPrev || canWord || canExcel) ? "hover:text-red-600 cursor-pointer" : "cursor-default"}`}
                              title={file.original_name}
                            >
                              {file.original_name}
                            </button>
                            <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${fi.color}`}>{fi.label}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-slate-500 truncate block max-w-[180px]" title={file.document_name || file.original_name}>
                          {file.document_name || file.original_name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold ${file.attachment_type === "Sin clasificar" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-600"}`}>
                          {file.attachment_type || "Sin clasificar"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{fmtSizeAct(Number(file.size_bytes))}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{file.created_at ? new Date(file.created_at).toLocaleDateString("es-ES") : "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {(canPrev || canWord || canExcel) && (
                              <button type="button" onClick={() => openPreview(file)} title="Vista previa"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <Eye size={13} />
                            </button>
                          )}
                          <button type="button" onClick={() => handleDownload(file.id, file.original_name)} title="Descargar"
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                            <Download size={13} />
                          </button>
                          <button type="button" onClick={() => copyActFileToClipboard(file)} title="Copiar al portapapeles"
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Copy size={13} />
                          </button>
                          {!locked && (<>
                          <button type="button"
                            onClick={() => { setEditDocName(file.document_name || file.original_name); setEditAttachmentType(file.attachment_type || "Sin clasificar"); setEditingFile(file); }}
                            title="Editar"
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                            <Edit3 size={13} />
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteFileId(file.id)} title="Eliminar"
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={13} />
                          </button>
                          </>)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Preview panel */}
        {preview && (
          <div className="flex-1 border-l border-slate-100 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base shrink-0">
                  {preview.mime === "application/pdf" ? "📄" : preview.mime.startsWith("image/") ? "🖼️" : "📝"}
                </span>
                <p className="text-xs font-semibold text-slate-700 truncate" title={preview.name}>{preview.name}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={(event) => handlePreviewOpen(event, preview.fileId, preview.name)} title={isPreviewSourcePdf(preview.fileId) ? "Opciones de apertura" : "Abrir"}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors">
                  <span className="flex items-center gap-1"><ExternalLink size={13} />{isPreviewSourcePdf(preview.fileId) && <ChevronDown size={11} />}</span>
                </button>
                <button type="button" onClick={() => setPreview(null)} title="Cerrar"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors">
                  <X size={13} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-slate-100">
              {preview.mime === "application/pdf" ? (
                <iframe src={preview.url} className="w-full h-full border-0" title={preview.name} />
              ) : preview.mime.startsWith("image/") ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img src={preview.url} alt={preview.name} className="max-w-full max-h-full object-contain rounded-xl shadow-md" />
                </div>
              ) : preview.mime.startsWith("text/") ? (
                <iframe src={preview.url} className="w-full h-full border-0 bg-white" title={preview.name} />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <span className="text-5xl mb-4">📎</span>
                  <p className="text-sm font-semibold text-slate-700">{preview.name}</p>
                  <p className="mt-1 text-xs text-slate-400">Vista previa no disponible para este tipo de archivo</p>
                  <button type="button" onClick={(event) => handlePreviewOpen(event, preview.fileId, preview.name)}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl">
                    <ExternalLink size={12} /> Abrir
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!locked && (
      <div
        className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${isDragOver ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50/60"}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFolderImport(e.dataTransfer.files); }}
      >
        <Upload size={24} className="mx-auto mb-3 text-slate-300" />
        <p className="text-sm font-semibold text-slate-700">Arrastra archivos o carpetas aquí</p>
        <p className="mt-1 text-xs text-slate-400">PDF, Word, Excel, imágenes. Máx. 50 MB por archivo.</p>
      </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="sm" muted label="Cargando adjuntos..." />
          </div>
        ) : files.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Paperclip size={26} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No hay adjuntos en esta actuación</p>
            <p className="mt-1 text-xs text-slate-400">Sube archivos, importa una carpeta o usa una plantilla para completar la actuación.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Archivo</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Documento</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tam.</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredFiles.map((file) => {
                    const fi = fileIconAct(file.mimetype, file.original_name);
                    const canPrev = isPrevAct(file.mimetype);
                    const canWord = isWordAct(file.mimetype, file.original_name);
                    const canExcel = isExcelAct(file.mimetype, file.original_name);
                    const isPdf = isPdfAct(file.mimetype, file.original_name);
                    const isActive = preview?.fileId === file.id;
                    return (
                      <tr key={file.id} className={`group transition-colors ${isActive ? "bg-red-50/50" : "hover:bg-slate-50/70"}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {file.mimetype?.startsWith("image/") && thumbs[file.id] ? (
                              <img src={thumbs[file.id]} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0 cursor-pointer hover:scale-105 transition-transform" onClick={() => handlePrimaryOpen(file)} />
                            ) : (
                              <button type="button" className={`h-10 w-10 rounded-xl flex items-center justify-center text-sm shrink-0 ${fi.color}`} onClick={isPdf ? (event) => showPdfOpenMenu(event, file) : () => { if (file.mimetype?.startsWith("image/")) loadThumb(file.id); else if (canPrev || canWord || canExcel) handlePrimaryOpen(file); }}>
                                {fi.icon}
                              </button>
                            )}
                            <div className="min-w-0">
                              <button
                                type="button"
                                onClick={isPdf ? (event) => showPdfOpenMenu(event, file) : () => { if (canPrev || canWord || canExcel) handlePrimaryOpen(file); }}
                                className={`text-sm font-semibold text-slate-800 text-left truncate block max-w-[260px] ${(canPrev || canWord || canExcel) ? "hover:text-red-600" : ""}`}
                                title={file.original_name}
                              >
                                {file.original_name}
                              </button>
                              <span className={`mt-1 inline-flex text-[10px] font-bold px-1.5 py-0.5 rounded ${fi.color}`}>{fi.label}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-600 truncate block max-w-[240px]" title={file.document_name || file.original_name}>
                            {file.document_name || file.original_name}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded-full text-[10px] font-bold ${file.attachment_type === "Sin clasificar" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-600"}`}>
                            {file.attachment_type || "Sin clasificar"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">{fmtSizeAct(Number(file.size_bytes))}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{file.created_at ? new Date(file.created_at).toLocaleDateString("es-ES") : "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {(canPrev || canWord || canExcel) && (
                              <button type="button" onClick={() => openPreview(file)} title="Vista previa" className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <Eye size={14} />
                              </button>
                            )}
                            <button type="button" onClick={() => handleDownload(file.id, file.original_name)} title="Descargar" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                              <Download size={14} />
                            </button>
                            <button type="button" onClick={() => { setEditDocName(file.document_name || file.original_name); setEditAttachmentType(file.attachment_type || "Sin clasificar"); setEditingFile(file); }} title="Editar" className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                              <Edit3 size={14} />
                            </button>
                            <button type="button" onClick={() => setConfirmDeleteFileId(file.id)} title="Eliminar" className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
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

            {preview && (
              <div className="border-t border-slate-100 bg-slate-50/60">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vista previa</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800 truncate" title={preview.name}>{preview.name}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={(event) => handlePreviewOpen(event, preview.fileId, preview.name)} className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 rounded-xl border border-slate-200 hover:bg-white">
                      <ExternalLink size={12} /> Abrir {isPreviewSourcePdf(preview.fileId) && <ChevronDown size={11} />}
                    </button>
                    <button type="button" onClick={() => setPreview(null)} className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-600 rounded-xl border border-slate-200 hover:bg-white">
                      <X size={12} /> Cerrar
                    </button>
                  </div>
                </div>
                <div className="h-[560px] overflow-hidden bg-slate-100">
                  {preview.mime === "application/pdf" ? (
                    <iframe src={preview.url} className="w-full h-full border-0" title={preview.name} />
                  ) : preview.mime.startsWith("image/") ? (
                    <div className="w-full h-full flex items-center justify-center p-5">
                      <img src={preview.url} alt={preview.name} className="max-w-full max-h-full object-contain rounded-xl shadow-md" />
                    </div>
                  ) : preview.mime.startsWith("text/") ? (
                    <iframe src={preview.url} className="w-full h-full border-0 bg-white" title={preview.name} />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center px-6">
                      <span className="text-5xl mb-4">📎</span>
                      <p className="text-sm font-semibold text-slate-700">{preview.name}</p>
                      <p className="mt-1 text-xs text-slate-400">Vista previa no disponible para este tipo de archivo</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {openingMessage && (
        <div className="fixed right-5 top-5 z-[171] rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-2xl">
          {openingMessage}
        </div>
      )}

      {pdfOpenMenu && typeof document !== "undefined" && createPortal(
        <div
          className="fixed z-[170] min-w-[220px] rounded-xl border border-slate-200 bg-white p-1 shadow-2xl"
          style={{ left: Math.min(pdfOpenMenu.x, window.innerWidth - 236), top: Math.min(pdfOpenMenu.y + 8, window.innerHeight - 120) }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              void openPdfInBrowser(pdfOpenMenu.file);
              setPdfOpenMenu(null);
            }}
            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            Abrir en navegador
          </button>
          <button
            onClick={() => {
              void openPdfWithPdfStudio(pdfOpenMenu.file);
              setPdfOpenMenu(null);
            }}
            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            Abrir con PDF Studio
          </button>
        </div>,
        document.body
      )}

      {/* Modal editar metadatos */}
      {editingFile && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-transparent p-4" onClick={() => setEditingFile(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h4 className="text-base font-bold text-slate-900">{editingFile.id === "PENDING_UPLOAD" ? "Preparar adjunto" : "Editar adjunto"}</h4>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nombre del documento</label>
                <input value={editDocName} onChange={(e) => setEditDocName(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo de adjunto</label>
                <select value={editAttachmentType} onChange={(e) => setEditAttachmentType(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 bg-white">
                  <option value="Sin clasificar">Sin clasificar</option>
                  <option value="AUTO">AUTO</option>
                  <option value="ESCRITO PROCESAL">ESCRITO PROCESAL</option>
                  <option value="FACTURAS">FACTURAS</option>
                  <option value="PODER">PODER</option>
                  <option value="EVIDENCIA">EVIDENCIA</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 pb-5">
              <button type="button" onClick={() => setEditingFile(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={handleSaveMetadata} className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl">Guardar</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal plantillas */}
      {showTemplates && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[155] flex items-center justify-center bg-transparent p-4" onClick={() => setShowTemplates(false)}>
          <div className="w-full max-w-5xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.22em]">Plantillas del despacho</p>
                <h4 className="mt-1 text-lg font-bold text-slate-900">Usar plantilla en esta actuacion</h4>
              </div>
              <button type="button" onClick={() => setShowTemplates(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-[320px_1fr] min-h-[480px]">
              <div className="border-r border-slate-100 p-4 space-y-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)} placeholder="Buscar plantilla..." className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
                </div>
                <div className="max-h-[380px] overflow-y-auto rounded-2xl border border-slate-200">
                  {docPlantLoading ? (
                    <div className="p-6 text-sm text-slate-400">Cargando plantillas...</div>
                  ) : filteredFolders.length === 0 ? (
                    <div className="p-6 text-sm text-slate-400">No se encontraron plantillas.</div>
                  ) : filteredFolders.map((folder) => (
                    <div key={folder.name} className="border-b border-slate-100 last:border-b-0">
                      <div className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-50">{folder.name}</div>
                      <div className="divide-y divide-slate-100">
                        {folder.files.map((file) => (
                          <button key={file.path} type="button" onClick={() => setSelectedTpl(file)}
                            className={`w-full px-4 py-3 text-left text-sm transition-colors ${selectedTpl?.path === file.path ? "bg-red-50 text-red-700" : "hover:bg-slate-50 text-slate-700"}`}>
                            {file.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-6 flex flex-col">
                <div className="flex-1 rounded-2xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-center px-8">
                  {selectedTpl ? (
                    <div>
                      <Sparkles size={22} className="mx-auto mb-3 text-red-300" />
                      <p className="text-sm font-semibold text-slate-700">{selectedTpl.name}</p>
                      <p className="mt-1 text-xs text-slate-400">Se anadira como adjunto propio de esta actuacion.</p>
                    </div>
                  ) : (
                    <div>
                      <Sparkles size={22} className="mx-auto mb-3 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-700">Selecciona una plantilla</p>
                      <p className="mt-1 text-xs text-slate-400">Eligela en el panel izquierdo para adjuntarla a la actuacion.</p>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <button type="button" onClick={() => setShowTemplates(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50">Cancelar</button>
                  <button type="button" onClick={attachTemplate} disabled={!selectedTpl || uploading} className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl">Usar plantilla</button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {confirmDeleteFileId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-transparent">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-xl shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">¿Eliminar archivo adjunto?</h3>
                <p className="text-xs text-slate-500 mt-1">Tendrás 15 segundos para deshacer.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeleteFileId(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button onClick={() => handleDelete(confirmDeleteFileId!)} className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg active:scale-95">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {pendingFileDelete && (
        <UndoToast
          message="Archivo eliminado"
          startedAt={pendingFileDelete.startedAt}
          onUndo={handleUndoFile}
          onDismiss={dismissFileDelete}
        />
      )}
    </div>
  );
}

function ActuacionModal({
  open,
  onClose,
  onSave,
  saving,
  clienteId,
  expedienteId,
  clienteEmail,
  form,
  setForm,
  selectedActuacion,
  getToken,
  locked = false,
}: {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  clienteId?: string | null;
  expedienteId?: string | null;
  clienteEmail?: string | null;
  form: TareaForm;
  setForm: React.Dispatch<React.SetStateAction<TareaForm>>;
  selectedActuacion: any | null;
  getToken: any;
  locked?: boolean;
}) {
  if (!open || typeof document === "undefined") return null;

  const mailSubject = form.titulo?.trim()
    ? `${form.titulo.trim()} - ${form.expediente || "Expediente"}`
    : `Actuación - ${form.expediente || "Expediente"}`;
  const mailBody = [
    "Hola,",
    "",
    `Te escribo en relación con la actuación "${form.titulo || "Sin título"}".`,
    form.descripcion ? `Descripción: ${form.descripcion}` : "",
    form.plazo ? `Fecha de actuación: ${form.plazo}` : "",
    form.fecha_aviso ? `Fecha de aviso: ${form.fecha_aviso}` : "",
    form.juzgado ? `Juzgado / Tribunal: ${form.juzgado}` : "",
    form.num_proc ? `N.º procedimiento: ${form.num_proc}` : "",
    form.estado ? `Estado: ${form.estado}` : "",
    form.prioridad ? `Prioridad: ${form.prioridad}` : "",
    "",
    "Puedes revisar la actuación completa dentro del expediente en el ERP.",
  ].filter(Boolean).join("\n");

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-overlay-in" onClick={onClose}>
      <div
        className="w-full max-w-[1500px] flex flex-col overflow-hidden rounded-3xl bg-white border border-slate-200 shadow-2xl animate-modal-in"
        style={{ height: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.22em]">Actuacion del expediente</p>
            <h3 className="mt-0.5 text-xl font-bold text-slate-900">
              {selectedActuacion ? "Editar actuacion" : "Nueva actuacion"}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <MailDropdownBtn
              mainLabel="Enviar correo"
              mainIcon={Mail}
              onMain={() => openMailDraft(mailSubject, mailBody, { to: clienteEmail ?? undefined, expediente_id: expedienteId ?? undefined })}
              mailSubject={mailSubject}
              mailBody={mailBody}
              mailTo={clienteEmail ?? undefined}
              expedienteId={expedienteId ?? undefined}
            />
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50">
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !clienteId || !form.titulo.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-red-700 hover:bg-red-800 disabled:opacity-50 rounded-xl shadow-sm"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {selectedActuacion ? "Guardar cambios" : "Guardar actuacion"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expediente</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{form.expediente || "Sin referencia"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Usuario</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{selectedActuacion?.created_by || "Usuario actual"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Referencia</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{selectedActuacion?.id ? `ACT-${String(selectedActuacion.id).slice(0, 8)}` : "Se generará al guardar"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado actual</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{form.estado === "completada" ? "Realizada" : form.estado || "Pendiente"}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-[1.15fr_0.85fr] gap-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Título de la actuación</label>
                <input
                  value={form.titulo}
                  onChange={(e) => setForm((prev) => ({ ...prev, titulo: e.target.value }))}
                  placeholder="Ej: Preparación de contestación, llamada con cliente..."
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Descripción</label>
                <textarea
                  value={form.descripcion}
                  onChange={(e) => setForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                  rows={3}
                  placeholder="Resume qué se ha hecho, qué se ha recibido o qué toca preparar..."
                  className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha de actuación</label>
                  <input type="date" value={form.plazo} onChange={(e) => setForm((prev) => ({ ...prev, plazo: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha de aviso</label>
                  <input type="date" value={form.fecha_aviso} onChange={(e) => setForm((prev) => ({ ...prev, fecha_aviso: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado</label>
                  <select value={form.estado} onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 bg-white">
                    <option value="pendiente">Pendiente</option>
                    <option value="urgente">Urgente</option>
                    <option value="completada">Realizada</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Prioridad</label>
                  <select value={form.prioridad} onChange={(e) => setForm((prev) => ({ ...prev, prioridad: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 bg-white">
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo de actuación</label>
                <select value={form.tipo} onChange={(e) => setForm((prev) => ({ ...prev, tipo: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 bg-white">
                  <option value="actuacion">Actuación general</option>
                  <option value="diligencia">Diligencia</option>
                  <option value="escrito">Escrito</option>
                  <option value="reunion">Reunión</option>
                  <option value="llamada">Llamada</option>
                  <option value="gestion">Gestión</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Juzgado / Tribunal</label>
                  <input value={form.juzgado} onChange={(e) => setForm((prev) => ({ ...prev, juzgado: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">N.º procedimiento</label>
                  <input value={form.num_proc} onChange={(e) => setForm((prev) => ({ ...prev, num_proc: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Etapa</label>
                <div className="mt-1">
                  <EtapaSelect value={form.etapa} onChange={(v) => setForm((prev) => ({ ...prev, etapa: v }))} getToken={getToken} />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Importe vinculado</label>
                <input type="number" step="0.01" min="0" value={form.importe} onChange={(e) => setForm((prev) => ({ ...prev, importe: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-red-400" />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notas internas</label>
                <textarea value={form.notas} onChange={(e) => setForm((prev) => ({ ...prev, notas: e.target.value }))} rows={4} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adjuntos de la actuación</p>
              <p className="text-xs text-slate-400 mt-0.5">Archivos asociados únicamente a esta actuación.</p>
            </div>
            {selectedActuacion ? (
              <div className="p-5">
                <ActuacionAdjuntosPanel taskId={selectedActuacion.id} locked={locked} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center px-8 py-14">
                <Paperclip size={32} className="mb-3 text-slate-200" />
                <p className="text-sm font-semibold text-slate-700">Sin adjuntos todavía</p>
                <p className="mt-1 text-xs text-slate-400">Guarda primero la actuación para poder añadirle sus propios archivos.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TabActuacion({
  expedienteId,
  clienteId,
  expedienteRef,
  juzgado,
  numProc,
  initialCreate = false,
  locked = false,
}: {
  expedienteId: string;
  clienteId?: string | null;
  expedienteRef?: string | null;
  juzgado?: string | null;
  numProc?: string | null;
  initialCreate?: boolean;
  locked?: boolean;
}) {
  const { getToken } = useAuth();
  const mapActuacionToForm = useCallback((item?: any | null): TareaForm => ({
    titulo: item?.titulo || "",
    descripcion: item?.descripcion || "",
    plazo: item?.plazo ? String(item.plazo).slice(0, 10) : "",
    fecha_aviso: item?.fecha_aviso ? String(item.fecha_aviso).slice(0, 10) : "",
    estado: item?.estado || "pendiente",
    prioridad: item?.prioridad || "media",
    expediente: item?.expediente || expedienteRef || "",
    expediente_id: item?.expediente_id || expedienteId,
    tipo: item?.tipo || "actuacion",
    juzgado: item?.juzgado || juzgado || "",
    num_proc: item?.num_proc || numProc || "",
    importe: item?.importe != null ? String(item.importe) : "",
    notas: item?.notas || "",
    etapa: item?.etapa || "",
  }), [expedienteId, expedienteRef, juzgado, numProc]);
  const [actuaciones, setActuaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<TareaForm>(mapActuacionToForm());

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      expediente: expedienteRef || "",
      expediente_id: expedienteId,
      juzgado: juzgado || "",
      num_proc: numProc || "",
      tipo: prev.tipo || "actuacion",
    }));
  }, [expedienteId, expedienteRef, juzgado, numProc]);

  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!initialCreate || autoOpenedRef.current || !clienteId) return;
    autoOpenedRef.current = true;
    setSelectedId(null);
    setForm(mapActuacionToForm());
    setShowModal(true);
  }, [clienteId, initialCreate, mapActuacionToForm]);

  const loadActuaciones = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar las actuaciones");
      const rows = (data.data || []).filter((item: any) => item.expediente_id === expedienteId && item.tipo === "actuacion");
      setActuaciones(rows);
      setSelectedId((prev) => prev && rows.some((item: any) => item.id === prev) ? prev : rows[0]?.id || null);
    } catch (e: any) {
      setError(e?.message || "No se pudieron cargar las actuaciones");
    } finally {
      setLoading(false);
    }
  }, [expedienteId, getToken]);

  useEffect(() => {
    loadActuaciones();
  }, [loadActuaciones]);

  const handleCreate = async () => {
    if (!clienteId || !form.titulo.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/tasks/client/${clienteId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          tipo: form.tipo || "actuacion",
          expediente_id: expedienteId,
          expediente: expedienteRef || "",
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "No se pudo crear la actuación");
      const created = data.data;
      setActuaciones((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setShowModal(true);
      setForm({
        ...TAREA_EMPTY,
        expediente: expedienteRef || "",
        expediente_id: expedienteId,
        juzgado: juzgado || "",
        num_proc: numProc || "",
        tipo: "actuacion",
        estado: "pendiente",
      });
      window.dispatchEvent(new CustomEvent("historial-changed"));
    } catch (e: any) {
      setError(e?.message || "No se pudo crear la actuación");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenNew = () => {
    setSelectedId(null);
    setForm(mapActuacionToForm());
    setShowModal(true);
  };

  const handleOpenExisting = (item: any) => {
    setSelectedId(item.id);
    setForm(mapActuacionToForm(item));
    setShowModal(true);
  };

  const handleSaveActuacion = async () => {
    if (!clienteId || !form.titulo.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getToken({ skipCache: true });
      const editingId = selectedId;
      const url = editingId ? `/api/tasks/${editingId}` : `/api/tasks/client/${clienteId}`;
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          tipo: form.tipo || "actuacion",
          expediente_id: expedienteId,
          expediente: expedienteRef || "",
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || "No se pudo guardar la actuación");
      const saved = data.data;
      setActuaciones((prev) => {
        if (editingId) return prev.map((item) => (item.id === editingId ? saved : item));
        return [saved, ...prev];
      });
      setSelectedId(saved.id);
      setForm(mapActuacionToForm(saved));
      window.dispatchEvent(new CustomEvent("historial-changed"));
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar la actuación");
    } finally {
      setSaving(false);
    }
  };

  const selectedActuacion = actuaciones.find((item) => item.id === selectedId) || null;

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
          <AlertTriangle size={13} className="shrink-0" /> Expediente cerrado — no se pueden crear ni modificar actuaciones.
        </div>
      )}
      {!clienteId && !locked && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Para crear actuaciones desde este expediente, primero debe haber un cliente vinculado.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-slate-400" />
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Actuaciones registradas</h3>
          </div>
          {!locked && (
            <button
              type="button"
              onClick={handleOpenNew}
              disabled={!clienteId}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm disabled:opacity-50"
            >
              <Plus size={12} />
              Crear actuación
            </button>
          )}
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" muted label="Cargando actuaciones..." />
            </div>
          ) : actuaciones.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <ClipboardList size={20} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">Todavía no hay actuaciones</p>
              <p className="mt-1 text-xs text-slate-400">Crea una actuación arriba y después podrás añadirle adjuntos propios.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-[140px_1.8fr_1.1fr_140px_140px] gap-0 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <div className="px-4 py-3">Fecha</div>
                <div className="px-4 py-3">Descripción</div>
                <div className="px-4 py-3">Usuario</div>
                <div className="px-4 py-3">Estado</div>
                <div className="px-4 py-3">Tipo</div>
              </div>
              <div className="divide-y divide-slate-200">
              {actuaciones.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleOpenExisting(item)}
                  className={`grid w-full grid-cols-[140px_1.8fr_1.1fr_140px_140px] gap-0 text-left transition-colors ${
                    selectedId === item.id
                      ? "bg-red-50/60"
                      : "bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="px-4 py-3 text-sm text-slate-700">{item.plazo ? fmtDate(item.plazo) : "—"}</div>
                  <div className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-800 truncate">{item.titulo}</p>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">{item.descripcion || "Sin descripción"}</p>
                  </div>
                  <div className="px-4 py-3 text-sm text-slate-600 truncate">{item.created_by || "Usuario"}</div>
                  <div className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                      {item.estado === "completada" ? "Realizada" : item.estado}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${TIPO_CONFIG[item.tipo]?.color || "bg-slate-100 text-slate-500"}`}>
                      {TIPO_CONFIG[item.tipo]?.label || "Actuación"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            </div>
          )}
        </div>
      </div>

      <ActuacionModal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          if (!selectedActuacion) setForm(mapActuacionToForm());
        }}
        onSave={handleSaveActuacion}
        saving={saving}
        clienteId={clienteId}
        expedienteId={expedienteId}
        form={form}
        setForm={setForm}
        selectedActuacion={selectedActuacion}
        getToken={getToken}
        locked={locked}
      />
    </div>
  );
}

// ── Tab Correo ────────────────────────────────────────────────────────────────
function TabCorreoExpediente({
  expedienteId,
  expedienteRef,
  locked = false,
}: {
  expedienteId: string;
  expedienteRef: string;
  locked?: boolean;
}) {
  const { getToken } = useAuth();

  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);

  // Compose
  const [showCompose, setShowCompose] = useState(false);
  const [composeForm, setComposeForm] = useState({ account_id: "", to: "", cc: "", subject: "", body: "" });
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState("");
  const [showCc, setShowCc] = useState(false);

  // Adjuntos del expediente
  const [composeAttachments, setComposeAttachments] = useState<Array<{id: string; name: string; type: string; size: number; dataBase64?: string; loading?: boolean}>>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [pickerFiles, setPickerFiles] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  // Associate existing
  const [showAssociate, setShowAssociate] = useState(false);
  const [allEmails, setAllEmails] = useState<any[]>([]);
  const [allEmailsLoading, setAllEmailsLoading] = useState(false);
  const [assocSearch, setAssocSearch] = useState("");
  const [linking, setLinking] = useState<string | null>(null);

  // Viewer
  const [viewEmail, setViewEmail] = useState<string | null>(null);
  const [viewBody, setViewBody] = useState<string>("");
  const [viewAttachments, setViewAttachments] = useState<Array<{ filename: string; contentType?: string; size?: number }>>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [downloadingAttachment, setDownloadingAttachment] = useState<number | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const authHdr = useCallback(async () => {
    const token = await getToken({ skipCache: true });
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }, [getToken]);

  const loadEmails = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const headers = await authHdr();
      const res = await fetch(`/api/expedientes/${expedienteId}/emails`, { headers });
      const d = await safeJson(res);
      if (res.ok) setEmails(d.data || []);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authHdr, expedienteId]);

  const loadAccounts = useCallback(async () => {
    try {
      const headers = await authHdr();
      const res = await fetch("/api/email/accounts", { headers });
      const d = await safeJson(res);
      if (res.ok) {
        const accs = d.data || [];
        setAccounts(accs);
        if (accs.length) setComposeForm(f => ({ ...f, account_id: accs[0].id }));
      }
    } catch {}
  }, [authHdr]);

  useEffect(() => { loadEmails(); loadAccounts(); }, [loadEmails, loadAccounts]);

  const openFilePicker = async () => {
    setShowFilePicker(true);
    if (pickerFiles.length) return;
    setPickerLoading(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${expedienteId}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await safeJson(res);
      if (res.ok) setPickerFiles(d.data || []);
    } catch {}
    finally { setPickerLoading(false); }
  };

  const toggleFileAttachment = async (file: any) => {
    const already = composeAttachments.find(a => a.id === file.id);
    if (already) { setComposeAttachments(prev => prev.filter(a => a.id !== file.id)); return; }
    const entry = { id: file.id, name: file.document_name || file.original_name, type: file.mimetype || "application/octet-stream", size: file.size || 0, loading: true };
    setComposeAttachments(prev => [...prev, entry]);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${expedienteId}/${file.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
      const blob = await res.blob();
      await new Promise<void>(resolve => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          setComposeAttachments(prev => prev.map(a => a.id === file.id ? { ...a, dataBase64: dataUrl.split(',')[1], loading: false } : a));
          resolve();
        };
        reader.readAsDataURL(blob);
      });
    } catch {
      setComposeAttachments(prev => prev.filter(a => a.id !== file.id));
    }
  };

  const handleSend = async () => {
    if (!composeForm.to.trim() || !composeForm.subject.trim() || !composeForm.body.trim()) {
      setComposeError("Para, asunto y cuerpo son obligatorios."); return;
    }
    setSending(true); setComposeError("");
    try {
      const headers = await authHdr();
      const bodyHtml = composeForm.body.replace(/\n/g, "<br>");
      const readyAttachments = composeAttachments.filter(a => a.dataBase64 && !a.loading);
      const res = await fetch("/api/email/send", {
        method: "POST", headers,
        body: JSON.stringify({
          account_id: composeForm.account_id || undefined,
          to: composeForm.to,
          cc: composeForm.cc || undefined,
          subject: composeForm.subject,
          html: bodyHtml,
          text: composeForm.body,
          expediente_id: expedienteId,
          attachments: readyAttachments.length ? readyAttachments.map(a => ({ filename: a.name, contentType: a.type, content: a.dataBase64 })) : undefined,
        }),
      });
      const d = await safeJson(res);
      if (!res.ok) { setComposeError(d.error || "Error al enviar"); return; }
      setShowCompose(false);
      setComposeForm(f => ({ ...f, to: "", cc: "", subject: "", body: "" }));
      setComposeAttachments([]);
      setShowCc(false);
      await loadEmails(true);
    } finally {
      setSending(false);
    }
  };

  const loadAllEmails = async () => {
    setAllEmailsLoading(true);
    try {
      const headers = await authHdr();
      const res = await fetch("/api/email/messages?limit=100", { headers });
      const d = await safeJson(res);
      if (res.ok) setAllEmails(d.data?.emails || []);
    } finally {
      setAllEmailsLoading(false);
    }
  };

  const handleAssociate = async (emailId: string) => {
    setLinking(emailId);
    try {
      const headers = await authHdr();
      const res = await fetch(`/api/email/messages/${emailId}/link`, {
        method: "PATCH", headers,
        body: JSON.stringify({ expediente_id: expedienteId }),
      });
      if (res.ok) {
        setAllEmails(prev => prev.filter(e => e.id !== emailId));
        await loadEmails(true);
      }
    } finally {
      setLinking(null);
    }
  };

  const handleUnlink = async (emailId: string) => {
    setLinking(emailId);
    try {
      const headers = await authHdr();
      await fetch(`/api/email/messages/${emailId}/link`, {
        method: "PATCH", headers,
        body: JSON.stringify({ expediente_id: null }),
      });
      await loadEmails(true);
    } finally {
      setLinking(null);
    }
  };

  const handleViewEmail = async (email: any) => {
    if (viewEmail === email.id) { setViewEmail(null); setViewBody(""); setViewAttachments([]); return; }
    setViewEmail(email.id); setViewLoading(true); setViewAttachments([]);
    try {
      const headers = await authHdr();
      const res = await fetch(`/api/email/messages/${email.id}`, { headers });
      const d = await safeJson(res);
      if (res.ok) {
        setViewBody(d.data?.body_html || d.data?.body_text || d.data?.snippet || "Sin contenido");
        setViewAttachments(Array.isArray(d.data?.attachments) ? d.data.attachments : []);
      }
    } finally {
      setViewLoading(false);
    }
  };

  const downloadEmailAttachment = async (emailId: string, index: number, filename: string) => {
    setDownloadingAttachment(index); setAttachmentError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/email/messages/${emailId}/attachments/${index}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("No se pudo descargar el adjunto");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename || "adjunto";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setAttachmentError(e.message || "No se pudo descargar el adjunto.");
    } finally {
      setDownloadingAttachment(null);
    }
  };

  const filteredAllEmails = assocSearch.trim()
    ? allEmails.filter(e => {
        const q = assocSearch.toLowerCase();
        return (e.subject || "").toLowerCase().includes(q) ||
               (e.from_email || "").toLowerCase().includes(q) ||
               (e.snippet || "").toLowerCase().includes(q);
      })
    : allEmails.slice(0, 40);

  const fmtEmailDate = (d: string) => {
    if (!d) return "—";
    const date = new Date(d);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    return isToday
      ? date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  };

  const noAccounts = !loading && accounts.length === 0;

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
          <AlertTriangle size={13} className="shrink-0" /> Expediente cerrado — solo lectura.
        </div>
      )}

      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Correos del expediente</h3>
          <p className="text-xs text-slate-400 mt-0.5">{emails.length} correo{emails.length !== 1 ? "s" : ""} asociado{emails.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={() => { setShowAssociate(true); if (!allEmails.length) loadAllEmails(); }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all">
            <Link2 size={12} /> Asociar correo existente
          </button>
          {!locked && (
            <MailDropdownBtn
              mainLabel="Redactar"
              mainIcon={Plus}
              onMain={() => { setShowCompose(true); setComposeError(""); }}
              mailSubject={`RE: Expediente ${expedienteRef}`}
              expedienteId={expedienteId}
              disabled={noAccounts}
              variant="primary"
            />
          )}
        </div>
      </div>

      {noAccounts && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
          <Mail size={14} className="shrink-0 text-blue-400" />
          <span>No hay ninguna cuenta de correo configurada. <Link to="/dashboard/correo" className="font-bold underline">Configurar en el módulo de Correo</Link></span>
        </div>
      )}

      {/* Modal redactar */}
      {showCompose && !locked && createPortal(
        <div className="fixed inset-0 z-50 bg-transparent flex items-end justify-end p-6">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg flex flex-col" style={{ maxHeight: "80vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-slate-800 rounded-t-2xl">
              <p className="text-sm font-bold text-white">Nuevo correo · {expedienteRef}</p>
              <button type="button" onClick={() => { setShowCompose(false); setComposeAttachments([]); setShowFilePicker(false); }} className="text-slate-400 hover:text-white"><X size={16} /></button>
            </div>
            {/* Form */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {accounts.length > 1 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Desde</label>
                  <select value={composeForm.account_id} onChange={e => setComposeForm(f => ({ ...f, account_id: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400">
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.label} ({a.email})</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Para *</label>
                <input value={composeForm.to} onChange={e => setComposeForm(f => ({ ...f, to: e.target.value }))}
                  placeholder="correo@ejemplo.com, otro@ejemplo.com"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400" />
              </div>
              {showCc && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">CC</label>
                  <input value={composeForm.cc} onChange={e => setComposeForm(f => ({ ...f, cc: e.target.value }))}
                    placeholder="cc@ejemplo.com"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400" />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Asunto *</label>
                <input value={composeForm.subject} onChange={e => setComposeForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder={`RE: Expediente ${expedienteRef}`}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mensaje *</label>
                <textarea value={composeForm.body} onChange={e => setComposeForm(f => ({ ...f, body: e.target.value }))}
                  rows={8} placeholder="Escribe tu mensaje aquí..."
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400 resize-none" />
              </div>
              {/* Adjuntos seleccionados */}
              {composeAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {composeAttachments.map(att => (
                    <div key={att.id} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg text-xs text-slate-700">
                      {att.loading ? <Loader2 size={10} className="animate-spin text-slate-400" /> : <Paperclip size={10} className="text-slate-400" />}
                      <span className="max-w-[160px] truncate">{att.name}</span>
                      <button type="button" onClick={() => setComposeAttachments(prev => prev.filter(a => a.id !== att.id))} className="ml-0.5 text-slate-400 hover:text-red-500"><X size={10} /></button>
                    </div>
                  ))}
                </div>
              )}
              {composeError && <p className="text-xs text-red-600 font-medium">{composeError}</p>}
            </div>
            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowCc(v => !v)} className="text-xs text-slate-400 hover:text-slate-600">
                  {showCc ? "Ocultar CC" : "Añadir CC"}
                </button>
                <button type="button" onClick={openFilePicker}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors">
                  <Paperclip size={11} /> Adjuntar del expediente
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setShowCompose(false); setComposeAttachments([]); setShowFilePicker(false); }} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="button" onClick={handleSend} disabled={sending || composeAttachments.some(a => a.loading)}
                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                  {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviar
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal picker de adjuntos del expediente */}
      {showFilePicker && createPortal(
        <div className="fixed inset-0 z-[60] bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowFilePicker(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md flex flex-col" style={{ maxHeight: "70vh" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Adjuntar archivos del expediente</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Selecciona los archivos a incluir en el correo</p>
              </div>
              <button type="button" onClick={() => setShowFilePicker(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {pickerLoading ? (
                <div className="flex items-center justify-center py-10"><Spinner size="sm" muted label="Cargando archivos..." /></div>
              ) : pickerFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-300">
                  <Paperclip size={24} className="opacity-30" />
                  <p className="text-sm">No hay archivos en este expediente</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pickerFiles.map(file => {
                    const selected = composeAttachments.some(a => a.id === file.id);
                    const name = file.document_name || file.original_name || "Archivo";
                    return (
                      <button key={file.id} type="button" onClick={() => toggleFileAttachment(file)}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${selected ? "bg-red-50" : "hover:bg-slate-50"}`}>
                        <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${selected ? "bg-red-600 border-red-600" : "border-slate-300"}`}>
                          {selected && <Check size={11} className="text-white" />}
                        </div>
                        <Paperclip size={13} className="shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-800 truncate">{name}</p>
                          <p className="text-[10px] text-slate-400">{file.attachment_type || "Sin clasificar"}{file.size ? ` · ${(file.size / 1024).toFixed(0)} KB` : ""}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">{composeAttachments.length} archivo{composeAttachments.length !== 1 ? "s" : ""} seleccionado{composeAttachments.length !== 1 ? "s" : ""}</span>
              <button type="button" onClick={() => setShowFilePicker(false)}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700">
                Listo
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal asociar correo existente */}
      {showAssociate && createPortal(
        <div className="fixed inset-0 z-50 bg-transparent flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl flex flex-col" style={{ maxHeight: "80vh" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Asociar correo al expediente</h3>
              <button type="button" onClick={() => setShowAssociate(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={assocSearch} onChange={e => setAssocSearch(e.target.value)}
                  placeholder="Buscar por asunto, remitente o extracto..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-red-400" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {allEmailsLoading ? (
                <div className="flex items-center justify-center py-10"><Spinner size="sm" muted label="Cargando correos..." /></div>
              ) : filteredAllEmails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-300">
                  <Mail size={24} className="opacity-30" />
                  <p className="text-sm font-medium">{assocSearch ? "Sin resultados" : "No hay correos disponibles"}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {filteredAllEmails.map(e => (
                    <div key={e.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-700 truncate">{e.from_name || e.from_email}</span>
                          <span className="text-[10px] text-slate-400">{fmtEmailDate(e.sent_at)}</span>
                          {e.expediente_id && e.expediente_id !== expedienteId && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">Vinculado a otro exp.</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-800 truncate mt-0.5">{e.subject || "(Sin asunto)"}</p>
                        {e.snippet && <p className="text-xs text-slate-400 truncate mt-0.5">{e.snippet}</p>}
                      </div>
                      <button type="button"
                        onClick={() => handleAssociate(e.id)}
                        disabled={linking === e.id || e.expediente_id === expedienteId}
                        className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all disabled:opacity-50">
                        {linking === e.id ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
                        {e.expediente_id === expedienteId ? "Ya asociado" : "Asociar"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
              <button type="button" onClick={() => setShowAssociate(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cerrar</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Lista de correos */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Spinner size="sm" muted label="Cargando correos..." /></div>
      ) : emails.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-300">
          <Mail size={32} className="opacity-20" />
          <p className="text-sm font-medium">No hay correos asociados a este expediente</p>
          <p className="text-xs">Redacta uno nuevo o asocia correos existentes con los botones de arriba</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="divide-y divide-slate-50">
            {emails.map(email => {
              const isSent = email.folder?.toLowerCase().includes("sent") || email.folder === "Sent";
              const isOpen = viewEmail === email.id;
              return (
                <div key={email.id}>
                  <button type="button" onClick={() => handleViewEmail(email)}
                    className={`w-full flex items-start gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors ${!email.is_read && !isSent ? "bg-blue-50/30" : ""}`}>
                    {/* Avatar / dirección */}
                    <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-[11px] font-bold shrink-0 mt-0.5 ${isSent ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"}`}>
                      {isSent ? <Send size={13} /> : <Mail size={13} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 justify-between">
                        <span className={`text-sm truncate ${!email.is_read && !isSent ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                          {isSent ? `Para: ${email.to_emails}` : (email.from_name || email.from_email)}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">{fmtEmailDate(email.sent_at)}</span>
                      </div>
                      <p className={`text-sm truncate mt-0.5 ${!email.is_read && !isSent ? "font-semibold text-slate-800" : "text-slate-600"}`}>
                        {email.subject || "(Sin asunto)"}
                      </p>
                      {!isOpen && email.snippet && <p className="text-xs text-slate-400 truncate mt-0.5">{email.snippet}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {email.has_attachments && <Paperclip size={12} className="text-slate-400" />}
                      <ChevronDown size={13} className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {/* Cuerpo expandido */}
                  {isOpen && (
                    <div className="px-5 pb-4 border-t border-slate-50 bg-slate-50/40">
                      <div className="flex items-center justify-between py-2 mb-2">
                        <div className="text-[10px] text-slate-400 space-y-0.5">
                          <p><span className="font-semibold">De:</span> {email.from_name ? `${email.from_name} <${email.from_email}>` : email.from_email}</p>
                          <p><span className="font-semibold">Para:</span> {email.to_emails}</p>
                          {email.cc_emails && <p><span className="font-semibold">CC:</span> {email.cc_emails}</p>}
                        </div>
                        <button type="button" onClick={() => handleUnlink(email.id)} disabled={linking === email.id}
                          className="text-xs text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1 disabled:opacity-50">
                          {linking === email.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />} Desasociar
                        </button>
                      </div>
                      {viewLoading && viewEmail === email.id ? (
                        <div className="flex items-center justify-center py-6"><Spinner size="sm" muted label="Cargando..." /></div>
                      ) : (
                        <>
                          {!!viewAttachments.length && (
                            <div className="flex flex-wrap gap-2 mb-2">
                              {viewAttachments.map((att, idx) => (
                                <button
                                  key={`${att.filename}-${idx}`}
                                  type="button"
                                  onClick={() => downloadEmailAttachment(email.id, idx, att.filename)}
                                  disabled={downloadingAttachment === idx}
                                  title={`Descargar ${att.filename}`}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50">
                                  {downloadingAttachment === idx ? <Loader2 size={12} className="animate-spin shrink-0" /> : <Paperclip size={12} className="shrink-0 text-slate-400" />}
                                  <span className="max-w-[160px] truncate">{att.filename}</span>
                                  {!!att.size && <span className="text-slate-400">{fmtSizeAct(att.size)}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                          {attachmentError && <p className="text-xs text-red-500 mb-2">{attachmentError}</p>}
                          <div className="text-sm text-slate-700 leading-relaxed bg-white rounded-xl border border-slate-100 p-4 max-h-80 overflow-y-auto"
                            dangerouslySetInnerHTML={{ __html: viewBody }} />
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab Cliente vinculado ──────────────────────────────────────────────────────
function TabClienteVinculado({ exp, clientes, linkedClient, linkedClientDisplayName, linkedClientSummary, fallbackClientName, draftClientName, expedienteId, onPatch }: {
  exp: any; clientes: any[]; linkedClient: any; linkedClientDisplayName: string; linkedClientSummary: string[]; fallbackClientName: string; draftClientName: { first_name: string; last_name: string }; expedienteId: string; onPatch: (fields: Record<string, any>) => Promise<boolean>;
}) {
  const [clientSearch, setClientSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [abogadoEdit, setAbogadoEdit] = useState(false);
  const [abogadoVal, setAbogadoVal] = useState(exp.abogado_propio || "");
  const [abogadoSaving, setAbogadoSaving] = useState(false);
  const [procuradorEdit, setProcuradorEdit] = useState(false);
  const [procuradorVal, setProcuradorVal] = useState(exp.procurador || "");
  const [procuradorSaving, setProcuradorSaving] = useState(false);

  // Sync local values when exp changes from outside (e.g. saved in Datos tab)
  useEffect(() => { if (!abogadoEdit) setAbogadoVal(exp.abogado_propio || ""); }, [exp.abogado_propio]);
  useEffect(() => { if (!procuradorEdit) setProcuradorVal(exp.procurador || ""); }, [exp.procurador]);

  const filtered = clientSearch.trim()
    ? clientes.filter(c => {
        const name = (c.commercial_name || `${c.first_name || ""} ${c.last_name || ""}`.trim()).toLowerCase();
        return name.includes(clientSearch.toLowerCase()) || (c.nif_cif || "").toLowerCase().includes(clientSearch.toLowerCase());
      })
    : clientes.slice(0, 20);

  const linkCliente = async (c: any) => {
    setLinkSaving(true);
    const name = c.commercial_name || `${c.first_name || ""} ${c.last_name || ""}`.trim();
    await onPatch({ cliente_id: c.id, cliente_nombre: name });
    setShowPicker(false); setClientSearch(""); setLinkSaving(false);
  };

  const unlinkCliente = async () => {
    setLinkSaving(true);
    await onPatch({ cliente_id: null, cliente_nombre: "" });
    setLinkSaving(false);
  };

  const isClosed = exp?.estado === "cerrado";

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-slate-400" />
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Cliente</h3>
          </div>
          {!isClosed && exp.cliente_id && !showPicker && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowPicker(true)} className="text-xs font-bold text-red-600 hover:underline">Cambiar</button>
              <button type="button" onClick={unlinkCliente} disabled={linkSaving} className="text-xs font-bold text-slate-400 hover:text-slate-600 disabled:opacity-50">Desasignar</button>
            </div>
          )}
        </div>
        <div className="p-5 space-y-3">
          {exp.cliente_id ? (
            <Link to={`/dashboard/clientes/${exp.cliente_id}`}
              className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition-colors hover:border-blue-200 hover:bg-blue-50/40">
              {linkedClient?.photo_url ? (
                <img src={linkedClient.photo_url} alt={linkedClientDisplayName || "Cliente"} className="h-14 w-14 rounded-2xl object-cover border border-slate-200 bg-white" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-600">{initialsFromName(linkedClientDisplayName)}</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-blue-600 hover:underline">{linkedClientDisplayName || "Sin asignar"}</p>
                {linkedClientSummary.length > 0 && <p className="mt-1 text-xs text-slate-500 break-words">{linkedClientSummary.join(" · ")}</p>}
                {exp.persona_contacto && <p className="mt-2 text-xs text-slate-500">Contacto: {exp.persona_contacto}</p>}
              </div>
              <ExternalLink size={13} className="text-slate-300 shrink-0 mt-1" />
            </Link>
          ) : fallbackClientName && !showPicker ? (
            <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-600">{initialsFromName(fallbackClientName)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">{fallbackClientName}</p>
                <p className="mt-1 text-xs text-amber-700">Nombre detectado pero sin cliente vinculado en el ERP.</p>
              </div>
            </div>
          ) : !showPicker ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-300">
              <Users size={28} className="opacity-30" /><p className="text-sm font-medium">Sin cliente asignado</p>
            </div>
          ) : null}

          {showPicker && !isClosed && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input autoFocus value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                  placeholder="Buscar por nombre o NIF..."
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-red-400" />
              </div>
              <div className="max-h-52 overflow-y-auto space-y-1">
                {filtered.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">Sin resultados</p>
                ) : filtered.map(c => {
                  const name = c.commercial_name || `${c.first_name || ""} ${c.last_name || ""}`.trim();
                  return (
                    <button key={c.id} type="button" onClick={() => linkCliente(c)} disabled={linkSaving}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white hover:shadow-sm transition-all text-left disabled:opacity-50">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200 text-[10px] font-bold text-slate-600 shrink-0">{initialsFromName(name)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
                        <p className="text-[10px] text-slate-400">{c.nif_cif || "Sin NIF"}{c.address_town ? ` · ${c.address_town}` : ""}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={() => { setShowPicker(false); setClientSearch(""); }} className="text-xs text-slate-400 hover:text-slate-600">Cancelar</button>
            </div>
          )}

          {!isClosed && (
            <div className="flex flex-wrap gap-2 pt-1">
              {!showPicker && (
                <button type="button" onClick={() => setShowPicker(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-all">
                  <Search size={12} /> {exp.cliente_id ? "Cambiar cliente" : "Buscar cliente existente"}
                </button>
              )}
              <Link
                to={`/dashboard/clientes/new?mode=manual&expediente_id=${encodeURIComponent(expedienteId)}${fallbackClientName ? `&first_name=${encodeURIComponent(draftClientName.first_name)}&last_name=${encodeURIComponent(draftClientName.last_name)}&commercial_name=${encodeURIComponent(fallbackClientName)}` : ""}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm transition-all">
                <Plus size={12} /> Crear nuevo cliente
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Abogado propio ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User size={14} className="text-slate-400" />
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Abogado</h3>
          </div>
          {!isClosed && !abogadoEdit && (
            <button type="button" onClick={() => setAbogadoEdit(true)} className="text-xs font-bold text-red-600 hover:underline">Editar</button>
          )}
        </div>
        <div className="px-5 py-4">
          {abogadoEdit ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={abogadoVal}
                onChange={e => setAbogadoVal(e.target.value)}
                placeholder="Nombre del abogado propio…"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-400"
              />
              <button
                type="button"
                disabled={abogadoSaving}
                onClick={async () => {
                  setAbogadoSaving(true);
                  await onPatch({ abogado_propio: abogadoVal.trim() || null });
                  setAbogadoSaving(false);
                  setAbogadoEdit(false);
                }}
                className="px-3 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50"
              >
                {abogadoSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              </button>
              <button type="button" onClick={() => { setAbogadoEdit(false); setAbogadoVal(exp.abogado_propio || ""); }} className="px-3 py-2 text-xs text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            </div>
          ) : exp.abogado_propio ? (
            <p className="text-sm font-medium text-slate-800">{exp.abogado_propio}</p>
          ) : (
            <p className="text-sm text-slate-400 italic">Sin abogado asignado</p>
          )}
        </div>
      </div>

      {/* ── Procurador propio ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase size={14} className="text-slate-400" />
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Procurador</h3>
          </div>
          {!isClosed && !procuradorEdit && (
            <button type="button" onClick={() => setProcuradorEdit(true)} className="text-xs font-bold text-red-600 hover:underline">Editar</button>
          )}
        </div>
        <div className="px-5 py-4">
          {procuradorEdit ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={procuradorVal}
                onChange={e => setProcuradorVal(e.target.value)}
                placeholder="Nombre del procurador propio…"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-400"
              />
              <button
                type="button"
                disabled={procuradorSaving}
                onClick={async () => {
                  setProcuradorSaving(true);
                  await onPatch({ procurador: procuradorVal.trim() || null });
                  setProcuradorSaving(false);
                  setProcuradorEdit(false);
                }}
                className="px-3 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50"
              >
                {procuradorSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              </button>
              <button type="button" onClick={() => { setProcuradorEdit(false); setProcuradorVal(exp.procurador || ""); }} className="px-3 py-2 text-xs text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            </div>
          ) : exp.procurador ? (
            <p className="text-sm font-medium text-slate-800">{exp.procurador}</p>
          ) : (
            <p className="text-sm text-slate-400 italic">Sin procurador asignado</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab Contrarios ─────────────────────────────────────────────────────────────
function TabContrarios({ exp, onPatch }: { exp: any; onPatch: (fields: Record<string, any>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [cForm, setCForm] = useState({ contrario: exp.contrario || "", procurador_contrario: exp.procurador_contrario || "", abogado_contrario: exp.abogado_contrario || "" });
  const [saving, setSaving] = useState(false);

  // Sync cForm when exp changes from outside (e.g. saved in Datos tab) but user is not editing
  useEffect(() => {
    if (!editing) {
      setCForm({ contrario: exp.contrario || "", procurador_contrario: exp.procurador_contrario || "", abogado_contrario: exp.abogado_contrario || "" });
    }
  }, [exp.contrario, exp.procurador_contrario, exp.abogado_contrario]);

  const isClosed = exp?.estado === "cerrado";
  const hasData = !!(exp.contrario || exp.procurador_contrario || exp.abogado_contrario);

  const handleSaveContrario = async () => {
    setSaving(true);
    const ok = await onPatch(cForm);
    if (ok) setEditing(false);
    setSaving(false);
  };

  const handleClear = async () => {
    setSaving(true);
    await onPatch({ contrario: "", procurador_contrario: "", abogado_contrario: "" });
    setCForm({ contrario: "", procurador_contrario: "", abogado_contrario: "" });
    setSaving(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-slate-400" />
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Parte contraria</h3>
        </div>
        {!isClosed && !editing && (
          <div className="flex items-center gap-2">
            <button type="button"
              onClick={() => { setCForm({ contrario: exp.contrario || "", procurador_contrario: exp.procurador_contrario || "", abogado_contrario: exp.abogado_contrario || "" }); setEditing(true); }}
              className="text-xs font-bold text-red-600 hover:underline">
              {hasData ? "Editar" : "Añadir parte contraria"}
            </button>
            {hasData && <button type="button" onClick={handleClear} disabled={saving} className="text-xs font-bold text-slate-400 hover:text-slate-600 disabled:opacity-50">Limpiar</button>}
          </div>
        )}
      </div>
      <div className="p-5">
        {editing && !isClosed ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nombre parte contraria</label>
                <input autoFocus value={cForm.contrario} onChange={e => setCForm(f => ({ ...f, contrario: e.target.value }))}
                  placeholder="Nombre o razón social..."
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-red-400" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Abogado contrario</label>
                <input value={cForm.abogado_contrario} onChange={e => setCForm(f => ({ ...f, abogado_contrario: e.target.value }))}
                  placeholder="Nombre del abogado..."
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-red-400" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Procurador contrario</label>
                <input value={cForm.procurador_contrario} onChange={e => setCForm(f => ({ ...f, procurador_contrario: e.target.value }))}
                  placeholder="Nombre del procurador..."
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-1 focus:ring-red-400" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={handleSaveContrario} disabled={saving}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Guardar
              </button>
            </div>
          </div>
        ) : hasData ? (
          <div className="grid grid-cols-3 gap-px bg-slate-100 rounded-xl overflow-hidden border border-slate-100">
            <div className="bg-white px-4 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Parte contraria</p>
              <p className="text-sm text-slate-800">{exp.contrario || <span className="text-slate-300">—</span>}</p>
            </div>
            <div className="bg-white px-4 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Abogado contrario</p>
              <p className="text-sm text-slate-800">{exp.abogado_contrario || <span className="text-slate-300">—</span>}</p>
            </div>
            <div className="bg-white px-4 py-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Procurador contrario</p>
              <p className="text-sm text-slate-800">{exp.procurador_contrario || <span className="text-slate-300">—</span>}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-300">
            <Users size={28} className="opacity-30" />
            <p className="text-sm font-medium">Sin parte contraria registrada</p>
            {!isClosed && (
              <button type="button" onClick={() => setEditing(true)} className="mt-1 text-xs font-bold text-red-500 hover:underline">Añadir parte contraria</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Apuntes contables ─────────────────────────────────────────────────────────
const TIPO_APUNTE_CFG = {
  cargo:  { label: "Cargo (debe)",  dot: "bg-red-500",     badge: "bg-red-100 text-red-700",         sign: "-" },
  abono:  { label: "Abono (pagado)", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", sign: "+" },
} as const;

function TabApuntesEconomicos({ expedienteId, locked = false }: { expedienteId: string; locked?: boolean }) {
  const { getToken } = useAuth();
  const [apuntes, setApuntes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ concepto: "", tipo: "cargo" as "cargo" | "abono", importe: "", fecha: new Date().toISOString().slice(0, 10), notas: "" });

  const authHeaders = useCallback(async () => {
    const token = await getToken({ skipCache: true });
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }, [getToken]);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const headers = await authHeaders();
      const res = await fetch(`/api/expedientes/${expedienteId}/apuntes`, { headers });
      const data = await safeJson(res);
      if (res.ok) setApuntes(data.data || []);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authHeaders, expedienteId]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => setForm({ concepto: "", tipo: "cargo", importe: "", fecha: new Date().toISOString().slice(0, 10), notas: "" });

  const handleSave = async () => {
    if (!form.concepto.trim() || !form.importe) return;
    setSaving(true);
    try {
      const headers = await authHeaders();
      const url = editId ? `/api/expedientes/${expedienteId}/apuntes/${editId}` : `/api/expedientes/${expedienteId}/apuntes`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers, body: JSON.stringify(form) });
      const data = await safeJson(res);
      if (!res.ok) { alert(data.error || "Error al guardar"); return; }
      if (editId) setApuntes(prev => prev.map(a => a.id === editId ? data.data : a));
      else setApuntes(prev => [data.data, ...prev]);
      setShowForm(false); setEditId(null); resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    const headers = await authHeaders();
    const res = await fetch(`/api/expedientes/${expedienteId}/apuntes/${id}`, { method: "DELETE", headers });
    if (res.ok) setApuntes(prev => prev.filter(a => a.id !== id));
  };

  const startEdit = (a: any) => {
    setForm({ concepto: a.concepto, tipo: a.tipo, importe: String(a.importe), fecha: a.fecha?.slice(0, 10) || "", notas: a.notas || "" });
    setEditId(a.id); setShowForm(true);
  };

  const totalCargos = apuntes.filter(a => a.tipo === "cargo").reduce((s, a) => s + Number(a.importe), 0);
  const totalAbonos = apuntes.filter(a => a.tipo === "abono").reduce((s, a) => s + Number(a.importe), 0);
  const saldo = totalCargos - totalAbonos;

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
          <AlertTriangle size={13} className="shrink-0" /> Expediente cerrado — no se pueden añadir ni modificar apuntes.
        </div>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-red-100 bg-white p-5">
          <div className="flex items-center gap-2 mb-2"><TrendingDown size={14} className="text-red-400" /><p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Total cargos</p></div>
          <p className="text-2xl font-bold text-red-600">{fmtMoney(totalCargos)}</p>
          <p className="text-xs text-slate-400 mt-1">{apuntes.filter(a => a.tipo === "cargo").length} apunte{apuntes.filter(a => a.tipo === "cargo").length !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-white p-5">
          <div className="flex items-center gap-2 mb-2"><TrendingUp size={14} className="text-emerald-500" /><p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Total abonos</p></div>
          <p className="text-2xl font-bold text-emerald-600">{fmtMoney(totalAbonos)}</p>
          <p className="text-xs text-slate-400 mt-1">{apuntes.filter(a => a.tipo === "abono").length} apunte{apuntes.filter(a => a.tipo === "abono").length !== 1 ? "s" : ""}</p>
        </div>
        <div className={`rounded-2xl border p-5 ${saldo > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center gap-2 mb-2"><Banknote size={14} className={saldo > 0 ? "text-amber-500" : "text-slate-400"} /><p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Saldo pendiente</p></div>
          <p className={`text-2xl font-bold ${saldo > 0 ? "text-amber-600" : "text-slate-500"}`}>{fmtMoney(saldo)}</p>
          <p className="text-xs text-slate-400 mt-1">{saldo > 0 ? "pendiente de cobro" : saldo < 0 ? "saldo a favor del cliente" : "al día"}</p>
        </div>
      </div>

      {/* Cabecera + botón */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Banknote size={14} className="text-slate-400" />
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Libro de apuntes</h3>
          </div>
          {!locked && (
            <button
              type="button"
              onClick={() => { resetForm(); setEditId(null); setShowForm(v => !v); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              <Plus size={12} /> Nuevo apunte
            </button>
          )}
        </div>

        {/* Formulario */}
        {showForm && !locked && (
          <div className="border-b border-slate-100 p-5 space-y-4 bg-slate-50">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{editId ? "Editar apunte" : "Nuevo apunte"}</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Concepto *</label>
                <input
                  value={form.concepto}
                  onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                  placeholder="Ej: Minuta honorarios, Pago a cuenta..."
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tipo *</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as any }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400">
                  <option value="cargo">Cargo (debe)</option>
                  <option value="abono">Abono (ha pagado)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Importe (€) *</label>
                <input
                  type="number" min="0" step="0.01"
                  value={form.importe}
                  onChange={e => setForm(f => ({ ...f, importe: e.target.value }))}
                  placeholder="0,00"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Fecha</label>
                <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Notas</label>
                <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Opcional..." className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-red-400" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setShowForm(false); setEditId(null); resetForm(); }} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={handleSave} disabled={saving || !form.concepto.trim() || !form.importe} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {editId ? "Guardar cambios" : "Añadir apunte"}
              </button>
            </div>
          </div>
        )}

        {/* Lista */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Spinner size="sm" muted label="Cargando apuntes..." /></div>
          ) : apuntes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-300">
              <Banknote size={28} className="opacity-30" />
              <p className="text-sm font-medium">Sin apuntes todavía</p>
              {!locked && <button type="button" onClick={() => setShowForm(true)} className="mt-1 text-xs font-bold text-red-500 hover:underline">Añadir primer apunte</button>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider pr-4">Fecha</th>
                    <th className="pb-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider pr-4">Concepto</th>
                    <th className="pb-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider pr-4">Tipo</th>
                    <th className="pb-2 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Importe</th>
                    {!locked && <th className="pb-2" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {apuntes.map(a => {
                    const cfg = TIPO_APUNTE_CFG[a.tipo as "cargo" | "abono"] || TIPO_APUNTE_CFG.cargo;
                    return (
                      <tr key={a.id} className="hover:bg-slate-50 group transition-colors">
                        <td className="py-3 pr-4 text-xs text-slate-500 whitespace-nowrap">{fmtDate(a.fecha)}</td>
                        <td className="py-3 pr-4">
                          <p className="text-sm font-medium text-slate-800">{a.concepto}</p>
                          {a.notas && <p className="text-xs text-slate-400 mt-0.5">{a.notas}</p>}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </td>
                        <td className={`py-3 text-right font-bold text-sm ${a.tipo === "abono" ? "text-emerald-600" : "text-red-600"}`}>
                          {cfg.sign}{fmtMoney(a.importe)}
                        </td>
                        {!locked && (
                          <td className="py-3 pl-3">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button type="button" onClick={() => startEdit(a)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"><Edit3 size={12} /></button>
                              <button type="button" onClick={() => setConfirmDeleteId(a.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"><Trash2 size={12} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200">
                    <td colSpan={2} className="pt-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Saldo pendiente</td>
                    <td />
                    <td className={`pt-3 text-right text-base font-bold ${saldo > 0 ? "text-amber-600" : "text-slate-500"}`}>{fmtMoney(saldo)}</td>
                    {!locked && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 bg-transparent flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-5 space-y-4">
            <h4 className="text-base font-bold text-slate-900">Eliminar apunte</h4>
            <p className="text-sm text-slate-500">¿Seguro que quieres eliminar este apunte? Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={handleDelete} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700">Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabExpedientesRelacionados({
  expedienteId,
  currentRef,
  clienteId,
  contrario,
  locked = false,
}: {
  expedienteId: string;
  currentRef: string;
  clienteId?: string | null;
  contrario?: string | null;
  locked?: boolean;
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
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Sugerencias automáticas: expedientes del mismo cliente o con el mismo
  // contrario, para no tener que buscarlos a mano cada vez -- se muestran
  // antes de escribir nada en el buscador.
  const [suggested, setSuggested] = useState<any[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(false);
  useEffect(() => {
    if (!showModal) return;
    if (!clienteId && !contrario?.trim()) { setSuggested([]); return; }
    (async () => {
      try {
        setLoadingSuggested(true);
        const token = await getToken({ skipCache: true });
        const headers = { Authorization: `Bearer ${token}` };
        const [byClientRes, byContrarioRes] = await Promise.all([
          clienteId
            ? fetch(`/api/expedientes?limit=20&clienteId=${encodeURIComponent(clienteId)}`, { headers })
            : Promise.resolve(null),
          contrario?.trim()
            ? fetch(`/api/expedientes?limit=20&q=${encodeURIComponent(contrario.trim())}`, { headers })
            : Promise.resolve(null),
        ]);
        const [byClientData, byContrarioData] = await Promise.all([
          byClientRes ? safeJson(byClientRes) : null,
          byContrarioRes ? safeJson(byContrarioRes) : null,
        ]);
        const merged = new Map<string, any>();
        for (const item of (byClientData?.data || [])) merged.set(item.id, item);
        for (const item of (byContrarioData?.data || [])) merged.set(item.id, item);
        merged.delete(expedienteId);
        for (const relId of relatedIds) merged.delete(relId);
        setSuggested(Array.from(merged.values()).slice(0, 8));
      } catch { setSuggested([]); }
      finally { setLoadingSuggested(false); }
    })();
  }, [showModal, clienteId, contrario, expedienteId, relatedIds, getToken]);

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
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setHasSearched(true);
    await searchExpedientes(term);
  };

  useEffect(() => {
    if (!showModal) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const term = query.trim();
    if (term.length >= 2) {
      searchDebounceRef.current = setTimeout(() => {
        setHasSearched(true);
        searchExpedientes(term);
      }, 380);
    } else if (!term) {
      setHasSearched(true);
      searchExpedientes("");
    }
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [query, showModal, searchExpedientes]);

  useEffect(() => {
    if (!showModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showModal]);

  const renderExpItem = (item: any) => {
    const ref = item.ref_expediente || `${item.anio}/${item.num_exp}`;
    const tipoConf = TIPOS[item.tipo] || TIPOS.otro;
    const estadoConf = ESTADOS[item.estado] || ESTADOS.abierto;
    const meta = [item.cliente_nombre, item.juzgado, item.tipo_proc].filter(Boolean).join(" · ");
    return (
      <div key={item.id} className="group flex items-center gap-4 px-4 py-3.5 hover:bg-blue-50/40 transition-colors bg-white">
        <div className="shrink-0 h-9 w-9 rounded-xl bg-slate-100 group-hover:bg-white group-hover:border group-hover:border-slate-200 flex items-center justify-center text-slate-400 transition-all">
          <Scale size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[11px] font-bold bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
              {ref}
            </span>
            <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 uppercase ${tipoConf.color}`}>
              {tipoConf.short}
            </span>
            <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 uppercase ${estadoConf.color}`}>
              {estadoConf.label}
            </span>
          </div>
          {item.descripcion && (
            <p className="mt-1 text-sm font-semibold text-slate-800 truncate">{item.descripcion}</p>
          )}
          {meta && (
            <p className="mt-0.5 text-[11px] text-slate-400 truncate">{meta}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => associateExpediente(item.id)}
          disabled={savingId === item.id}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
        >
          {savingId === item.id ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
          Asociar
        </button>
      </div>
    );
  };

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
      {locked && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800">
          <AlertTriangle size={13} className="shrink-0" /> Expediente cerrado — no se pueden asociar expedientes relacionados.
        </div>
      )}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link2 size={14} className="text-slate-400" />
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Expedientes relacionados</h3>
          </div>
          {!locked && (
            <button
              type="button"
              onClick={() => {
                setShowModal(true);
                setQuery("");
                setSearchError("");
                setAssociateError("");
                setSearchResults([]);
                setHasSearched(true);
                searchExpedientes("");
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm active:scale-95 transition-all"
            >
              <Plus size={12} />
              Asociar expedientes
            </button>
          )}
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Spinner size="sm" muted label="Cargando expedientes relacionados..." />
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
          className="fixed inset-0 z-[120] flex items-center justify-center bg-transparent px-4"
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
                    onChange={(e) => setQuery(e.target.value)}
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

              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                {!hasSearched ? (
                  loadingSuggested ? (
                    <div className="flex items-center justify-center px-5 py-12 bg-slate-50/60">
                      <Spinner size="sm" muted label="Buscando sugerencias..." />
                    </div>
                  ) : suggested.length > 0 ? (
                    <>
                      <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                          Sugeridos · mismo cliente o contrario
                        </span>
                      </div>
                      <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
                        {suggested.map(renderExpItem)}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center px-6 py-12 bg-slate-50/60 text-center gap-3">
                      <div className="h-12 w-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-300">
                        <Search size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-600">Busca un expediente</p>
                        <p className="mt-0.5 text-xs text-slate-400">Escribe la referencia, descripción, NIG o juzgado</p>
                      </div>
                    </div>
                  )
                ) : searching ? (
                  <div className="flex items-center justify-center px-5 py-12 bg-slate-50/60">
                    <Spinner size="sm" muted label="Buscando expedientes..." />
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-6 py-12 bg-slate-50/60 text-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-300">
                      <AlertCircle size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-600">Sin resultados</p>
                      <p className="mt-0.5 text-xs text-slate-400">Prueba con otra búsqueda o revisa si ya están relacionados.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                        {searchResults.length} {searchResults.length === 1 ? "expediente encontrado" : "expedientes encontrados"}
                      </span>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
                      {searchResults.map((item) => {
                        const ref = item.ref_expediente || `${item.anio}/${item.num_exp}`;
                        const tipoConf = TIPOS[item.tipo] || TIPOS.otro;
                        const estadoConf = ESTADOS[item.estado] || ESTADOS.abierto;
                        const meta = [item.cliente_nombre, item.juzgado, item.tipo_proc].filter(Boolean).join(" · ");
                        return (
                          <div key={item.id} className="group flex items-center gap-4 px-4 py-3.5 hover:bg-blue-50/40 transition-colors bg-white">
                            <div className="shrink-0 h-9 w-9 rounded-xl bg-slate-100 group-hover:bg-white group-hover:border group-hover:border-slate-200 flex items-center justify-center text-slate-400 transition-all">
                              <Scale size={15} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[11px] font-bold bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
                                  {ref}
                                </span>
                                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 uppercase ${tipoConf.color}`}>
                                  {tipoConf.short}
                                </span>
                                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 uppercase ${estadoConf.color}`}>
                                  {estadoConf.label}
                                </span>
                              </div>
                              {item.descripcion && (
                                <p className="mt-1 text-sm font-semibold text-slate-800 truncate">{item.descripcion}</p>
                              )}
                              {meta && (
                                <p className="mt-0.5 text-[11px] text-slate-400 truncate">{meta}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => associateExpediente(item.id)}
                              disabled={savingId === item.id}
                              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
                            >
                              {savingId === item.id ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
                              Asociar
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
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

// ── Panel lateral de indicadores del expediente ───────────────
function PanelIndicadoresExpediente({ expedienteId, onTabChange, collapsed, onToggleCollapsed }: {
  expedienteId: string;
  onTabChange: (tab: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { getToken } = useAuth();
  const [ind, setInd] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!expedienteId) return;
    (async () => {
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch(`/api/tasks/indicators/expediente/${expedienteId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await safeJson(res);
        if (res.ok) setInd(data.data);
        else setError(data.error || 'Error');
      } catch { setError('Error de conexión'); }
    })();
  }, [expedienteId, getToken]);

  const fmt = (v: number | null | undefined, suffix = '') =>
    v == null ? '—' : `${v}${suffix}`;
  const fmtMoney = (v: number | null | undefined) =>
    v == null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);

  if (collapsed) {
    return (
      <aside className="relative w-4 shrink-0 flex flex-col min-h-0 transition-all duration-200">
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="Mostrar indicadores"
          className="absolute -left-3 top-3 z-10 h-6 w-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-red-600 hover:border-red-200 transition-colors"
        >
          <ChevronLeft size={12} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="relative w-52 shrink-0 flex flex-col min-h-0 transition-all duration-200">
      <button
        type="button"
        onClick={onToggleCollapsed}
        title="Ocultar indicadores"
        className="absolute -left-3 top-3 z-10 h-6 w-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-red-600 hover:border-red-200 transition-colors"
      >
        <ChevronRight size={12} />
      </button>
      <div className="bg-white border border-slate-200 rounded-xl overflow-y-auto flex-1 min-h-0">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Indicadores</h3>
        </div>
        {error ? (
          <p className="px-4 py-3 text-xs text-red-400">{error}</p>
        ) : !ind ? (
          <div className="px-4 py-4 flex justify-center">
            <div className="h-4 w-4 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-4 py-3 space-y-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Tareas</p>
            <Indicador label="Total tareas"    value={fmt(ind.total_tareas)} />
            <Indicador label="Pendientes"      value={fmt(ind.tareas_pendientes)}
              color={ind.tareas_pendientes > 0 ? 'text-amber-600' : 'text-slate-700'} />
            <Indicador label="Urgentes"        value={fmt(ind.tareas_urgentes)}
              color={ind.tareas_urgentes > 0 ? 'text-rose-600' : 'text-slate-700'} />
            <Indicador label="Vencidas"        value={fmt(ind.tareas_vencidas)}
              color={ind.tareas_vencidas > 0 ? 'text-rose-600' : 'text-slate-700'} />
            <Indicador label="Completadas"     value={fmt(ind.tareas_completadas)}
              color={ind.tareas_completadas > 0 ? 'text-emerald-600' : 'text-slate-700'} />

            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-3 mb-1">Documentación</p>
            <Indicador label="Archivos" value={fmt(ind.total_archivos)} />
            <Indicador label="Notas"    value={fmt(ind.total_notas)} />

            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-3 mb-1">Actividad</p>
            <Indicador label="Actuaciones"      value={fmt(ind.total_actuaciones)}
              color={ind.total_actuaciones > 0 ? 'text-blue-600' : 'text-slate-700'} />
            <Indicador label="Días sin actuac." value={fmt(ind.dias_sin_actuacion, ' días')}
              color={ind.dias_sin_actuacion != null && ind.dias_sin_actuacion > 30 ? 'text-amber-600' : 'text-slate-700'} />
            <Indicador label="Días abierto"     value={fmt(ind.dias_desde_apertura, ' días')} />

            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-3 mb-1">Expediente</p>
            <Indicador label="Estado"   value={ind.estado || '—'}
              color={ind.estado === 'Activo' ? 'text-emerald-600' : ind.estado === 'Cerrado' ? 'text-slate-400' : 'text-slate-700'} />
            <Indicador label="Etapa"    value={ind.etapa || '—'} />
            <Indicador label="Cobrado"  value={fmtMoney(ind.total_cobrado)} color="text-emerald-600" />
            <Indicador label="Saldo"    value={fmtMoney(ind.saldo)}
              color={ind.saldo > 0 ? 'text-amber-600' : ind.saldo < 0 ? 'text-emerald-600' : 'text-slate-700'} />
          </div>
        )}

      </div>
    </aside>
  );
}

// ─── ConversacionesTab ────────────────────────────────────────────────────────
interface SesionConv {
  id: string;
  canal_id: string;
  canal_nombre: string;
  iniciado_por: string;
  iniciado_por_nombre?: string | null;
  iniciado_at: string;
  cerrado_at: string | null;
  total_mensajes?: number;
  mensajes: Array<{
    id: string;
    user_id?: string | null;
    contenido: string;
    user_name?: string | null;
    autor_nombre?: string | null;
    created_at: string;
    tipo: string;
    file_name?: string | null;
  }>;
}

function ConversacionesTab({ expedienteId }: { expedienteId: string }) {
  const { getToken } = useAuth();
  const [sesiones, setSesiones] = useState<SesionConv[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const loadSesiones = useCallback(() => {
    setLoading(true);
    setActionError("");
    getToken({ skipCache: true })
      .then((t: string) =>
        fetch(`/api/expedientes/${expedienteId}/conversaciones`, {
          headers: { Authorization: `Bearer ${t}` },
        })
      )
      .then((r: Response) => r.json())
      .then((d: any) => setSesiones(d?.data ?? []))
      .catch(() => setSesiones([]))
      .finally(() => setLoading(false));
  }, [expedienteId, getToken]);

  useEffect(() => {
    loadSesiones();
  }, [loadSesiones]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const handleDeleteMessage = async (messageId: string) => {
    const confirmed = window.confirm('¿Seguro que quieres borrar este mensaje de la conversación asociada?');
    if (!confirmed) return;
    setDeletingMessageId(messageId);
    setActionError("");
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(resolveApiUrl(`/api/chat/mensajes/${messageId}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data?.error || "No se pudo borrar el mensaje");
      }
      setSesiones(prev =>
        prev.map(sesion => ({
          ...sesion,
          total_mensajes: Math.max(0, (sesion.total_mensajes ?? sesion.mensajes.length) - (sesion.mensajes.some(m => m.id === messageId) ? 1 : 0)),
          mensajes: sesion.mensajes.filter(m => m.id !== messageId),
        }))
      );
    } catch (e: any) {
      setActionError(e?.message || "No se pudo borrar el mensaje");
    } finally {
      setDeletingMessageId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
        Cargando conversaciones…
      </div>
    );
  }

  if (!sesiones.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <MessageSquare size={40} className="mb-3 opacity-30" />
        <p className="text-sm font-medium">Sin conversaciones registradas</p>
        <p className="text-xs mt-1">Asocia este expediente desde el chat para registrar conversaciones.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 py-1">
      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}
      {sesiones.map(s => {
        const expanded = expandedIds.has(s.id);
        return (
          <div key={s.id} className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleExpand(s.id)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
            >
              <MessageSquare size={15} className="text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-800 text-sm truncate">{s.canal_nombre}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">{fmt(s.iniciado_at)}</span>
                  {s.cerrado_at && (
                    <span className="text-[11px] text-slate-400 shrink-0">→ {fmt(s.cerrado_at)}</span>
                  )}
                  {!s.cerrado_at && (
                    <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                      En curso
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {s.iniciado_por_nombre ? `Asociado por ${s.iniciado_por_nombre} · ` : ""}
                  {(s.total_mensajes ?? s.mensajes.length)} mensaje{(s.total_mensajes ?? s.mensajes.length) !== 1 ? 's' : ''}
                </div>
              </div>
              <svg
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {expanded && (
              <div className="border-t border-slate-100 bg-slate-50/50 divide-y divide-slate-100">
                {s.mensajes.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-slate-400 italic">Sin mensajes en este período.</div>
                ) : (
                  s.mensajes.map(m => (
                    <div key={m.id} className="flex gap-3 px-4 py-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[11px] font-bold text-slate-500 shrink-0">
                        {((m.autor_nombre || m.user_name || '?')[0] || '?').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="font-semibold text-[13px] text-slate-800">{m.autor_nombre || m.user_name || 'Desconocido'}</span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(m.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {m.tipo === 'archivo' ? (
                          <span className="text-xs text-slate-500 italic">📎 {m.file_name || 'Archivo adjunto'}</span>
                        ) : (
                          <p className="text-sm text-slate-700 break-words">{m.contenido}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(m.id)}
                        disabled={deletingMessageId === m.id}
                        className="self-start inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Borrar mensaje"
                      >
                        {deletingMessageId === m.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        Borrar
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ExpedienteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isCollapsed } = useContext(SidebarContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const { getToken } = useAuth();

  const [exp, setExp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<DetailTabKey>("perfil");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const setEF = (key: string, val: any) => setEditForm((prev: any) => ({ ...prev, [key]: val }));
  const [clientes, setClientes] = useState<any[]>([]);
  const [billing,  setBilling]  = useState<{ facturas: any[]; gastos: any[] } | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [agendaEvents, setAgendaEvents] = useState<any[] | null>(null);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [showAgendaForm, setShowAgendaForm] = useState(false);
  const [agendaSaving, setAgendaSaving] = useState(false);
  const [agendaForm, setAgendaForm] = useState({ title: "", type: "cita", start_at: "", end_at: "", all_day: false, description: "", status: "pendiente", with_meet: false, guest_email: "" });
  // Reutiliza la misma sesion de Google Calendar que el modulo Agenda (mismo
  // sessionStorage) -- si ya se conecto alli, aqui funciona sin volver a pedir permiso.
  const [gcalToken, setGcalToken] = useState<string | null>(() => {
    try { return sessionStorage.getItem(GCAL_TOKEN_KEY); } catch { return null; }
  });
  const [gcalError, setGcalError] = useState<string | null>(null);
  const [indCollapsed, setIndCollapsed] = useState(() => localStorage.getItem('exp_indicadores_collapsed') === '1');
  const toggleIndCollapsed = () => {
    setIndCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('exp_indicadores_collapsed', next ? '1' : '0');
      return next;
    });
  };
  const [notificaciones, setNotificaciones] = useState<any[] | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [historial, setHistorial] = useState<any[] | null>(null);
  const [historialLoading, setHistorialLoading] = useState(false);
  const shouldOpenNuevaActuacion = searchParams.get("newActuacion") === "1";
  const shouldOpenNuevaTarea = searchParams.get("newTarea") === "1";
  const initialTareaType = searchParams.get("type") || "";

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab && DETAIL_TABS.some((item) => item.key === requestedTab)) {
      setTab(requestedTab as DetailTabKey);
    }
  }, [searchParams]);

  useEffect(() => {
    if (tab !== "economico" || billing !== null) return;
    (async () => {
      setBillingLoading(true);
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch("/api/facturacion/bootstrap", { headers: { Authorization: `Bearer ${token}` } });
        const d = await safeJson(res);
        if (res.ok) {
          const data = d.data || d;
          setBilling({ facturas: data.facturas || [], gastos: data.gastos || [] });
        }
      } catch { /* */ } finally { setBillingLoading(false); }
    })();
  }, [tab, billing, getToken]);

  useEffect(() => {
    if (tab !== "agenda" || agendaEvents !== null) return;
    (async () => {
      setAgendaLoading(true);
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch("/api/agenda?limit=500", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          setAgendaEvents((d.data || d) as any[]);
        }
      } catch { /* */ } finally { setAgendaLoading(false); }
    })();
  }, [tab, agendaEvents, getToken]);

  useEffect(() => {
    if (tab !== "historial") return;
    (async () => {
      setHistorialLoading(true);
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch(`/api/expedientes/${id}/historial`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          setHistorial(d.data || []);
        }
      } catch { /* */ } finally { setHistorialLoading(false); }
    })();
  }, [tab, id, getToken]);

  useEffect(() => {
    if (tab !== "cronologia" || notificaciones !== null) return;
    (async () => {
      setNotifLoading(true);
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch(`/api/expedientes/${id}/notificaciones`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          setNotificaciones(d.data || []);
        }
      } catch { /* */ } finally { setNotifLoading(false); }
    })();
  }, [tab, notificaciones, id, getToken]);

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

  // Auto-start inline edit when navigated with ?edit=1
  const autoEditExpRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("edit") !== "1" || !exp || autoEditExpRef.current) return;
    autoEditExpRef.current = true;
    setEditForm({
      anio: exp.anio, num_exp: exp.num_exp,
      ref_propia: exp.ref_propia || "", ref_expediente: exp.ref_expediente || "",
      descripcion: exp.descripcion || "", tipo: exp.tipo || "judicial",
      cliente_id: exp.cliente_id || "", cliente_nombre: exp.cliente_nombre || "",
      contrario: exp.contrario || "", procurador: exp.procurador || "",
      juzgado: exp.juzgado || "", tipo_proc: exp.tipo_proc || "",
      num_autos: exp.num_autos || "", nig: exp.nig || "",
      estado: exp.estado || "abierto", observaciones: exp.observaciones || "",
      fecha_inicio: exp.fecha_inicio ? exp.fecha_inicio.slice(0, 10) : "",
      fecha_cierre: exp.fecha_cierre ? exp.fecha_cierre.slice(0, 10) : "",
      importe: exp.importe ? String(exp.importe) : "",
      tipos_asunto: exp.tipos_asunto || "",
      cuantia_principal: exp.cuantia_principal ? String(exp.cuantia_principal) : "",
      intereses: exp.intereses ? String(exp.intereses) : "",
      costas: exp.costas ? String(exp.costas) : "",
      cuantia_total: exp.cuantia_total ? String(exp.cuantia_total) : "",
      indeterminado: exp.indeterminado || false,
      etapa: exp.etapa || "", persona_contacto: exp.persona_contacto || "",
      contacto: exp.contacto || "", centro: exp.centro || "",
      color: exp.color || "ninguno",
    });
    setEditing(true);
    setTab("perfil");
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [exp]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (form: typeof EXP_EMPTY) => {
    setSaving(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/expedientes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...exp, ...form }),
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

  const patchExp = async (fields: Record<string, any>) => {
    const token = await getToken({ skipCache: true });
    const res = await fetch(`/api/expedientes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...exp, ...fields }),
    });
    const d = await safeJson(res);
    if (!res.ok) { alert(d.error || "Error al guardar"); return false; }
    await fetchExp();
    return true;
  };

  const handleToggleEstado = async () => {
    if (!exp) return;
    const closing = exp.estado !== "cerrado";
    setSaving(true);
    try {
      const token = await getToken({ skipCache: true });
      const patch = closing
        ? { ...exp, estado: "cerrado", fecha_cierre: new Date().toISOString().slice(0, 10) }
        : { ...exp, estado: "abierto",  fecha_cierre: "" };
      const res = await fetch(`/api/expedientes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      const d = await safeJson(res);
      if (!res.ok) { alert(d.error || "Error al cambiar el estado"); return; }
      await fetchExp();
      setHistorial(null);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Spinner size="xl" label="Cargando expediente..." />
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

  const startEdit = () => {
    if (exp?.estado === "cerrado") return;
    setEditForm({
      anio: exp.anio,
      num_exp: exp.num_exp,
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
      abogado_propio: exp.abogado_propio || "",
      abogado_contrario: exp.abogado_contrario || "",
      procurador_contrario: exp.procurador_contrario || "",
    });
    setEditing(true);
    setTab("perfil");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Sticky header ── */}
      <div className="anim-fade-up px-6 sm:px-8 py-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 text-white flex items-center justify-center shadow-md shadow-red-500/20 flex-shrink-0">
            <FolderOpen size={22} />
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-xl font-extrabold text-slate-800 leading-none tracking-tight truncate">
                {exp.descripcion || "Sin descripción"}
              </h1>
              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest leading-none ${estadoConf.color}`}>
                {estadoConf.label}
              </span>
              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest leading-none ${tipoConf.color}`}>
                {tipoConf.label}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-medium text-slate-500 flex-wrap">
              {exp.tipos_asunto && <span className="font-bold text-slate-700 tracking-wide uppercase">{exp.tipos_asunto}</span>}
              <span className="flex items-center gap-1.5"><Hash size={11} className="text-slate-400" /> {exp.anio}/{exp.num_exp}</span>
              {exp.fecha_inicio && <span className="flex items-center gap-1.5"><Calendar size={11} className="text-slate-400" /> Alta: {fmtDate(exp.fecha_inicio)}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <BackButton onClick={() => navigate("/dashboard/expedientes")} />
          {editing ? (
            <>
              <button onClick={() => { setEditing(false); setEditForm(null); }} className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm active:scale-95 transition-all">
                <X size={14} /> Cancelar
              </button>
              <button onClick={() => handleSave(editForm)} disabled={saving || !editForm?.descripcion?.trim()} className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl shadow-sm active:scale-95 transition-all ml-1">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar cambios
              </button>
            </>
          ) : exp?.estado === "cerrado" ? (
            <button onClick={handleToggleEstado} disabled={saving} className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-50 rounded-xl shadow-sm active:scale-95 transition-all">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />} Reabrir expediente
            </button>
          ) : (
            <>
              <button onClick={handleToggleEstado} disabled={saving} className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50 rounded-xl shadow-sm active:scale-95 transition-all">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <X size={14} className="text-slate-400" />} Cerrar exp.
              </button>
              <button onClick={startEdit} className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-red-600 border border-red-700 hover:bg-red-700 rounded-xl shadow-sm active:scale-95 transition-all ml-1">
                <Edit3 size={14} /> Editar
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 3-column body ── */}
      <div className="flex-1 overflow-auto bg-[#f4f6f8]">
        <div className={`w-full p-6 sm:p-8 flex flex-col gap-8 items-start ${isCollapsed ? "md:flex-row" : "lg:flex-row"}`}>

          {/* Columna 1: Nav vertical */}
          <div className={`anim-fade-up w-full flex-shrink-0 ${isCollapsed ? "md:w-56 md:sticky md:top-6" : "lg:w-56 lg:sticky lg:top-6"}`} style={{ animationDelay: '60ms' }}>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-3">Secciones del Expediente</h3>
            <nav className="flex gap-1.5 overflow-x-auto pb-1 modules-scrollbar sm:flex-col sm:gap-0.5 sm:overflow-visible sm:pb-0">
              {DETAIL_TABS.slice(0, 8).map((tabItem) => {
                const Icon = tabItem.icon;
                const active = tab === tabItem.key;
                return (
                  <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
                    className={`shrink-0 rounded-xl px-4 py-2.5 flex items-center gap-2 sm:gap-3 text-sm whitespace-nowrap transition-all text-left ${active ? "bg-white text-red-600 shadow-sm ring-1 ring-slate-200/50 font-semibold" : "text-slate-600 hover:bg-white hover:shadow-sm hover:text-slate-900 font-medium"}`}
                  >
                    <Icon size={14} className={active ? "text-red-500 shrink-0" : "text-slate-400 shrink-0"} />
                    {tabItem.label}
                    {active && <div className="hidden sm:block w-1.5 h-1.5 rounded-full bg-red-500 ml-auto shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />}
                  </button>
                );
              })}
              <div className="hidden sm:block h-px w-full bg-slate-200 my-1.5" />
              <div className="shrink-0 w-px self-stretch bg-slate-200 sm:hidden" />
              {DETAIL_TABS.slice(8).map((tabItem) => {
                const Icon = tabItem.icon;
                const active = tab === tabItem.key;
                return (
                  <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
                    className={`shrink-0 rounded-xl px-4 py-2.5 flex items-center gap-2 sm:gap-3 text-sm whitespace-nowrap transition-all text-left ${active ? "bg-white text-red-600 shadow-sm ring-1 ring-slate-200/50 font-semibold" : "text-slate-600 hover:bg-white hover:shadow-sm hover:text-slate-900 font-medium"}`}
                  >
                    <Icon size={14} className={active ? "text-red-500 shrink-0" : "text-slate-400 shrink-0"} />
                    {tabItem.label}
                    {active && <div className="hidden sm:block w-1.5 h-1.5 rounded-full bg-red-500 ml-auto shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Columna 2: Contenido principal */}
          <div className="anim-fade-up flex-1 min-w-0 flex flex-col gap-6 w-full" style={{ animationDelay: '130ms' }}>
            {exp.estado === "cerrado" && !editing && (
              <div className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-500 shadow-sm">
                <X size={15} className="shrink-0 text-slate-400" />
                <span>Este expediente está <strong className="text-slate-700">cerrado</strong>. No se pueden realizar modificaciones. Pulsa <strong className="text-emerald-700">Reabrir expediente</strong> para editarlo.</span>
              </div>
            )}
            <div>
            {tab === "perfil" && !editing && (
              <div className="space-y-4">
                <Section title="Identificación" icon={FolderOpen} cols={4}>
                  <Field label="Núm. expediente" value={`${exp.anio}/${exp.num_exp}`} mono />
                  <Field label="Fecha alta" value={fmtDate(exp.fecha_inicio)} />
                  <Field label="Fecha cierre" value={fmtDate(exp.fecha_cierre)} />
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

            {tab === "perfil" && editing && editForm && (
              <div className="space-y-4">
                {/* ── Identificación ── */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                    <FolderOpen size={14} className="text-slate-400" />
                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Identificación</h3>
                  </div>
                  <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <EF label="Núm. expediente" mono><span className="text-sm font-mono text-slate-600">{editForm.anio}/{editForm.num_exp}</span></EF>
                    <EF label="Fecha alta"><input type="date" value={editForm.fecha_inicio} onChange={e => setEF("fecha_inicio", e.target.value)} className={EI} /></EF>
                    <EF label="Fecha cierre"><input type="date" value={editForm.fecha_cierre} onChange={e => setEF("fecha_cierre", e.target.value)} className={EI} /></EF>
                    <div className="col-span-2 md:col-span-4">
                      <EF label="Descripción *"><input value={editForm.descripcion} onChange={e => setEF("descripcion", e.target.value)} className={EI} placeholder="Descripción del expediente" /></EF>
                    </div>
                    <EF label="Tipo">
                      <select value={editForm.tipo} onChange={e => setEF("tipo", e.target.value)} className={EI}>
                        {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </EF>
                    <EF label="Tipos de asunto"><input value={editForm.tipos_asunto} onChange={e => setEF("tipos_asunto", e.target.value)} className={EI} placeholder="Ej. Civil, Penal…" /></EF>
                    <EF label="Etapa"><input value={editForm.etapa} onChange={e => setEF("etapa", e.target.value)} className={EI} placeholder="Ej. Instrucción" /></EF>
                    <EF label="Color">
                      <select value={editForm.color} onChange={e => setEF("color", e.target.value)} className={EI}>
                        {["ninguno","rojo","azul","verde","amarillo","naranja","morado"].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                      </select>
                    </EF>
                  </div>
                </div>

                {/* ── Procedimiento judicial ── */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                    <Scale size={14} className="text-slate-400" />
                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Procedimiento judicial</h3>
                  </div>
                  <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                    <EF label="Tipo de procedimiento"><input value={editForm.tipo_proc} onChange={e => setEF("tipo_proc", e.target.value)} className={EI} placeholder="Ej. Juicio Ordinario" /></EF>
                    <div className="col-span-2">
                      <EF label="Juzgado / Tribunal"><input value={editForm.juzgado} onChange={e => setEF("juzgado", e.target.value)} className={EI} placeholder="Nombre del juzgado" /></EF>
                    </div>
                    <EF label="Procurador propio"><input value={editForm.procurador} onChange={e => setEF("procurador", e.target.value)} className={EI} /></EF>
                    <EF label="N.I.G." mono><input value={editForm.nig} onChange={e => setEF("nig", e.target.value)} className={EI + " font-mono"} placeholder="NIG del procedimiento" /></EF>
                    <EF label="Núm. autos" mono><input value={editForm.num_autos} onChange={e => setEF("num_autos", e.target.value)} className={EI + " font-mono"} placeholder="0000/0000" /></EF>
                  </div>
                </div>

                {/* ── Cuantías económicas ── */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                    <ClipboardList size={14} className="text-slate-400" />
                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Cuantías económicas</h3>
                  </div>
                  <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <EF label="Cuantía principal (€)"><input type="number" step="0.01" value={editForm.cuantia_principal} onChange={e => setEF("cuantia_principal", e.target.value)} className={EI} placeholder="0.00" /></EF>
                    <EF label="Intereses (€)"><input type="number" step="0.01" value={editForm.intereses} onChange={e => setEF("intereses", e.target.value)} className={EI} placeholder="0.00" /></EF>
                    <EF label="Costas (€)"><input type="number" step="0.01" value={editForm.costas} onChange={e => setEF("costas", e.target.value)} className={EI} placeholder="0.00" /></EF>
                    <EF label="Cuantía total (€)"><input type="number" step="0.01" value={editForm.cuantia_total} onChange={e => setEF("cuantia_total", e.target.value)} className={EI} placeholder="0.00" /></EF>
                    <EF label="Importe (€)"><input type="number" step="0.01" value={editForm.importe} onChange={e => setEF("importe", e.target.value)} className={EI} placeholder="0.00" /></EF>
                    <EF label="Indeterminada">
                      <label className="flex items-center gap-2 mt-1 cursor-pointer">
                        <input type="checkbox" checked={Boolean(editForm.indeterminado)} onChange={e => setEF("indeterminado", e.target.checked)} className="w-4 h-4 accent-red-600" />
                        <span className="text-sm text-slate-600">{editForm.indeterminado ? "Sí" : "No"}</span>
                      </label>
                    </EF>
                  </div>
                </div>

                {/* ── Partes y referencias ── */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                    <MoreHorizontal size={14} className="text-slate-400" />
                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Partes y referencias</h3>
                  </div>
                  <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <EF label="Cliente *">
                      <select value={editForm.cliente_id} onChange={e => {
                        const c = clientes.find((x: any) => x.id === e.target.value);
                        setEF("cliente_id", e.target.value);
                        setEF("cliente_nombre", c ? `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.commercial_name || "" : "");
                      }} className={EI}>
                        <option value="">— Sin cliente —</option>
                        {clientes.map((c: any) => (
                          <option key={c.id} value={c.id}>{`${c.first_name || ""} ${c.last_name || ""}`.trim() || c.commercial_name || c.nif_cif || "Cliente sin nombre"}</option>
                        ))}
                      </select>
                    </EF>
                    <EF label="Parte contraria"><input value={editForm.contrario} onChange={e => setEF("contrario", e.target.value)} className={EI} /></EF>
                    <EF label="Persona contacto"><input value={editForm.persona_contacto} onChange={e => setEF("persona_contacto", e.target.value)} className={EI} /></EF>
                    <EF label="Contacto"><input value={editForm.contacto} onChange={e => setEF("contacto", e.target.value)} className={EI} /></EF>
                    <EF label="Ref. propia" mono><input value={editForm.ref_propia} onChange={e => setEF("ref_propia", e.target.value)} className={EI + " font-mono"} /></EF>
                    <EF label="Ref. expediente" mono><input value={editForm.ref_expediente} onChange={e => setEF("ref_expediente", e.target.value)} className={EI + " font-mono"} /></EF>
                    <EF label="Centro"><input value={editForm.centro} onChange={e => setEF("centro", e.target.value)} className={EI} /></EF>
                  </div>
                </div>
              </div>
            )}

            {tab === "notas" && (
              <TabNotas
                expedienteId={id!}
                legacyNote={exp.observaciones}
                onLegacyUpdated={(next) => setExp((prev: any) => (prev ? { ...prev, observaciones: next || null } : prev))}
                locked={exp?.estado === "cerrado"}
              />
            )}

            {tab === "clientes" && (
              <TabClienteVinculado
                exp={exp}
                clientes={clientes}
                linkedClient={linkedClient}
                linkedClientDisplayName={linkedClientDisplayName}
                linkedClientSummary={linkedClientSummary}
                fallbackClientName={fallbackClientName}
                draftClientName={draftClientName}
                expedienteId={id!}
                onPatch={patchExp}
              />
            )}

            {tab === "contrarios" && (
              <TabContrarios exp={exp} onPatch={patchExp} />
            )}

            {tab === "relacionados" && (
              <TabExpedientesRelacionados
                expedienteId={id!}
                currentRef={exp.ref_expediente || `${exp.anio}/${exp.num_exp}`}
                clienteId={exp.cliente_id}
                contrario={exp.contrario}
                locked={false}
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
                initialCreate={shouldOpenNuevaTarea}
                initialType={initialTareaType}
                locked={exp?.estado === "cerrado"}
              />
            )}
            {tab === "actuacion" && (
              <TabActuacion
                expedienteId={id!}
                clienteId={exp.cliente_id}
                expedienteRef={exp.ref_expediente || `${exp.anio}/${exp.num_exp}`}
                juzgado={exp.juzgado}
                numProc={exp.num_autos}
                initialCreate={shouldOpenNuevaActuacion}
                locked={exp?.estado === "cerrado"}
              />
            )}
            {tab === "adjuntos" && (
              <TabAdjuntosExpediente
                expedienteId={id!}
                locked={exp?.estado === "cerrado"}
              />
            )}
            {tab === "economico" && (() => {
              const allBilling = billing?.facturas || [];
              // Facturas directamente vinculadas a este expediente
              const expFacturas = allBilling.filter((f: any) => f.expediente_id === id);
              // Facturas del mismo cliente pero sin expediente específico (o de otro expediente)
              const clientOnlyFacturas = exp.cliente_id
                ? allBilling.filter((f: any) => f.client_id === exp.cliente_id && f.expediente_id !== id)
                : [];
              const allVisible = [...expFacturas, ...clientOnlyFacturas];
              const totalFacturado = allVisible.reduce((s: number, f: any) => s + Number(f.total || 0), 0);
              const totalCobrado   = allVisible.filter((f: any) => f.estado === "cobrada").reduce((s: number, f: any) => s + Number(f.total || 0), 0);
              const totalPendiente = allVisible.filter((f: any) => f.estado !== "cobrada").reduce((s: number, f: any) => s + Number(f.total || 0), 0);
              const ESTADO_BADGE: Record<string, string> = {
                cobrada:  "bg-emerald-100 text-emerald-700",
                pendiente:"bg-amber-100 text-amber-700",
                vencida:  "bg-rose-100 text-rose-700",
              };
              const FacturaRow = ({ f, dim }: { f: any; dim?: boolean }) => (
                <tr key={f.id} className={`hover:bg-slate-50 transition-colors ${dim ? "opacity-60" : ""}`}>
                  <td className="px-5 py-3 font-mono text-xs text-slate-700 font-semibold">{f.num}</td>
                  <td className="px-5 py-3 text-xs text-slate-700 max-w-[180px] truncate">{f.contacto}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{fmtDate(f.fecha)}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{fmtDate(f.vencimiento)}</td>
                  <td className="px-5 py-3 text-xs font-bold text-slate-800 text-right">{fmtMoney(f.total)}</td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${ESTADO_BADGE[f.estado] || "bg-slate-100 text-slate-600"}`}>
                      {f.estado}
                    </span>
                  </td>
                </tr>
              );
              const thead = (
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Núm.</th>
                    <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cliente</th>
                    <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Fecha</th>
                    <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-400 uppercase tracking-wider">Vencimiento</th>
                    <th className="px-5 py-3 text-right text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total</th>
                    <th className="px-5 py-3 text-center text-[11px] font-bold text-slate-400 uppercase tracking-wider">Estado</th>
                  </tr>
                </thead>
              );
              return (
                <div className="space-y-5">
                  {/* Apuntes contables */}
                  <TabApuntesEconomicos expedienteId={id!} locked={exp?.estado === "cerrado"} />

                  {/* Divisor */}
                  <div className="flex items-center gap-3 pt-2">
                    <div className="flex-1 border-t border-slate-200" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Facturación vinculada</span>
                    <div className="flex-1 border-t border-slate-200" />
                  </div>

                  {/* Resumen cliente completo */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <BadgeEuro size={15} className="text-slate-400" />
                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Facturado (cliente)</p>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">{fmtMoney(totalFacturado)}</p>
                      <p className="text-xs text-slate-400 mt-1">{allVisible.length} factura{allVisible.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp size={15} className="text-emerald-500" />
                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Cobrado</p>
                      </div>
                      <p className="text-2xl font-bold text-emerald-600">{fmtMoney(totalCobrado)}</p>
                      <p className="text-xs text-slate-400 mt-1">facturas cobradas</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingDown size={15} className="text-amber-500" />
                        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Pendiente</p>
                      </div>
                      <p className="text-2xl font-bold text-amber-600">{fmtMoney(totalPendiente)}</p>
                      <p className="text-xs text-slate-400 mt-1">por cobrar</p>
                    </div>
                  </div>

                  {/* Facturas de este expediente */}
                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Banknote size={14} className="text-slate-400" />
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Facturas de este expediente</h3>
                      </div>
                      <Link to="/dashboard/facturacion" className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1">
                        Ir a facturación <ChevronRight size={11} />
                      </Link>
                    </div>
                    {billingLoading ? (
                      <div className="flex items-center justify-center py-10"><Spinner size="sm" muted /></div>
                    ) : expFacturas.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-2 text-slate-300">
                        <Banknote size={24} className="opacity-30" />
                        <p className="text-sm font-medium">Sin facturas vinculadas a este expediente</p>
                        <Link to="/dashboard/facturacion" className="mt-1 text-xs font-bold text-red-500 hover:underline">Crear factura</Link>
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        {thead}
                        <tbody className="divide-y divide-slate-50">
                          {expFacturas.map((f: any) => <FacturaRow key={f.id} f={f} />)}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Otras facturas del cliente */}
                  {exp.cliente_id && clientOnlyFacturas.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                      <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                        <BadgeEuro size={14} className="text-slate-400" />
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Otras facturas del cliente</h3>
                        <span className="ml-1 text-[10px] text-slate-400">(de otros expedientes o sin expediente)</span>
                      </div>
                      <table className="w-full text-sm">
                        {thead}
                        <tbody className="divide-y divide-slate-50">
                          {clientOnlyFacturas.map((f: any) => <FacturaRow key={f.id} f={f} dim />)}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {tab === "cronologia" && (
              <CronologiaTab
                expedienteId={id!}
                expediente={exp}
                notificaciones={notificaciones}
                loading={notifLoading}
                getToken={getToken}
                onRefresh={() => setNotificaciones(null)}
                locked={exp?.estado === "cerrado"}
              />
            )}

            {tab === "correo" && (
              <TabCorreoExpediente
                expedienteId={id!}
                expedienteRef={exp.ref_expediente || `${exp.anio}/${exp.num_exp}`}
                locked={exp?.estado === "cerrado"}
              />
            )}

            {tab === "conversaciones" && (
              <ConversacionesTab expedienteId={id!} />
            )}

            {tab === "historial" && (() => {
              type HistIcon = React.FC<{ size?: number; className?: string }>;
              const TYPE_CFG: Record<string, { label: string; Icon: HistIcon; iconBg: string; iconColor: string; badge: string }> = {
                alta:                    { label: "Alta",                Icon: FolderPlus   as HistIcon, iconBg: "bg-emerald-100",  iconColor: "text-emerald-600",  badge: "bg-emerald-50 text-emerald-700 border-emerald-200"  },
                cierre:                  { label: "Cierre",              Icon: Lock         as HistIcon, iconBg: "bg-red-100",      iconColor: "text-red-600",      badge: "bg-red-50 text-red-700 border-red-200"              },
                reapertura:              { label: "Reapertura",          Icon: Unlock       as HistIcon, iconBg: "bg-emerald-100",  iconColor: "text-emerald-600",  badge: "bg-emerald-50 text-emerald-700 border-emerald-200"  },
                cambio:                  { label: "Cambio",              Icon: Edit3        as HistIcon, iconBg: "bg-slate-100",    iconColor: "text-slate-500",    badge: "bg-slate-50 text-slate-600 border-slate-200"        },
                nota:                    { label: "Nota",                Icon: StickyNote   as HistIcon, iconBg: "bg-amber-100",    iconColor: "text-amber-600",    badge: "bg-amber-50 text-amber-700 border-amber-200"        },
                nota_eliminada:          { label: "Nota eliminada",      Icon: Trash2       as HistIcon, iconBg: "bg-slate-100",    iconColor: "text-slate-400",    badge: "bg-slate-50 text-slate-500 border-slate-200"        },
                tarea:                   { label: "Tarea",               Icon: CheckCircle2 as HistIcon, iconBg: "bg-blue-100",     iconColor: "text-blue-600",     badge: "bg-blue-50 text-blue-700 border-blue-200"           },
                tarea_completada:        { label: "Tarea completada",    Icon: CheckCircle2 as HistIcon, iconBg: "bg-emerald-100",  iconColor: "text-emerald-600",  badge: "bg-emerald-50 text-emerald-700 border-emerald-200"  },
                actuacion:               { label: "Actuación",           Icon: Scale        as HistIcon, iconBg: "bg-purple-100",   iconColor: "text-purple-600",   badge: "bg-purple-50 text-purple-700 border-purple-200"     },
                archivo:                 { label: "Archivo adjunto",     Icon: Paperclip    as HistIcon, iconBg: "bg-indigo-100",   iconColor: "text-indigo-600",   badge: "bg-indigo-50 text-indigo-700 border-indigo-200"     },
                archivo_eliminado:       { label: "Archivo eliminado",   Icon: FileX        as HistIcon, iconBg: "bg-red-100",      iconColor: "text-red-500",      badge: "bg-red-50 text-red-600 border-red-200"              },
                adjunto_tarea:           { label: "Adjunto actuación",   Icon: FileText     as HistIcon, iconBg: "bg-violet-100",   iconColor: "text-violet-600",   badge: "bg-violet-50 text-violet-700 border-violet-200"     },
                adjunto_tarea_eliminado: { label: "Adjunto eliminado",   Icon: FileX        as HistIcon, iconBg: "bg-red-100",      iconColor: "text-red-400",      badge: "bg-red-50 text-red-500 border-red-100"              },
                factura:                 { label: "Factura",             Icon: Banknote     as HistIcon, iconBg: "bg-green-100",    iconColor: "text-green-600",    badge: "bg-green-50 text-green-700 border-green-200"        },
                presupuesto:             { label: "Presupuesto",         Icon: ClipboardList as HistIcon,iconBg: "bg-teal-100",     iconColor: "text-teal-600",     badge: "bg-teal-50 text-teal-700 border-teal-200"           },
                correo:                  { label: "Correo",              Icon: Mail         as HistIcon, iconBg: "bg-sky-100",      iconColor: "text-sky-600",      badge: "bg-sky-50 text-sky-700 border-sky-200"              },
                correo_borrador:         { label: "Borrador correo",     Icon: MessageSquare as HistIcon,iconBg: "bg-slate-100",    iconColor: "text-slate-500",    badge: "bg-slate-50 text-slate-500 border-slate-200"        },
                agenda:                  { label: "Evento agenda",       Icon: Calendar     as HistIcon, iconBg: "bg-orange-100",   iconColor: "text-orange-600",   badge: "bg-orange-50 text-orange-700 border-orange-200"     },
                relacionado:             { label: "Exp. relacionado",    Icon: Link2        as HistIcon, iconBg: "bg-cyan-100",     iconColor: "text-cyan-600",     badge: "bg-cyan-50 text-cyan-700 border-cyan-200"           },
              };

              const fmtFull   = (d: string) => new Date(d).toLocaleString("es-ES", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
              const fmtTime   = (d: string) => { const dt = new Date(d); return isNaN(dt.getTime()) ? "" : dt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }); };
              const fmtDay    = (d: string) => new Date(d).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
              const fmtMini   = (d: string) => new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
              const fmtBytes  = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
              const fmtEuros  = (v: any) => v != null ? Number(v).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : null;
              const dayKey    = (d: string) => new Date(d).toLocaleDateString("es-ES", { year: "numeric", month: "2-digit", day: "2-digit" });

              if (historialLoading) return (
                <div className="flex items-center justify-center py-16">
                  <Spinner size="sm" muted label="Cargando historial…" />
                </div>
              );
              if (!historial || historial.length === 0) return <EmptyTab icon={Activity} label="Sin historial por ahora" />;

              // Group by day
              const groups: { day: string; label: string; events: any[] }[] = [];
              for (const ev of historial) {
                const day = dayKey(ev.timestamp);
                const last = groups[groups.length - 1];
                if (last?.day === day) last.events.push(ev);
                else groups.push({ day, label: fmtDay(ev.timestamp), events: [ev] });
              }

              return (
                <div className="px-1 py-3 space-y-5">
                  {/* Summary bar */}
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 font-medium flex-wrap">
                    <Activity size={11} className="text-slate-400 shrink-0" />
                    <span className="font-bold text-slate-700">{historial.length}</span> eventos registrados
                    <span className="text-slate-300">·</span>
                    {Object.entries(
                      historial.reduce((acc: Record<string, number>, ev) => { acc[ev.type] = (acc[ev.type] || 0) + 1; return acc; }, {})
                    ).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([type, count]) => {
                      const cfg = TYPE_CFG[type] || TYPE_CFG.cambio;
                      return (
                        <span key={type} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${cfg.badge}`}>
                          {count} {cfg.label}
                        </span>
                      );
                    })}
                  </div>

                  {groups.map(group => (
                    <div key={group.day}>
                      {/* Day separator */}
                      <div className="flex items-center gap-3 mb-3 sticky top-0 z-10 bg-white/90 backdrop-blur-sm py-1 -mx-1 px-1">
                        <div className="h-px flex-1 bg-slate-100" />
                        <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest shrink-0 capitalize">
                          {group.label}
                        </span>
                        <div className="h-px flex-1 bg-slate-100" />
                      </div>

                      <div className="space-y-1.5">
                        {group.events.map((ev, i) => {
                          const cfg = TYPE_CFG[ev.type] || TYPE_CFG.cambio;
                          const { Icon } = cfg;
                          const timeStr = fmtTime(ev.timestamp);
                          const isLast  = i === group.events.length - 1;

                          return (
                            <div key={i} className="flex gap-3 group/ev">
                              {/* Icon + connector */}
                              <div className="flex flex-col items-center shrink-0 pt-0.5">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center border ${cfg.iconBg} border-white shadow-sm shrink-0`}>
                                  <Icon size={13} className={cfg.iconColor} />
                                </div>
                                {!isLast && <div className="w-px flex-1 bg-slate-100 mt-1 min-h-[10px]" />}
                              </div>

                              {/* Card */}
                              <div className={`flex-1 min-w-0 pb-2 ${isLast ? "" : ""}`}>
                                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border ${cfg.badge}`}>
                                    {cfg.label}
                                  </span>
                                  {timeStr && (
                                    <time className="text-[11px] font-mono font-bold text-slate-400" title={fmtFull(ev.timestamp)}>
                                      {timeStr}
                                    </time>
                                  )}
                                  {ev.user_name && (
                                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                      <User size={9} className="shrink-0" /> {ev.user_name}
                                    </span>
                                  )}
                                </div>

                                <p className="text-[13px] text-slate-800 font-semibold leading-snug">{ev.title}</p>

                                {/* Metadata chips */}
                                {ev.meta && (
                                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {ev.meta.size_bytes != null && (
                                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-medium">
                                        {fmtBytes(Number(ev.meta.size_bytes))}
                                      </span>
                                    )}
                                    {ev.meta.category && ev.meta.category !== 'adjunto' && (
                                      <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-medium capitalize">
                                        {ev.meta.category}
                                      </span>
                                    )}
                                    {ev.meta.priority && ev.meta.priority !== 'normal' && (
                                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${
                                        ev.meta.priority === 'urgente' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                        ev.meta.priority === 'alta'    ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                        'bg-slate-50 text-slate-600 border-slate-200'
                                      }`}>
                                        Prioridad {ev.meta.priority}
                                      </span>
                                    )}
                                    {ev.meta.estado && (
                                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${
                                        ev.meta.estado === 'completada' || ev.meta.estado === 'pagada'  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                        ev.meta.estado === 'urgente'    || ev.meta.estado === 'vencida'  ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                        ev.meta.estado === 'pendiente'                                   ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                        'bg-slate-50 text-slate-600 border-slate-200'
                                      }`}>
                                        {ev.meta.estado}
                                      </span>
                                    )}
                                    {fmtEuros(ev.meta.total) && (
                                      <span className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-md font-bold">
                                        {fmtEuros(ev.meta.total)}
                                      </span>
                                    )}
                                    {ev.meta.plazo && (
                                      <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-md font-medium">
                                        📅 {fmtMini(ev.meta.plazo)}
                                      </span>
                                    )}
                                    {ev.meta.tipo && ev.meta.tipo !== 'otro' && (
                                      <span className="text-[10px] bg-purple-50 text-purple-600 border border-purple-200 px-2 py-0.5 rounded-md font-medium">
                                        {(ev.meta.tipo as string).replace(/_/g, ' ')}
                                      </span>
                                    )}
                                    {ev.meta.task_titulo && (
                                      <span className="text-[10px] bg-violet-50 text-violet-600 border border-violet-200 px-2 py-0.5 rounded-md font-medium max-w-[220px] truncate">
                                        📋 {ev.meta.task_titulo}
                                      </span>
                                    )}
                                    {ev.meta.from && (
                                      <span className="text-[10px] bg-sky-50 text-sky-600 border border-sky-200 px-2 py-0.5 rounded-md font-medium max-w-[200px] truncate">
                                        De: {ev.meta.from}
                                      </span>
                                    )}
                                    {ev.meta.to && (
                                      <span className="text-[10px] bg-sky-50 text-sky-600 border border-sky-200 px-2 py-0.5 rounded-md font-medium max-w-[200px] truncate">
                                        Para: {ev.meta.to}
                                      </span>
                                    )}
                                    {ev.meta.type && (
                                      <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-md font-medium capitalize">
                                        {ev.meta.type}
                                      </span>
                                    )}
                                    {ev.meta.end_at && (
                                      <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-200 px-2 py-0.5 rounded-md font-medium">
                                        hasta {fmtTime(ev.meta.end_at)}
                                      </span>
                                    )}
                                    {ev.meta.snippet && (
                                      <span className="text-[10px] text-slate-400 italic block w-full mt-0.5 truncate max-w-[280px]">
                                        "{ev.meta.snippet.toString().slice(0, 90)}{ev.meta.snippet.toString().length > 90 ? '…' : ''}"
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {tab === "agenda" && (() => {
              const TYPE_BADGE: Record<string, string> = {
                cita:    "bg-blue-100 text-blue-700",
                plazo:   "bg-red-100 text-red-700",
                reunion: "bg-purple-100 text-purple-700",
                juicio:  "bg-orange-100 text-orange-700",
                otro:    "bg-slate-100 text-slate-600",
              };
              const STATUS_BADGE: Record<string, string> = {
                pendiente:   "bg-amber-100 text-amber-700",
                completado:  "bg-emerald-100 text-emerald-700",
                cancelado:   "bg-slate-100 text-slate-500",
              };
              const expEvents = (agendaEvents || []).filter((e: any) => e.expediente_id === id);

              const connectGcal = async () => {
                setGcalError(null);
                try {
                  const token = await requestGoogleCalendarToken();
                  setGcalToken(token);
                  try { sessionStorage.setItem(GCAL_TOKEN_KEY, token); } catch {}
                } catch (e: any) {
                  setGcalError(e.message || "No se pudo conectar con Google Calendar.");
                }
              };

              const handleCreateEvent = async (e: React.FormEvent) => {
                e.preventDefault();
                if (!agendaForm.title.trim() || !agendaForm.start_at) return;
                setAgendaSaving(true);
                try {
                  const token = await getToken({ skipCache: true });
                  const startAt = agendaForm.all_day ? agendaForm.start_at + "T00:00:00" : agendaForm.start_at;
                  const endAt = agendaForm.end_at
                    ? (agendaForm.all_day ? agendaForm.end_at + "T23:59:00" : agendaForm.end_at)
                    : null;
                  const body = {
                    title: agendaForm.title.trim(),
                    type: agendaForm.type,
                    start_at: startAt,
                    end_at: endAt,
                    all_day: agendaForm.all_day,
                    description: agendaForm.description || null,
                    status: agendaForm.status,
                    expediente_id: id,
                    source: "manual",
                  };
                  const res = await fetch("/api/agenda", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify(body),
                  });
                  const d = await safeJson(res);
                  if (!res.ok) { alert(d.error || "Error al crear el evento"); return; }
                  let savedEvent = d.data;

                  // Si se pidió Meet y hay sesión de Google, se crea el evento allí
                  // (con el enlace de videollamada) y se enlaza con el del ERP --
                  // igual que hace el módulo Agenda general.
                  if (agendaForm.with_meet && gcalToken && !agendaForm.all_day) {
                    try {
                      // OJO: se usan savedEvent.start_at/end_at (lo que devolvió el
                      // backend tras guardarlo, ya en formato completo con zona
                      // horaria), no las variables startAt/endAt de más arriba --
                      // esas vienen tal cual del <input type="datetime-local">
                      // ("2026-07-23T15:14", sin segundos ni zona horaria), y
                      // Google Calendar rechaza ese formato con "Bad Request".
                      const googleCreated = await createGoogleMeetEvent(gcalToken, {
                        title: body.title,
                        description: body.description,
                        start_at: savedEvent.start_at,
                        end_at: savedEvent.end_at || savedEvent.start_at,
                        guestEmail: agendaForm.guest_email,
                      });
                      const meetUrl = googleCreated?.hangoutLink
                        || googleCreated?.conferenceData?.entryPoints?.[0]?.uri
                        || null;
                      const syncRes = await fetch(`/api/agenda/${savedEvent.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({
                          ...savedEvent,
                          source: "manual",
                          external_provider: "google",
                          external_id: googleCreated?.id,
                          external_url: googleCreated?.htmlLink,
                          meet_url: meetUrl,
                        }),
                      });
                      const syncJson = await safeJson(syncRes);
                      if (syncRes.ok) {
                        savedEvent = syncJson.data;
                      } else {
                        setGcalError(`El evento se guardó, pero no se pudo enlazar el Meet: ${syncJson?.error || "error desconocido"}.`);
                      }
                    } catch (meetErr: any) {
                      if (meetErr.message === "GCAL_AUTH_EXPIRED") {
                        // La sesión de Google caducó a mitad de camino (los tokens
                        // de acceso duran ~1h) -- se limpia para que el botón
                        // vuelva a pedir "Conectar Google Meet" en vez de seguir
                        // fallando en silencio con un token que ya no sirve.
                        setGcalToken(null);
                        try { sessionStorage.removeItem(GCAL_TOKEN_KEY); } catch {}
                        setGcalError("El evento se guardó, pero tu sesión de Google había caducado. Conecta Google Meet de nuevo y añádelo editando el evento.");
                      } else {
                        setGcalError(`El evento se guardó, pero no se pudo generar el enlace de Meet: ${meetErr.message || "error desconocido"}.`);
                      }
                    }
                  }

                  setAgendaEvents(prev => [savedEvent, ...(prev || [])]);
                  setShowAgendaForm(false);
                  setAgendaForm({ title: "", type: "cita", start_at: "", end_at: "", all_day: false, description: "", status: "pendiente", with_meet: false, guest_email: linkedClient?.email || "" });
                } finally {
                  setAgendaSaving(false);
                }
              };

              return (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400" />
                        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Eventos de agenda</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {exp?.estado !== "cerrado" && (
                          <button
                            onClick={() => {
                              const now = new Date();
                              const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                              setAgendaForm(f => ({ ...f, start_at: local, guest_email: f.guest_email || linkedClient?.email || "" }));
                              setGcalError(null);
                              setShowAgendaForm(v => !v);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            <Plus size={11} /> Nuevo evento
                          </button>
                        )}
                        <Link to="/dashboard/agenda" className="text-xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1">
                          Ver agenda <ChevronRight size={11} />
                        </Link>
                      </div>
                    </div>

                    {/* Aviso de sincronización con Google (persiste aunque el
                        formulario de creación ya se haya cerrado, para que no
                        se pierda de vista en cuanto se guarda el evento) */}
                    {gcalError && (
                      <div className="flex items-start justify-between gap-2 px-5 py-2.5 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-800">
                        <span>{gcalError}</span>
                        <button type="button" onClick={() => setGcalError(null)} className="shrink-0 text-amber-500 hover:text-amber-700">
                          <X size={12} />
                        </button>
                      </div>
                    )}

                    {/* Formulario de creación rápida */}
                    {showAgendaForm && (
                      <form onSubmit={handleCreateEvent} className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="sm:col-span-2">
                            <input
                              autoFocus
                              required
                              value={agendaForm.title}
                              onChange={e => setAgendaForm(f => ({ ...f, title: e.target.value }))}
                              placeholder="Título del evento *"
                              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-400 bg-white"
                            />
                          </div>
                          <div className="flex gap-2">
                            <select
                              value={agendaForm.type}
                              onChange={e => setAgendaForm(f => ({ ...f, type: e.target.value }))}
                              className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-400 bg-white text-slate-700"
                            >
                              <option value="cita">Cita</option>
                              <option value="plazo">Plazo</option>
                              <option value="reunion">Reunión</option>
                              <option value="juicio">Juicio</option>
                              <option value="otro">Otro</option>
                            </select>
                            <select
                              value={agendaForm.status}
                              onChange={e => setAgendaForm(f => ({ ...f, status: e.target.value }))}
                              className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-400 bg-white text-slate-700"
                            >
                              <option value="pendiente">Pendiente</option>
                              <option value="completado">Completado</option>
                              <option value="cancelado">Cancelado</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={agendaForm.all_day}
                                onChange={e => setAgendaForm(f => ({ ...f, all_day: e.target.checked, with_meet: e.target.checked ? false : f.with_meet }))}
                                className="rounded"
                              />
                              Todo el día
                            </label>
                            {!agendaForm.all_day && (
                              gcalToken ? (
                                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={agendaForm.with_meet}
                                    onChange={e => setAgendaForm(f => ({ ...f, with_meet: e.target.checked }))}
                                    className="rounded"
                                  />
                                  <Video size={12} className="text-emerald-600" /> Añadir Google Meet
                                </label>
                              ) : (
                                <button type="button" onClick={connectGcal}
                                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-600 transition-colors">
                                  <Video size={12} /> Conectar Google Meet
                                </button>
                              )
                            )}
                          </div>
                          {agendaForm.with_meet && (
                            <div className="sm:col-span-2">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Invitar por correo (opcional)</label>
                              <input
                                type="email"
                                value={agendaForm.guest_email}
                                onChange={e => setAgendaForm(f => ({ ...f, guest_email: e.target.value }))}
                                placeholder="correo@ejemplo.com"
                                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-400 bg-white mt-1"
                              />
                            </div>
                          )}
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Inicio *</label>
                            <input
                              required
                              type={agendaForm.all_day ? "date" : "datetime-local"}
                              value={agendaForm.all_day ? agendaForm.start_at.slice(0, 10) : agendaForm.start_at}
                              onChange={e => setAgendaForm(f => ({ ...f, start_at: e.target.value }))}
                              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-400 bg-white mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Fin</label>
                            <input
                              type={agendaForm.all_day ? "date" : "datetime-local"}
                              value={agendaForm.all_day ? agendaForm.end_at.slice(0, 10) : agendaForm.end_at}
                              onChange={e => setAgendaForm(f => ({ ...f, end_at: e.target.value }))}
                              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-400 bg-white mt-1"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <input
                              value={agendaForm.description}
                              onChange={e => setAgendaForm(f => ({ ...f, description: e.target.value }))}
                              placeholder="Descripción (opcional)"
                              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-400 bg-white"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button type="submit" disabled={agendaSaving || !agendaForm.title.trim() || !agendaForm.start_at}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl transition-colors">
                            {agendaSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            Guardar evento
                          </button>
                          <button type="button" onClick={() => setShowAgendaForm(false)}
                            className="px-3 py-2 text-xs text-slate-400 hover:text-slate-600">
                            Cancelar
                          </button>
                        </div>
                      </form>
                    )}

                    {agendaLoading ? (
                      <div className="flex items-center justify-center py-10">
                        <Spinner size="sm" muted />
                      </div>
                    ) : expEvents.length === 0 && !showAgendaForm ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-300">
                        <Calendar size={28} className="opacity-30" />
                        <p className="text-sm font-medium text-slate-400">Sin eventos vinculados a este expediente</p>
                        {exp?.estado !== "cerrado" && (
                          <button onClick={() => setShowAgendaForm(true)} className="mt-1 text-xs font-bold text-red-500 hover:underline">
                            + Crear primer evento
                          </button>
                        )}
                      </div>
                    ) : expEvents.length > 0 ? (
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
                          {expEvents.map((e: any) => (
                            <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-5 py-3 text-xs text-slate-700 font-medium">
                                <div className="flex items-center gap-1.5">
                                  {e.title}
                                  {e.meet_url && (
                                    <a href={e.meet_url} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()}
                                      title="Unirse a Google Meet"
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">
                                      <Video size={10} /> Meet
                                    </a>
                                  )}
                                </div>
                              </td>
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
                    ) : null}
                  </div>
                </div>
              );
            })()}
          </div>
          </div>{/* closes col2 */}

          {/* Columna 3: Panel indicadores */}
          {id && (
            <div
              className={`anim-fade-up w-full flex-shrink-0 ${indCollapsed ? "!w-4" : ""} ${isCollapsed ? "md:w-[280px] md:sticky md:top-6" : "lg:w-[280px] xl:w-[300px] lg:sticky lg:top-6"}`}
              style={{ animationDelay: '200ms' }}
            >
              <PanelIndicadoresExpediente
                expedienteId={id}
                onTabChange={(t) => setTab(t as any)}
                collapsed={indCollapsed}
                onToggleCollapsed={toggleIndCollapsed}
              />
            </div>
          )}

        </div>{/* closes inner wrapper */}
      </div>{/* closes 3-col body */}
    </div>
  );
}


