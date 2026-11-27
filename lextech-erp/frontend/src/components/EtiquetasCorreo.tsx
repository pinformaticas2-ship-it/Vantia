import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Check, Pencil, Plus, Tag, Trash2, X } from 'lucide-react';
import { apiFetch, getActiveOrganizacionId } from '../lib/api';
import { t } from '../lib/i18n';
import { aviso, confirmar } from '../lib/avisos';

// ── Etiquetas de Vantia para el correo (27/11/2026) ─────────────────────────
// Iguales para Gmail e IMAP: nombre y color, varias por correo, guardadas en
// Vantia (no en el servidor de correo, así que no salen en Outlook ni en el
// móvil). Cada persona tiene las suyas en cada organización.
// Backend: controllers/correoEtiquetasController.ts. La carpeta de una
// etiqueta en la lista de correos es «ETQ:<id>».

export interface EtiquetaCorreo { id: string; nombre: string; color: string; total: number }
export const COLORES_ETIQUETA = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];
export const esCarpetaEtiqueta = (carpeta: string) => String(carpeta || '').startsWith('ETQ:');

// Estado compartido entre el lateral, la lista y el lector.
let etiquetas: EtiquetaCorreo[] | null = null;
let asignadas = new Map<string, string[]>();
let version = 0;
const oyentes = new Set<() => void>();
const avisar = () => { version++; oyentes.forEach((f) => f()); };
const suscribir = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };
let cargando: Promise<void> | null = null;
let orgDeLaCache: string | null = null;

/** Al cambiar de organización o de usuario: empezar de cero. */
export function olvidarEtiquetasCorreo() { etiquetas = null; asignadas = new Map(); cargando = null; avisar(); }

async function pedir(getToken: () => Promise<string | null>, url: string, init?: RequestInit) {
  const r = await apiFetch(url, { ...(init || {}), getToken });
  if (r?.success === false) throw new Error(r.error || t('No se pudo guardar.'));
  return r?.data;
}

export function useEtiquetasCorreo() {
  const { getToken } = useAuth();
  useSyncExternalStore(suscribir, () => version);

  const recargar = useCallback(async () => {
    if (cargando) return cargando;
    cargando = pedir(getToken, '/api/email/etiquetas')
      .then((d) => { etiquetas = Array.isArray(d) ? d : []; avisar(); })
      .catch(() => { if (!etiquetas) { etiquetas = []; avisar(); } })
      .finally(() => { cargando = null; });
    return cargando;
  }, [getToken]);

  const org = getActiveOrganizacionId() || null;
  useEffect(() => {
    if (org !== orgDeLaCache) { orgDeLaCache = org; etiquetas = null; asignadas = new Map(); cargando = null; }
    if (!etiquetas) void recargar();
  }, [recargar, org]);

  const crear = useCallback(async (nombre: string, color: string) => {
    const e = await pedir(getToken, '/api/email/etiquetas', { method: 'POST', body: JSON.stringify({ nombre, color }) });
    await recargar();
    return e as EtiquetaCorreo;
  }, [getToken, recargar]);

  const editar = useCallback(async (id: string, cambios: { nombre?: string; color?: string }) => {
    await pedir(getToken, `/api/email/etiquetas/${id}`, { method: 'PATCH', body: JSON.stringify(cambios) });
    await recargar();
  }, [getToken, recargar]);

  const borrar = useCallback(async (id: string) => {
    await pedir(getToken, `/api/email/etiquetas/${id}`, { method: 'DELETE' });
    for (const [k, v] of asignadas) asignadas.set(k, v.filter((x) => x !== id));
    await recargar();
  }, [getToken, recargar]);

  const cargarAsignadas = useCallback(async (ids: string[]) => {
    const validos = [...new Set(ids)].filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 300);
    if (!validos.length) return;
    try {
      const d = await pedir(getToken, `/api/email/etiquetas/asignadas?ids=${encodeURIComponent(validos.join(','))}`);
      for (const id of validos) asignadas.set(id, d?.[id] || []);
      avisar();
    } catch { /* sin etiquetas visibles: no es grave */ }
  }, [getToken]);

  const poner = useCallback(async (emailId: string, ids: string[]) => {
    const antes = asignadas.get(emailId) || [];
    asignadas.set(emailId, ids); avisar(); // al momento; se deshace si falla
    try {
      const d = await pedir(getToken, `/api/email/etiquetas/correo/${emailId}`, { method: 'PUT', body: JSON.stringify({ etiquetas: ids }) });
      asignadas.set(emailId, d?.etiquetas || ids);
      void recargar(); // los totales
    } catch (e: any) {
      asignadas.set(emailId, antes); avisar();
      aviso.error(e?.message ? t(e.message) : t('No se pudo guardar.'));
    }
  }, [getToken, recargar]);

  return { etiquetas: etiquetas || [], cargadas: etiquetas !== null, asignadasDe: (id: string) => asignadas.get(id) || [], recargar, crear, editar, borrar, cargarAsignadas, poner };
}

