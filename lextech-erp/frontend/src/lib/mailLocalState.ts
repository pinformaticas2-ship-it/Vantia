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

// ── Borradores de correo guardados en el navegador ───────────────────────────
// Antes iban en una clave global ('lextech-email-drafts-v1'): un borrador de
// una organización salía en Borradores de cualquier otra (y de cualquier
// usuario del mismo navegador). Los antiguos no se pueden atribuir con
// certeza; para no perder texto escrito se trasladan UNA vez a la primera
// organización en la que se abra Correo.
const LEGACY_DRAFTS_KEY = 'lextech-email-drafts-v1';
const draftsKey = () => `vantia-mail-drafts-v2:${scope()}`;

export function readDraftsRaw(): string | null {
  try {
    const legacy = localStorage.getItem(LEGACY_DRAFTS_KEY);
    if (legacy !== null) {
      const current = JSON.parse(localStorage.getItem(draftsKey()) || '[]');
      const old = JSON.parse(legacy || '[]');
      localStorage.setItem(draftsKey(), JSON.stringify([...(Array.isArray(current) ? current : []), ...(Array.isArray(old) ? old : [])]));
      localStorage.removeItem(LEGACY_DRAFTS_KEY);
    }
    return localStorage.getItem(draftsKey());
  } catch {
    return null;
  }
}

export function writeDraftsRaw(value: string) {
  try { localStorage.setItem(draftsKey(), value); } catch { /* noop */ }
}
