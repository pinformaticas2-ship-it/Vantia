"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImapClient = void 0;
exports.testImapConnection = testImapConnection;
exports.syncInbox = syncInbox;
const { ImapFlow } = require('imapflow');
function decodeBase64(s) {
    try {
        return Buffer.from(s, 'base64').toString('utf-8');
    }
    catch {
        return s;
    }
}
function decodeQuotedPrintable(s) {
    return s
        .replace(/=\r?\n/g, '')
        .replace(/=([0-9A-Fa-f]{2})/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
}
function decodeHeader(raw) {
    if (!raw)
        return '';
    return raw.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, charset, enc, text) => {
        try {
            if (String(enc).toUpperCase() === 'B') {
                return Buffer.from(String(text), 'base64').toString(String(charset).toLowerCase());
            }
            return Buffer.from(decodeQuotedPrintable(String(text)), 'binary').toString();
        }
        catch {
            return String(text);
        }
    });
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function parseMimeParts(raw) {
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
        if (mainCT.includes('text/html'))
            html = decoded;
        else
            text = decoded;
        return { text, html };
    }
    const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/i);
    if (!boundaryMatch)
        return { text, html };
    const boundary = boundaryMatch[1];
    const parts = raw.split(new RegExp(`--${escapeRegExp(boundary)}(?:--)?`));
    for (const part of parts) {
        if (!part.trim() || part.trim() === '--')
            continue;
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1)
            continue;
        const headers = part.slice(0, headerEnd);
        const body = part.slice(headerEnd + 4);
        const partCT = (headers.match(/Content-Type:\s*([^\r\n;]+)/i)?.[1] || '').trim().toLowerCase();
        const partCTE = (headers.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1] || '').toLowerCase();
        if (partCT.includes('multipart')) {
            const nested = parseMimeParts(part);
            if (!text && nested.text)
                text = nested.text;
            if (!html && nested.html)
                html = nested.html;
            continue;
        }
        const decoded = partCTE === 'base64'
            ? decodeBase64(body.replace(/\r?\n/g, ''))
            : partCTE === 'quoted-printable'
                ? decodeQuotedPrintable(body)
                : body;
        if (partCT.includes('text/html') && !html)
            html = decoded;
        else if (partCT.includes('text/plain') && !text)
            text = decoded;
    }
    return { text, html };
}
function buildSnippet(text, html) {
    const plain = text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return plain.slice(0, 200);
}
function normalizeFlags(flags) {
    if (!flags)
        return [];
    if (Array.isArray(flags))
        return flags.map((flag) => String(flag));
    if (flags instanceof Set)
        return Array.from(flags).map((flag) => String(flag));
    return [];
}
function normalizeAddress(addresses) {
    const first = Array.isArray(addresses) ? addresses[0] : null;
    if (!first)
        return { email: '', name: '' };
    const email = String(first.address || first.email || '').trim();
    const name = decodeHeader(String(first.name || first.displayName || '').trim());
    return { email, name };
}
function mapEnvelope(message) {
    const envelope = message?.envelope || {};
    const from = normalizeAddress(envelope.from);
    const to = normalizeAddress(envelope.to);
    let date = '';
    if (envelope.date instanceof Date)
        date = envelope.date.toISOString();
    else if (message?.internalDate instanceof Date)
        date = message.internalDate.toISOString();
    else if (envelope.date)
        date = String(envelope.date);
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
    };
}
class ImapClient {
    constructor(cfg) {
        this.cfg = cfg;
        this.client = null;
        this.mailboxLock = null;
        this.currentMailbox = '';
    }
    ensureClient() {
        if (!this.client)
            throw new Error('No hay conexion IMAP activa');
        return this.client;
    }
    async releaseMailboxLock() {
        if (this.mailboxLock) {
            try {
                this.mailboxLock.release();
            }
            catch {
            }
            this.mailboxLock = null;
        }
    }
    async connect() {
        if (this.client)
            return;
        this.client = new ImapFlow({
            host: this.cfg.host,
            port: this.cfg.port,
            secure: this.cfg.secure,
            auth: {
                user: this.cfg.user,
                pass: this.cfg.password,
            },
            logger: false,
        });
        await this.client.connect();
    }
    async login() {
    }
    async logout() {
        await this.releaseMailboxLock();
        if (!this.client)
            return;
        try {
            await this.client.logout();
        }
        catch {
            try {
                this.client.close();
            }
            catch {
            }
        }
        finally {
            this.client = null;
            this.currentMailbox = '';
        }
    }
    async listFolders() {
        const client = this.ensureClient();
        const boxes = await client.list();
        const BLOCKED_PATHS = new Set([
            'snoozed', '[gmail]/snoozed',
            'category_personal', 'category_social', 'category_promotions',
            'category_updates', 'category_forums',
            '[gmail]/category_personal', '[gmail]/category_social',
            '[gmail]/category_promotions', '[gmail]/category_updates',
            '[gmail]/category_forums',
        ]);
        const folders = [];
        const walk = (items) => {
            for (const item of items || []) {
                const flags = item.flags instanceof Set
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
                if (item.children?.length)
                    walk(item.children);
            }
        };
        walk(boxes);
        return folders;
    }
    async createFolder(folder) {
        const client = this.ensureClient();
        await client.mailboxCreate(folder);
    }
    async selectFolder(folder) {
        const client = this.ensureClient();
        await this.releaseMailboxLock();
        try {
            this.mailboxLock = await client.getMailboxLock(folder);
        }
        catch (e) {
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
    async searchUids(criteria = 'ALL') {
        const client = this.ensureClient();
        const exists = Number(client.mailbox?.exists || 0);
        if (!exists)
            return [];
        const start = 1;
        const end = exists;
        const uids = [];
        const fetchCriteria = criteria.toUpperCase() === 'ALL' ? `${start}:${end}` : `${start}:${end}`;
        for await (const message of client.fetch(fetchCriteria, { uid: true }, { uid: false })) {
            if (message?.uid)
                uids.push(Number(message.uid));
        }
        return uids;
    }
    async fetchEnvelopes(uids) {
        if (!uids.length)
            return [];
        const client = this.ensureClient();
        const result = [];
        const range = uids.join(',');
        for await (const message of client.fetch(range, {
            uid: true,
            envelope: true,
            flags: true,
            size: true,
            internalDate: true,
        }, { uid: true })) {
            result.push(mapEnvelope(message));
        }
        return result;
    }
    async fetchFullMessage(uid) {
        const client = this.ensureClient();
        const message = await client.fetchOne(uid, {
            uid: true,
            envelope: true,
            flags: true,
            size: true,
            internalDate: true,
            source: true,
        }, { uid: true });
        if (!message)
            return null;
        const source = Buffer.isBuffer(message.source)
            ? message.source.toString('utf8')
            : String(message.source || '');
        const parts = parseMimeParts(source);
        const envelope = mapEnvelope(message);
        return {
            ...envelope,
            bodyText: parts.text,
            bodyHtml: parts.html,
            snippet: buildSnippet(parts.text, parts.html),
        };
    }
    async markRead(uid, read) {
        const client = this.ensureClient();
        if (read) {
            await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        }
        else {
            await client.messageFlagsRemove(uid, ['\\Seen'], { uid: true });
        }
    }
    async markFlagged(uid, flagged) {
        const client = this.ensureClient();
        if (flagged) {
            await client.messageFlagsAdd(uid, ['\\Flagged'], { uid: true });
        }
        else {
            await client.messageFlagsRemove(uid, ['\\Flagged'], { uid: true });
        }
    }
    async copyToFolder(uid, folder) {
        const client = this.ensureClient();
        await client.messageCopy(uid, folder, { uid: true });
    }
    async addFlag(uid, flag) {
        const client = this.ensureClient();
        await client.messageFlagsAdd(uid, [flag], { uid: true });
    }
    async expunge() {
        const client = this.ensureClient();
        await client.mailboxExpunge();
    }
    async moveToTrash(uid, trashFolder = 'Trash') {
        const client = this.ensureClient();
        await client.messageMove(uid, trashFolder, { uid: true });
    }
}
exports.ImapClient = ImapClient;
async function testImapConnection(cfg) {
    const client = new ImapClient(cfg);
    try {
        await client.connect();
        await client.login();
    }
    finally {
        await client.logout().catch(() => undefined);
    }
}
async function syncInbox(cfg, folder = 'INBOX', maxMessages = 50) {
    const client = new ImapClient(cfg);
    try {
        await client.connect();
        await client.login();
        const selected = await client.selectFolder(folder);
        if (!selected.exists)
            return [];
        const uids = await client.searchUids('ALL');
        const recent = uids.slice(-maxMessages).reverse();
        if (!recent.length)
            return [];
        const envelopes = await client.fetchEnvelopes(recent);
        return envelopes.map((message) => ({
            ...message,
            bodyText: '',
            bodyHtml: '',
            snippet: '',
        }));
    }
    finally {
        await client.logout().catch(() => undefined);
    }
}
