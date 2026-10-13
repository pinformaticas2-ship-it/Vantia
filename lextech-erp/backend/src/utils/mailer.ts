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
    headers: msg.inReplyTo ? { 'In-Reply-To': msg.inReplyTo, References: msg.inReplyTo } : undefined,
    attachments: msg.attachments?.map(a => ({
      filename: a.filename,
      content:  Buffer.from(a.content, 'base64'),
    })),
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

async function sendViaBrevoApi(msg: MailMessage): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY!;

  const toList  = msg.to.map(addr  => parseAddress(addr)).filter(Boolean) as { email: string; name?: string }[];
  const ccList  = (msg.cc  || []).map(addr => parseAddress(addr)).filter(Boolean) as { email: string; name?: string }[];
  const bccList = (msg.bcc || []).map(addr => parseAddress(addr)).filter(Boolean) as { email: string; name?: string }[];
  if (!toList.length) throw new Error('No hay destinatarios válidos');

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
  // Respuestas: sin estas cabeceras el destinatario no la ve dentro de la
  // misma conversación (13/10/2026).
  if (msg.inReplyTo)  body.headers = { 'In-Reply-To': msg.inReplyTo, References: msg.inReplyTo };
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

function parseAddress(raw: string): { email: string; name?: string } | null {
  const s = raw.trim().replace(/[,;]+$/, ''); // strip trailing commas/semicolons
  if (!s) return null;
  const m = s.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  if (m) {
    const name  = m[1].trim() || undefined;
    const email = m[2].trim();
    return email.includes('@') ? { email, name } : null;
  }
  return s.includes('@') ? { email: s } : null;
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

// ── ¿Llegará bien lo que se envía por Brevo? (13/10/2026) ───────────────────
// Con Brevo, los correos de los usuarios salen con SU dirección (p.ej.
// @animalegis.es) pero desde servidores de Brevo. Si ese dominio no está
// autenticado en Brevo (SPF/DKIM), muchos servidores los mandan a spam o los
// rechazan. Se consulta a Brevo (cacheado 1 h) y Correo lo avisa.

let cacheDominios: { at: number; dominios: Map<string, boolean> } | null = null;

async function dominiosBrevo(): Promise<Map<string, boolean> | null> {
  if (cacheDominios && Date.now() - cacheDominios.at < 60 * 60 * 1000) return cacheDominios.dominios;
  try {
    const res = await fetch('https://api.brevo.com/v3/senders/domains', {
      headers: { 'api-key': process.env.BREVO_API_KEY!, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d: any = await res.json();
    const dominios = new Map<string, boolean>();
    for (const x of d?.domains || []) {
      if (x?.domain_name) dominios.set(String(x.domain_name).toLowerCase(), Boolean(x.authenticated));
    }
    cacheDominios = { at: Date.now(), dominios };
    return dominios;
  } catch {
    return null;
  }
}

/** Aviso a mostrar para una dirección remitente, o null si todo bien (o si
 *  no se usa Brevo, o Brevo no responde: en la duda, no se alarma). */
export async function avisoEnvioDominio(email: string): Promise<string | null> {
  if (getSendingProvider() !== 'brevo') return null;
  const dominio = String(email || '').split('@')[1]?.toLowerCase();
  if (!dominio) return null;
  const dominios = await dominiosBrevo();
  if (!dominios) return null;
  if (dominios.get(dominio) === true) return null;
  return dominios.has(dominio)
    ? `El dominio ${dominio} está añadido en Brevo pero sin autenticar (SPF/DKIM): lo que envíes desde Vantia puede acabar en spam.`
    : `El dominio ${dominio} no está verificado en Brevo, el servicio con el que Vantia envía: lo que mandes puede acabar en spam o ser rechazado.`;
}
