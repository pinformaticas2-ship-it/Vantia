import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Braces, ChevronDown, Copy, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { aviso, confirmar } from '../lib/avisos';
import { t } from '../lib/i18n';

// ── Ajustes → Mi Despacho → Variables de documentos (25/11/2026) ─────────────
// Las variables son los «Campos» de las plantillas Word («Empresa_Nombre»,
// «Contrarios_Nombre»...). Aquí se ve de dónde saca Vantia cada una y el
// despacho puede desactivarla, darle un valor fijo o crear las suyas.
// Backend: routes/plantillas.ts (/api/plantillas/variables) y resolverValor.

type Modo = 'auto' | 'fijo' | 'expediente';
interface Variable {
  clave: string; nombre: string; etiqueta: string; grupo: string;
  tipo: 'basica' | 'expediente' | 'propia';
  automatica: boolean; despacho: boolean; imagen: boolean; actual: string | null;
  activa: boolean; modo: Modo; valor: string;
  /** En cuántas plantillas tiene un ajuste propio (Ajustar esta plantilla). */
  enPlantillas?: number;
}

type Filtro = 'despacho' | 'todas' | 'cambiadas' | 'desactivadas';
const FILTROS: [Filtro, string][] = [
  ['despacho', 'Del despacho'], ['cambiadas', 'Cambiadas'], ['desactivadas', 'Desactivadas'], ['todas', 'Todas'],
];
const PROPIAS = 'Variables del despacho';
const MAX_FILAS = 150;

const nombreGrupo = (g: string) => g.split(' › ').map((p) => t(p)).join(' › ');
const cambiada = (v: Variable) => v.tipo === 'propia' || !v.activa || v.modo !== 'auto' || (v.enPlantillas || 0) > 0;

/** De dónde sale hoy la variable, en una frase. */
function origen(v: Variable): { texto: string; valor?: string; tono: string } {
  if (!v.activa) return { texto: t('Desactivada: Vantia no la rellena'), tono: 'text-slate-400' };
  if (v.modo === 'fijo') return { texto: t('Valor fijo:'), valor: v.valor || t('(vacío)'), tono: 'text-sky-700' };
  if (v.modo === 'expediente') return { texto: t('Se rellena en cada expediente (pestaña Datos para documentos)'), tono: 'text-violet-700' };
  if (v.imagen) return { texto: v.actual ? t('El logo de Mi Despacho') : t('Falta el logo en Mi Despacho'), tono: v.actual ? 'text-emerald-700' : 'text-amber-700' };
  if (v.despacho) return v.actual
    ? { texto: t('De Mi Despacho:'), valor: v.actual, tono: 'text-emerald-700' }
    : { texto: t('Vacía: complétala en Mi Despacho o dale un valor fijo'), tono: 'text-amber-700' };
  if (v.automatica) return { texto: t('Sale sola de las fichas (expediente, cliente, contrario, juzgado…)'), tono: 'text-emerald-700' };
  return { texto: t('Se escribe en cada expediente'), tono: 'text-slate-500' };
}

