/**
 * IMAP Client — implementado con módulos nativos de Node.js
 * Soporta TLS/SSL (puerto 993) y STARTTLS (puerto 143)
 */
import * as net from 'net';
import * as tls from 'tls';

export interface ImapConfig {
  host:     string;
  port:     number;
  secure:   boolean;
  user:     string;
  password: string;
}

export interface ImapEnvelope {
  uid:       number;
  flags:     string[];
  date:      string;
  subject:   string;
  from:      string;
  fromName:  string;
  to:        string;
  messageId: string;
  size:      number;
}

export interface ImapMessage extends ImapEnvelope {
  bodyText: string;
  bodyHtml: string;
  snippet:  string;
}

// ── Parser ─────────────────────────────────────────────────────────────────

function decodeBase64(s: string): string {
  try { return Buffer.from(s, 'base64').toString('utf-8'); } catch { return s; }
}

function decodeQuotedPrintable(s: string): string {
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function decodeHeader(raw: string): string {
  if (!raw) return '';
  return raw.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, charset, enc, text) => {
    try {
      const data = enc.toUpperCase() === 'B'
        ? Buffer.from(text, 'base64').toString(charset.toLowerCase() as BufferEncoding)
        : Buffer.from(decodeQuotedPrintable(text), 'binary').toString();
      return data;
    } catch {
      return text;
    }
  });
}

function extractEmailAddress(raw: string): { name: string; email: string } {
  if (!raw) return { name: '', email: '' };
  const m = raw.match(/^"?([^"<]*)"?\s*<([^>]+)>/) ||
            raw.match(/^([^@<\s]+@[^@>\s]+)/);
  if (!m) return { name: '', email: raw.trim() };
  if (m[2]) return { name: decodeHeader(m[1].trim()), email: m[2].trim() };
  return { name: '', email: m[1].trim() };
}

function parseMimeParts(raw: string): { text: string; html: string } {
  let text = '';
  let html  = '';

  // Check for simple non-MIME messages
  const contentTypeMatch = raw.match(/Content-Type:\s*([^\r\n;]+)/i);
  const mainCT = contentTypeMatch?.[1]?.trim().toLowerCase() || '';

  if (!raw.includes('boundary=') && !mainCT.includes('multipart')) {
    // Simple single-part
    const headerEnd = raw.indexOf('\r\n\r\n');
    const body      = headerEnd !== -1 ? raw.slice(headerEnd + 4) : raw;
    const cte       = (raw.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1] || '').toLowerCase();
    const decoded   = cte === 'base64'
      ? decodeBase64(body.replace(/\r?\n/g, ''))
      : cte === 'quoted-printable'
        ? decodeQuotedPrintable(body)
        : body;
    if (mainCT.includes('text/html')) html = decoded;
    else text = decoded;
    return { text, html };
  }

  // Extract boundary
  const boundaryM = raw.match(/boundary="?([^"\r\n;]+)"?/i);
  if (!boundaryM) return { text, html };
  const boundary = boundaryM[1];

  const parts = raw.split(new RegExp(`--${escapeRegExp(boundary)}(?:--)?`));
  for (const part of parts) {
    if (!part.trim() || part.trim() === '--') continue;
    const partHeaderEnd = part.indexOf('\r\n\r\n');
    if (partHeaderEnd === -1) continue;
    const partHeaders = part.slice(0, partHeaderEnd);
    const partBody    = part.slice(partHeaderEnd + 4);

    const partCT  = (partHeaders.match(/Content-Type:\s*([^\r\n;]+)/i)?.[1] || '').trim().toLowerCase();
    const partCTE = (partHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1] || '').toLowerCase();

    if (partCT.includes('multipart')) {
      const sub = parseMimeParts(part);
      if (!text && sub.text) text = sub.text;
      if (!html  && sub.html)  html  = sub.html;
      continue;
    }

    const decoded = partCTE === 'base64'
      ? decodeBase64(partBody.replace(/\r?\n/g, ''))
      : partCTE === 'quoted-printable'
        ? decodeQuotedPrintable(partBody)
        : partBody;

    if (partCT.includes('text/html') && !html)  html  = decoded;
    else if (partCT.includes('text/plain') && !text) text = decoded;
  }

  return { text, html };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function snippet(text: string, html: string): string {
  const plain = text || html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return plain.slice(0, 200);
}

