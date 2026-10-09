import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, Bell, BellOff, Search, CalendarCheck, Check, CheckCircle2, ChevronDown, Clock, Eye, FileText, Gavel, Loader2,
  Mail, Paperclip, RefreshCw, RotateCcw, Settings, Undo2, X, XCircle,
} from "lucide-react";
import { apiFetch, resolveApiUrl } from "../lib/api";
import { FilePreviewModal } from "../components/FilePreviewModal";
import { notifyVistasChanged, useVistasStatus } from "../lib/useVistasStatus";
import { usePushNotifications } from "../lib/usePushNotifications";

// ── Vistas recibidas por correo ──────────────────────────────────────────────
// Página de la automatización de vistas (Configuración → Automatizaciones):
// aquí el abogado revisa lo que el sistema ha detectado en el correo, ve si
// choca con su agenda y acepta o rechaza. Aceptar/rechazar responde al
// remitente y, al aceptar, crea expediente, evento, documentos y recordatorio
// (todo en el backend, controllers/vistasController.ts).

type Estado = "pendiente" | "procesando" | "error" | "aceptada" | "rechazada" | "descartada" | "documentada" | "modificada" | "cancelada";
type Tipo = "vista" | "cambio" | "documentacion" | "cancelacion";
interface Relacion {
  autos: string | null;
  nig: string | null;
  expediente: { id: string; anio: number; num_exp: number; descripcion: string | null; num_autos: string | null; cliente_nombre: string | null } | null;
  vista: { id: string; fecha_vista: string; agenda_event_id: string | null; juzgado: string | null } | null;
}
type Paso = { paso: string; ok: boolean; detalle: string };
type Conflicto = { id: string; title: string; start_at: string; end_at: string | null; all_day: boolean; type: string };

interface Solicitud {
  id: string;
  expediente_ref?: string | null;
  estado: Estado;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  received_at: string | null;
  datos: Record<string, any>;
  extraccion_origen: string | null;
  fecha_vista: string | null;
  duracion_min: number | null;
  responsable_user_id: string | null;
  responsable_nombre: string | null;
  conflictos: Conflicto[];
  expediente_id: string | null;
  recordatorio_at: string | null;
  recordatorio_enviado_at: string | null;
  pasos: Paso[];
  error: string | null;
  decidido_por_nombre: string | null;
  decidido_at: string | null;
  created_at: string;
  tipo: Tipo;
  relacion: Relacion | null;
}

interface Detalle extends Solicitud {
  /** Cómo está AHORA la vista con la que se relaciona el correo (puede haber
   *  cambiado de fecha o haberse cancelado después de llegar el correo). */
  vistaActual?: { estado: string; fecha_vista: string | null } | null;
  body_text: string | null;
  adjuntos: { index: number; filename: string; contentType: string; size: number }[];
  emailDisponible: boolean;
  coincidencias: { id: string; anio: number; num_exp: number; descripcion: string | null; juzgado: string | null; num_autos: string | null; cliente_nombre: string | null }[];
  miembros: { userId: string; nombre: string; rol: string }[];
  expediente: { id: string; anio: number; num_exp: number; descripcion: string | null } | null;
  defaults: { duracionMin: number; recordatorioDias: number; recordatorioHora: string; guardarAdjuntos: boolean; responsableUserId: string | null };
}

