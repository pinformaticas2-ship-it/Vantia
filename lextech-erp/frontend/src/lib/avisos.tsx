import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

// ── Avisos y confirmaciones propios (16/10/2026) ─────────────────────────────
// Sustituyen a alert()/confirm() del navegador (ventanas grises, bloquean la
// página, no siguen el tema ni el modo oscuro). Se pueden llamar desde
// cualquier sitio, sin hooks:
//
//   aviso('Cliente guardado')               -> tipo deducido del texto
//   aviso.ok('Guardado') / aviso.error(...) / aviso.info(...)
//   if (!(await confirmar({ titulo: '¿Eliminar?', peligro: true }))) return;
//
// <AvisosHost /> (montado una vez en App) los pinta.

export type TipoAviso = 'ok' | 'error' | 'info';
interface Aviso { id: number; tipo: TipoAviso; texto: string; duracion: number; accion?: { label: string; onClick: () => void } }
export interface OpcionesConfirmar {
  titulo: string;
  mensaje?: React.ReactNode;
  confirmar?: string;
  cancelar?: string;
  peligro?: boolean;
}
interface Confirmacion extends OpcionesConfirmar { id: number; resolver: (v: boolean) => void }

let avisos: Aviso[] = [];
let confirmaciones: Confirmacion[] = [];
let seq = 0;
const oyentes = new Set<() => void>();
const emitir = () => oyentes.forEach((f) => f());
const suscribir = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };

/** Si no se dice el tipo, se deduce del texto (los mensajes de la app ya son así). */
function deducirTipo(texto: string): TipoAviso {
  if (/error|no se pud|no se ha pod|fall[oóa]|inválid|invalid|incorrect|no tiene|ninguno|elige |debe|obligatori|no se encontr|sin permiso|denegad/i.test(texto)) return 'error';
  if (/✓|correctamente|guardad|enviad|cread|copiad|eliminad|actualizad|se eliminaron|listo/i.test(texto)) return 'ok';
  return 'info';
}

function mostrar(texto: unknown, tipo?: TipoAviso, opts?: { duracion?: number; accion?: Aviso['accion'] }) {
  const t = String(texto ?? '').trim() || 'Ha ocurrido un error inesperado';
  const tp = tipo || deducirTipo(t);
  const id = ++seq;
  // Los errores se quedan más tiempo: hay que poder leerlos.
  const duracion = opts?.duracion ?? (tp === 'error' ? 7000 : 4000);
  // Sin duplicados seguidos (p. ej. el mismo error de red tres veces).
  avisos = avisos.filter((a) => a.texto !== t);
  avisos = [...avisos, { id, tipo: tp, texto: t, duracion, accion: opts?.accion }].slice(-4);
  emitir();
  return id;
}

export const aviso = Object.assign(
  (texto: unknown, opts?: { duracion?: number; accion?: Aviso['accion'] }) => mostrar(texto, undefined, opts),
  {
    ok: (texto: unknown, opts?: { duracion?: number; accion?: Aviso['accion'] }) => mostrar(texto, 'ok', opts),
    error: (texto: unknown, opts?: { duracion?: number; accion?: Aviso['accion'] }) => mostrar(texto, 'error', opts),
    info: (texto: unknown, opts?: { duracion?: number; accion?: Aviso['accion'] }) => mostrar(texto, 'info', opts),
    cerrar: (id: number) => { avisos = avisos.filter((a) => a.id !== id); emitir(); },
  },
);

/** Una función de la app que aún no está hecha: aviso amable en vez de nada. */
export const proximamente = (que: string) => aviso.info(`«${que}» estará disponible próximamente.`);

export function confirmar(opts: OpcionesConfirmar | string): Promise<boolean> {
  const o = typeof opts === 'string' ? { titulo: opts } : opts;
  return new Promise((resolver) => {
    confirmaciones = [...confirmaciones, { ...o, id: ++seq, resolver }];
    emitir();
  });
}