// ── IMAP Session ──────────────────────────────────────────────────────────────

export class ImapClient {
  private socket!: net.Socket | tls.TLSSocket;
  private buffer  = '';
  private tagCtr  = 0;
  private pending = new Map<string, {
    resolve: (lines: string[]) => void;
    reject:  (e: Error)        => void;
    lines:   string[];
  }>();

  constructor(private cfg: ImapConfig) {}

  // ── Low-level ─────────────────────────────────────────────────────────────

  private nextTag() { return `A${String(++this.tagCtr).padStart(4, '0')}`; }

  private onData(chunk: Buffer) {
    this.buffer += chunk.toString('binary');
    const lines = this.buffer.split('\r\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      // Dispatch untagged responses to all pending
      for (const [, p] of this.pending) p.lines.push(line);

      // Check for tagged response
      const tagged = line.match(/^(A\d{4})\s+(OK|NO|BAD)\s*(.*)?$/i);
      if (tagged) {
        const [, tag, status, info] = tagged;
        const p = this.pending.get(tag);
        if (p) {
          this.pending.delete(tag);
          if (status.toUpperCase() === 'OK') p.resolve(p.lines);
          else p.reject(new Error(`IMAP ${status}: ${info} (tag ${tag})`));
        }
      }
    }
  }

