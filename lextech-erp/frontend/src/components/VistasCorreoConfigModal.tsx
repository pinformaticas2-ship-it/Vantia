import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/clerk-react';
import { Loader2, RotateCcw, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { fetchSharedTemplates } from '../lib/sharedTemplates';
import { ImagenesNoAccesibles, imagenesNoAccesibles, resolverImagenesPegadas, useFirmaUpload } from './SignatureEditor';

// Configuración → Automatizaciones → "Configurar correo": cómo se ve el correo
// que Vantia envía al aceptar o rechazar una vista (textos, firma, tipo de
// letra...). La vista previa la genera el backend con el mismo render que el
// envío real (POST /api/vistas/config/preview).

export interface CorreoFormato {
  fuente: string;
  tamano: 'pequeno' | 'normal' | 'grande';
  color: string;
  firma: string;
  firmaHtml: string;
  firmaNombre: string;
  citarOriginal: boolean;
}
interface FirmaRegistrada { id: string; name: string; html: string; isDefault: boolean }
const GUARDADA = '__guardada';
const PEGADA = 'Pegada (HTML)';

// Las firmas importadas pueden venir en quoted-printable (igual que en Email.tsx).
function decodeQP(input: string): string {
  return input
    .replace(/=\r?\n/g, '')
    .replace(/((?:=[0-9A-Fa-f]{2})+)/g, (match) => {
      const bytes = (match.match(/=[0-9A-Fa-f]{2}/g) || []).map((b) => parseInt(b.slice(1), 16));
      try { return new TextDecoder('utf-8').decode(new Uint8Array(bytes)); } catch { return match; }
    });
}
interface Plantilla { asunto: string; cuerpo: string }
export interface CorreoConfig {
  plantillaAceptar: Plantilla;
  plantillaRechazar: Plantilla;
  correo: CorreoFormato;
}

const FUENTES = [
  { id: 'arial', label: 'Arial' },
  { id: 'calibri', label: 'Calibri' },
  { id: 'verdana', label: 'Verdana' },
  { id: 'georgia', label: 'Georgia' },
  { id: 'times', label: 'Times New Roman' },
];
const TAMANOS = [
  { id: 'pequeno', label: 'Pequeño' },
  { id: 'normal', label: 'Normal' },
  { id: 'grande', label: 'Grande' },
] as const;
const COLORES = ['#1f2937', '#000000', '#1e3a8a', '#334155'];

const VARIABLES: { key: string; label: string }[] = [
  { key: '{fecha}', label: 'Fecha' },
  { key: '{hora}', label: 'Hora' },
  { key: '{juzgado_txt}', label: '" en el Juzgado…"' },
  { key: '{autos_txt}', label: '" (autos …)"' },
  { key: '{juzgado}', label: 'Juzgado' },
  { key: '{autos}', label: 'Autos' },
  { key: '{abogado}', label: 'Abogado' },
  { key: '{despacho}', label: 'Despacho' },
  { key: '{asunto_original}', label: 'Asunto recibido' },
  { key: '{mensaje}', label: 'Nota del momento' },
  { key: '{firma}', label: 'Firma' },
];

const DEFAULTS: CorreoConfig = {
  plantillaAceptar: {
    asunto: 'Re: {asunto_original}',
    cuerpo: 'Buenos días,\n\nLes confirmamos nuestra asistencia a la vista señalada para el {fecha} a las {hora}{juzgado_txt}{autos_txt}.\n\n{mensaje}\n\n{firma}',
  },
  plantillaRechazar: {
    asunto: 'Re: {asunto_original}',
    cuerpo: 'Buenos días,\n\nLamentamos comunicarles que no nos es posible asistir a la vista señalada para el {fecha} a las {hora}{juzgado_txt}{autos_txt}.\n\n{mensaje}\n\n{firma}',
  },
  correo: { fuente: 'arial', tamano: 'normal', color: '#1f2937', firma: 'Un cordial saludo,\n{abogado}\n{despacho}', firmaHtml: '', firmaNombre: '', citarOriginal: false },
};

type Campo = 'firma' | 'aceptar' | 'rechazar';

export default function VistasCorreoConfigModal({ initial, canManage, onClose, onSave }: {
  initial: CorreoConfig;
  canManage: boolean;
  onClose: () => void;
  onSave: (cfg: CorreoConfig) => Promise<void>;
}) {
  const { getToken } = useAuth();
  const [cfg, setCfg] = useState<CorreoConfig>(initial);
  const [tab, setTab] = useState<'aceptar' | 'rechazar'>('aceptar');
  const [preview, setPreview] = useState<{ aceptar: { asunto: string; html: string }; rechazar: { asunto: string; html: string } } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const refs = { firma: useRef<HTMLTextAreaElement>(null), aceptar: useRef<HTMLTextAreaElement>(null), rechazar: useRef<HTMLTextAreaElement>(null) };
  const [focused, setFocused] = useState<Campo>('aceptar');

  // Vista previa con un pequeño retardo mientras se escribe.
  useEffect(() => {
    let cancel = false;
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch('/api/vistas/config/preview', { method: 'POST', getToken, body: JSON.stringify({ config: cfg }) });
        if (!cancel && res?.success !== false) setPreview(res.data);
      } catch { /* la vista previa es orientativa */ }
      finally { if (!cancel) setPreviewLoading(false); }
    }, 400);
    return () => { cancel = true; clearTimeout(t); };
  }, [cfg, getToken]);

  // Firmas ya registradas en Correo → Firmas.
  const [firmasRegistradas, setFirmasRegistradas] = useState<FirmaRegistrada[]>([]);
  useEffect(() => {
    fetchSharedTemplates('email_signature', getToken)
      .then((rows) => setFirmasRegistradas(rows
        .map((r) => ({ id: r.id, name: r.name, html: decodeQP(String((r.data as any)?.html || '')), isDefault: r.is_default }))
        .filter((f) => f.html.trim())))
      .catch(() => {});
  }, [getToken]);
  const firmaSel = !cfg.correo.firmaHtml
    ? ''
    : (firmasRegistradas.find((f) => f.name === cfg.correo.firmaNombre && f.html === cfg.correo.firmaHtml)?.id
      || firmasRegistradas.find((f) => f.name === cfg.correo.firmaNombre)?.id
      || GUARDADA);
  const elegirFirma = (id: string) => {
    if (id === GUARDADA) return;
    const f = firmasRegistradas.find((x) => x.id === id);
    setFormato(f ? { firmaHtml: f.html, firmaNombre: f.name } : { firmaHtml: '', firmaNombre: '' });
  };

  const setFormato = (patch: Partial<CorreoFormato>) => setCfg((c) => ({ ...c, correo: { ...c.correo, ...patch } }));
  const setPlantilla = (which: 'aceptar' | 'rechazar', patch: Partial<Plantilla>) =>
    setCfg((c) => which === 'aceptar'
      ? { ...c, plantillaAceptar: { ...c.plantillaAceptar, ...patch } }
      : { ...c, plantillaRechazar: { ...c.plantillaRechazar, ...patch } });

  const insertar = (v: string) => {
    const campo = focused === 'firma' && !cfg.correo.firmaHtml ? 'firma' : tab;
    const el = refs[campo].current;
    const actual = campo === 'firma' ? cfg.correo.firma : (campo === 'aceptar' ? cfg.plantillaAceptar.cuerpo : cfg.plantillaRechazar.cuerpo);
    const ini = el?.selectionStart ?? actual.length;
    const fin = el?.selectionEnd ?? actual.length;
    const nuevo = actual.slice(0, ini) + v + actual.slice(fin);
    if (campo === 'firma') setFormato({ firma: nuevo }); else setPlantilla(campo, { cuerpo: nuevo });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(ini + v.length, ini + v.length); });
  };

  const subirImagen = useFirmaUpload();
  const guardar = async () => {
    setSaving(true); setError('');
    try {
      let final = cfg;
      if (cfg.correo.firmaHtml) {
        // Imágenes incrustadas (data:) → se suben; las de tu ordenador hay que subirlas a mano.
        const r = await resolverImagenesPegadas(cfg.correo.firmaHtml, subirImagen);
        if (imagenesNoAccesibles(r.html).length) throw new Error('La firma tiene imágenes que solo están en tu ordenador: súbelas o quítalas (aviso en amarillo).');
        final = { ...cfg, correo: { ...cfg.correo, firmaHtml: r.html } };
      }
      await onSave(final); onClose();
    }
    catch (e: any) { setError(e?.message || 'No se pudo guardar'); }
    finally { setSaving(false); }
  };

  const plantilla = tab === 'aceptar' ? cfg.plantillaAceptar : cfg.plantillaRechazar;
  const actual = preview?.[tab];
  const ro = !canManage;
  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:bg-slate-50';

  // En un portal sobre <body>: dentro de Configuración, un contenedor con
  // transform hacía que el fixed se recortara bajo la barra superior.
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/30 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-800">Configurar correo de respuesta</h2>
            <p className="text-xs text-slate-500">Lo que se envía al remitente al aceptar o rechazar una vista. Al decidir cada vista aún podrás retocar el texto.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-2">
          {/* Formulario */}
          <div className="space-y-5 border-slate-200 p-5 lg:border-r">
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Formato</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs text-slate-600">Tipo de letra
                  <select disabled={ro} value={cfg.correo.fuente} onChange={(e) => setFormato({ fuente: e.target.value })} className={`${input} mt-1`}>
                    {FUENTES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
                <div className="text-xs text-slate-600">Tamaño
                  <div className="mt-1 flex overflow-hidden rounded-lg border border-slate-300">
                    {TAMANOS.map((t) => (
                      <button key={t.id} type="button" disabled={ro} onClick={() => setFormato({ tamano: t.id })}
                        className={`flex-1 py-2 text-xs font-semibold ${cfg.correo.tamano === t.id ? 'bg-red-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{t.label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                <span>Color del texto</span>
                {COLORES.map((c) => (
                  <button key={c} type="button" disabled={ro} onClick={() => setFormato({ color: c })} title={c}
                    className={`h-6 w-6 rounded-full border-2 ${cfg.correo.color.toLowerCase() === c ? 'border-red-500' : 'border-white ring-1 ring-slate-200'}`} style={{ background: c }} />
                ))}
                <input type="color" disabled={ro} value={cfg.correo.color} onChange={(e) => setFormato({ color: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-slate-200" title="Otro color" />
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" disabled={ro} checked={cfg.correo.citarOriginal} onChange={(e) => setFormato({ citarOriginal: e.target.checked })} className="h-4 w-4 accent-red-600" />
                Incluir el correo recibido citado debajo de la respuesta
              </label>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Firma</h3>
              <select disabled={ro} value={firmaSel} onChange={(e) => elegirFirma(e.target.value)} className={`${input} mb-2`}>
                <option value="">Escribirla aquí</option>
                {firmasRegistradas.map((f) => <option key={f.id} value={f.id}>{f.name}{f.isDefault ? ' (predeterminada)' : ''}</option>)}
                {firmaSel === GUARDADA && <option value={GUARDADA}>{cfg.correo.firmaNombre === PEGADA ? 'Pegada como HTML' : `${cfg.correo.firmaNombre || 'Firma registrada'} (copia guardada)`}</option>}
              </select>
              {cfg.correo.firmaHtml ? (
                <>
                  <div className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs" dangerouslySetInnerHTML={{ __html: cfg.correo.firmaHtml }} />
                  {!ro && <ImagenesNoAccesibles html={cfg.correo.firmaHtml} onChange={(h) => setFormato({ firmaHtml: h })} />}
                  <p className="mt-1 text-[11px] text-slate-400">
                    {cfg.correo.firmaNombre === PEGADA
                      ? 'Firma pegada como HTML: se añade al final del correo con su formato. Para volver a escribirla como texto, elige «Escribirla aquí».'
                      : 'Firma registrada en Correo → Firmas. Se añade al final del correo. Si la cambias allí, vuelve a elegirla aquí para actualizarla.'}
                  </p>
                </>
              ) : (
                <>
                  <textarea ref={refs.firma} disabled={ro} rows={4} value={cfg.correo.firma} onFocus={() => setFocused('firma')}
                    onChange={(e) => {
                      const v = e.target.value;
                      // HTML pegado (p.ej. un aviso legal con estilos): se usa como firma con formato.
                      if (/<\s*(div|p|table|span|br|img|a|b|strong|font|td|tr)\b[^>]*>/i.test(v)) setFormato({ firmaHtml: v, firmaNombre: PEGADA });
                      else setFormato({ firma: v });
                    }} className={`${input} font-mono text-xs`}
                    placeholder="Un cordial saludo,&#10;{abogado}&#10;{despacho}&#10;Tel. …" />
                  <p className="mt-1 text-[11px] text-slate-400">Se coloca donde la plantilla diga {'{firma}'}. Para una firma con logo y colores, créala en Correo → Firmas y elígela arriba; si pegas código HTML aquí, se usará con su formato.</p>
                </>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Texto del correo</h3>
                <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
                  {(['aceptar', 'rechazar'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setTab(t)}
                      className={`rounded-md px-3 py-1 ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{t === 'aceptar' ? 'Al aceptar' : 'Al rechazar'}</button>
                  ))}
                </div>
              </div>
              <label className="text-xs text-slate-600">Asunto
                <input disabled={ro} value={plantilla.asunto} onChange={(e) => setPlantilla(tab, { asunto: e.target.value })} className={`${input} mt-1`} />
              </label>
              <label className="mt-2 block text-xs text-slate-600">Cuerpo
                <textarea ref={refs[tab]} key={tab} disabled={ro} rows={8} value={plantilla.cuerpo} onFocus={() => setFocused(tab)}
                  onChange={(e) => setPlantilla(tab, { cuerpo: e.target.value })} className={`${input} mt-1 font-mono text-xs`} />
              </label>
              {!ro && (
                <div className="mt-2">
                  <p className="mb-1 text-[11px] text-slate-400">Insertar dato (se rellena solo en cada vista):</p>
                  <div className="flex flex-wrap gap-1">
                    {VARIABLES.map((v) => (
                      <button key={v.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertar(v.key)}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 hover:border-red-300 hover:bg-red-50">{v.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Vista previa */}
          <div className="flex flex-col bg-slate-50 p-5">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Vista previa · {tab === 'aceptar' ? 'al aceptar' : 'al rechazar'}</h3>
              {previewLoading && <Loader2 size={12} className="animate-spin text-slate-400" />}
            </div>
            <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
                <p><span className="text-slate-400">Para:</span> procurador@ejemplo.es</p>
                <p><span className="text-slate-400">Asunto:</span> <b className="text-slate-700">{actual?.asunto || '…'}</b></p>
              </div>
              <iframe title="Vista previa del correo" sandbox="" srcDoc={actual ? `<!doctype html><meta charset="utf-8"><body style="margin:16px">${actual.html}</body>` : ''}
                className="h-[min(420px,50vh)] w-full" />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Datos de ejemplo. En cada vista se usan los reales.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          {canManage
            ? <button type="button" onClick={() => setCfg(DEFAULTS)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"><RotateCcw size={13} /> Volver a los valores por defecto</button>
            : <p className="text-xs text-slate-500">Solo el propietario o un administrador pueden cambiarlo.</p>}
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">{canManage ? 'Cancelar' : 'Cerrar'}</button>
            {canManage && (
              <button type="button" disabled={saving} onClick={() => void guardar()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                {saving && <Loader2 size={14} className="animate-spin" />} Guardar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
