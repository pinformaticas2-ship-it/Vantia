import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { FileText, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { aviso } from '../lib/avisos';

// Ajustes → Automatizaciones: documentos base de cada expediente (LOPD, toma
// de requisitos, hoja de encargo). Backend: routes/docsBase.ts.

const DOCS = [
  { nombre: 'LOPD', detalle: 'Documento LOPD, con los datos del despacho y del cliente.' },
  { nombre: 'Informe de toma de requisitos', detalle: 'El general, o el de cláusulas/hipotecas, medidas de apoyo o usura según el asunto.' },
  { nombre: 'Hoja de encargo', detalle: 'Según el tipo: civil, penal, asuntos masa, tarjeta revolving, medidas de apoyo u obligación de hacer.' },
];

export default function DocsBaseAutomatizacion() {
  const { getToken } = useAuth();
  const [activo, setActivo] = useState<boolean | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    apiFetch('/api/docs-base/config', { getToken })
      .then((r) => { setActivo(Boolean(r?.data?.activo)); setCanManage(Boolean(r?.data?.canManage)); })
      .catch(() => setActivo(false));
  }, [getToken]);

  const cambiar = async () => {
    setGuardando(true);
    try {
      const r = await apiFetch('/api/docs-base/config', { method: 'PUT', getToken, body: JSON.stringify({ activo: !activo }) });
      if (r?.success === false) throw new Error(r.error);
      setActivo(Boolean(r.data.activo));
      aviso.ok(r.data.activo
        ? 'Activado: los expedientes nuevos tendrán sus documentos, y los existentes al abrirlos.'
        : 'Desactivado: no se generarán más documentos (los ya generados se quedan).');
    } catch (e: any) { aviso.error(e?.message || 'No se pudo cambiar.'); }
    finally { setGuardando(false); }
  };

  if (activo === null) return null;
  return (
    <div className="mt-4 bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50">
            <FileText size={20} className="text-red-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">Documentos de cada expediente</p>
            <p className="text-xs text-slate-500 mt-0.5">{activo ? 'Activado en esta organización.' : 'Desactivado en esta organización.'}</p>
          </div>
        </div>
        <button type="button" role="switch" aria-checked={activo} disabled={!canManage || guardando} onClick={() => void cambiar()}
          title={canManage ? (activo ? 'Desactivar' : 'Activar') : 'Solo el propietario o un administrador pueden cambiarlo'}
          className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${activo ? 'bg-red-600' : 'bg-slate-300'}`}>
          {guardando
            ? <Loader2 size={14} className="mx-auto animate-spin text-white" />
            : <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : 'translate-x-0.5'}`} />}
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-600">Todo expediente tendrá estos documentos, rellenos con sus datos. Los nuevos, al crearlos; los que ya existían, la primera vez que se abran. Están en la ficha del expediente.</p>
      <ol className="mt-3 grid gap-1.5 text-xs text-slate-600">
        {DOCS.map((d, i) => (
          <li key={d.nombre} className="flex gap-2">
            <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{i + 1}</span>
            <span><strong className="font-semibold text-slate-700">{d.nombre}</strong> — {d.detalle}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
