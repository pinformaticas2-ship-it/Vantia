import { t } from '../lib/i18n';

// ── Tipo de campo de las variables propias "de cada expediente" (26/11/2026) ──
// El despacho elige cómo se escribe la variable en cada expediente: texto,
// fecha, importe, una lista de opciones, Sí/No… y un valor por defecto (que
// puede ser una fórmula). Se usa en Ajustes → Variables de documentos
// (EditorFormato) y donde se rellena: Datos para documentos y la revisión
// antes de generar (InputSegunFormato). Backend: normalizarFormato.

export type TipoCampo = 'texto' | 'texto_largo' | 'fecha' | 'numero' | 'importe' | 'opciones' | 'si_no';
export interface FormatoVariable { tipo: TipoCampo; opciones?: string[]; defecto?: string; ayuda?: string }

export const TIPOS: [TipoCampo, string][] = [
  ['texto', 'Texto corto'],
  ['texto_largo', 'Texto largo (varias líneas)'],
  ['fecha', 'Fecha'],
  ['numero', 'Número'],
  ['importe', 'Importe en euros'],
  ['opciones', 'Lista de opciones'],
  ['si_no', 'Sí o No'],
];

const campo = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-red-300';

/** Ajustes: elegir el tipo, las opciones, el valor por defecto y la ayuda. */
export function EditorFormato({ formato, onChange }: { formato: FormatoVariable | null | undefined; onChange: (f: FormatoVariable) => void }) {
  const f: FormatoVariable = formato || { tipo: 'texto' };
  const set = (c: Partial<FormatoVariable>) => onChange({ ...f, ...c });
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">{t("Cómo se rellena en cada expediente")}</p>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">{t("Tipo de dato")}</span>
        <select value={f.tipo} onChange={(e) => set({ tipo: e.target.value as TipoCampo })} className={`${campo} h-9`}>
          {TIPOS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
        </select>
      </label>
      {f.tipo === 'opciones' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-slate-600">{t("Opciones (una por línea)")}</span>
          <textarea value={(f.opciones || []).join('\n')} rows={Math.min(8, Math.max(3, (f.opciones || []).length + 1))}
            onChange={(e) => set({ opciones: e.target.value.split('\n') })}
            placeholder={t("Juicio verbal\nJuicio ordinario\nMonitorio")}
            className={`${campo} py-1.5`} />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">{t("Valor por defecto (opcional)")}</span>
        <input value={f.defecto || ''} onChange={(e) => set({ defecto: e.target.value })}
          placeholder={t("Un texto, o una fórmula como {HOY()} o {Cliente_Principal_Población}")}
          className={`${campo} h-9 font-mono`} />
        <span className="text-[11px] text-slate-500">{t("Sale si en el expediente no se ha escrito nada. Con { } se calcula con los datos del expediente.")}</span>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-slate-600">{t("Ayuda para quien lo rellena (opcional)")}</span>
        <input value={f.ayuda || ''} maxLength={300} onChange={(e) => set({ ayuda: e.target.value })}
          placeholder={t("p. ej. Tal y como aparece en la sentencia")} className={`${campo} h-9`} />
      </label>
    </div>
  );
}

/** dd/mm/aaaa ↔ aaaa-mm-dd (el input de fecha del navegador). */
const aIso = (v: string) => { const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
const deIso = (v: string) => { const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

/** El campo para escribir el valor según su tipo. */
export function InputSegunFormato({ formato, valor, onChange, disabled, placeholder, className = '' }: {
  formato?: FormatoVariable | null; valor: string; onChange: (v: string) => void;
  disabled?: boolean; placeholder?: string; className?: string;
}) {
  const base = `w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:bg-white focus:border-red-300 disabled:opacity-60 ${className}`;
  const tipo = formato?.tipo || 'texto';
  if (tipo === 'fecha' && (!valor || aIso(valor))) {
    return <input type="date" value={aIso(valor)} disabled={disabled} onChange={(e) => onChange(deIso(e.target.value))} className={`${base} h-9`} />;
  }
  if (tipo === 'opciones' || tipo === 'si_no') {
    const ops = tipo === 'si_no' ? ['Sí', 'No'] : (formato?.opciones || []);
    return (
      <select value={valor} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={`${base} h-9`}>
        <option value="">{placeholder || t("— Elegir —")}</option>
        {ops.map((o) => <option key={o} value={o}>{tipo === 'si_no' ? t(o) : o}</option>)}
        {valor && !ops.includes(valor) && <option value={valor}>{valor}</option>}
      </select>
    );
  }
  if (tipo === 'texto_largo') {
    return <textarea value={valor} disabled={disabled} placeholder={placeholder} rows={Math.min(6, Math.max(2, valor.split('\n').length))}
      onChange={(e) => onChange(e.target.value)} className={`${base} py-1.5`} />;
  }
  if (tipo === 'numero' || tipo === 'importe') {
    return (
      <div className="relative">
        <input value={valor} disabled={disabled} inputMode="decimal" placeholder={placeholder || (tipo === 'importe' ? '1.234,50' : '')}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,\- ]/g, ''))} className={`${base} h-9 ${tipo === 'importe' ? 'pr-7' : ''}`} />
        {tipo === 'importe' && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>}
      </div>
    );
  }
  return <input value={valor} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${base} h-9`} />;
}
