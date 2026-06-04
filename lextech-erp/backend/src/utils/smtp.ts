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

// ── Helpers ──────────────────────────────────────────────────────────────────

function b64(s: string) { return Buffer.from(s).toString('base64'); }
function b64u(s: string) { return Buffer.from(s, 'utf-8').toString('base64'); }

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${b64u(value)}?=`;
}

function buildMimeMessage(msg: MailMessage): string {
  const boundary = `----=_LexTech_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const msgId    = msg.messageId || `<${Date.now()}.${Math.random().toString(36).slice(2)}@lextech>`;
  const date     = new Date().toUTCString();

  const fromFull = msg.fromName
    ? `${encodeHeader(msg.fromName)} <${msg.from}>`
    : msg.from;
  const toLine   = msg.to.join(', ');
  const ccLine   = msg.cc?.join(', ') || '';

  const textPart = msg.text || msg.html.replace(/<[^>]+>/g, '');

  const lines: string[] = [
    `From: ${fromFull}`,
    `To: ${toLine}`,
    ccLine ? `CC: ${ccLine}` : '',
    `Subject: ${encodeHeader(msg.subject)}`,
    `Date: ${date}`,
    `Message-ID: ${msgId}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    b64u(textPart),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    b64u(msg.html),
    ``,
    `--${boundary}--`,
  ];

  return lines.filter(l => l !== null).join('\r\n');
}

// ── Motor SMTP ────────────────────────────────────────────────────────────────

const CMD_TIMEOUT = 20_000;

class SmtpSession {
  private socket!: net.Socket | tls.TLSSocket;
  private rawBuffer = '';

  // Line queue: handles the race where data arrives before waitLine() is called
  private lineQueue: string[] = [];
  private pendingResolve: ((v: string) => void) | null = null;
  private pendingReject:  ((e: Error)  => void) | null = null;

  constructor(private cfg: SmtpConfig) {}

  private onData(chunk: Buffer) {
    this.rawBuffer += chunk.toString();
    // Consume all complete lines from the buffer
    while (true) {
      const idx = this.rawBuffer.indexOf('\r\n');
      if (idx === -1) break;
      const line = this.rawBuffer.slice(0, idx);
      this.rawBuffer = this.rawBuffer.slice(idx + 2);
      // Skip intermediate multi-line segments (e.g. "250-AUTH LOGIN")
      if (/^\d{3}-/.test(line)) continue;
      // Deliver the final response line
      if (this.pendingResolve) {
        const resolve = this.pendingResolve;
        this.pendingResolve = null;
        this.pendingReject  = null;
        resolve(line);
      } else {
        this.lineQueue.push(line);
      }
      break;
    }
  }

  private waitLine(timeoutMs = CMD_TIMEOUT): Promise<string> {
    // If a line arrived before we started waiting, return it immediately
    if (this.lineQueue.length > 0) {
      return Promise.resolve(this.lineQueue.shift()!);
    }
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        this.pendingResolve = null;
        this.pendingReject  = null;
        rej(new Error('SMTP command timeout'));
      }, timeoutMs);

      this.pendingResolve = (v) => { clearTimeout(t); res(v); };
      this.pendingReject  = (e) => { clearTimeout(t); rej(e); };
    });
  }

  private send(cmd: string) {
    this.socket.write(cmd + '\r\n');
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
        this.socket.removeListener('error', onError);
        this.socket.on('data',  (c: Buffer) => this.onData(c));
        this.socket.on('error', (e: Error)  => {
          if (this.pendingReject) {
            const rej = this.pendingReject;
            this.pendingResolve = null;
            this.pendingReject  = null;
            rej(e);
          }
        });
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

  private async upgradeToTls(): Promise<void> {
    await new Promise<void>((res, rej) => {
      // Remove old data listener before wrapping
      this.socket.removeAllListeners('data');
      const tlsSock = tls.connect(
        { socket: this.socket as net.Socket, rejectUnauthorized: false },
        res,
      );
      tlsSock.on('error', rej);
      this.socket = tlsSock;
      this.socket.on('data',  (c: Buffer) => this.onData(c));
      this.socket.on('error', (e: Error)  => {
        if (this.pendingReject) {
          const rej2 = this.pendingReject;
          this.pendingResolve = null;
          this.pendingReject  = null;
          rej2(e);
        }
      });
    });
  }

  private async doHandshake(): Promise<void> {
    await this.expect([220]);
    this.send(`EHLO lextech`);
    await this.expect([250]);

    if (!this.cfg.secure) {
      this.send('STARTTLS');
      await this.expect([220]);
      await this.upgradeToTls();
      this.send(`EHLO lextech`);
      await this.expect([250]);
    }
  }

  async test_auth(): Promise<void> {
    await this.doHandshake();

    this.send('AUTH LOGIN');
    await this.expect([334]);
    this.send(b64(this.cfg.user));
    await this.expect([334]);
    this.send(b64(this.cfg.password));
    await this.expect([235]);

    this.send('QUIT');
    this.socket.destroy();
  }

  async send_email(msg: MailMessage): Promise<void> {
    await this.doHandshake();

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

/** Test connection + full auth handshake — no email sent */
export async function testSmtpConnection(cfg: SmtpConfig): Promise<void> {
  const session = new SmtpSession(cfg);
  await session.connect();
  await session.test_auth();
}
