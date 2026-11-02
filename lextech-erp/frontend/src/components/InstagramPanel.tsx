import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Clock, Copy, EyeOff, Heart, Image as ImageIcon, Instagram, Loader2,
  Lock, MessageCircle, MessageSquare, Plus, RefreshCw, Search, Send, Trash2, Unplug, Upload, UserRound,
} from "lucide-react";
import { Spinner } from "./Spinner";
import { Modal } from "./Modal";
import { safeJson } from "../lib/api";
import { useIsMobile } from "../lib/useIsMobile";

// Comunicación Externa → Instagram: mensajes directos (recibidos por webhook),
// publicaciones con sus comentarios y publicar reels, fotos o historias.
// Backend: controllers/instagramController.ts.

interface Status {
  configured: boolean;
  connected: boolean;
  webhookUrl: string;
  verifyTokenConfigurado: boolean;
  faltaConfig?: string[];
  webhookOk?: boolean;
  webhookError?: string | null;
  account?: { username?: string; name?: string; picture?: string; followers?: number; media?: number };
  accountError?: string | null;
}
interface Conversacion {
  igsid: string;
  username: string | null;
  nombre: string | null;
  foto: string | null;
  noLeidos: number;
  ultimoMensaje: string | null;
  ultimoMensajeAt: string | null;
  ventanaAbierta: boolean;
}
interface Mensaje {
  id: string;
  direccion: "entrante" | "saliente";
  texto: string | null;
  adjuntos: { tipo: string; url: string | null }[] | null;
  enviado_por: string | null;
  created_at: string;
}
interface Medio {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}
interface Comentario {
  id: string;
  text: string;
  username?: string;
  timestamp: string;
  hidden?: boolean;
  like_count?: number;
  replies?: { data: { id: string; text: string; username?: string; timestamp: string }[] };
}

const fmt = (n?: number) => (typeof n === "number" ? n.toLocaleString("es-ES") : "—");
const hora = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
};
const nombreDe = (c: Conversacion) => c.nombre || (c.username ? `@${c.username}` : "Usuario de Instagram");
const GRADIENTE = "bg-gradient-to-br from-fuchsia-500 via-pink-500 to-amber-400";

