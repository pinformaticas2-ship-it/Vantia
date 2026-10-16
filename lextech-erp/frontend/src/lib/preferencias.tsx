import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { apiFetch } from './api';

// ── Preferencias personales (14/10/2026) ─────────────────────────────────────
// Modo claro/oscuro/sistema, página de inicio, primer día de la semana en la
// Agenda, atajos de teclado y "Mi perfil" (cargo, teléfono). Se guardan en el
// servidor (backend: /api/preferences/extras) y se cachean en este navegador
// para aplicarlas sin parpadeo al cargar.

export type Modo = 'claro' | 'oscuro' | 'sistema';
export interface Preferencias {
  modo: Modo;
  inicio: string;
  primerDia: 'lunes' | 'domingo';
  atajos: boolean;
  cargo: string;
  telefono: string;
  texto: TamanoTexto;
}

export type TamanoTexto = 'normal' | 'grande' | 'muy_grande';
/** Tamaño de la letra base: todo lo demás va en rem y crece con ella. */
export const TAMANOS_TEXTO: { valor: TamanoTexto; label: string; px: number }[] = [
  { valor: 'normal', label: 'Normal', px: 16 },
  { valor: 'grande', label: 'Grande', px: 17.5 },
  { valor: 'muy_grande', label: 'Muy grande', px: 19 },
];

export const PREFERENCIAS_POR_DEFECTO: Preferencias = {
  modo: 'claro', inicio: '/dashboard', primerDia: 'lunes', atajos: true, cargo: '', telefono: '', texto: 'normal',
};

export const PAGINAS_INICIO: { path: string; label: string }[] = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/dashboard/agenda', label: 'Agenda' },
  { path: '/dashboard/expedientes', label: 'Expedientes' },
  { path: '/dashboard/tareas', label: 'Tareas' },
  { path: '/dashboard/vistas', label: 'Vistas' },
  { path: '/dashboard/chat', label: 'Chat' },
  { path: '/dashboard/correo', label: 'Correo' },
  { path: '/dashboard/clientes', label: 'Clientes' },
];

const CLAVE = 'vantia.preferencias';

/** Completa y limpia lo que llega (apiFetch convierte "" en null). */
function normalizar(raw: any): Preferencias {
  const p = { ...PREFERENCIAS_POR_DEFECTO, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    modo: p.modo === 'oscuro' || p.modo === 'sistema' ? p.modo : 'claro',
    inicio: typeof p.inicio === 'string' && p.inicio ? p.inicio : '/dashboard',
    primerDia: p.primerDia === 'domingo' ? 'domingo' : 'lunes',
    atajos: p.atajos !== false,
    cargo: typeof p.cargo === 'string' ? p.cargo : '',
    telefono: typeof p.telefono === 'string' ? p.telefono : '',
    texto: p.texto === 'grande' || p.texto === 'muy_grande' ? p.texto : 'normal',
  };
}

function leerCache(): Preferencias {
  try {
    const raw = localStorage.getItem(CLAVE);
    return raw ? normalizar(JSON.parse(raw)) : PREFERENCIAS_POR_DEFECTO;
  } catch {
    return PREFERENCIAS_POR_DEFECTO;
  }
}

/** ¿Va en oscuro ahora? (con "sistema", lo que diga el ordenador). */
export function esOscuro(modo: Modo): boolean {
  if (modo === 'oscuro') return true;
  if (modo === 'sistema') return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return false;
}

/** Cambio de apariencia con un fundido corto de la pantalla entera (View
 *  Transitions: el navegador funde dos capturas, así que va fluido aunque la
 *  página tenga miles de elementos). Sin soporte, el cambio es instantáneo.
 *  16/10/2026: antes se animaba cada elemento por separado y se notaba lento. */
export function conFundido(cambio: () => void) {
  const doc = document as any;
  const sinMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (typeof doc.startViewTransition !== 'function' || sinMovimiento) { cambio(); return; }
  // Si empieza otro fundido antes de acabar este, el navegador cancela el
  // primero y rechaza sus promesas: no es un error, se ignora.
  const t = doc.startViewTransition(cambio);
  for (const pr of [t?.ready, t?.finished, t?.updateCallbackDone]) pr?.catch?.(() => {});
}