const PERIODOS: { key: string; label: string }[] = [
  { key: "", label: "Cualquier fecha" },
  { key: "proximas", label: "Próximas" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mes" },
  { key: "pasadas", label: "Pasadas" },
];

const TABS: { key: string; label: string }[] = [
  { key: "pendiente", label: "Pendientes" },
  { key: "aceptada", label: "Aceptadas" },
  { key: "rechazada", label: "Rechazadas" },
  { key: "cancelada", label: "Canceladas" },
  { key: "descartada", label: "Descartadas" },
];

const ESTADO_BADGE: Record<Estado, { label: string; cls: string }> = {
  pendiente: { label: "Por confirmar", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  procesando: { label: "Procesando…", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  error: { label: "Con errores", cls: "bg-red-50 text-red-700 border-red-200" },
  aceptada: { label: "Aceptada", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rechazada: { label: "Rechazada", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  descartada: { label: "Descartada", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  documentada: { label: "Documentación añadida", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  modificada: { label: "Vista modificada", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelada: { label: "Cancelada", cls: "bg-slate-100 text-slate-500 border-slate-200 line-through" },
};

// Qué es cada correo: señalamiento nuevo, cambio de una vista ya aceptada
// (mismos autos, otra fecha) o documentación de un procedimiento conocido.
const TIPO_BADGE: Record<Tipo, { label: string; cls: string }> = {
  vista: { label: "Vista nueva", cls: "bg-red-50 text-red-700" },
  cambio: { label: "Cambio de vista", cls: "bg-violet-50 text-violet-700" },
  documentacion: { label: "Documentación", cls: "bg-sky-50 text-sky-700" },
  cancelacion: { label: "Cancelación", cls: "bg-rose-50 text-rose-700" },
};

const PASO_LABEL: Record<string, string> = {
  correo: "Correo de respuesta", expediente: "Expediente", agenda: "Agenda", documentos: "Documentación", recordatorio: "Recordatorio",
  nota: "Nota en el expediente", cancelada: "Cancelación",
};

function fmtFecha(iso: string | null, withTime = true) {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleString("es-ES", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** ISO → valor de <input type="datetime-local"> en la hora local del navegador. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

// Lo ya cargado se enseña al instante (al volver a la página, cambiar de
// pestaña o de vista) y se actualiza en segundo plano, sin spinners.
const listaCache = new Map<string, Solicitud[]>();
const detalleCache = new Map<string, Detalle>();
const mismo = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function ListaSkeleton() {
  return (
    <div className="anim-fade-in">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="px-4 py-3 border-b border-slate-100 space-y-2">
          <div className="flex justify-between gap-2"><div className="h-3.5 w-40 rounded bg-slate-100 animate-pulse" /><div className="h-3.5 w-16 rounded-full bg-slate-100 animate-pulse" /></div>
          <div className="h-3 w-56 rounded bg-slate-100 animate-pulse" />
          <div className="h-2.5 w-32 rounded bg-slate-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function DetalleSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4 anim-fade-in">
      <div className="h-6 w-64 rounded bg-slate-200/70 animate-pulse" />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
        <div className="h-7 w-72 rounded bg-slate-100 animate-pulse" />
        <div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-3.5 rounded bg-slate-100 animate-pulse" />)}</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-3.5 w-3/4 rounded bg-slate-100 animate-pulse" />)}</div>
    </div>
  );
}

/** Sin notificaciones push activadas en este navegador no llega ningún aviso
 *  de vista nueva fuera de la campana: se ofrece activarlas aquí mismo. */
function AvisoNotificaciones() {
  const push = usePushNotifications();
  const [hecho, setHecho] = useState(false);
  const [fallo, setFallo] = useState(false);
  if (hecho) {
    return (
      <div className="px-6 lg:px-8 py-2 bg-emerald-50 border-b border-emerald-100 text-xs font-semibold text-emerald-800 flex items-center gap-2">
        <CheckCircle2 size={14} /> Notificaciones activadas: te avisaremos de cada vista nueva, cambio o cancelación.
      </div>
    );
  }
  if (push.supported && push.serverEnabled && push.permission === "denied") {
    return (
      <div className="px-6 lg:px-8 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-900 flex items-center gap-2">
        <BellOff size={14} className="shrink-0" />
        <span>Las notificaciones están <b>bloqueadas</b> en este navegador, así que no te llegarán avisos de vistas. Pulsa el candado junto a la dirección → <b>Notificaciones</b> → <b>Permitir</b>, y recarga la página.</span>
      </div>
    );
  }
  if (!push.canOffer) return null;
  return (
    <div className="px-6 lg:px-8 py-2 bg-red-50 border-b border-red-100 text-xs text-red-900 flex flex-wrap items-center gap-x-3 gap-y-1">
      <Bell size={14} className="shrink-0" />
      <span className="flex-1 min-w-[200px]">Activa las notificaciones para enterarte <b>al momento</b> de cada vista nueva, cambio o cancelación, aunque no tengas Vantia abierta.</span>
      {fallo && <span className="text-red-700">No se pudo activar. Revisa el permiso del navegador.</span>}
      <button type="button" disabled={push.busy}
        onClick={async () => { const ok = await push.subscribe(); setHecho(ok); setFallo(!ok); }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 font-bold text-white hover:bg-red-700 disabled:opacity-50">
        {push.busy ? <Loader2 size={13} className="animate-spin" /> : <Bell size={13} />} Activar notificaciones
      </button>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100";

export default function Vistas() {
  // El módulo solo existe con la automatización activada (Ajustes → Automatizaciones).
  const { visible, loaded } = useVistasStatus();
  if (!loaded) return <div className="h-full" />;
  if (!visible) return <Navigate to="/dashboard" replace />;
  return <VistasModulo />;
}

function VistasModulo() {
  const { getToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState("pendiente");
  // Buscador: lo que se escribe, y lo que se busca (con un pequeño retardo).
  const [busqueda, setBusqueda] = useState("");
  const [q, setQ] = useState("");
  const [periodo, setPeriodo] = useState("");
  const buscadorRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = window.setTimeout(() => setQ(busqueda.trim()), 250); return () => window.clearTimeout(t); }, [busqueda]);
  // "/" lleva al buscador (si no se está escribiendo en otro campo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) { e.preventDefault(); buscadorRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Cada combinación pestaña + búsqueda + periodo tiene su caché.
  const clave = `${tab}|${q}|${periodo}`;
  const [items, setItems] = useState<Solicitud[]>(() => listaCache.get("pendiente||") || []);
  // Primera carga de la pestaña (nada que enseñar todavía) / refresco en curso.
  const [primeraCarga, setPrimeraCarga] = useState(() => !listaCache.has("pendiente||"));
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const selectedId = searchParams.get("id");
  const tabActual = useRef(clave);
  tabActual.current = clave;

  const loadList = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const qs = new URLSearchParams({ estado: tab, ...(q ? { q } : {}), ...(periodo ? { periodo } : {}) });
      const data = await apiFetch(`/api/vistas?${qs}`, { getToken });
      if (data?.success === false) throw new Error(data.error);
      const nuevos: Solicitud[] = data.data || [];
      listaCache.set(clave, nuevos);
      // Respuesta de una pestaña/búsqueda de la que ya se ha salido: solo a la caché.
      if (tabActual.current !== clave) return;
      // Solo se repinta si algo cambió: sin saltos en cada refresco.
      setItems((prev) => (mismo(prev, nuevos) ? prev : nuevos));
      setListError("");
    } catch (e: any) {
      if (!silencioso) setListError(e.message || "No se pudieron cargar las vistas");
    } finally {
      if (tabActual.current === clave) { setLoading(false); setPrimeraCarga(false); }
    }
  }, [getToken, tab, q, periodo, clave]);

  // Al cambiar de pestaña, búsqueda o periodo: lo que hubiera en caché al instante, y a refrescar.
  useEffect(() => {
    const cached = listaCache.get(clave);
    setItems(cached || []);
    setPrimeraCarga(!cached);
    void loadList(true);
  }, [clave, loadList]);

  // Refresco silencioso: cuando algo cambia (vista nueva, aceptar...), cada
  // 30 s y al volver a la pestaña del navegador.
  useEffect(() => {
    const refrescar = () => { if (document.visibilityState === "visible") void loadList(true); };
    const t = window.setInterval(refrescar, 30_000);
    window.addEventListener("vistas:changed", refrescar);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("vistas:changed", refrescar);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, [loadList]);

  const select = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("id", id); else next.delete("id");
    setSearchParams(next, { replace: true });
  };

  const onChanged = () => { void loadList(true); notifyVistasChanged(); };

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden animate-page-in">
      <div className="px-6 lg:px-8 py-5 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-red-50 border border-red-100">
              <CalendarCheck size={18} className="text-red-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold text-slate-900 leading-tight">Vistas por correo</h1>
              <p className="text-xs text-slate-500 mt-0.5 truncate">Señalamientos detectados automáticamente en el buzón de la organización</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/dashboard/config?section=automatizaciones" title="Configurar automatización"
              className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-all">
              <Settings size={15} />
            </Link>
            <button onClick={() => void loadList()} title="Actualizar"
              className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-all">
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </div>

      <AvisoNotificaciones />

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row bg-white">
        {/* Lista */}
        <div className={`lg:w-96 lg:shrink-0 border-r border-slate-200 flex flex-col min-h-0 ${selectedId ? "hidden lg:flex" : "flex"}`}>
          {/* Buscador */}
          <div className="px-3 pt-3 pb-2 border-b border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input ref={buscadorRef} value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setBusqueda(""); }}
                placeholder="Buscar autos, cliente…"
                title="Busca por autos, NIG, juzgado, localidad, remitente, cliente, expediente o fecha. Atajo: tecla /"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-8 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-100" />
              {busqueda && (
                <button type="button" onClick={() => { setBusqueda(""); buscadorRef.current?.focus(); }} title="Borrar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={13} /></button>
              )}
            </div>
            {/* Filtro por fecha: desplegable compacto (antes, chips con barra de scroll). */}
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} title="Filtrar por fecha de la vista"
              className={`shrink-0 rounded-lg border py-2 pl-2 pr-6 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-red-100 ${periodo ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-600"}`}>
              {PERIODOS.map((p) => <option key={p.key || "todas"} value={p.key}>{p.label}</option>)}
            </select>
            </div>
          </div>
          {q ? (
            <div className="px-4 py-2 border-b border-slate-200 bg-white text-[11px] text-slate-500 flex items-center justify-between gap-2">
              <span>Buscando «<b className="text-slate-700">{q}</b>» en todas las listas{!primeraCarga ? ` · ${items.length}${items.length === 200 ? "+" : ""} resultado${items.length === 1 ? "" : "s"}` : ""}</span>
              <button type="button" onClick={() => setBusqueda("")} className="font-semibold text-red-600 hover:underline">Quitar</button>
            </div>
          ) : (
            <div className="px-2 py-1.5 border-b border-slate-200 bg-slate-50 grid grid-cols-5 gap-0.5">
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} title={t.label}
                  className={`min-w-0 truncate px-1 py-1.5 rounded-lg text-[11px] font-bold tracking-tight transition-colors ${tab === t.key ? "bg-white text-red-700 border border-slate-200 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {listError && <p className="m-4 text-sm text-red-600">{listError}</p>}
            {primeraCarga && !listError && <ListaSkeleton />}
            {!primeraCarga && !listError && items.length === 0 && (
              <div className="py-16 px-6 flex flex-col items-center gap-3 text-slate-400 text-center">
                <Gavel size={36} className="opacity-15" />
                <p className="font-medium text-sm">{q ? `Nada coincide con «${q}»` : periodo ? "No hay vistas en ese periodo" : tab === "pendiente" ? "No hay vistas pendientes de confirmar" : "No hay vistas en esta lista"}</p>
                {(q || periodo) && <p className="text-xs">Prueba con los autos (p. ej. 945/23), el juzgado, el cliente o la fecha.</p>}
              </div>
            )}
            {items.map((s) => {
              const badge = ESTADO_BADGE[s.estado] || ESTADO_BADGE.pendiente;
              const conflict = (s.estado === "pendiente" || s.estado === "error") && s.conflictos?.length > 0;
              return (
                <button key={s.id} onClick={() => select(s.id)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${selectedId === s.id ? "bg-red-50/60" : "hover:bg-slate-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-800 truncate">{fmtFecha(s.fecha_vista)}</span>
                    <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <p className="text-xs text-slate-600 truncate mt-0.5">
                    {s.tipo && s.tipo !== "vista" && <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${TIPO_BADGE[s.tipo].cls}`}>{TIPO_BADGE[s.tipo].label}</span>}
                    {s.datos?.juzgado || s.subject || "(sin asunto)"}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                    <span className="truncate">{s.from_name || s.from_email}</span>
                    {s.datos?.num_autos && <span className="shrink-0">· autos {s.datos.num_autos}</span>}
                    {s.expediente_ref && <span className="shrink-0">· exp. {s.expediente_ref}</span>}
                  </div>
                  {conflict && (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                      <AlertTriangle size={11} /> Choca con {s.conflictos.length} evento{s.conflictos.length === 1 ? "" : "s"} de la agenda
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Detalle */}
        <div className={`flex-1 min-h-0 overflow-y-auto bg-[#f4f6f8] ${selectedId ? "block" : "hidden lg:block"}`}>
          {selectedId
            ? <VistaDetalle key={selectedId} id={selectedId} onClose={() => select(null)} onChanged={onChanged} />
            : (
              <div className="h-full flex flex-col items-center justify-center text-center p-10 text-slate-400">
                <CalendarCheck size={40} className="opacity-15 mb-3" />
                <p className="text-sm font-medium">Elige una vista de la lista para revisarla</p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

function VistaDetalle({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { getToken } = useAuth();
  const [d, setD] = useState<Detalle | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<"" | "aceptar" | "rechazar" | "descartar" | "reabrir" | "documentar" | "modificar" | "cancelar" | "aplicar-cancelacion">("");
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  // Opcional al cancelar: cerrar también el expediente (una vista suspendida
  // no siempre significa que el asunto haya terminado).
  const [cerrarExpediente, setCerrarExpediente] = useState(false);
  // Para correos de un procedimiento conocido, el formulario de vista nueva
  // solo aparece si se elige "Es una vista nueva".
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [actionError, setActionError] = useState("");
  const [resultado, setResultado] = useState<Paso[] | null>(null);
  const [showBody, setShowBody] = useState(false);

  // Formulario
  const [fecha, setFecha] = useState("");
  const [duracion, setDuracion] = useState(120);
  const [tipoActo, setTipoActo] = useState("");
  const [juzgado, setJuzgado] = useState("");
  const [sala, setSala] = useState("");
  const [autos, setAutos] = useState("");
  const [nig, setNig] = useState("");
  const [direccion, setDireccion] = useState("");
  const [localidad, setLocalidad] = useState("");
  const [expModo, setExpModo] = useState<"nuevo" | "existente">("nuevo");
  const [expId, setExpId] = useState("");
  const [guardarAdjuntos, setGuardarAdjuntos] = useState(true);
  const [conRecordatorio, setConRecordatorio] = useState(true);
  const [recordatorio, setRecordatorio] = useState("");
  const [enviarCorreo, setEnviarCorreo] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const [modoRespuesta, setModoRespuesta] = useState<null | "aceptar" | "rechazar">(null);
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [firmaRegistrada, setFirmaRegistrada] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [conflictos, setConflictos] = useState<Conflicto[]>([]);
  const [checking, setChecking] = useState(false);

  const aplicar = useCallback((v: Detalle) => {
      setD(v);
      setFecha(toLocalInput(v.fecha_vista));
      setDuracion(v.duracion_min || v.defaults.duracionMin);
      setTipoActo(v.datos?.tipo_acto || "");
      setJuzgado(v.datos?.juzgado || "");
      setSala(v.datos?.sala || "");
      setAutos(v.datos?.num_autos || "");
      setNig(v.datos?.nig || "");
      setDireccion(v.datos?.direccion || "");
      setLocalidad(v.datos?.localidad || "");
      if (v.expediente_id) { setExpModo("existente"); setExpId(v.expediente_id); }
      else if (v.coincidencias.length) { setExpModo("existente"); setExpId(v.coincidencias[0].id); }
      setGuardarAdjuntos(v.defaults.guardarAdjuntos);
      setRecordatorio(toLocalInput(v.recordatorio_at));
      // Si un intento anterior ya envió el correo, no se vuelve a enviar al reintentar.
      // En un cambio de fecha no se responde por defecto (09/10/2026: la confirmación
      // volvía al buzón y se generaba otra solicitud). Sigue siendo opcional.
      setEnviarCorreo(v.tipo !== "cambio" && !(v.pasos || []).some((p) => p.paso === "correo" && p.ok));
      setConflictos(v.conflictos || []);
      setMostrarFormulario(v.tipo === "vista" || !v.relacion);
  }, []);

  // silencioso: si ya se enseña lo de la caché, solo se aplica lo nuevo si
  // algo cambió (no pisa lo que el usuario esté escribiendo).
  const load = useCallback(async (silencioso = false) => {
    try {
      const data = await apiFetch(`/api/vistas/${id}`, { getToken });
      if (data?.success === false) throw new Error(data.error);
      const v: Detalle = data.data;
      const previo = detalleCache.get(id);
      detalleCache.set(id, v);
      if (!silencioso || !previo || !mismo(previo, v)) aplicar(v);
      setLoadError("");
    } catch (e: any) {
      if (!detalleCache.has(id)) setLoadError(e.message || "No se pudo cargar la vista");
    }
  }, [getToken, id, aplicar]);

  // Lo de la caché antes de pintar (sin parpadeo), y después lo actual.
  useLayoutEffect(() => {
    const cached = detalleCache.get(id);
    if (cached) aplicar(cached);
  }, [id, aplicar]);
  useEffect(() => { void load(Boolean(detalleCache.get(id))); }, [id, load]);

  const editable = d && (d.estado === "pendiente" || d.estado === "error" || d.estado === "descartada");

  // Comprobación del hueco en la agenda, en vivo al cambiar fecha/duración (siempre en la agenda de quien decide).
  useEffect(() => {
    if (!d || !editable) return;
    const iso = fromLocalInput(fecha);
    if (!iso) { setConflictos([]); return; }
    const t = window.setTimeout(async () => {
      setChecking(true);
      try {
        const qs = new URLSearchParams({ fecha: iso, duracion: String(duracion) });
        const data = await apiFetch(`/api/vistas/${id}/conflictos?${qs}`, { getToken });
        if (data?.success) setConflictos(data.data || []);
      } catch { /* se mantiene el último resultado */ } finally {
        setChecking(false);
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [d, editable, fecha, duracion, id, getToken]);

  const formBody = () => ({
    fecha: fromLocalInput(fecha),
    duracion_min: duracion,
    tipo_acto: tipoActo,
    juzgado, sala, num_autos: autos, nig, direccion, localidad,
    mensaje,
  });

  const loadPreview = async (tipo: "aceptar" | "rechazar") => {
    setPreviewLoading(true); setActionError("");
    try {
      const data = await apiFetch(`/api/vistas/${id}/preview`, { method: "POST", getToken, body: JSON.stringify({ tipo, ...formBody() }) });
      if (data?.success === false) throw new Error(data.error);
      setAsunto(data.data.asunto); setCuerpo(data.data.texto); setFirmaRegistrada(data.data.firmaRegistrada || null); setModoRespuesta(tipo);
    } catch (e: any) {
      setActionError(e.message || "No se pudo preparar el correo");
    } finally {
      setPreviewLoading(false);
    }
  };

  const run = async (accion: "aceptar" | "rechazar" | "descartar" | "reabrir" | "documentar" | "modificar" | "cancelar" | "aplicar-cancelacion") => {
    setBusy(accion); setActionError(""); setResultado(null);
    try {
      let body: any = {};
      if (accion === "aceptar") {
        if (!fromLocalInput(fecha)) throw new Error("Indica la fecha y hora de la vista.");
        if (expModo === "existente" && !expId) throw new Error("Elige el expediente al que vincular la vista.");
        body = {
          ...formBody(),
          expediente: expModo === "existente" ? { modo: "existente", id: expId } : { modo: "nuevo" },
          guardar_adjuntos: guardarAdjuntos,
          recordatorio: conRecordatorio,
          recordatorio_at: conRecordatorio && recordatorio ? fromLocalInput(recordatorio) : undefined,
          enviar_correo: enviarCorreo,
          ...(modoRespuesta === "aceptar" ? { asunto, cuerpo } : {}),
        };
      } else if (accion === "documentar") {
        body = { expediente_id: d?.relacion?.expediente?.id, guardar_adjuntos: guardarAdjuntos };
      } else if (accion === "modificar") {
        if (!fromLocalInput(fecha)) throw new Error("Indica la nueva fecha y hora de la vista.");
        body = {
          vista_id: d?.relacion?.vista?.id, fecha: fromLocalInput(fecha), duracion_min: duracion,
          guardar_adjuntos: guardarAdjuntos, enviar_correo: enviarCorreo, mensaje,
          ...(modoRespuesta === "aceptar" ? { asunto, cuerpo } : {}),
        };
      } else if (accion === "aplicar-cancelacion") {
        body = { guardar_adjuntos: guardarAdjuntos, cerrar_expediente: cerrarExpediente };
      } else if (accion === "cancelar") {
        body = { motivo: motivoCancelar, cerrar_expediente: cerrarExpediente };
      } else if (accion === "rechazar") {
        body = { ...formBody(), enviar_correo: enviarCorreo, ...(modoRespuesta === "rechazar" ? { asunto, cuerpo } : {}) };
      }
      const data = await apiFetch(`/api/vistas/${id}/${accion}`, { method: "POST", getToken, body: JSON.stringify(body) });
      if (data?.success === false) throw new Error(data.error);
      if (data.data?.pasos) setResultado(data.data.pasos);
      setModoRespuesta(null);
      await load();
      onChanged();
    } catch (e: any) {
      setActionError(e.message || "No se pudo completar la acción");
    } finally {
      setBusy("");
    }
  };

  // Los adjuntos se ven en el mismo visor que en Correo, Expedientes o Chat
  // (antes se abrían en otra pestaña, y un .html salía como código).
  const [adjuntoAbierto, setAdjuntoAbierto] = useState<{ src: string; fileName: string; mime: string } | null>(null);
  const [abriendoAdjunto, setAbriendoAdjunto] = useState<number | null>(null);
  const openAdjunto = async (index: number) => {
    const a = d?.adjuntos.find((x) => x.index === index);
    setAbriendoAdjunto(index);
    try {
      const token = await getToken();
      const res = await fetch(resolveApiUrl(`/api/vistas/${id}/adjuntos/${index}`), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("No disponible");
      const blob = await res.blob();
      setAdjuntoAbierto({ src: URL.createObjectURL(blob), fileName: a?.filename || "adjunto", mime: a?.contentType || blob.type });
    } catch {
      setActionError("No se pudo abrir el adjunto (puede que el correo ya no esté en el buzón).");
    } finally {
      setAbriendoAdjunto(null);
    }
  };
  const cerrarAdjunto = useCallback(() => {
    setAdjuntoAbierto((prev) => { if (prev) URL.revokeObjectURL(prev.src); return null; });
  }, []);
  const descargarAdjunto = () => {
    if (!adjuntoAbierto) return;
    const link = document.createElement("a");
    link.href = adjuntoAbierto.src;
    link.download = adjuntoAbierto.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Detalles editables plegados por defecto; abiertos si los datos son dudosos
  // (leídos sin IA o sin fecha), que es cuando conviene revisarlos.
  const [detallesAbiertos, setDetallesAbiertos] = useState<boolean | null>(null);
  const verDetalles = detallesAbiertos ?? Boolean(d && (!d.fecha_vista || d.extraccion_origen !== "ia"));

  // Fecha real del recordatorio con los valores actuales del formulario.
  const recordatorioCalculado = useMemo(() => {
    if (!d || !conRecordatorio) return null;
    if (recordatorio) return fromLocalInput(recordatorio);
    const base = d.datos?.fecha_preparacion ? new Date(`${d.datos.fecha_preparacion}T00:00:00`) : (fromLocalInput(fecha) ? new Date(fromLocalInput(fecha)!) : null);
    if (!base) return null;
    const r = new Date(base);
    r.setDate(r.getDate() - d.defaults.recordatorioDias);
    const [hh, mm] = d.defaults.recordatorioHora.split(":").map(Number);
    r.setHours(hh || 9, mm || 0, 0, 0);
    return r.toISOString();
  }, [d, conRecordatorio, recordatorio, fecha]);

  const recordatorioTexto = useMemo(() => {
    if (!d) return "";
    const dias = d.defaults.recordatorioDias;
    const base = d.datos?.fecha_preparacion ? "la fecha de preparación indicada en el correo" : "la vista";
    return `${dias === 0 ? "El mismo día de" : `${dias} día${dias === 1 ? "" : "s"} antes de`} ${base}, a las ${d.defaults.recordatorioHora}`;
  }, [d]);

  if (loadError) return <div className="p-8 text-sm text-red-600">{loadError}</div>;
  if (!d) return <DetalleSkeleton />;

  const badge = ESTADO_BADGE[d.estado] || ESTADO_BADGE.pendiente;
  const pasos = resultado || d.pasos || [];

  const correoOrigen = (
      <section className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-start gap-3">
          <Mail size={16} className="text-slate-400 mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-800 break-words">{d.subject || "(sin asunto)"}</p>
            <p className="text-xs text-slate-500">{d.from_name ? `${d.from_name} · ` : ""}{d.from_email} · {fmtFecha(d.received_at)}</p>
            {d.datos?.resumen && <p className="text-sm text-slate-700 mt-2">{d.datos.resumen}</p>}
            {d.body_text && (
              <button onClick={() => setShowBody((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline">
                <ChevronDown size={12} className={showBody ? "rotate-180" : ""} /> {showBody ? "Ocultar correo" : "Ver correo completo"}
              </button>
            )}
            {showBody && <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-lg p-3 font-sans">{d.body_text}</pre>}
            {d.adjuntos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {d.adjuntos.map((a) => (
                  <button key={a.index} onClick={() => void openAdjunto(a.index)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-700 hover:border-red-300 hover:bg-red-50">
                    <Paperclip size={12} className="text-slate-400" /> <span className="max-w-[220px] truncate">{a.filename}</span> {abriendoAdjunto === a.index ? <Loader2 size={11} className="animate-spin text-slate-400" /> : <Eye size={11} className="text-slate-400" />}
                  </button>
                ))}
              </div>
            )}
            {adjuntoAbierto && (
              <FilePreviewModal src={adjuntoAbierto.src} fileName={adjuntoAbierto.fileName} mime={adjuntoAbierto.mime}
                subtitle={d.subject || null} onDownload={descargarAdjunto} onClose={cerrarAdjunto} />
            )}
            {!d.emailDisponible && <p className="mt-2 text-xs text-amber-700">El correo original ya no está en el buzón; se conserva su texto.</p>}
          </div>
        </div>
      </section>
  );

  const expedienteElegido = expModo === "existente"
    ? (d.expediente ? `${d.expediente.anio}/${d.expediente.num_exp}` : (() => { const c = d.coincidencias.find((x) => x.id === expId); return c ? `${c.anio}/${c.num_exp}${c.descripcion ? ` · ${c.descripcion}` : ""}` : ""; })())
    : "";

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={onClose} className="lg:hidden text-xs font-semibold text-slate-500 mb-2">← Volver</button>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-extrabold text-slate-900">
              {editable && mostrarFormulario
                ? (d.tipo === "cambio" ? "¿Es otra vista distinta?" : "¿Confirmas esta vista?")
                : fmtFecha(d.fecha_vista)}
            </h2>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
            {d.extraccion_origen && (
              <span className="text-[10px] font-semibold text-slate-400">
                {d.extraccion_origen === "ia" ? "Datos leídos con IA" : d.extraccion_origen === "patrones" ? "Datos leídos sin IA — revísalos" : ""}
              </span>
            )}
          </div>
          {d.decidido_por_nombre && (
            <p className="text-xs text-slate-500 mt-1">Decidido por {d.decidido_por_nombre} · {fmtFecha(d.decidido_at)}</p>
          )}
        </div>
        <button onClick={onClose} className="hidden lg:block p-1.5 rounded-lg text-slate-400 hover:bg-white hover:text-slate-700"><X size={16} /></button>
      </div>

      {/* Correo recibido: arriba si no hay que decidir; si hay que decidir, al final */}
      {!(editable && mostrarFormulario) && correoOrigen}

      {/* Resultado de la última acción / pasos */}
      {pasos.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Qué se ha hecho</h3>
          <ul className="space-y-1.5">
            {pasos.map((p) => (
              <li key={p.paso} className="flex items-start gap-2 text-sm">
                {p.ok ? <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 shrink-0" /> : <XCircle size={15} className="text-red-500 mt-0.5 shrink-0" />}
                <span><span className="font-semibold text-slate-700">{PASO_LABEL[p.paso] || p.paso}:</span> <span className="text-slate-600">{p.detalle}</span></span>
              </li>
            ))}
          </ul>
          {d.expediente && (
            <Link to={`/dashboard/expedientes/${d.expediente.id}`} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-red-600 hover:underline">
              <FileText size={13} /> Abrir expediente {d.expediente.anio}/{d.expediente.num_exp}
            </Link>
          )}
          {d.recordatorio_at && d.estado === "aceptada" && (
            <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
              <Clock size={12} /> Recordatorio {d.recordatorio_enviado_at ? "enviado" : "programado"}: {fmtFecha(d.recordatorio_at)}
            </p>
          )}
          {d.estado === "aceptada" && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              {!confirmarCancelar ? (
                <button type="button" onClick={() => setConfirmarCancelar(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700">
                  <X size={13} /> Cancelar esta vista
                </button>
              ) : (
                <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-3">
                  <p className="text-sm font-semibold text-slate-800">¿Cancelar la vista?</p>
                  <p className="text-xs text-slate-600">Queda tachada como cancelada en la agenda (con su recordatorio) y se anota en el expediente; su documentación se conserva. Después, otro señalamiento con los mismos autos se podrá aceptar como vista nueva. No se envía ningún correo.</p>
                  <input value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)} placeholder="Motivo (opcional): suspendida, desistimiento…" className={inputCls} />
                  {d.expediente && (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={cerrarExpediente} onChange={(e) => setCerrarExpediente(e.target.checked)} className="accent-red-600" />
                      Cerrar también el expediente {d.expediente.anio}/{d.expediente.num_exp}
                    </label>
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void run("cancelar").then(() => setConfirmarCancelar(false))} disabled={!!busy}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                      {busy === "cancelar" ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Sí, cancelar vista
                    </button>
                    <button type="button" onClick={() => setConfirmarCancelar(false)} disabled={!!busy} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">No</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {editable && d.relacion && d.tipo !== "vista" && (
        <section className={`rounded-2xl border p-4 space-y-3 ${d.tipo === "cancelacion" ? "border-rose-200 bg-rose-50/60" : "border-sky-200 bg-sky-50/60"}`}>
          <div className="flex items-start gap-2">
            {d.tipo === "cancelacion" ? <XCircle size={16} className="mt-0.5 shrink-0 text-rose-600" /> : <FileText size={16} className="mt-0.5 shrink-0 text-sky-600" />}
            <div className="text-sm text-slate-700">
              <p className="font-bold text-slate-800">
                {d.tipo === "cancelacion" ? "Este correo cancela o suspende una vista ya aceptada"
                  : d.tipo === "cambio" ? "Cambio en una vista ya aceptada" : "Mismo procedimiento que un expediente existente"}
              </p>
              {d.relacion.expediente && (
                <p>
                  Expediente <b>{d.relacion.expediente.anio}/{d.relacion.expediente.num_exp}</b>
                  {d.relacion.expediente.descripcion ? ` · ${d.relacion.expediente.descripcion}` : ""}
                  {d.relacion.expediente.num_autos ? ` · autos ${d.relacion.expediente.num_autos}` : ""}
                </p>
              )}
              {d.relacion.vista && d.vistaActual && (d.vistaActual.estado !== "aceptada"
                || (d.vistaActual.fecha_vista && new Date(d.vistaActual.fecha_vista).toDateString() !== new Date(d.relacion.vista.fecha_vista).toDateString())) && (
                <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {d.vistaActual.estado === "cancelada"
                    ? "Esa vista ya está cancelada: este correo puede ser antiguo."
                    : d.vistaActual.estado !== "aceptada"
                      ? "Esa vista ya no está activa: este correo puede ser antiguo."
                      : `Ojo: esa vista ahora es el ${fmtFecha(d.vistaActual.fecha_vista)} (cambió después de este correo).`}
                </p>
              )}
              {d.relacion.vista && (
                <p>
                  Vista aceptada: <b>{fmtFecha(d.vistaActual?.estado === "aceptada" && d.vistaActual.fecha_vista ? d.vistaActual.fecha_vista : d.relacion.vista.fecha_vista)}</b>
                  {d.tipo === "cambio" && d.fecha_vista ? <> → este correo indica <b>{fmtFecha(d.fecha_vista)}</b></> : null}
                  {d.tipo === "cambio" && !d.fecha_vista ? <> → <b>cambia de fecha</b>, pero el correo no dice la nueva: indícala abajo</> : null}
                  {d.tipo === "cancelacion" ? <> → <b className="text-rose-700">se cancela</b>{d.relacion.vista.juzgado ? ` · ${d.relacion.vista.juzgado}` : ""}</> : null}
                </p>
              )}
            </div>
          </div>

          {d.tipo === "cambio" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Nueva fecha y hora" className="sm:col-span-2">
                <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Duración (min)">
                <input type="number" min={15} max={600} step={15} value={duracion} onChange={(e) => setDuracion(Number(e.target.value) || 120)} className={inputCls} />
              </Field>
              {conflictos.length > 0 && (
                <p className="sm:col-span-3 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <AlertTriangle size={13} /> La nueva fecha choca con {conflictos.length} evento{conflictos.length === 1 ? "" : "s"} de la agenda
                </p>
              )}
              <label className="sm:col-span-3 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enviarCorreo} onChange={(e) => setEnviarCorreo(e.target.checked)} className="accent-red-600" />
                Avisar de la nueva fecha por correo a {d.from_email} <span className="text-slate-400">(opcional)</span>
              </label>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={guardarAdjuntos} onChange={(e) => setGuardarAdjuntos(e.target.checked)} className="accent-red-600" />
            Guardar los {d.adjuntos.length || ""} adjunto{d.adjuntos.length === 1 ? "" : "s"} y el correo en el expediente
          </label>

          {d.tipo === "cancelacion" && d.relacion.expediente && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cerrarExpediente} onChange={(e) => setCerrarExpediente(e.target.checked)} className="accent-red-600" />
              Al cancelar, cerrar también el expediente {d.relacion.expediente.anio}/{d.relacion.expediente.num_exp}
            </label>
          )}

          {actionError && !mostrarFormulario && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>}

          <div className="flex flex-wrap items-center gap-2">
            {d.tipo === "cancelacion" && d.relacion.vista && (
              <button onClick={() => void run("aplicar-cancelacion")} disabled={!!busy}
                title="La deja tachada como cancelada en la agenda, lo anota en el expediente y guarda este correo"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50">
                {busy === "aplicar-cancelacion" ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />} Cancelar la vista en Vantia
              </button>
            )}
            {d.tipo === "cambio" && d.relacion.vista && (
              <button onClick={() => void run("modificar")} disabled={!!busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50">
                {busy === "modificar" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Modificar la vista existente
              </button>
            )}
            {d.relacion.expediente && (
              <button onClick={() => void run("documentar")} disabled={!!busy}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 ${d.tipo === "cambio" || d.tipo === "cancelacion" ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "bg-red-600 text-white hover:bg-red-700"}`}>
                {busy === "documentar" ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
                {d.tipo === "cancelacion" ? "No cancelar, solo guardar el correo" : d.tipo === "cambio" ? "Solo añadir documentación" : "Añadir documentación al expediente"}
              </button>
            )}
            {!mostrarFormulario && d.tipo !== "cancelacion" && (
              <button onClick={() => setMostrarFormulario(true)} disabled={!!busy}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-white">
                <CalendarCheck size={13} /> {d.tipo === "cambio" ? "Es otra vista distinta" : "Es una vista nueva"}
              </button>
            )}
            {d.estado === "pendiente" && !mostrarFormulario && (
              <button onClick={() => void run("descartar")} disabled={!!busy}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-white">
                <Undo2 size={13} /> {d.tipo === "cancelacion" ? "No es una cancelación" : "No es relevante"}
              </button>
            )}
          </div>
        </section>
      )}

      {editable && mostrarFormulario && (
        <>
          {/* 1 · Ficha de la vista */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">
              {(tipoActo || "Vista")}{d.tipo === "cambio" ? " · cambio de fecha" : ""}
            </p>
            <p className="mt-1 text-2xl font-extrabold leading-tight text-slate-900">
              {fromLocalInput(fecha) ? fmtFecha(fromLocalInput(fecha)) : "Sin fecha — indícala en «Revisar o cambiar detalles»"}
            </p>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-slate-400">Juzgado</dt><dd className="font-medium text-slate-800">{juzgado || "—"}{sala ? ` · ${sala}` : ""}</dd></div>
              {(direccion || localidad) && (
                <div className="flex gap-2 sm:col-span-2"><dt className="w-20 shrink-0 text-slate-400">Dónde</dt>
                  <dd className="font-medium text-slate-800">
                    {[direccion, localidad].filter(Boolean).join(" · ")}{" "}
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([juzgado, direccion, localidad?.replace(/\s*\(según el NIG\)/, "")].filter(Boolean).join(", "))}`}
                      target="_blank" rel="noreferrer" className="ml-1 text-xs font-semibold text-red-600 hover:underline">Ver en el mapa</a>
                  </dd>
                </div>
              )}
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-slate-400">Autos</dt><dd className="font-medium text-slate-800">{autos || "—"}{nig ? ` · NIG ${nig}` : ""}</dd></div>
              <div className="flex gap-2"><dt className="w-20 shrink-0 text-slate-400">Duración</dt><dd className="font-medium text-slate-800">{duracion} min</dd></div>
            </dl>
            <div className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${conflictos.length ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
              {checking ? <Loader2 size={15} className="mt-0.5 animate-spin" /> : conflictos.length ? <AlertTriangle size={15} className="mt-0.5" /> : <Check size={15} className="mt-0.5" />}
              <span>
                {conflictos.length
                  ? `Choca con tu agenda: ${conflictos.map((c) => c.title).join(", ")}`
                  : "Agenda libre a esa hora"}
              </span>
            </div>
          </section>

          {/* 2 · Qué pasará */}
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
            <h3 className="text-sm font-bold text-slate-800">Si aceptas, Vantia hará esto:</h3>
            <ol className="mt-2 space-y-1.5 text-sm text-slate-700">
              <li className="flex items-start gap-2"><Mail size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span className="min-w-0 break-words">{enviarCorreo ? <>Responder a <b>{d.from_email}</b> confirmando la asistencia</> : <span className="text-slate-500">No se enviará ninguna respuesta</span>}</span></li>
              <li className="flex items-start gap-2"><FileText size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span className="min-w-0 break-words">{expModo === "existente" && expedienteElegido ? <>Vincularla al expediente <b>{expedienteElegido}</b></> : <>Crear un <b>expediente nuevo</b> con estos datos</>}</span></li>
              <li className="flex items-start gap-2"><CalendarCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span className="min-w-0 break-words">Apuntarla en <b>tu agenda</b></span></li>
              <li className="flex items-start gap-2"><Paperclip size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span className="min-w-0 break-words">{guardarAdjuntos && d.adjuntos.length ? <>Guardar <b>{d.adjuntos.length} adjunto{d.adjuntos.length === 1 ? "" : "s"}</b> y el correo en el expediente</> : <>Guardar el correo como nota en el expediente</>}</span></li>
              <li className="flex items-start gap-2"><Clock size={15} className="mt-0.5 shrink-0 text-emerald-600" /><span className="min-w-0 break-words">{conRecordatorio && recordatorioCalculado ? <>Recordarte prepararla el <b>{fmtFecha(recordatorioCalculado)}</b></> : <span className="text-slate-500">Sin recordatorio</span>}</span></li>
            </ol>
            <p className="mt-3 border-t border-emerald-100 pt-2 text-xs text-slate-500">
              Si rechazas: {enviarCorreo ? <>se responderá a {d.from_email} que no podéis asistir</> : "no se responde a nadie"} y no se crea nada.
            </p>
          </section>

          {actionError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>}

          {/* 3 · Decisión */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void run("aceptar")} disabled={!!busy}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold shadow-sm hover:bg-red-700 disabled:opacity-50">
              {busy === "aceptar" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {d.estado === "error" ? "Reintentar" : "Aceptar vista"}
            </button>
            {d.estado !== "error" && (
              <button onClick={() => void run("rechazar")} disabled={!!busy}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 disabled:opacity-50">
                {busy === "rechazar" ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />} Rechazar
              </button>
            )}
            {d.estado === "pendiente" && (
              <button onClick={() => void run("descartar")} disabled={!!busy} title="No responde a nadie: solo la quita de la lista"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-slate-500 text-xs font-semibold hover:bg-white disabled:opacity-50">
                {busy === "descartar" ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} No es una vista
              </button>
            )}
            {d.estado === "descartada" && (
              <button onClick={() => void run("reabrir")} disabled={!!busy}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 text-xs font-semibold hover:bg-white disabled:opacity-50">
                {busy === "reabrir" ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Pasar a "por confirmar"
              </button>
            )}
          </div>

          {/* 4 · Detalles (plegado) */}
          <section className="rounded-2xl border border-slate-200 bg-white">
            <button type="button" onClick={() => setDetallesAbiertos(!verDetalles)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-slate-700">
              <span>Revisar o cambiar detalles <span className="font-normal text-slate-400">· fecha, juzgado, expediente, recordatorio, texto del correo</span></span>
              <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${verDetalles ? "rotate-180" : ""}`} />
            </button>
            {verDetalles && (
              <div className="space-y-4 border-t border-slate-100 p-4">
          {/* Datos de la vista */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Datos de la vista</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Fecha y hora" className="sm:col-span-2">
                <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Duración (min)">
                <input type="number" min={15} max={600} step={15} value={duracion} onChange={(e) => setDuracion(Number(e.target.value) || 120)} className={inputCls} />
              </Field>
              <Field label="Tipo de acto"><input value={tipoActo} onChange={(e) => setTipoActo(e.target.value)} placeholder="Vista, juicio, audiencia previa…" className={inputCls} /></Field>
              <Field label="Juzgado" className="sm:col-span-2"><input value={juzgado} onChange={(e) => setJuzgado(e.target.value)} className={inputCls} /></Field>
              <Field label="Sala"><input value={sala} onChange={(e) => setSala(e.target.value)} className={inputCls} /></Field>
              <Field label="Nº autos"><input value={autos} onChange={(e) => setAutos(e.target.value)} className={inputCls} /></Field>
              <Field label="NIG"><input value={nig} onChange={(e) => setNig(e.target.value)} className={inputCls} /></Field>
              <Field label="Dirección de la sede" className="sm:col-span-2"><input value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Ciudad de la Justicia, calle…" className={inputCls} /></Field>
              <Field label="Localidad"><input value={localidad} onChange={(e) => setLocalidad(e.target.value)} className={inputCls} /></Field>
            </div>

            {/* Hueco en la agenda */}
            <div className={`rounded-xl border p-3 text-sm ${conflictos.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
              <div className="flex items-center gap-2 font-semibold">
                {checking ? <Loader2 size={14} className="animate-spin text-slate-400" />
                  : conflictos.length ? <AlertTriangle size={14} className="text-amber-600" /> : <Check size={14} className="text-emerald-600" />}
                <span className={conflictos.length ? "text-amber-800" : "text-emerald-800"}>
                  {conflictos.length ? `Choca con ${conflictos.length} evento${conflictos.length === 1 ? "" : "s"} de la agenda` : "Hueco libre en la agenda"}
                </span>
              </div>
              {conflictos.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-amber-900">
                  {conflictos.map((c) => (
                    <li key={c.id}>• {c.title} — {c.all_day ? `${fmtFecha(c.start_at, false)} (todo el día)` : `${fmtFecha(c.start_at)}${c.end_at ? " – " + new Date(c.end_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : ""}`}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Expediente, documentos, recordatorio */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Al aceptar</h3>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" checked={expModo === "nuevo"} onChange={() => setExpModo("nuevo")} className="mt-1 accent-red-600" disabled={!!d.expediente_id} />
                <span>Dar de alta un <b>expediente nuevo</b> con los datos de la vista</span>
              </label>
              {(d.coincidencias.length > 0 || d.expediente_id) && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" checked={expModo === "existente"} onChange={() => setExpModo("existente")} className="mt-1 accent-red-600" />
                  <span className="flex-1">
                    Vincular a un <b>expediente existente</b>
                    {d.expediente_id
                      ? <span className="block text-xs text-slate-500">Ya creado en un intento anterior: {d.expediente ? `${d.expediente.anio}/${d.expediente.num_exp}` : ""}</span>
                      : (
                        <select value={expId} onChange={(e) => { setExpId(e.target.value); setExpModo("existente"); }} className={`${inputCls} mt-1`}>
                          {d.coincidencias.map((c) => (
                            <option key={c.id} value={c.id}>{c.anio}/{c.num_exp} · {c.descripcion || c.cliente_nombre || "sin descripción"}{c.num_autos ? ` · autos ${c.num_autos}` : ""}</option>
                          ))}
                        </select>
                      )}
                    {!d.expediente_id && <span className="block text-[11px] text-slate-400 mt-0.5">Coincide el nº de autos o el NIG del correo</span>}
                  </span>
                </label>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={guardarAdjuntos} onChange={(e) => setGuardarAdjuntos(e.target.checked)} className="accent-red-600" />
              Guardar los {d.adjuntos.length || ""} adjunto{d.adjuntos.length === 1 ? "" : "s"} en la documentación del expediente
            </label>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={conRecordatorio} onChange={(e) => setConRecordatorio(e.target.checked)} className="accent-red-600" />
                Recordatorio para preparar la vista
              </label>
              {conRecordatorio && (
                <div className="ml-6 mt-1.5 flex flex-wrap items-center gap-2">
                  <input type="datetime-local" value={recordatorio} onChange={(e) => setRecordatorio(e.target.value)} className={`${inputCls} max-w-[240px]`} />
                  <span className="text-xs text-slate-400">{recordatorio ? "" : `Por defecto: ${recordatorioTexto}`}</span>
                </div>
              )}
            </div>
          </section>

          {/* Correo de respuesta */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Respuesta a {d.from_email}</h3>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={enviarCorreo} onChange={(e) => setEnviarCorreo(e.target.checked)} className="accent-red-600" /> Enviar correo
              </label>
            </div>
            {enviarCorreo && (
              <>
                <Field label="Mensaje adicional (opcional)">
                  <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={2} className={inputCls} placeholder="Se añade al texto de la plantilla" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void loadPreview("aceptar")} disabled={previewLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    <Eye size={12} /> Ver/editar correo de aceptación
                  </button>
                  <button onClick={() => void loadPreview("rechazar")} disabled={previewLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                    <Eye size={12} /> Ver/editar correo de rechazo
                  </button>
                  {previewLoading && <Loader2 size={14} className="animate-spin text-slate-400 self-center" />}
                </div>
                {modoRespuesta && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase text-slate-500">Correo de {modoRespuesta === "aceptar" ? "aceptación" : "rechazo"} (editable)</span>
                      <button onClick={() => setModoRespuesta(null)} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600">Usar la plantilla tal cual</button>
                    </div>
                    <input value={asunto} onChange={(e) => setAsunto(e.target.value)} className={inputCls} />
                    <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={9} className={`${inputCls} font-sans`} />
                    {firmaRegistrada && <p className="text-[11px] text-slate-500">Al final se añadirá la firma «{firmaRegistrada}».</p>}
                  </div>
                )}
              </>
            )}
          </section>

              </div>
            )}
          </section>

          {/* 5 · Correo recibido */}
          {correoOrigen}
          <div className="pb-6" />
        </>
      )}
    </div>
  );
}
