import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { ArrowLeft, CheckCircle2, FileText, Loader2, Sparkles, AlertCircle, Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { safeJson, resolveUploadUrl } from '../lib/api';
import { aviso } from '../lib/avisos';

// ── Revisar los datos antes de generar un documento (15/10/2026) ─────────────
// Las plantillas del despacho (de MN Program) llevan campos como
// «Contrarios_Nombre». Aquí se ve cada campo con el dato que pondrá Vantia;
// lo que Vantia no sabe (WIZINK_*, cláusulas...) se escribe a mano y queda
// recordado: en el expediente, o para todo el despacho si es del despacho.

interface Campo {
  nombre: string;
  clave: string;
  etiqueta: string;
  grupo: string;
  valor: string;
  origen: 'vantia' | 'guardado' | 'vacio';
  conoceVantia: boolean;
  deDespacho: boolean;
  /** El logo: una imagen que sale de Ajustes → Mi Despacho (no se escribe). */
  imagen?: boolean;
  imagenUrl?: string | null;
}

const ORIGEN: Record<Campo['origen'], { label: string; cls: string }> = {
  vantia: { label: 'De Vantia', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  guardado: { label: 'Guardado', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  vacio: { label: 'Falta', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

export default function RellenarPlantilla({ path, nombre, expedienteId, clienteId, onVolver, onGenerado, generar: generarFuera, textoBoton = 'Generar documento' }: {
  path: string;
  nombre: string;
  /** De qué se sacan los datos: un expediente o, desde la ficha del cliente, un cliente. */
  expedienteId?: string;
  clienteId?: string;
  onVolver: () => void;
  onGenerado?: (archivo: File) => Promise<void> | void;
  /** Si se pasa, genera y guarda quien llama (p. ej. los documentos base del expediente). */
  generar?: (valores: Record<string, string>) => Promise<void>;
  textoBoton?: string;
}) {
  const { getToken } = useAuth();
  const [campos, setCampos] = useState<Campo[] | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [convertida, setConvertida] = useState(false);
  const [error, setError] = useState('');
  const [soloFaltan, setSoloFaltan] = useState(false);
  const [dejarMarcados, setDejarMarcados] = useState(true);
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const token = await getToken({ skipCache: true });
        const de = expedienteId ? `expedienteId=${encodeURIComponent(expedienteId)}` : `clienteId=${encodeURIComponent(clienteId || '')}`;
        const res = await fetch(`/api/files/templates/campos?path=${encodeURIComponent(path)}&${de}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await safeJson(res);
        if (!vivo) return;
        if (!res.ok || !d?.success) throw new Error(d?.error || 'No se pudo leer la plantilla.');
        setCampos(d.data.campos);
        setConvertida(!!d.data.convertida);
        setValores(Object.fromEntries(d.data.campos.map((c: Campo) => [c.clave, c.valor || ''])));
      } catch (e: any) { if (vivo) setError(e?.message || 'No se pudo leer la plantilla.'); }
    })();
    return () => { vivo = false; };
  }, [path, expedienteId, clienteId, getToken]);

  const rellenos = useMemo(() => (campos || []).filter((c) => (valores[c.clave] || '').trim()).length, [campos, valores]);
  const grupos = useMemo(() => {
    const out: { grupo: string; campos: Campo[] }[] = [];
    for (const c of campos || []) {
      if (soloFaltan && (valores[c.clave] || '').trim()) continue;
      const g = out.find((x) => x.grupo === c.grupo) || (out.push({ grupo: c.grupo, campos: [] }), out[out.length - 1]);
      g.campos.push(c);
    }
    return out;
  }, [campos, soloFaltan, valores]);

  const generar = async () => {
    if (!campos) return;
    setGenerando(true);
    try {
      // Con "dejar marcados", lo vacío no se manda: en el documento queda el
      // «Campo» visible para completarlo en Word.
      const enviar = Object.fromEntries(campos
        .filter((c) => !c.imagen)
        .filter((c) => !dejarMarcados || (valores[c.clave] || '').trim())
        .map((c) => [c.nombre, valores[c.clave] ?? '']));
      if (generarFuera) { await generarFuera(enviar); return; }
      const token = await getToken({ skipCache: true });
      const res = await fetch('/api/files/templates/generar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, expedienteId, clienteId, valores: enviar }),
      });
      if (!res.ok) { const d = await safeJson(res); throw new Error(d?.error || 'No se pudo generar el documento.'); }
      const blob = await res.blob();
      const archivo = new File([blob], nombre.replace(/\.docx?$/i, '') + '.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      await onGenerado?.(archivo);
      aviso.ok('Documento generado con los datos y adjuntado');
    } catch (e: any) {
      aviso.error(e?.message || 'No se pudo generar el documento.');
    } finally { setGenerando(false); }
  };

  if (error) return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-8">
      <AlertCircle size={22} className="text-red-500" />
      <p className="text-sm text-slate-700">{error}</p>
      <button type="button" onClick={onVolver} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Volver</button>
    </div>
  );
  if (!campos) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
      <Loader2 size={20} className="animate-spin" />
      <p className="text-sm">Leyendo la plantilla…</p>
      <p className="text-xs text-slate-400">Las plantillas .doc antiguas tardan unos segundos la primera vez.</p>
    </div>
  );

  const faltan = campos.length - rellenos;
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-start gap-3 pb-3">
        <button type="button" onClick={onVolver} title="Volver" className="mt-0.5 h-8 w-8 shrink-0 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 truncate" title={nombre}><FileText size={14} className="inline -mt-0.5 mr-1 text-slate-400" />{nombre}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {campos.length === 0
              ? 'Esta plantilla no tiene campos para rellenar.'
              : <>{campos.length} campos · <span className="text-emerald-700 font-semibold">{rellenos} rellenos</span>{faltan > 0 && <> · <span className="text-amber-700 font-semibold">{faltan} por completar</span></>}</>}
            {convertida && ' · plantilla .doc: se entregará como .docx'}
          </p>
        </div>
        {faltan > 0 && (
          <label className="shrink-0 inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={soloFaltan} onChange={(e) => setSoloFaltan(e.target.checked)} className="accent-red-600" />
            Solo los que faltan
          </label>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1 space-y-4 max-h-[52vh]">
        {grupos.map((g) => (
          <section key={g.grupo}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{g.grupo}</p>
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
              {g.campos.map((c) => {
                const v = valores[c.clave] ?? '';
                const cambiado = v !== (c.valor || '');
                const origen: Campo['origen'] = cambiado ? (v.trim() ? 'guardado' : 'vacio') : (v.trim() ? c.origen : 'vacio');
                const o = ORIGEN[origen];
                const largo = v.length > 70 || v.includes('\n');
                return (
                  <div key={c.clave} className="grid grid-cols-1 sm:grid-cols-[minmax(0,200px)_1fr] gap-1.5 sm:gap-3 px-3 py-2 items-start">
                    <div className="min-w-0 pt-1.5">
                      <p className="text-xs font-medium text-slate-700 break-words" title={`«${c.nombre}»`}>{c.etiqueta}</p>
                      <span className={`mt-1 inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-semibold ${o.cls}`}>
                        {origen === 'vantia' ? <Sparkles size={9} /> : origen === 'guardado' ? <CheckCircle2 size={9} /> : null}{o.label}
                      </span>
                      {c.deDespacho && <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-slate-400" title="Lo que escribas aquí se recuerda para todo el despacho"><Building2 size={9} /> despacho</span>}
                    </div>
                    {c.imagen ? (
                      c.imagenUrl ? (
                        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                          <img src={resolveUploadUrl(c.imagenUrl) || undefined} alt="Logo del despacho" className="h-9 max-w-[140px] object-contain" />
                          <span className="text-xs text-slate-500">Se pondrá el logo de Mi Despacho.</span>
                        </div>
                      ) : (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                          El despacho no tiene logo: súbelo en <Link to="/dashboard/config?section=despacho" className="font-semibold underline">Ajustes → Mi Despacho</Link> y saldrá en todos los documentos.
                        </p>
                      )
                    ) : largo ? (
                      <textarea value={v} rows={Math.min(5, Math.max(2, v.split('\n').length))}
                        onChange={(e) => setValores((p) => ({ ...p, [c.clave]: e.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-800 focus:bg-white focus:border-red-300 outline-none" />
                    ) : (
                      <input value={v} placeholder={c.conoceVantia ? 'Vantia no tiene este dato en el expediente' : 'Escríbelo (se recordará)'}
                        onChange={(e) => setValores((p) => ({ ...p, [c.clave]: e.target.value }))}
                        className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-red-300 outline-none" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {soloFaltan && grupos.length === 0 && <p className="py-8 text-center text-sm text-emerald-700">Todos los campos tienen dato. ✓</p>}
      </div>

      <div className="pt-4 flex flex-col sm:flex-row sm:items-center gap-3">
        {faltan > 0 && (
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none" title="Si no, los campos vacíos desaparecen del documento">
            <input type="checkbox" checked={dejarMarcados} onChange={(e) => setDejarMarcados(e.target.checked)} className="accent-red-600" />
            Dejar marcados los vacíos para completarlos en Word
          </label>
        )}
        <div className="sm:ml-auto flex gap-2">
          <button type="button" onClick={onVolver} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50">Volver</button>
          <button type="button" onClick={generar} disabled={generando}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-xl">
            {generando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {textoBoton}
          </button>
        </div>
      </div>
    </div>
  );
}
