const { ImapFlow } = require('imapflow');
import { simpleParser } from 'mailparser';

export interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

export interface ImapFolderInfo {
  path: string;
  name: string;
  specialUse?: string;
  flags: string[];
}

export interface ImapEnvelope {
  uid: number;
  flags: string[];
  date: string;
  subject: string;
  from: string;
  fromName: string;
  to: string;
  messageId: string;
  size: number;
  hasAttachments: boolean;
}

export interface ImapAttachment {
  filename: string;
  contentType: string;
  size: number;
}

export interface ImapMessage extends ImapEnvelope {
  bodyText: string;
  bodyHtml: string;
  snippet: string;
  attachments: ImapAttachment[];
}

function normalizeCharset(cs: string): BufferEncoding {
  const c = cs.toLowerCase().trim().replace(/[-_]/g, '');
  if (c === 'iso88591' || c === 'latin1' || c === 'windows1252' || c === 'cp1252') return 'latin1';
  if (c === 'usascii' || c === 'ascii') return 'ascii';
  return 'utf8';
}

function extractCharset(headers: string): BufferEncoding {
  const m = headers.match(/charset\s*=\s*(?:"([^"]+)"|([^\s;>\r\n]+))/i);
  return normalizeCharset(m?.[1] || m?.[2] || 'utf-8');
}

function decodeBase64(s: string, charset: BufferEncoding = 'utf8'): string {
  try {
    return Buffer.from(s, 'base64').toString(charset);
  } catch {
    try { return Buffer.from(s, 'base64').toString('utf8'); } catch { return s; }
  }
}

function decodeQuotedPrintable(s: string, charset: BufferEncoding = 'utf8'): string {
  const bytes = s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
  try {
    return Buffer.from(bytes, 'binary').toString(charset);
  } catch {
    return bytes;
  }
}

function decodeHeader(raw: string): string {
  if (!raw) return '';
  return raw.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, charset, enc, text) => {
    try {
      const cs = normalizeCharset(String(charset));
      if (String(enc).toUpperCase() === 'B') {
        return decodeBase64(String(text), cs);
      }
      return decodeQuotedPrintable(String(text), cs);
    } catch {
      return String(text);
    }
  });
}

// El body (texto/HTML/adjuntos/imagenes inline cid:) se parsea con mailparser
// (ver fetchFullMessage) en vez de con un parser MIME artesanal — mailparser
// resuelve correctamente adjuntos, imagenes cid: embebidas y encodings raros.

function buildSnippet(text: string, html: string): string {
  const plain = text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.slice(0, 200);
}

function normalizeFlags(flags: any): string[] {
  if (!flags) return [];
  if (Array.isArray(flags)) return flags.map((flag) => String(flag));
  if (flags instanceof Set) return Array.from(flags).map((flag) => String(flag));
  return [];
}

function normalizeAddress(addresses: any): { email: string; name: string } {
  const first = Array.isArray(addresses) ? addresses[0] : null;
  if (!first) return { email: '', name: '' };

  const email = String(first.address || first.email || '').trim();
  const name = decodeHeader(String(first.name || first.displayName || '').trim());
  return { email, name };
}

// Recorre el arbol de bodyStructure (metadata de las partes MIME, sin descargar
// contenido) para saber si el mensaje trae adjuntos reales — permite mostrar el
// icono de adjunto en la lista sin tener que bajar el cuerpo completo de cada correo.
function structureHasAttachment(node: any): boolean {
  if (!node) return false;
  const disposition = String(node.disposition || '').toLowerCase();
  const filename = node.dispositionParameters?.filename || node.parameters?.name;
  if (disposition === 'attachment' && filename) return true;
  if (disposition !== 'inline' && filename && !String(node.type || '').toLowerCase().startsWith('text/')) return true;
  if (Array.isArray(node.childNodes)) return node.childNodes.some(structureHasAttachment);
  return false;
}

function mapEnvelope(message: any): ImapEnvelope {
  const envelope = message?.envelope || {};
  const from = normalizeAddress(envelope.from);
  const to = normalizeAddress(envelope.to);

  let date = '';
  if (envelope.date instanceof Date) date = envelope.date.toISOString();
  else if (message?.internalDate instanceof Date) date = message.internalDate.toISOString();
  else if (envelope.date) date = String(envelope.date);

  return {
    uid: Number(message?.uid || 0),
    flags: normalizeFlags(message?.flags),
    date,
    subject: decodeHeader(String(envelope.subject || '')),
    from: from.email,
    fromName: from.name,
    to: to.email,
    messageId: String(envelope.messageId || '').replace(/[<>]/g, ''),
    size: Number(message?.size || message?.source?.length || 0),
    hasAttachments: structureHasAttachment(message?.bodyStructure),
  };
}

