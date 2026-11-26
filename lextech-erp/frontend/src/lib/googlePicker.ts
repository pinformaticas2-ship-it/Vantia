// ── Selector oficial de Google Drive (Google Picker), 26/11/2026 ────────────
// Con el selector, el despacho elige en una ventana de Google la carpeta de
// plantillas (y las plantillas que ya tenía) y Vantia recibe acceso SOLO a eso,
// con el permiso básico "drive.file". Así no hace falta pedir leer/escribir
// todo el Drive (permisos restringidos: Google enseña "aplicación no
// verificada" y exige una auditoría de seguridad).
//
// Necesita VITE_GOOGLE_API_KEY (clave de API de Google Cloud con la "Google
// Picker API" activada). Sin ella, Ajustes sigue con el sistema anterior.

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CARPETA = 'application/vnd.google-apps.folder';
const WORD = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.document',
];

export interface ElegidoDrive { id: string; nombre: string; mimeType: string; esCarpeta: boolean }

const clave = () => (import.meta.env.VITE_GOOGLE_API_KEY as string | undefined) || '';
const clientId = () => (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';

/** ¿Está configurado el selector de Google? */
export const hayPickerGoogle = () => Boolean(clave() && clientId());

let cargaGapi: Promise<void> | null = null;
function cargarPicker(): Promise<void> {
  if ((window as any).google?.picker) return Promise.resolve();
  if (!cargaGapi) {
    cargaGapi = new Promise<void>((ok, ko) => {
      const listo = () => (window as any).gapi.load('picker', { callback: () => ok(), onerror: () => ko(new Error('No se pudo cargar el selector de Google.')) });
      if ((window as any).gapi?.load) { listo(); return; }
      const s = document.createElement('script');
      s.src = 'https://apis.google.com/js/api.js';
      s.async = true;
      s.onload = listo;
      s.onerror = () => { cargaGapi = null; ko(new Error('No se pudo cargar el selector de Google.')); };
      document.head.appendChild(s);
    });
  }
  return cargaGapi;
}

// El selector necesita un token del navegador. Se pide con el mismo permiso
// básico (drive.file) y la misma app, así lo que se elija lo ve también el
// servidor de Vantia con la conexión de Drive del despacho.
let tokenGuardado: { token: string; exp: number } | null = null;
function tokenPicker(): Promise<string> {
  if (tokenGuardado && tokenGuardado.exp > Date.now() + 60_000) return Promise.resolve(tokenGuardado.token);
  return new Promise((ok, ko) => {
    const goog = (window as any).google;
    if (!goog?.accounts?.oauth2) { ko(new Error('Google Identity Services aún se está cargando. Espera un momento y vuelve a intentarlo.')); return; }
    const cliente = goog.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPE,
      callback: (r: any) => {
        if (!r?.access_token) { ko(new Error('Google no ha dado permiso.')); return; }
        tokenGuardado = { token: r.access_token, exp: Date.now() + Number(r.expires_in || 3000) * 1000 };
        ok(r.access_token);
      },
      error_callback: (e: any) => ko(new Error(e?.type === 'popup_closed' ? 'Se cerró la ventana de Google.' : 'No se pudo abrir la ventana de Google.')),
    });
    cliente.requestAccessToken({ prompt: '' });
  });
}

/**
 * Abre el selector de Google.
 *  - 'carpeta': elegir UNA carpeta (la de plantillas).
 *  - 'plantillas': elegir varias plantillas de Word y subcarpetas, empezando en `padre`.
 * Devuelve lo elegido, o null si se cierra sin elegir.
 */
export async function abrirPickerGoogle(opts: { modo: 'carpeta' | 'plantillas'; padre?: string; titulo: string; idioma?: string }): Promise<ElegidoDrive[] | null> {
  const [, token] = await Promise.all([cargarPicker(), tokenPicker()]);
  const g = (window as any).google.picker;
  const appId = clientId().split('-')[0]; // el número de proyecto de Google Cloud
  return new Promise((ok) => {
    let vista: any;
    if (opts.modo === 'carpeta') {
      vista = new g.DocsView(g.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(CARPETA);
    } else {
      vista = new g.DocsView(g.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes([...WORD, CARPETA].join(','));
      if (opts.padre) vista.setParent(opts.padre);
    }
    let b = new g.PickerBuilder()
      .addView(vista)
      .enableFeature(g.Feature.SUPPORT_DRIVES)
      .setOAuthToken(token)
      .setDeveloperKey(clave())
      .setAppId(appId)
      .setLocale(opts.idioma === 'en' ? 'en' : 'es')
      .setTitle(opts.titulo)
      .setCallback((d: any) => {
        if (d.action === g.Action.PICKED) {
          ok((d.docs || []).map((x: any) => ({ id: x.id, nombre: x.name, mimeType: x.mimeType, esCarpeta: x.mimeType === CARPETA })));
        } else if (d.action === g.Action.CANCEL) ok(null);
      });
    if (opts.modo === 'plantillas') b = b.enableFeature(g.Feature.MULTISELECT_ENABLED);
    b.build().setVisible(true);
  });
}