function resolverConfirmacion(id: number, valor: boolean) {
  const c = confirmaciones.find((x) => x.id === id);
  confirmaciones = confirmaciones.filter((x) => x.id !== id);
  emitir();
  c?.resolver(valor);
}

const ICONO = { ok: CheckCircle2, error: XCircle, info: Info };
const COLOR = {
  ok: 'text-emerald-600',
  error: 'text-red-600 peligro',
  info: 'text-sky-600',
};

function AvisoItem({ a }: { a: Aviso }) {
  const [pausa, setPausa] = useState(false);
  const restante = useRef(a.duracion);
  const desde = useRef(Date.now());
  useEffect(() => {
    if (pausa) { restante.current -= Date.now() - desde.current; return; }
    desde.current = Date.now();
    const t = setTimeout(() => aviso.cerrar(a.id), Math.max(800, restante.current));
    return () => clearTimeout(t);
  }, [pausa, a.id]);
  const Icono = ICONO[a.tipo];
  return (
    <div
      role={a.tipo === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPausa(true)}
      onMouseLeave={() => setPausa(false)}
      className="aviso-entra pointer-events-auto flex items-start gap-3 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-lg shadow-slate-900/10"
    >
      <Icono size={18} className={`shrink-0 mt-px ${COLOR[a.tipo]}`} />
      <p className="flex-1 min-w-0 text-[13px] leading-snug text-slate-800 whitespace-pre-line break-words">{a.texto}</p>
      {a.accion && (
        <button
          type="button"
          onClick={() => { a.accion!.onClick(); aviso.cerrar(a.id); }}
          className="shrink-0 text-[13px] font-semibold text-red-600 hover:underline"
        >
          {a.accion.label}
        </button>
      )}
      <button type="button" aria-label="Cerrar aviso" onClick={() => aviso.cerrar(a.id)} className="shrink-0 -mr-1 p-0.5 rounded text-slate-400 hover:text-slate-700">
        <X size={15} />
      </button>
    </div>
  );
}

function DialogoConfirmar({ c }: { c: Confirmacion }) {
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // En lo peligroso, el foco empieza en "Cancelar": un Intro sin mirar no borra nada.
    (c.peligro ? cancelRef : okRef).current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); resolverConfirmacion(c.id, false); } };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [c]);
  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/50 aviso-fondo" onClick={() => resolverConfirmacion(c.id, false)} />
      <div role="alertdialog" aria-modal="true" aria-labelledby={`conf-${c.id}`}
        className="aviso-dialogo relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3.5">
          <span className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${c.peligro ? 'peligro bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
            {c.peligro ? <AlertTriangle size={19} /> : <Info size={19} />}
          </span>
          <div className="min-w-0 pt-1.5">
            <h2 id={`conf-${c.id}`} className="text-[15px] font-semibold text-slate-900">{c.titulo}</h2>
            {c.mensaje && <div className="mt-1.5 text-[13px] leading-relaxed text-slate-600 whitespace-pre-line">{c.mensaje}</div>}
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={() => resolverConfirmacion(c.id, false)}
            className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {c.cancelar || 'Cancelar'}
          </button>
          <button ref={okRef} type="button" onClick={() => resolverConfirmacion(c.id, true)}
            className={`h-10 px-4 rounded-lg text-sm font-semibold text-white ${c.peligro ? 'peligro bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}>
            {c.confirmar || 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AvisosHost() {
  const estado = useSyncExternalStore(suscribir, () => avisos);
  const confs = useSyncExternalStore(suscribir, () => confirmaciones);
  return createPortal(
    <>
      <div aria-live="polite" className="fixed z-[10001] top-[72px] right-3 left-3 sm:left-auto sm:right-4 sm:w-[380px] flex flex-col gap-2 pointer-events-none">
        {estado.map((a) => <AvisoItem key={a.id} a={a} />)}
      </div>
      {confs[0] && <DialogoConfirmar key={confs[0].id} c={confs[0]} />}
    </>,
    document.body,
  );
}