export function aplicarModo(modo: Modo) {
  const html = document.documentElement;
  const nuevo = esOscuro(modo) ? 'oscuro' : 'claro';
  const anterior = html.getAttribute('data-modo');
  if (anterior === nuevo) return;
  // En la primera carga, sin animación; al cambiar, fundido.
  if (anterior) conFundido(() => html.setAttribute('data-modo', nuevo));
  else html.setAttribute('data-modo', nuevo);
}

export function aplicarTexto(texto: TamanoTexto) {
  const px = TAMANOS_TEXTO.find((t) => t.valor === texto)?.px ?? 16;
  document.documentElement.style.fontSize = px === 16 ? '' : `${px}px`;
  document.documentElement.style.setProperty('--escala-texto', String(px / 16));
}

// Lo antes posible (al importar el módulo): el modo y el tamaño guardados, sin parpadeo.
if (typeof document !== 'undefined') { aplicarModo(leerCache().modo); aplicarTexto(leerCache().texto); }

/** Primer día de la semana para la Agenda (lectura directa, sin contexto). */
export function primerDiaSemana(): 'lunes' | 'domingo' {
  return leerCache().primerDia;
}

interface Ctx {
  prefs: Preferencias;
  cargado: boolean;
  guardar: (cambios: Partial<Preferencias>) => Promise<void>;
}

const PreferenciasContext = createContext<Ctx>({
  prefs: PREFERENCIAS_POR_DEFECTO,
  cargado: false,
  guardar: async () => {},
});

export function PreferenciasProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [prefs, setPrefs] = useState<Preferencias>(leerCache);
  const [cargado, setCargado] = useState(false);

  const fijar = useCallback((p: Preferencias) => {
    setPrefs(p);
    try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
    aplicarModo(p.modo);
    aplicarTexto(p.texto);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    apiFetch('/api/preferences/extras', { getToken })
      .then((res) => { if (res?.data) fijar(normalizar(res.data)); })
      .catch(() => {})
      .finally(() => setCargado(true));
  }, [isLoaded, isSignedIn, getToken, fijar]);

  // Con "sistema", seguir al ordenador si cambia mientras la app está abierta.
  useEffect(() => {
    if (prefs.modo !== 'sistema' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => aplicarModo('sistema');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [prefs.modo]);

  const guardar = useCallback(async (cambios: Partial<Preferencias>) => {
    const anterior = prefs;
    fijar(normalizar({ ...prefs, ...cambios }));
    try {
      const res = await apiFetch('/api/preferences/extras', { method: 'PUT', getToken, body: JSON.stringify(cambios) });
      if (res?.success === false) throw new Error(res.error);
      if (res?.data) fijar(normalizar(res.data));
    } catch (e) {
      fijar(anterior);
      throw e;
    }
  }, [prefs, fijar, getToken]);

  return <PreferenciasContext.Provider value={{ prefs, cargado, guardar }}>{children}</PreferenciasContext.Provider>;
}

export function usePreferencias() {
  return useContext(PreferenciasContext);
}

/** Colores para los componentes de Clerk (Seguridad, menú del usuario): no
 *  usan las clases de la app, así que el modo oscuro hay que pasárselo. Los
 *  mismos grises que lib/temasExtra.css. */
export function useAparienciaClerk(base: { variables?: Record<string, string>; elements?: Record<string, any> } = {}) {
  const { prefs } = usePreferencias();
  if (!esOscuro(prefs.modo)) return base;
  return {
    ...base,
    variables: {
      ...base.variables,
      colorBackground: '#1a1d22',
      colorText: '#eef0f3',
      colorTextSecondary: '#aeb5bf',
      colorInputBackground: '#262a31',
      colorInputText: '#eef0f3',
      colorNeutral: '#eef0f3',
      colorTextOnPrimaryBackground: '#ffffff',
      colorShimmer: 'rgba(255,255,255,0.08)',
    },
  };
}
