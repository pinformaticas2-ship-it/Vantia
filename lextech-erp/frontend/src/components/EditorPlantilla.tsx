import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/clerk-react';
import { AlertTriangle, Eraser, Loader2, Search, Sparkles, Wand2, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { aviso } from '../lib/avisos';
import { t } from '../lib/i18n';
import EditorFormula from './EditorFormula';
import { refVariable, traducirErrorFormula } from '../lib/formulasVariables';

// ── Editor de una plantilla (Ajustes → Plantillas del despacho, 25/11/2026) ──
// A la izquierda el texto del documento con sus variables «Grupo_Campo»; se
// selecciona un trozo y se convierte en variable (se guarda en el Word de la
// carpeta de Drive/Dropbox). A la derecha, con qué se rellena cada variable en
// esta plantilla. Backend: routes/plantillas.ts (/editor, /editor/texto,
// /variables-plantilla).

type Estado = 'on' | 'off' | 'fijo' | 'dato' | 'formula';
interface Campo {
  nombre: string; clave: string; etiqueta: string; grupo: string;
  conoceVantia: boolean; imagen: boolean;
  general: { activa: boolean; modo: string; valor: string; propia: boolean } | null;
  enPlantilla: { estado: Estado; valor: string } | null;
}
interface Parrafo { parte: string; i: number; texto: string }
interface Datos {
  ref: string; nombre: string; ext: string; editable: boolean; motivo: 'integrada' | 'sin_permiso' | null;
  parrafos: Parrafo[]; campos: Campo[];
}
interface VarCatalogo { nombre: string; etiqueta: string; grupo: string; automatica?: boolean; aqui?: boolean }
interface Seleccion { k: number; desde: number; hasta: number; texto: string }

const RE_VAR = /«([^«»\s_]{1,60}_[^«»\s]{1,80})»/g;
const claveDe = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const nombreGrupo = (g: string) => g.split(' › ').map((p) => t(p)).join(' › ');

/** Lo que pasa hoy con la variable si no se toca en esta plantilla. */
function textoGeneral(c: Campo): string {
  const g = c.general;
  if (g && !g.activa) return t("desactivada: se escribe al generar");
  if (g?.modo === 'fijo') return t("valor fijo «{valor}»", { valor: (g.valor || '').slice(0, 40) });
  if (g?.modo === 'expediente') return t("se rellena en cada expediente");
  if (g?.modo === 'formula') return t("con fórmula");
  if (c.imagen) return t("el logo de Mi Despacho");
  return c.conoceVantia ? t("dato de Vantia") : t("se escribe al generar");
}

export default function EditorPlantilla({ refInicial, onCerrar, onCambiada, onPedirPermiso }: {
  refInicial: string;
  onCerrar: () => void;
  /** La plantilla se guardó (y quizá cambió de referencia: un .doc pasa a .docx). */
  onCambiada?: (ref: string) => void;
  onPedirPermiso?: () => void;
}) {
  const { getToken } = useAuth();
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState<string | null>(null);
  const [sel, setSel] = useState<Seleccion | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [todas, setTodas] = useState(true);
  const [activa, setActiva] = useState<string | null>(null); // clave de la variable señalada
  const [quitando, setQuitando] = useState<{ k: number; desde: number; nombre: string } | null>(null);
  const [textoQuitar, setTextoQuitar] = useState('');
  const [catalogo, setCatalogo] = useState<VarCatalogo[] | null>(null);
  const textoRef = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async (ref: string) => {
    try {
      const r = await apiFetch(`/api/plantillas/editor?path=${encodeURIComponent(ref)}`, { getToken });
      if (r?.success === false) throw new Error(r.error);
      setD(normalizar(r.data)); setError('');
    } catch (e: any) { setError(e?.message ? t(e.message) : t("No se pudo abrir la plantilla.")); }
  }, [getToken]);
  useEffect(() => { void cargar(refInicial); }, [cargar, refInicial]);

  const pedirCatalogo = useCallback(async () => {
    if (catalogo) return;
    try {
      const r = await apiFetch('/api/plantillas/variables', { getToken });
      if (r?.success === false) throw new Error(r.error);
      setCatalogo((r.data?.variables || []).filter((v: any) => !v.imagen).map((v: any) => ({ nombre: v.nombre, etiqueta: v.etiqueta || v.nombre, grupo: v.grupo || '', automatica: !!v.automatica || v.tipo === 'propia' })));
    } catch { setCatalogo([]); }
  }, [catalogo, getToken]);

  // ── Selección de texto dentro de un párrafo ───────────────────────────────
  const leerSeleccion = () => {
    if (!d?.editable) return;
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) { return; }
    const r = s.getRangeAt(0);
    const pa = (r.startContainer.parentElement as HTMLElement | null)?.closest('[data-k]') as HTMLElement | null;
    const pb = (r.endContainer.parentElement as HTMLElement | null)?.closest('[data-k]') as HTMLElement | null;
    if (!pa || pa !== pb) { setSel(null); return; }
    const antes = document.createRange();
    antes.selectNodeContents(pa);
    antes.setEnd(r.startContainer, r.startOffset);
    const desde = antes.toString().length;
    const k = Number(pa.dataset.k);
    const texto = d.parrafos[k].texto;
    let a = desde, b = desde + r.toString().length;
    // Sin espacios en los bordes: la variable no se come el espacio de al lado.
    while (a < b && /\s/.test(texto[a])) a++;
    while (b > a && /\s/.test(texto[b - 1])) b--;
    if (b <= a) { setSel(null); return; }
    setSel({ k, desde: a, hasta: b, texto: texto.slice(a, b) });
    setEligiendo(false); setQuitando(null);
  };

  const veces = useMemo(() => {
    if (!sel || !d) return 0;
    let n = 0;
    for (const p of d.parrafos) {
      let i = p.texto.indexOf(sel.texto);
      while (i >= 0) { n++; i = p.texto.indexOf(sel.texto, i + sel.texto.length); }
    }
    return n;
  }, [sel, d]);

  const editarTexto = async (cuerpo: Record<string, unknown>, clave: string) => {
    if (!d) return;
    setGuardando(clave);
    try {
      const r = await apiFetch('/api/plantillas/editor/texto', { method: 'POST', getToken, body: JSON.stringify({ path: d.ref, ...cuerpo }) });
      if (r?.success === false) {
        if (r.code === 'SIN_ESCRITURA') onPedirPermiso?.();
        throw new Error(r.error);
      }
      setD(normalizar(r.data));
      onCambiada?.(r.data.ref);
      return true;
    } catch (e: any) {
      aviso.error(e?.message ? t(e.message) : t("No se pudo guardar la plantilla."));
      if (/ha cambiado/.test(e?.message || '')) void cargar(d.ref);
      return false;
    } finally { setGuardando(null); }
  };

  const marcar = async (nombre: string) => {
    if (!sel || !d) return;
    const p = d.parrafos[sel.k];
    const ok = await editarTexto({ accion: 'marcar', nombre, parte: p.parte, parrafo: p.i, desde: sel.desde, hasta: sel.hasta, esperado: sel.texto, todas: todas && veces > 1 }, 'marcar');
    if (ok) {
      aviso.ok(t("Guardado en la plantilla"));
      setSel(null); setEligiendo(false); window.getSelection()?.removeAllRanges();
      setActiva(claveDe(nombre));
    }
  };

  const quitar = async () => {
    if (!quitando || !d) return;
    const p = d.parrafos[quitando.k];
    const marcador = `«${quitando.nombre}»`;
    const ok = await editarTexto({ accion: 'quitar', texto: textoQuitar, parte: p.parte, parrafo: p.i, desde: quitando.desde, hasta: quitando.desde + marcador.length, esperado: marcador }, 'quitar');
    if (ok) { aviso.ok(t("Variable quitada del texto")); setQuitando(null); setTextoQuitar(''); }
  };

  const ajustar = async (c: Campo, estado: Estado | 'general', valor = '') => {
    if (!d) return;
    setGuardando(c.clave);
    try {
      const r = await apiFetch('/api/plantillas/variables-plantilla', { method: 'PUT', getToken, body: JSON.stringify({ plantilla: d.ref, nombre: c.nombre, estado, valor }) });
      if (r?.success === false) throw new Error(r.error);
      setD((x) => x && ({ ...x, campos: x.campos.map((y) => (y.clave === c.clave ? { ...y, enPlantilla: estado === 'general' ? null : { estado, valor } } : y)) }));
    } catch (e: any) { aviso.error(e?.message ? traducirErrorFormula(e.message) : t("No se pudo guardar la variable.")); }
    finally { setGuardando(null); }
  };

  // Llevar la vista al primer sitio donde sale una variable.
  const verEnTexto = (clave: string) => {
    setActiva(clave);
    const el = textoRef.current?.querySelector(`[data-var="${clave}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const deLaPlantilla = useMemo<VarCatalogo[]>(() => (d?.campos || []).filter((c) => !c.imagen)
    .map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta, grupo: c.grupo, automatica: c.conoceVantia, aqui: true })), [d]);

  const grupos = useMemo(() => {
    const m = new Map<string, Campo[]>();
    for (const c of d?.campos || []) { if (!m.has(c.grupo)) m.set(c.grupo, []); m.get(c.grupo)!.push(c); }
    return [...m];
  }, [d]);

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-2 sm:p-4" onClick={onCerrar}>
      <div className="flex h-full max-h-[94vh] w-full max-w-6xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-slate-100 px-4 pt-4 pb-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-slate-900">{d?.nombre || t("Plantilla")}</p>
            <p className="text-xs text-slate-500">{t("Selecciona un trozo del texto para convertirlo en variable. A la derecha eliges con qué se rellena cada una en esta plantilla.")}</p>
          </div>
          <button type="button" onClick={onCerrar} aria-label={t("Cerrar")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700"><X size={16} /></button>
        </div>

        {d && !d.editable && (
          <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:mx-5">
            <AlertTriangle size={13} className="shrink-0" />
            <span className="min-w-0 flex-1">{d.motivo === 'integrada'
              ? t("Es una plantilla integrada de Vantia (común a todos los despachos): puedes decir con qué se rellena cada variable, pero para cambiar dónde van, copia las plantillas a vuestra carpeta.")
              : t("Vantia no tiene permiso para cambiar archivos en esta carpeta de Google Drive.")}</span>
            {d.motivo === 'sin_permiso' && onPedirPermiso && (
              <button type="button" onClick={onPedirPermiso} className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700">{t("Dar permiso")}</button>
            )}
          </div>
        )}

        {error && <p className="m-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!d && !error && <div className="flex flex-1 items-center justify-center text-sm text-slate-500"><Loader2 size={16} className="mr-2 animate-spin" />{t("Abriendo la plantilla…")}</div>}

        {d && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-5 lg:flex-row lg:overflow-hidden">
            {/* ── Texto del documento ── */}
            <div className="flex min-h-0 flex-col lg:flex-[3]">
              {d.editable && (
                <div className="mb-2 min-h-[44px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  {!sel && !quitando && <p className="text-slate-500">{t("Selecciona con el ratón el texto que debe rellenarse solo (un nombre, una fecha…) o pulsa una variable para quitarla.")}</p>}
                  {sel && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 max-w-full truncate text-slate-700">{t("Texto elegido:")}{" "}<b>«{sel.texto.length > 60 ? sel.texto.slice(0, 60) + '…' : sel.texto}»</b></span>
                      {veces > 1 && (
                        <label className="inline-flex items-center gap-1 text-slate-600">
                          <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />{" "}{t("las {n} veces que aparece", { n: veces })}
                        </label>
                      )}
                      <button type="button" disabled={!!guardando} onClick={() => { setEligiendo(true); void pedirCatalogo(); }}
                        className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                        {guardando === 'marcar' ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}{" "}{t("Convertir en variable")}</button>
                      <button type="button" onClick={() => { setSel(null); setEligiendo(false); }} className="text-slate-500 hover:text-slate-800">{t("Cancelar")}</button>
                    </div>
                  )}
                  {quitando && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-700">{t("Quitar")}{" "}<b>«{quitando.nombre}»</b>{" "}{t("y escribir en su lugar:")}</span>
                      <input value={textoQuitar} onChange={(e) => setTextoQuitar(e.target.value)} placeholder={t("(nada)")}
                        className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-red-300" />
                      <button type="button" disabled={!!guardando} onClick={() => void quitar()}
                        className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 font-semibold text-white disabled:opacity-60">
                        {guardando === 'quitar' ? <Loader2 size={12} className="animate-spin" /> : <Eraser size={12} />}{" "}{t("Quitar")}</button>
                      <button type="button" onClick={() => setQuitando(null)} className="text-slate-500 hover:text-slate-800">{t("Cancelar")}</button>
                    </div>
                  )}
                  {eligiendo && sel && (
                    <ElegirVariable catalogo={catalogo} extra={deLaPlantilla} sugerido={sel.texto} onElegir={(n) => void marcar(n)} />
                  )}
                </div>
              )}
              <div ref={textoRef} onMouseUp={leerSeleccion} onTouchEnd={leerSeleccion}
                className="min-h-[200px] flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] leading-relaxed text-slate-800 lg:min-h-0">
                {d.parrafos.length === 0 && <p className="text-slate-400">{t("La plantilla no tiene texto.")}</p>}
                {d.parrafos.map((p, k) => {
                  const cambiaParte = k === 0 || d.parrafos[k - 1].parte !== p.parte;
                  return (
                    <div key={`${p.parte}:${p.i}`}>
                      {cambiaParte && p.parte !== 'word/document.xml' && (
                        <p className="mt-3 mb-1 border-t border-dashed border-slate-200 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          {/header/.test(p.parte) ? t("Encabezado") : /footer/.test(p.parte) ? t("Pie de página") : t("Notas")}
                        </p>
                      )}
                      <p data-k={k} className={`mb-2 whitespace-pre-wrap ${sel?.k === k ? 'bg-amber-50' : ''}`}>
                        {trozos(p.texto).map((tr, j) => tr.var ? (
                          <span key={j} data-var={claveDe(tr.var)} role="button" tabIndex={0}
                            onMouseUp={(e) => e.stopPropagation()}
                            onClick={() => {
                              setActiva(claveDe(tr.var!)); setSel(null); setEligiendo(false);
                              if (d.editable) { setQuitando({ k, desde: tr.desde, nombre: tr.var! }); setTextoQuitar(''); }
                            }}
                            className={`cursor-pointer rounded px-0.5 font-medium ${activa === claveDe(tr.var) ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-800 hover:bg-violet-200'}`}>
                            {tr.texto}
                          </span>
                        ) : <span key={j}>{tr.texto}</span>)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Variables y con qué se rellenan ── */}
            <div className="flex min-h-0 flex-col lg:flex-[2]">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t("Variables de esta plantilla")}{" "}({d.campos.length})</p>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto lg:pr-1">
                {d.campos.length === 0 && <p className="text-sm text-slate-500">{t("Todavía no tiene variables. Selecciona texto a la izquierda para crear la primera.")}</p>}
                {grupos.map(([g, cs]) => (
                  <div key={g}>
                    <p className="mb-1 text-[11px] font-semibold text-slate-400">{nombreGrupo(g)}</p>
                    <div className="space-y-1.5">
                      {cs.map((c) => (
                        <FilaVariable key={c.clave} c={c} plantillaRef={d.ref} activa={activa === c.clave} guardando={guardando === c.clave}
                          catalogo={catalogo} extra={deLaPlantilla} pedirCatalogo={pedirCatalogo}
                          onVer={() => verEnTexto(c.clave)} onAjustar={(e, v) => void ajustar(c, e, v)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** apiFetch convierte los textos vacíos en null: se devuelven a "". */
function normalizar(d: any): Datos {
  return {
    ...d,
    parrafos: (d.parrafos || []).map((p: any) => ({ ...p, texto: p.texto || '' })),
    campos: (d.campos || []).map((c: any) => ({
      ...c,
      etiqueta: c.etiqueta || c.nombre,
      grupo: c.grupo || 'Otros',
      general: c.general ? { ...c.general, valor: c.general.valor || '', modo: c.general.modo || 'auto' } : null,
      enPlantilla: c.enPlantilla ? { ...c.enPlantilla, valor: c.enPlantilla.valor || '' } : null,
    })),
  };
}

/** Texto del párrafo partido en trozos normales y variables (con su posición). */
function trozos(texto: string): { texto: string; var?: string; desde: number }[] {
  const out: { texto: string; var?: string; desde: number }[] = [];
  let i = 0;
  for (const m of texto.matchAll(RE_VAR)) {
    if (m.index! > i) out.push({ texto: texto.slice(i, m.index), desde: i });
    out.push({ texto: m[0], var: m[1], desde: m.index! });
    i = m.index! + m[0].length;
  }
  if (i < texto.length) out.push({ texto: texto.slice(i), desde: i });
  return out;
}

/** Buscar una variable de Vantia / del despacho, o escribir una nueva. */
function ElegirVariable({ catalogo, extra = [], sugerido, onElegir }: {
  catalogo: VarCatalogo[] | null; extra?: VarCatalogo[]; sugerido?: string; onElegir: (nombre: string) => void;
}) {
  const [q, setQ] = useState('');
  const [nueva, setNueva] = useState(() => (sugerido || '').replace(/[^\p{L}\p{N} ]+/gu, ' ').trim().split(/\s+/).slice(0, 4).join('_'));
  const res = useMemo(() => {
    if (!catalogo) return [];
    // Las de esta plantilla y las que rellena Vantia, delante.
    const vistas = new Set<string>();
    const todas = [...extra, ...catalogo].filter((v) => { const k = claveDe(v.nombre); if (vistas.has(k)) return false; vistas.add(k); return true; });
    const peso = (v: VarCatalogo) => (v.aqui ? 2 : 0) + (v.automatica ? 1 : 0);
    const n = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const palabras = n.split(/s+/).filter(Boolean);
    const hallados = palabras.length
      ? todas.filter((v) => {
        const h = `${v.etiqueta} ${t(v.etiqueta)} ${v.nombre.replace(/_/g, ' ')} ${v.grupo}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        return palabras.every((p) => h.includes(p));
      })
      : todas.filter((v) => v.aqui || v.automatica);
    return hallados.map((v, i) => ({ v, i })).sort((a, b) => peso(b.v) - peso(a.v) || a.i - b.i).map((x) => x.v).slice(0, 60);
  }, [catalogo, extra, q]);
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
      <div className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2">
        <Search size={12} className="text-slate-400" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Busca el dato: nombre del cliente, NIG, fecha…")}
          className="h-8 min-w-0 flex-1 border-0 bg-transparent text-xs shadow-none outline-none ring-0 focus:outline-none focus:ring-0" />
      </div>
      <div className="mt-1.5 max-h-52 overflow-y-auto">
        {!catalogo && <p className="p-2 text-slate-500"><Loader2 size={12} className="mr-1 inline animate-spin" />{t("Cargando…")}</p>}
        {catalogo && res.length === 0 && <p className="p-2 text-slate-500">{t("Nada con ese nombre.")}</p>}
        {res.map((v) => (
          <button key={v.nombre} type="button" onClick={() => onElegir(v.nombre)}
            className="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left hover:bg-slate-50">
            <span className="shrink-0 font-medium text-slate-800">{t(v.etiqueta)}</span>
            {v.automatica && <span className="shrink-0 rounded bg-emerald-50 px-1 text-[10px] font-semibold text-emerald-700">{t("Vantia")}</span>}
            {v.aqui && <span className="shrink-0 rounded bg-violet-50 px-1 text-[10px] font-semibold text-violet-700">{t("en esta plantilla")}</span>}
            <span className="min-w-0 truncate text-[10px] text-slate-400">{nombreGrupo(v.grupo)} · «{v.nombre}»</span>
          </button>
        ))}
      </div>
      {sugerido !== undefined && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-1.5">
          <Sparkles size={12} className="text-violet-500" />
          <span className="text-slate-600">{t("O una variable nueva:")}</span>
          <input value={nueva} onChange={(e) => setNueva(e.target.value)} className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-red-300" />
          <button type="button" disabled={!nueva.trim()} onClick={() => onElegir(nueva.trim())}
            className="rounded-md border border-slate-200 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40">{t("Usar")}</button>
        </div>
      )}
    </div>
  );
}

const OPCIONES: [Estado | 'general', string][] = [
  ['general', 'Como en general'],
  ['dato', 'Con otro dato de Vantia'],
  ['fijo', 'Con un texto fijo'],
  ['formula', 'Con una fórmula'],
  ['off', 'No rellenar (se escribe al generar)'],
  ['on', 'Activa aunque en general no'],
];

function FilaVariable({ c, activa, guardando, catalogo, extra, pedirCatalogo, onVer, onAjustar, plantillaRef }: {
  c: Campo; activa: boolean; guardando: boolean; plantillaRef: string;
  catalogo: VarCatalogo[] | null; extra: VarCatalogo[]; pedirCatalogo: () => void;
  onVer: () => void; onAjustar: (estado: Estado | 'general', valor?: string) => void;
}) {
  const actual: Estado | 'general' = c.enPlantilla?.estado || 'general';
  const [estado, setEstado] = useState<Estado | 'general'>(actual);
  const [valor, setValor] = useState(c.enPlantilla?.estado === 'fijo' ? c.enPlantilla.valor : '');
  const [buscando, setBuscando] = useState(false);
  const [formula, setFormula] = useState(c.enPlantilla?.estado === 'formula' ? c.enPlantilla.valor : `{${refVariable(c.nombre)}}`);
  useEffect(() => { setEstado(c.enPlantilla?.estado || 'general'); }, [c.enPlantilla?.estado]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (activa) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [activa]);
  const opciones = OPCIONES.filter(([k]) => k !== 'on' || c.general?.activa === false || actual === 'on');
  const datoActual = c.enPlantilla?.estado === 'dato' ? c.enPlantilla.valor : '';
  const elegido = [...extra, ...(catalogo || [])].find((v) => claveDe(v.nombre) === claveDe(datoActual));
  const etiquetaDato = elegido ? `${t(elegido.etiqueta)} · ${nombreGrupo(elegido.grupo)}` : '';

  return (
    <div ref={ref} className={`rounded-lg border px-3 py-2 ${activa ? 'border-violet-300 bg-violet-50/40' : 'border-slate-200'}`}>
      <div className="flex items-start gap-2">
        <button type="button" onClick={onVer} className="min-w-0 flex-1 text-left" title={t("Ver dónde está en el texto")}>
          <p className="truncate text-sm font-semibold text-slate-800">{t(c.etiqueta)}</p>
          <p className="truncate text-[11px] text-violet-700">«{c.nombre}»</p>
        </button>
        {guardando && <Loader2 size={13} className="mt-1 shrink-0 animate-spin text-slate-400" />}
      </div>
      {c.imagen ? (
        <p className="mt-1 text-[11px] text-slate-500">{t("Se pone el logo de Mi Despacho.")}</p>
      ) : (
        <>
          <select value={estado} disabled={guardando}
            onChange={(e) => {
              const v = e.target.value as Estado | 'general';
              setEstado(v);
              if (v === 'dato') { setBuscando(true); pedirCatalogo(); }
              else if (v !== 'fijo' && v !== 'formula') { setBuscando(false); onAjustar(v); }
            }}
            className="mt-1.5 h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-red-300">
            {opciones.map(([k, l]) => <option key={k} value={k}>{k === 'general' ? `${t(l)} (${textoGeneral(c)})` : t(l)}</option>)}
          </select>
          {estado === 'dato' && (
            <div className="mt-1.5 text-xs">
              {datoActual && !buscando && (
                <p className="text-slate-600">{t("Se rellena con")}{" "}<b>{etiquetaDato || datoActual}</b>{" "}
                  <button type="button" onClick={() => { setBuscando(true); pedirCatalogo(); }} className="font-semibold text-red-600 hover:underline">{t("Cambiar")}</button></p>
              )}
              {(buscando || !datoActual) && (
                <ElegirVariable catalogo={catalogo} extra={extra.filter((x) => x.nombre !== c.nombre)} onElegir={(n) => { setBuscando(false); onAjustar('dato', n); }} />
              )}
            </div>
          )}
          {estado === 'formula' && (
            <div className="mt-1.5 space-y-1.5">
              <EditorFormula valor={formula} onChange={setFormula} nombre={c.nombre} plantilla={plantillaRef} />
              <div className="flex justify-end">
                <button type="button" disabled={guardando || !formula.trim() || (actual === 'formula' && formula === (c.enPlantilla?.valor ?? ''))} onClick={() => onAjustar('formula', formula)}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40">{t("Guardar fórmula")}</button>
              </div>
            </div>
          )}
          {estado === 'fijo' && (
            <div className="mt-1.5 flex items-start gap-1.5">
              <textarea value={valor} rows={Math.min(4, Math.max(1, valor.split('\n').length))} onChange={(e) => setValor(e.target.value)}
                placeholder={t("El texto que saldrá siempre en esta plantilla")}
                className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-red-300" />
              <button type="button" disabled={guardando || (actual === 'fijo' && valor === (c.enPlantilla?.valor ?? ''))} onClick={() => onAjustar('fijo', valor)}
                className="shrink-0 rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40">{t("Guardar")}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
