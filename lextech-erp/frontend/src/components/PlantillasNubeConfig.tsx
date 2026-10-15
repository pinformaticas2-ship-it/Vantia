import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Copy, ExternalLink, FileText, FolderOpen, Loader2, RefreshCw, Upload, AlertTriangle } from 'lucide-react';
import { apiFetch, safeJson } from '../lib/api';
import { aviso, confirmar } from '../lib/avisos';

// ── Ajustes → Mi Despacho → Plantillas del despacho (15/10/2026) ────────────
// Cada despacho usa las plantillas de una carpeta "Plantillas" de su Google
// Drive o Dropbox. Backend: routes/plantillas.ts + services/plantillasNube.ts.

interface Config {
  origen: 'integradas' | 'drive' | 'dropbox';
  carpetaUrl: string | null;
  carpetaTexto: string | null;
  total: number | null;
  error: string | null;
  conectados: { drive: boolean; dropbox: boolean };
  importacion: { estado: 'importando' | 'hecha' | 'error'; hechos: number; total: number; error?: string } | null;
  hayIntegradas: boolean;
  canManage: boolean;
}

export default function PlantillasNubeConfig() {
  const { getToken } = useAuth();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await apiFetch('/api/plantillas/config', { getToken });
      if (r?.success) setCfg(r.data);
    } catch { /* se queda como estaba */ }
  }, [getToken]);
  useEffect(() => { void cargar(); }, [cargar]);

  // Mientras se importan, se mira el progreso cada 4 s.
  useEffect(() => {
    if (cfg?.importacion?.estado !== 'importando') return;
    const t = setTimeout(() => void cargar(), 4000);
    return () => clearTimeout(t);
  }, [cfg, cargar]);

  const accion = async (clave: string, url: string, body?: any, ok?: string) => {
    setOcupado(clave);
    try {
      const r = await apiFetch(url, { method: 'POST', getToken, body: JSON.stringify(body || {}) });
      if (r?.success === false) throw new Error(r.error);
      if (ok) aviso.ok(ok);
      await cargar();
    } catch (e: any) { aviso.error(e?.message || 'No se pudo hacer.'); }
    finally { setOcupado(null); }
  };

  const subir = async (files: FileList | null) => {
    if (!files?.length) return;
    setOcupado('subir');
    try {
      const token = await getToken({ skipCache: true });
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append('files', f);
      const res = await fetch('/api/plantillas/subir', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const d = await safeJson(res);
      if (!res.ok || d?.success === false) throw new Error(d?.error || 'No se pudo subir.');
      const { subidas = [], rechazadas = [] } = d.data || {};
      if (subidas.length) aviso.ok(`${subidas.length} plantilla${subidas.length === 1 ? '' : 's'} subida${subidas.length === 1 ? '' : 's'}`);
      if (rechazadas.length) aviso.error(`Solo se admiten archivos de Word (.doc, .docx): ${rechazadas.join(', ')}`);
      await cargar();
    } catch (e: any) { aviso.error(e?.message || 'No se pudo subir.'); }
    finally { setOcupado(null); if (inputRef.current) inputRef.current.value = ''; }
  };

  if (!cfg) return null;
  const enNube = cfg.origen !== 'integradas';
  const nubeNombre = cfg.origen === 'drive' ? 'Google Drive' : 'Dropbox';
  const imp = cfg.importacion;

  return (
    <section className="mt-8 bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50"><FileText size={20} className="text-red-600" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-800">Plantillas del despacho</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {enNube
              ? <>Se usan las plantillas de la carpeta <b className="text-slate-700">Plantillas</b> de vuestro {nubeNombre}{cfg.total != null && <> · <b className="text-slate-700">{cfg.total}</b> plantilla{cfg.total === 1 ? '' : 's'}</>}.</>
              : 'Ahora se usan las plantillas integradas de Vantia. Conecta una carpeta de vuestra nube para usar las vuestras.'}
          </p>
        </div>
      </div>

      {cfg.error && <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><AlertTriangle size={13} className="shrink-0 mt-0.5" /> {cfg.error}</p>}

      {!enNube && cfg.canManage && (
        <div className="mt-4">
          {cfg.conectados.drive || cfg.conectados.dropbox ? (
            <div className="flex flex-wrap gap-2">
              {cfg.conectados.drive && (
                <button type="button" disabled={!!ocupado} onClick={() => void accion('conectar', '/api/plantillas/conectar', { proveedor: 'drive' }, 'Carpeta «Plantillas» creada en Google Drive')}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {ocupado === 'conectar' ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />} Usar una carpeta de Google Drive
                </button>
              )}
              {cfg.conectados.dropbox && (
                <button type="button" disabled={!!ocupado} onClick={() => void accion('conectar', '/api/plantillas/conectar', { proveedor: 'dropbox' }, 'Carpeta «Plantillas» creada en Dropbox')}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                  <FolderOpen size={14} /> Usar una carpeta de Dropbox
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-600">Primero conecta Google Drive o Dropbox en <Link to="/dashboard/config?section=integraciones" className="font-semibold text-red-600 hover:underline">Integraciones</Link>.</p>
          )}
          <p className="mt-2 text-xs text-slate-500">Se crea la carpeta <b>Plantillas</b> dentro de la carpeta de Vantia de vuestra nube. Desde ese momento este despacho solo verá sus plantillas.</p>
        </div>
      )}

      {enNube && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {cfg.carpetaUrl && (
              <a href={cfg.carpetaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <ExternalLink size={14} /> Abrir la carpeta
              </a>
            )}
            {cfg.canManage && (
              <>
                <input ref={inputRef} type="file" multiple accept=".doc,.docx" className="hidden" onChange={(e) => void subir(e.target.files)} />
                <button type="button" disabled={!!ocupado} onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {ocupado === 'subir' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Subir plantillas
                </button>
                {cfg.hayIntegradas && imp?.estado !== 'importando' && (
                  <button type="button" disabled={!!ocupado} onClick={async () => {
                    if (!(await confirmar({ titulo: 'Copiar las plantillas integradas a vuestra carpeta', mensaje: `Se copiarán a la carpeta Plantillas de ${nubeNombre} (unas 580, con sus subcarpetas). Las que ya estén no se repiten. Tarda unos minutos; puedes seguir trabajando.`, confirmar: 'Copiar' }))) return;
                    void accion('importar', '/api/plantillas/importar-integradas', {}, 'Copiando las plantillas… puedes seguir trabajando');
                  }}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                    <Copy size={14} /> Copiar las plantillas integradas
                  </button>
                )}
                <button type="button" onClick={() => void cargar()} title="Volver a leer la carpeta" className="h-9 w-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-50">
                  <RefreshCw size={14} />
                </button>
              </>
            )}
          </div>

          {imp && (
            <div className="text-xs">
              {imp.estado === 'importando' && (
                <div>
                  <p className="text-slate-600 inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Copiando plantillas: {imp.hechos} de {imp.total}</p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-red-600 transition-all" style={{ width: `${imp.total ? Math.round(100 * imp.hechos / imp.total) : 0}%` }} /></div>
                </div>
              )}
              {imp.estado === 'hecha' && <p className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Plantillas integradas copiadas ({imp.total}).</p>}
              {imp.estado === 'error' && <p className="text-amber-700">La copia se paró en {imp.hechos} de {imp.total}: {imp.error}. Puedes volver a pulsar «Copiar»: seguirá por donde iba.</p>}
            </div>
          )}

          <p className="text-xs text-slate-500">
            {cfg.origen === 'drive'
              ? 'Por privacidad, Vantia solo puede ver en vuestro Drive lo que ella misma ha subido: añade las plantillas nuevas con «Subir plantillas». Las que ya están se pueden abrir y editar en Drive.'
              : <>Lo que pongáis en <b>{cfg.carpetaTexto}</b> (también desde el Dropbox del ordenador) aparece aquí, con sus subcarpetas.</>}
          </p>

          {cfg.canManage && (
            <button type="button" disabled={!!ocupado} onClick={async () => {
              if (!(await confirmar({ titulo: 'Dejar de usar la carpeta de la nube', mensaje: 'Se volverán a usar las plantillas integradas de Vantia. La carpeta y sus archivos no se borran.', confirmar: 'Dejar de usarla' }))) return;
              void accion('desconectar', '/api/plantillas/desconectar', {}, 'Se vuelven a usar las plantillas integradas');
            }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
              Dejar de usar esta carpeta
            </button>
          )}
        </div>
      )}
    </section>
  );
}
