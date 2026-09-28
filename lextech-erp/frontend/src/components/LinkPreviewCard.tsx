import { useEffect, useState } from 'react';

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
export function LinkPreviewCard({ url, getToken }: {
  url: string;
  getToken: () => Promise<string | null>;
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

  if (state === 'error') return null;

  if (state === 'loading') {
    return (
      <div className="mt-1.5 flex max-w-md items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
        <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  return (
    <a
      href={state.url}
      target="_blank"
      rel="noreferrer"
      className="mt-1.5 flex max-w-md overflow-hidden rounded-lg border border-slate-200 bg-white transition-colors hover:border-slate-300 hover:shadow-sm"
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
  );
}
