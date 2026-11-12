import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Ban, Check, Loader2, MousePointerClick, Plus, X, type LucideIcon } from 'lucide-react';
import { t } from '../lib/i18n';
import { confirmar } from '../lib/avisos';

// Editor de flujos de las automatizaciones (12/11/2026), al estilo de Zapier
// o Make: el disparador arriba («Cuando…»), las condiciones («Si…») y las
// acciones («Entonces…») encadenadas, y ramas cuando el flujo se divide
// (p. ej. «Si aceptas» / «Si rechazas»). Al pulsar un paso se abre a la
// derecha lo que hace y sus ajustes. Los pasos opcionales se pueden quitar
// del flujo (se quedan en su sitio, en gris, para volver a añadirlos).
// El editor no guarda nada por sí mismo: quien lo usa le pasa los pasos ya
// construidos con su borrador y recibe «Guardar».

export type ClasePaso = 'disparador' | 'condicion' | 'accion';

export interface PasoFlujo {
  id: string;
  clase: ClasePaso;
  icono: LucideIcon;
  titulo: string;
  /** Una línea con cómo está configurado. */
  resumen?: React.ReactNode;
  /** Qué hace el paso (se ve al abrirlo). */
  explicacion?: React.ReactNode;
  /** Ajustes del paso (se ven al abrirlo). */
  ajustes?: React.ReactNode;
  /** Si se puede quitar del flujo. */
  opcional?: { activo: boolean; cambiar: (v: boolean) => void };
}

export interface RamaFlujo { id: string; titulo: string; tono: 'verde' | 'rojo'; pasos: PasoFlujo[] }

const CLASES: Record<ClasePaso, { etiqueta: string; chip: string; borde: string; icono: string }> = {
  disparador: { etiqueta: 'Cuando', chip: 'bg-amber-100 text-amber-800', borde: 'border-l-amber-400', icono: 'bg-amber-50 text-amber-600' },
  condicion: { etiqueta: 'Si', chip: 'bg-sky-100 text-sky-800', borde: 'border-l-sky-400', icono: 'bg-sky-50 text-sky-600' },
  accion: { etiqueta: 'Entonces', chip: 'bg-red-100 text-red-700', borde: 'border-l-red-500', icono: 'bg-red-50 text-red-600' },
};

function Conector({ corto }: { corto?: boolean }) {
  return <div className={`mx-auto w-px bg-slate-300 ${corto ? 'h-4' : 'h-7'}`} aria-hidden />;
}