/** Selector de color. */
function Colores({ valor, onChange }: { valor: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {COLORES_ETIQUETA.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} title={c}
          className={`h-4 w-4 rounded-full ring-offset-1 ${valor === c ? 'ring-2 ring-slate-500' : ''}`} style={{ backgroundColor: c }} />
      ))}
    </div>
  );
}

/** Formulario corto: nombre y color. */
function FormEtiqueta({ inicial, onGuardar, onCancelar }: { inicial?: { nombre: string; color: string }; onGuardar: (nombre: string, color: string) => Promise<void>; onCancelar: () => void }) {
  const [nombre, setNombre] = useState(inicial?.nombre || '');
  const [color, setColor] = useState(inicial?.color || COLORES_ETIQUETA[5]);
  const [guardando, setGuardando] = useState(false);
  const enviar = async () => {
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    try { await onGuardar(nombre.trim(), color); } catch (e: any) { aviso.error(e?.message ? t(e.message) : t('No se pudo guardar.')); } finally { setGuardando(false); }
  };
  return (
    <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm">
      <input autoFocus value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void enviar(); if (e.key === 'Escape') onCancelar(); }}
        placeholder={t("Nombre de la etiqueta")}
        className="h-7 w-full rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-red-300" />
      <Colores valor={color} onChange={setColor} />
      <div className="flex justify-end gap-1">
        <button type="button" onClick={onCancelar} className="rounded-md px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100">{t("Cancelar")}</button>
        <button type="button" onClick={() => void enviar()} disabled={!nombre.trim() || guardando}
          className="rounded-md bg-[#ab0433] px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-50">{inicial ? t("Guardar") : t("Crear")}</button>
      </div>
    </div>
  );
}

/** Sección «Etiquetas» del lateral del correo (igual para Gmail e IMAP). */
export function SeccionEtiquetas({ seleccionada, onElegir, disabled, cls }: {
  seleccionada: string;
  onElegir: (carpeta: string) => void;
  disabled?: boolean;
  cls: { borde: string; titulo: string; boton: string; activa: string; inactiva: string; apagado: string };
}) {
  const { etiquetas, crear, editar, borrar } = useEtiquetasCorreo();
  const [nueva, setNueva] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  return (
    <div className={`mt-2 border-t pt-2 ${cls.borde}`}>
      <div className="flex items-center justify-between px-3 pb-1">
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${cls.titulo}`}>{t("Etiquetas")}</p>
        <button type="button" disabled={disabled} onClick={() => setNueva(true)} title={t("Nueva etiqueta")}
          className={`rounded-full p-1 transition-colors disabled:opacity-40 ${cls.boton}`}><Plus size={12} /></button>
      </div>
      {nueva && (
        <div className="mx-2 mb-1">
          <FormEtiqueta onCancelar={() => setNueva(false)} onGuardar={async (n, c) => { await crear(n, c); setNueva(false); }} />
        </div>
      )}
      {etiquetas.length === 0 && !nueva && (
        <p className={`px-4 py-1 text-[11px] ${cls.apagado}`}>{t("Crea etiquetas para ordenar tus correos, sean de Gmail o de otro buzón.")}</p>
      )}
      {etiquetas.map((e) => {
        const activa = seleccionada === `ETQ:${e.id}`;
        if (editando === e.id) {
          return (
            <div key={e.id} className="mx-2 mb-1">
              <FormEtiqueta inicial={{ nombre: e.nombre, color: e.color }} onCancelar={() => setEditando(null)}
                onGuardar={async (n, c) => { await editar(e.id, { nombre: n, color: c }); setEditando(null); }} />
            </div>
          );
        }
        return (
          <div key={e.id} className={`group mx-2 flex w-[calc(100%-16px)] items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition-colors ${activa ? cls.activa : cls.inactiva}`}>
            <button type="button" disabled={disabled} onClick={() => onElegir(`ETQ:${e.id}`)} className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
              <span className="flex-1 truncate">{e.nombre}</span>
              {e.total > 0 && <span className="text-[10px] opacity-70">{e.total}</span>}
            </button>
            <button type="button" onClick={() => setEditando(e.id)} title={t("Editar etiqueta")} className="rounded p-0.5 opacity-0 hover:bg-black/5 group-hover:opacity-100"><Pencil size={11} /></button>
            <button type="button" title={t("Borrar etiqueta")}
              onClick={async () => {
                if (!(await confirmar({ titulo: t("¿Borrar la etiqueta «{nombre}»?", { nombre: e.nombre }), mensaje: t("Se quitará de los correos que la llevan. Los correos no se borran."), confirmar: t("Borrar"), peligro: true }))) return;
                try { await borrar(e.id); if (activa) onElegir('INBOX'); } catch (er: any) { aviso.error(er?.message ? t(er.message) : t('No se pudo borrar.')); }
              }}
              className="peligro rounded p-0.5 opacity-0 hover:bg-black/5 group-hover:opacity-100"><Trash2 size={11} /></button>
          </div>
        );
      })}
    </div>
  );
}

/** Etiquetas de un correo, en pequeño (lista y lector). */
export function ChipsEtiquetas({ emailId, grande }: { emailId: string; grande?: boolean }) {
  const { etiquetas, asignadasDe } = useEtiquetasCorreo();
  const ids = asignadasDe(emailId);
  if (!ids.length) return null;
  const lista = ids.map((id) => etiquetas.find((e) => e.id === id)).filter(Boolean) as EtiquetaCorreo[];
  if (!lista.length) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${grande ? '' : 'min-w-0'}`}>
      {lista.map((e) => (
        <span key={e.id} className={`inline-flex max-w-[140px] items-center gap-1 rounded-full border px-1.5 ${grande ? 'py-0.5 text-[11px]' : 'text-[10px] leading-4'} font-medium`}
          style={{ borderColor: `${e.color}55`, backgroundColor: `${e.color}14`, color: e.color }}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
          <span className="truncate">{e.nombre}</span>
        </span>
      ))}
    </span>
  );
}

