/**
 * IMAP Client - implementado con modulos nativos de Node.js
 * Soporta TLS/SSL (puerto 993) y IMAP plano (puerto 143).
 *
 * Esta version evita la logica anterior basada en "broadcast" de lineas a
 * todas las peticiones pendientes, que hacia el flujo muy fragil. Aqui las
 * ordenes se ejecutan en serie y cada comando espera su respuesta etiquetada.
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

function parseMimeParts(raw: string): { text: string; html: string } {
  let text = '';
  let html = '';

  const contentTypeMatch = raw.match(/Content-Type:\s*([^\r\n;]+)/i);
  const mainCT = contentTypeMatch?.[1]?.trim().toLowerCase() || '';

  if (!raw.includes('boundary=') && !mainCT.includes('multipart')) {
    const headerEnd = raw.indexOf('\r\n\r\n');
    const body = headerEnd !== -1 ? raw.slice(headerEnd + 4) : raw;
    const cte = (raw.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1] || '').toLowerCase();
    const decoded = cte === 'base64'
      ? decodeBase64(body.replace(/\r?\n/g, ''))
      : cte === 'quoted-printable'
        ? decodeQuotedPrintable(body)
        : body;
    if (mainCT.includes('text/html')) html = decoded;
    else text = decoded;
    return { text, html };
  }

  const boundaryM = raw.match(/boundary="?([^"\r\n;]+)"?/i);
  if (!boundaryM) return { text, html };
  const boundary = boundaryM[1];

  const parts = raw.split(new RegExp(`--${escapeRegExp(boundary)}(?:--)?`));
  for (const part of parts) {
    if (!part.trim() || part.trim() === '--') continue;
    const partHeaderEnd = part.indexOf('\r\n\r\n');
    if (partHeaderEnd === -1) continue;
    const partHeaders = part.slice(0, partHeaderEnd);
    const partBody = part.slice(partHeaderEnd + 4);

    const partCT = (partHeaders.match(/Content-Type:\s*([^\r\n;]+)/i)?.[1] || '').trim().toLowerCase();
    const partCTE = (partHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1] || '').toLowerCase();

    if (partCT.includes('multipart')) {
      const sub = parseMimeParts(part);
      if (!text && sub.text) text = sub.text;
      if (!html && sub.html) html = sub.html;
      continue;
    }

    const decoded = partCTE === 'base64'
      ? decodeBase64(partBody.replace(/\r?\n/g, ''))
      : partCTE === 'quoted-printable'
        ? decodeQuotedPrintable(partBody)
        : partBody;

    if (partCT.includes('text/html') && !html) html = decoded;
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

function tokenizeImap(s: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === ' ') { i++; continue; }
    if (s[i] === '"') {
      let j = i + 1;
      while (j < s.length && !(s[j] === '"' && s[j - 1] !== '\\')) j++;
      tokens.push(s.slice(i + 1, j));
      i = j + 1;
    } else if (s[i] === '(') {
      let depth = 0;
      let j = i;
      while (j < s.length) {
        if (s[j] === '(') depth++;
        if (s[j] === ')') {
          depth--;
          if (depth === 0) break;
        }
        j++;
      }
      tokens.push(s.slice(i, j + 1));
      i = j + 1;
    } else if (s.slice(i, i + 3).toUpperCase() === 'NIL') {
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
  if (!s || s === 'NIL' || !s.startsWith('(')) return { name: '', email: '' };
  const inner = s.slice(1, -1).trim();
  const parts = tokenizeImap(inner);
  if (!parts.length) return { name: '', email: '' };
  const addrStr = parts[0] || '';
  if (!addrStr.startsWith('(')) return { name: '', email: '' };
  const addrParts = tokenizeImap(addrStr.slice(1, -1));
  const name = decodeHeader(addrParts[0] || '');
  const mailbox = addrParts[2] || '';
  const host = addrParts[3] || '';
  const email = mailbox && host ? `${mailbox}@${host}` : mailbox;
  return { name, email };
}

function parseEnvelopeBlock(block: string): ImapEnvelope | null {
  const uidM = block.match(/UID\s+(\d+)/i);
  const sizeM = block.match(/RFC822\.SIZE\s+(\d+)/i);
  const flagsM = block.match(/FLAGS\s+\(([^)]*)\)/i);
  const envMatch = block.match(/ENVELOPE\s+\(([\s\S]+?)\)(?=\s+(?:RFC822|BODY|BODY\[|UID|FLAGS|RFC822\.SIZE|\)))/i)
    || block.match(/ENVELOPE\s+\(([\s\S]+)\)\s*$/i);

  const uid = uidM ? parseInt(uidM[1], 10) : 0;
  const size = sizeM ? parseInt(sizeM[1], 10) : 0;
  const flags = flagsM ? flagsM[1].split(/\s+/).filter(Boolean) : [];

  if (!envMatch) {
    return {
      uid,
      flags,
      date: '',
      subject: '',
      from: '',
      fromName: '',
      to: '',
      messageId: '',
      size,
    };
  }

  const env = envMatch[1];
  const tokens = tokenizeImap(env);
  const date = decodeHeader(tokens[0] || '');
  const subject = decodeHeader(tokens[1] || '');
  const fromAddr = parseAddressList(tokens[2] || '');
  const toAddr = parseAddressList(tokens[5] || '');
  const msgId = (tokens[9] || '').replace(/[<>]/g, '');

  return {
    uid,
    flags,
    size,
    date,
    subject,
    from: fromAddr.email,
    fromName: fromAddr.name,
    to: toAddr.email,
    messageId: msgId,
  };
}

function splitFetchBlocks(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^\* \d+ FETCH/i.test(line)) {
      if (current.length) blocks.push(current.join('\r\n'));
      current = [line];
      continue;
    }
    if (current.length) {
      current.push(line);
    }
  }

  if (current.length) blocks.push(current.join('\r\n'));
  return blocks;
}

export class ImapClient {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private buffer = '';
  private tagCtr = 0;

  constructor(private cfg: ImapConfig) {}

  private nextTag() {
    return `A${String(++this.tagCtr).padStart(4, '0')}`;
  }

  private ensureSocket() {
    if (!this.socket) throw new Error('No hay conexion IMAP activa');
    return this.socket;
  }

  private waitForLine(timeoutMs = 15_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = this.ensureSocket();
      let settled = false;

      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
        clearTimeout(timer);
      };

      const finish = (cb: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        cb();
      };

      const tryResolve = () => {
        const idx = this.buffer.indexOf('\r\n');
        if (idx === -1) return;
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 2);
        finish(() => resolve(line));
      };

      const onData = (chunk: Buffer) => {
        this.buffer += chunk.toString('binary');
        tryResolve();
      };

      const onError = (error: Error) => finish(() => reject(error));
      const timer = setTimeout(() => finish(() => reject(new Error('IMAP timeout esperando linea'))), timeoutMs);

      socket.on('data', onData);
      socket.once('error', onError);
      tryResolve();
    });
  }

  private waitForTaggedResponse(tag: string, timeoutMs = 30_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = this.ensureSocket();
      let settled = false;

      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
        clearTimeout(timer);
      };

      const finish = (cb: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        cb();
      };

      const taggedRegex = new RegExp(`(?:^|\\r\\n)${tag}\\s+(OK|NO|BAD)\\s*([^\\r\\n]*)`, 'i');

      const tryResolve = () => {
        const match = this.buffer.match(taggedRegex);
        if (!match) return;

        const status = (match[1] || '').toUpperCase();
        const info = match[2] || '';
        const endIndex = (match.index || 0) + match[0].length;
        const payload = this.buffer.slice(0, endIndex);
        this.buffer = this.buffer.slice(endIndex).replace(/^\r\n/, '');

        if (status === 'OK') {
          finish(() => resolve(payload));
        } else {
          finish(() => reject(new Error(`IMAP ${status}: ${info || 'error desconocido'} (tag ${tag})`)));
        }
      };

      const onData = (chunk: Buffer) => {
        this.buffer += chunk.toString('binary');
        tryResolve();
      };

      const onError = (error: Error) => finish(() => reject(error));
      const timer = setTimeout(() => finish(() => reject(new Error(`IMAP timeout on tag ${tag}`))), timeoutMs);

      socket.on('data', onData);
      socket.once('error', onError);
      tryResolve();
    });
  }

  private async cmd(command: string, timeoutMs = 30_000): Promise<string> {
    const socket = this.ensureSocket();
    const tag = this.nextTag();
    socket.write(`${tag} ${command}\r\n`);
    return this.waitForTaggedResponse(tag, timeoutMs);
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (cb: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cb();
      };

      const attach = (sock: net.Socket | tls.TLSSocket) => {
        this.socket = sock;
        sock.setEncoding('binary');
        sock.once('error', (error) => finish(() => reject(error)));
      };

      const timer = setTimeout(() => finish(() => reject(new Error('IMAP connect timeout'))), 15_000);

      if (this.cfg.secure) {
        const sock = tls.connect(
          {
            host: this.cfg.host,
            port: this.cfg.port,
            rejectUnauthorized: false,
          },
          () => finish(() => resolve()),
        );
        attach(sock);
      } else {
        const sock = net.connect({ host: this.cfg.host, port: this.cfg.port }, () => finish(() => resolve()));
        attach(sock);
      }
    });

    const greeting = await this.waitForLine(15_000);
    if (!/^\*\s+OK/i.test(greeting)) {
      throw new Error(`Saludo IMAP inesperado: ${greeting}`);
    }
  }

  async login(): Promise<void> {
    await this.cmd(`LOGIN "${this.cfg.user.replace(/"/g, '\\"')}" "${this.cfg.password.replace(/"/g, '\\"')}"`);
  }

  async logout(): Promise<void> {
    try {
      await this.cmd('LOGOUT', 5_000);
    } catch {
      // best effort
    }
    this.socket?.destroy();
    this.socket = null;
  }

  async listFolders(): Promise<string[]> {
    const raw = await this.cmd('LIST "" "*"');
    return raw
      .split('\r\n')
      .filter((line) => /^\* LIST/i.test(line))
      .map((line) => {
        const m = line.match(/"([^"]+)"\s*$/) || line.match(/\s(\S+)\s*$/);
        return m ? m[1] : '';
      })
      .filter(Boolean);
  }

  async selectFolder(folder: string): Promise<{ exists: number; unseen: number }> {
    const raw = await this.cmd(`SELECT "${folder.replace(/"/g, '\\"')}"`);
    let exists = 0;
    let unseen = 0;
    for (const line of raw.split('\r\n')) {
      const em = line.match(/^\*\s+(\d+)\s+EXISTS/i);
      if (em) exists = parseInt(em[1], 10);
      const um = line.match(/\[UNSEEN\s+(\d+)\]/i);
      if (um) unseen = parseInt(um[1], 10);
    }
    return { exists, unseen };
  }

  async searchUids(criteria = 'ALL'): Promise<number[]> {
    const raw = await this.cmd(`UID SEARCH ${criteria}`);
    for (const line of raw.split('\r\n')) {
      const m = line.match(/^\*\s+SEARCH\s+([\d\s]+)/i);
      if (m) return m[1].trim().split(/\s+/).map(Number).filter(Boolean);
    }
    return [];
  }

  async fetchEnvelopes(uids: number[]): Promise<ImapEnvelope[]> {
    if (!uids.length) return [];
    const uidList = uids.join(',');
    const raw = await this.cmd(`UID FETCH ${uidList} (UID FLAGS RFC822.SIZE ENVELOPE)`, 60_000);
    return splitFetchBlocks(raw)
      .map((block) => parseEnvelopeBlock(block))
      .filter((item): item is ImapEnvelope => Boolean(item));
  }

  async fetchFullMessage(uid: number): Promise<ImapMessage | null> {
    const raw = await this.cmd(`UID FETCH ${uid} (UID FLAGS RFC822.SIZE ENVELOPE RFC822)`, 60_000);
    const block = splitFetchBlocks(raw)[0];
    if (!block) return null;

    const envelope = parseEnvelopeBlock(block);
    if (!envelope) return null;

    const literalMatch = block.match(/RFC822\s+\{(\d+)\}\r\n/i);
    if (!literalMatch) {
      return {
        ...envelope,
        bodyText: '',
        bodyHtml: '',
        snippet: '',
      };
    }

    const literalSize = parseInt(literalMatch[1], 10);
    const bodyStart = block.indexOf(literalMatch[0]) + literalMatch[0].length;
    const rawBody = block.slice(bodyStart, bodyStart + literalSize);
    const { text, html } = parseMimeParts(rawBody);

    return {
      ...envelope,
      bodyText: text,
      bodyHtml: html,
      snippet: snippet(text, html),
    };
  }

  async markRead(uid: number, read: boolean): Promise<void> {
    const flag = read ? '+FLAGS' : '-FLAGS';
    await this.cmd(`UID STORE ${uid} ${flag} (\\Seen)`);
  }

  async markFlagged(uid: number, flagged: boolean): Promise<void> {
    const flag = flagged ? '+FLAGS' : '-FLAGS';
    await this.cmd(`UID STORE ${uid} ${flag} (\\Flagged)`);
  }

  async copyToFolder(uid: number, folder: string): Promise<void> {
    await this.cmd(`UID COPY ${uid} "${folder.replace(/"/g, '\\"')}"`);
  }

  async addFlag(uid: number, flag: string): Promise<void> {
    await this.cmd(`UID STORE ${uid} +FLAGS (${flag})`);
  }

  async expunge(): Promise<void> {
    await this.cmd('EXPUNGE');
  }

  async moveToTrash(uid: number, trashFolder = 'Trash'): Promise<void> {
    await this.cmd(`UID COPY ${uid} "${trashFolder.replace(/"/g, '\\"')}"`);
    await this.cmd(`UID STORE ${uid} +FLAGS (\\Deleted)`);
    await this.expunge();
  }
}

export async function testImapConnection(cfg: ImapConfig): Promise<void> {
  const client = new ImapClient(cfg);
  try {
    await client.connect();
    await client.login();
  } finally {
    await client.logout().catch(() => undefined);
  }
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

    const uids = await client.searchUids('ALL');
    const recent = uids.slice(-maxMessages).reverse();
    if (!recent.length) return [];

    const envelopes = await client.fetchEnvelopes(recent);
    return envelopes.map((e) => ({
      ...e,
      bodyText: '',
      bodyHtml: '',
      snippet: '',
    }));
  } finally {
    await client.logout().catch(() => undefined);
  }
}
