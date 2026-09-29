import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import {
  LifeBuoy, Plus, RefreshCw, Search, X, Send, Mail, AlertTriangle, ChevronLeft,
  MessageSquare, Settings, Check, Loader2, Building2,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { Spinner } from "../components/Spinner";
import { Modal } from "../components/Modal";
import { ConnectionErrorBanner } from "../components/ConnectionErrorBanner";

// ── Tipos ─────────────────────────────────────────────────────────────────────
type Categoria = "incidencia" | "consulta" | "peticion" | "otro";
type Prioridad = "baja" | "media" | "alta" | "urgente";
type Estado = "abierto" | "en_progreso" | "esperando" | "resuelto" | "cerrado";

interface Ticket {
  id: string;
  numero: number;
  asunto: string;
  descripcion: string;
  categoria: Categoria;
  prioridad: Prioridad;
  estado: Estado;
  createdBy: string;
  createdByName: string | null;
  createdByEmail: string | null;
  enviadoA: string | null;
  emailError: string | null;
  mensajesCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface Mensaje {
  id: string;
  userId: string;
  userName: string | null;
  esSoporte: boolean;
  mensaje: string;
  createdAt: string;
}

interface OrgSoporteConfig {
  organizacionId: string;
  nombre: string;
  soporteEmail: string | null;
  tieneCuentaEnvio: boolean;
}

const CATEGORIAS: { id: Categoria; label: string }[] = [
  { id: "incidencia", label: "Incidencia" },
  { id: "consulta", label: "Consulta" },
  { id: "peticion", label: "Petición" },
  { id: "otro", label: "Otro" },
];
const PRIORIDADES: { id: Prioridad; label: string; cls: string }[] = [
  { id: "baja", label: "Baja", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  { id: "media", label: "Media", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  { id: "alta", label: "Alta", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "urgente", label: "Urgente", cls: "bg-red-50 text-red-700 border-red-200" },
];
const ESTADOS: { id: Estado; label: string; cls: string }[] = [
  { id: "abierto", label: "Abierto", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "en_progreso", label: "En progreso", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  { id: "esperando", label: "Esperando respuesta", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "resuelto", label: "Resuelto", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  { id: "cerrado", label: "Cerrado", cls: "bg-slate-100 text-slate-500 border-slate-200" },
];
const ACTIVOS: Estado[] = ["abierto", "en_progreso", "esperando"];

const ref = (n: number) => `#${String(n).padStart(4, "0")}`;
const fmt = (d: string) => new Date(d).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Badge({ list, id }: { list: { id: string; label: string; cls: string }[]; id: string }) {
  const item = list.find((x) => x.id === id);
  if (!item) return null;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${item.cls}`}>{item.label}</span>;
}

const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100";
const btnPrimary = "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-colors";
const btnSecondary = "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 transition-colors";

export default function Soporte() {
  const { getToken } = useAuth();
  const [tab, setTab] = useState<"tickets" | "config">("tickets");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [esGestor, setEsGestor] = useState(false);
  const [soporteEmail, setSoporteEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshSpin, setRefreshSpin] = useState(false);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState<"activos" | "todos" | Estado>("activos");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async (spin = false) => {
    if (spin) setRefreshSpin(true);
    setError("");
    try {
      const d = await apiFetch("/api/soporte/tickets", { getToken });
      if (!d?.success) throw new Error(d?.error || "Error al cargar los tickets");
      setTickets(d.data.tickets || []);
      setEsGestor(Boolean(d.data.esGestor));
      setSoporteEmail(d.data.soporteEmail || null);
    } catch (e: any) {
      setError(e.message || "Error al cargar los tickets");
    } finally {
      setLoading(false);
      setRefreshSpin(false);
    }
  }, [getToken]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filtro === "activos" && !ACTIVOS.includes(t.estado)) return false;
      if (filtro !== "activos" && filtro !== "todos" && t.estado !== filtro) return false;
      if (!q) return true;
      return t.asunto.toLowerCase().includes(q) || ref(t.numero).includes(q) || (t.createdByName || "").toLowerCase().includes(q);
    });
  }, [tickets, filtro, search]);

  const onTicketChanged = (t: Ticket) => setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...t } : x)));

  if (loading) return (
    <div className="w-full min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <Spinner size="xl" label="Cargando centro de soporte..." />
    </div>
  );

  if (error) return (
    <div className="w-full min-h-[60vh] flex flex-col items-center justify-center p-10">
      <ConnectionErrorBanner error={error} onRetry={() => load()} title="No se ha podido cargar el centro de soporte" />
    </div>
  );

  const abiertos = tickets.filter((t) => ACTIVOS.includes(t.estado)).length;

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden animate-page-in">
      {/* ── CABECERA ─────────────────────────────────────────── */}
      <div className="px-6 lg:px-8 py-5 border-b border-slate-200 bg-white flex-shrink-0 z-10 animate-card-in">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-red-50 border border-red-100">
              <LifeBuoy size={18} className="text-red-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold text-slate-900 leading-tight">Centro de soporte</h1>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                <span className="font-semibold text-slate-700">{abiertos}</span> {abiertos === 1 ? "ticket activo" : "tickets activos"}
                {esGestor && (
                  <> · Los tickets llegan a <span className="font-semibold text-slate-700">{soporteEmail || "— sin correo configurado —"}</span></>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => load(true)} title="Refrescar"
              className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-all">
              <RefreshCw size={14} className={refreshSpin ? "animate-spin" : ""} />
            </button>
            <button onClick={() => setShowNew(true)} className={btnPrimary}>
              <Plus size={14} /> <span className="hidden sm:inline">Nuevo ticket</span>
            </button>
          </div>
        </div>
        {esGestor && (
          <div className="flex gap-1 mt-4 -mb-5">
            {([["tickets", "Tickets", MessageSquare], ["config", "Correos de soporte", Settings]] as const).map(([id, label, Icon]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold border-b-2 transition-colors ${
                  tab === id ? "border-red-500 text-red-600" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "config" && esGestor ? (
        <SoporteConfig onSaved={() => load()} />
      ) : (
        <div className="flex-1 min-h-0 flex">
          {/* ── LISTA ─────────────────────────────────────────── */}
          <div className={`${selectedId ? "hidden md:flex" : "flex"} w-full md:w-[380px] lg:w-[420px] shrink-0 flex-col border-r border-slate-200 bg-white min-h-0`}>
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-col gap-2">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por asunto, nº o usuario..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 placeholder:text-slate-300" />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"><X size={11} /></button>
                )}
              </div>
              <select value={filtro} onChange={(e) => setFiltro(e.target.value as any)}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-red-400">
                <option value="activos">Activos (abiertos, en progreso, esperando)</option>
                <option value="todos">Todos</option>
                {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="py-16 px-6 flex flex-col items-center gap-3 text-slate-400 text-center">
                  <LifeBuoy size={36} className="opacity-15" />
                  <p className="font-medium text-sm">{tickets.length ? "No hay tickets con este filtro" : "Todavía no hay tickets"}</p>
                  {!tickets.length && (
                    <button onClick={() => setShowNew(true)} className="text-red-600 text-xs font-bold hover:underline">+ Abrir el primer ticket</button>
                  )}
                </div>
              ) : filtered.map((t) => (
                <button key={t.id} onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors border-l-2 ${
                    selectedId === t.id ? "bg-red-50 border-l-red-500" : "border-l-transparent hover:bg-slate-50"
                  }`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-bold text-slate-400">{ref(t.numero)}</span>
                    <div className="flex items-center gap-1">
                      {esGestor && t.emailError && <span title={`Correo no enviado: ${t.emailError}`}><AlertTriangle size={12} className="text-amber-500" /></span>}
                      <Badge list={PRIORIDADES} id={t.prioridad} />
                      <Badge list={ESTADOS} id={t.estado} />
                    </div>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-800 truncate">{t.asunto}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span className="truncate">{esGestor ? t.createdByName : CATEGORIAS.find((c) => c.id === t.categoria)?.label}</span>
                    <span className="shrink-0 flex items-center gap-2">
                      {!!t.mensajesCount && <span className="inline-flex items-center gap-0.5"><MessageSquare size={10} /> {t.mensajesCount}</span>}
                      {fmt(t.updatedAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── DETALLE ───────────────────────────────────────── */}
          <div className={`${selectedId ? "flex" : "hidden md:flex"} flex-1 min-w-0 min-h-0 flex-col bg-slate-50`}>
            {selectedId ? (
              <TicketDetail key={selectedId} id={selectedId} esGestor={esGestor} onBack={() => setSelectedId(null)} onChanged={onTicketChanged} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
                <MessageSquare size={36} className="opacity-15" />
                <p className="text-sm font-medium">Selecciona un ticket para ver la conversación</p>
              </div>
            )}
          </div>
        </div>
      )}

      <NuevoTicketModal open={showNew} onClose={() => setShowNew(false)}
        onCreated={(t) => { setTickets((prev) => [t, ...prev]); setSelectedId(t.id); setFiltro("activos"); setTab("tickets"); }} />
    </div>
  );
}

// ── Nuevo ticket ──────────────────────────────────────────────────────────────
function NuevoTicketModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (t: Ticket) => void }) {
  const { getToken } = useAuth();
  const [asunto, setAsunto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("incidencia");
  const [prioridad, setPrioridad] = useState<Prioridad>("media");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setAsunto(""); setDescripcion(""); setCategoria("incidencia"); setPrioridad("media"); setError(""); }
  }, [open]);

  const submit = async () => {
    if (!asunto.trim() || !descripcion.trim()) { setError("El asunto y la descripción son obligatorios."); return; }
    setSaving(true);
    setError("");
    try {
      const d = await apiFetch("/api/soporte/tickets", {
        getToken, method: "POST", body: JSON.stringify({ asunto, descripcion, categoria, prioridad }),
      });
      if (!d?.success) throw new Error(d?.error || "No se pudo crear el ticket");
      onCreated(d.data);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuevo ticket de soporte" subtitle="Se enviará al equipo de soporte de tu organización"
      icon={<LifeBuoy size={18} />} maxWidth="max-w-xl"
      footer={<>
        <button onClick={onClose} className={btnSecondary}>Cancelar</button>
        <button onClick={submit} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar ticket
        </button>
      </>}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Asunto</label>
          <input value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={200} autoFocus
            placeholder="Ej.: No puedo abrir los documentos de un expediente" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Categoría</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)} className={inputCls}>
              {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Prioridad</label>
            <select value={prioridad} onChange={(e) => setPrioridad(e.target.value as Prioridad)} className={inputCls}>
              {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Descripción</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={7}
            placeholder="Describe qué ocurre, qué estabas haciendo y, si aparece, el mensaje de error." className={`${inputCls} resize-y`} />
        </div>
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

// ── Detalle / conversación ────────────────────────────────────────────────────
function TicketDetail({ id, esGestor, onBack, onChanged }: {
  id: string; esGestor: boolean; onBack: () => void; onChanged: (t: Ticket) => void;
}) {
  const { getToken } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await apiFetch(`/api/soporte/tickets/${id}`, { getToken });
      if (!d?.success) throw new Error(d?.error || "No se pudo cargar el ticket");
      setTicket(d.data.ticket);
      setMensajes(d.data.mensajes || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => { void load(); }, [load]);

  const applyTicket = (t: Ticket) => { setTicket(t); onChanged(t); };

  const patch = async (body: Partial<Pick<Ticket, "estado" | "prioridad">>) => {
    const d = await apiFetch(`/api/soporte/tickets/${id}`, { getToken, method: "PATCH", body: JSON.stringify(body) });
    if (d?.success) applyTicket(d.data);
    else setError(d?.error || "No se pudo actualizar el ticket");
  };

  const enviar = async () => {
    if (!respuesta.trim()) return;
    setSending(true);
    try {
      const d = await apiFetch(`/api/soporte/tickets/${id}/mensajes`, { getToken, method: "POST", body: JSON.stringify({ mensaje: respuesta }) });
      if (!d?.success) throw new Error(d?.error || "No se pudo enviar la respuesta");
      setMensajes((prev) => [...prev, d.data.mensaje]);
      applyTicket({ ...d.data.ticket, mensajesCount: mensajes.length + 1 });
      setRespuesta("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const reenviar = async () => {
    setResending(true);
    try {
      const d = await apiFetch(`/api/soporte/tickets/${id}/reenviar`, { getToken, method: "POST" });
      if (d?.success) applyTicket(d.data);
    } finally {
      setResending(false);
    }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Spinner size="lg" /></div>;
  if (!ticket) return <div className="flex-1 flex items-center justify-center text-sm text-red-600">{error || "Ticket no encontrado"}</div>;

  const cerrado = ticket.estado === "cerrado" || ticket.estado === "resuelto";

  return (
    <>
      <div className="px-5 py-4 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="md:hidden p-1.5 -ml-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><ChevronLeft size={18} /></button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-mono font-bold text-slate-400">{ref(ticket.numero)} · {CATEGORIAS.find((c) => c.id === ticket.categoria)?.label}</p>
            <h2 className="text-base font-extrabold text-slate-900 break-words">{ticket.asunto}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Abierto por <span className="font-semibold">{ticket.createdByName}</span> el {fmt(ticket.createdAt)}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {esGestor ? (
            <>
              <select value={ticket.estado} onChange={(e) => patch({ estado: e.target.value as Estado })}
                className="px-2 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-red-400">
                {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
              <select value={ticket.prioridad} onChange={(e) => patch({ prioridad: e.target.value as Prioridad })}
                className="px-2 py-1 text-xs font-semibold border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-red-400">
                {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>Prioridad {p.label.toLowerCase()}</option>)}
              </select>
            </>
          ) : (
            <>
              <Badge list={ESTADOS} id={ticket.estado} />
              <Badge list={PRIORIDADES} id={ticket.prioridad} />
            </>
          )}
        </div>
        {!esGestor ? null : ticket.emailError ? (
          <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span className="flex-1">No se pudo enviar por correo al soporte: {ticket.emailError}</span>
            <button onClick={reenviar} disabled={resending} className="shrink-0 font-bold underline disabled:opacity-50">
              {resending ? "Enviando…" : "Reintentar"}
            </button>
          </div>
        ) : ticket.enviadoA ? (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400"><Mail size={11} /> Enviado a {ticket.enviadoA}</p>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-3">
        <MessageBubble nombre={ticket.createdByName || "Usuario"} fecha={ticket.createdAt} texto={ticket.descripcion} soporte={false} />
        {mensajes.map((m) => (
          <MessageBubble key={m.id} nombre={m.userName || "Usuario"} fecha={m.createdAt} texto={m.mensaje} soporte={m.esSoporte} />
        ))}
      </div>

      <div className="p-4 border-t border-slate-200 bg-white shrink-0">
        {error && <p className="text-xs font-semibold text-red-600 mb-2">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void enviar(); }}
            placeholder={cerrado ? "Responder reabrirá el ticket..." : "Escribe una respuesta... (Ctrl+Enter para enviar)"}
            className={`${inputCls} resize-none`} />
          <button onClick={enviar} disabled={sending || !respuesta.trim()} className={btnPrimary}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </>
  );
}

function MessageBubble({ nombre, fecha, texto, soporte }: { nombre: string; fecha: string; texto: string; soporte: boolean }) {
  return (
    <div className={`flex ${soporte ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 border ${soporte ? "bg-white border-slate-200" : "bg-red-50 border-red-100"}`}>
        <p className="text-[11px] font-bold text-slate-500 mb-1">
          {nombre}{soporte && <span className="ml-1.5 text-[9px] uppercase tracking-wider text-sky-600">Soporte</span>}
          <span className="font-normal text-slate-400"> · {fmt(fecha)}</span>
        </p>
        <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{texto}</p>
      </div>
    </div>
  );
}

// ── Configuración: correo de soporte por organización ────────────────────────
function SoporteConfig({ onSaved }: { onSaved: () => void }) {
  const { getToken } = useAuth();
  const [orgs, setOrgs] = useState<OrgSoporteConfig[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const d = await apiFetch("/api/soporte/config", { getToken });
      if (d?.success) {
        setOrgs(d.data);
        setDrafts(Object.fromEntries(d.data.map((o: OrgSoporteConfig) => [o.organizacionId, o.soporteEmail || ""])));
      }
      setLoading(false);
    })();
  }, [getToken]);

  const save = async (orgId: string) => {
    setSavingId(orgId);
    setErrors((p) => ({ ...p, [orgId]: "" }));
    try {
      const d = await apiFetch(`/api/soporte/config/${orgId}`, {
        getToken, method: "PUT", body: JSON.stringify({ soporteEmail: drafts[orgId] || "" }),
      });
      if (!d?.success) throw new Error(d?.error || "No se pudo guardar");
      setOrgs((prev) => prev.map((o) => (o.organizacionId === orgId ? { ...o, soporteEmail: d.data.soporteEmail } : o)));
      setSavedId(orgId);
      setTimeout(() => setSavedId((s) => (s === orgId ? null : s)), 2000);
      onSaved();
    } catch (e: any) {
      setErrors((p) => ({ ...p, [orgId]: e.message }));
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <div>
          <h2 className="text-sm font-extrabold text-slate-800">Correo de soporte por organización</h2>
          <p className="text-xs text-slate-500 mt-1">
            Los tickets que se abran en cada organización se enviarán a este correo. El envío sale desde la primera cuenta de correo configurada en esa organización.
          </p>
        </div>
        {orgs.map((o) => {
          const dirty = (drafts[o.organizacionId] || "") !== (o.soporteEmail || "");
          return (
            <div key={o.organizacionId} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={15} className="text-slate-400" />
                <span className="text-sm font-bold text-slate-800">{o.nombre}</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="email" value={drafts[o.organizacionId] || ""} placeholder="soporte@tudespacho.com"
                    onChange={(e) => setDrafts((p) => ({ ...p, [o.organizacionId]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter" && dirty) void save(o.organizacionId); }}
                    className={`${inputCls} pl-8`} />
                </div>
                <button onClick={() => save(o.organizacionId)} disabled={!dirty || savingId === o.organizacionId} className={btnPrimary}>
                  {savingId === o.organizacionId ? <Loader2 size={14} className="animate-spin" /> : savedId === o.organizacionId ? <Check size={14} /> : null}
                  {savedId === o.organizacionId ? "Guardado" : "Guardar"}
                </button>
              </div>
              {errors[o.organizacionId] && <p className="mt-2 text-xs font-semibold text-red-600">{errors[o.organizacionId]}</p>}
              {!o.soporteEmail && !errors[o.organizacionId] && (
                <p className="mt-2 text-[11px] text-amber-700">Sin correo configurado: los tickets se guardan pero no se envían por correo.</p>
              )}
              {!o.tieneCuentaEnvio && (
                <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-700">
                  <AlertTriangle size={11} /> Esta organización no tiene ninguna cuenta de correo activa desde la que enviar (Correo → añadir cuenta).
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
