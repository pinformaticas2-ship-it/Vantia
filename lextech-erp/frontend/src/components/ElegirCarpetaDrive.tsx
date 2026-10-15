import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/clerk-react';
import { ChevronRight, Folder, HardDrive, Loader2, Users, X } from 'lucide-react';
import { apiFetch } from '../lib/api';

// Explorador de carpetas de Google Drive para elegir la carpeta de
// plantillas del despacho (backend: GET /api/plantillas/drive/carpetas).

interface Carpeta { id: string; nombre: string; compartida?: boolean }

export default function ElegirCarpetaDrive({ onElegir, onCerrar }: {
  onElegir: (carpeta: { id: string; ruta: string }) => Promise<void> | void;
  onCerrar: () => void;
}) {
  const { getToken } = useAuth();
  // Migas: desde "Mi unidad" (root) o "Unidades compartidas".
  const [migas, setMigas] = useState<Carpeta[]>([{ id: 'root', nombre: 'Mi unidad' }]);
  const [carpetas, setCarpetas] = useState<Carpeta[] | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const actual = migas[migas.length - 1];

  useEffect(() => {
    let vivo = true;
    setCarpetas(null); setError('');
    apiFetch(`/api/plantillas/drive/carpetas?padre=${encodeURIComponent(actual.id)}`, { getToken })
      .then((r) => { if (!vivo) return; if (r?.success === false) throw new Error(r.error); setCarpetas(r.data || []); })
      .catch((e) => vivo && setError(e?.message || 'No se pudieron leer las carpetas.'));
    return () => { vivo = false; };
  }, [actual.id, getToken]);

  const ruta = migas.map((m) => m.nombre).join(' / ');
  const raizVirtual = actual.id === 'root' || actual.id === 'compartidas';

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-3" onClick={onCerrar}>
      <div className="w-full max-w-lg max-h-[86vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <div>
            <p className="text-base font-bold text-slate-900">Elige la carpeta de plantillas</p>
            <p className="text-xs text-slate-500">Vantia leerá las plantillas de Word de esa carpeta y sus subcarpetas.</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 flex items-center justify-center"><X size={16} /></button>
        </div>

        <div className="px-5 py-2.5 flex items-center gap-1 flex-wrap text-xs border-b border-slate-100">
          <button type="button" onClick={() => setMigas([{ id: 'root', nombre: 'Mi unidad' }])}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${migas[0].id === 'root' ? 'bg-slate-100 font-semibold text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
            <HardDrive size={12} /> Mi unidad
          </button>
          <button type="button" onClick={() => setMigas([{ id: 'compartidas', nombre: 'Unidades compartidas' }])}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${migas[0].id === 'compartidas' ? 'bg-slate-100 font-semibold text-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Users size={12} /> Unidades compartidas
          </button>
        </div>
        {migas.length > 1 && (
          <div className="px-5 pt-2 flex items-center gap-0.5 flex-wrap text-xs text-slate-500">
            {migas.map((m, i) => (
              <span key={m.id} className="inline-flex items-center">
                {i > 0 && <ChevronRight size={12} className="text-slate-300" />}
                <button type="button" onClick={() => setMigas(migas.slice(0, i + 1))} className={`rounded px-1 py-0.5 hover:bg-slate-100 ${i === migas.length - 1 ? 'font-semibold text-slate-800' : ''}`}>{m.nombre}</button>
              </span>
            ))}
          </div>
        )}

        <div className="flex-1 min-h-[240px] overflow-y-auto px-3 py-2">
          {error ? <p className="px-2 py-6 text-sm text-amber-700">{error}</p>
            : !carpetas ? <div className="py-10 flex justify-center text-slate-400"><Loader2 size={18} className="animate-spin" /></div>
            : carpetas.length === 0 ? <p className="px-2 py-8 text-center text-sm text-slate-500">Esta carpeta no tiene subcarpetas.</p>
            : carpetas.map((c) => (
              <button key={c.id} type="button" onClick={() => setMigas([...migas, c])}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                <Folder size={16} className="shrink-0 text-amber-500" />
                <span className="flex-1 truncate">{c.nombre}</span>
                <ChevronRight size={14} className="shrink-0 text-slate-300" />
              </button>
            ))}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 border-t border-slate-100 px-5 py-3">
          <p className="flex-1 min-w-0 text-xs text-slate-500 truncate" title={ruta}>{raizVirtual ? 'Entra en la carpeta que quieras usar.' : <>Carpeta: <b className="text-slate-700">{ruta}</b></>}</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onCerrar} className="h-9 px-3.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
            <button type="button" disabled={raizVirtual || guardando} onClick={async () => { setGuardando(true); try { await onElegir({ id: actual.id, ruta }); } finally { setGuardando(false); } }}
              className="h-9 px-3.5 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-1.5">
              {guardando && <Loader2 size={14} className="animate-spin" />} Usar esta carpeta
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
