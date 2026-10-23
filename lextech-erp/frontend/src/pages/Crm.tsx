import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  AlertTriangle, CalendarClock, Check, ExternalLink, Euro, HeartHandshake, Loader2, Mail, MessageCircle, Phone,
  Plus, Search, StickyNote, Trash2, TrendingUp, UserCheck, Users, X, XCircle,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { aviso, confirmar } from "../lib/avisos";
import { useOrganizacion } from "../lib/useOrganizacion";

// ── CRM (23/10/2026) ─────────────────────────────────────────────────────────
// Tablero de oportunidades: personas o empresas que han contactado con el
// despacho y aún no son clientes. Se arrastran de etapa en etapa; al ganarlas
// se dan de alta como cliente. Backend: controllers/crmController.ts.

type Etapa = "contacto" | "consulta_agendada" | "consulta_hecha" | "propuesta_enviada" | "ganada" | "perdida";
interface Oportunidad {
  id: string; nombre: string; telefono: string | null; email: string | null; origen: string;
  asunto: string | null; area: string | null; etapa: Etapa; valor_estimado: string | null;
  responsable_user_id: string | null; responsable_nombre: string | null;
  proxima_accion: string | null; proxima_accion_at: string | null; motivo_perdida: string | null;
  cliente_id: string | null; created_at: string; updated_at: string; cerrada_at: string | null;
  n_actividades?: number; actividades?: Actividad[];
}
interface Actividad { id: string; tipo: string; texto: string; user_name: string | null; created_at: string }
interface Resumen { abiertas: number; valorAbierto: number; conversion90: number | null; ganadas90: number; perdidas90: number; seguimientosVencidos: number }
interface Miembro { userId: string; nombre: string }

const ETAPAS: { id: Etapa; label: string; tono: string }[] = [
  { id: "contacto", label: "Contacto", tono: "bg-slate-400" },
  { id: "consulta_agendada", label: "Consulta agendada", tono: "bg-sky-500" },
  { id: "consulta_hecha", label: "Consulta hecha", tono: "bg-indigo-500" },
  { id: "propuesta_enviada", label: "Propuesta enviada", tono: "bg-amber-500" },
  { id: "ganada", label: "Ganada", tono: "bg-emerald-500" },
  { id: "perdida", label: "Perdida", tono: "bg-rose-500" },
];
const ORIGENES: Record<string, string> = {
  web: "Web", telefono: "Teléfono", correo: "Correo", whatsapp: "WhatsApp", redes: "Redes sociales",
  recomendacion: "Recomendación", presencial: "Presencial", otro: "Otro",
};
const TIPOS_ACTIVIDAD: Record<string, { label: string; Icon: any }> = {
  nota: { label: "Nota", Icon: StickyNote }, llamada: { label: "Llamada", Icon: Phone }, correo: { label: "Correo", Icon: Mail },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle }, reunion: { label: "Reunión", Icon: Users }, etapa: { label: "Etapa", Icon: TrendingUp },
};

