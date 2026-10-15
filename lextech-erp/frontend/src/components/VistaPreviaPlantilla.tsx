import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Loader2 } from 'lucide-react';

// ── Vista previa de una plantilla del despacho (15/10/2026) ──────────────────
// Como en el panel de archivos (FilesTabPanel): primero en PDF (fiel al Word,
// con LibreOffice en el servidor) y, si no se puede, en HTML.

export default function VistaPreviaPlantilla({ path, ext }: { path: string; ext: string }) {
  const { getToken } = useAuth();
  const [pdf, setPdf] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const abort = new AbortController();
    let url: string | null = null;
    setPdf(null); setHtml(null); setCargando(true);
    (async () => {
      try {
        const token = await getToken({ skipCache: true });
        const auth = { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal };
        if (ext === '.doc' || ext === '.docx') {
          const r = await fetch(`/api/files/templates/preview-pdf?path=${encodeURIComponent(path)}`, auth);
          if (r.ok && (r.headers.get('content-type') || '').includes('application/pdf')) {
            url = URL.createObjectURL(await r.blob());
            if (!abort.signal.aborted) setPdf(url);
            return;
          }
        }
        const r = await fetch(`/api/files/templates/preview?path=${encodeURIComponent(path)}`, auth);
        const t = await r.text();
        if (!abort.signal.aborted) setHtml(t);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setHtml('<html><body style="padding:24px;font-family:sans-serif;color:#64748b;font-size:13px">No se pudo cargar la vista previa de esta plantilla.</body></html>');
      } finally {
        if (!abort.signal.aborted) setCargando(false);
      }
    })();
    return () => { abort.abort(); if (url) URL.revokeObjectURL(url); };
  }, [path, ext, getToken]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      {cargando && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500">
          <Loader2 size={20} className="animate-spin" />
          <p className="text-xs">Preparando la vista previa…</p>
        </div>
      )}
      {pdf && <iframe title="Vista previa de la plantilla" src={`${pdf}#toolbar=0&navpanes=0&view=FitH`} className="h-full w-full border-0 bg-white" />}
      {html && <iframe title="Vista previa de la plantilla" srcDoc={html} sandbox="" className="h-full w-full border-0 bg-white" />}
    </div>
  );
}
