import { t } from './i18n';

// Alta de WhatsApp con Meta (Embedded Signup, 12/11/2026). Se abre la ventana
// de Meta donde el despacho elige (o crea) su cuenta de WhatsApp Business y su
// número; al terminar, Meta devuelve un «code» (para canjearlo en el servidor)
// y, por mensaje entre ventanas, el phone_number_id y el waba_id.
// Backend: POST /api/whatsapp/alta-meta.

declare global { interface Window { FB?: any; fbAsyncInit?: () => void } }

let cargando: Promise<any> | null = null;

function cargarSdk(appId: string, version: string): Promise<any> {
  if (window.FB) { window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version }); return Promise.resolve(window.FB); }
  cargando ??= new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(window.FB);
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/es_ES/sdk.js';
    s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
    s.onerror = () => { cargando = null; reject(new Error(t('No se pudo cargar Meta. Revisa la conexión o si un bloqueador lo impide.'))); };
    document.body.appendChild(s);
  });
  return cargando;
}

export interface ResultadoAltaMeta { code: string; phoneNumberId: string; wabaId: string }

export async function altaWhatsAppConMeta(opts: { appId: string; configId: string; graphVersion: string }): Promise<ResultadoAltaMeta> {
  const FB = await cargarSdk(opts.appId, opts.graphVersion);
  return new Promise((resolve, reject) => {
    let datos: { phoneNumberId: string; wabaId: string } | null = null;
    let cancelado = false;
    const alMensaje = (e: MessageEvent) => {
      let origen = '';
      try { origen = new URL(e.origin).hostname; } catch { return; }
      if (!/(^|\.)facebook\.com$/.test(origen)) return;
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (d.event === 'FINISH' || d.event === 'FINISH_ONLY_WABA') datos = { phoneNumberId: String(d.data?.phone_number_id || ''), wabaId: String(d.data?.waba_id || '') };
        else if (d.event === 'CANCEL') cancelado = true;
      } catch { /* otros mensajes */ }
    };
    window.addEventListener('message', alMensaje);
    const terminar = (fn: () => void) => { window.removeEventListener('message', alMensaje); fn(); };

    FB.login((resp: any) => {
      const code = resp?.authResponse?.code;
      if (!code) { terminar(() => reject(new Error(cancelado ? t('Se canceló la conexión con Meta.') : t('No se completó la conexión con Meta.')))); return; }
      // El mensaje con el número a veces llega un instante después.
      const inicio = Date.now();
      const esperar = () => {
        if (datos?.phoneNumberId && datos.wabaId) terminar(() => resolve({ code, ...datos! }));
        else if (Date.now() - inicio > 4000) terminar(() => reject(new Error(t('Meta no ha devuelto el número de WhatsApp. Vuelve a intentarlo y elige un número al final.'))));
        else window.setTimeout(esperar, 200);
      };
      esperar();
    }, {
      config_id: opts.configId,
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
    });
  });
}