function TarjetaPaso({ paso, seleccionado, onClick, puedeEditar }: { paso: PasoFlujo; seleccionado: boolean; onClick: () => void; puedeEditar: boolean }) {
  const c = CLASES[paso.clase];
  const quitado = paso.opcional && !paso.opcional.activo;
  const Icono = paso.icono;
  return (
    <div className={`group relative w-full max-w-[380px] mx-auto`}>
      <button type="button" onClick={onClick}
        className={`w-full rounded-xl border border-l-4 bg-white px-4 py-3 text-left shadow-sm transition-all hover:shadow-md ${c.borde}
          ${quitado ? 'border-dashed opacity-60' : ''} ${seleccionado ? 'ring-2 ring-red-500/60 border-red-300' : 'border-slate-200'}`}>
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icono}`}><Icono size={17} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c.chip}`}>{t(c.etiqueta)}</span>
              {quitado && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{t('Quitado')}</span>}
            </div>
            <p className={`mt-1 text-sm font-semibold ${quitado ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{paso.titulo}</p>
            {paso.resumen && <p className="mt-0.5 text-xs text-slate-500">{paso.resumen}</p>}
          </div>
        </div>
      </button>
      {paso.opcional && puedeEditar && (
        <button type="button"
          onClick={(e) => { e.stopPropagation(); paso.opcional!.cambiar(!paso.opcional!.activo); }}
          title={paso.opcional.activo ? t('Quitar del flujo') : t('Añadir al flujo')}
          className={`absolute -right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border bg-white shadow-sm transition-opacity
            ${paso.opcional.activo ? 'border-slate-200 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-600 focus:opacity-100' : 'border-emerald-300 text-emerald-600 opacity-100 hover:bg-emerald-50'}`}>
          {paso.opcional.activo ? <X size={14} /> : <Plus size={14} />}
        </button>
      )}
    </div>
  );
}

function Secuencia({ pasos, sel, setSel, puedeEditar }: { pasos: PasoFlujo[]; sel: string | null; setSel: (id: string) => void; puedeEditar: boolean }) {
  return (
    <>
      {pasos.map((p, i) => (
        <React.Fragment key={p.id}>
          {i > 0 && <Conector />}
          <TarjetaPaso paso={p} seleccionado={sel === p.id} onClick={() => setSel(p.id)} puedeEditar={puedeEditar} />
        </React.Fragment>
      ))}
    </>
  );
}

export default function FlujoEditor({
  titulo, subtitulo, icono: Icono, pasos, ramas, descripcion, puedeEditar, sucio, guardando, error, onGuardar, onCerrar, cabeceraExtra,
}: {
  titulo: string;
  subtitulo?: string;
  icono: LucideIcon;
  pasos: PasoFlujo[];
  ramas?: RamaFlujo[];
  descripcion?: React.ReactNode;
  puedeEditar: boolean;
  sucio: boolean;
  guardando: boolean;
  error?: string;
  onGuardar: () => void | Promise<void>;
  onCerrar: () => void;
  cabeceraExtra?: React.ReactNode;
}) {
  const [sel, setSel] = useState<string | null>(null);
  const todos = useMemo(() => [...pasos, ...(ramas || []).flatMap((r) => r.pasos)], [pasos, ramas]);
  const elegido = todos.find((p) => p.id === sel) || null;

  const cerrar = async () => {
    if (sucio && !(await confirmar({ titulo: t('¿Salir sin guardar?'), mensaje: t('Los cambios del flujo se perderán.'), confirmar: t('Salir sin guardar'), peligro: true }))) return;
    onCerrar();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[data-confirmacion-abierta]')) return;
      if (sel) setSel(null); else void cerrar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const c = elegido ? CLASES[elegido.clase] : null;
  const Ic = elegido?.icono;

  // En un portal: por encima de la barra lateral y de todo lo de la página.
  return createPortal(
    <div className="fixed inset-0 z-[150] flex bg-slate-900/50 sm:p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="flex h-full w-full flex-col overflow-hidden bg-slate-50 shadow-2xl sm:rounded-2xl">
        {/* Cabecera */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <button type="button" onClick={() => void cerrar()} aria-label={t('Cerrar')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft size={18} /></button>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"><Icono size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-slate-800">{titulo}</p>
            {subtitulo && <p className="truncate text-xs text-slate-500">{subtitulo}</p>}
          </div>
          {cabeceraExtra}
          {puedeEditar ? (
            <button type="button" onClick={() => void onGuardar()} disabled={!sucio || guardando}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
              {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{sucio ? t('Guardar cambios') : t('Guardado')}
            </button>
          ) : (
            <span className="text-xs text-slate-500">{t('Solo el propietario o un administrador pueden cambiarlo')}</span>
          )}
        </div>
        {error && <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">{error}</p>}

        <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_420px]">
          {/* Lienzo */}
          <div className="min-h-0 overflow-auto px-4 py-8 sm:px-8"
            style={{ backgroundImage: 'radial-gradient(rgb(148 163 184 / 0.35) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
            onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
            <Secuencia pasos={pasos} sel={sel} setSel={setSel} puedeEditar={puedeEditar} />
            {ramas && ramas.length > 0 && (
              <>
                <Conector />
                {ramas.length > 1 && <div className="mx-auto hidden h-px w-1/2 max-w-[410px] bg-slate-300 md:block" aria-hidden />}
                <div className={`mx-auto grid max-w-[820px] gap-6 ${ramas.length > 1 ? 'md:grid-cols-2' : ''}`}>
                  {ramas.map((r) => (
                    <div key={r.id} className="min-w-0">
                      <Conector corto />
                      <div className="flex justify-center">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${r.tono === 'verde' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>{r.titulo}</span>
                      </div>
                      <Conector corto />
                      {r.pasos.length ? <Secuencia pasos={r.pasos} sel={sel} setSel={setSel} puedeEditar={puedeEditar} />
                        : <p className="text-center text-xs text-slate-400">{t('Sin pasos')}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="mt-6 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-400"><Ban size={11} />{t('Fin del flujo')}</span>
            </div>
          </div>

          {/* Panel del paso */}
          <aside className="min-h-0 overflow-y-auto border-t border-slate-200 bg-white lg:border-l lg:border-t-0">
            {!elegido ? (
              <div className="p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><MousePointerClick size={16} className="text-slate-400" />{t('Pulsa un paso para verlo y ajustarlo')}</div>
                {descripcion && <div className="mt-3 text-sm leading-6 text-slate-600">{descripcion}</div>}
                <ul className="mt-5 space-y-2 text-xs text-slate-500">
                  <li className="flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${CLASES.disparador.chip}`}>{t('Cuando')}</span>{t('lo que pone en marcha el flujo')}</li>
                  <li className="flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${CLASES.condicion.chip}`}>{t('Si')}</span>{t('lo que se comprueba antes de seguir')}</li>
                  <li className="flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${CLASES.accion.chip}`}>{t('Entonces')}</span>{t('lo que hace Vantia')}</li>
                  {puedeEditar && <li className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200"><X size={11} /></span>{t('quita un paso opcional; con + vuelve al flujo')}</li>}
                </ul>
              </div>
            ) : (
              <div className="p-5">
                <div className="flex items-start gap-3">
                  {Ic && c && <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.icono}`}><Ic size={19} /></div>}
                  <div className="min-w-0 flex-1">
                    {c && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c.chip}`}>{t(c.etiqueta)}</span>}
                    <p className="mt-1 text-base font-bold text-slate-800">{elegido.titulo}</p>
                  </div>
                  <button type="button" onClick={() => setSel(null)} aria-label={t('Cerrar')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
                </div>
                {elegido.explicacion && <div className="mt-3 text-sm leading-6 text-slate-600">{elegido.explicacion}</div>}
                {elegido.opcional && (
                  <label className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 ${elegido.opcional.activo ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
                    <span className="text-sm font-semibold text-slate-700">{elegido.opcional.activo ? t('Este paso está en el flujo') : t('Este paso está quitado')}</span>
                    <button type="button" role="switch" aria-checked={elegido.opcional.activo} disabled={!puedeEditar}
                      onClick={() => elegido.opcional!.cambiar(!elegido.opcional!.activo)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${elegido.opcional.activo ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${elegido.opcional.activo ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                )}
                {elegido.ajustes && (!elegido.opcional || elegido.opcional.activo) && (
                  <fieldset disabled={!puedeEditar} className="mt-5 space-y-4 border-t border-slate-100 pt-4">{elegido.ajustes}</fieldset>
                )}
                {!elegido.ajustes && !elegido.opcional && (
                  <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{t('Este paso es fijo: no tiene ajustes.')}</p>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Piezas de formulario para los ajustes de cada paso ─────────────────────
export const campoCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-600/15 disabled:bg-slate-50';

export function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-600">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-[11px] leading-4 text-slate-400">{ayuda}</span>}
    </label>
  );
}

/** Lista editable, una entrada por línea. */
export function CampoLista({ etiqueta, ayuda, valor, onChange, placeholder }: { etiqueta: string; ayuda?: React.ReactNode; valor: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [texto, setTexto] = useState(valor.join('\n'));
  useEffect(() => { if (texto.split('\n').map((s) => s.trim()).filter(Boolean).join('\n') !== valor.join('\n')) setTexto(valor.join('\n')); }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Campo etiqueta={etiqueta} ayuda={ayuda}>
      <textarea rows={4} className={`${campoCls} font-mono text-xs`} value={texto} placeholder={placeholder}
        onChange={(e) => { setTexto(e.target.value); onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean)); }} />
    </Campo>
  );
}

/** Asunto y cuerpo de un correo, con las variables que se pueden insertar. */
export function CampoCorreo({ asunto, cuerpo, onAsunto, onCuerpo, variables, phAsunto, phCuerpo }: {
  asunto: string; cuerpo: string; onAsunto: (v: string) => void; onCuerpo: (v: string) => void;
  variables: { clave: string; desc: string }[]; phAsunto?: string; phCuerpo?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const insertar = (v: string) => {
    const el = ref.current;
    if (!el) { onCuerpo(`${cuerpo}${v}`); return; }
    const a = el.selectionStart ?? cuerpo.length, b = el.selectionEnd ?? cuerpo.length;
    onCuerpo(cuerpo.slice(0, a) + v + cuerpo.slice(b));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + v.length, a + v.length); });
  };
  return (
    <div className="space-y-3">
      <Campo etiqueta={t('Asunto')}><input className={campoCls} value={asunto} placeholder={phAsunto} onChange={(e) => onAsunto(e.target.value)} /></Campo>
      <Campo etiqueta={t('Mensaje')}><textarea ref={ref} rows={8} className={campoCls} value={cuerpo} placeholder={phCuerpo} onChange={(e) => onCuerpo(e.target.value)} /></Campo>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-slate-500">{t('Datos que se rellenan solos (pulsa para insertar):')}</p>
        <div className="flex flex-wrap gap-1.5">
          {variables.map((v) => (
            <button key={v.clave} type="button" onClick={() => insertar(`{${v.clave}}`)} title={v.desc}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700 hover:border-red-300 hover:bg-red-50" data-sin-traducir>
              {`{${v.clave}}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
