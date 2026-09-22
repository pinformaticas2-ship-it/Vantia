// Flujo de vinculación de Dropbox (popup + redirect_uri propio, porque a
// diferencia de Google no hay una librería JS oficial para hacerlo sin salir
// de la página). Requiere una app creada en dropbox.com/developers/apps con
// VITE_DROPBOX_APP_KEY (frontend) y DROPBOX_APP_KEY/DROPBOX_APP_SECRET
// (backend), y el redirect URI de abajo dado de alta en esa app.
const REDIRECT_PATH = '/dropbox-oauth-callback';

export function startDropboxConnect(opts: {
  getToken: () => Promise<string | null>;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
  onConnected: () => void;
}) {
  const { getToken, onError, onBusy, onConnected } = opts;
  const appKey = import.meta.env.VITE_DROPBOX_APP_KEY as string | undefined;
  if (!appKey) { onError('VITE_DROPBOX_APP_KEY no está configurado.'); return; }

  const redirectUri = `${window.location.origin}${REDIRECT_PATH}`;
  const state = Math.random().toString(36).slice(2);
  const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(appKey)}`
    + `&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&token_access_type=offline&state=${state}`;

  const popup = window.open(authUrl, 'dropbox-oauth', 'width=520,height=680');
  if (!popup) {
    onError('El navegador ha bloqueado la ventana emergente. Permite ventanas emergentes para vincular Dropbox.');
    return;
  }

  onBusy(true);
  let settled = false;

  const cleanup = () => {
    window.removeEventListener('message', onMessage);
    window.clearInterval(poll);
  };

  const onMessage = async (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== 'dropbox-oauth' || event.data?.state !== state) return;
    settled = true;
    cleanup();
    if (event.data.error) {
      onError(event.data.error === 'access_denied' ? 'Conexión con Dropbox cancelada.' : `Error al conectar con Dropbox: ${event.data.error}`);
      onBusy(false);
      return;
    }
    if (!event.data.code) {
      onError('Dropbox no ha devuelto un código de autorización.');
      onBusy(false);
      return;
    }
    try {
      const token = await getToken();
      const res = await fetch('/api/organizacion/dropbox/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: event.data.code, redirectUri }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) throw new Error(data.error || 'No se pudo conectar Dropbox');
      onConnected();
    } catch (e: any) {
      onError(e.message || 'No se pudo conectar Dropbox');
      onBusy(false);
    }
  };
  window.addEventListener('message', onMessage);

  // Si el usuario cierra el popup a mano sin completar el flujo, que el
  // botón no se quede en "Conectando…" para siempre.
  const poll = window.setInterval(() => {
    if (popup.closed) {
      window.clearInterval(poll);
      if (!settled) { window.removeEventListener('message', onMessage); onBusy(false); }
    }
  }, 500);
}
