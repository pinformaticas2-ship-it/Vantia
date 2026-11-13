import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, Handle, Position, BaseEdge, EdgeLabelRenderer,
  getSmoothStepPath, MarkerType, useReactFlow, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type NodeProps, type EdgeProps, type Connection, type NodeChange, type EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle, ArrowLeft, Sparkles, Check, CheckCircle2, FlaskConical, GripVertical, LayoutGrid, Loader2, Lock, MousePointerClick, Plus, Redo2, Trash2, Undo2, X, XCircle, type LucideIcon,
} from 'lucide-react';
import { t } from '../../lib/i18n';
import { confirmar } from '../../lib/avisos';
import { META, PALETA, CONFIG_INICIAL, faltaAlgo, nuevoId, resumen, type AristaFlujo, type Catalogo, type FlujoDatos, type NodoFlujo, type TipoNodo } from './tipos';
import { FormularioPaso } from './FormularioPaso';

// ── Lienzo de automatizaciones (12/11/2026) ────────────────────────────────
// Editor de flujos al estilo de Make o n8n: te desplazas arrastrando el fondo
// (o con la rueda y Ctrl para el zoom), mueves los pasos donde quieras, los
// unes arrastrando desde el punto de salida al de entrada, añades pasos desde
// la paleta (arrastrándolos al lienzo o con un clic), deshaces y rehaces
// (Ctrl+Z / Ctrl+Y), pruebas el flujo sin efectos y guardas (Ctrl+S).
// Las automatizaciones de serie se dibujan con sus pasos fijos (se pueden
// mover y, los opcionales, quitar) y un punto «Al terminar» desde el que se
// añaden pasos propios.

/** Paso fijo de una automatización de serie (lo que antes era el editor vertical). */
export interface ResultadoPaso { nodo: string; ok: boolean; detalle: string; clave?: string; vars?: Record<string, string | number> }
/** Texto de un resultado del servidor en el idioma de la app. */
export const textoPaso = (x: { detalle: string; clave?: string; vars?: Record<string, string | number> }) => (x.clave ? t(x.clave, x.vars as any) : x.detalle);

export interface PasoFijo {
  id: string;
  clase: 'disparador' | 'condicion' | 'accion';
  icono: LucideIcon;
  titulo: string;
  resumen?: React.ReactNode;
  explicacion?: React.ReactNode;
  ajustes?: React.ReactNode;
  opcional?: { activo: boolean; cambiar: (v: boolean) => void };
}
export interface RamaFija { id: string; titulo: string; tono: 'verde' | 'rojo'; pasos: PasoFijo[] }

type DatosNodo = { tipo: TipoNodo | 'fijo'; config: Record<string, any>; fijoId?: string; ancla?: boolean };
type NodoLienzo = Node<DatosNodo, 'paso'>;
type DatosArista = { rama?: 'si' | 'no' | null; fija?: boolean; etiqueta?: string; tono?: 'verde' | 'rojo' };
type AristaLienzo = Edge<DatosArista, 'arista'>;

interface Ctx {
  catalogo: Catalogo | null;
  fijos: Map<string, PasoFijo>;
  resultados: Map<string, { ok: boolean; detalle: string }>;
  puedeEditar: boolean;
  etiquetaFin: string;
  borrarNodo: (id: string) => void;
  borrarArista: (id: string) => void;
}
const LienzoCtx = createContext<Ctx>(null as any);

const COLOR_CLASE = { disparador: '#f59e0b', condicion: '#0ea5e9', accion: '#dc2626' };
const ETIQUETA_CLASE = { disparador: 'Cuando', condicion: 'Si', accion: 'Entonces', logica: 'Lógica' };

