import { getActiveOrganizacionId } from './api';

// Estado de Correo que se guarda en el navegador, SIEMPRE por usuario y por
// organización. Antes el acceso a Gmail se guardaba con una clave global
// ('lextech-gmail-token-v1'): al abrir Correo en cualquier organización se
// recuperaba y se mostraba la bandeja de Gmail conectada en OTRA (p.ej.
// Avalentia), y el contador de no leídos vigilaba ese mismo buzón.

const LEGACY_GMAIL_TOKEN_KEY = 'lextech-gmail-token-v1';
/** Evento que se lanza al borrar el acceso a Gmail (para EmailUnreadContext). */
export const GMAIL_TOKEN_CLEARED_EVENT = 'vantia:gmail-token-cleared';

function scope(): string {
  const userId = (window as any).Clerk?.user?.id || 'anon';
  const orgId = getActiveOrganizacionId() || 'sin-org';
  return `${userId}:${orgId}`;
}

const gmailKey = () => `vantia-gmail-token-v2:${scope()}`;
const lastAccountKey = () => `vantia-mail-last-account-v1:${scope()}`;

function read<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

/** La clave global antigua no sabe de qué organización era: se descarta. */
function dropLegacy() {
  try { localStorage.removeItem(LEGACY_GMAIL_TOKEN_KEY); } catch { /* noop */ }
}

export interface StoredGmailToken { access_token: string; expires_at: number }

/** Acceso a Gmail guardado para la organización activa, si sigue vigente. */
export function getStoredGmailToken(marginMs = 0): StoredGmailToken | null {
  dropLegacy();
  const t = read<StoredGmailToken>(gmailKey());
  return t?.access_token && t.expires_at && Date.now() < t.expires_at - marginMs ? t : null;
}

export function saveGmailToken(access_token: string, expires_at: number) {
  dropLegacy();
  try { localStorage.setItem(gmailKey(), JSON.stringify({ access_token, expires_at })); } catch { /* noop */ }
}

export function clearGmailToken() {
  dropLegacy();
  try { localStorage.removeItem(gmailKey()); } catch { /* noop */ }
  window.dispatchEvent(new Event(GMAIL_TOKEN_CLEARED_EVENT));
}

/** Última cuenta usada en Correo en esta organización (la predeterminada al abrir). */
export type LastMailAccount = { type: 'imap' | 'gmail'; id: string };

export function getLastMailAccount(): LastMailAccount | null {
  return read<LastMailAccount>(lastAccountKey());
}

export function saveLastMailAccount(account: LastMailAccount) {
  try { localStorage.setItem(lastAccountKey(), JSON.stringify(account)); } catch { /* noop */ }
}
