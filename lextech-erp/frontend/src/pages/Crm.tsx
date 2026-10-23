import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  AlertTriangle, ArrowDown, ArrowUp, Bell, CalendarClock, Check, ExternalLink, Euro, HeartHandshake, LayoutGrid, List,
  Loader2, Mail, MessageCircle, Phone, Plus, Search, Settings2, StickyNote, Tag, Trash2, TrendingUp, UserCheck, Users, X, XCircle, Zap,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import { aviso, confirmar } from "../lib/avisos";
import { useOrganizacion } from "../lib/useOrganizacion";

// ── CRM (23/10/2026) ─────────────────────────────────────────────────────────
// Misma estructura que el CRM de GoHighLevel del despacho: embudos con sus
// etapas (por defecto, el "Pipeline" de 13 etapas), estado aparte de la etapa
// (abierta, ganada, perdida, abandonada), etiquetas, cuestionario de captación
// y reglas por etapa. Backend: controllers/crmController.ts.

type Estado = "abierta" | "ganada" | "perdida" | "abandonada";
type TipoEtapa = "abierta" | "ganada" | "perdida";
interface Etapa {
  id: string; embudo_id?: string; nombre: string; orden: number; tipo: TipoEtapa; color: string | null;
  aviso_responsable: boolean; accion_texto: string | null; accion_horas: number | null; mover_horas: number | null; mover_a_etapa_id: string | null;
}
interface Embudo { id: string; nombre: string; etapas: Etapa[] }
interface Campo { id: string; nombre: string; tipo: "opcion" | "texto" | "fecha" | "numero"; opciones: string[] }
interface Config { embudos: Embudo[]; campos: Campo[] }
interface Oportunidad {
  id: string; nombre: string; telefono: string | null; email: string | null; origen: string; asunto: string | null; area: string | null;
  embudo_id: string | null; etapa_id: string | null; estado: Estado; valor_estimado: string | null;
  responsable_user_id: string | null; responsable_nombre: string | null; proxima_accion: string | null; proxima_accion_at: string | null;
  motivo_perdida: string | null; cliente_id: string | null; etiquetas: string[]; campos: Record<string, string>;
  created_at: string; updated_at: string; n_actividades?: number; actividades?: Actividad[];
}
interface Actividad { id: string; tipo: string; texto: string; user_name: string | null; created_at: string }
interface Resumen { abiertas: number; valorAbierto: number; conversion90: number | null; ganadas90: number; perdidas90: number; seguimientosVencidos: number }
interface Miembro { userId: string; nombre: string }

const COLORES: Record<string, string> = {
  slate: "bg-slate-400", sky: "bg-sky-500", indigo: "bg-indigo-500", violet: "bg-violet-500", amber: "bg-amber-500",
  orange: "bg-orange-500", emerald: "bg-emerald-500", teal: "bg-teal-500", rose: "bg-rose-500",
};
const ESTADOS: { id: Estado | "todas"; label: string }[] = [
  { id: "abierta", label: "Abiertas" }, { id: "ganada", label: "Ganadas" }, { id: "perdida", label: "Perdidas" },
  { id: "abandonada", label: "Abandonadas" }, { id: "todas", label: "Todas" },
];
const ESTILO_ESTADO: Record<Estado, string> = {
  abierta: "bg-sky-50 text-sky-700", ganada: "bg-emerald-50 text-emerald-700", perdida: "bg-rose-50 text-rose-700", abandonada: "bg-slate-100 text-slate-600",
};
const ORIGENES: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", formulario: "Formulario", web: "Web", telefono: "Teléfono", correo: "Correo",
  whatsapp: "WhatsApp", recomendacion: "Recomendación", presencial: "Presencial", otro: "Otro",
};
const TIPOS_ACTIVIDAD: Record<string, { label: string; Icon: any }> = {
  nota: { label: "Nota", Icon: StickyNote }, llamada: { label: "Llamada", Icon: Phone }, correo: { label: "Correo", Icon: Mail },
  whatsapp: { label: "WhatsApp", Icon: MessageCircle }, reunion: { label: "Reunión", Icon: Users }, etapa: { label: "Cambio", Icon: TrendingUp },
};

