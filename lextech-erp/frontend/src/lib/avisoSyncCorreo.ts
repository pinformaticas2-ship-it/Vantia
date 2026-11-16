import { t } from './i18n';

// El aviso de sincronización del correo (email_accounts.sync_warning) llega del
// servidor como texto técnico: «conexión: connect ECONNREFUSED 127.0.0.1:993 ·
// INBOX: Tiempo agotado (30 s): …». Aquí se convierte en algo comprensible y en
// el idioma de la app (16/11/2026). Lo que no se reconoce se deja tal cual.

const REGLAS: [RegExp, string][] = [
  [/ECONNREFUSED/i, 'el servidor de correo rechaza la conexión (¿está bien el servidor y el puerto?)'],
  [/ENOTFOUND|EAI_AGAIN|getaddrinfo/i, 'no se encuentra el servidor de correo (revisa la dirección)'],
  [/ETIMEDOUT|Tiempo agotado|timed? ?out/i, 'el servidor de correo tarda demasiado en responder'],
  [/ECONNRESET|socket hang up|closed unexpectedly/i, 'el servidor de correo cortó la conexión'],
  [/AUTHENTICATIONFAILED|Invalid credentials|authentication failed|LOGIN failed|Username and Password not accepted/i, 'el usuario o la contraseña del correo no son correctos'],
  [/self[- ]signed|certificate|CERT_/i, 'el certificado de seguridad del servidor de correo no es válido'],
];

function trozo(texto: string): string {
  const m = /^\s*([^:]{1,60}):\s*(.*)$/s.exec(texto);
  const lugar = m ? m[1].trim() : '';
  const detalle = m ? m[2] : texto;
  const regla = REGLAS.find(([re]) => re.test(detalle));
  const que = regla ? t(regla[1]) : detalle;
  if (!lugar) return que;
  const donde = lugar.toLowerCase() === 'conexión' ? t('Conexión') : t('Carpeta {carpeta}', { carpeta: lugar });
  return `${donde}: ${que}`;
}

export function avisoSyncCorreo(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto.split(' · ').map(trozo).join(' · ');
}
