/**
 * Capa de envío de correo con prioridad:
 *   1. RESEND_API_KEY        → Resend API (mejor deliverability, requiere verificar dominio en resend.com)
 *   2. SMTP_RELAY_HOST       → SMTP relay externo (Brevo, SendGrid…)
 *   3. Per-account SMTP      → comportamiento original
 */
import { sendEmail, SmtpConfig, MailMessage } from './smtp';

function relaySmtpCfg(): SmtpConfig | null {
  const host = process.env.SMTP_RELAY_HOST;
  if (!host) return null;
  return {
    host,
    port:     Number(process.env.SMTP_RELAY_PORT  || 587),
    secure:   process.env.SMTP_RELAY_PORT === '465',
    user:     process.env.SMTP_RELAY_USER  || '',
    password: process.env.SMTP_RELAY_PASS  || '',
  };
}

async function sendViaResend(msg: MailMessage): Promise<void> {
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const fromAddr = process.env.RESEND_FROM || msg.from;
  const fromLabel = msg.fromName ? `${msg.fromName} <${fromAddr}>` : fromAddr;

  const { error } = await resend.emails.send({
    from:    fromLabel,
    to:      msg.to,
    cc:      msg.cc?.length ? msg.cc : undefined,
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

export async function dispatchEmail(accountSmtp: SmtpConfig, msg: MailMessage): Promise<void> {
  if (process.env.RESEND_API_KEY) {
    return sendViaResend(msg);
  }

  const relay = relaySmtpCfg();
  if (relay) {
    return sendEmail(relay, msg);
  }

  return sendEmail(accountSmtp, msg);
}

export function getSendingProvider(): 'resend' | 'relay' | 'smtp' {
  if (process.env.RESEND_API_KEY)  return 'resend';
  if (process.env.SMTP_RELAY_HOST) return 'relay';
  return 'smtp';
}
