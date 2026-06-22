/**
 * Thin wrapper around the EmailEngine REST API.
 * EmailEngine runs as a sidecar service (Docker) and exposes a local REST API.
 * Docs: https://emailengine.app/api
 *
 * Environment vars:
 *   EMAIL_ENGINE_URL    – base URL, e.g. http://emailengine:3000  (default: http://localhost:3000)
 *   EMAIL_ENGINE_TOKEN  – API access token set in EmailEngine settings
 */

const BASE_URL  = (process.env.EMAIL_ENGINE_URL   || 'http://localhost:3000').replace(/\/$/, '');
const API_TOKEN = process.env.EMAIL_ENGINE_TOKEN  || '';

export function isEmailEngineEnabled(): boolean {
  return Boolean(process.env.EMAIL_ENGINE_URL);
}

async function request<T = any>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (API_TOKEN) headers['Authorization'] = `Bearer ${API_TOKEN}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = `EmailEngine ${method} ${path} → ${res.status}`;
    try { const j = await res.json(); msg += `: ${j?.error || j?.message || JSON.stringify(j)}`; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ── Account management ────────────────────────────────────────────────────────

export interface EEAccountPayload {
  accountId: string;   // our DB UUID used as EmailEngine account id
  name?: string;
  imap: {
    auth: { user: string; pass: string };
    host: string; port: number; secure: boolean;
    tls?: { rejectUnauthorized: boolean };
  };
  smtp: {
    auth: { user: string; pass: string };
    host: string; port: number; secure: boolean;
  };
}

export async function eeRegisterAccount(payload: EEAccountPayload): Promise<void> {
  await request('POST', '/v1/account', {
    account: payload.accountId,
    name:    payload.name || payload.imap.auth.user,
    imap: {
      auth: payload.imap.auth,
      host: payload.imap.host,
      port: payload.imap.port,
      secure: payload.imap.secure,
      tls:  payload.imap.tls ?? { rejectUnauthorized: false },
    },
    smtp: {
      auth: payload.smtp.auth,
      host: payload.smtp.host,
      port: payload.smtp.port,
      secure: payload.smtp.secure,
    },
  });
}

export async function eeUpdateAccount(accountId: string, payload: Partial<EEAccountPayload>): Promise<void> {
  const body: any = {};
  if (payload.name) body.name = payload.name;
  if (payload.imap) body.imap = { ...payload.imap, tls: { rejectUnauthorized: false } };
  if (payload.smtp) body.smtp = payload.smtp;
  await request('PUT', `/v1/account/${accountId}`, body);
}

export async function eeDeleteAccount(accountId: string): Promise<void> {
  try {
    await request('DELETE', `/v1/account/${accountId}`);
  } catch (e: any) {
    // If account not found in EmailEngine, that's fine — already gone
    if (!String(e?.message || '').includes('404')) throw e;
  }
}

// ── Messages ──────────────────────────────────────────────────────────────────

export interface EEAttachment {
  id:          string;
  filename:    string;
  contentType: string;
  size:        number;
  inline:      boolean;
}

export interface EEMessage {
  id:             string;
  uid:            number;
  emailId?:       string;
  threadId?:      string;
  date:           string;
  flags:          string[];
  subject:        string;
  from:           { name: string; address: string };
  to:             { name: string; address: string }[];
  cc:             { name: string; address: string }[];
  hasAttachments: boolean;
  attachments:    EEAttachment[];
  preview:        string;
  messageId:      string;
  text?: {
    id:          string;
    plain?:      string;
    html?:       string;
    hasMore?:    boolean;
  };
}

export async function eeGetMessage(accountId: string, messageId: string): Promise<EEMessage> {
  return request<EEMessage>('GET', `/v1/account/${accountId}/message/${messageId}?textType=*`);
}

export async function eeGetAttachment(accountId: string, attachmentId: string): Promise<Buffer> {
  const url  = `${BASE_URL}/v1/account/${accountId}/attachment/${attachmentId}`;
  const headers: Record<string, string> = {};
  if (API_TOKEN) headers['Authorization'] = `Bearer ${API_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`EmailEngine attachment ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Webhook configuration ─────────────────────────────────────────────────────

export async function eeConfigureWebhook(webhookUrl: string): Promise<void> {
  await request('PUT', '/v1/settings', {
    webhooks:        webhookUrl,
    webhooksEnabled: true,
  });
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function eeHealthCheck(): Promise<boolean> {
  try {
    await request('GET', '/v1/stats');
    return true;
  } catch {
    return false;
  }
}
