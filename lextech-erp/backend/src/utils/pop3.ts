/**
 * POP3 Client — implementado con módulos nativos de Node.js
 * Soporta POP3S/TLS (puerto 995) y POP3 plano (puerto 110)
 *
 * Protocolo POP3 (RFC 1939):
 *  - Respuestas de una línea:  "+OK ..." o "-ERR ..." + \r\n
 *  - Respuestas multi-línea:   líneas terminadas en \r\n + ".\r\n" final
 *  - Comandos principales: USER, PASS, STAT, LIST, UIDL, TOP, RETR, DELE, QUIT
 */
import * as net  from 'net';
import * as tls  from 'tls';

export interface Pop3Config {
  host:     string;
  port:     number;
  secure:   boolean;  // true → TLS desde el inicio (puerto 995); false → plano (110)
  user:     string;
  password: string;
  timeout?: number;   // ms, default 15000
}

export interface Pop3Message {
  number:    number;
  uidl:      string;   // identificador único del servidor (UIDL)
  size:      number;
  subject:   string;
  from:      string;
  fromName:  string;
  to:        string;
  date:      string;   // ISO 8601
  snippet:   string;
  bodyText:  string;
  bodyHtml:  string;
  messageId: string;
}

// ── Helpers de parsing MIME ───────────────────────────────────────────────────

function decodeBase64(s: string): string {
  try { return Buffer.from(s, 'base64').toString('utf-8'); } catch { return s; }
}

function decodeQP(s: string): string {
  return s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16)));
}

function decodeHeader(raw: string): string {
  return (raw || '').replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_m, charset, enc, text) => {
      try {
        return enc.toUpperCase() === 'B'
          ? Buffer.from(text, 'base64').toString(charset as BufferEncoding)
          : Buffer.from(decodeQP(text), 'binary').toString();
      } catch { return text; }
    },
  );
}

function parseAddress(raw: string): { name: string; email: string } {
  const m = raw.match(/^(.*?)\s*<(.+?)>$/);
  if (m) return { name: decodeHeader(m[1].trim().replace(/^"|"$/g, '')), email: m[2].trim() };
  return { name: '', email: raw.trim() };
}

function getHeader(headers: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'im');
  const m  = headers.match(re);
  return m ? decodeHeader(m[1].replace(/\r?\n\s+/g, ' ').trim()) : '';
}

function extractBody(raw: string): { html: string; text: string } {
  const [headerPart, ...bodyParts] = raw.split(/\r?\n\r?\n/);
  const body = bodyParts.join('\r\n\r\n');
  const ct   = getHeader(headerPart, 'Content-Type').toLowerCase();
  const cte  = getHeader(headerPart, 'Content-Transfer-Encoding').toLowerCase();

  const decode = (content: string) => {
    if (cte.includes('base64'))            return decodeBase64(content.replace(/\s+/g, ''));
    if (cte.includes('quoted-printable'))  return decodeQP(content);
    return content;
  };

  // Multipart
  const boundary = (ct.match(/boundary="?([^";]+)"?/i) || [])[1];
  if (boundary && body.includes(boundary)) {
    let html = '', text = '';
    const parts = body.split(new RegExp(`--${boundary}(?:--)?`, 'g'));
    for (const part of parts) {
      if (!part.trim() || part.trim() === '--') continue;
      const [ph, ...pb] = part.split(/\r?\n\r?\n/);
      const pct  = getHeader(ph, 'Content-Type').toLowerCase();
      const pcte = getHeader(ph, 'Content-Transfer-Encoding').toLowerCase();
      const pbody = pb.join('\r\n\r\n').trim();
      const dec = (s: string) => {
        if (pcte.includes('base64'))           return decodeBase64(s.replace(/\s+/g, ''));
        if (pcte.includes('quoted-printable')) return decodeQP(s);
        return s;
      };
      if (pct.includes('text/html') && !html)  html = dec(pbody);
      if (pct.includes('text/plain') && !text) text = dec(pbody);
    }
    return { html, text };
  }

  if (ct.includes('text/html'))  return { html: decode(body), text: '' };
  return { html: '', text: decode(body) };
}