  private cmd(cmdStr: string, timeoutMs = 30_000): Promise<string[]> {
    const tag = this.nextTag();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(tag);
        reject(new Error(`IMAP timeout on: ${cmdStr}`));
      }, timeoutMs);
      this.pending.set(tag, {
        resolve: (lines) => { clearTimeout(t); resolve(lines); },
        reject:  (e)     => { clearTimeout(t); reject(e); },
        lines:   [],
      });
      this.socket.write(`${tag} ${cmdStr}\r\n`);
    });
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('IMAP connect timeout')), 15_000);

      const setup = (sock: net.Socket | tls.TLSSocket) => {
        this.socket = sock;
        sock.on('data', (c: Buffer) => this.onData(c));
        sock.on('error', (e: Error) => {
          for (const [, p] of this.pending) try { p.reject(e); } catch {}
        });
      };

      const onReady = () => {
        clearTimeout(t);
        resolve();
      };

      if (this.cfg.secure) {
        const s = tls.connect({
          host: this.cfg.host, port: this.cfg.port,
          rejectUnauthorized: false,
        }, onReady);
        setup(s);
        s.on('error', (e) => { clearTimeout(t); reject(e); });
      } else {
        const s = net.connect({ host: this.cfg.host, port: this.cfg.port });
        s.on('connect', onReady);
        s.on('error', (e) => { clearTimeout(t); reject(e); });
        setup(s);
      }
    });

    // Read server greeting
    await new Promise<void>((res) => {
      const check = setInterval(() => {
        if (this.buffer.includes('OK') || this.buffer.includes('\r\n')) {
          clearInterval(check);
          this.buffer = '';
          res();
        }
      }, 50);
    });
  }

  async login(): Promise<void> {
    await this.cmd(`LOGIN "${this.cfg.user}" "${this.cfg.password.replace(/"/g, '\\"')}"`);
  }

  async logout(): Promise<void> {
    try { await this.cmd('LOGOUT', 5_000); } catch {}
    this.socket.destroy();
  }

  // ── Folders ───────────────────────────────────────────────────────────────

  async listFolders(): Promise<string[]> {
    const lines = await this.cmd('LIST "" "*"');
    return lines
      .filter(l => /^\* LIST/i.test(l))
      .map(l => {
        const m = l.match(/"([^"]+)"\s*$/) || l.match(/\s(\S+)\s*$/);
        return m ? m[1] : '';
      })
      .filter(Boolean);
  }

  async selectFolder(folder: string): Promise<{ exists: number; unseen: number }> {
    const lines = await this.cmd(`SELECT "${folder}"`);
    let exists = 0, unseen = 0;
    for (const l of lines) {
      const em = l.match(/^\*\s+(\d+)\s+EXISTS/i);
      if (em) exists = parseInt(em[1]);
      const um = l.match(/\[UNSEEN\s+(\d+)\]/i);
      if (um) unseen = parseInt(um[1]);
    }
    return { exists, unseen };
  }

  // ── Message listing ───────────────────────────────────────────────────────

  async searchUids(criteria = 'ALL'): Promise<number[]> {
    const lines = await this.cmd(`UID SEARCH ${criteria}`);
    for (const l of lines) {
      const m = l.match(/^\*\s+SEARCH\s+([\d\s]+)/i);
      if (m) return m[1].trim().split(/\s+/).map(Number).filter(Boolean);
    }
    return [];
  }

  async fetchEnvelopes(uids: number[]): Promise<ImapEnvelope[]> {
    if (!uids.length) return [];
    const uidList = uids.join(',');
    const lines   = await this.cmd(
      `UID FETCH ${uidList} (UID FLAGS RFC822.SIZE ENVELOPE)`,
      60_000,
    );

    const results: ImapEnvelope[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!/^\* \d+ FETCH/i.test(line)) { i++; continue; }

      // Collect complete FETCH block (may span several lines)
      let block = line;
      while (i + 1 < lines.length && !/^\* \d+ FETCH/i.test(lines[i + 1]) && !/^A\d{4}/i.test(lines[i + 1])) {
        i++;
        block += '\r\n' + lines[i];
      }

      const env = parseEnvelopeBlock(block);
      if (env) results.push(env);
      i++;
    }
    return results;
  }

  async fetchFullMessage(uid: number): Promise<ImapMessage | null> {
    const lines = await this.cmd(`UID FETCH ${uid} (UID FLAGS RFC822.SIZE ENVELOPE RFC822)`, 60_000);

    // Reconstruct raw message
    let inBody = false;
    const bodyLines: string[] = [];
    let envelope: ImapEnvelope | null = null;

    for (const line of lines) {
      if (/^\* \d+ FETCH/i.test(line)) {
        envelope = parseEnvelopeBlock(line);
        const m = line.match(/RFC822\s+\{(\d+)\}/);
        if (m) inBody = true;
        continue;
      }
      if (inBody) {
        if (/^A\d{4}/i.test(line)) break;
        bodyLines.push(line);
      }
    }

    if (!bodyLines.length || !envelope) return null;

    const rawBody = bodyLines.join('\r\n');
    const { text, html } = parseMimeParts(rawBody);

    return {
      ...envelope,
      bodyText: text,
      bodyHtml: html,
      snippet:  snippet(text, html),
    };
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async markRead(uid: number, read: boolean): Promise<void> {
    const flag = read ? '+FLAGS' : '-FLAGS';
    await this.cmd(`UID STORE ${uid} ${flag} (\\Seen)`);
  }

  async markFlagged(uid: number, flagged: boolean): Promise<void> {
    const flag = flagged ? '+FLAGS' : '-FLAGS';
    await this.cmd(`UID STORE ${uid} ${flag} (\\Flagged)`);
  }

  async copyToFolder(uid: number, folder: string): Promise<void> {
    await this.cmd(`UID COPY ${uid} "${folder}"`);
  }

  async addFlag(uid: number, flag: string): Promise<void> {
    await this.cmd(`UID STORE ${uid} +FLAGS (${flag})`);
  }

  async expunge(): Promise<void> {
    await this.cmd('EXPUNGE');
  }

  async moveToTrash(uid: number, trashFolder = 'Trash'): Promise<void> {
    await this.cmd(`UID COPY ${uid} "${trashFolder}"`);
    await this.cmd(`UID STORE ${uid} +FLAGS (\\Deleted)`);
    await this.expunge();
  }
}

// ── Envelope parser ───────────────────────────────────────────────────────────

