import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Eye, Heart, Image as ImageIcon, Loader2, MessageSquare,
  Plus, RefreshCw, Search, Share2, Unplug, Upload, Video,
} from "lucide-react";
import { Spinner } from "./Spinner";
import { Modal } from "./Modal";
import { safeJson } from "../lib/api";
import { useIsMobile } from "../lib/useIsMobile";

// Comunicación Externa → TikTok: conectar la cuenta del despacho, ver sus
// vídeos con estadísticas y publicar. La conexión va por redirección completa
// (backend → TikTok → backend → aquí con ?canal=tiktok&tiktok=ok|error), ver
// backend/src/controllers/tiktokController.ts.

export function TikTokIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z" />
    </svg>
  );
}

interface Account {
  displayName?: string;
  avatarUrl?: string;
  username?: string;
  bio?: string;
  profileUrl?: string;
  isVerified?: boolean;
  followers?: number;
  following?: number;
  likes?: number;
  videos?: number;
}

interface Status {
  configured: boolean;
  connected: boolean;
  account?: Account;
  accountError?: string | null;
}

interface TikTokVideo {
  id: string;
  title?: string;
  video_description?: string;
  cover_image_url?: string;
  share_url?: string;
  create_time?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  duration?: number;
  embed_link?: string;
}

const fmt = (n?: number) => (typeof n === "number" ? n.toLocaleString("es-ES") : "—");