export default function VariablesDocumentos() {
  const { getToken } = useAuth();
  const [vars, setVars] = useState<Variable[] | null>(null);
  const [puede, setPuede] = useState(false);
  const [abierta, setAbierta] = useState(false);
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('despacho');
  const [grupos, setGrupos] = useState<Set<string>>(new Set([PROPIAS, 'Empresa']));
  const [editando, setEditando] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await apiFetch('/api/plantillas/variables', { getToken });
      if (r?.success === false) throw new Error(r.error);
      setVars(r.data.variables);
      setPuede(Boolean(r.data.canManage));
    } catch (e: any) { aviso.error(e?.message || t('No se pudieron cargar las variables.')); setVars([]); }
  }, [getToken]);
  useEffect(() => { if (abierta && !vars) void cargar(); }, [abierta, vars, cargar]);

  const guardar = async (v: Variable, cambios: Partial<Pick<Variable, 'activa' | 'modo' | 'valor' | 'etiqueta'>>, ok?: string) => {
    setOcupado(v.clave);
    try {
      const r = await apiFetch(`/api/plantillas/variables/${encodeURIComponent(v.clave)}`, {
        method: 'PUT', getToken, body: JSON.stringify({ nombre: v.nombre, ...cambios }),
      });
      if (r?.success === false) throw new Error(r.error);
      setVars((p) => (p || []).map((x) => (x.clave === v.clave ? { ...x, ...cambios } : x)));
      if (ok) aviso.ok(ok);
      return true;
    } catch (e: any) { aviso.error(e?.message || t('No se pudo guardar la variable.')); return false; }
    finally { setOcupado(null); }
  };

  const borrar = async (v: Variable) => {
    if (!(await confirmar({
      titulo: t('Borrar la variable «{nombre}»', { nombre: v.nombre }),
      mensaje: t('Las plantillas que la usen la dejarán sin rellenar. Lo ya escrito en los expedientes no se borra.'),
      confirmar: t('Borrar'),
    }))) return;
    setOcupado(v.clave);
    try {
      const r = await apiFetch(`/api/plantillas/variables/${encodeURIComponent(v.clave)}`, { method: 'DELETE', getToken });
      if (r?.success === false) throw new Error(r.error);
      setVars((p) => (p || []).filter((x) => x.clave !== v.clave));
      setEditando(null);
    } catch (e: any) { aviso.error(e?.message || t('No se pudo borrar la variable.')); }
    finally { setOcupado(null); }
  };

  const copiar = (v: Variable) => {
    const texto = `«${v.nombre}»`;
    navigator.clipboard?.writeText(texto).then(() => aviso.ok(t('Copiada: pégala en la plantilla de Word')), () => aviso.error(texto));
  };

  const texto = q.trim().toLowerCase();
  const visibles = useMemo(() => (vars || []).filter((v) => {
    if (texto) return v.etiqueta.toLowerCase().includes(texto) || v.nombre.toLowerCase().includes(texto) || v.grupo.toLowerCase().includes(texto);
    if (filtro === 'despacho') return v.tipo === 'propia' || v.despacho;
    if (filtro === 'cambiadas') return cambiada(v);
    if (filtro === 'desactivadas') return !v.activa;
    return true;
  }), [vars, texto, filtro]);
  const porGrupo = useMemo(() => {
    const m = new Map<string, Variable[]>();
    for (const v of visibles) { if (!m.has(v.grupo)) m.set(v.grupo, []); m.get(v.grupo)!.push(v); }
    return [...m.entries()];
  }, [visibles]);
  const nCambiadas = (vars || []).filter(cambiada).length;

  return (
    <section className="mt-5 bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50"><Braces size={20} className="text-red-600" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-slate-800">{t('Variables de documentos')}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {t('Son los campos entre « » de las plantillas Word, como «Empresa_Nombre». Mira de dónde sale cada una, desactívala, dale un valor fijo o crea las vuestras.')}
          </p>
        </div>
        <button type="button" onClick={() => setAbierta((a) => !a)}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          {abierta ? t('Ocultar') : t('Ver variables')}
          <ChevronDown size={14} className={`transition-transform ${abierta ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {abierta && (
        !vars ? <div className="py-8 flex justify-center text-slate-400"><Loader2 size={18} className="animate-spin" /></div> : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Buscar una variable…')}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-sm outline-none focus:border-red-300" />
              </div>
              {puede && (
                <button type="button" onClick={() => setNueva(true)}
                  className="h-9 px-3 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 inline-flex items-center gap-1.5">
                  <Plus size={14} />{t('Nueva variable')}</button>
              )}
            </div>
            {!texto && (
              <div className="flex flex-wrap gap-1.5">
                {FILTROS.map(([f, l]) => (
                  <button key={f} type="button" onClick={() => setFiltro(f)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold border ${filtro === f ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                    {t(l)}{f === 'cambiadas' && nCambiadas > 0 ? ` (${nCambiadas})` : ''}
                  </button>
                ))}
              </div>
            )}
            {!puede && <p className="text-xs text-slate-500">{t('Solo el propietario o un administrador pueden cambiar las variables.')}</p>}

            {porGrupo.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                {texto ? t('Ninguna variable coincide.') : filtro === 'cambiadas' ? t('Todavía no habéis cambiado ninguna variable: todas salen como vienen.') : t('No hay variables aquí.')}
              </p>
            )}

            {porGrupo.map(([g, lista]) => {
              const abierto = !!texto || grupos.has(g);
              return (
                <div key={g} className="rounded-xl border border-slate-200">
                  <button type="button" onClick={() => setGrupos((p) => { const s = new Set(p); s.has(g) ? s.delete(g) : s.add(g); return s; })}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
                    <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${abierto ? '' : '-rotate-90'}`} />
                    <span className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-800">{nombreGrupo(g)}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{lista.length}</span>
                  </button>
                  {abierto && (
                    <div className="divide-y divide-slate-100 border-t border-slate-100">
                      {lista.slice(0, MAX_FILAS).map((v) => (
                        <Fila key={v.clave} v={v} puede={puede} ocupado={ocupado === v.clave}
                          editando={editando === v.clave} onEditar={() => setEditando(editando === v.clave ? null : v.clave)}
                          onGuardar={async (c) => { if (await guardar(v, c, t('Variable guardada'))) setEditando(null); }}
                          onActiva={(a) => void guardar(v, { activa: a })}
                          onBorrar={() => void borrar(v)} onCopiar={() => copiar(v)} />
                      ))}
                      {lista.length > MAX_FILAS && <p className="px-3 py-2 text-xs text-slate-400">{t('Hay más: usa el buscador.')}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {nueva && <NuevaVariable onCerrar={() => setNueva(false)} onCreada={async () => { setNueva(false); setFiltro('despacho'); setGrupos((p) => new Set(p).add(PROPIAS)); await cargar(); }} />}
    </section>
  );
}

function Fila({ v, puede, ocupado, editando, onEditar, onGuardar, onActiva, onBorrar, onCopiar }: {
  v: Variable; puede: boolean; ocupado: boolean; editando: boolean;
  onEditar: () => void; onGuardar: (c: Partial<Variable>) => void; onActiva: (a: boolean) => void;
  onBorrar: () => void; onCopiar: () => void;
}) {
  const o = origen(v);
  const propia = v.tipo === 'propia';
  const [modo, setModo] = useState<Modo>(v.modo);
  const [valor, setValor] = useState(v.valor || (v.modo === 'auto' && v.actual && !v.imagen ? v.actual : ''));
  const [etiqueta, setEtiqueta] = useState(v.etiqueta);
  useEffect(() => { if (editando) { setModo(v.modo); setValor(v.valor || (v.modo === 'auto' && v.actual && !v.imagen ? v.actual : '')); setEtiqueta(v.etiqueta); } }, [editando, v]);

  const opciones: [Modo, string][] = propia
    ? [['fijo', 'Valor fijo para todos los documentos'], ['expediente', 'Se rellena en cada expediente']]
    : [['auto', v.automatica || v.despacho ? 'Automático (de Vantia)' : 'Normal (se escribe en cada expediente)'], ['fijo', 'Valor fijo para todos los documentos']];

  return (
    <div className={`px-3 py-2.5 ${v.activa ? '' : 'bg-slate-50/60'}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`text-sm font-medium ${v.activa ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{v.etiqueta}</span>
            <button type="button" onClick={onCopiar} title={t('Copiar para pegarla en Word')}
              className="inline-flex max-w-full items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-px font-mono text-[11px] text-slate-500 hover:text-slate-800 hover:border-slate-300">
              <span className="truncate">«{v.nombre}»</span><Copy size={10} className="shrink-0" />
            </button>
          </div>
          <p className={`mt-0.5 text-xs ${o.tono} break-words`}>
            {o.texto}{o.valor !== undefined && <> <span className="font-semibold">{o.valor.length > 120 ? o.valor.slice(0, 120) + '…' : o.valor}</span></>}
          </p>
          {(v.enPlantillas || 0) > 0 && (
            <p className="mt-0.5 text-[11px] text-violet-600">{v.enPlantillas === 1 ? t('Distinta en 1 plantilla (se cambia al revisar esa plantilla)') : t('Distinta en {n} plantillas (se cambia al revisar cada plantilla)', { n: v.enPlantillas })}</p>
          )}
        </div>
        {puede && (
          <div className="shrink-0 flex items-center gap-1.5">
            {ocupado && <Loader2 size={13} className="animate-spin text-slate-400" />}
            <button type="button" onClick={onEditar} title={t('Cambiar')}
              className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"><Pencil size={13} /></button>
            <button type="button" role="switch" aria-checked={v.activa} disabled={ocupado}
              title={v.activa ? t('Activa: pulsa para desactivarla') : t('Desactivada: pulsa para activarla')}
              onClick={() => onActiva(!v.activa)}
              className={`relative h-5 w-9 rounded-full transition-colors ${v.activa ? 'bg-emerald-500' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${v.activa ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>
        )}
      </div>

      {editando && puede && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
          {propia && (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('Nombre que se ve')}</span>
              <input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} maxLength={150}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-red-300" />
            </label>
          )}
          <div className="flex flex-col gap-1.5">
            {opciones.map(([m, l]) => (
              <label key={m} className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input type="radio" checked={modo === m} onChange={() => setModo(m)} className="accent-red-600" />{t(l)}
              </label>
            ))}
          </div>
          {modo === 'fijo' && (
            <textarea value={valor} onChange={(e) => setValor(e.target.value)} rows={Math.min(6, Math.max(2, valor.split('\n').length))}
              placeholder={t('El texto que saldrá en todos los documentos')}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-red-300" />
          )}
          {modo === 'fijo' && !propia && (v.automatica || v.despacho) && (
            <p className="text-xs text-slate-500">{t('Este valor manda sobre lo que tenga Vantia en sus fichas, en todos los expedientes.')}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {propia && (
              <button type="button" onClick={onBorrar} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700">
                <Trash2 size={12} />{t('Borrar variable')}</button>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onEditar} className="px-3 py-1.5 text-xs font-semibold text-slate-600 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">{t('Cancelar')}</button>
              <button type="button" disabled={ocupado}
                onClick={() => onGuardar({ modo, valor: modo === 'fijo' ? valor : '', ...(propia ? { etiqueta: etiqueta.trim() || v.etiqueta } : {}) })}
                className="px-3 py-1.5 text-xs font-bold text-white rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60">{t('Guardar')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NuevaVariable({ onCerrar, onCreada }: { onCerrar: () => void; onCreada: () => void }) {
  const { getToken } = useAuth();
  const [etiqueta, setEtiqueta] = useState('');
  const [nombre, setNombre] = useState('');
  const [tocado, setTocado] = useState(false);
  const [modo, setModo] = useState<'fijo' | 'expediente'>('fijo');
  const [valor, setValor] = useState('');
  const [guardando, setGuardando] = useState(false);
  // El nombre para Word se propone a partir del nombre visible.
  const sugerido = (s: string) => {
    const n = s.normalize('NFC').trim().replace(/[«»<>{}"'\\/]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
    return n && !n.includes('_') ? `Propio_${n}` : n;
  };
  const final = sugerido(tocado ? nombre : etiqueta);

  const crear = async () => {
    if (!final) return;
    setGuardando(true);
    try {
      const r = await apiFetch('/api/plantillas/variables', { method: 'POST', getToken, body: JSON.stringify({ nombre: final, etiqueta, modo, valor }) });
      if (r?.success === false) throw new Error(r.error);
      aviso.ok(t('Variable creada: escribe «{nombre}» en la plantilla', { nombre: r.data.nombre }));
      onCreada();
    } catch (e: any) { aviso.error(e?.message || t('No se pudo crear la variable.')); }
    finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCerrar}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-bold text-slate-800">{t('Nueva variable')}</h4>
            <p className="text-xs text-slate-500 mt-0.5">{t('Para datos que Vantia no guarda: un horario, una cláusula que repetís, el nombre del juez…')}</p>
          </div>
          <button type="button" onClick={onCerrar} className="h-8 w-8 shrink-0 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"><X size={16} /></button>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('Nombre')}</span>
          <input autoFocus value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} maxLength={150} placeholder={t('p. ej. Horario de atención')}
            className="h-9 rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:border-red-300" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('Cómo se escribe en Word')}</span>
          <div className="flex items-center gap-1 font-mono text-sm">
            <span className="text-slate-400">«</span>
            <input value={tocado ? nombre : final} onChange={(e) => { setTocado(true); setNombre(e.target.value); }}
              className="h-9 flex-1 min-w-0 rounded-lg border border-slate-200 px-2.5 outline-none focus:border-red-300" />
            <span className="text-slate-400">»</span>
          </div>
          {final && <span className="text-[11px] text-slate-500">{t('En la plantilla:')} <b className="font-mono">«{final}»</b></span>}
        </label>
        <div className="flex flex-col gap-1.5">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="radio" checked={modo === 'fijo'} onChange={() => setModo('fijo')} className="accent-red-600" />{t('Valor fijo para todos los documentos')}</label>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="radio" checked={modo === 'expediente'} onChange={() => setModo('expediente')} className="accent-red-600" />{t('Se rellena en cada expediente')}</label>
        </div>
        {modo === 'fijo' ? (
          <textarea value={valor} onChange={(e) => setValor(e.target.value)} rows={3} placeholder={t('El texto que saldrá en todos los documentos')}
            className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-red-300" />
        ) : (
          <p className="text-xs text-slate-500">{t('Saldrá en la pestaña «Datos para documentos» de cada expediente para rellenarla allí.')}</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50">{t('Cancelar')}</button>
          <button type="button" onClick={crear} disabled={!final || guardando}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-xl">
            {guardando && <Loader2 size={14} className="animate-spin" />}{t('Crear variable')}</button>
        </div>
      </div>
    </div>
  );
}
