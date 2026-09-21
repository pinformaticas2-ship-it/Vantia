import { apiFetch } from './api';

// Abre el popup de Google (scope drive.file: solo los archivos/carpetas que
// crea esta app, nunca el resto del Drive) y manda el código al backend.
export function startGoogleDriveConnect(opts: {
  getToken: () => Promise<string | null>;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
  onConnected: () => void;
}) {
  const { getToken, onError, onBusy, onConnected } = opts;
  const goog = (window as any).google;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) { onError('VITE_GOOGLE_CLIENT_ID no está configurado.'); return; }
  if (!goog?.accounts?.oauth2) { onError('Google Identity Services aún se está cargando. Espera un momento y vuelve a intentarlo.'); return; }

  const codeClient = goog.accounts.oauth2.initCodeClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/drive.file',
    ux_mode: 'popup',
    access_type: 'offline',
    // 'consent' fuerza la pantalla de permisos siempre: es lo único que
    // garantiza que Google mande un refresh_token también al reconectar.
    prompt: 'consent',
    callback: async (resp: { code?: string; error?: string }) => {
      if (!resp.code) { onError('Error al conectar con Google: ' + (resp.error || 'Desconocido')); return; }
      onBusy(true);
      try {
        const data = await apiFetch('/api/organizacion/drive/exchange-code', {
          method: 'POST', getToken, body: JSON.stringify({ code: resp.code }),
        });
        if (data?.success === false) throw new Error(data.error);
        onConnected();
      } catch (e: any) {
        onError(e.message || 'No se pudo conectar Google Drive');
        onBusy(false);
      }
    },
  });
  codeClient.requestCode();
}