// ── Nodo ────────────────────────────────────────────────────────────────────
function NodoPaso({ id, data, selected }: NodeProps<NodoLienzo>) {
  const ctx = useContext(LienzoCtx);
  const fijo = data.fijoId ? ctx.fijos.get(data.fijoId) : null;
  const res = ctx.resultados.get(id);
  let color: string, Icono: LucideIcon, titulo: string, sub: React.ReactNode, chip: string, aviso: string | null = null;
  if (fijo) {
    color = COLOR_CLASE[fijo.clase]; Icono = fijo.icono; titulo = fijo.titulo; sub = fijo.resumen; chip = ETIQUETA_CLASE[fijo.clase];
  } else if (data.ancla) {
    color = '#f59e0b'; Icono = META.disparador.icono; titulo = ctx.etiquetaFin; sub = t('Añade aquí tus propios pasos'); chip = 'Cuando';
  } else {
    const m = META[data.tipo as TipoNodo];
    color = m.color; Icono = m.icono; titulo = t(m.etiqueta === 'Cuando…' ? 'Cuando…' : m.etiqueta);
    sub = resumen({ tipo: data.tipo as TipoNodo, config: data.config }, ctx.catalogo);
    chip = data.tipo === 'disparador' ? 'Cuando' : m.clase === 'logica' ? (data.tipo === 'condicion' ? 'Si' : 'Lógica') : 'Entonces';
    aviso = faltaAlgo({ tipo: data.tipo as TipoNodo, config: data.config }, false);
  }
  const quitado = fijo?.opcional && !fijo.opcional.activo;
  const esCondicion = data.tipo === 'condicion';
  const sinEntrada = data.tipo === 'disparador' || data.ancla || (fijo && fijo.clase === 'disparador');
  const borrable = ctx.puedeEditar && !fijo && !data.ancla && data.tipo !== 'disparador';
  return (
    <div className={`group relative w-[280px] rounded-xl border bg-white shadow-sm transition-shadow ${selected ? 'shadow-lg ring-2 ring-red-500/70' : 'hover:shadow-md'} ${quitado ? 'border-dashed opacity-55' : 'border-slate-200'}`}
      style={{ borderLeft: `4px solid ${color}` }}>
      {!sinEntrada && <Handle type="target" position={Position.Top} className="!h-3 !w-3 !border-2 !border-white !bg-slate-400" isConnectable={ctx.puedeEditar && !fijo} />}
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1a`, color }}><Icono size={16} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="rounded px-1.5 py-px text-[9px] font-bold uppercase tracking-wide" style={{ background: `${color}22`, color }}>{t(chip)}</span>
            {fijo && <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-slate-500"><Lock size={8} />{t('De serie')}</span>}
            {quitado && <span className="rounded bg-slate-100 px-1.5 py-px text-[9px] font-bold uppercase text-slate-500">{t('Quitado')}</span>}
          </div>
          <p className={`mt-0.5 text-[13px] font-semibold leading-snug ${quitado ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{titulo}</p>
          {sub && <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-500">{sub}</p>}
          {aviso && <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-600"><AlertTriangle size={10} />{aviso}</p>}
          {res && (
            <p className={`mt-1 flex items-start gap-1 text-[10px] font-semibold ${res.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {res.ok ? <CheckCircle2 size={11} className="mt-px shrink-0" /> : <XCircle size={11} className="mt-px shrink-0" />}<span className="line-clamp-2">{res.detalle}</span>
            </p>
          )}
        </div>
        {borrable && (
          <button type="button" onClick={(e) => { e.stopPropagation(); ctx.borrarNodo(id); }} title={t('Borrar paso')}
            className="nodrag -mr-1 -mt-1 rounded-md p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"><Trash2 size={13} /></button>
        )}
      </div>
      {esCondicion ? (
        <>
          <Handle type="source" id="si" position={Position.Bottom} style={{ left: '28%' }} className="!h-3.5 !w-3.5 !border-2 !border-white !bg-emerald-500" isConnectable={ctx.puedeEditar} />
          <Handle type="source" id="no" position={Position.Bottom} style={{ left: '72%' }} className="!h-3.5 !w-3.5 !border-2 !border-white !bg-rose-500" isConnectable={ctx.puedeEditar} />
          <div className="pointer-events-none flex justify-between px-[22%] pb-1 text-[9px] font-bold"><span className="text-emerald-600">{t('Sí')}</span><span className="text-rose-600">{t('No')}</span></div>
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!h-3 !w-3 !border-2 !border-white !bg-slate-500" isConnectable={ctx.puedeEditar && (!fijo || false)} />
      )}
    </div>
  );
}

// ── Conexión ────────────────────────────────────────────────────────────────
function Arista({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd }: EdgeProps<AristaLienzo>) {
  const ctx = useContext(LienzoCtx);
  const [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14 });
  const rama = data?.rama;
  const color = rama === 'si' ? '#10b981' : rama === 'no' ? '#f43f5e' : data?.tono === 'verde' ? '#10b981' : data?.tono === 'rojo' ? '#f43f5e' : selected ? '#dc2626' : '#94a3b8';
  const etiqueta = rama === 'si' ? t('Sí') : rama === 'no' ? t('No') : data?.etiqueta;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: color, strokeWidth: selected ? 2.5 : 1.75 }} />
      <EdgeLabelRenderer>
        <div className="nodrag nopan pointer-events-auto absolute flex items-center gap-1" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
          {etiqueta && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-sm" style={{ background: color }}>{etiqueta}</span>}
          {selected && !data?.fija && ctx.puedeEditar && (
            <button type="button" onClick={() => ctx.borrarArista(id)} title={t('Quitar conexión')}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 shadow-sm hover:bg-red-50"><X size={11} /></button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { paso: NodoPaso };
const edgeTypes = { arista: Arista };
const marcador = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#94a3b8' };

// ── Utilidades ──────────────────────────────────────────────────────────────
const aNodo = (n: NodoFlujo): NodoLienzo => ({
  id: n.id, type: 'paso', position: { x: n.x || 0, y: n.y || 0 },
  data: { tipo: n.tipo, config: { ...CONFIG_INICIAL[n.tipo], ...(n.config || {}) } },
  deletable: n.tipo !== 'disparador',
});
const aArista = (a: AristaFlujo, fija = false, extra: Partial<DatosArista> = {}): AristaLienzo => ({
  id: a.id || `${a.de}-${a.a}-${a.rama || ''}`, source: a.de, target: a.a, sourceHandle: a.rama || undefined,
  type: 'arista', markerEnd: marcador, data: { rama: a.rama || null, fija, ...extra }, deletable: !fija,
});

/** Coloca por capas desde el primer paso (para «Ordenar»). */
function ordenar(nodos: NodoLienzo[], aristas: AristaLienzo[]): NodoLienzo[] {
  const entra = new Set(aristas.map((e) => e.target));
  const raices = nodos.filter((n) => !entra.has(n.id));
  const capa = new Map<string, number>();
  const cola = raices.map((r) => r.id);
  raices.forEach((r) => capa.set(r.id, 0));
  while (cola.length) {
    const id = cola.shift()!;
    const salen = aristas.filter((e) => e.source === id).sort((a, b) => (a.sourceHandle === 'no' ? 1 : 0) - (b.sourceHandle === 'no' ? 1 : 0));
    for (const e of salen) {
      const c = (capa.get(id) || 0) + 1;
      if ((capa.get(e.target) ?? -1) < c && c < 60) { capa.set(e.target, c); cola.push(e.target); }
    }
  }
  const porCapa = new Map<number, string[]>();
  for (const n of nodos) { const c = capa.get(n.id) ?? 0; porCapa.set(c, [...(porCapa.get(c) || []), n.id]); }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [c, ids] of porCapa) ids.forEach((id, i) => pos.set(id, { x: (i - (ids.length - 1) / 2) * 330, y: c * 150 }));
  return nodos.map((n) => ({ ...n, position: pos.get(n.id) || n.position }));
}

type Foto = { nodos: NodoLienzo[]; aristas: AristaLienzo[] };
const limpiarFoto = (nodos: NodoLienzo[], aristas: AristaLienzo[]): Foto => ({
  nodos: nodos.map(({ id, type, position, data, deletable }) => ({ id, type, position, data: { ...data, config: { ...data.config } }, deletable })),
  aristas: aristas.map(({ id, source, target, sourceHandle, type, markerEnd, data, deletable }) => ({ id, source, target, sourceHandle, type, markerEnd, data, deletable })),
});

// ── Componente ──────────────────────────────────────────────────────────────
export interface PropsLienzo {
  titulo: string;
  subtitulo?: string;
  icono: LucideIcon;
  catalogo: Catalogo | null;
  /** Parte editable (en las de serie: el «Al terminar» y lo que cuelga de él). */
  inicial: FlujoDatos;
  fijos?: { pasos: PasoFijo[]; ramas?: RamaFija[]; etiquetaFin: string };
  vinculada?: string;
  /** Lo que se ve en el panel derecho sin nada seleccionado. */
  panelGeneral?: React.ReactNode;
  cabecera?: React.ReactNode;
  puedeEditar: boolean;
  sucioExterno?: boolean;
  guardando: boolean;
  error?: string;
  onGuardar: (f: FlujoDatos) => Promise<void> | void;
  onProbar: (f: FlujoDatos, muestraId?: string | null) => Promise<ResultadoPaso[]>;
  /** Registros reales con los que probar (según el disparador). */
  onMuestras?: (evento: string) => Promise<{ id: string; etiqueta: string }[]>;
  /** «Pedir a la IA»: cambia el flujo según una descripción. */
  onGenerar?: (descripcion: string, actual: FlujoDatos, modelo?: string) => Promise<{ flujo: FlujoDatos; avisos?: string[] }>;
  /** Dirección pública del webhook entrante (si ya está guardada). */
  urlEntrada?: string | null;
  onCerrar: () => void;
}

function LienzoInterno(p: PropsLienzo) {
  const rf = useReactFlow<NodoLienzo, AristaLienzo>();
  const fijosMap = useMemo(() => {
    const m = new Map<string, PasoFijo>();
    for (const x of p.fijos?.pasos || []) m.set(x.id, x);
    for (const r of p.fijos?.ramas || []) for (const x of r.pasos) m.set(x.id, x);
    return m;
  }, [p.fijos]);

  // Construcción inicial (una vez).
  const construir = useCallback((): Foto => {
    const nodos: NodoLienzo[] = [];
    const aristas: AristaLienzo[] = [];
    const lay = p.inicial.layout || {};
    if (p.fijos) {
      const { pasos, ramas = [] } = p.fijos;
      const pos = (id: string, x: number, y: number) => lay[id] || { x, y };
      pasos.forEach((x, i) => nodos.push({ id: x.id, type: 'paso', position: pos(x.id, 0, i * 150), data: { tipo: 'fijo', config: {}, fijoId: x.id }, deletable: false }));
      for (let i = 1; i < pasos.length; i++) aristas.push(aArista({ id: `f-${pasos[i - 1].id}`, de: pasos[i - 1].id, a: pasos[i].id }, true));
      let yFin = pasos.length * 150;
      let ultimo = pasos[pasos.length - 1]?.id;
      ramas.forEach((r, k) => {
        const x0 = (k - (ramas.length - 1) / 2) * 360;
        r.pasos.forEach((x, i) => nodos.push({ id: x.id, type: 'paso', position: pos(x.id, x0, pasos.length * 150 + 40 + i * 150), data: { tipo: 'fijo', config: {}, fijoId: x.id }, deletable: false }));
        if (r.pasos[0] && pasos.length) aristas.push(aArista({ id: `f-r-${r.id}`, de: pasos[pasos.length - 1].id, a: r.pasos[0].id }, true, { etiqueta: r.titulo, tono: r.tono }));
        for (let i = 1; i < r.pasos.length; i++) aristas.push(aArista({ id: `f-${r.pasos[i - 1].id}`, de: r.pasos[i - 1].id, a: r.pasos[i].id }, true));
        if (k === 0 && r.pasos.length) { ultimo = r.pasos[r.pasos.length - 1].id; yFin = pasos.length * 150 + 40 + r.pasos.length * 150; }
      });
      const xFin = ramas.length ? (0 - (ramas.length - 1) / 2) * 360 : 0;
      const ancla = p.inicial.nodos.find((n) => n.tipo === 'disparador');
      const idAncla = ancla?.id || 'ancla';
      nodos.push({ id: idAncla, type: 'paso', position: ancla && (ancla.x || ancla.y) ? { x: ancla.x, y: ancla.y } : { x: xFin, y: yFin + 20 }, data: { tipo: 'disparador', config: {}, ancla: true }, deletable: false });
      if (ultimo) aristas.push({ ...aArista({ id: 'f-fin', de: ultimo, a: idAncla }, true), style: { strokeDasharray: '5 4' } });
      for (const n of p.inicial.nodos) if (n.tipo !== 'disparador') nodos.push(aNodo(n));
    } else {
      for (const n of p.inicial.nodos) nodos.push(aNodo(n));
    }
    for (const a of p.inicial.aristas) aristas.push(aArista(a));
    return { nodos, aristas };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [inicial] = useState(construir);
  const [nodos, setNodos] = useState<NodoLienzo[]>(inicial.nodos);
  const [aristas, setAristas] = useState<AristaLienzo[]>(inicial.aristas);
  const [sel, setSel] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Map<string, { ok: boolean; detalle: string }>>(new Map());
  const [probando, setProbando] = useState(false);
  const [listaPrueba, setListaPrueba] = useState<ResultadoPaso[] | null>(null);
  const [muestra, setMuestra] = useState('');
  const [muestras, setMuestras] = useState<{ id: string; etiqueta: string }[]>([]);
  const portapapeles = useRef<{ nodos: NodoLienzo[]; aristas: AristaLienzo[] } | null>(null);

  // ── Serializar (lo que se guarda) ──
  const serializar = useCallback((ns: NodoLienzo[], es: AristaLienzo[]): FlujoDatos => {
    const editables = ns.filter((n) => !n.data.fijoId);
    const layout: Record<string, { x: number; y: number }> = {};
    for (const n of ns) if (n.data.fijoId) layout[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    return {
      nodos: editables.map((n) => ({ id: n.id, tipo: n.data.tipo as TipoNodo, config: n.data.ancla ? {} : n.data.config, x: Math.round(n.position.x), y: Math.round(n.position.y) })),
      aristas: es.filter((e) => !e.data?.fija).map((e) => ({ id: e.id, de: e.source, a: e.target, rama: (e.sourceHandle as 'si' | 'no') || null })),
      layout,
    };
  }, []);
  const base = useRef(JSON.stringify(serializar(inicial.nodos, inicial.aristas)));
  const actual = serializar(nodos, aristas);
  const sucio = JSON.stringify(actual) !== base.current || Boolean(p.sucioExterno);

  // ── Deshacer / rehacer ──
  const pasado = useRef<Foto[]>([]);
  const futuro = useRef<Foto[]>([]);
  const ultimaEdicion = useRef<{ id: string; at: number } | null>(null);
  const [, refrescar] = useState(0);
  const apuntar = useCallback(() => {
    pasado.current.push(limpiarFoto(nodos, aristas));
    if (pasado.current.length > 80) pasado.current.shift();
    futuro.current = [];
    refrescar((x) => x + 1);
  }, [nodos, aristas]);
  const deshacer = useCallback(() => {
    const f = pasado.current.pop(); if (!f) return;
    futuro.current.push(limpiarFoto(nodos, aristas));
    setNodos(f.nodos); setAristas(f.aristas); refrescar((x) => x + 1);
  }, [nodos, aristas]);
  const rehacer = useCallback(() => {
    const f = futuro.current.pop(); if (!f) return;
    pasado.current.push(limpiarFoto(nodos, aristas));
    setNodos(f.nodos); setAristas(f.aristas); refrescar((x) => x + 1);
  }, [nodos, aristas]);

  // ── Cambios de React Flow ──
  const onNodesChange = useCallback((ch: NodeChange<NodoLienzo>[]) => {
    const borra = ch.filter((c) => c.type === 'remove');
    if (borra.length) apuntar();
    setNodos((ns) => applyNodeChanges(ch, ns));
  }, [apuntar]);
  const onEdgesChange = useCallback((ch: EdgeChange<AristaLienzo>[]) => {
    if (ch.some((c) => c.type === 'remove')) apuntar();
    setAristas((es) => applyEdgeChanges(ch, es));
  }, [apuntar]);
  const onConnect = useCallback((c: Connection) => {
    if (!p.puedeEditar || !c.source || !c.target || c.source === c.target) return;
    const destino = nodos.find((n) => n.id === c.target);
    if (destino?.data.fijoId || destino?.data.tipo === 'disparador') return;
    const rama = (c.sourceHandle === 'si' || c.sourceHandle === 'no') ? c.sourceHandle : null;
    const id = `${c.source}-${c.target}-${rama || ''}`;
    if (aristas.some((e) => e.id === id)) return;
    apuntar();
    setAristas((es) => [...es, aArista({ id, de: c.source!, a: c.target!, rama })]);
  }, [p.puedeEditar, nodos, aristas, apuntar]);

  const borrarNodo = useCallback((id: string) => {
    apuntar();
    setNodos((ns) => ns.filter((n) => n.id !== id));
    setAristas((es) => es.filter((e) => e.source !== id && e.target !== id));
    setSel((s) => (s === id ? null : s));
  }, [apuntar]);
  const borrarArista = useCallback((id: string) => { apuntar(); setAristas((es) => es.filter((e) => e.id !== id)); }, [apuntar]);

  // ── Añadir pasos ──
  const anadir = useCallback((tipo: TipoNodo, posicion?: { x: number; y: number }) => {
    if (!p.puedeEditar) return;
    apuntar();
    const id = nuevoId(tipo);
    const origen = nodos.find((n) => n.id === sel) || null;
    let pos = posicion;
    let conexion: AristaLienzo | null = null;
    if (!pos) {
      if (origen) {
        // Debajo del seleccionado y enganchado a él (en una condición, a la salida libre).
        let rama: 'si' | 'no' | null = null;
        if (origen.data.tipo === 'condicion') rama = aristas.some((e) => e.source === origen.id && e.sourceHandle === 'si') ? 'no' : 'si';
        const salidas = aristas.filter((e) => e.source === origen.id).length;
        pos = { x: origen.position.x + (rama === 'si' ? -170 : rama === 'no' ? 170 : salidas * 320), y: origen.position.y + 160 };
        const puedeSalir = !origen.data.fijoId || origen.data.ancla;
        if (puedeSalir) conexion = aArista({ id: `${origen.id}-${id}-${rama || ''}`, de: origen.id, a: id, rama });
      } else {
        const masBajo = nodos.reduce((m, n) => Math.max(m, n.position.y), 0);
        const centro = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        pos = { x: centro.x - 140, y: Math.max(masBajo + 160, centro.y) };
      }
    }
    setNodos((ns) => [...ns.map((n) => ({ ...n, selected: false })), { ...aNodo({ id, tipo, config: {}, x: pos!.x, y: pos!.y }), selected: true }]);
    if (conexion) setAristas((es) => [...es, conexion!]);
    setSel(id);
  }, [p.puedeEditar, nodos, aristas, sel, rf, apuntar]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const tipo = e.dataTransfer.getData('application/vantia-paso') as TipoNodo;
    if (!tipo || !META[tipo]) return;
    const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setSel(null);
    anadir(tipo, { x: pos.x - 140, y: pos.y - 30 });
  }, [rf, anadir]);

  // ── Editar la configuración del seleccionado ──
  const setConfig = useCallback((id: string, k: string, v: any) => {
    const ahora = Date.now();
    if (!ultimaEdicion.current || ultimaEdicion.current.id !== id || ahora - ultimaEdicion.current.at > 1200) apuntar();
    ultimaEdicion.current = { id, at: ahora };
    setNodos((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, [k]: v } } } : n)));
  }, [apuntar]);

  // ── Copiar / pegar / duplicar (solo pasos propios) ──
  const copiar = useCallback(() => {
    const elegidos = nodos.filter((n) => n.selected && !n.data.fijoId && !n.data.ancla && n.data.tipo !== 'disparador');
    if (!elegidos.length) return false;
    const ids = new Set(elegidos.map((n) => n.id));
    portapapeles.current = { nodos: elegidos, aristas: aristas.filter((e) => ids.has(e.source) && ids.has(e.target)) };
    return true;
  }, [nodos, aristas]);
  const pegar = useCallback(() => {
    const pp = portapapeles.current;
    if (!pp || !p.puedeEditar) return;
    apuntar();
    const mapa = new Map<string, string>();
    const nuevos = pp.nodos.map((n) => { const id = nuevoId(String(n.data.tipo)); mapa.set(n.id, id); return { ...n, id, selected: true, position: { x: n.position.x + 48, y: n.position.y + 48 }, data: { ...n.data, config: JSON.parse(JSON.stringify(n.data.config)) } }; });
    const nuevasAristas = pp.aristas.map((e) => aArista({ id: `${mapa.get(e.source)}-${mapa.get(e.target)}-${e.sourceHandle || ''}`, de: mapa.get(e.source)!, a: mapa.get(e.target)!, rama: (e.sourceHandle as any) || null }));
    setNodos((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...nuevos]);
    setAristas((es) => [...es, ...nuevasAristas]);
    portapapeles.current = { nodos: nuevos, aristas: nuevasAristas };
    setSel(nuevos.length === 1 ? nuevos[0].id : null);
  }, [p.puedeEditar, apuntar]);

  // Registros reales para «Probar con…».
  const eventoDisparo = p.vinculada ? p.catalogo?.eventoDeSerie[p.vinculada] : nodos.find((n) => n.data.tipo === 'disparador' && !n.data.ancla)?.data.config.evento;
  useEffect(() => {
    setMuestra(''); setMuestras([]);
    if (!eventoDisparo || !p.onMuestras || !p.catalogo?.conMuestras?.includes(eventoDisparo)) return;
    p.onMuestras(eventoDisparo).then(setMuestras).catch(() => {});
  }, [eventoDisparo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pedir a la IA que cambie el flujo ──
  const [iaAbierta, setIaAbierta] = useState(false);
  const [iaTexto, setIaTexto] = useState('');
  const [iaPensando, setIaPensando] = useState(false);
  const [iaError, setIaError] = useState('');
  const pedirIA = async () => {
    if (!p.onGenerar || iaTexto.trim().length < 5) return;
    setIaPensando(true); setIaError('');
    try {
      const r = await p.onGenerar(iaTexto.trim(), actual);
      apuntar();
      setNodos(r.flujo.nodos.map(aNodo));
      setAristas(r.flujo.aristas.map((a) => aArista(a)));
      setSel(null); setIaAbierta(false); setIaTexto('');
      window.setTimeout(() => rf.fitView({ padding: 0.25, duration: 500, maxZoom: 1 }), 80);
    } catch (e: any) { setIaError(e?.message || t('La IA no ha podido cambiar el flujo')); } finally { setIaPensando(false); }
  };

  // ── Probar ──
  const probar = async () => {
    setProbando(true);
    try {
      const r = await p.onProbar(actual, muestra || null);
      setResultados(new Map(r.map((x) => [x.nodo, { ok: x.ok, detalle: textoPaso(x) }])));
      setListaPrueba(r);
    } finally { setProbando(false); }
  };

  const guardar = useCallback(async () => {
    if (!p.puedeEditar || !sucio || p.guardando) return;
    await p.onGuardar(serializar(nodos, aristas));
    base.current = JSON.stringify(serializar(nodos, aristas));
    refrescar((x) => x + 1);
  }, [p, sucio, nodos, aristas, serializar]);

  const cerrar = useCallback(async () => {
    if (sucio && !(await confirmar({ titulo: t('¿Salir sin guardar?'), mensaje: t('Los cambios del flujo se perderán.'), confirmar: t('Salir sin guardar'), peligro: true }))) return;
    p.onCerrar();
  }, [sucio, p]);

  // ── Teclado ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const escribiendo = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void guardar(); return; }
      if (escribiendo) return;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); deshacer(); }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); rehacer(); }
      else if (mod && e.key.toLowerCase() === 'c') { if (copiar()) e.preventDefault(); }
      else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); pegar(); }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (copiar()) pegar(); }
      else if (e.key === 'Escape') { if (sel) setSel(null); else void cerrar(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guardar, deshacer, rehacer, cerrar, sel, copiar, pegar]);

  // Variables disponibles según el disparador.
  const evento = p.vinculada ? p.catalogo?.eventoDeSerie[p.vinculada] : nodos.find((n) => n.data.tipo === 'disparador' && !n.data.ancla)?.data.config.evento;
  const variablesBase = p.catalogo?.disparadores.find((d) => d.clave === evento)?.variables || [];
  // Lo que guarda cada paso de IA de este flujo, para usarlo en los siguientes.
  const variables = [
    ...variablesBase.filter((v) => v.clave !== 'ia.respuesta'),
    ...Array.from(new Set(nodos.filter((n) => n.data.tipo === 'ia').map((n) => String(n.data.config.variable || 'respuesta'))))
      .map((v) => ({ clave: `ia.${v}`, etiqueta: t('Respuesta de la IA ({v})', { v }) })),
  ];

  const elegido = nodos.find((n) => n.id === sel) || null;
  const fijo = elegido?.data.fijoId ? fijosMap.get(elegido.data.fijoId) : null;
  const oscuro = typeof document !== 'undefined' && document.documentElement.getAttribute('data-modo') === 'oscuro';
  const avisos = nodos.filter((n) => !n.data.fijoId && !n.data.ancla && faltaAlgo({ tipo: n.data.tipo as TipoNodo, config: n.data.config }, false)).length;
  const conEntrada = new Set(aristas.map((e) => e.target));
  const sueltos = nodos.filter((n) => !n.data.fijoId && !n.data.ancla && n.data.tipo !== 'disparador' && !conEntrada.has(n.id)).length;

  const ctx: Ctx = { catalogo: p.catalogo, fijos: fijosMap, resultados, puedeEditar: p.puedeEditar, etiquetaFin: p.fijos?.etiquetaFin || '', borrarNodo, borrarArista };
  const Ico = p.icono;
  const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40';

  return (
    <LienzoCtx.Provider value={ctx}>
      <div className="flex h-full w-full flex-col overflow-hidden bg-slate-50 shadow-2xl sm:rounded-2xl">
        {/* Cabecera */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4">
          <button type="button" onClick={() => void cerrar()} aria-label={t('Cerrar')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft size={18} /></button>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"><Ico size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-800 sm:text-base">{p.titulo}</p>
            {p.subtitulo && <p className="truncate text-xs text-slate-500">{p.subtitulo}</p>}
          </div>
          {p.cabecera}
          <div className="flex items-center gap-1.5">
            <button type="button" className={btn} onClick={deshacer} disabled={!pasado.current.length} title={t('Deshacer (Ctrl+Z)')}><Undo2 size={14} /></button>
            <button type="button" className={btn} onClick={rehacer} disabled={!futuro.current.length} title={t('Rehacer (Ctrl+Y)')}><Redo2 size={14} /></button>
            {p.onGenerar && p.puedeEditar && (
              <div className="relative">
                <button type="button" className={`${btn} border-violet-200 text-violet-700 hover:bg-violet-50`} onClick={() => setIaAbierta((v) => !v)} title={t('Pedir cambios a la IA')}>
                  <Sparkles size={14} /><span className="hidden md:inline">{t('Pedir a la IA')}</span></button>
                {iaAbierta && (
                  <div className="absolute right-0 top-full z-30 mt-2 w-[min(92vw,380px)] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl">
                    <p className="text-sm font-bold text-slate-800">{t('¿Qué quieres cambiar?')}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{t('Por ejemplo: «añade una espera de 2 días antes del correo» o «si el cliente no tiene correo, avisa al responsable». Podrás deshacerlo con Ctrl+Z.')}</p>
                    <textarea autoFocus rows={4} value={iaTexto} onChange={(e) => setIaTexto(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-400" />
                    {iaError && <p className="mt-1 text-xs text-red-600">{iaError}</p>}
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" className={btn} onClick={() => setIaAbierta(false)}>{t('Cancelar')}</button>
                      <button type="button" disabled={iaPensando || iaTexto.trim().length < 5} onClick={() => void pedirIA()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50">
                        {iaPensando ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{t('Aplicar')}</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {!p.fijos && <button type="button" className={btn} onClick={() => { apuntar(); setNodos((ns) => ordenar(ns, aristas)); window.setTimeout(() => rf.fitView({ padding: 0.2, duration: 400 }), 50); }} title={t('Ordenar los pasos')}><LayoutGrid size={14} /><span className="hidden md:inline">{t('Ordenar')}</span></button>}
            {muestras.length > 0 && (
              <select value={muestra} onChange={(e) => setMuestra(e.target.value)} title={t('Probar con datos reales')}
                className="hidden max-w-[11rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 md:block">
                <option value="">{t('Con datos de ejemplo')}</option>
                {muestras.map((m) => <option key={m.id} value={m.id}>{m.etiqueta}</option>)}
              </select>
            )}
            <button type="button" className={btn} onClick={() => void probar()} disabled={probando} title={t('Probar sin enviar nada')}>
              {probando ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}<span className="hidden md:inline">{t('Probar')}</span></button>
          </div>
          {p.puedeEditar ? (
            <button type="button" onClick={() => void guardar()} disabled={!sucio || p.guardando}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
              {p.guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}{sucio ? t('Guardar') : t('Guardado')}
            </button>
          ) : <span className="text-xs text-slate-500">{t('Solo lectura')}</span>}
        </div>
        {p.error && <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">{p.error}</p>}

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[210px_1fr_380px]">
          {/* Paleta */}
          {p.puedeEditar && (
            <aside className="hidden min-h-0 overflow-y-auto border-r border-slate-200 bg-white p-3 lg:block">
              {PALETA.map((g) => (
                <div key={g.titulo} className="mb-4">
                  <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t(g.titulo)}</p>
                  <div className="space-y-1.5">
                    {g.tipos.map((tp) => {
                      const m = META[tp]; const I = m.icono;
                      return (
                        <div key={tp} draggable onDragStart={(e) => { e.dataTransfer.setData('application/vantia-paso', tp); e.dataTransfer.effectAllowed = 'move'; }}
                          onClick={() => anadir(tp)} title={t('Arrástralo al lienzo o pulsa para añadirlo')}
                          className="group flex cursor-grab items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 transition-colors hover:border-slate-300 hover:bg-slate-50 active:cursor-grabbing">
                          <GripVertical size={12} className="shrink-0 text-slate-300 group-hover:text-slate-400" />
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: `${m.color}1a`, color: m.color }}><I size={14} /></div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-800">{t(m.etiqueta)}</p>
                            <p className="truncate text-[10px] text-slate-400">{t(m.desc)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <p className="px-1 text-[10px] leading-4 text-slate-400">{t('Arrastra un paso al lienzo. Con un paso seleccionado, al pulsar se añade debajo y conectado.')}</p>
            </aside>
          )}

          {/* Lienzo */}
          <div className={`relative min-h-[360px] ${p.puedeEditar ? '' : 'lg:col-span-2'}`} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={onDrop}>
            <ReactFlow<NodoLienzo, AristaLienzo>
              nodes={nodos} edges={aristas} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
              onNodeDragStart={() => apuntar()}
              onSelectionChange={({ nodes }) => setSel(nodes.length === 1 ? nodes[0].id : nodes.length ? sel : null)}
              onPaneClick={() => setSel(null)}
              nodesDraggable nodesConnectable={p.puedeEditar} elementsSelectable
              deleteKeyCode={p.puedeEditar ? ['Delete', 'Backspace'] : null}
              snapToGrid snapGrid={[16, 16]} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1, minZoom: 0.75 }} minZoom={0.2} maxZoom={1.8}
              defaultEdgeOptions={{ type: 'arista', markerEnd: marcador }} connectionLineStyle={{ stroke: '#dc2626', strokeWidth: 2 }}
              colorMode={oscuro ? 'dark' : 'light'} proOptions={{ hideAttribution: true }} panOnScroll={false} zoomOnScroll selectionOnDrag={false}
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#cbd5e1" />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap pannable zoomable position="bottom-right" className="!hidden sm:!block"
                nodeColor={(n) => { const d = n.data as DatosNodo; const f = d.fijoId ? fijosMap.get(d.fijoId) : null; return f ? COLOR_CLASE[f.clase] : d.ancla ? '#f59e0b' : META[d.tipo as TipoNodo]?.color || '#94a3b8'; }} />
            </ReactFlow>
            {(avisos > 0 || sueltos > 0) && (
              <div className="pointer-events-none absolute left-3 top-14 flex flex-col gap-1 lg:top-3">
                {avisos > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 shadow-sm">{t('{n} paso(s) por completar', { n: avisos })}</span>}
                {sueltos > 0 && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm">{t('{n} paso(s) sin conectar: no se ejecutarán', { n: sueltos })}</span>}
              </div>
            )}
            {p.puedeEditar && (
              <div className="absolute right-3 top-3 flex gap-1 lg:hidden">
                {PALETA.flatMap((g) => g.tipos).map((tp) => { const I = META[tp].icono; return (
                  <button key={tp} type="button" onClick={() => anadir(tp)} title={t(META[tp].etiqueta)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm" style={{ color: META[tp].color }}><I size={14} /></button>
                ); })}
              </div>
            )}
          </div>

          {/* Panel */}
          <aside className={`min-h-0 overflow-y-auto border-slate-200 bg-white lg:static lg:max-h-none lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none ${elegido || listaPrueba ? 'fixed inset-x-0 bottom-0 z-20 max-h-[62vh] rounded-t-2xl border-t shadow-2xl' : 'hidden lg:block'}`}>
            {listaPrueba && (
              <div className="border-b border-slate-100 bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><FlaskConical size={14} />{t('Resultado de la prueba')}</p>
                  <button type="button" onClick={() => { setListaPrueba(null); setResultados(new Map()); }} className="text-xs font-semibold text-slate-500 hover:text-slate-700">{t('Limpiar')}</button>
                </div>
                <p className="mb-2 text-[11px] text-slate-500">{muestra ? t('Con datos reales y sin enviar ni crear nada.') : t('Con datos de ejemplo y sin enviar ni crear nada.')}</p>
                {!listaPrueba.length && <p className="text-xs text-slate-500">{t('No se ha ejecutado ningún paso: conecta los pasos al disparador.')}</p>}
                <ul className="space-y-1">
                  {listaPrueba.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs">
                      {r.ok ? <CheckCircle2 size={13} className="mt-px shrink-0 text-emerald-500" /> : <XCircle size={13} className="mt-px shrink-0 text-red-500" />}
                      <button type="button" className="text-left text-slate-700 hover:underline" onClick={() => { setSel(r.nodo); const n = rf.getNode(r.nodo); if (n) rf.setCenter(n.position.x + 140, n.position.y + 40, { zoom: 1, duration: 400 }); }}>{textoPaso(r)}</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!elegido ? (
              <div className="p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><MousePointerClick size={16} className="text-slate-400" />{t('Pulsa un paso para verlo y ajustarlo')}</div>
                {p.panelGeneral && <div className="mt-4">{p.panelGeneral}</div>}
                <ul className="mt-5 space-y-1.5 text-xs text-slate-500">
                  <li>· {t('Arrastra el fondo para moverte; la rueda acerca y aleja.')}</li>
                  <li>· {t('Arrastra los pasos para colocarlos donde quieras.')}</li>
                  {p.puedeEditar && <li>· {t('Une dos pasos arrastrando desde el punto de abajo de uno hasta el de arriba del otro.')}</li>}
                  {p.puedeEditar && <li>· {t('Supr borra lo seleccionado · Ctrl+Z deshace · Ctrl+S guarda.')}</li>}
                </ul>
              </div>
            ) : fijo ? (
              <div className="p-5">
                <PanelTitulo color={COLOR_CLASE[fijo.clase]} icono={fijo.icono} chip={ETIQUETA_CLASE[fijo.clase]} titulo={fijo.titulo} onCerrar={() => setSel(null)} deSerie />
                {fijo.explicacion && <div className="mt-3 text-sm leading-6 text-slate-600">{fijo.explicacion}</div>}
                {fijo.opcional && (
                  <label className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 ${fijo.opcional.activo ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
                    <span className="text-sm font-semibold text-slate-700">{fijo.opcional.activo ? t('Este paso está en el flujo') : t('Este paso está quitado')}</span>
                    <button type="button" role="switch" aria-checked={fijo.opcional.activo} disabled={!p.puedeEditar} onClick={() => fijo.opcional!.cambiar(!fijo.opcional!.activo)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${fijo.opcional.activo ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${fijo.opcional.activo ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                )}
                {fijo.ajustes && (!fijo.opcional || fijo.opcional.activo) && <fieldset disabled={!p.puedeEditar} className="mt-5 space-y-4 border-t border-slate-100 pt-4">{fijo.ajustes}</fieldset>}
                {!fijo.ajustes && !fijo.opcional && <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">{t('Este paso es fijo: no tiene ajustes.')}</p>}
              </div>
            ) : elegido.data.ancla ? (
              <div className="p-5">
                <PanelTitulo color="#f59e0b" icono={META.disparador.icono} chip="Cuando" titulo={p.fijos?.etiquetaFin || ''} onCerrar={() => setSel(null)} />
                <p className="mt-3 text-sm leading-6 text-slate-600">{t('Desde aquí sigue el flujo con tus propios pasos: arrastra uno de la paleta y únelo a este punto. Se ejecutan cada vez que termina esta automatización.')}</p>
                {p.puedeEditar && <button type="button" onClick={() => anadir('aviso_equipo')} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Plus size={14} />{t('Añadir un paso aquí')}</button>}
              </div>
            ) : (
              <div className="p-5">
                <PanelTitulo color={META[elegido.data.tipo as TipoNodo].color} icono={META[elegido.data.tipo as TipoNodo].icono}
                  chip={elegido.data.tipo === 'disparador' ? 'Cuando' : elegido.data.tipo === 'condicion' ? 'Si' : META[elegido.data.tipo as TipoNodo].clase === 'logica' ? 'Lógica' : 'Entonces'}
                  titulo={t(META[elegido.data.tipo as TipoNodo].etiqueta)} onCerrar={() => setSel(null)}
                  onBorrar={p.puedeEditar && elegido.data.tipo !== 'disparador' ? () => borrarNodo(elegido.id) : undefined} />
                {resultados.get(elegido.id) && (
                  <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${resultados.get(elegido.id)!.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{resultados.get(elegido.id)!.detalle}</p>
                )}
                <fieldset disabled={!p.puedeEditar} className="mt-4 space-y-4">
                  <FormularioPaso tipo={elegido.data.tipo as TipoNodo} config={elegido.data.config} set={(k, v) => setConfig(elegido.id, k, v)}
                    catalogo={p.catalogo} variables={variables} vinculada={Boolean(p.vinculada)} urlEntrada={p.urlEntrada} />
                </fieldset>
              </div>
            )}
          </aside>
        </div>
      </div>
    </LienzoCtx.Provider>
  );
}

function PanelTitulo({ color, icono: I, chip, titulo, onCerrar, onBorrar, deSerie }: { color: string; icono: LucideIcon; chip: string; titulo: string; onCerrar: () => void; onBorrar?: () => void; deSerie?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1a`, color }}><I size={19} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: `${color}22`, color }}>{t(chip)}</span>
          {deSerie && <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500"><Lock size={9} />{t('De serie')}</span>}
        </div>
        <p className="mt-1 text-base font-bold text-slate-800">{titulo}</p>
      </div>
      {onBorrar && <button type="button" onClick={onBorrar} title={t('Borrar paso')} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>}
      <button type="button" onClick={onCerrar} aria-label={t('Cerrar')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
    </div>
  );
}

/** Lienzo a pantalla completa, por encima de todo. */
export default function Lienzo(props: PropsLienzo) {
  return createPortal(
    <div className="fixed inset-0 z-[150] flex bg-slate-900/50 sm:p-3" role="dialog" aria-modal="true" aria-label={props.titulo}>
      <ReactFlowProvider><LienzoInterno {...props} /></ReactFlowProvider>
    </div>,
    document.body,
  );
}
