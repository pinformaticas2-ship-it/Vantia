import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/clerk-react';
import { CheckCircle2, Download, Eye, FileText, Loader2, PencilLine, RefreshCw, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { aviso } from '../lib/avisos';
import { FilePreviewModal } from './FilePreviewModal';
import RellenarPlantilla from './RellenarPlantilla';

// ── Documentos base del expediente (15/10/2026) ─────────────────────────────
// LOPD, informe de toma de requisitos y hoja de encargo, rellenos solos con
// los datos del expediente (backend: services/docsBaseExpediente.ts). Solo
// aparece si la organización lo tiene activado en Ajustes → Automatizaciones.

interface Doc {
  tipo: string;
  nombre: string;
  estado: 'pendiente' | 'generando' | 'listo' | 'error';
  plantilla: string;
  plantillaNombre: string;
  fileId: string | null;
  archivo: string | null;
  pendientes: number | null;
  error: string | null;
  generadoAt: string | null;
}

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default function DocumentosBaseExpediente({ expedienteId, bloqueado = false }: { expedienteId: string; bloqueado?: boolean }) {
  const { getToken } = useAuth();
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [activo, setActivo] = useState(false);
  const [rehaciendo, setRehaciendo] = useState<string | null>(null);
  const [completar, setCompletar] = useState<Doc | null>(null);
  const [vista, setVista] = useState<{ src: string; nombre: string } | null>(null);
  const intentos = useRef(0);

  const cargar = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/docs-base/expedientes/${expedienteId}`, { getToken });
      if (res?.success === false) return;
      setActivo(Boolean(res.data?.activo));
      setDocs(res.data?.docs || []);
    } catch { /* sin permiso o sin conexión: la tarjeta no aparece */ }
  }, [expedienteId, getToken]);

  useEffect(() => { intentos.current = 0; void cargar(); }, [cargar]);

  // Mientras alguno se está generando (las plantillas .doc tardan unos
  // segundos en convertirse), se mira de nuevo cada 3 s durante un minuto.
  const generando = (docs || []).some((d) => d.estado === 'generando');
  useEffect(() => {
    if (!generando || intentos.current > 20) return;
    const t = setTimeout(() => { intentos.current++; void cargar(); }, 3000);
    return () => clearTimeout(t);
  }, [generando, docs, cargar]);

  const rehacer = async (d: Doc, valores?: Record<string, string>) => {
    setRehaciendo(d.tipo);
    try {
      const res = await apiFetch(`/api/docs-base/expedientes/${expedienteId}/${d.tipo}`, {
        method: 'POST', getToken, body: JSON.stringify({ plantilla: d.plantilla, valores }),
      });
      if (res?.success === false) throw new Error(res.error);
      setDocs(res.data.docs);
      aviso.ok(`${d.nombre}: documento generado con los datos actuales`);
    } catch (e: any) {
      aviso.error(e?.message || 'No se pudo generar el documento.');
      void cargar();
    } finally { setRehaciendo(null); }
  };

  const bajar = async (d: Doc, ver: boolean) => {
    if (!d.fileId) return;
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${expedienteId}/${d.fileId}/download`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('No se pudo abrir el documento.');
      const blob = new Blob([await res.blob()], { type: MIME_DOCX });
      const url = URL.createObjectURL(blob);
      const nombre = (d.archivo || d.nombre).replace(/\.docx$/i, '') + '.docx';
      if (ver) { setVista({ src: url, nombre }); return; }
      const a = document.createElement('a'); a.href = url; a.download = nombre; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e: any) { aviso.error(e?.message || 'No se pudo abrir el documento.'); }
  };

  if (!activo || !docs) return null;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Documentos del expediente</h3>
          <p className="text-xs text-slate-500 mt-0.5">Se generan solos con los datos del expediente. Los datos que falten se quedan marcados «así» para completarlos.</p>
        </div>
      </div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {docs.map((d) => {
          const ocupado = rehaciendo === d.tipo || d.estado === 'generando';
          const borrado = d.estado === 'listo' && !d.fileId;
          return (
            <div key={d.tipo} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3 py-2.5">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${d.estado === 'error' || borrado ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                  {ocupado ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{d.nombre}</p>
                  <p className="text-xs text-slate-500 truncate" title={d.plantillaNombre}>
                    {ocupado ? 'Generando…'
                      : d.estado === 'error' ? <span className="text-amber-700">No se pudo generar: {d.error}</span>
                      : borrado ? <span className="text-amber-700">Se borró el documento</span>
                      : d.estado === 'listo' ? (
                        <>
                          {fecha(d.generadoAt)} · {d.pendientes
                            ? <span className="text-amber-700 font-medium">{d.pendientes} dato{d.pendientes === 1 ? '' : 's'} por completar</span>
                            : <span className="text-emerald-700 inline-flex items-center gap-0.5"><CheckCircle2 size={11} /> completo</span>}
                        </>
                      ) : 'Pendiente'}
                    <span className="text-slate-400"> · {d.plantillaNombre.replace(/\.docx?$/i, '')}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:shrink-0 pl-12 sm:pl-0">
                {d.fileId && !ocupado && (
                  <>
                    <button type="button" onClick={() => void bajar(d, true)} title="Ver" className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50"><Eye size={14} /></button>
                    <button type="button" onClick={() => void bajar(d, false)} title="Descargar" className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50"><Download size={14} /></button>
                  </>
                )}
                {!bloqueado && !ocupado && (d.pendientes || d.estado !== 'listo' || borrado) ? (
                  <button type="button" onClick={() => setCompletar(d)}
                    className="h-8 px-2.5 rounded-lg bg-red-600 text-xs font-semibold text-white hover:bg-red-700 inline-flex items-center gap-1">
                    <PencilLine size={13} /> {d.pendientes ? 'Completar datos' : 'Generar'}
                  </button>
                ) : null}
                {!bloqueado && !ocupado && d.estado === 'listo' && !d.pendientes && !borrado && (
                  <button type="button" onClick={() => void rehacer(d)} title="Volver a generarlo con los datos actuales del expediente"
                    className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">
                    <RefreshCw size={13} /> Actualizar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {completar && createPortal(
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/50 p-3" onClick={() => setCompletar(null)}>
          <div className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-bold text-slate-900">{completar.nombre}</p>
              <button type="button" onClick={() => setCompletar(null)} aria-label="Cerrar" className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 flex items-center justify-center"><X size={16} /></button>
            </div>
            <RellenarPlantilla
              path={completar.plantilla}
              nombre={completar.plantillaNombre}
              expedienteId={expedienteId}
              onVolver={() => setCompletar(null)}
              textoBoton="Guardar y generar"
              generar={async (valores) => { const d = completar; setCompletar(null); await rehacer(d, valores); }}
            />
          </div>
        </div>,
        document.body,
      )}

      {vista && (
        <FilePreviewModal src={vista.src} fileName={vista.nombre} mime={MIME_DOCX}
          onDownload={() => { const a = document.createElement('a'); a.href = vista.src; a.download = vista.nombre; a.click(); }}
          onClose={() => { URL.revokeObjectURL(vista.src); setVista(null); }} />
      )}
    </section>
  );
}

