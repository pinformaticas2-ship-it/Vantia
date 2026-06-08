/**
 * SMTP Client — implementado con módulos nativos de Node.js
 * Soporta: SSL/TLS directo (puerto 465) y STARTTLS (puerto 587)
 */
import * as net  from 'net';
import * as tls  from 'tls';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;       // true = TLS directo (465), false = STARTTLS (587/25)
  user: string;
  password: string;
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  content: string; // base64
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
  attachments?: MailAttachment[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function b64(s: string) { return Buffer.from(s).toString('base64'); }
function b64u(s: string) { return Buffer.from(s, 'utf-8').toString('base64'); }

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${b64u(value)}?=`;
}

function buildMimeMessage(msg: MailMessage): string {
  const altBoundary  = `----=_Alt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const mixBoundary  = `----=_Mix_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const msgId        = msg.messageId || `<${Date.now()}.${Math.random().toString(36).slice(2)}@lextech>`;
  const date         = new Date().toUTCString();
  const hasAttach    = (msg.attachments?.length ?? 0) > 0;

  const fromFull = msg.fromName
    ? `${encodeHeader(msg.fromName)} <${msg.from}>`
    : msg.from;
  const toLine   = msg.to.join(', ');
  const ccLine   = msg.cc?.join(', ') || '';
  const textPart = msg.text || msg.html.replace(/<[^>]+>/g, '');

  const altPart = [
    `--${altBoundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    b64u(textPart),
    ``,
    `--${altBoundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    b64u(msg.html),
    ``,
    `--${altBoundary}--`,
  ].join('\r\n');

  const headers = [
    `From: ${fromFull}`,
    `To: ${toLine}`,
    ccLine ? `CC: ${ccLine}` : '',
    `Subject: ${encodeHeader(msg.subject)}`,
    `Date: ${date}`,
    `Message-ID: ${msgId}`,
    `MIME-Version: 1.0`,
  ].filter(Boolean);

  if (!hasAttach) {
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      ``,
      altPart,
    ].join('\r\n');
  }

  // multipart/mixed wrapping alternative + attachments
  const attachParts = (msg.attachments || []).map(att => [
    `--${mixBoundary}`,
    `Content-Type: ${att.contentType}; name="${encodeHeader(att.filename)}"`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="${encodeHeader(att.filename)}"`,
    ``,
    att.content,
    ``,
  ].join('\r\n')).join('');

  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixBoundary}"`,
    ``,
    `--${mixBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    ``,
    altPart,
    ``,
    attachParts,
    `--${mixBoundary}--`,
  ].join('\r\n');
}

// ── Motor SMTP ────────────────────────────────────────────────────────────────

class SmtpSession {
  private socket!: net.Socket | tls.TLSSocket;
  private buffer = '';
  private resolve!: (v: string) => void;
  private reject!: (e: Error) => void;

  constructor(private cfg: SmtpConfig) {}

  private waitLine(): Promise<string> {
    return new Promise((res, rej) => {
      this.resolve = res;
      this.reject  = rej;
    });
  }

  private send(cmd: string) {
    this.socket.write(cmd + '\r\n');
  }

  private onData(chunk: Buffer) {
    this.buffer += chunk.toString();
    const idx = this.buffer.indexOf('\r\n');
    if (idx !== -1) {
      // collect multi-line responses (xxx-)
      const fullResp = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      // If multi-line (e.g. "250-xxx\r\n250 xxx"), keep reading
      if (/^\d{3}-/.test(fullResp)) {
        // still more lines; wait
        return;
      }
      this.resolve(fullResp);
    }
  }

  private async expect(codes: number[]): Promise<string> {
    const line = await this.waitLine();
    const code = parseInt(line.slice(0, 3), 10);
    if (!codes.includes(code)) {
      throw new Error(`SMTP error ${code}: ${line}`);
    }
    return line;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = 15_000;
      const onError = (e: Error) => { clearTimeout(t); reject(e); };
      const t = setTimeout(() => reject(new Error('SMTP connect timeout')), timeout);

      const onReady = () => {
        clearTimeout(t);
        this.socket.on('data', (c: Buffer) => this.onData(c));
        this.socket.on('error', (e: Error) => { try { this.reject(e); } catch {} });
        resolve();
      };

      if (this.cfg.secure) {
        this.socket = tls.connect(
          { host: this.cfg.host, port: this.cfg.port, rejectUnauthorized: false },
          onReady,
        );
      } else {
        const s = net.connect({ host: this.cfg.host, port: this.cfg.port });
        s.on('connect', onReady);
        this.socket = s;
      }
      this.socket.on('error', onError);
    });
  }

  async send_email(msg: MailMessage): Promise<void> {
    // Greeting
    await this.expect([220]);

    // EHLO
    this.send(`EHLO lextech`);
    await this.expect([250]);

    // STARTTLS upgrade si no es secure
    if (!this.cfg.secure) {
      this.send('STARTTLS');
      await this.expect([220]);
      // Upgrade socket to TLS
      await new Promise<void>((res, rej) => {
        const tlsSock = tls.connect({
          socket: this.socket as net.Socket,
          rejectUnauthorized: false,
        }, res);
        tlsSock.on('error', rej);
        this.socket = tlsSock;
        this.socket.on('data', (c: Buffer) => this.onData(c));
      });
      // Re-EHLO after STARTTLS
      this.send(`EHLO lextech`);
      await this.expect([250]);
    }

    // AUTH LOGIN
    this.send('AUTH LOGIN');
    await this.expect([334]);
    this.send(b64(this.cfg.user));
    await this.expect([334]);
    this.send(b64(this.cfg.password));
    await this.expect([235]);

    // Envelope
    this.send(`MAIL FROM:<${msg.from}>`);
    await this.expect([250]);

    const allTo = [...msg.to, ...(msg.cc || []), ...(msg.bcc || [])];
    for (const addr of allTo) {
      this.send(`RCPT TO:<${addr}>`);
      await this.expect([250]);
    }

    // Data
    this.send('DATA');
    await this.expect([354]);
    const mime = buildMimeMessage(msg);
    this.socket.write(mime + '\r\n.\r\n');
    await this.expect([250]);

    // Quit
    this.send('QUIT');
    this.socket.destroy();
  }
}

export async function sendEmail(cfg: SmtpConfig, msg: MailMessage): Promise<void> {
  const session = new SmtpSession(cfg);
  await session.connect();
  await session.send_email(msg);
}

/** Test only connection + auth — no email sent */
export async function testSmtpConnection(cfg: SmtpConfig): Promise<void> {
  const session = new SmtpSession(cfg);
  await session.connect();
  // (session will be GC'd — socket will close)
}