export default function InstagramPanel() {
  const { getToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const [vista, setVista] = useState<"mensajes" | "publicaciones">("mensajes");
  const [conectando, setConectando] = useState(false);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken({ skipCache: true });
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (init.body && !(init.body instanceof FormData)) headers["Content-Type"] = "application/json";
    const res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as any || {}) } });
    const json = await safeJson(res);
    if (!res.ok || json?.success === false) throw new Error(json?.error || "Error con Instagram");
    return json.data;
  }, [getToken]);

  const cargarStatus = useCallback(async () => {
    try { setStatus(await api("/api/instagram/status")); }
    catch (e: any) { setAviso({ tono: "error", texto: e.message }); }
    finally { setCargando(false); }
  }, [api]);
  useEffect(() => { void cargarStatus(); }, [cargarStatus]);

  // Aviso al volver de Instagram (?instagram=ok|error&mensaje=...)
  useEffect(() => {
    const r = searchParams.get("instagram");
    if (!r) return;
    setAviso(r === "ok" ? { tono: "ok", texto: "Cuenta de Instagram conectada." } : { tono: "error", texto: searchParams.get("mensaje") || "No se pudo conectar Instagram." });
    const next = new URLSearchParams(searchParams);
    next.delete("instagram"); next.delete("mensaje");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const conectar = async () => {
    setConectando(true);
    try { window.location.href = (await api("/api/instagram/connect", { method: "POST" })).url; }
    catch (e: any) { setAviso({ tono: "error", texto: e.message }); setConectando(false); }
  };

  if (cargando && !status) return <div className="flex flex-1 items-center justify-center"><Spinner size="md" label="Cargando Instagram..." /></div>;

  if (!status?.connected) {
    return (
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-[#fafafa]">
        <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8">
          {aviso && <Aviso aviso={aviso} />}
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200 bg-white px-6 py-10 text-center">
            <div className={`flex h-16 w-16 items-center justify-center rounded-3xl ${GRADIENTE} shadow-lg shadow-pink-200`}>
              <Instagram size={30} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Conecta el Instagram del despacho</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                Recibe y contesta los mensajes directos, responde comentarios y publica reels, fotos e historias sin salir de Vantia.
              </p>
            </div>
            {status && !status.configured ? (
              <p className="max-w-md rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
                Falta configurar Instagram en el servidor ({(status.faltaConfig?.length ? status.faltaConfig : ["META_APP_ID", "META_APP_SECRET", "INSTAGRAM_CONFIG_ID"]).join(", ")}).
              </p>
            ) : (
              <button type="button" onClick={conectar} disabled={conectando} className={`inline-flex items-center gap-2 rounded-xl ${GRADIENTE} px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60`}>
                {conectando ? <Loader2 size={15} className="animate-spin" /> : <Instagram size={15} />} Conectar Instagram
              </button>
            )}
            <p className="text-[11px] text-slate-400">Hace falta una cuenta profesional (empresa o creador). Solo el propietario o un administrador pueden conectarla.</p>
          </div>
        </div>
      </div>
    );
  }

  const acc = status.account || {};
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {acc.picture ? <img src={acc.picture} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className={`flex h-7 w-7 items-center justify-center rounded-full ${GRADIENTE}`}><Instagram size={14} className="text-white" /></span>}
          <span className="truncate text-sm font-bold text-slate-800">@{acc.username || "instagram"}</span>
          <span className="hidden text-[11px] text-slate-400 sm:inline">{fmt(acc.followers)} seguidores · {fmt(acc.media)} publicaciones</span>
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          {([["mensajes", "Mensajes", MessageCircle], ["publicaciones", "Publicaciones", ImageIcon]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setVista(k)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${vista === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>
      {(aviso || status.accountError || status.webhookOk === false) && (
        <div className="space-y-2 border-b border-slate-100 bg-white px-4 py-2">
          {aviso && <Aviso aviso={aviso} onCerrar={() => setAviso(null)} />}
          {status.accountError && <Aviso aviso={{ tono: "error", texto: status.accountError }} />}
          {status.webhookOk === false && <AvisoWebhook status={status} api={api} onListo={cargarStatus} />}
        </div>
      )}
      {vista === "mensajes" ? <Mensajes api={api} /> : <Publicaciones api={api} onDesconectado={cargarStatus} />}
    </div>
  );
}

function Aviso({ aviso, onCerrar }: { aviso: { tono: "ok" | "error"; texto: string }; onCerrar?: () => void }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${aviso.tono === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
      {aviso.tono === "ok" ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
      <span className="flex-1">{aviso.texto}</span>
      {onCerrar && <button type="button" onClick={onCerrar} className="text-xs font-semibold opacity-60 hover:opacity-100">Cerrar</button>}
    </div>
  );
}

function AvisoWebhook({ status, api, onListo }: { status: Status; api: (p: string, i?: RequestInit) => Promise<any>; onListo: () => void }) {
  const [reintentando, setReintentando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <p className="font-semibold">Los mensajes nuevos todavía no llegan a Vantia.</p>
      <p className="mt-1">
        En Meta (tu app → Instagram → configuración de la API con inicio de sesión de Instagram → webhooks) pon la URL{" "}
        <code className="rounded bg-white px-1">{status.webhookUrl}</code>{" "}
        <button type="button" onClick={() => navigator.clipboard.writeText(status.webhookUrl)} className="inline-flex items-center gap-0.5 font-semibold underline"><Copy size={10} /> copiar</button>,
        el token de verificación del servidor{status.verifyTokenConfigurado ? "" : " (falta INSTAGRAM_WEBHOOK_VERIFY_TOKEN)"} y suscríbete a <b>messages</b> y <b>comments</b>. Después pulsa reintentar.
      </p>
      {(error || status.webhookError) && <p className="mt-1 text-amber-700">Detalle: {error || status.webhookError}</p>}
      <button type="button" disabled={reintentando} onClick={async () => {
        setReintentando(true); setError(null);
        try { await api("/api/instagram/webhook/reintentar", { method: "POST" }); onListo(); }
        catch (e: any) { setError(e.message); } finally { setReintentando(false); }
      }} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 font-semibold text-white disabled:opacity-60">
        {reintentando ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Reintentar
      </button>
    </div>
  );
}

// ── Mensajes ────────────────────────────────────────────────────────────

function Avatar({ c, size = 44 }: { c: { foto: string | null }; size?: number }) {
  return c.foto
    ? <img src={c.foto} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
    : <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400"><UserRound size={size * 0.42} /></span>;
}

function Mensajes({ api }: { api: (p: string, i?: RequestInit) => Promise<any> }) {
  const isMobile = useIsMobile();
  const [lista, setLista] = useState<Conversacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string>("");
  const [hilo, setHilo] = useState<{ mensajes: Mensaje[]; ventanaAbierta: boolean; ventanaCierra: string | null } | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);
  const selRef = useRef("");
  selRef.current = sel;

  const cargarLista = useCallback(async () => {
    try {
      const l: Conversacion[] = await api("/api/instagram/conversaciones");
      // La abierta se está leyendo: aunque la respuesta llegue antes de marcarla, sin contador.
      setLista(l.map((c) => (c.igsid === selRef.current ? { ...c, noLeidos: 0 } : c)));
    } catch { /* se reintenta en la siguiente pasada */ } finally { setCargando(false); }
  }, [api]);
  const cargarHilo = useCallback(async (igsid: string) => {
    try { setHilo(await api(`/api/instagram/conversaciones/${encodeURIComponent(igsid)}`)); } catch (e: any) { setError(e.message); }
  }, [api]);

  // Sin tiempo real: se consulta cada 10 s (los mensajes los recibe el webhook).
  useEffect(() => {
    void cargarLista();
    const t = setInterval(() => { void cargarLista(); if (sel) void cargarHilo(sel); }, 10000);
    return () => clearInterval(t);
  }, [cargarLista, cargarHilo, sel]);
  useEffect(() => { if (!sel && !isMobile && lista.length) setSel(lista[0].igsid); }, [lista, sel, isMobile]);
  useEffect(() => { setHilo(null); setError(null); if (sel) { void cargarHilo(sel); setLista((p) => p.map((c) => c.igsid === sel ? { ...c, noLeidos: 0 } : c)); } }, [sel, cargarHilo]);
  useEffect(() => { fin.current?.scrollIntoView({ block: "end" }); }, [hilo?.mensajes.length]);

  const filtrados = useMemo(() => lista.filter((c) => !q.trim() || `${c.nombre || ""} ${c.username || ""}`.toLowerCase().includes(q.trim().toLowerCase())), [lista, q]);
  const actual = lista.find((c) => c.igsid === sel) || null;

  const enviar = async () => {
    if (!sel || !texto.trim()) return;
    setEnviando(true); setError(null);
    try {
      const m: Mensaje = await api(`/api/instagram/conversaciones/${encodeURIComponent(sel)}/mensajes`, { method: "POST", body: JSON.stringify({ texto: texto.trim() }) });
      setHilo((h) => h ? { ...h, mensajes: [...h.mensajes, m] } : h);
      setLista((p) => p.map((c) => c.igsid === sel ? { ...c, ultimoMensaje: m.texto, ultimoMensajeAt: m.created_at } : c));
      setTexto("");
    } catch (e: any) { setError(e.message); } finally { setEnviando(false); }
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-white">
      <aside className={`${isMobile && sel ? "hidden" : "flex w-full"} md:flex md:w-[320px] shrink-0 flex-col border-r border-slate-200`}>
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search size={15} className="text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conversación..." className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {cargando && !lista.length ? <div className="flex justify-center py-10"><Spinner size="sm" muted /></div>
          : !filtrados.length ? (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100"><MessageCircle size={22} className="text-slate-300" /></div>
              <p className="text-sm font-semibold text-slate-600">{q ? "Sin resultados" : "Sin conversaciones"}</p>
              <p className="max-w-[230px] text-xs text-slate-400">{q ? "Nadie coincide con la búsqueda." : "Cuando alguien escriba al Instagram del despacho, la conversación aparecerá aquí."}</p>
            </div>
          ) : filtrados.map((c) => {
            const activo = c.igsid === sel;
            return (
              <button key={c.igsid} type="button" onClick={() => setSel(c.igsid)} className={`relative flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors ${activo ? "bg-red-50/60" : "hover:bg-slate-50"}`}>
                {activo && <span className="absolute bottom-0 left-0 top-0 w-1 bg-red-500" />}
                <Avatar c={c} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-sm ${c.noLeidos ? "font-bold text-slate-900" : activo ? "font-bold text-red-700" : "font-semibold text-slate-800"}`}>{nombreDe(c)}</p>
                    <span className="shrink-0 text-[11px] text-slate-400">{hora(c.ultimoMensajeAt)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className={`line-clamp-1 flex-1 text-xs ${c.noLeidos ? "font-semibold text-slate-700" : "text-slate-500"}`}>{c.ultimoMensaje || "—"}</p>
                    {c.noLeidos > 0 && <span className="shrink-0 rounded-full bg-pink-500 px-1.5 text-[10px] font-bold text-white">{c.noLeidos}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <section className={`${isMobile && !sel ? "hidden" : "flex"} min-w-0 flex-1 flex-col bg-[#f6f8fc] md:flex`}>
        {!actual ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-400">Selecciona una conversación.</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
              {isMobile && <button type="button" onClick={() => setSel("")} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500"><ArrowLeft size={16} /></button>}
              <Avatar c={actual} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{nombreDe(actual)}</p>
                {actual.username && <a href={`https://instagram.com/${actual.username}`} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:underline">@{actual.username}</a>}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4 sm:px-6">
              {!hilo ? <div className="flex justify-center py-10"><Spinner size="sm" muted /></div> : hilo.mensajes.map((m) => (
                <div key={m.id} className={`flex ${m.direccion === "saliente" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${m.direccion === "saliente" ? "rounded-br-sm bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white" : "rounded-bl-sm bg-white text-slate-800"}`}>
                    {m.adjuntos?.map((a, i) => a.url && (a.tipo === "image" || a.tipo === "share" || a.tipo === "story_mention")
                      ? <a key={i} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt="" className="mb-1 max-h-60 rounded-lg" /></a>
                      : <a key={i} href={a.url || "#"} target="_blank" rel="noreferrer" className="mb-1 block text-xs underline">[{a.tipo === "video" ? "Vídeo" : a.tipo === "audio" ? "Audio" : "Adjunto"}]</a>)}
                    {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
                    <p className={`mt-0.5 text-right text-[10px] ${m.direccion === "saliente" ? "text-white/70" : "text-slate-400"}`}>
                      {m.direccion === "saliente" && m.enviado_por ? `${m.enviado_por} · ` : ""}{hora(m.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={fin} />
            </div>
            {/* sm:pr-20: deja sitio al botón flotante de ayuda, que queda abajo a la derecha. */}
            <div className="border-t border-slate-200 bg-white py-3 pl-4 pr-16 sm:pr-20">
              {hilo && !hilo.ventanaAbierta && (
                <p className="mb-2 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <Lock size={12} className="mt-0.5 shrink-0" /> Han pasado más de 24 horas desde su último mensaje: Instagram no deja contestar hasta que vuelva a escribir.
                </p>
              )}
              {hilo?.ventanaAbierta && hilo.ventanaCierra && (
                <p className="mb-2 flex items-center gap-1 text-[11px] text-slate-400"><Clock size={11} /> Puedes contestar hasta {new Date(hilo.ventanaCierra).toLocaleString("es-ES", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</p>
              )}
              {error && <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
              <div className="flex items-end gap-2">
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} disabled={!hilo?.ventanaAbierta}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
                  placeholder={hilo?.ventanaAbierta ? "Escribe un mensaje... (Enter para enviar)" : "No se puede contestar ahora"}
                  className="min-h-[44px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-slate-300 disabled:opacity-60" />
                <button type="button" onClick={enviar} disabled={!texto.trim() || enviando || !hilo?.ventanaAbierta} className={`inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-semibold text-white ${GRADIENTE} disabled:opacity-40`}>
                  {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Enviar
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ── Publicaciones y comentarios ─────────────────────────────────────────

function Publicaciones({ api, onDesconectado }: { api: (p: string, i?: RequestInit) => Promise<any>; onDesconectado: () => void }) {
  const isMobile = useIsMobile();
  const [medios, setMedios] = useState<Medio[]>([]);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selId, setSelId] = useState("");
  const [publicar, setPublicar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmarDesconectar, setConfirmarDesconectar] = useState(false);

  const cargar = useCallback(async (after?: string | null) => {
    setCargando(true); setError(null);
    try {
      const d = await api(`/api/instagram/medios${after ? `?after=${encodeURIComponent(after)}` : ""}`);
      setMedios((p) => after ? [...p, ...d.medios] : d.medios);
      setSiguiente(d.siguiente);
    } catch (e: any) { setError(e.message); } finally { setCargando(false); }
  }, [api]);
  useEffect(() => { void cargar(); }, [cargar]);

  const sel = medios.find((m) => m.id === selId) || (isMobile ? null : medios[0] || null);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-white">
      <aside className={`${isMobile && sel ? "hidden" : "flex w-full"} md:flex md:w-[320px] shrink-0 flex-col border-r border-slate-200`}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <button type="button" onClick={() => setPublicar(true)} className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl ${GRADIENTE} px-3 py-2 text-xs font-semibold text-white hover:opacity-90`}><Plus size={14} /> Publicar</button>
          <button type="button" onClick={() => cargar()} title="Actualizar" className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw size={13} /></button>
          {confirmarDesconectar ? (
            <button type="button" onClick={async () => { await api("/api/instagram", { method: "DELETE" }).catch(() => {}); onDesconectado(); }} className="rounded-xl bg-red-600 px-2.5 py-1.5 text-[11px] font-semibold text-white">Sí, desconectar</button>
          ) : (
            <button type="button" onClick={() => setConfirmarDesconectar(true)} title="Desconectar la cuenta de Instagram" className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-red-600"><Unplug size={13} /></button>
          )}
        </div>
        {aviso && <div className="border-b border-slate-100 p-3"><Aviso aviso={{ tono: "ok", texto: aviso }} onCerrar={() => setAviso(null)} /></div>}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <p className="m-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          {!medios.length && !cargando && !error && <p className="px-6 py-14 text-center text-xs text-slate-400">Todavía no hay publicaciones.</p>}
          {medios.map((m) => {
            const activo = m.id === sel?.id;
            return (
              <button key={m.id} type="button" onClick={() => setSelId(m.id)} className={`relative flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left ${activo ? "bg-red-50/60" : "hover:bg-slate-50"}`}>
                {activo && <span className="absolute bottom-0 left-0 top-0 w-1 bg-red-500" />}
                <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {(m.thumbnail_url || m.media_url) && <img src={m.thumbnail_url || m.media_url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`line-clamp-2 text-sm leading-5 ${activo ? "font-bold text-red-700" : "font-semibold text-slate-800"}`}>{m.caption || "Sin texto"}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{m.media_product_type === "REELS" ? "Reel" : m.media_type === "CAROUSEL_ALBUM" ? "Carrusel" : m.media_type === "VIDEO" ? "Vídeo" : "Foto"} · {hora(m.timestamp)}</p>
                  <div className="mt-1 flex gap-2.5 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-0.5"><Heart size={11} />{fmt(m.like_count)}</span>
                    <span className="inline-flex items-center gap-0.5"><MessageSquare size={11} />{fmt(m.comments_count)}</span>
                  </div>
                </div>
              </button>
            );
          })}
          {cargando && <div className="flex justify-center py-4"><Spinner size="sm" muted /></div>}
          {siguiente && !cargando && <div className="flex justify-center p-3"><button type="button" onClick={() => cargar(siguiente)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600">Cargar más</button></div>}
        </div>
      </aside>
      <section className={`${isMobile && !sel ? "hidden" : "flex"} min-w-0 flex-1 flex-col bg-[#f6f8fc] md:flex`}>
        {sel ? <DetalleMedio key={sel.id} medio={sel} api={api} onVolver={() => setSelId("")} movil={isMobile} /> : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-400">Selecciona una publicación para ver sus comentarios.</div>
        )}
      </section>
      {publicar && <ModalPublicar api={api} onCerrar={() => setPublicar(false)} onPublicado={(t) => { setPublicar(false); setAviso(t); void cargar(); }} />}
    </div>
  );
}

function DetalleMedio({ medio, api, onVolver, movil }: { medio: Medio; api: (p: string, i?: RequestInit) => Promise<any>; onVolver: () => void; movil: boolean }) {
  const [comentarios, setComentarios] = useState<Comentario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [respondiendo, setRespondiendo] = useState<{ id: string; privado: boolean } | null>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try { setComentarios(await api(`/api/instagram/medios/${medio.id}/comentarios`)); } catch (e: any) { setError(e.message); }
  }, [api, medio.id]);
  useEffect(() => { void cargar(); }, [cargar]);

  const accion = async (fn: () => Promise<any>) => {
    setOcupado(true); setError(null);
    try { await fn(); await cargar(); } catch (e: any) { setError(e.message); } finally { setOcupado(false); }
  };
  const responder = () => respondiendo && texto.trim() && accion(async () => {
    await api(`/api/instagram/comentarios/${respondiendo.id}/responder`, { method: "POST", body: JSON.stringify({ texto: texto.trim(), privado: respondiendo.privado }) });
    setRespondiendo(null); setTexto("");
  });
  const esVideo = medio.media_type === "VIDEO";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        {movil && <button type="button" onClick={onVolver} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500"><ArrowLeft size={16} /></button>}
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{medio.caption || "Publicación"}</p>
        {medio.permalink && <a href={medio.permalink} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Abrir en Instagram</a>}
      </div>
      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-5 lg:grid-cols-[280px_1fr]">
        <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl bg-black">
          {esVideo && medio.media_url
            ? <video src={medio.media_url} poster={medio.thumbnail_url} controls className="aspect-[9/16] w-full object-contain" />
            : (medio.media_url || medio.thumbnail_url) && <img src={medio.media_url || medio.thumbnail_url} alt="" className="w-full object-contain" />}
        </div>
        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400"><Heart size={12} /> Me gusta</p><p className="mt-1 text-xl font-bold text-slate-900">{fmt(medio.like_count)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400"><MessageSquare size={12} /> Comentarios</p><p className="mt-1 text-xl font-bold text-slate-900">{fmt(medio.comments_count)}</p></div>
          </div>
          {medio.caption && <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="whitespace-pre-wrap text-sm text-slate-700">{medio.caption}</p></div>}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <p className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800"><MessageSquare size={15} className="text-slate-400" /> Comentarios</p>
            {error && <p className="m-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            {!comentarios ? <div className="flex justify-center py-8"><Spinner size="sm" muted /></div>
            : !comentarios.length ? <p className="px-4 py-8 text-center text-xs text-slate-400">Sin comentarios.</p>
            : <div className="divide-y divide-slate-100">{comentarios.map((c) => (
              <div key={c.id} className={`px-4 py-3 ${c.hidden ? "opacity-50" : ""}`}>
                <p className="text-sm text-slate-800"><span className="font-semibold">@{c.username || "usuario"}</span> {c.text}</p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                  <span>{hora(c.timestamp)}</span>
                  <button type="button" disabled={ocupado} onClick={() => { setRespondiendo({ id: c.id, privado: false }); setTexto(""); }} className="font-semibold hover:text-slate-700">Responder</button>
                  <button type="button" disabled={ocupado} onClick={() => { setRespondiendo({ id: c.id, privado: true }); setTexto(""); }} className="font-semibold hover:text-slate-700" title="Mensaje directo a quien comentó (una vez, en los 7 días siguientes)">Responder por privado</button>
                  <button type="button" disabled={ocupado} onClick={() => accion(() => api(`/api/instagram/comentarios/${c.id}/ocultar`, { method: "POST", body: JSON.stringify({ ocultar: !c.hidden }) }))} className="inline-flex items-center gap-0.5 font-semibold hover:text-slate-700"><EyeOff size={11} /> {c.hidden ? "Mostrar" : "Ocultar"}</button>
                  <button type="button" disabled={ocupado} onClick={() => accion(() => api(`/api/instagram/comentarios/${c.id}`, { method: "DELETE" }))} className="inline-flex items-center gap-0.5 font-semibold hover:text-red-600"><Trash2 size={11} /> Borrar</button>
                </div>
                {c.replies?.data?.map((r) => (
                  <p key={r.id} className="ml-4 mt-2 border-l-2 border-slate-100 pl-3 text-sm text-slate-600"><span className="font-semibold">@{r.username || "usuario"}</span> {r.text}</p>
                ))}
                {respondiendo?.id === c.id && (
                  <div className="mt-2 flex items-end gap-2">
                    <textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder={respondiendo.privado ? "Mensaje privado a quien comentó..." : "Respuesta pública..."} className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300" />
                    <button type="button" onClick={responder} disabled={!texto.trim() || ocupado} className={`rounded-xl ${GRADIENTE} px-3 py-2 text-xs font-semibold text-white disabled:opacity-40`}>{ocupado ? <Loader2 size={13} className="animate-spin" /> : "Enviar"}</button>
                    <button type="button" onClick={() => setRespondiendo(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">Cancelar</button>
                  </div>
                )}
              </div>
            ))}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

type Formato = "REELS" | "IMAGE" | "STORIES";

function ModalPublicar({ api, onCerrar, onPublicado }: { api: (p: string, i?: RequestInit) => Promise<any>; onCerrar: () => void; onPublicado: (t: string) => void }) {
  const [formato, setFormato] = useState<Formato>("REELS");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [duracion, setDuracion] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [enFeed, setEnFeed] = useState(true);
  const [portada, setPortada] = useState<number | null>(null);
  const [fase, setFase] = useState<"" | "subiendo" | "procesando">("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const acepta = formato === "REELS" ? "video/mp4,video/quicktime" : formato === "IMAGE" ? "image/jpeg" : "video/mp4,video/quicktime,image/jpeg";
  const esVideo = Boolean(archivo?.type.startsWith("video/"));
  const elegir = (f: File | null) => {
    setError(null); setDuracion(null); setPortada(null);
    if (preview) URL.revokeObjectURL(preview);
    setArchivo(f); setPreview(f ? URL.createObjectURL(f) : null);
  };
  const cambiarFormato = (f: Formato) => {
    setFormato(f);
    if (archivo && ((f === "REELS" && !archivo.type.startsWith("video/")) || (f === "IMAGE" && archivo.type !== "image/jpeg"))) elegir(null);
  };

  const publicar = async () => {
    if (!archivo) return;
    setError(null); setFase("subiendo");
    try {
      const form = new FormData();
      form.append("archivo", archivo);
      form.append("formato", formato);
      form.append("caption", caption);
      form.append("shareToFeed", String(enFeed));
      if (portada !== null) form.append("thumbOffsetMs", String(Math.round(portada * 1000)));
      const { publicacionId } = await api("/api/instagram/publicar", { method: "POST", body: form });
      setFase("procesando");
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const s = await api(`/api/instagram/publicar/${publicacionId}`);
        if (s.estado === "publicado") { onPublicado(formato === "STORIES" ? "Historia publicada en Instagram." : "Publicado en Instagram."); return; }
        if (s.estado === "error") throw new Error(s.error || "Instagram no ha podido publicarlo.");
      }
      onPublicado("Enviado a Instagram. Aparecerá en unos minutos.");
    } catch (e: any) { setError(e.message); setFase(""); }
  };

  return (
    <Modal open onClose={fase ? () => {} : onCerrar} title="Publicar en Instagram" icon={<Instagram size={18} />} maxWidth="max-w-2xl"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={Boolean(fase)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={publicar} disabled={!archivo || Boolean(fase)} className={`inline-flex items-center gap-2 rounded-xl ${GRADIENTE} px-4 py-2 text-sm font-semibold text-white disabled:opacity-40`}>
            {fase && <Loader2 size={14} className="animate-spin" />}
            {fase === "subiendo" ? "Subiendo..." : fase === "procesando" ? "Instagram lo está procesando..." : "Publicar"}
          </button>
        </div>
      }>
      <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
        <div className="space-y-2">
          <input ref={input} type="file" accept={acepta} className="hidden" onChange={(e) => elegir(e.target.files?.[0] || null)} />
          {preview ? (
            <>
              {esVideo
                ? <video ref={video} src={preview} controls className="aspect-[9/16] w-full rounded-2xl bg-black object-contain" onLoadedMetadata={(e) => setDuracion(e.currentTarget.duration)} />
                : <img src={preview} alt="" className="w-full rounded-2xl bg-black object-contain" />}
              {formato === "REELS" && duracion ? (
                <div className="rounded-xl border border-slate-200 p-2">
                  <p className="text-[11px] font-semibold text-slate-500">Portada {portada === null ? "(automática)" : `en el segundo ${portada.toFixed(1)}`}</p>
                  <input type="range" min={0} max={duracion} step={0.1} value={portada ?? 0} className="w-full accent-pink-500" aria-label="Fotograma de portada"
                    onChange={(e) => { const t = Number(e.target.value); setPortada(t); if (video.current) { video.current.pause(); video.current.currentTime = t; } }} />
                </div>
              ) : null}
              <button type="button" disabled={Boolean(fase)} onClick={() => input.current?.click()} className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Cambiar archivo</button>
            </>
          ) : (
            <button type="button" onClick={() => input.current?.click()} className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-slate-300">
              <Upload size={22} />
              <span className="text-xs font-semibold">{formato === "IMAGE" ? "Elegir foto" : formato === "REELS" ? "Elegir vídeo" : "Elegir vídeo o foto"}</span>
              <span className="text-[10px]">{formato === "IMAGE" ? "JPG" : formato === "REELS" ? "MP4 o MOV" : "MP4, MOV o JPG"}</span>
            </button>
          )}
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {([["REELS", "Reel"], ["IMAGE", "Foto"], ["STORIES", "Historia"]] as [Formato, string][]).map(([f, l]) => (
              <button key={f} type="button" disabled={Boolean(fase)} onClick={() => cambiarFormato(f)} className={`rounded-lg px-2 py-1.5 text-xs font-bold ${formato === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
          {formato !== "STORIES" ? (
            <div>
              <label className="text-xs font-semibold text-slate-500">Texto</label>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 2200))} rows={5} placeholder="Descripción, #hashtags, @menciones..." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
              <p className="text-right text-[10px] text-slate-300">{caption.length} / 2200</p>
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Las historias se publican sin texto y desaparecen a las 24 horas.</p>
          )}
          {formato === "REELS" && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={enFeed} onChange={(e) => setEnFeed(e.target.checked)} className="h-4 w-4" /> Mostrar también en el perfil (feed)
            </label>
          )}
          <p className="text-[11px] leading-relaxed text-slate-400">
            Instagram descarga el archivo desde Vantia y lo procesa; puede tardar unos minutos. Música, filtros y efectos solo se pueden añadir desde la app de Instagram.
          </p>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