export default function TikTokPanel() {
  const { getToken } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [videos, setVideos] = useState<TikTokVideo[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getToken({ skipCache: true });
    const res = await fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    const json = await safeJson(res);
    if (!res.ok || json?.success === false) throw new Error(json?.error || "Error con TikTok");
    return json.data;
  }, [getToken]);

  const loadVideos = useCallback(async (from?: number | null) => {
    setLoadingVideos(true);
    try {
      const data = await api(`/api/tiktok/videos${from ? `?cursor=${from}` : ""}`);
      setVideos((prev) => (from ? [...prev, ...data.videos] : data.videos));
      setCursor(data.cursor ?? null);
      setHasMore(Boolean(data.hasMore));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingVideos(false);
    }
  }, [api]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: Status = await api("/api/tiktok/status");
      setStatus(data);
      if (data.connected) loadVideos();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api, loadVideos]);

  // Aviso al volver de TikTok (?tiktok=ok|error&mensaje=...)
  useEffect(() => {
    const result = searchParams.get("tiktok");
    if (!result) return;
    setNotice(result === "ok"
      ? { tone: "ok", text: "Cuenta de TikTok conectada." }
      : { tone: "error", text: searchParams.get("mensaje") || "No se pudo conectar TikTok." });
    const next = new URLSearchParams(searchParams);
    next.delete("tiktok");
    next.delete("mensaje");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const connect = async () => {
    setConnecting(true);
    setNotice(null);
    try {
      const { url } = await api("/api/tiktok/connect", { method: "POST" });
      window.location.href = url;
    } catch (e: any) {
      setNotice({ tone: "error", text: e.message });
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      await api("/api/tiktok", { method: "DELETE" });
      setVideos([]);
      setNotice({ tone: "ok", text: "Cuenta de TikTok desconectada." });
      loadStatus();
    } catch (e: any) {
      setNotice({ tone: "error", text: e.message });
    }
  };

  if (loading && !status) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="md" label="Cargando TikTok..." />
      </div>
    );
  }

  const acc = status?.account;

  if (status?.connected) {
    return (
      <>
        <BandejaTikTok
          acc={acc}
          accountError={status.accountError}
          videos={videos}
          loadingVideos={loadingVideos}
          hasMore={hasMore}
          onLoadMore={() => loadVideos(cursor)}
          onRefresh={() => loadStatus()}
          onDisconnect={disconnect}
          onPublish={() => setPublishOpen(true)}
          notice={notice}
          error={error}
          onDismissNotice={() => setNotice(null)}
        />
        {publishOpen && (
          <PublishModal
            api={api}
            getToken={getToken}
            onClose={() => setPublishOpen(false)}
            onPublished={(text) => { setPublishOpen(false); setNotice({ tone: "ok", text }); loadVideos(); }}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-[#fafafa]">
      <div className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
        {notice && (
          <div className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${
            notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
          }`}>
            {notice.tone === "ok" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}

        {!status?.connected ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-black shadow-lg shadow-slate-300">
              <TikTokIcon size={30} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Conecta la cuenta de TikTok del despacho</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                Podrás ver tus vídeos con sus visualizaciones, me gusta, comentarios y compartidos, y publicar vídeos nuevos desde Vantia.
              </p>
            </div>
            {status && !status.configured ? (
              <p className="max-w-md rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
                Falta configurar TikTok en el servidor (TIKTOK_CLIENT_KEY y TIKTOK_CLIENT_SECRET).
              </p>
            ) : (
              <button
                type="button"
                onClick={connect}
                disabled={connecting}
                className="inline-flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {connecting ? <Loader2 size={15} className="animate-spin" /> : <TikTokIcon size={15} />}
                Conectar TikTok
              </button>
            )}
            <p className="text-[11px] text-slate-400">Solo el propietario o un administrador pueden conectar la cuenta.</p>
          </div>
        ) : null}
      </div>

      {publishOpen && (
        <PublishModal
          api={api}
          getToken={getToken}
          onClose={() => setPublishOpen(false)}
          onPublished={(text) => { setPublishOpen(false); setNotice({ tone: "ok", text }); loadVideos(); }}
        />
      )}
    </div>
  );
}

const fmtFecha = (t?: number) => (t ? new Date(t * 1000).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "");
const tituloVideo = (v: TikTokVideo) => v.title || v.video_description || "Sin título";

// Bandeja de TikTok con la misma forma que la de WhatsApp: a la izquierda la
// cuenta y sus vídeos (como si fueran conversaciones); a la derecha el vídeo
// elegido con su reproductor, estadísticas y el hilo de comentarios.
function BandejaTikTok({
  acc, accountError, videos, loadingVideos, hasMore, onLoadMore, onRefresh, onDisconnect, onPublish,
  notice, error, onDismissNotice,
}: {
  acc?: Account;
  accountError?: string | null;
  videos: TikTokVideo[];
  loadingVideos: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  onPublish: () => void;
  notice: { tone: "ok" | "error"; text: string } | null;
  error: string | null;
  onDismissNotice: () => void;
}) {
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const filtered = videos.filter((v) => !query.trim() || tituloVideo(v).toLowerCase().includes(query.trim().toLowerCase()));
  // En escritorio se abre el más reciente; en móvil se empieza por la lista.
  const selected = videos.find((v) => v.id === selectedId) || (isMobile ? null : filtered[0] || null);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <aside className={`${isMobile && selected ? "hidden" : "flex w-full"} md:flex md:w-[320px] shrink-0 flex-col border-r border-slate-200 bg-white`}>
        <div className="border-b border-slate-100 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Bandeja del equipo</p>
              <h1 className="mt-1 text-base font-bold text-slate-900">TikTok</h1>
            </div>
            <button
              type="button"
              onClick={onPublish}
              className="inline-flex h-10 items-center gap-1.5 rounded-2xl bg-black px-3.5 text-xs font-semibold text-white transition hover:bg-neutral-800"
            >
              <Plus size={14} /> Publicar
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
            {acc?.avatarUrl
              ? <img src={acc.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
              : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black"><TikTokIcon size={18} className="text-white" /></div>}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate text-sm font-bold text-slate-800">
                {acc?.displayName || "Cuenta de TikTok"}
                {acc?.isVerified && <CheckCircle2 size={13} className="shrink-0 text-sky-500" />}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {acc?.username ? `@${acc.username} · ` : ""}{fmt(acc?.followers)} seguidores · {fmt(acc?.likes)} me gusta
              </p>
            </div>
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="Conectada" />
          </div>
          {accountError && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{accountError}</p>}

          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Search size={15} className="text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar vídeo..."
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 && !loadingVideos ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <Video size={22} className="text-slate-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-600">{query.trim() ? "Sin resultados" : "Sin vídeos todavía"}</p>
                <p className="mt-1 max-w-[220px] text-xs text-slate-400">
                  {query.trim() ? "Ningún vídeo coincide con la búsqueda." : "Los vídeos públicos de la cuenta aparecerán aquí. Publica el primero desde Vantia."}
                </p>
              </div>
            </div>
          ) : filtered.map((v) => {
            const isSel = v.id === selected?.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedId(v.id)}
                className={`relative flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors ${isSel ? "bg-red-50/60" : "bg-white hover:bg-slate-50"}`}
              >
                {isSel && <span className="absolute bottom-0 left-0 top-0 w-1 bg-red-500" />}
                <div className="relative h-[68px] w-[40px] shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {v.cover_image_url && <img src={v.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`line-clamp-2 text-sm leading-5 ${isSel ? "font-bold text-red-700" : "font-semibold text-slate-800"}`}>{tituloVideo(v)}</p>
                  </div>
                  <p className={`mt-0.5 text-[11px] ${isSel ? "text-red-500" : "text-slate-400"}`}>{fmtFecha(v.create_time)}</p>
                  <div className="mt-1 flex items-center gap-2.5 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-0.5"><Eye size={11} />{fmt(v.view_count)}</span>
                    <span className="inline-flex items-center gap-0.5"><Heart size={11} />{fmt(v.like_count)}</span>
                    <span className="inline-flex items-center gap-0.5"><MessageSquare size={11} />{fmt(v.comment_count)}</span>
                  </div>
                </div>
              </button>
            );
          })}
          {loadingVideos && <div className="flex justify-center py-4"><Spinner size="sm" muted /></div>}
          {hasMore && !loadingVideos && (
            <div className="flex justify-center p-3">
              <button type="button" onClick={onLoadMore} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                Cargar más
              </button>
            </div>
          )}
        </div>
      </aside>

      <section className={`${isMobile && !selected ? "hidden" : "flex"} min-w-0 flex-1 flex-col bg-[#f6f8fc] md:flex`}>
        <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {isMobile && (
                <button type="button" onClick={() => setSelectedId("")} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500" title="Volver a la lista">
                  <ArrowLeft size={16} />
                </button>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-slate-900">{selected ? tituloVideo(selected) : "Panel de TikTok"}</h2>
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  {selected ? `Publicado el ${fmtFecha(selected.create_time)}` : "Selecciona un vídeo para ver sus estadísticas."}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selected?.share_url && (
                <a href={selected.share_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                  <ExternalLink size={14} /> Abrir en TikTok
                </a>
              )}
              <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                <RefreshCw size={14} /> Actualizar
              </button>
              {confirmDisconnect ? (
                <span className="inline-flex items-center gap-1.5">
                  <button type="button" onClick={() => { setConfirmDisconnect(false); onDisconnect(); }} className="rounded-2xl bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700">Sí, desconectar</button>
                  <button type="button" onClick={() => setConfirmDisconnect(false)} className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600">Cancelar</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDisconnect(true)} title="Desconectar la cuenta de TikTok" className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-red-600">
                  <Unplug size={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {(notice || error) && (
            <div className={`mb-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${
              notice?.tone === "ok" && !error ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
            }`}>
              {notice?.tone === "ok" && !error ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
              <span className="flex-1">{error || notice?.text}</span>
              {notice && !error && <button type="button" onClick={onDismissNotice} className="text-xs font-semibold opacity-60 hover:opacity-100">Cerrar</button>}
            </div>
          )}

          {!selected ? (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-md rounded-[28px] border border-dashed border-slate-200 bg-white px-8 py-10 text-center">
                <TikTokIcon size={28} className="mx-auto text-slate-300" />
                <p className="mt-4 text-base font-semibold text-slate-700">{videos.length ? "Selecciona un vídeo" : "Publica tu primer vídeo"}</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {videos.length
                    ? "Aquí verás el vídeo, sus visualizaciones, me gusta, comentarios y compartidos."
                    : "Súbelo desde Vantia o mándalo a los borradores de la app para editarlo allí."}
                </p>
                {!videos.length && (
                  <button type="button" onClick={onPublish} className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800">
                    <Plus size={14} /> Publicar vídeo
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[300px_1fr]">
              <div className="mx-auto w-full max-w-[300px]">
                <div className="overflow-hidden rounded-[24px] bg-black shadow-lg shadow-slate-300/60">
                  {selected.embed_link ? (
                    <iframe
                      key={selected.id}
                      src={selected.embed_link}
                      title={tituloVideo(selected)}
                      className="aspect-[9/16] w-full"
                      allow="encrypted-media; fullscreen; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="relative aspect-[9/16] w-full">
                      {selected.cover_image_url && <img src={selected.cover_image_url} alt="" className="h-full w-full object-cover" />}
                    </div>
                  )}
                </div>
              </div>

              <div className="min-w-0 space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Visualizaciones", value: selected.view_count, icon: Eye },
                    { label: "Me gusta", value: selected.like_count, icon: Heart },
                    { label: "Comentarios", value: selected.comment_count, icon: MessageSquare },
                    { label: "Compartidos", value: selected.share_count, icon: Share2 },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400"><Icon size={12} />{label}</p>
                      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{fmt(value)}</p>
                    </div>
                  ))}
                </div>
                {selected.view_count ? (
                  <p className="text-xs text-slate-500">
                    Interacción: <span className="font-bold text-slate-700">
                      {(((selected.like_count || 0) + (selected.comment_count || 0) + (selected.share_count || 0)) / selected.view_count * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %
                    </span> de las visualizaciones (me gusta + comentarios + compartidos).
                  </p>
                ) : null}

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Texto del vídeo</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.video_description || selected.title || "Sin texto."}</p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <MessageSquare size={15} className="text-slate-400" /> Comentarios
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{fmt(selected.comment_count)}</span>
                    </p>
                  </div>
                  <div className="space-y-3 bg-slate-50 px-4 py-6 text-center">
                    <p className="text-sm font-semibold text-slate-600">Leer y responder comentarios desde Vantia</p>
                    <p className="mx-auto max-w-md text-xs leading-5 text-slate-400">
                      TikTok solo da acceso a los comentarios a través de su API for Business, con una cuenta de empresa.
                      En cuanto el despacho la active, aquí aparecerá el hilo de comentarios para contestar sin salir del ERP.
                      Mientras tanto, puedes verlos en TikTok.
                    </p>
                    {selected.share_url && (
                      <a href={selected.share_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        <ExternalLink size={12} /> Ver comentarios en TikTok
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Todo el mundo",
  MUTUAL_FOLLOW_FRIENDS: "Amigos (seguidores mutuos)",
  FOLLOWER_OF_CREATOR: "Seguidores",
  SELF_ONLY: "Solo yo",
};

interface CreatorInfo {
  nickname?: string;
  username?: string;
  avatarUrl?: string;
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxDurationSec?: number;
}

// Formulario de publicación siguiendo las pautas de TikTok para Direct Post:
// se muestra la cuenta, la privacidad no viene elegida por defecto, las
// interacciones que la cuenta tiene desactivadas no se pueden activar, hay
// que declarar el contenido comercial y se avisa de las condiciones de uso.
function PublishModal({ api, getToken, onClose, onPublished }: {
  api: (path: string, init?: RequestInit) => Promise<any>;
  getToken: (opts?: { skipCache?: boolean }) => Promise<string | null>;
  onClose: () => void;
  onPublished: (text: string) => void;
}) {
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [privacy, setPrivacy] = useState("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [commercial, setCommercial] = useState(false);
  const [brandOrganic, setBrandOrganic] = useState(false);
  const [brandContent, setBrandContent] = useState(false);
  const [isAigc, setIsAigc] = useState(false);
  // Fotograma de portada (segundos); null = el que elija TikTok.
  const [coverSec, setCoverSec] = useState<number | null>(null);
  // "directo": se publica ya desde Vantia. "borrador": va a los borradores de la
  // app de TikTok para terminarlo allí (música, efectos, texto...).
  const [modo, setModo] = useState<"directo" | "borrador">("directo");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api("/api/tiktok/creator-info").then(setCreator).catch((e) => setLoadError(e.message));
  }, [api]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pickFile = (f: File | null) => {
    setError(null);
    setDuration(null);
    setCoverSec(null);
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  // El contenido de marca ("Branded content") no puede publicarse en privado.
  const privacyOptions = (creator?.privacyOptions || []).filter((p) => !(brandContent && p === "SELF_ONLY"));
  const tooLong = Boolean(duration && creator?.maxDurationSec && duration > creator.maxDurationSec);
  const commercialIncomplete = commercial && !brandOrganic && !brandContent;
  const canPublish = modo === "borrador"
    ? Boolean(file && creator && !tooLong && phase === "idle")
    : Boolean(file && privacy && creator && !tooLong && !commercialIncomplete && phase === "idle");

  const publish = async () => {
    if (!file || !canPublish) return;
    setError(null);
    setPhase("uploading");
    try {
      const form = new FormData();
      form.append("video", file);
      form.append("modo", modo);
      form.append("isAigc", String(isAigc));
      if (coverSec !== null) form.append("coverMs", String(Math.round(coverSec * 1000)));
      form.append("title", title);
      form.append("privacyLevel", privacy);
      form.append("disableComment", String(!allowComment));
      form.append("disableDuet", String(!allowDuet));
      form.append("disableStitch", String(!allowStitch));
      form.append("brandContent", String(commercial && brandContent));
      form.append("brandOrganic", String(commercial && brandOrganic));
      const token = await getToken({ skipCache: true });
      const res = await fetch("/api/tiktok/publish", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const json = await safeJson(res);
      if (!res.ok || json?.success === false) throw new Error(json?.error || "No se pudo publicar en TikTok");

      // TikTok procesa el vídeo después de recibirlo: se consulta el estado.
      setPhase("processing");
      const publishId = json.data.publishId;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const s = await api(`/api/tiktok/publish/${encodeURIComponent(publishId)}`);
        if (s.status === "SEND_TO_USER_INBOX") {
          onPublished("Vídeo enviado a los borradores de TikTok. Te llegará una notificación en la app para terminarlo y publicarlo.");
          return;
        }
        if (s.status === "PUBLISH_COMPLETE") {
          onPublished(privacy === "SELF_ONLY" ? "Vídeo publicado en TikTok (privado, solo lo ves tú)." : "Vídeo publicado en TikTok.");
          return;
        }
        if (s.status === "FAILED") throw new Error(`TikTok no ha podido publicar el vídeo${s.failReason ? ` (${s.failReason})` : ""}.`);
      }
      onPublished(modo === "borrador"
        ? "Vídeo enviado a TikTok. Aparecerá en tus borradores de la app en unos minutos."
        : "Vídeo enviado a TikTok. Puede tardar unos minutos en aparecer.");
    } catch (e: any) {
      setError(e.message);
      setPhase("idle");
    }
  };

  const check = (label: string, value: boolean, set: (v: boolean) => void, disabled: boolean) => (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "text-slate-300" : "text-slate-600"}`}>
      <input type="checkbox" checked={value && !disabled} disabled={disabled} onChange={(e) => set(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
      {label}
    </label>
  );

  return (
    <Modal
      open
      onClose={phase === "idle" ? onClose : () => {}}
      title="Publicar en TikTok"
      subtitle={creator ? `Se publicará en la cuenta ${creator.nickname || ""}${creator.username ? ` (@${creator.username})` : ""}` : undefined}
      icon={<TikTokIcon size={18} />}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={phase !== "idle"} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={publish} disabled={!canPublish} className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {phase !== "idle" && <Loader2 size={14} className="animate-spin" />}
            {phase === "uploading" ? "Subiendo vídeo..." : phase === "processing" ? "TikTok lo está procesando..." : modo === "borrador" ? "Enviar a borradores" : "Publicar"}
          </button>
        </div>
      }
    >
      {loadError ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>
      ) : !creator ? (
        <div className="flex justify-center py-10"><Spinner size="sm" muted label="Consultando la cuenta de TikTok..." /></div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
          <div>
            <input ref={fileInput} type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] || null)} />
            {preview ? (
              <div className="space-y-2">
                <video ref={videoRef} src={preview} controls className="aspect-[9/16] w-full rounded-2xl bg-black object-contain" onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)} />
                {modo === "directo" && duration ? (
                  <div className="rounded-xl border border-slate-200 p-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                      <span className="inline-flex items-center gap-1"><ImageIcon size={11} /> Portada</span>
                      {coverSec !== null
                        ? <button type="button" onClick={() => setCoverSec(null)} className="text-slate-400 hover:text-slate-600">Automática</button>
                        : <span className="text-slate-300">Automática</span>}
                    </div>
                    <input
                      type="range" min={0} max={duration} step={0.1} value={coverSec ?? 0}
                      onChange={(e) => {
                        const t = Number(e.target.value);
                        setCoverSec(t);
                        if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = t; }
                      }}
                      className="mt-1 w-full accent-black"
                      aria-label="Fotograma de portada"
                    />
                    <p className="text-[10px] text-slate-400">
                      {coverSec === null ? "Mueve la barra para elegir el fotograma de portada." : `Portada en el segundo ${coverSec.toFixed(1)}`}
                    </p>
                  </div>
                ) : null}
                <button type="button" onClick={() => fileInput.current?.click()} disabled={phase !== "idle"} className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Cambiar vídeo</button>
              </div>
            ) : (
              <button type="button" onClick={() => fileInput.current?.click()} className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-500">
                <Upload size={22} />
                <span className="text-xs font-semibold">Elegir vídeo</span>
                <span className="text-[10px]">MP4, MOV o WebM</span>
              </button>
            )}
            {tooLong && <p className="mt-2 text-xs text-red-600">El vídeo dura más de lo que permite esta cuenta ({creator.maxDurationSec} s).</p>}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {([
                ["directo", "Publicar ahora", "Desde Vantia, con todas las opciones"],
                ["borrador", "Enviar a borradores", "Para añadir música o efectos en la app"],
              ] as const).map(([valor, titulo, ayuda]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setModo(valor)}
                  disabled={phase !== "idle"}
                  className={`rounded-lg px-3 py-2 text-left transition ${modo === valor ? "bg-white shadow-sm" : "hover:bg-white/60"}`}
                >
                  <span className={`block text-xs font-bold ${modo === valor ? "text-slate-900" : "text-slate-500"}`}>{titulo}</span>
                  <span className="block text-[10px] text-slate-400">{ayuda}</span>
                </button>
              ))}
            </div>

            {modo === "borrador" ? (
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
                <p className="font-semibold text-slate-800">El vídeo llegará a la app de TikTok como borrador</p>
                <p>
                  Te aparecerá una notificación en TikTok (en el móvil de la cuenta conectada). Desde ahí puedes añadir
                  música, efectos, filtros, texto, stickers o voz, elegir la portada y la privacidad, y publicarlo.
                </p>
                <p className="text-slate-400">Úsalo cuando quieras editar con las herramientas de la app, que la API de TikTok no deja usar desde fuera.</p>
              </div>
            ) : (<>
            <div>
              <label className="text-xs font-semibold text-slate-500">Texto del vídeo</label>
              <textarea value={title} onChange={(e) => setTitle(e.target.value.slice(0, 2200))} rows={4} placeholder="Descripción, #hashtags..." className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
              <p className="text-right text-[10px] text-slate-300">{title.length} / 2200</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500">¿Quién puede verlo?</label>
              <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="" disabled>Elige una opción</option>
                {privacyOptions.map((p) => <option key={p} value={p}>{PRIVACY_LABELS[p] || p}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500">Permitir a los usuarios</p>
              {check("Comentar", allowComment, setAllowComment, creator.commentDisabled)}
              {check("Hacer dúos", allowDuet, setAllowDuet, creator.duetDisabled)}
              {check("Hacer stitch", allowStitch, setAllowStitch, creator.stitchDisabled)}
            </div>

            <div className="space-y-2 rounded-2xl border border-slate-200 p-3">
              <label className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
                Contenido comercial
                <input type="checkbox" checked={commercial} onChange={(e) => { setCommercial(e.target.checked); if (!e.target.checked) { setBrandOrganic(false); setBrandContent(false); } }} className="h-4 w-4" />
              </label>
              <p className="text-[11px] text-slate-400">Indica si el vídeo promociona al despacho, a un producto o a un tercero.</p>
              {commercial && (
                <div className="space-y-1.5 pt-1">
                  {check("Tu marca: promociona al despacho", brandOrganic, setBrandOrganic, false)}
                  {check("Contenido de marca: colaboración pagada con un tercero", brandContent, (v) => { setBrandContent(v); if (v && privacy === "SELF_ONLY") setPrivacy(""); }, false)}
                  {commercialIncomplete && <p className="text-[11px] text-amber-600">Elige al menos una de las dos opciones.</p>}
                  {(brandOrganic || brandContent) && (
                    <p className="text-[11px] text-slate-500">
                      El vídeo se etiquetará como {brandContent ? "“Colaboración pagada”" : "“Contenido promocional”"}.
                    </p>
                  )}
                </div>
              )}
            </div>

            <label className="flex items-start gap-2 rounded-2xl border border-slate-200 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={isAigc} onChange={(e) => setIsAigc(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                <span className="font-medium">Contenido generado por IA</span>
                <span className="block text-[11px] text-slate-400">TikTok lo etiquetará así. Obligatorio si el vídeo tiene imágenes o voces realistas creadas con IA.</span>
              </span>
            </label>

            <p className="text-[11px] leading-relaxed text-slate-400">
              Al publicar aceptas la{" "}
              {brandContent && (<><a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer" className="underline">Branded Content Policy</a> y la{" "}</>)}
              <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer" className="underline">Music Usage Confirmation</a> de TikTok.
              Después de publicar, TikTok puede tardar unos minutos en procesar el vídeo.
            </p>
            </>)}
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