export class ImapClient {
  private client: any = null;
  private mailboxLock: any = null;
  private currentMailbox = '';

  constructor(private cfg: ImapConfig) {}

  private ensureClient() {
    if (!this.client) throw new Error('No hay conexion IMAP activa');
    return this.client;
  }

  private async releaseMailboxLock() {
    if (this.mailboxLock) {
      try {
        this.mailboxLock.release();
      } catch {
        // noop
      }
      this.mailboxLock = null;
    }
  }

  async connect(): Promise<void> {
    if (this.client) return;

    this.client = new ImapFlow({
      host: this.cfg.host,
      port: this.cfg.port,
      secure: this.cfg.secure,
      auth: {
        user: this.cfg.user,
        pass: this.cfg.password,
      },
      logger: false,
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15_000,
      socketTimeout: 20_000,
      greetingTimeout: 10_000,
    });

    const connectPromise = this.client.connect();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('IMAP connect timeout (15s)')), 15_000)
    );
    await Promise.race([connectPromise, timeoutPromise]);
  }

  async login(): Promise<void> {
    // ImapFlow autentica durante connect(); mantenemos el metodo por compatibilidad.
  }

  async logout(): Promise<void> {
    await this.releaseMailboxLock();

    if (!this.client) return;

    try {
      await this.client.logout();
    } catch {
      try {
        this.client.close();
      } catch {
        // noop
      }
    } finally {
      this.client = null;
      this.currentMailbox = '';
    }
  }

  async listFolders(): Promise<ImapFolderInfo[]> {
    const client = this.ensureClient();
    const boxes = await client.list();

    // Gmail virtual labels not accessible via standard IMAP
    const BLOCKED_PATHS = new Set([
      'snoozed', '[gmail]/snoozed',
      'category_personal', 'category_social', 'category_promotions',
      'category_updates', 'category_forums',
      '[gmail]/category_personal', '[gmail]/category_social',
      '[gmail]/category_promotions', '[gmail]/category_updates',
      '[gmail]/category_forums',
    ]);

    const folders: ImapFolderInfo[] = [];
    const walk = (items: any[]) => {
      for (const item of items || []) {
        const flags: string[] = item.flags instanceof Set
          ? Array.from(item.flags).map(String)
          : (Array.isArray(item.flags) ? item.flags.map(String) : []);

        const noSelect = flags.some(f => f.toLowerCase() === '\\noselect');
        const path = String(item.path || item.name || '');

        if (!noSelect && path && !BLOCKED_PATHS.has(path.toLowerCase())) {
          folders.push({
            path,
            name: String(item.name || path.split(String(item.delimiter || '/')).pop() || path),
            specialUse: item.specialUse ? String(item.specialUse) : undefined,
            flags,
          });
        }
        if (item.children?.length) walk(item.children);
      }
    };

    walk(boxes);
    return folders;
  }

  async createFolder(folder: string): Promise<void> {
    const client = this.ensureClient();
    await client.mailboxCreate(folder);
  }

  async selectFolder(folder: string): Promise<{ exists: number; unseen: number }> {
    const client = this.ensureClient();

    await this.releaseMailboxLock();
    try {
      this.mailboxLock = await client.getMailboxLock(folder);
    } catch (e: any) {
      const msg = String(e?.message || e || '').toLowerCase();
      if (msg.includes('invalid label') || msg.includes('nonexistent') || msg.includes('no such mailbox')) {
        throw new Error(`La carpeta "${folder}" no existe o no es accesible en este servidor de correo.`);
      }
      throw e;
    }
    this.currentMailbox = folder;

    return {
      exists: Number(client.mailbox?.exists || 0),
      unseen: Number(client.mailbox?.unseen || 0),
    };
  }

  async searchUids(criteria = 'ALL'): Promise<number[]> {
    const client = this.ensureClient();
    const exists = Number(client.mailbox?.exists || 0);
    if (!exists) return [];
    const uids: number[] = [];
    for await (const message of client.fetch(`${Math.max(1, exists - 499)}:*`, { uid: true }, { uid: false })) {
      if (message?.uid) uids.push(Number(message.uid));
    }
    return uids;
  }

  async searchUidsSince(since: Date): Promise<number[]> {
    const client = this.ensureClient();
    const uids: number[] = [];
    try {
      const found = await client.search({ since }, { uid: true });
      if (Array.isArray(found)) {
        for (const u of found) uids.push(Number(u));
      }
    } catch {
      // Fallback: fetch the last 100 by sequence if SEARCH fails
      const exists = Number(client.mailbox?.exists || 0);
      if (exists > 0) {
        for await (const msg of client.fetch(`${Math.max(1, exists - 99)}:*`, { uid: true }, { uid: false })) {
          if (msg?.uid) uids.push(Number(msg.uid));
        }
      }
    }
    return uids;
  }

  async fetchEnvelopes(uids: number[]): Promise<ImapEnvelope[]> {
    if (!uids.length) return [];
    const client = this.ensureClient();
    const result: ImapEnvelope[] = [];
    const range = uids.join(',');

    for await (const message of client.fetch(range, {
      uid: true,
      envelope: true,
      flags: true,
      size: true,
      internalDate: true,
      bodyStructure: true,
    }, { uid: true })) {
      result.push(mapEnvelope(message));
    }

    return result;
  }

  async fetchFullMessage(uid: number): Promise<ImapMessage | null> {
    const client = this.ensureClient();
    const message = await client.fetchOne(uid, {
      uid: true,
      envelope: true,
      flags: true,
      size: true,
      internalDate: true,
      source: true,
    }, { uid: true });

    if (!message) return null;

    const sourceBuffer: Buffer = Buffer.isBuffer(message.source)
      ? message.source
      : Buffer.from(String(message.source || ''), 'utf8');
    const parsed = await simpleParser(sourceBuffer);
    const envelope = mapEnvelope(message);

    // mailparser ya sustituye las imagenes inline (cid:) por data: URIs dentro
    // del HTML por defecto, y marca con related=true los adjuntos que ya quedaron
    // embebidos asi — se excluyen de la lista de adjuntos descargables para no duplicar.
    const bodyHtml = typeof parsed.html === 'string' ? parsed.html : '';
    const bodyText = parsed.text || '';
    const attachments: ImapAttachment[] = (parsed.attachments || [])
      .filter((a) => !a.related)
      .map((a) => ({
        filename: a.filename || 'archivo adjunto',
        contentType: a.contentType || 'application/octet-stream',
        size: a.size || 0,
      }));

    return {
      ...envelope,
      bodyText,
      bodyHtml,
      snippet: buildSnippet(bodyText, bodyHtml),
      attachments,
      hasAttachments: envelope.hasAttachments || attachments.length > 0,
    };
  }

  /** Re-descarga el mensaje completo y devuelve el Buffer de un adjunto concreto por indice
   *  (mismo orden que fetchFullMessage().attachments) — usado por el endpoint de descarga. */
  async fetchAttachment(uid: number, index: number): Promise<{ filename: string; contentType: string; content: Buffer } | null> {
    const client = this.ensureClient();
    const message = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
    if (!message) return null;

    const sourceBuffer: Buffer = Buffer.isBuffer(message.source)
      ? message.source
      : Buffer.from(String(message.source || ''), 'utf8');
    const parsed = await simpleParser(sourceBuffer);
    const downloadable = (parsed.attachments || []).filter((a) => !a.related);
    const att = downloadable[index];
    if (!att) return null;

    return {
      filename: att.filename || 'archivo adjunto',
      contentType: att.contentType || 'application/octet-stream',
      content: att.content,
    };
  }

  async markRead(uid: number, read: boolean): Promise<void> {
    const client = this.ensureClient();
    if (read) {
      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    } else {
      await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
    }
  }

  async markFlagged(uid: number, flagged: boolean): Promise<void> {
    const client = this.ensureClient();
    if (flagged) {
      await client.messageFlagsAdd(uid, ['\\Flagged'], { uid: true });
    } else {
      await client.messageFlagsRemove(uid, ['\\Flagged'], { uid: true });
    }
  }

  async copyToFolder(uid: number, folder: string): Promise<void> {
    const client = this.ensureClient();
    await client.messageCopy(uid, folder, { uid: true });
  }

  async addFlag(uid: number, flag: string): Promise<void> {
    const client = this.ensureClient();
    await client.messageFlagsAdd(uid, [flag], { uid: true });
  }

  async expunge(): Promise<void> {
    const client = this.ensureClient();
    await client.mailboxExpunge();
  }

  async moveToTrash(uid: number, trashFolder = 'Trash'): Promise<void> {
    const client = this.ensureClient();
    await client.messageMove(uid, trashFolder, { uid: true });
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
  since?: Date,
): Promise<ImapMessage[]> {
  const client = new ImapClient(cfg);

  try {
    await client.connect();
    await client.login();
    const selected = await client.selectFolder(folder);

    if (!selected.exists) return [];

    let uids: number[];
    if (since) {
      uids = await client.searchUidsSince(since);
      // Still cap at maxMessages most-recent to avoid huge fetches after long gaps
      uids = uids.slice(-maxMessages);
    } else {
      uids = await client.searchUids('ALL');
      uids = uids.slice(-maxMessages);
    }

    if (!uids.length) return [];

    const envelopes = await client.fetchEnvelopes(uids.reverse());
    return envelopes.map((message) => ({
      ...message,
      bodyText: '',
      bodyHtml: '',
      snippet: '',
      attachments: [],
    }));
  } finally {
    await client.logout().catch(() => undefined);
  }
}
