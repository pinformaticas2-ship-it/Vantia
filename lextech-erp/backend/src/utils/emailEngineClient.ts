const BASE_URL = (process.env.EMAIL_ENGINE_URL || '').replace(/\/$/, '');
const API_TOKEN = process.env.EMAIL_ENGINE_TOKEN || '';

export function isEmailEngineEnabled(): boolean {
  return Boolean(process.env.EMAIL_ENGINE_URL);
}

export interface EEAccountPayload {
  account: string;
  name?: string;
  email: string;
  imap: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  };
}

async function eeRequest(method: string, path: string, body?: object): Promise<any> {
  if (!BASE_URL) throw new Error('EMAIL_ENGINE_URL not configured');
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`EmailEngine ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json().catch(() => null);
}

export async function eeRegisterAccount(payload: EEAccountPayload): Promise<void> {
  await eeRequest('POST', '/v1/account', payload);
}

export async function eeUpdateAccount(accountId: string, payload: Partial<EEAccountPayload>): Promise<void> {
  await eeRequest('PUT', `/v1/account/${accountId}`, payload);
}

export async function eeDeleteAccount(accountId: string): Promise<void> {
  await eeRequest('DELETE', `/v1/account/${accountId}`).catch(() => {});
}

export async function eeGetMessage(accountId: string, messageId: string): Promise<any> {
  return eeRequest('GET', `/v1/account/${accountId}/message/${messageId}`);
}

export async function eeGetAttachment(accountId: string, attachmentId: string): Promise<Buffer> {
  if (!BASE_URL) throw new Error('EMAIL_ENGINE_URL not configured');
  const res = await fetch(`${BASE_URL}/v1/account/${accountId}/attachment/${attachmentId}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  if (!res.ok) throw new Error(`EmailEngine attachment → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function eeConfigureWebhook(webhookUrl: string): Promise<void> {
  await eeRequest('PUT', '/v1/settings', {
    webhooks: webhookUrl,
    webhooksCustomHeaders: [{ key: 'Authorization', value: `Bearer ${API_TOKEN}` }],
    webhookEvents: [
      'messageNew', 'messageSeen', 'messageUnseen',
      'messageFlagged', 'messageUnflagged', 'messageDeleted', 'messageMoved',
    ],
  });
}

export async function eeHealthCheck(): Promise<boolean> {
  try {
    await eeRequest('GET', '/v1/health');
    return true;
  } catch {
    return false;
  }
}
