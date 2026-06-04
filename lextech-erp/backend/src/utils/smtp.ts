import nodemailer from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;       // true = TLS directo (465), false = STARTTLS (587/25)
  user: string;
  password: string;
}

export interface MailMessage {
  from:    string;
  fromName?: string;
  to:      string[];
  cc?:     string[];
  bcc?:    string[];
  subject: string;
  html:    string;
  text?:   string;
  replyTo?: string;
  messageId?: string;
}

function makeTransport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 15_000,
    greetingTimeout:   10_000,
    socketTimeout:     20_000,
  });
}

export async function sendEmail(cfg: SmtpConfig, msg: MailMessage): Promise<void> {
  const transport = makeTransport(cfg);
  try {
    await transport.sendMail({
      from:      msg.fromName ? `"${msg.fromName}" <${msg.from}>` : msg.from,
      to:        msg.to.join(', '),
      cc:        msg.cc?.join(', '),
      bcc:       msg.bcc?.join(', '),
      subject:   msg.subject,
      html:      msg.html,
      text:      msg.text,
      replyTo:   msg.replyTo,
      messageId: msg.messageId,
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
