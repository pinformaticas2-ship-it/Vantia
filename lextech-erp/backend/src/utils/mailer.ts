/**
 * Capa de envío de correo con prioridad:
 *   1. RESEND_API_KEY   → Resend API       (HTTPS, requiere verificar dominio)
 *   2. BREVO_API_KEY    → Brevo REST API   (HTTPS, sin restricción de IP)
 *   3. SMTP_RELAY_HOST  → SMTP relay       (Brevo/SendGrid relay SMTP)
 *   4. Per-account SMTP → comportamiento original
 */
import { sendEmail, SmtpConfig, MailMessage } from './smtp';

async function sendViaResend(msg: MailMessage): Promise<void> {
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddr  = process.env.RESEND_FROM || msg.from;
  const fromLabel = msg.fromName ? `${msg.fromName} <${fromAddr}>` : fromAddr;
  const { error } = await resend.emails.send({
    from:    fromLabel,
    to:      msg.to,
    cc:      msg.cc?.length  ? msg.cc  : undefined,
    bcc:     msg.bcc?.length ? msg.bcc : undefined,
    subject: msg.subject,
    html:    msg.html,
    text:    msg.text,
    replyTo: msg.replyTo,
    attachments: msg.attachments?.map(a => ({
      filename: a.filename,
      content:  Buffer.from(a.content, 'base64'),
    })),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

async function sendViaBrevoApi(msg: MailMessage): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY!;

  const toList  = msg.to.map(addr  => parseAddress(addr));
  const ccList  = (msg.cc  || []).map(addr => parseAddress(addr));
  const bccList = (msg.bcc || []).map(addr => parseAddress(addr));

  const body: Record<string, any> = {
    sender:      { name: msg.fromName || msg.from, email: msg.from },
    to:          toList,
    subject:     msg.subject,
    htmlContent: msg.html,
    textContent: msg.text,
  };
  if (ccList.length)  body.cc  = ccList;
  if (bccList.length) body.bcc = bccList;
  if (msg.replyTo)    body.replyTo = { email: msg.replyTo };
  if (msg.attachments?.length) {
    body.attachment = msg.attachments.map(a => ({
      name:    a.filename,
      content: a.content,
    }));
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Brevo API ${res.status}: ${text}`);
  }
}

function parseAddress(raw: string): { email: string; name?: string } {
  const m = raw.match(/^(.*?)<([^>]+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, '') || undefined, email: m[2].trim() };
  return { email: raw.trim() };
}

function relaySmtpCfg(): SmtpConfig | null {
  const host = process.env.SMTP_RELAY_HOST;
  if (!host) return null;
  return {
    host,
    port:     Number(process.env.SMTP_RELAY_PORT || 587),
    secure:   process.env.SMTP_RELAY_PORT === '465',
    user:     process.env.SMTP_RELAY_USER || '',
    password: process.env.SMTP_RELAY_PASS || '',
  };
}

export async function dispatchEmail(accountSmtp: SmtpConfig, msg: MailMessage): Promise<void> {
  if (process.env.RESEND_API_KEY)  return sendViaResend(msg);
  if (process.env.BREVO_API_KEY)   return sendViaBrevoApi(msg);
  const relay = relaySmtpCfg();
  if (relay)                       return sendEmail(relay, msg);
  return sendEmail(accountSmtp, msg);
}

export function getSendingProvider(): 'resend' | 'brevo' | 'relay' | 'smtp' {
  if (process.env.RESEND_API_KEY)  return 'resend';
  if (process.env.BREVO_API_KEY)   return 'brevo';
  if (process.env.SMTP_RELAY_HOST) return 'relay';
  return 'smtp';
}
