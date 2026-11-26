import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { AlertTriangle, BookOpen, Braces, CheckCircle2, ChevronDown, FlaskConical, Loader2, Search, Sigma, Wand2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { idioma, t } from '../lib/i18n';
import { CATEGORIAS, FUNCIONES, RECETAS, dentroDeLlaves, formulaEnIdioma, refVariable, traducirErrorFormula, type CategoriaFuncion, type FuncionFormula } from '../lib/formulasVariables';

// ── Editor de fórmulas de una variable (26/11/2026) ──────────────────────────
// Texto con trozos entre { } que se calculan: «{MAYUSCULAS(Cliente_Principal_Nombre)}».
// Ayuda a escribirla (insertar datos y funciones, recetas, la sintaxis) y la
// prueba en vivo con los datos de un expediente de verdad, sin guardar nada.
// Backend: POST /api/plantillas/variables/probar y services/plantillasFormulas.

interface VarCat { nombre: string; etiqueta: string; grupo: string }
interface Prueba { valor: string | null; error: string | null; pos: number | null; variables: { nombre: string; conocida: boolean; valor: string }[] }

// La lista de variables se pide una vez (son ~1.000 y no cambian al escribir).
let catalogo: Promise<VarCat[]> | null = null;
function cargarCatalogo(getToken: () => Promise<string | null>) {
  if (!catalogo) {
    catalogo = apiFetch('/api/plantillas/variables', { getToken })
      .then((r: any) => (r?.data?.variables || []).map((v: any) => ({ nombre: v.nombre, etiqueta: v.etiqueta, grupo: v.grupo })))
      .catch(() => { catalogo = null; return []; });
  }
  return catalogo;
}
/** Tras crear o borrar variables, que se vuelva a pedir la lista. */
export const olvidarCatalogoFormulas = () => { catalogo = null; };

const nombreFn = (f: FuncionFormula) => (idioma() === 'en' ? f.en : f.nombre);
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function EditorFormula({ valor, onChange, nombre, plantilla, autoFocus }: {
  valor: string;
  onChange: (v: string) => void;
  /** La variable a la que pertenece (para que «su propio nombre» sea su valor de siempre). */
  nombre?: string;
  /** Si es el ajuste de una sola plantilla. */
  plantilla?: string;
  autoFocus?: boolean;
}) {
  const { getToken } = useAuth();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [panel, setPanel] = useState<'datos' | 'funciones' | 'recetas' | 'ayuda' | null>(null);
  const [vars, setVars] = useState<VarCat[] | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CategoriaFuncion>('Texto');
  const [prueba, setPrueba] = useState<Prueba | null>(null);
  const [probando, setProbando] = useState(false);
  const [expedientes, setExpedientes] = useState<{ id: string; etiqueta: string }[] | null>(null);
  const [expediente, setExpediente] = useState('');

  useEffect(() => { if (panel === 'datos' && !vars) void cargarCatalogo(getToken).then(setVars); }, [panel, vars, getToken]);
  useEffect(() => {
    apiFetch('/api/plantillas/variables/expedientes-ejemplo', { getToken })
      .then((r: any) => setExpedientes(r?.data || []))
      .catch(() => setExpedientes([]));
  }, [getToken]);

  // Prueba en vivo (un momento después de dejar de escribir).
  useEffect(() => {
    if (!valor.trim()) { setPrueba(null); return; }
    let vivo = true;
    setProbando(true);
    const h = window.setTimeout(async () => {
      try {
        const r = await apiFetch('/api/plantillas/variables/probar', {
          method: 'POST', getToken,
          body: JSON.stringify({ formula: valor, expedienteId: expediente || null, nombre: nombre || undefined, plantilla: plantilla || undefined }),
        });
        if (vivo && r?.data) setPrueba({ ...r.data, variables: r.data.variables || [] });
      } catch { /* la vista previa no es imprescindible */ }
      finally { if (vivo) setProbando(false); }
    }, 450);
    return () => { vivo = false; window.clearTimeout(h); };
  }, [valor, expediente, nombre, plantilla, getToken]);

  /** Mete un trozo donde está el cursor; fuera de { } lo envuelve en llaves. */
  const insertar = (pieza: string, cursor?: number) => {
    const el = ref.current;
    const ini = el?.selectionStart ?? valor.length, fin = el?.selectionEnd ?? ini;
    const dentro = dentroDeLlaves(valor, ini);
    const txt = dentro ? pieza : `{${pieza}}`;
    onChange(valor.slice(0, ini) + txt + valor.slice(fin));
    const pos = ini + (dentro ? 0 : 1) + (cursor ?? pieza.length) + (cursor === undefined && !dentro ? 1 : 0);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(pos, pos); });
  };
  const insertarFuncion = (f: FuncionFormula) => {
    const el = ref.current;
    const sel = el ? valor.slice(el.selectionStart, el.selectionEnd) : '';
    const n = nombreFn(f);
    // Con algo seleccionado, la función lo envuelve: MAYUSCULAS(lo seleccionado).
    if (sel && dentroDeLlaves(valor, el!.selectionStart)) insertar(`${n}(${sel})`);
    else insertar(`${n}()`, n.length + 1);
    setPanel(null);
  };
  const irAlError = () => {
    if (prueba?.pos == null || !ref.current) return;
    ref.current.focus();
    ref.current.setSelectionRange(prueba.pos, Math.min(valor.length, prueba.pos + 1));
  };

  const texto = sinTildes(q.trim());
  const varsVisibles = useMemo(() => (vars || [])
    .filter((v) => !texto || sinTildes(`${v.etiqueta} ${v.nombre} ${v.grupo}`).includes(texto))
    .slice(0, 80), [vars, texto]);
  const fnVisibles = texto
    ? FUNCIONES.filter((f) => sinTildes(`${f.nombre} ${f.en} ${t(f.desc)}`).includes(texto))
    : FUNCIONES.filter((f) => f.cat === cat);

  const boton = (k: typeof panel, icono: JSX.Element, label: string) => (
    <button type="button" onClick={() => { setPanel(panel === k ? null : k); setQ(''); }}
      className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-semibold ${panel === k ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
      {icono}{label}<ChevronDown size={12} className={`transition-transform ${panel === k ? 'rotate-180' : ''}`} />
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {boton('datos', <Braces size={13} />, t("Insertar dato"))}
        {boton('funciones', <Sigma size={13} />, t("Insertar función"))}
        {boton('recetas', <Wand2 size={13} />, t("Recetas"))}
        {boton('ayuda', <BookOpen size={13} />, t("Cómo se escribe"))}
      </div>

      {panel && (
        <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          {(panel === 'datos' || panel === 'funciones') && (
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={panel === 'datos' ? t("Buscar un dato (nombre, NIF, juzgado…)") : t("Buscar una función…")}
                className="h-8 w-full rounded-md border border-slate-200 pl-8 pr-2 text-xs outline-none focus:border-red-300" />
            </div>
          )}
          {panel === 'datos' && (
            <div className="max-h-60 overflow-y-auto">
              {!vars ? <div className="py-4 flex justify-center"><Loader2 size={16} className="animate-spin text-slate-400" /></div>
                : varsVisibles.length === 0 ? <p className="px-2 py-3 text-xs text-slate-500">{t("Ningún dato coincide.")}</p>
                : varsVisibles.map((v) => (
                  <button key={v.nombre} type="button" onClick={() => { insertar(refVariable(v.nombre)); setPanel(null); }}
                    className="w-full flex items-baseline gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">{t(v.etiqueta)} <span className="font-normal text-slate-400">· {v.grupo.split(' › ').map((p) => t(p)).join(' › ')}</span></span>
                    <span className="shrink-0 max-w-[45%] truncate font-mono text-[10px] text-violet-700">{v.nombre}</span>
                  </button>
                ))}
            </div>
          )}
          {panel === 'funciones' && (
            <>
              {!texto && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {CATEGORIAS.map((c) => (
                    <button key={c} type="button" onClick={() => setCat(c)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${cat === c ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{t(c)}</button>
                  ))}
                </div>
              )}
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                {fnVisibles.map((f) => (
                  <button key={f.nombre} type="button" onClick={() => insertarFuncion(f)} className="w-full px-2 py-1.5 text-left hover:bg-slate-50">
                    <p className="font-mono text-xs"><b className="text-red-700">{nombreFn(f)}</b><span className="text-slate-500">({t(f.args)})</span></p>
                    <p className="text-[11px] text-slate-600">{t(f.desc)}</p>
                    <p className="text-[11px] text-slate-400 truncate"><span className="font-mono">{formulaEnIdioma(f.ejemplo)}</span> → <span className="text-emerald-700">{f.resultado}</span></p>
                  </button>
                ))}
              </div>
            </>
          )}
          {panel === 'recetas' && (
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {RECETAS.map((r) => (
                <button key={r.titulo} type="button" onClick={() => { const fx = formulaEnIdioma(r.formula); onChange(valor.trim() ? `${valor} ${fx}` : fx); setPanel(null); }}
                  className="w-full px-2 py-1.5 text-left hover:bg-slate-50">
                  <p className="text-xs font-semibold text-slate-800">{t(r.titulo)}</p>
                  <p className="font-mono text-[11px] text-slate-500 break-all">{formulaEnIdioma(r.formula)}</p>
                </button>
              ))}
            </div>
          )}
          {panel === 'ayuda' && <AyudaSintaxis />}
        </div>
      )}

      <textarea ref={ref} value={valor} autoFocus={autoFocus} spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(8, Math.max(3, valor.split('\n').length + 1))}
        placeholder={`${t("p. ej.")} ${formulaEnIdioma('{DON_DONA(Cliente_Principal_Sexo)} {NOMPROPIO(Cliente_Principal_Nombre)}')}`}
        className={`w-full rounded-lg border bg-white px-2.5 py-2 font-mono text-[13px] leading-relaxed outline-none ${prueba?.error ? 'border-rose-300 focus:border-rose-400' : 'border-slate-200 focus:border-red-300'}`} />

      {/* Resultado */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <FlaskConical size={13} className="text-slate-500" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("Así saldrá")}</span>
          <select value={expediente} onChange={(e) => setExpediente(e.target.value)}
            className="ml-auto h-7 max-w-full min-w-0 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] text-slate-700 outline-none sm:max-w-[60%]">
            <option value="">{t("Sin expediente (solo datos del despacho)")}</option>
            {(expedientes || []).map((x) => <option key={x.id} value={x.id}>{x.etiqueta}</option>)}
          </select>
        </div>
        {!valor.trim() ? <p className="text-xs text-slate-400">{t("Escribe la fórmula o elige una receta.")}</p>
          : probando && !prueba ? <Loader2 size={14} className="animate-spin text-slate-400" />
          : prueba?.error ? (
            <p className="flex items-start gap-1.5 text-xs text-rose-700">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{traducirErrorFormula(prueba.error)}{prueba.pos != null && <> · <button type="button" onClick={irAlError} className="font-semibold underline">{t("ver dónde")}</button></>}</span>
            </p>
          ) : prueba ? (
            <p className={`whitespace-pre-wrap break-words rounded-md border bg-white px-2.5 py-1.5 text-sm ${prueba.valor ? 'border-emerald-200 text-slate-800' : 'border-amber-200 text-amber-700'}`}>
              {prueba.valor || t("(sale vacía con estos datos)")}{probando && <Loader2 size={11} className="ml-1.5 inline animate-spin text-slate-400" />}
            </p>
          ) : null}
        {prueba && !prueba.error && prueba.variables.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {prueba.variables.map((v) => (
              <span key={v.nombre} title={v.conocida ? (v.valor || t('vacía')) : t("Vantia no conoce esta variable: revisa el nombre")}
                className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-px text-[10px] ${v.conocida ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
                {v.conocida ? <CheckCircle2 size={9} className="shrink-0" /> : <AlertTriangle size={9} className="shrink-0" />}
                <span className="font-mono truncate">{v.nombre}</span>
                {v.conocida && <span className="truncate text-emerald-600">= {v.valor ? (v.valor.length > 30 ? v.valor.slice(0, 30) + '…' : v.valor) : t('vacía')}</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AyudaSintaxis() {
  const filas: [string, string][] = [
    ['Hola {Cliente_Principal_Nombre}', "Fuera de las llaves el texto sale tal cual; dentro, se calcula."],
    ['{«Empresa_NIF/CIF»}', "Si el nombre de la variable lleva signos (/ . -), va entre « »."],
    ['{"texto"}  {1500}  {21.5}', "Textos entre comillas; números con punto decimal."],
    ['{MAYUSCULAS(Cliente_Principal_Nombre)}', "Funciones: el nombre y los datos entre paréntesis, separados por ;"],
    ['{Cliente_Principal_Nombre & " (" & «Cliente_Principal_NIF/CIF» & ")"}', "& une textos."],
    ['{Datos_del_Expediente_Cuantía * 2}', "+ - * / hacen cuentas (entiende «1.234,50 €»)."],
    ['{SI(Datos_del_Expediente_Cuantía > 6000; "ordinario"; "verbal")}', "Comparar: =  <>  >  <  >=  <= (sin mirar mayúsculas ni tildes)."],
    ['{SI(Y(A_B = "x"; NO(VACIO(C_D))); "sí"; "no")}', "Las funciones se pueden meter unas dentro de otras."],
    ['{{ }}', "Para escribir una llave en el documento, ponla dos veces."],
  ];
  return (
    <div className="max-h-72 overflow-y-auto space-y-1.5 text-xs">
      {filas.map(([ej, d]) => (
        <div key={ej} className="rounded-md bg-slate-50 px-2 py-1.5">
          <p className="font-mono text-[11px] text-violet-800 break-all">{formulaEnIdioma(ej)}</p>
          <p className="text-slate-600">{t(d)}</p>
        </div>
      ))}
      <p className="px-1 text-[11px] text-slate-500">{t("Si una variable usa su propio nombre dentro de la fórmula, vale lo que traería Vantia sin la fórmula. Una fórmula puede usar otras variables con fórmula (si se usan en círculo, salen vacías).")}</p>
      <p className="px-1 text-[11px] text-slate-500">{t("Las funciones se pueden escribir en castellano o en inglés (SI o IF, MAYUSCULAS o UPPER).")}</p>
    </div>
  );
}