const euros = (v: any) => (v == null || v === "" ? "" : Number(v).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }));
const fechaCorta = (v: string) => new Date(v).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const aInputFecha = (v: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
function estadoAccion(v: string | null): "vencida" | "hoy" | "futura" | null {
  if (!v) return null;
  const d = new Date(v), ahora = new Date();
  if (d < ahora) return "vencida";
  return d.toDateString() === ahora.toDateString() ? "hoy" : "futura";
}
const iniciales = (n: string | null) => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

const campo = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-red-300";
const etiqueta = "mb-1 block text-xs font-semibold text-slate-600";

export default function Crm() {
  const { getToken } = useAuth();
  const { puede } = useOrganizacion();
  const editable = puede("clientes", "edicion");
  const [lista, setLista] = useState<Oportunidad[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [mias, setMias] = useState(false);
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<Etapa | null>(null);
  const [perder, setPerder] = useState<Oportunidad | null>(null);

  const cargar = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (mias) params.set("mias", "1");
      const [l, r] = await Promise.all([
        apiFetch(`/api/crm/oportunidades?${params}`, { getToken }),
        apiFetch("/api/crm/resumen", { getToken }),
      ]);
      if (l?.success === false) throw new Error(l.error);
      setLista(l?.data || []);
      setResumen(r?.data || null);
    } catch (e: any) {
      aviso.error(e?.message || "No se pudo cargar el CRM");
    } finally {
      setCargando(false);
    }
  }, [getToken, q, mias]);

  useEffect(() => { const t = window.setTimeout(() => void cargar(), q ? 300 : 0); return () => window.clearTimeout(t); }, [cargar, q]);
  useEffect(() => {
    apiFetch("/api/organizacion/miembros", { getToken }).then((r) => setMiembros((r?.data || []).map((m: any) => ({ userId: m.userId, nombre: m.nombre })))).catch(() => {});
  }, [getToken]);

  const porEtapa = useMemo(() => {
    const m = new Map<Etapa, Oportunidad[]>(ETAPAS.map((e) => [e.id, []]));
    for (const o of lista) m.get(o.etapa)?.push(o);
    return m;
  }, [lista]);

  const mover = async (o: Oportunidad, etapa: Etapa) => {
    if (o.etapa === etapa || !editable) return;
    if (etapa === "perdida") { setPerder(o); return; }
    if (etapa === "ganada") {
      if (!(await confirmar({
        titulo: `¿Dar de alta a «${o.nombre}» como cliente?`,
        mensaje: o.cliente_id ? "Ya tiene ficha de cliente: solo se marcará como ganada." : "Se creará su ficha de cliente con el nombre, el teléfono y el correo de la oportunidad.",
        confirmar: "Sí, es cliente",
      }))) return;
      const r = await apiFetch(`/api/crm/oportunidades/${o.id}/convertir`, { method: "POST", getToken, body: "{}" });
      if (r?.success === false) { aviso.error(r.error); return; }
      aviso.ok(r?.data?.creado ? `«${o.nombre}» ya es cliente` : `«${o.nombre}» marcada como ganada`);
      void cargar();
      return;
    }
    setLista((prev) => prev.map((x) => (x.id === o.id ? { ...x, etapa } : x)));
    const r = await apiFetch(`/api/crm/oportunidades/${o.id}`, { method: "PUT", getToken, body: JSON.stringify({ etapa }) });
    if (r?.success === false) aviso.error(r.error);
    void cargar();
  };

  const tiles = [
    { label: "Oportunidades abiertas", valor: resumen ? String(resumen.abiertas) : "—", Icon: HeartHandshake, aviso: false },
    { label: "Valor en curso", valor: resumen ? euros(resumen.valorAbierto) || "0 €" : "—", Icon: Euro, aviso: false },
    { label: "Conversión (90 días)", valor: resumen?.conversion90 != null ? `${resumen.conversion90} %` : "—", Icon: TrendingUp, aviso: false,
      pie: resumen ? `${resumen.ganadas90} ganadas · ${resumen.perdidas90} perdidas` : "" },
    { label: "Seguimientos vencidos", valor: resumen ? String(resumen.seguimientosVencidos) : "—", Icon: CalendarClock, aviso: !!resumen?.seguimientosVencidos },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white"><HeartHandshake size={20} className="text-red-600" /></div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">CRM</h1>
            <p className="text-xs text-slate-500">Clientes potenciales, de la primera llamada a la hoja de encargo</p>
          </div>
        </div>
        {editable && (
          <button onClick={() => setNueva(true)} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">
            <Plus size={16} /> Nueva oportunidad
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className={`rounded-2xl border bg-white p-4 ${t.aviso ? "border-rose-200" : "border-slate-200"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.label}</span>
              <t.Icon size={16} className={t.aviso ? "text-rose-500" : "text-slate-400"} />
            </div>
            <p className={`mt-1 text-2xl font-extrabold tabular-nums ${t.aviso ? "text-rose-600" : "text-slate-900"}`}>{t.valor}</p>
            {t.pie && <p className="text-[11px] text-slate-500">{t.pie}</p>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input id="crm-buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, asunto, teléfono…" className={`${campo} pl-9`} />
        </label>
        <button onClick={() => setMias((v) => !v)} aria-pressed={mias}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold ${mias ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
          Solo las mías
        </button>
        <span className="ml-auto text-xs text-slate-400">{editable ? "Arrastra las tarjetas para cambiarlas de etapa" : "Solo lectura"}</span>
      </div>

      {cargando ? (
        <div className="flex items-center gap-2 py-16 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Cargando oportunidades…</div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1040px] grid-cols-6 gap-2.5">
            {ETAPAS.map((e) => {
              const items = porEtapa.get(e.id) || [];
              const total = items.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
              return (
                <div key={e.id}
                  onDragOver={(ev) => { if (arrastrando) { ev.preventDefault(); setSobre(e.id); } }}
                  onDragLeave={() => setSobre((s) => (s === e.id ? null : s))}
                  onDrop={(ev) => { ev.preventDefault(); setSobre(null); const o = lista.find((x) => x.id === arrastrando); setArrastrando(null); if (o) void mover(o, e.id); }}
                  className={`flex min-h-[320px] flex-col gap-2 rounded-2xl border p-2.5 transition-colors ${sobre === e.id ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="px-1">
                    <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${e.tono}`} /> {e.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-semibold tabular-nums text-slate-400">
                      {items.length}{total ? ` · ${euros(total)}` : ""}{e.id === "ganada" || e.id === "perdida" ? " · últimos 90 días" : ""}
                    </span>
                  </div>
                  {items.map((o) => {
                    const acc = estadoAccion(o.proxima_accion_at);
                    return (
                      <button key={o.id} type="button" draggable={editable}
                        onDragStart={(ev) => { setArrastrando(o.id); ev.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                        onClick={() => setAbierta(o.id)}
                        className={`grid gap-1.5 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-slate-300 ${arrastrando === o.id ? "opacity-50" : ""} ${acc === "vencida" && e.id !== "ganada" && e.id !== "perdida" ? "border-rose-200" : "border-slate-200"}`}>
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-sm font-bold text-slate-800">{o.nombre}</span>
                          {o.responsable_nombre && (
                            <span title={`Lleva: ${o.responsable_nombre}`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">{iniciales(o.responsable_nombre)}</span>
                          )}
                        </span>
                        {o.asunto && <span className="line-clamp-2 text-xs text-slate-500">{o.asunto}</span>}
                        <span className="flex flex-wrap gap-1">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{ORIGENES[o.origen] || o.origen}</span>
                          {o.area && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{o.area}</span>}
                          {o.valor_estimado && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{euros(o.valor_estimado)}</span>}
                        </span>
                        {e.id === "perdida" && o.motivo_perdida && <span className="text-[11px] text-rose-600">Motivo: {o.motivo_perdida}</span>}
                        {e.id !== "ganada" && e.id !== "perdida" && o.proxima_accion && (
                          <span className={`flex items-start gap-1 text-[11px] ${acc === "vencida" ? "peligro font-semibold text-rose-600" : acc === "hoy" ? "font-semibold text-amber-700" : "text-slate-500"}`}>
                            <CalendarClock size={12} className="mt-px shrink-0" />
                            <span>{o.proxima_accion}{o.proxima_accion_at ? ` · ${fechaCorta(o.proxima_accion_at)}` : ""}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {!items.length && <p className="px-1 py-4 text-center text-xs text-slate-400">{e.id === "contacto" && editable ? "Pulsa «Nueva oportunidad» para añadir la primera" : "Ninguna"}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {nueva && <NuevaOportunidad miembros={miembros} onClose={() => setNueva(false)} onCreada={(id) => { setNueva(false); void cargar(); setAbierta(id); }} />}
      {abierta && <FichaOportunidad id={abierta} editable={editable} miembros={miembros} onClose={() => setAbierta(null)} onCambio={() => void cargar()} onPerder={(o) => setPerder(o)} />}
      {perder && <MotivoPerdida oportunidad={perder} onClose={() => setPerder(null)} onHecho={() => { setPerder(null); void cargar(); }} />}
    </div>
  );
}

// ── Capa para las ventanas (fuera de la página animada) ─────────────────────
function Capa({ children, onClose, lateral = false }: { children: React.ReactNode; onClose: () => void; lateral?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return createPortal(
    <div className={`fixed inset-0 z-[60] flex bg-slate-900/40 ${lateral ? "justify-end" : "items-center justify-center p-4"}`} onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        className={lateral ? "flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" : "flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function CamposOportunidad({ v, set, miembros }: { v: any; set: (k: string, val: any) => void; miembros: Miembro[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2"><span className={etiqueta}>Nombre *</span>
        <input id="crm-nombre" value={v.nombre || ""} onChange={(e) => set("nombre", e.target.value)} placeholder="Persona o empresa" className={campo} /></label>
      <label><span className={etiqueta}>Teléfono</span>
        <input id="crm-telefono" value={v.telefono || ""} onChange={(e) => set("telefono", e.target.value)} className={campo} /></label>
      <label><span className={etiqueta}>Correo</span>
        <input id="crm-email" type="email" value={v.email || ""} onChange={(e) => set("email", e.target.value)} className={campo} /></label>
      <label><span className={etiqueta}>Cómo llegó</span>
        <select id="crm-origen" value={v.origen || "otro"} onChange={(e) => set("origen", e.target.value)} className={campo}>
          {Object.entries(ORIGENES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
      <label><span className={etiqueta}>Área</span>
        <input id="crm-area" value={v.area || ""} onChange={(e) => set("area", e.target.value)} placeholder="Medidas de apoyo, bancario…" className={campo} /></label>
      <label className="sm:col-span-2"><span className={etiqueta}>Qué necesita</span>
        <textarea id="crm-asunto" value={v.asunto || ""} onChange={(e) => set("asunto", e.target.value)} rows={3} className={campo} /></label>
      <label><span className={etiqueta}>Honorarios estimados (€)</span>
        <input id="crm-valor" inputMode="decimal" value={v.valor_estimado ?? ""} onChange={(e) => set("valor_estimado", e.target.value)} placeholder="0" className={campo} /></label>
      <label><span className={etiqueta}>Responsable</span>
        <select id="crm-responsable" value={v.responsable_user_id || ""} onChange={(e) => set("responsable_user_id", e.target.value)} className={campo}>
          <option value="">Yo</option>
          {miembros.map((m) => <option key={m.userId} value={m.userId}>{m.nombre}</option>)}
        </select></label>
      <label><span className={etiqueta}>Próxima acción</span>
        <input id="crm-accion" value={v.proxima_accion || ""} onChange={(e) => set("proxima_accion", e.target.value)} placeholder="Llamar para agendar la consulta" className={campo} /></label>
      <label><span className={etiqueta}>Cuándo</span>
        <input id="crm-accion-fecha" type="datetime-local" value={aInputFecha(v.proxima_accion_at)} onChange={(e) => set("proxima_accion_at", e.target.value ? new Date(e.target.value).toISOString() : null)} className={campo} /></label>
    </div>
  );
}

function NuevaOportunidad({ miembros, onClose, onCreada }: { miembros: Miembro[]; onClose: () => void; onCreada: (id: string) => void }) {
  const { getToken } = useAuth();
  const [v, setV] = useState<any>({ origen: "telefono" });
  const [guardando, setGuardando] = useState(false);
  const crear = async () => {
    if (!String(v.nombre || "").trim()) { aviso.error("Escribe el nombre de la persona o empresa"); return; }
    setGuardando(true);
    const r = await apiFetch("/api/crm/oportunidades", { method: "POST", getToken, body: JSON.stringify(v) });
    setGuardando(false);
    if (r?.success === false || !r?.data) { aviso.error(r?.error || "No se pudo crear"); return; }
    aviso.ok("Oportunidad creada");
    onCreada(r.data.id);
  };
  return (
    <Capa onClose={onClose}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-extrabold text-slate-900">Nueva oportunidad</h2>
        <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5"><CamposOportunidad v={v} set={(k, val) => setV((p: any) => ({ ...p, [k]: val }))} miembros={miembros} /></div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
        <button onClick={() => void crear()} disabled={guardando} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
          {guardando && <Loader2 size={14} className="animate-spin" />} Crear
        </button>
      </div>
    </Capa>
  );
}

function FichaOportunidad({ id, editable, miembros, onClose, onCambio, onPerder }: {
  id: string; editable: boolean; miembros: Miembro[]; onClose: () => void; onCambio: () => void; onPerder: (o: Oportunidad) => void;
}) {
  const { getToken } = useAuth();
  const [o, setO] = useState<Oportunidad | null>(null);
  const [v, setV] = useState<any>({});
  const [guardando, setGuardando] = useState(false);
  const [tipo, setTipo] = useState("llamada");
  const [nota, setNota] = useState("");

  const cargar = useCallback(async () => {
    const r = await apiFetch(`/api/crm/oportunidades/${id}`, { getToken });
    if (r?.success === false || !r?.data) { aviso.error(r?.error || "No se pudo abrir"); onClose(); return; }
    const valor = r.data.valor_estimado == null ? "" : String(Number(r.data.valor_estimado)).replace(".", ",");
    setO({ ...r.data, valor_estimado: valor }); setV({ ...r.data, valor_estimado: valor });
  }, [getToken, id, onClose]);
  useEffect(() => { void cargar(); }, [cargar]);

  const cambiado = o && ["nombre", "telefono", "email", "origen", "area", "asunto", "valor_estimado", "responsable_user_id", "proxima_accion", "proxima_accion_at"]
    .some((k) => String(v[k] ?? "") !== String((o as any)[k] ?? ""));

  const guardar = async (extra: any = {}) => {
    setGuardando(true);
    const cuerpo = { ...v, ...extra };
    if (!cuerpo.responsable_user_id) delete cuerpo.responsable_user_id;
    delete cuerpo.actividades;
    const r = await apiFetch(`/api/crm/oportunidades/${id}`, { method: "PUT", getToken, body: JSON.stringify(cuerpo) });
    setGuardando(false);
    if (r?.success === false) { aviso.error(r.error); return; }
    aviso.ok("Guardado");
    await cargar(); onCambio();
  };

  const convertir = async () => {
    if (!o || !(await confirmar({ titulo: `¿Dar de alta a «${o.nombre}» como cliente?`, mensaje: "Se crea su ficha de cliente y la oportunidad pasa a ganada.", confirmar: "Sí, es cliente" }))) return;
    const r = await apiFetch(`/api/crm/oportunidades/${id}/convertir`, { method: "POST", getToken, body: "{}" });
    if (r?.success === false) { aviso.error(r.error); return; }
    aviso.ok(`«${o.nombre}» ya es cliente`);
    await cargar(); onCambio();
  };

  const borrar = async () => {
    if (!o || !(await confirmar({ titulo: `¿Eliminar la oportunidad «${o.nombre}»?`, mensaje: "Se borra con todo su historial. Si no salió adelante, mejor márcala como perdida.", confirmar: "Eliminar", peligro: true }))) return;
    const r = await apiFetch(`/api/crm/oportunidades/${id}`, { method: "DELETE", getToken });
    if (r?.success === false) { aviso.error(r.error); return; }
    aviso.ok("Oportunidad eliminada"); onCambio(); onClose();
  };

  const anadir = async () => {
    if (!nota.trim()) return;
    const r = await apiFetch(`/api/crm/oportunidades/${id}/actividades`, { method: "POST", getToken, body: JSON.stringify({ tipo, texto: nota }) });
    if (r?.success === false) { aviso.error(r.error); return; }
    setNota(""); await cargar(); onCambio();
  };

  const abierta = o && o.etapa !== "ganada" && o.etapa !== "perdida";
  return (
    <Capa onClose={onClose} lateral>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-extrabold text-slate-900">{o?.nombre || "…"}</h2>
          {o && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <select id="crm-etapa" value={o.etapa} disabled={!editable}
                onChange={(e) => { const et = e.target.value as Etapa; if (et === "perdida") onPerder(o); else if (et === "ganada") void convertir(); else void guardar({ etapa: et }); }}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                {ETAPAS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
              {o.cliente_id && <Link to={`/dashboard/clientes/${o.cliente_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"><ExternalLink size={12} /> Ficha del cliente</Link>}
            </div>
          )}
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
      </div>

      {!o ? (
        <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Cargando…</div>
      ) : (
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {o.etapa === "perdida" && o.motivo_perdida && (
            <p className="peligro flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><XCircle size={16} className="mt-0.5 shrink-0" /> Perdida: {o.motivo_perdida}</p>
          )}
          <fieldset disabled={!editable} className="space-y-3">
            <CamposOportunidad v={v} set={(k, val) => setV((p: any) => ({ ...p, [k]: val }))} miembros={miembros} />
          </fieldset>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void guardar()} disabled={!cambiado || guardando} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40">
                {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar
              </button>
              {abierta && !o.cliente_id && (
                <button onClick={() => void convertir()} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"><UserCheck size={14} /> Convertir en cliente</button>
              )}
              {abierta && (
                <button onClick={() => onPerder(o)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><XCircle size={14} /> Marcar perdida</button>
              )}
              <button onClick={() => void borrar()} className="peligro ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 size={14} /> Eliminar</button>
            </div>
          )}

          <section className="space-y-3 border-t border-slate-200 pt-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Historial</h3>
            {editable && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap gap-1">
                  {["llamada", "nota", "correo", "whatsapp", "reunion"].map((t) => {
                    const T = TIPOS_ACTIVIDAD[t];
                    return (
                      <button key={t} onClick={() => setTipo(t)} aria-pressed={tipo === t}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tipo === t ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
                        <T.Icon size={12} /> {T.label}
                      </button>
                    );
                  })}
                </div>
                <textarea id="crm-nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="¿Qué se ha hablado?" className={campo} />
                <button onClick={() => void anadir()} disabled={!nota.trim()} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">Añadir al historial</button>
              </div>
            )}
            <ol className="space-y-3">
              {(o.actividades || []).map((a) => {
                const T = TIPOS_ACTIVIDAD[a.tipo] || TIPOS_ACTIVIDAD.nota;
                return (
                  <li key={a.id} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100"><T.Icon size={13} className="text-slate-500" /></span>
                    <div className="min-w-0">
                      <p className="whitespace-pre-wrap text-sm text-slate-700">{a.texto}</p>
                      <p className="text-[11px] text-slate-400">{T.label} · {a.user_name || "—"} · {fechaCorta(a.created_at)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}
    </Capa>
  );
}

function MotivoPerdida({ oportunidad, onClose, onHecho }: { oportunidad: Oportunidad; onClose: () => void; onHecho: () => void }) {
  const { getToken } = useAuth();
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const RAPIDOS = ["Le parece caro", "No contesta", "Se va con otro despacho", "No tiene caso", "Lo resuelve por su cuenta"];
  const guardar = async () => {
    if (!motivo.trim()) return;
    setGuardando(true);
    const r = await apiFetch(`/api/crm/oportunidades/${oportunidad.id}`, { method: "PUT", getToken, body: JSON.stringify({ etapa: "perdida", motivo_perdida: motivo }) });
    setGuardando(false);
    if (r?.success === false) { aviso.error(r.error); return; }
    aviso.ok(`«${oportunidad.nombre}» marcada como perdida`);
    onHecho();
  };
  return (
    <Capa onClose={onClose}>
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50"><AlertTriangle size={18} className="text-rose-600" /></span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">¿Por qué se ha perdido «{oportunidad.nombre}»?</h2>
            <p className="text-xs text-slate-500">El motivo sirve para ver después por qué no salen adelante.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RAPIDOS.map((m) => (
            <button key={m} onClick={() => setMotivo(m)} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${motivo === m ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{m}</button>
          ))}
        </div>
        <textarea id="crm-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Otro motivo…" className={campo} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => void guardar()} disabled={!motivo.trim() || guardando} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40">
            {guardando && <Loader2 size={14} className="animate-spin" />} Marcar perdida
          </button>
        </div>
      </div>
    </Capa>
  );
}