/** Botón «Etiquetar» del lector: marcar y desmarcar etiquetas, o crear una nueva. */
export function BotonEtiquetas({ emailId, className }: { emailId: string; className: string }) {
  const { etiquetas, asignadasDe, poner, crear } = useEtiquetasCorreo();
  const [abierto, setAbierto] = useState(false);
  const [nueva, setNueva] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const puesta = asignadasDe(emailId);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (ev: MouseEvent) => { if (ref.current && !ref.current.contains(ev.target as Node)) { setAbierto(false); setNueva(false); } };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);
  if (!/^[0-9a-f-]{36}$/i.test(emailId)) return null; // solo correos guardados en Vantia
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setAbierto((a) => !a)} title={t("Etiquetar")} className={className}>
        <Tag size={17} />
      </button>
      {abierto && (
        <div className="absolute right-0 top-10 z-30 w-60 rounded-2xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl">
          <p className="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("Etiquetas")}</p>
          <div className="max-h-60 overflow-y-auto">
            {etiquetas.length === 0 && !nueva && <p className="px-2 py-1.5 text-xs text-slate-500">{t("Aún no tienes etiquetas.")}</p>}
            {etiquetas.map((e) => {
              const marcada = puesta.includes(e.id);
              return (
                <button key={e.id} type="button"
                  onClick={() => void poner(emailId, marcada ? puesta.filter((x) => x !== e.id) : [...puesta, e.id])}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${marcada ? 'border-transparent text-white' : 'border-slate-300'}`} style={marcada ? { backgroundColor: e.color } : undefined}>
                    {marcada && <Check size={11} />}
                  </span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: e.color }} />
                  <span className="flex-1 truncate">{e.nombre}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-1 border-t border-slate-100 pt-1">
            {nueva ? (
              <FormEtiqueta onCancelar={() => setNueva(false)}
                onGuardar={async (n, c) => { const e = await crear(n, c); setNueva(false); if (e?.id) await poner(emailId, [...puesta, e.id]); }} />
            ) : (
              <button type="button" onClick={() => setNueva(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-red-700 hover:bg-red-50">
                <Plus size={13} />{t("Nueva etiqueta")}</button>
            )}
          </div>
          <button type="button" onClick={() => setAbierto(false)} className="absolute right-1.5 top-1.5 rounded p-0.5 text-slate-400 hover:bg-slate-100" title={t("Cerrar")}><X size={12} /></button>
        </div>
      )}
    </div>
  );
}