function parseEnvelopeBlock(block: string): ImapEnvelope | null {
  const uidM     = block.match(/UID\s+(\d+)/i);
  const sizeM    = block.match(/RFC822\.SIZE\s+(\d+)/i);
  const flagsM   = block.match(/FLAGS\s+\(([^)]*)\)/i);
  const envMatch = block.match(/ENVELOPE\s+\((.+)\)$/is) ||
                   block.match(/ENVELOPE\s+\(([\s\S]+?)\)(?:\s+RFC822|\s*\))/is);

  const uid   = uidM  ? parseInt(uidM[1])  : 0;
  const size  = sizeM ? parseInt(sizeM[1]) : 0;
  const flags = flagsM ? flagsM[1].split(/\s+/).filter(Boolean) : [];

  if (!envMatch) return { uid, flags, date: '', subject: '', from: '', fromName: '', to: '', messageId: '', size };

  // Very simplified envelope tokenizer
  const env = envMatch[1];
  const tokens = tokenizeImap(env);

  const date     = decodeHeader(tokens[0]  || '');
  const subject  = decodeHeader(tokens[1]  || '');
  const fromAddr = parseAddressList(tokens[2]  || '');
  const toAddr   = parseAddressList(tokens[5]  || '');
  const msgId    = tokens[9] || '';

  return {
    uid, flags, size,
    date:      date,
    subject:   subject,
    from:      fromAddr.email,
    fromName:  fromAddr.name,
    to:        toAddr.email,
    messageId: msgId.replace(/[<>]/g, ''),
  };
}

function tokenizeImap(s: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === ' ') { i++; continue; }
    if (s[i] === '"') {
      let j = i + 1;
      while (j < s.length && !(s[j] === '"' && s[j-1] !== '\\')) j++;
      tokens.push(s.slice(i + 1, j));
      i = j + 1;
    } else if (s[i] === '(') {
      let depth = 0, j = i;
      while (j < s.length) {
        if (s[j] === '(') depth++;
        if (s[j] === ')') { depth--; if (depth === 0) break; }
        j++;
      }
      tokens.push(s.slice(i, j + 1));
      i = j + 1;
    } else if (s.slice(i, i + 3) === 'NIL') {
      tokens.push('');
      i += 3;
    } else {
      let j = i;
      while (j < s.length && s[j] !== ' ' && s[j] !== ')') j++;
      tokens.push(s.slice(i, j));
      i = j;
    }
  }
  return tokens;
}

function parseAddressList(s: string): { name: string; email: string } {
  // IMAP address list format: ((name NIL mailbox host) ...)
  if (!s || s === 'NIL' || !s.startsWith('(')) return { name: '', email: '' };
  const inner = s.slice(1, -1).trim(); // remove outer parens
  const parts  = tokenizeImap(inner);
  if (parts.length < 1) return { name: '', email: '' };
  // Each address: (name smtp-at mailbox host)
  const addrStr = parts[0] || '';
  if (!addrStr.startsWith('(')) return { name: '', email: '' };
  const addrParts = tokenizeImap(addrStr.slice(1, -1));
  const name    = decodeHeader(addrParts[0] || '');
  const mailbox = addrParts[2] || '';
  const host    = addrParts[3] || '';
  const email   = mailbox && host ? `${mailbox}@${host}` : mailbox;
  return { name, email };
}

// ── Public convenience ────────────────────────────────────────────────────────

export async function testImapConnection(cfg: ImapConfig): Promise<void> {
  const client = new ImapClient(cfg);
  await client.connect();
  await client.login();
  await client.logout();
}

export async function syncInbox(
  cfg: ImapConfig,
  folder = 'INBOX',
  maxMessages = 50,
): Promise<ImapMessage[]> {
  const client = new ImapClient(cfg);
  try {
    await client.connect();
    await client.login();
    await client.selectFolder(folder);

    // Get last N UIDs
    const uids = await client.searchUids('ALL');
    const recent = uids.slice(-maxMessages).reverse();
    if (!recent.length) { await client.logout(); return []; }

    const envelopes = await client.fetchEnvelopes(recent);
    await client.logout();

    // Return envelopes with empty body (full fetch happens on demand)
    return envelopes.map(e => ({
      ...e,
      bodyText: '',
      bodyHtml: '',
      snippet:  '',
    }));
  } catch (e) {
    try { await client.logout(); } catch {}
    throw e;
  }
}
