import nodemailer from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  content: string;
}

export interface MailMessage {
  from: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  messageId?: string;
  attachments?: MailAttachment[];
}

function makeTransport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    family: 4, // force IPv4 — IPv6 may be unreachable on some hosting environments
  });
}

export async function sendEmail(cfg: SmtpConfig, msg: MailMessage): Promise<void> {
  const transport = makeTransport(cfg);

  try {
    await transport.sendMail({
      from: msg.fromName ? `"${msg.fromName}" <${msg.from}>` : msg.from,
      to: msg.to.join(', '),
      cc: msg.cc?.join(', '),
      bcc: msg.bcc?.join(', '),
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      replyTo: msg.replyTo,
      messageId: msg.messageId,
      attachments: msg.attachments?.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: attachment.content,
        encoding: 'base64' as const,
      })),
    });
  } finally {
    transport.close();
  }
}

export async function testSmtpConnection(cfg: SmtpConfig): Promise<void> {
  const transport = makeTransport(cfg);

  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}