function parseMessage(raw: string, msgNumber: number, uidl: string, size: number): Pop3Message {
  const sep     = raw.indexOf('\r\n\r\n');
  const headers = sep >= 0 ? raw.slice(0, sep) : raw;
  const { html, text } = extractBody(raw);

  const fromRaw  = getHeader(headers, 'From');
  const dateRaw  = getHeader(headers, 'Date');
  const subject  = getHeader(headers, 'Subject') || '(Sin asunto)';
  const to       = getHeader(headers, 'To');
  const msgId    = getHeader(headers, 'Message-ID').replace(/[<>]/g, '');
  const { name: fromName, email: from } = parseAddress(fromRaw);

  let date = '';
  try { date = new Date(dateRaw).toISOString(); } catch { date = new Date().toISOString(); }

  const bodyFull = text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const snippet  = bodyFull.trim().slice(0, 200);

  return {
    number: msgNumber, uidl, size,
    subject, from, fromName, to, date, snippet,
    bodyText: text, bodyHtml: html, messageId: msgId,
  };
}

// ── Pop3Client ────────────────────────────────────────────────────────────────

export class Pop3Client {
  private cfg:     Pop3Config;
  private socket:  net.Socket | null = null;
  private buf:     string = '';
  private timeout: number;

  constructor(cfg: Pop3Config) {
    this.cfg     = cfg;
    this.timeout = cfg.timeout ?? 15_000;
  }

  // Espera una respuesta de una sola línea
  private readline(): Promise<string> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const idx = this.buf.indexOf('\r\n');
        if (idx >= 0) {
          const line = this.buf.slice(0, idx);
          this.buf   = this.buf.slice(idx + 2);
          if (line.startsWith('-ERR')) reject(new Error(line.slice(5)));
          else                         resolve(line.startsWith('+OK') ? line.slice(4) : line);
        }
      };
      check();
      if (!this.socket) return reject(new Error('No hay socket'));
      const onData = (d: Buffer) => { this.buf += d.toString('binary'); check(); };
      const onErr  = (e: Error) => reject(e);
      this.socket.once('error', onErr);
      this.socket.on('data', onData);
      // cleanup cuando se resuelve
      const orig = resolve;
      (resolve as any) = (v: string) => {
        this.socket?.off('data', onData);
        this.socket?.off('error', onErr);
        orig(v);
      };
      const origRej = reject;
      (reject as any) = (e: Error) => {
        this.socket?.off('data', onData);
        this.socket?.off('error', onErr);
        origRej(e);
      };
    });
  }

  // Espera una respuesta multi-línea (termina en \r\n.\r\n)
  private readMultiline(): Promise<string> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const end = this.buf.indexOf('\r\n.\r\n');
        if (end >= 0) {
          const content = this.buf.slice(0, end);
          this.buf = this.buf.slice(end + 5);
          // Desescapar líneas que empiezan con '..'
          resolve(content.replace(/^\.\./gm, '.'));
        }
      };
      check();
      if (!this.socket) return reject(new Error('No hay socket'));
      const onData = (d: Buffer) => { this.buf += d.toString('binary'); check(); };
      const onErr  = (e: Error) => reject(e);
      this.socket.once('error', onErr);
      this.socket.on('data', onData);
      const orig = resolve;
      (resolve as any) = (v: string) => {
        this.socket?.off('data', onData);
        this.socket?.off('error', onErr);
        orig(v);
      };
      const origRej = reject;
      (reject as any) = (e: Error) => {
        this.socket?.off('data', onData);
        this.socket?.off('error', onErr);
        origRej(e);
      };
    });
  }

  private send(cmd: string) {
    this.socket?.write(cmd + '\r\n');
  }

  // ── API pública ─────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const opts = { host: this.cfg.host, port: this.cfg.port, rejectUnauthorized: false };
      this.socket = this.cfg.secure
        ? tls.connect(opts, () => {})
        : net.connect({ host: this.cfg.host, port: this.cfg.port });

      this.socket.setTimeout(this.timeout, () => reject(new Error('Timeout al conectar')));
      this.socket.once('error', reject);

      // Acumular en buffer binario
      this.socket.on('data', (d: Buffer) => { this.buf += d.toString('binary'); });

      const waitGreeting = (deadline: number) => {
        if (Date.now() > deadline) {
          this.socket?.destroy();
          reject(new Error('Timeout esperando saludo del servidor'));
          return;
        }
        const idx = this.buf.indexOf('\r\n');
        if (idx < 0) { setTimeout(() => waitGreeting(deadline), 50); return; }
        const line = this.buf.slice(0, idx);
        this.buf   = this.buf.slice(idx + 2);
        if (line.startsWith('+OK')) resolve();
        else reject(new Error('Saludo inesperado: ' + line));
      };

      const onConnect = () => {
        this.socket!.setTimeout(this.timeout, () => {
          this.socket?.destroy();
          reject(new Error('Timeout al comunicar con el servidor'));
        });
        setTimeout(() => waitGreeting(Date.now() + this.timeout), 100);
      };

      this.cfg.secure
        ? (this.socket as tls.TLSSocket).once('secureConnect', onConnect)
        : this.socket.once('connect', onConnect);
    });
  }

  async login(): Promise<void> {
    this.send(`USER ${this.cfg.user}`);
    await this.readline();
    this.send(`PASS ${this.cfg.password}`);
    await this.readline();
  }

  async stat(): Promise<{ count: number; sizeBytes: number }> {
    this.send('STAT');
    const line  = await this.readline();          // "N sizeBytes"
    const parts = line.trim().split(/\s+/);
    return { count: parseInt(parts[0] || '0'), sizeBytes: parseInt(parts[1] || '0') };
  }

  // LIST: devuelve { msgNumber -> size }
  async list(): Promise<Map<number, number>> {
    this.send('LIST');
    await this.readline();   // "+OK N messages"
    const body = await this.readMultiline();
    const map  = new Map<number, number>();
    for (const line of body.split('\r\n').filter(Boolean)) {
      const [n, s] = line.trim().split(/\s+/);
      if (n && s) map.set(parseInt(n), parseInt(s));
    }
    return map;
  }

  // UIDL: devuelve { msgNumber -> uniqueId }
  async uidl(): Promise<Map<number, string>> {
    this.send('UIDL');
    await this.readline();
    const body = await this.readMultiline();
    const map  = new Map<number, string>();
    for (const line of body.split('\r\n').filter(Boolean)) {
      const [n, uid] = line.trim().split(/\s+/);
      if (n && uid) map.set(parseInt(n), uid);
    }
    return map;
  }

  // TOP n 0 → solo cabeceras (sin cuerpo)
  async top(msgNum: number, lines = 0): Promise<string> {
    this.send(`TOP ${msgNum} ${lines}`);
    await this.readline();
    return this.readMultiline();
  }

  // RETR n → mensaje completo
  async retr(msgNum: number): Promise<string> {
    this.send(`RETR ${msgNum}`);
    await this.readline();
    return this.readMultiline();
  }

  // DELE n → marcar para borrar (efectivo al QUIT)
  async dele(msgNum: number): Promise<void> {
    this.send(`DELE ${msgNum}`);
    await this.readline();
  }

  async quit(): Promise<void> {
    try {
      this.send('QUIT');
      await this.readline();
    } catch { /* silencioso */ }
    this.socket?.destroy();
    this.socket = null;
  }
}

