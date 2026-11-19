import { useEffect, useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { t } from '../lib/i18n';

// Quita el enlace del texto del mensaje cuando va al principio o al final
// (el caso normal: «mira esto https://…» o el enlace solo) -- la tarjeta ya lo
// representa. Si está en mitad de una frase se deja, para no romperla.
export function textoSinEnlace(texto: string, url: string): string {
  const s = texto.trim();
  if (s.endsWith(url)) return s.slice(0, -url.length).trimEnd();
  if (s.startsWith(url)) return s.slice(url.length).trimStart();
  return texto;
}

interface LinkPreviewData {
  url: string;
  title: string;
  description: string | null;
  image: string | null;
  siteName: string;
  favicon: string | null;
}

type PreviewState = LinkPreviewData | 'error' | 'loading';

// Cache a nivel de módulo (no por componente) -- si el mismo link aparece en
// varios mensajes del canal, o el mensaje se vuelve a renderizar, no hace
// falta pedir la vista previa otra vez.
const previewCache = new Map<string, PreviewState>();

// Mismo criterio que usa Chat.tsx (renderText) para convertir un link suelto
// en <a> -- así la tarjeta solo aparece cuando el propio texto ya se ve como
// una URL real.
export function firstUrlIn(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"')\]]+/);
  return m ? m[0].replace(/[.,;:!?]+$/, '') : null;
}

// Vista previa estilo Slack (título, descripción, favicon+dominio, imagen)
// bajo un mensaje que contiene un enlace. Se apoya en GET /api/chat/link-preview,
// que en el backend lee los meta og:* de la página -- si la página no da esa
// información (o falla la petición) no se muestra nada, no un hueco roto.
export function LinkPreviewCard({ url, getToken, reemplazaEnlace = false }: {
  url: string;
  getToken: () => Promise<string | null>;
  /** El texto del mensaje ya no muestra este enlace: si no hay vista previa, enseñarlo aquí. */
  reemplazaEnlace?: boolean;
}) {
  const [state, setState] = useState<PreviewState>(previewCache.get(url) || 'loading');

  useEffect(() => {
    let cancelled = false;
    const cached = previewCache.get(url);
    if (cached && cached !== 'loading') { setState(cached); return; }

    setState('loading');
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`/api/chat/link-preview?url=${encodeURIComponent(url)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        const result: PreviewState = res.ok && data?.success ? data.data : 'error';
        previewCache.set(url, result);
        if (!cancelled) setState(result);
      } catch {
        previewCache.set(url, 'error');
        if (!cancelled) setState('error');
      }
    })();

    return () => { cancelled = true; };
  }, [url, getToken]);

  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(url); }
    catch {
      // Sin permiso de portapapeles (http, iframe…): copia "a la antigua".
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* nada más que hacer */ }
      ta.remove();
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1500);
  };

  // Si la tarjeta sustituye al enlace del texto (reemplazaEnlace) y no hay
  // vista previa, se muestra el enlace normal para que no desaparezca.
  if (state === 'error') {
    return reemplazaEnlace ? (
      <a href={url} target="_blank" rel="noreferrer" className="break-all text-[15px] text-blue-600 hover:underline">{url}</a>
    ) : null;
  }

  if (state === 'loading') {
    return (
      <div className="mt-1.5 flex max-w-md items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  return (
    <div className="group/enlace relative mt-1.5 max-w-md">
    <a
      href={state.url}
      target="_blank"
      rel="noreferrer"
      className="flex overflow-hidden rounded-lg border border-slate-200 bg-white transition-colors hover:border-slate-300 hover:shadow-sm"
    >
      <div className="min-w-0 flex-1 p-3">
        <div className="mb-1 flex items-center gap-1.5">
          {state.favicon && (
            <img
              src={state.favicon}
              alt=""
              className="h-3.5 w-3.5 shrink-0 rounded-sm"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <span className="truncate text-[11px] font-medium text-slate-400">{state.siteName}</span>
        </div>
        <p className="text-[13px] font-bold leading-snug text-slate-800 line-clamp-2">{state.title}</p>
        {state.description && (
          <p className="mt-0.5 text-[12px] leading-snug text-slate-500 line-clamp-2">{state.description}</p>
        )}
      </div>
      {state.image && (
        <div className="w-24 shrink-0 bg-slate-900">
          <img
            src={state.image}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              const el = e.currentTarget.parentElement as HTMLElement | null;
              if (el) el.style.display = 'none';
            }}
          />
        </div>
      )}
    </a>
    {/* Al pasar el ratón: la URL completa (seleccionable) y botón de copiar.
        Va fuera del <a> para que seleccionar o copiar no abra el enlace. */}
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-1 items-center gap-1.5 rounded-b-lg border-t border-slate-200 bg-white/95 px-2.5 py-1.5 opacity-0 shadow-[0_-2px_6px_rgba(15,23,42,0.06)] backdrop-blur-sm transition duration-150 group-hover/enlace:pointer-events-auto group-hover/enlace:translate-y-0 group-hover/enlace:opacity-100 group-focus-within/enlace:pointer-events-auto group-focus-within/enlace:translate-y-0 group-focus-within/enlace:opacity-100">
      <Link2 size={12} className="shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1 select-text truncate text-[11px] text-slate-600" title={url}>{url}</span>
      <button type="button" onClick={() => void copiar()}
        title={t('Copiar enlace')} aria-label={t('Copiar enlace')}
        className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${copiado ? 'text-emerald-600' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
        {copiado ? <Check size={12} /> : <Copy size={12} />}
        {copiado ? t('Copiado') : t('Copiar')}
      </button>
    </div>
    </div>
  );
}
