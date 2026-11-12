import React, { useEffect, useState } from 'react';
import { t } from '../../lib/i18n';

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
