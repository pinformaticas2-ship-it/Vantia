import React from 'react';
import { AlertTriangle, Home, RotateCcw, Copy, Check } from 'lucide-react';
import { apiFetch } from './api';

// ── Que un fallo no deje la página en blanco (16/10/2026) ───────────────────
// Antes, un error en cualquier pantalla (p. ej. "Mi perfil" con un dato
// inesperado) dejaba la app entera en blanco. Ahora:
//  - <PantallaSegura> rodea cada página: si falla, se ve "Algo ha fallado en
//    esta sección" con Reintentar / Ir al inicio, y la barra lateral sigue ahí.
//  - <AppSegura> rodea toda la app por si falla la propia estructura.
//  - El error se envía al backend (/api/errores-cliente) para enterarnos.

const getTokenGlobal = async () => {
  try { return (await (window as any).Clerk?.session?.getToken()) ?? null; } catch { return null; }
};

const enviados = new Set<string>();

export function reportarError(error: unknown, extra?: { tipo?: string; componentStack?: string }) {
  const e = error as any;
  const mensaje = String(e?.message || e || 'Error desconocido').slice(0, 1000);
  // Ruido que no es un fallo de la app.
  if (/ResizeObserver loop|AbortError|The user aborted|Load failed|NetworkError when attempting|Failed to fetch/i.test(mensaje)) return;
  const clave = `${extra?.tipo || 'pantalla'}|${mensaje}|${location.pathname}`;
  if (enviados.has(clave)) return;
  enviados.add(clave);
  if (import.meta.env.DEV) console.error('[error-cliente]', error);
  void apiFetch('/api/errores-cliente', {
    method: 'POST',
    getToken: getTokenGlobal,
    body: JSON.stringify({
      tipo: extra?.tipo || 'pantalla',
      mensaje,
      stack: String(e?.stack || ''),
      componentStack: extra?.componentStack || '',
      ruta: location.pathname + location.search,
      version: typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : '',
    }),
  }).catch(() => {});
}

/** Errores sueltos (fuera de React): se apuntan, sin molestar al usuario. */
export function instalarCapturaGlobal() {
  window.addEventListener('error', (ev) => reportarError(ev.error || ev.message, { tipo: 'global' }));
  window.addEventListener('unhandledrejection', (ev) => reportarError(ev.reason, { tipo: 'promesa' }));
}

// Tras publicar una versión nueva, una pestaña abierta puede pedir un archivo
// que ya no existe: se recarga una vez en vez de mostrar el error.
function esVersionAntigua(error: unknown) {
  return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \d+ failed/i.test(String((error as any)?.message || error));
}
function recargarUnaVez() {
  try {
    if (sessionStorage.getItem('vantia.recarga-version')) return false;
    sessionStorage.setItem('vantia.recarga-version', '1');
  } catch { return false; }
  location.reload();
  return true;
}

interface Props { children: React.ReactNode; completa?: boolean }
interface Estado { error: Error | null; copiado: boolean }

class Barrera extends React.Component<Props, Estado> {
  state: Estado = { error: null, copiado: false };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (esVersionAntigua(error) && recargarUnaVez()) return;
    reportarError(error, { tipo: this.props.completa ? 'app' : 'pantalla', componentStack: info.componentStack || '' });
  }
  private copiar = () => {
    const e = this.state.error;
    const texto = `Error en Vantia\nPágina: ${location.pathname}${location.search}\nFecha: ${new Date().toLocaleString('es-ES')}\nVersión: ${typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : '?'}\n\n${e?.message || ''}`;
    navigator.clipboard?.writeText(texto).then(() => {
      this.setState({ copiado: true });
      setTimeout(() => this.setState({ copiado: false }), 2000);
    }).catch(() => {});
  };
  render() {
    if (!this.state.error) return this.props.children;
    const completa = this.props.completa;
    return (
      <div className={`${completa ? 'min-h-screen bg-slate-50' : 'min-h-[60vh]'} flex items-center justify-center p-6`}>
        <div className="w-full max-w-md text-center">
          <span className="peligro mx-auto mb-4 h-14 w-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
            <AlertTriangle size={26} />
          </span>
          <h1 className="text-lg font-semibold text-slate-900">
            {completa ? 'Vantia ha tenido un problema' : 'Algo ha fallado en esta sección'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            No has perdido nada de lo que ya estaba guardado. Ya nos ha llegado el aviso del error;
            prueba a reintentar y, si se repite, escríbenos desde el Centro de soporte.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={() => (completa ? location.reload() : this.setState({ error: null }))}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <RotateCcw size={15} /> Reintentar
            </button>
            <a
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Home size={15} /> Ir al inicio
            </a>
          </div>
          <button type="button" onClick={this.copiar} className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            {this.state.copiado ? <Check size={13} /> : <Copy size={13} />}
            {this.state.copiado ? 'Copiado' : 'Copiar detalles para soporte'}
          </button>
        </div>
      </div>
    );
  }
}

/** Para una página: el resto de la app (barra lateral, cabecera) sigue funcionando. */
export function PantallaSegura({ children, clave }: { children: React.ReactNode; clave?: string }) {
  return <Barrera key={clave}>{children}</Barrera>;
}

/** Para la app entera. */
export function AppSegura({ children }: { children: React.ReactNode }) {
  return <Barrera completa>{children}</Barrera>;
}