// ── syncPop3Inbox ─────────────────────────────────────────────────────────────
// Obtiene mensajes nuevos comparando UIDLs con los ya conocidos

export async function syncPop3Inbox(
  cfg: Pop3Config,
  knownUidls: Set<string>,
  limit = 50,
): Promise<Pop3Message[]> {
  const client = new Pop3Client(cfg);
  await client.connect();
  await client.login();

  const sizeMap = await client.list();
  const uidlMap = await client.uidl();

  // Ordenar por número DESC (más recientes primero)
  const entries = [...uidlMap.entries()].sort((a, b) => b[0] - a[0]);

  const messages: Pop3Message[] = [];
  let fetched = 0;

  for (const [num, uid] of entries) {
    if (fetched >= limit) break;
    if (knownUidls.has(uid)) continue;  // ya lo tenemos

    try {
      const raw  = await client.retr(num);
      const size = sizeMap.get(num) ?? raw.length;
      messages.push(parseMessage(raw, num, uid, size));
      fetched++;
    } catch { /* skip mensaje con error */ }
  }

  await client.quit();
  return messages;
}

// ── testPop3Connection ────────────────────────────────────────────────────────

export async function testPop3Connection(cfg: Pop3Config): Promise<{ ok: boolean; count: number }> {
  const client = new Pop3Client(cfg);
  await client.connect();
  await client.login();
  const { count } = await client.stat();
  await client.quit();
  return { ok: true, count };
}
