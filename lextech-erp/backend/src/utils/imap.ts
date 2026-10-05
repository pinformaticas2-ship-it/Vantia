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
  /** Separador de jerarquía del servidor ("/" o ".") para montar el árbol de carpetas. */
  delimiter?: string;
  /** Carpeta contenedor (Noselect): solo agrupa subcarpetas, no tiene correo propio. */
  noSelect?: boolean;
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

/** Rechaza si la promesa no termina a tiempo (la operación de fondo no se
 *  cancela sola: quien llama debe cerrar la conexión, ver forceClose). */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(`Tiempo agotado (${Math.round(ms / 1000)} s): ${label}`)), ms); }),
  ]);
}

export interface RawFolderProbe {
  path: string;
  name: string;
  delimiter: string | null;
  flags: string[];
  specialUse: string | null;
  subscribed: boolean;
  noSelect: boolean;
  /** Mensajes según STATUS (sin abrir la carpeta). */
  statusMessages: number | null;
  /** Mensajes según SELECT/EXAMINE. */
  exists: number | null;
  opened: boolean;
  searchCount: number | null;
  searchRejected: boolean;
  latestUid: number | null;
  latestDate: string | null;
  latestSubject: string | null;
  error: string | null;
  ms: number;
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

  /** Sondeo completo del buzón (solo lectura): estructura de carpetas tal
   *  cual la da el servidor y, para cada carpeta abrible, si se puede abrir,
   *  cuántos mensajes tiene, si la búsqueda por fecha funciona y cuál es su
   *  último mensaje. Lo usa probeImapAccount (emailController) para el
   *  diagnóstico "Diagnosticar buzón". */
  async probeAll(since: Date): Promise<{ capabilities: string[]; folders: RawFolderProbe[] }> {
    const client = this.ensureClient();
    await this.releaseMailboxLock();
    const capabilities = client.capabilities ? Array.from((client.capabilities as Map<string, any>).keys()).map(String) : [];
    let boxes: any[] = [];
    try {
      boxes = await client.list({ statusQuery: { messages: true, unseen: true, uidNext: true } });
    } catch {
      boxes = await client.list();
    }
    const folders: RawFolderProbe[] = [];
    for (const box of boxes) {
      const flags: string[] = box.flags instanceof Set ? Array.from(box.flags).map(String) : (Array.isArray(box.flags) ? box.flags.map(String) : []);
      const probe: RawFolderProbe = {
        path: String(box.path),
        name: String(box.name || box.path),
        delimiter: box.delimiter ? String(box.delimiter) : null,
        flags,
        specialUse: box.specialUse ? String(box.specialUse) : null,
        subscribed: box.subscribed === true,
        noSelect: flags.some((f) => f.toLowerCase() === '\\noselect'),
        statusMessages: box.status?.messages ?? null,
        exists: null, opened: false, searchCount: null, searchRejected: false, latestUid: null,
        latestDate: null, latestSubject: null, error: null, ms: 0,
      };
      if (!probe.noSelect) {
        const t0 = Date.now();
        let lock: any = null;
        try {
          lock = await client.getMailboxLock(probe.path, { readOnly: true });
          probe.opened = true;
          probe.exists = Number(client.mailbox?.exists || 0);
          const found = await client.search({ since }, { uid: true });
          if (Array.isArray(found)) probe.searchCount = found.length; else probe.searchRejected = true;
          if (probe.exists > 0) {
            for await (const msg of client.fetch(`${probe.exists}:*`, { uid: true, envelope: true }, { uid: false })) {
              probe.latestUid = Number(msg.uid);
              probe.latestDate = msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null;
              probe.latestSubject = msg.envelope?.subject ? String(msg.envelope.subject).slice(0, 120) : null;
            }
          }
        } catch (e: any) {
          probe.error = String(e?.responseText || e?.message || e).slice(0, 300);
        } finally {
          try { lock?.release(); } catch { /* noop */ }
          probe.ms = Date.now() - t0;
        }
      }
      folders.push(probe);
    }
    return { capabilities, folders };
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

    // imapflow emite 'error' cuando la sesión muere a medias (p.ej. tras un
    // corte por tiempo agotado); sin oyente, ese evento acaba como rechazo no
    // controlado. Los errores reales ya llegan por las promesas de cada orden.
    this.client.on('error', (e: any) => {
      console.warn(`[imap] ${this.cfg.user}@${this.cfg.host}:`, e?.message || e);
    });

    const connectPromise = this.client.connect();
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('El servidor de correo no responde (tiempo de conexión agotado)')), 15_000);
    });
    try {
      await Promise.race([connectPromise, timeoutPromise]);
    } catch (e) {
      // Sin esto quedaba un cliente a medio conectar y el logout() posterior
      // esperaba para siempre, colgando la sincronización de TODAS las cuentas.
      connectPromise.catch(() => undefined);
      this.forceClose();
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Corta la conexión sin esperar respuesta del servidor. */
  forceClose(): void {
    const client = this.client;
    this.client = null;
    this.mailboxLock = null;
    this.currentMailbox = '';
    try { client?.close(); } catch { /* noop */ }
  }

  async login(): Promise<void> {
    // ImapFlow autentica durante connect(); mantenemos el metodo por compatibilidad.
  }

  async logout(): Promise<void> {
    await this.releaseMailboxLock();

    if (!this.client) return;

    try {
      // Un servidor que no contesta al LOGOUT no puede dejarnos esperando.
      await withTimeout(this.client.logout(), 5_000, 'logout');
    } catch {
      try {
        this.client?.close();
      } catch {
        // noop
      }
    } finally {
      this.client = null;
      this.currentMailbox = '';
    }
  }

  /** Por defecto, como Thunderbird: solo las carpetas suscritas (más Recibidos
   *  y las del sistema, siempre). Si el servidor no informa de suscripciones se
   *  devuelven todas. includeUnsubscribed=true las devuelve todas siempre (p.ej.
   *  para comprobar si un nombre ya existe antes de crear una carpeta). */
  async listFolders(opts: { includeUnsubscribed?: boolean } = {}): Promise<ImapFolderInfo[]> {
    const client = this.ensureClient();
    const boxes = await client.list();
    const flat: any[] = [];
    const collect = (items: any[]) => { for (const it of items || []) { flat.push(it); if (it.children?.length) collect(it.children); } };
    collect(boxes);
    const onlySubscribed = !opts.includeUnsubscribed && flat.some((it) => it.subscribed === true);

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

        // Las contenedor (Noselect) también se devuelven, marcadas, para que
        // sus subcarpetas no queden huérfanas al montar el árbol en el cliente.
        const alwaysVisible = path.toUpperCase() === 'INBOX' || Boolean(item.specialUse);
        const hidden = onlySubscribed && item.subscribed !== true && !alwaysVisible;
        if (path && !hidden && !BLOCKED_PATHS.has(path.toLowerCase())) {
          folders.push({
            path,
            name: String(item.name || path.split(String(item.delimiter || '/')).pop() || path),
            specialUse: item.specialUse ? String(item.specialUse) : undefined,
            flags,
            delimiter: item.delimiter ? String(item.delimiter) : undefined,
            noSelect,
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
    // Sin suscribirla, ni Thunderbird ni Vantia (que solo muestran las
    // suscritas) la verían.
    try { await client.mailboxSubscribe(folder); } catch { /* servidor sin suscripciones */ }
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

  /** UID de los mensajes desde una fecha, o null si el servidor rechaza la
   *  búsqueda. OJO: imapflow NO lanza excepción cuando el SEARCH falla,
   *  devuelve `false` -- antes eso se trataba como "no hay mensajes" y la
   *  carpeta dejaba de actualizarse en silencio (le pasó a Recibidos). */
  async searchUidsSince(since: Date): Promise<number[] | null> {
    const client = this.ensureClient();
    try {
      const found = await client.search({ since }, { uid: true });
      return Array.isArray(found) ? found.map(Number) : null;
    } catch {
      return null;
    }
  }

  /** UID de los últimos `count` mensajes por posición -- no depende de SEARCH,
   *  así que sirve de plan B si el servidor rechaza las búsquedas. */
  /** Todos los UID de la carpeta seleccionada (FETCH 1:* UID) -- no usa SEARCH. */
  async allUids(): Promise<number[]> {
    const client = this.ensureClient();
    const exists = Number(client.mailbox?.exists || 0);
    const uids: number[] = [];
    if (exists > 0) {
      for await (const msg of client.fetch('1:*', { uid: true }, { uid: false })) {
        if (msg?.uid) uids.push(Number(msg.uid));
      }
    }
    return uids;
  }

  async recentUidsBySequence(count: number): Promise<number[]> {
    const client = this.ensureClient();
    const exists = Number(client.mailbox?.exists || 0);
    const uids: number[] = [];
    if (exists > 0) {
      for await (const msg of client.fetch(`${Math.max(1, exists - count + 1)}:*`, { uid: true }, { uid: false })) {
        if (msg?.uid) uids.push(Number(msg.uid));
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
  /** UID que ya están guardados: además de los más recientes, se traen los
   *  que falten (hasta maxMessages) para ir rellenando huecos. */
  knownUids?: Set<number>,
  report?: (warning: string) => void,
  onServerState?: (state: FolderServerState) => void,
): Promise<ImapMessage[]> {
  const client = new ImapClient(cfg);

  try {
    await client.connect();
    await client.login();
    return await fetchFolderEnvelopes(client, folder, maxMessages, since, knownUids, report, onServerState);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** Igual que syncInbox pero sobre una conexión ya abierta -- para recorrer
 *  todas las carpetas de una cuenta con un único login (ver
 *  syncImapAccountAllFolders en emailController.ts). */
export type FolderClient = Pick<ImapClient, 'selectFolder' | 'recentUidsBySequence' | 'allUids' | 'fetchEnvelopes'>;

/** Estado de la carpeta en el servidor, para que quien llama pueda quitar de
 *  Vantia lo que ya no existe allí (borrado o movido). allUids es null si no
 *  hizo falta pedir la lista completa (la carpeta no había cambiado). */
export interface FolderServerState { exists: number; allUids: number[] | null }

/** Mensajes nuevos de las últimas posiciones a los que se refresca leído/destacado en cada pasada. */
const FLAG_REFRESH_COUNT = 20;

/**
 * Trae la tanda de mensajes que toca de una carpeta, como Thunderbird:
 *  - Si la carpeta no ha cambiado (mismo número de mensajes y su último ya
 *    guardado) solo se refrescan los más recientes.
 *  - Si no, se pide la lista COMPLETA de UID (FETCH 1:* UID; solo números, y
 *    sin depender de SEARCH, que hay servidores que rechazan o devuelven
 *    incompleto) y se descargan los que faltan por tandas, de más nuevo a más
 *    antiguo, hasta que la carpeta queda completa.
 * Regresiones que esto evita (05/10/2026): SEARCH rechazado en silencio dejaba
 * Recibidos sin actualizar; la ventana de 120 días dejaba fuera el historial.
 */
export async function fetchFolderEnvelopes(
  client: FolderClient,
  folder: string,
  maxMessages = 50,
  _since?: Date,
  knownUids?: Set<number>,
  report?: (warning: string) => void,
  onServerState?: (state: FolderServerState) => void,
): Promise<ImapMessage[]> {
  const selected = await client.selectFolder(folder);
  const exists = Number(selected.exists || 0);
  if (!exists) { onServerState?.({ exists: 0, allUids: [] }); return []; }

  const known = knownUids || new Set<number>();
  const [latest] = await client.recentUidsBySequence(1);
  const unchanged = Boolean(latest) && known.has(latest) && known.size === exists;

  let missingBatch: number[] = [];
  if (unchanged) {
    onServerState?.({ exists, allUids: null });
  } else {
    const all = await client.allUids();
    if (all.length !== exists) {
      report?.(`${folder}: el servidor indica ${exists} mensajes pero devolvió ${all.length} identificadores`);
    }
    onServerState?.({ exists, allUids: all.length === exists ? all : null });
    missingBatch = all.filter((u) => !known.has(u)).sort((a, b) => a - b).slice(-maxMessages);
    if (latest && !known.has(latest) && !missingBatch.includes(latest)) missingBatch.push(latest);
  }
  const recent = await client.recentUidsBySequence(Math.min(exists, FLAG_REFRESH_COUNT));
  const uids = Array.from(new Set([...missingBatch, ...recent])).sort((a, b) => b - a);
  if (!uids.length) return [];

  const envelopes = await client.fetchEnvelopes(uids);
  return envelopes.map((message) => ({
    ...message,
    bodyText: '',
    bodyHtml: '',
    snippet: '',
    attachments: [],
  }));
}
