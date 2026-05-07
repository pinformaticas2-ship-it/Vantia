"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pop3Client = void 0;
exports.syncPop3Inbox = syncPop3Inbox;
exports.testPop3Connection = testPop3Connection;
const net = __importStar(require("net"));
const tls = __importStar(require("tls"));
function decodeBase64(s) {
    try {
        return Buffer.from(s, 'base64').toString('utf-8');
    }
    catch {
        return s;
    }
}
function decodeQP(s) {
    return s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function decodeHeader(raw) {
    return (raw || '').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, charset, enc, text) => {
        try {
            return enc.toUpperCase() === 'B'
                ? Buffer.from(text, 'base64').toString(charset)
                : Buffer.from(decodeQP(text), 'binary').toString();
        }
        catch {
            return text;
        }
    });
}
function parseAddress(raw) {
    const m = raw.match(/^(.*?)\s*<(.+?)>$/);
    if (m)
        return { name: decodeHeader(m[1].trim().replace(/^"|"$/g, '')), email: m[2].trim() };
    return { name: '', email: raw.trim() };
}
function getHeader(headers, name) {
    const re = new RegExp(`^${name}:\\s*(.+?)\\s*$`, 'im');
    const m = headers.match(re);
    return m ? decodeHeader(m[1].replace(/\r?\n\s+/g, ' ').trim()) : '';
}
function extractBody(raw) {
    const [headerPart, ...bodyParts] = raw.split(/\r?\n\r?\n/);
    const body = bodyParts.join('\r\n\r\n');
    const ct = getHeader(headerPart, 'Content-Type').toLowerCase();
    const cte = getHeader(headerPart, 'Content-Transfer-Encoding').toLowerCase();
    const decode = (content) => {
        if (cte.includes('base64'))
            return decodeBase64(content.replace(/\s+/g, ''));
        if (cte.includes('quoted-printable'))
            return decodeQP(content);
        return content;
    };
    const boundary = (ct.match(/boundary="?([^";]+)"?/i) || [])[1];
    if (boundary && body.includes(boundary)) {
        let html = '', text = '';
        const parts = body.split(new RegExp(`--${boundary}(?:--)?`, 'g'));
        for (const part of parts) {
            if (!part.trim() || part.trim() === '--')
                continue;
            const [ph, ...pb] = part.split(/\r?\n\r?\n/);
            const pct = getHeader(ph, 'Content-Type').toLowerCase();
            const pcte = getHeader(ph, 'Content-Transfer-Encoding').toLowerCase();
            const pbody = pb.join('\r\n\r\n').trim();
            const dec = (s) => {
                if (pcte.includes('base64'))
                    return decodeBase64(s.replace(/\s+/g, ''));
                if (pcte.includes('quoted-printable'))
                    return decodeQP(s);
                return s;
            };
            if (pct.includes('text/html') && !html)
                html = dec(pbody);
            if (pct.includes('text/plain') && !text)
                text = dec(pbody);
        }
        return { html, text };
    }
    if (ct.includes('text/html'))
        return { html: decode(body), text: '' };
    return { html: '', text: decode(body) };
}
function parseMessage(raw, msgNumber, uidl, size) {
    const sep = raw.indexOf('\r\n\r\n');
    const headers = sep >= 0 ? raw.slice(0, sep) : raw;
    const { html, text } = extractBody(raw);
    const fromRaw = getHeader(headers, 'From');
    const dateRaw = getHeader(headers, 'Date');
    const subject = getHeader(headers, 'Subject') || '(Sin asunto)';
    const to = getHeader(headers, 'To');
    const msgId = getHeader(headers, 'Message-ID').replace(/[<>]/g, '');
    const { name: fromName, email: from } = parseAddress(fromRaw);
    let date = '';
    try {
        date = new Date(dateRaw).toISOString();
    }
    catch {
        date = new Date().toISOString();
    }
    const bodyFull = text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const snippet = bodyFull.trim().slice(0, 200);
    return {
        number: msgNumber, uidl, size,
        subject, from, fromName, to, date, snippet,
        bodyText: text, bodyHtml: html, messageId: msgId,
    };
}
class Pop3Client {
    constructor(cfg) {
        this.socket = null;
        this.buf = '';
        this.cfg = cfg;
        this.timeout = cfg.timeout ?? 15000;
    }
    readline() {
        return new Promise((resolve, reject) => {
            const check = () => {
                const idx = this.buf.indexOf('\r\n');
                if (idx >= 0) {
                    const line = this.buf.slice(0, idx);
                    this.buf = this.buf.slice(idx + 2);
                    if (line.startsWith('-ERR'))
                        reject(new Error(line.slice(5)));
                    else
                        resolve(line.startsWith('+OK') ? line.slice(4) : line);
                }
            };
            check();
            if (!this.socket)
                return reject(new Error('No hay socket'));
            const onData = (d) => { this.buf += d.toString('binary'); check(); };
            const onErr = (e) => reject(e);
            this.socket.once('error', onErr);
            this.socket.on('data', onData);
            const orig = resolve;
            resolve = (v) => {
                this.socket?.off('data', onData);
                this.socket?.off('error', onErr);
                orig(v);
            };
            const origRej = reject;
            reject = (e) => {
                this.socket?.off('data', onData);
                this.socket?.off('error', onErr);
                origRej(e);
            };
        });
    }
    readMultiline() {
        return new Promise((resolve, reject) => {
            const check = () => {
                const end = this.buf.indexOf('\r\n.\r\n');
                if (end >= 0) {
                    const content = this.buf.slice(0, end);
                    this.buf = this.buf.slice(end + 5);
                    resolve(content.replace(/^\.\./gm, '.'));
                }
            };
            check();
            if (!this.socket)
                return reject(new Error('No hay socket'));
            const onData = (d) => { this.buf += d.toString('binary'); check(); };
            const onErr = (e) => reject(e);
            this.socket.once('error', onErr);
            this.socket.on('data', onData);
            const orig = resolve;
            resolve = (v) => {
                this.socket?.off('data', onData);
                this.socket?.off('error', onErr);
                orig(v);
            };
            const origRej = reject;
            reject = (e) => {
                this.socket?.off('data', onData);
                this.socket?.off('error', onErr);
                origRej(e);
            };
        });
    }
    send(cmd) {
        this.socket?.write(cmd + '\r\n');
    }
    async connect() {
        return new Promise((resolve, reject) => {
            const opts = { host: this.cfg.host, port: this.cfg.port, rejectUnauthorized: false };
            this.socket = this.cfg.secure
                ? tls.connect(opts, () => { })
                : net.connect({ host: this.cfg.host, port: this.cfg.port });
            this.socket.setTimeout(this.timeout, () => reject(new Error('Timeout al conectar')));
            this.socket.once('error', reject);
            this.socket.on('data', (d) => { this.buf += d.toString('binary'); });
            const waitGreeting = (deadline) => {
                if (Date.now() > deadline) {
                    this.socket?.destroy();
                    reject(new Error('Timeout esperando saludo del servidor'));
                    return;
                }
                const idx = this.buf.indexOf('\r\n');
                if (idx < 0) {
                    setTimeout(() => waitGreeting(deadline), 50);
                    return;
                }
                const line = this.buf.slice(0, idx);
                this.buf = this.buf.slice(idx + 2);
                if (line.startsWith('+OK'))
                    resolve();
                else
                    reject(new Error('Saludo inesperado: ' + line));
            };
            const onConnect = () => {
                this.socket.setTimeout(this.timeout, () => {
                    this.socket?.destroy();
                    reject(new Error('Timeout al comunicar con el servidor'));
                });
                setTimeout(() => waitGreeting(Date.now() + this.timeout), 100);
            };
            this.cfg.secure
                ? this.socket.once('secureConnect', onConnect)
                : this.socket.once('connect', onConnect);
        });
    }
    async login() {
        this.send(`USER ${this.cfg.user}`);
        await this.readline();
        this.send(`PASS ${this.cfg.password}`);
        await this.readline();
    }
    async stat() {
        this.send('STAT');
        const line = await this.readline();
        const parts = line.trim().split(/\s+/);
        return { count: parseInt(parts[0] || '0'), sizeBytes: parseInt(parts[1] || '0') };
    }
    async list() {
        this.send('LIST');
        await this.readline();
        const body = await this.readMultiline();
        const map = new Map();
        for (const line of body.split('\r\n').filter(Boolean)) {
            const [n, s] = line.trim().split(/\s+/);
            if (n && s)
                map.set(parseInt(n), parseInt(s));
        }
        return map;
    }
    async uidl() {
        this.send('UIDL');
        await this.readline();
        const body = await this.readMultiline();
        const map = new Map();
        for (const line of body.split('\r\n').filter(Boolean)) {
            const [n, uid] = line.trim().split(/\s+/);
            if (n && uid)
                map.set(parseInt(n), uid);
        }
        return map;
    }
    async top(msgNum, lines = 0) {
        this.send(`TOP ${msgNum} ${lines}`);
        await this.readline();
        return this.readMultiline();
    }
    async retr(msgNum) {
        this.send(`RETR ${msgNum}`);
        await this.readline();
        return this.readMultiline();
    }
    async dele(msgNum) {
        this.send(`DELE ${msgNum}`);
        await this.readline();
    }
    async quit() {
        try {
            this.send('QUIT');
            await this.readline();
        }
        catch { }
        this.socket?.destroy();
        this.socket = null;
    }
}
exports.Pop3Client = Pop3Client;
async function syncPop3Inbox(cfg, knownUidls, limit = 50) {
    const client = new Pop3Client(cfg);
    await client.connect();
    await client.login();
    const sizeMap = await client.list();
    const uidlMap = await client.uidl();
    const entries = [...uidlMap.entries()].sort((a, b) => b[0] - a[0]);
    const messages = [];
    let fetched = 0;
    for (const [num, uid] of entries) {
        if (fetched >= limit)
            break;
        if (knownUidls.has(uid))
            continue;
        try {
            const raw = await client.retr(num);
            const size = sizeMap.get(num) ?? raw.length;
            messages.push(parseMessage(raw, num, uid, size));
            fetched++;
        }
        catch { }
    }
    await client.quit();
    return messages;
}
async function testPop3Connection(cfg) {
    const client = new Pop3Client(cfg);
    await client.connect();
    await client.login();
    const { count } = await client.stat();
    await client.quit();
    return { ok: true, count };
}
