import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { History, X } from 'lucide-react';
import { getOrganizacionResuelta } from './useOrganizacion';

// ── No perder lo que se está escribiendo (16/10/2026) ───────────────────────
//  - useAvisoSalida(sucio): si hay cambios sin guardar y se cierra o recarga
//    la pestaña, el navegador pregunta antes.
//  - useBorrador(...): además guarda una copia en este navegador mientras se
//    escribe. Si se sale de la página (o se cae la conexión, o se cierra sin
//    querer), al volver se ofrece "Recuperar borrador".
// Los borradores van por usuario Y organización: en un ordenador compartido
// nadie ve los de otro (ver feedback_multiuser_navigation).

const PREFIJO = 'vantia.borrador';
const CADUCIDAD_MS = 7 * 24 * 60 * 60 * 1000;

export function useAvisoSalida(sucio: boolean) {
  useEffect(() => {
    if (!sucio) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [sucio]);
}

// Fuera del borrador lo que no cabe o no tiene sentido guardar (fotos en base64...).
const sinPesados = (_k: string, v: unknown) => (typeof v === 'string' && v.length > 20000 ? undefined : v);

interface Guardado<T> { valor: T; fecha: number }

export function useBorrador<T>(clave: string | null, valor: T, sucio: boolean) {
  const { user } = useUser();
  // Sin saber aún la organización, no se guarda ni se ofrece nada: un
  // borrador nunca debe aparecer en un despacho distinto del suyo.
  const orgId = getOrganizacionResuelta();
  const llave = clave && user?.id && orgId ? `${PREFIJO}.${user.id}.${orgId}.${clave}` : null;
  const [pendiente, setPendiente] = useState<Guardado<T> | null>(null);
  const decidido = useRef(false);

  // Al entrar: ¿había un borrador de la última vez?
  useEffect(() => {
    decidido.current = false;
    setPendiente(null);
    if (!llave) return;
    try {
      const raw = localStorage.getItem(llave);
      if (!raw) return;
      const g = JSON.parse(raw) as Guardado<T>;
      if (!g?.fecha || Date.now() - g.fecha > CADUCIDAD_MS) { localStorage.removeItem(llave); return; }
      setPendiente(g);
    } catch { /* sin almacenamiento */ }
  }, [llave]);

  // Mientras se escribe, una copia cada poco (sin pisar un borrador que aún
  // no se ha decidido si recuperar).
  useEffect(() => {
    if (!llave || !sucio || pendiente) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(llave, JSON.stringify({ valor, fecha: Date.now() }, sinPesados)); } catch { /* lleno o bloqueado */ }
    }, 600);
    return () => clearTimeout(t);
  }, [llave, valor, sucio, pendiente]);

  useAvisoSalida(sucio);

  const limpiar = useCallback(() => {
    setPendiente(null);
    if (llave) try { localStorage.removeItem(llave); } catch { /* */ }
  }, [llave]);

  const recuperar = useCallback((): T | null => {
    const v = pendiente?.valor ?? null;
    decidido.current = true;
    setPendiente(null);
    return v;
  }, [pendiente]);

  return { pendiente, recuperar, descartar: limpiar, limpiar };
}

function haceCuanto(fecha: number) {
  const min = Math.round((Date.now() - fecha) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(fecha).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Franja "Tienes un borrador sin guardar · Recuperar / Descartar". */
export function AvisoBorrador({ fecha, onRecuperar, onDescartar }: { fecha: number; onRecuperar: () => void; onDescartar: () => void }) {
  return (
    <div role="status" className="aviso-entra flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <History size={17} className="shrink-0 text-amber-600" />
      <p className="flex-1 min-w-[12rem] text-sm text-amber-900">
        Tienes cambios sin guardar de <strong>{haceCuanto(fecha)}</strong>. ¿Quieres recuperarlos?
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onRecuperar} className="h-8 px-3 rounded-lg bg-amber-600 text-xs font-semibold text-white hover:bg-amber-700">
          Recuperar
        </button>
        <button type="button" onClick={onDescartar} className="h-8 px-2.5 rounded-lg text-xs font-semibold text-amber-800 hover:bg-amber-100 inline-flex items-center gap-1">
          <X size={13} /> Descartar
        </button>
      </div>
    </div>
  );
}