const euros = (v: any) => Number(v || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const fechaCorta = (v: string) => new Date(v).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const aInputFecha = (v: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const vencida = (v: string | null) => !!v && new Date(v) < new Date();
const iniciales = (n: string | null) => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
const valorEditable = (v: any) => (v == null || v === "" ? "" : String(Number(v)).replace(".", ","));

const campo = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-red-300";
const etiqueta = "mb-1 block text-xs font-semibold text-slate-600";
const botonSec = "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40";
const botonPri = "inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40";

export default function Crm() {
  const { getToken } = useAuth();
  const { puede } = useOrganizacion();
  const editable = puede("clientes", "edicion");
  const [params, setParams] = useSearchParams();
  const [pestana, setPestana] = useState<"oportunidades" | "configuracion">("oportunidades");
  const [config, setConfig] = useState<Config | null>(null);
  const [embudoId, setEmbudoId] = useState<string>("");
  const [lista, setLista] = useState<Oportunidad[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [mias, setMias] = useState(false);
  const [estado, setEstado] = useState<Estado | "todas">("abierta");
  const [vista, setVista] = useState<"tablero" | "lista">("tablero");
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [nueva, setNueva] = useState(false);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [perder, setPerder] = useState<{ o: Oportunidad; etapaId?: string; estado?: Estado } | null>(null);
  const abierta = params.get("o");
  const abrir = (id: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("o", id); else n.delete("o"); return n; }, { replace: true });

  const cargarConfig = useCallback(async () => {
    const r = await apiFetch("/api/crm/config", { getToken });
    if (r?.success === false || !r?.data) { aviso.error(r?.error || "No se pudo cargar el CRM"); return; }
    setConfig(r.data);
    setEmbudoId((id) => (id && r.data.embudos.some((e: Embudo) => e.id === id) ? id : r.data.embudos[0]?.id || ""));
  }, [getToken]);

  const cargar = useCallback(async () => {
    if (!embudoId) return;
    try {
      const p = new URLSearchParams({ embudo: embudoId, estado });
      if (q.trim()) p.set("q", q.trim());
      if (mias) p.set("mias", "1");
      const [l, r] = await Promise.all([
        apiFetch(`/api/crm/oportunidades?${p}`, { getToken }),
        apiFetch(`/api/crm/resumen?embudo=${embudoId}`, { getToken }),
      ]);
      if (l?.success === false) throw new Error(l.error);
      setLista(l?.data || []);
      setResumen(r?.data || null);
    } catch (e: any) {
      aviso.error(e?.message || "No se pudo cargar el CRM");
    } finally {
      setCargando(false);
    }
  }, [getToken, embudoId, estado, q, mias]);

  useEffect(() => { void cargarConfig(); }, [cargarConfig]);
  useEffect(() => { const t = window.setTimeout(() => void cargar(), q ? 300 : 0); return () => window.clearTimeout(t); }, [cargar, q]);
  useEffect(() => {
    apiFetch("/api/organizacion/miembros", { getToken }).then((r) => setMiembros((r?.data || []).map((m: any) => ({ userId: m.userId, nombre: m.nombre })))).catch(() => {});
  }, [getToken]);

  const embudo = config?.embudos.find((e) => e.id === embudoId);
  const etapas = useMemo(() => embudo?.etapas || [], [embudo]);
  const porEtapa = useMemo(() => {
    const m = new Map<string, Oportunidad[]>(etapas.map((e) => [e.id, []]));
    for (const o of lista) if (o.etapa_id) m.get(o.etapa_id)?.push(o);
    return m;
  }, [lista, etapas]);

  const mover = async (o: Oportunidad, destino: Etapa) => {
    if (o.etapa_id === destino.id || !editable) return;
    if (destino.tipo === "perdida") { setPerder({ o, etapaId: destino.id }); return; }
    setLista((prev) => prev.map((x) => (x.id === o.id ? { ...x, etapa_id: destino.id } : x)));
    const r = await apiFetch(`/api/crm/oportunidades/${o.id}`, { method: "PUT", getToken, body: JSON.stringify({ etapa_id: destino.id }) });
    if (r?.success === false) { aviso.error(r.error); void cargar(); return; }
    if (destino.tipo === "ganada" && !o.cliente_id && await confirmar({
      titulo: `¿Dar de alta a «${o.nombre}» como cliente?`,
      mensaje: "Se crea su ficha de cliente con el nombre, el teléfono y el correo de la oportunidad.",
      confirmar: "Sí, crear el cliente", cancelar: "Ahora no",
    })) {
      const c = await apiFetch(`/api/crm/oportunidades/${o.id}/convertir`, { method: "POST", getToken, body: "{}" });
      if (c?.success === false) aviso.error(c.error); else aviso.ok(`«${o.nombre}» ya es cliente`);
    }
    void cargar();
  };

  const nombreEtapa = (id: string | null) => etapas.find((e) => e.id === id)?.nombre || "—";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white"><HeartHandshake size={19} className="text-red-600" /></div>
          <h1 className="text-xl font-extrabold text-slate-900">CRM</h1>
          <nav className="flex gap-1">
            {[["oportunidades", "Oportunidades"], ...(editable ? [["configuracion", "Embudos y cuestionario"]] : [])].map(([id, label]) => (
              <button key={id} onClick={() => setPestana(id as any)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${pestana === id ? "bg-red-50 text-red-700" : "text-slate-500 hover:text-slate-800"}`}>{label}</button>
            ))}
          </nav>
        </div>
        {pestana === "oportunidades" && editable && (
          <button onClick={() => setNueva(true)} className={botonPri}><Plus size={16} /> Añadir oportunidad</button>
        )}
      </div>

      {pestana === "configuracion" && config ? (
        <ConfiguracionCrm config={config} embudoId={embudoId} setEmbudoId={setEmbudoId} onGuardado={() => { void cargarConfig(); void cargar(); }} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select id="crm-embudo" value={embudoId} onChange={(e) => setEmbudoId(e.target.value)} className="min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none focus:border-red-300" aria-label="Embudo">
              {config?.embudos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">{lista.length} oportunidades</span>
            <div className="ml-auto flex overflow-hidden rounded-lg border border-slate-200">
              {([["tablero", LayoutGrid], ["lista", List]] as const).map(([v, Icon]) => (
                <button key={v} onClick={() => setVista(v)} aria-label={v === "tablero" ? "Vista de tablero" : "Vista de lista"} aria-pressed={vista === v}
                  className={`px-2.5 py-2 ${vista === v ? "bg-red-50 text-red-600" : "bg-white text-slate-500 hover:bg-slate-50"}`}><Icon size={15} /></button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: "Abiertas", valor: resumen ? String(resumen.abiertas) : "—", Icon: HeartHandshake, pie: "", alerta: false },
              { label: "Valor en curso", valor: resumen ? euros(resumen.valorAbierto) : "—", Icon: Euro, pie: "", alerta: false },
              { label: "Conversión (90 días)", valor: resumen?.conversion90 != null ? `${resumen.conversion90} %` : "—", Icon: TrendingUp, alerta: false,
                pie: resumen ? `${resumen.ganadas90} ganadas · ${resumen.perdidas90} perdidas o abandonadas` : "" },
              { label: "Seguimientos vencidos", valor: resumen ? String(resumen.seguimientosVencidos) : "—", Icon: CalendarClock, pie: "", alerta: !!resumen?.seguimientosVencidos },
            ].map((t) => (
              <div key={t.label} className={`rounded-2xl border bg-white p-3.5 ${t.alerta ? "border-rose-200" : "border-slate-200"}`}>
                <div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t.label}</span><t.Icon size={15} className={t.alerta ? "text-rose-500" : "text-slate-400"} /></div>
                <p className={`mt-1 text-xl font-extrabold tabular-nums ${t.alerta ? "text-rose-600" : "text-slate-900"}`}>{t.valor}</p>
                {t.pie && <p className="text-[11px] text-slate-500">{t.pie}</p>}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
              {ESTADOS.map((e) => (
                <button key={e.id} onClick={() => setEstado(e.id)} aria-pressed={estado === e.id}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${estado === e.id ? "bg-red-50 text-red-700" : "text-slate-500 hover:text-slate-800"}`}>{e.label}</button>
              ))}
            </div>
            <button onClick={() => setMias((v) => !v)} aria-pressed={mias}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${mias ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>Solo las mías</button>
            <label className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="crm-buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar oportunidades o etiquetas" className={`${campo} pl-9`} />
            </label>
          </div>

          {cargando || !config ? (
            <div className="flex items-center gap-2 py-16 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Cargando oportunidades…</div>
          ) : vista === "lista" ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full min-w-[880px] text-sm">
                <thead><tr className="border-b border-slate-200 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {["Oportunidad", "Etapa", "Estado", "Valor", "Fuente", "Propietario", "Próxima acción"].map((h) => <th key={h} className="px-3 py-2.5">{h}</th>)}
                </tr></thead>
                <tbody>
                  {lista.map((o) => (
                    <tr key={o.id} onClick={() => abrir(o.id)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{o.nombre}</td>
                      <td className="px-3 py-2.5 text-slate-600">{nombreEtapa(o.etapa_id)}</td>
                      <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTILO_ESTADO[o.estado]}`}>{o.estado}</span></td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-700">{euros(o.valor_estimado)}</td>
                      <td className="px-3 py-2.5 text-slate-600">{ORIGENES[o.origen] || o.origen}</td>
                      <td className="px-3 py-2.5 text-slate-600">{o.responsable_nombre || "—"}</td>
                      <td className={`px-3 py-2.5 ${vencida(o.proxima_accion_at) && o.estado === "abierta" ? "peligro font-semibold text-rose-600" : "text-slate-500"}`}>
                        {o.proxima_accion ? `${o.proxima_accion}${o.proxima_accion_at ? ` · ${fechaCorta(o.proxima_accion_at)}` : ""}` : "—"}
                      </td>
                    </tr>
                  ))}
                  {!lista.length && <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-400">No hay oportunidades con estos filtros</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto pb-3">
              <div className="flex gap-3" style={{ width: "max-content" }}>
                {etapas.map((e) => {
                  const items = porEtapa.get(e.id) || [];
                  const total = items.reduce((s, o) => s + Number(o.valor_estimado || 0), 0);
                  const reglas = [e.aviso_responsable && "aviso al propietario", e.accion_texto && `próxima acción: ${e.accion_texto}`,
                    e.mover_horas && e.mover_a_etapa_id && `tras ${e.mover_horas} h → ${nombreEtapa(e.mover_a_etapa_id)}`].filter(Boolean);
                  return (
                    <div key={e.id}
                      onDragOver={(ev) => { if (arrastrando) { ev.preventDefault(); setSobre(e.id); } }}
                      onDragLeave={() => setSobre((s) => (s === e.id ? null : s))}
                      onDrop={(ev) => { ev.preventDefault(); setSobre(null); const o = lista.find((x) => x.id === arrastrando); setArrastrando(null); if (o) void mover(o, e); }}
                      className={`flex w-[272px] shrink-0 flex-col gap-2 rounded-2xl border p-2.5 transition-colors ${sobre === e.id ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${COLORES[e.color || "slate"] || COLORES.slate}`} />
                          <span className="truncate text-sm font-bold text-slate-800" title={e.nombre}>{e.nombre}</span>
                          {reglas.length > 0 && <span title={`Reglas: ${reglas.join(" · ")}`} className="ml-auto"><Zap size={13} className="text-amber-500" /></span>}
                        </div>
                        <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">{items.length} oportunidades · <b className="text-slate-700">{euros(total)}</b></p>
                      </div>
                      <div className="flex max-h-[calc(100dvh-360px)] min-h-[200px] flex-col gap-2 overflow-y-auto">
                        {items.map((o) => (
                          <button key={o.id} type="button" draggable={editable}
                            onDragStart={(ev) => { setArrastrando(o.id); ev.dataTransfer.effectAllowed = "move"; }}
                            onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                            onClick={() => abrir(o.id)}
                            className={`grid gap-1.5 rounded-xl border bg-white p-3 text-left shadow-sm hover:border-slate-300 ${arrastrando === o.id ? "opacity-50" : ""} ${vencida(o.proxima_accion_at) && o.estado === "abierta" ? "border-rose-200" : "border-slate-200"}`}>
                            <span className="flex items-start justify-between gap-2">
                              <span className="text-sm font-bold text-slate-800">{o.nombre}</span>
                              <span title={o.responsable_nombre || "Sin asignar"} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">{iniciales(o.responsable_nombre)}</span>
                            </span>
                            <span className="grid grid-cols-[56px_1fr] gap-y-0.5 text-[12px]">
                              <span className="text-slate-500">Fuente:</span><span className="text-slate-700">{ORIGENES[o.origen] || o.origen}</span>
                              <span className="text-slate-500">Valor:</span><span className="tabular-nums text-slate-700">{euros(o.valor_estimado)}</span>
                            </span>
                            {o.estado !== "abierta" && <span className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${ESTILO_ESTADO[o.estado]}`}>{o.estado}</span>}
                            {o.etiquetas?.length > 0 && (
                              <span className="flex flex-wrap gap-1">{o.etiquetas.map((t) => <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{t}</span>)}</span>
                            )}
                            {o.proxima_accion && o.estado === "abierta" && (
                              <span className={`flex items-start gap-1 text-[11px] ${vencida(o.proxima_accion_at) ? "peligro font-semibold text-rose-600" : "text-slate-500"}`}>
                                <CalendarClock size={12} className="mt-px shrink-0" /><span>{o.proxima_accion}{o.proxima_accion_at ? ` · ${fechaCorta(o.proxima_accion_at)}` : ""}</span>
                              </span>
                            )}
                            <span className="flex items-center gap-3 border-t border-slate-100 pt-1.5 text-slate-400">
                              {o.telefono && <Phone size={13} />}{o.email && <Mail size={13} />}
                              <span className="flex items-center gap-0.5 text-[11px]"><StickyNote size={13} /> {o.n_actividades || 0}</span>
                              {o.cliente_id && <UserCheck size={13} className="ml-auto text-emerald-600" />}
                            </span>
                          </button>
                        ))}
                        {!items.length && <p className="py-6 text-center text-xs text-slate-400">Ninguna</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {nueva && config && <NuevaOportunidad config={config} embudoId={embudoId} miembros={miembros} onClose={() => setNueva(false)} onCreada={(id) => { setNueva(false); void cargar(); abrir(id); }} />}
      {abierta && config && (
        <FichaOportunidad id={abierta} config={config} editable={editable} miembros={miembros} onClose={() => abrir(null)} onCambio={() => void cargar()}
          onPerder={(o, etapaId, est) => setPerder({ o, etapaId, estado: est })} />
      )}
      {perder && <MotivoPerdida {...perder} onClose={() => setPerder(null)} onHecho={() => { setPerder(null); void cargar(); }} />}
    </div>
  );
}

// ── Ventanas (fuera de la página animada) ───────────────────────────────────
function Capa({ children, onClose, lateral = false }: { children: React.ReactNode; onClose: () => void; lateral?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return createPortal(
    <div className={`fixed inset-0 z-[60] flex bg-slate-900/40 ${lateral ? "justify-end" : "items-center justify-center p-4"}`} onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        className={lateral ? "flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl" : "flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function CamposDatos({ v, set, miembros }: { v: any; set: (k: string, val: any) => void; miembros: Miembro[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2"><span className={etiqueta}>Nombre de la oportunidad *</span>
        <input id="crm-nombre" value={v.nombre || ""} onChange={(e) => set("nombre", e.target.value)} placeholder="Persona o empresa" className={campo} /></label>
      <label><span className={etiqueta}>Teléfono</span><input id="crm-telefono" value={v.telefono || ""} onChange={(e) => set("telefono", e.target.value)} className={campo} /></label>
      <label><span className={etiqueta}>Correo</span><input id="crm-email" type="email" value={v.email || ""} onChange={(e) => set("email", e.target.value)} className={campo} /></label>
      <label><span className={etiqueta}>Fuente</span>
        <select id="crm-origen" value={v.origen || "otro"} onChange={(e) => set("origen", e.target.value)} className={campo}>
          {Object.entries(ORIGENES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
      <label><span className={etiqueta}>Valor (€)</span>
        <input id="crm-valor" inputMode="decimal" value={v.valor_estimado ?? ""} onChange={(e) => set("valor_estimado", e.target.value)} placeholder="0" className={campo} /></label>
      <label><span className={etiqueta}>Propietario</span>
        <select id="crm-responsable" value={v.responsable_user_id || ""} onChange={(e) => set("responsable_user_id", e.target.value)} className={campo}>
          <option value="">Yo</option>
          {miembros.map((m) => <option key={m.userId} value={m.userId}>{m.nombre}</option>)}
        </select></label>
      <label><span className={etiqueta}>Área</span><input id="crm-area" value={v.area || ""} onChange={(e) => set("area", e.target.value)} placeholder="Medidas de apoyo…" className={campo} /></label>
      <label className="sm:col-span-2"><span className={etiqueta}>Qué necesita</span>
        <textarea id="crm-asunto" value={v.asunto || ""} onChange={(e) => set("asunto", e.target.value)} rows={2} className={campo} /></label>
      <label className="sm:col-span-2"><span className={etiqueta}>Etiquetas (separadas por comas)</span>
        <input id="crm-etiquetas" value={Array.isArray(v.etiquetas) ? v.etiquetas.join(", ") : v.etiquetas || ""} onChange={(e) => set("etiquetas", e.target.value)} placeholder="urgente, curatela…" className={campo} /></label>
      <label><span className={etiqueta}>Próxima acción</span>
        <input id="crm-accion" value={v.proxima_accion || ""} onChange={(e) => set("proxima_accion", e.target.value)} className={campo} /></label>
      <label><span className={etiqueta}>Cuándo</span>
        <input id="crm-accion-fecha" type="datetime-local" value={aInputFecha(v.proxima_accion_at)} onChange={(e) => set("proxima_accion_at", e.target.value ? new Date(e.target.value).toISOString() : null)} className={campo} /></label>
    </div>
  );
}

function Cuestionario({ campos, valores, set, disabled }: { campos: Campo[]; valores: Record<string, string>; set: (id: string, v: string) => void; disabled?: boolean }) {
  if (!campos.length) return null;
  return (
    <div className="space-y-3">
      {campos.map((c) => (
        <div key={c.id}>
          <p className={etiqueta}>{c.nombre}</p>
          {c.tipo === "opcion" ? (
            <div className="flex flex-wrap gap-1.5">
              {c.opciones.map((op) => (
                <button key={op} type="button" disabled={disabled} onClick={() => set(c.id, valores[c.id] === op ? "" : op)} aria-pressed={valores[c.id] === op}
                  className={`rounded-lg border px-2.5 py-1.5 text-left text-xs ${valores[c.id] === op ? "border-red-300 bg-red-50 font-semibold text-red-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{op}</button>
              ))}
            </div>
          ) : (
            <input id={`crm-campo-${c.id}`} disabled={disabled} type={c.tipo === "fecha" ? "date" : c.tipo === "numero" ? "number" : "text"}
              value={valores[c.id] || ""} onChange={(e) => set(c.id, e.target.value)} className={campo} />
          )}
        </div>
      ))}
    </div>
  );
}

function NuevaOportunidad({ config, embudoId, miembros, onClose, onCreada }: { config: Config; embudoId: string; miembros: Miembro[]; onClose: () => void; onCreada: (id: string) => void }) {
  const { getToken } = useAuth();
  const etapas = config.embudos.find((e) => e.id === embudoId)?.etapas || [];
  const [v, setV] = useState<any>({ origen: "telefono", etapa_id: etapas[0]?.id, campos: {} });
  const [guardando, setGuardando] = useState(false);
  const crear = async () => {
    if (!String(v.nombre || "").trim()) { aviso.error("Escribe el nombre de la persona o empresa"); return; }
    setGuardando(true);
    const cuerpo = { ...v };
    if (!cuerpo.responsable_user_id) delete cuerpo.responsable_user_id;
    const r = await apiFetch("/api/crm/oportunidades", { method: "POST", getToken, body: JSON.stringify(cuerpo) });
    setGuardando(false);
    if (r?.success === false || !r?.data) { aviso.error(r?.error || "No se pudo crear"); return; }
    aviso.ok("Oportunidad creada");
    onCreada(r.data.id);
  };
  return (
    <Capa onClose={onClose}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-extrabold text-slate-900">Añadir oportunidad</h2>
        <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <label className="block"><span className={etiqueta}>Etapa</span>
          <select id="crm-nueva-etapa" value={v.etapa_id || ""} onChange={(e) => setV((p: any) => ({ ...p, etapa_id: e.target.value }))} className={campo}>
            {etapas.filter((e) => e.tipo === "abierta").map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select></label>
        <CamposDatos v={v} set={(k, val) => setV((p: any) => ({ ...p, [k]: val }))} miembros={miembros} />
        {config.campos.length > 0 && (
          <details className="rounded-xl border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Cuestionario ({config.campos.length} preguntas)</summary>
            <div className="mt-3"><Cuestionario campos={config.campos} valores={v.campos} set={(id, val) => setV((p: any) => ({ ...p, campos: { ...p.campos, [id]: val } }))} /></div>
          </details>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button onClick={onClose} className={botonSec}>Cancelar</button>
        <button onClick={() => void crear()} disabled={guardando} className={botonPri}>{guardando && <Loader2 size={14} className="animate-spin" />} Crear</button>
      </div>
    </Capa>
  );
}

function FichaOportunidad({ id, config, editable, miembros, onClose, onCambio, onPerder }: {
  id: string; config: Config; editable: boolean; miembros: Miembro[]; onClose: () => void; onCambio: () => void;
  onPerder: (o: Oportunidad, etapaId?: string, estado?: Estado) => void;
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
    const datos = { ...r.data, valor_estimado: valorEditable(r.data.valor_estimado), campos: r.data.campos || {} };
    setO(datos); setV(datos);
  }, [getToken, id, onClose]);
  useEffect(() => { void cargar(); }, [cargar]);

  const etapas = config.embudos.find((e) => e.id === o?.embudo_id)?.etapas || config.embudos[0]?.etapas || [];
  const CLAVES = ["nombre", "telefono", "email", "origen", "area", "asunto", "valor_estimado", "responsable_user_id", "proxima_accion", "proxima_accion_at"];
  const etiquetasDe = (x: any) => (Array.isArray(x) ? x : String(x || "").split(",")).map((t: string) => String(t).trim()).filter(Boolean).join(",");
  const cambiado = !!o && (CLAVES.some((k) => String(v[k] ?? "") !== String((o as any)[k] ?? ""))
    || etiquetasDe(v.etiquetas) !== etiquetasDe(o.etiquetas)
    || JSON.stringify(v.campos || {}) !== JSON.stringify(o.campos || {}));

  const enviar = async (cuerpo: any, mensaje = "Guardado") => {
    setGuardando(true);
    const r = await apiFetch(`/api/crm/oportunidades/${id}`, { method: "PUT", getToken, body: JSON.stringify(cuerpo) });
    setGuardando(false);
    if (r?.success === false) { aviso.error(r.error); return false; }
    aviso.ok(mensaje); await cargar(); onCambio();
    return true;
  };
  const guardar = () => {
    const cuerpo: any = {};
    for (const k of CLAVES) cuerpo[k] = v[k];
    cuerpo.etiquetas = v.etiquetas; cuerpo.campos = v.campos;
    if (!cuerpo.responsable_user_id) delete cuerpo.responsable_user_id;
    return enviar(cuerpo);
  };
  const cambiarEtapa = (etapaId: string) => {
    const destino = etapas.find((e) => e.id === etapaId);
    if (!o || !destino) return;
    if (destino.tipo === "perdida") onPerder(o, etapaId);
    else void enviar({ etapa_id: etapaId }, `Movida a «${destino.nombre}»`);
  };
  const cambiarEstado = (est: Estado) => {
    if (!o) return;
    if (est === "perdida" || est === "abandonada") onPerder(o, undefined, est);
    else void enviar({ estado: est }, "Estado cambiado");
  };
  const convertir = async () => {
    if (!o || !(await confirmar({ titulo: `¿Dar de alta a «${o.nombre}» como cliente?`, mensaje: "Se crea su ficha de cliente y la oportunidad queda ganada.", confirmar: "Sí, es cliente" }))) return;
    const r = await apiFetch(`/api/crm/oportunidades/${id}/convertir`, { method: "POST", getToken, body: "{}" });
    if (r?.success === false) { aviso.error(r.error); return; }
    aviso.ok(`«${o.nombre}» ya es cliente`); await cargar(); onCambio();
  };
  const borrar = async () => {
    if (!o || !(await confirmar({ titulo: `¿Eliminar la oportunidad «${o.nombre}»?`, mensaje: "Se borra con todo su historial. Si no salió adelante, mejor márcala como perdida o abandonada.", confirmar: "Eliminar", peligro: true }))) return;
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

  return (
    <Capa onClose={onClose} lateral>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0 space-y-2">
          <h2 className="truncate text-base font-extrabold text-slate-900">{o?.nombre || "…"}</h2>
          {o && (
            <div className="flex flex-wrap items-center gap-2">
              <select id="crm-etapa" value={o.etapa_id || ""} disabled={!editable || guardando} onChange={(e) => cambiarEtapa(e.target.value)} aria-label="Etapa"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                {etapas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
              <select id="crm-estado" value={o.estado} disabled={!editable || guardando} onChange={(e) => cambiarEstado(e.target.value as Estado)} aria-label="Estado"
                className={`rounded-lg border-0 px-2.5 py-1.5 text-xs font-bold ${ESTILO_ESTADO[o.estado]}`}>
                {(["abierta", "ganada", "perdida", "abandonada"] as Estado[]).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
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
          {(o.estado === "perdida" || o.estado === "abandonada") && o.motivo_perdida && (
            <p className="peligro flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><XCircle size={16} className="mt-0.5 shrink-0" /> {o.estado === "perdida" ? "Perdida" : "Abandonada"}: {o.motivo_perdida}</p>
          )}
          <fieldset disabled={!editable}>
            <CamposDatos v={v} set={(k, val) => setV((p: any) => ({ ...p, [k]: val }))} miembros={miembros} />
          </fieldset>
          {config.campos.length > 0 && (
            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cuestionario</h3>
              <Cuestionario campos={config.campos} valores={v.campos || {}} disabled={!editable} set={(cid, val) => setV((p: any) => ({ ...p, campos: { ...p.campos, [cid]: val } }))} />
            </section>
          )}
          {editable && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void guardar()} disabled={!cambiado || guardando} className={botonPri}>
                {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar
              </button>
              {!o.cliente_id && (
                <button onClick={() => void convertir()} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"><UserCheck size={14} /> Convertir en cliente</button>
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
                <button onClick={() => void anadir()} disabled={!nota.trim()} className={botonSec}>Añadir al historial</button>
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

function MotivoPerdida({ o, etapaId, estado, onClose, onHecho }: { o: Oportunidad; etapaId?: string; estado?: Estado; onClose: () => void; onHecho: () => void }) {
  const { getToken } = useAuth();
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const abandono = estado === "abandonada";
  const RAPIDOS = abandono
    ? ["No contesta", "Dejó de responder tras la reunión", "Datos de contacto erróneos"]
    : ["Le parece caro", "Se va con otro despacho", "No tiene caso", "Lo resuelve por su cuenta", "No interesado"];
  const guardar = async () => {
    if (!motivo.trim()) return;
    setGuardando(true);
    const cuerpo: any = { motivo_perdida: motivo };
    if (etapaId) cuerpo.etapa_id = etapaId; else cuerpo.estado = estado || "perdida";
    const r = await apiFetch(`/api/crm/oportunidades/${o.id}`, { method: "PUT", getToken, body: JSON.stringify(cuerpo) });
    setGuardando(false);
    if (r?.success === false) { aviso.error(r.error); return; }
    aviso.ok(`«${o.nombre}» marcada como ${abandono ? "abandonada" : "perdida"}`);
    onHecho();
  };
  return (
    <Capa onClose={onClose}>
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50"><AlertTriangle size={18} className="text-rose-600" /></span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{abandono ? "¿Por qué se abandona" : "¿Por qué se ha perdido"} «{o.nombre}»?</h2>
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
          <button onClick={onClose} className={botonSec}>Cancelar</button>
          <button onClick={() => void guardar()} disabled={!motivo.trim() || guardando} className={botonPri}>{guardando && <Loader2 size={14} className="animate-spin" />} Confirmar</button>
        </div>
      </div>
    </Capa>
  );
}

// ── Configuración: embudos, etapas con reglas y cuestionario ────────────────
function ConfiguracionCrm({ config, embudoId, setEmbudoId, onGuardado }: { config: Config; embudoId: string; setEmbudoId: (id: string) => void; onGuardado: () => void }) {
  const { getToken } = useAuth();
  const embudo = config.embudos.find((e) => e.id === embudoId) || config.embudos[0];
  const [nombre, setNombre] = useState(embudo?.nombre || "");
  const [etapas, setEtapas] = useState<any[]>(() => (embudo?.etapas || []).map((e) => ({ ...e })));
  const [campos, setCampos] = useState<any[]>(() => config.campos.map((c) => ({ ...c, opcionesTexto: c.opciones.join("\n") })));
  const [guardando, setGuardando] = useState<"" | "embudo" | "campos">("");
  useEffect(() => { setNombre(embudo?.nombre || ""); setEtapas((embudo?.etapas || []).map((e) => ({ ...e }))); }, [embudo]);
  useEffect(() => { setCampos(config.campos.map((c) => ({ ...c, opcionesTexto: c.opciones.join("\n") }))); }, [config.campos]);

  const setEtapa = (i: number, k: string, val: any) => setEtapas((p) => p.map((e, j) => (j === i ? { ...e, [k]: val } : e)));
  const moverEtapa = (i: number, d: number) => setEtapas((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const guardarEmbudo = async () => {
    setGuardando("embudo");
    const r = await apiFetch(`/api/crm/embudos/${embudo.id}`, { method: "PUT", getToken, body: JSON.stringify({ nombre, etapas }) });
    setGuardando("");
    if (r?.success === false) { aviso.error(r.error); return; }
    aviso.ok("Embudo guardado"); onGuardado();
  };
  const nuevoEmbudo = async () => {
    const r = await apiFetch("/api/crm/embudos", { method: "POST", getToken, body: JSON.stringify({ nombre: `Embudo ${config.embudos.length + 1}` }) });
    if (r?.success === false) { aviso.error(r.error); return; }
    aviso.ok("Embudo creado: ponle nombre y sus etapas"); setEmbudoId(r.data.id); onGuardado();
  };
  const guardarCampos = async () => {
    setGuardando("campos");
    const lista = campos.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, opciones: String(c.opcionesTexto || "").split("\n").map((s: string) => s.trim()).filter(Boolean) }));
    const r = await apiFetch("/api/crm/campos", { method: "PUT", getToken, body: JSON.stringify({ campos: lista }) });
    setGuardando("");
    if (r?.success === false) { aviso.error(r.error); return; }
    aviso.ok("Cuestionario guardado"); onGuardado();
  };

  if (!embudo) return null;
  const mini = "rounded-md border border-slate-200 bg-white px-2 py-1 text-xs";
  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label><span className={etiqueta}>Embudo</span>
            <select id="crm-cfg-embudo" value={embudo.id} onChange={(e) => setEmbudoId(e.target.value)} className={`${campo} min-w-[200px]`}>
              {config.embudos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select></label>
          <label className="min-w-[220px] flex-1"><span className={etiqueta}>Nombre</span>
            <input id="crm-cfg-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={campo} /></label>
          <button onClick={() => void nuevoEmbudo()} className={botonSec}><Plus size={14} /> Nuevo embudo</button>
        </div>
        <p className="text-xs text-slate-500">
          Cada etapa puede tener reglas: <b>avisar al propietario</b> cuando una oportunidad entra, poner una <b>próxima acción</b> automática y, si sigue
          sin moverse unas horas, <b>pasarla a otra etapa</b> (por ejemplo, «No respondió» → «No respondió (48h)»). Las de tipo Ganada o Perdida cambian el estado.
        </p>
        <div className="space-y-2">
          {etapas.map((e, i) => (
            <div key={e.id || i} className="grid gap-2 rounded-xl border border-slate-200 p-3 lg:grid-cols-[auto_1.4fr_auto_auto_auto]">
              <div className="flex items-center gap-1">
                <button onClick={() => moverEtapa(i, -1)} disabled={i === 0} aria-label="Subir" className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={14} /></button>
                <button onClick={() => moverEtapa(i, 1)} disabled={i === etapas.length - 1} aria-label="Bajar" className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={14} /></button>
                <span className="w-5 text-center text-xs font-bold text-slate-400">{i + 1}</span>
              </div>
              <input id={`crm-etapa-${i}`} value={e.nombre} onChange={(ev) => setEtapa(i, "nombre", ev.target.value)} aria-label="Nombre de la etapa" className={campo} />
              <select value={e.tipo} onChange={(ev) => setEtapa(i, "tipo", ev.target.value)} aria-label="Tipo" className={campo}>
                <option value="abierta">En curso</option><option value="ganada">Ganada</option><option value="perdida">Perdida</option>
              </select>
              <select value={e.color || "slate"} onChange={(ev) => setEtapa(i, "color", ev.target.value)} aria-label="Color" className={campo}>
                {Object.keys(COLORES).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex items-center justify-end">
                <button onClick={() => setEtapas((p) => p.filter((_, j) => j !== i))} aria-label="Quitar etapa" className="peligro rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 lg:col-span-5">
                <Zap size={13} className="text-amber-500" />
                <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!!e.aviso_responsable} onChange={(ev) => setEtapa(i, "aviso_responsable", ev.target.checked)} className="accent-red-600" /><Bell size={12} /> Avisar al propietario</label>
                <span className="text-slate-300">·</span>
                <span>Próxima acción</span>
                <input value={e.accion_texto || ""} onChange={(ev) => setEtapa(i, "accion_texto", ev.target.value)} placeholder="ninguna" className={`${mini} w-52`} aria-label="Próxima acción automática" />
                <span>en</span>
                <input type="number" min={0} value={e.accion_horas ?? ""} onChange={(ev) => setEtapa(i, "accion_horas", ev.target.value === "" ? null : Number(ev.target.value))} className={`${mini} w-16`} aria-label="Horas para la próxima acción" />
                <span>h</span>
                <span className="text-slate-300">·</span>
                <span>Si sigue</span>
                <input type="number" min={1} value={e.mover_horas ?? ""} onChange={(ev) => setEtapa(i, "mover_horas", ev.target.value === "" ? null : Number(ev.target.value))} className={`${mini} w-16`} aria-label="Horas sin moverse" />
                <span>h, pasar a</span>
                <select value={e.mover_a_etapa_id || ""} onChange={(ev) => setEtapa(i, "mover_a_etapa_id", ev.target.value || null)} className={mini} aria-label="Etapa destino">
                  <option value="">—</option>
                  {etapas.filter((x) => x !== e && x.id).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEtapas((p) => [...p, { id: `nueva-${Date.now()}`, nombre: "Nueva etapa", tipo: "abierta", color: "slate" }])} className={botonSec}><Plus size={14} /> Añadir etapa</button>
          <button onClick={() => void guardarEmbudo()} disabled={guardando === "embudo"} className={`${botonPri} ml-auto`}>{guardando === "embudo" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar embudo</button>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Settings2 size={15} /> Cuestionario de captación</h2>
          <p className="mt-1 text-xs text-slate-500">Las preguntas que se rellenan en cada oportunidad. Para las de opción única, una opción por línea.</p>
        </div>
        {campos.map((c, i) => (
          <div key={c.id || i} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_auto_auto]">
            <input value={c.nombre} onChange={(ev) => setCampos((p) => p.map((x, j) => (j === i ? { ...x, nombre: ev.target.value } : x)))} aria-label="Pregunta" className={campo} />
            <select value={c.tipo} onChange={(ev) => setCampos((p) => p.map((x, j) => (j === i ? { ...x, tipo: ev.target.value } : x)))} aria-label="Tipo de respuesta" className={campo}>
              <option value="opcion">Opción única</option><option value="texto">Texto</option><option value="fecha">Fecha</option><option value="numero">Número</option>
            </select>
            <button onClick={() => setCampos((p) => p.filter((_, j) => j !== i))} aria-label="Quitar pregunta" className="peligro rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
            {c.tipo === "opcion" && (
              <textarea value={c.opcionesTexto} onChange={(ev) => setCampos((p) => p.map((x, j) => (j === i ? { ...x, opcionesTexto: ev.target.value } : x)))}
                rows={Math.max(2, String(c.opcionesTexto || "").split("\n").length)} aria-label="Opciones" className={`${campo} sm:col-span-3`} />
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setCampos((p) => [...p, { nombre: "Nueva pregunta", tipo: "opcion", opcionesTexto: "Sí\nNo" }])} className={botonSec}><Tag size={14} /> Añadir pregunta</button>
          <button onClick={() => void guardarCampos()} disabled={guardando === "campos"} className={`${botonPri} ml-auto`}>{guardando === "campos" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar cuestionario</button>
        </div>
      </section>
    </div>
  );
}
