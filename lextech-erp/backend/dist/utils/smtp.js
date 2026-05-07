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
exports.sendEmail = sendEmail;
exports.testSmtpConnection = testSmtpConnection;
const net = __importStar(require("net"));
const tls = __importStar(require("tls"));
function b64(s) { return Buffer.from(s).toString('base64'); }
function b64u(s) { return Buffer.from(s, 'utf-8').toString('base64'); }
function encodeHeader(value) {
    if (/^[\x20-\x7E]*$/.test(value))
        return value;
    return `=?UTF-8?B?${b64u(value)}?=`;
}
function buildMimeMessage(msg) {
    const boundary = `----=_LexTech_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const msgId = msg.messageId || `<${Date.now()}.${Math.random().toString(36).slice(2)}@lextech>`;
    const date = new Date().toUTCString();
    const fromFull = msg.fromName
        ? `${encodeHeader(msg.fromName)} <${msg.from}>`
        : msg.from;
    const toLine = msg.to.join(', ');
    const ccLine = msg.cc?.join(', ') || '';
    const textPart = msg.text || msg.html.replace(/<[^>]+>/g, '');
    const lines = [
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
class SmtpSession {
    constructor(cfg) {
        this.cfg = cfg;
        this.buffer = '';
    }
    waitLine() {
        return new Promise((res, rej) => {
            this.resolve = res;
            this.reject = rej;
        });
    }
    send(cmd) {
        this.socket.write(cmd + '\r\n');
    }
    onData(chunk) {
        this.buffer += chunk.toString();
        const idx = this.buffer.indexOf('\r\n');
        if (idx !== -1) {
            const fullResp = this.buffer.slice(0, idx);
            this.buffer = this.buffer.slice(idx + 2);
            if (/^\d{3}-/.test(fullResp)) {
                return;
            }
            this.resolve(fullResp);
        }
    }
    async expect(codes) {
        const line = await this.waitLine();
        const code = parseInt(line.slice(0, 3), 10);
        if (!codes.includes(code)) {
            throw new Error(`SMTP error ${code}: ${line}`);
        }
        return line;
    }
    async connect() {
        return new Promise((resolve, reject) => {
            const timeout = 15000;
            const onError = (e) => { clearTimeout(t); reject(e); };
            const t = setTimeout(() => reject(new Error('SMTP connect timeout')), timeout);
            const onReady = () => {
                clearTimeout(t);
                this.socket.on('data', (c) => this.onData(c));
                this.socket.on('error', (e) => { try {
                    this.reject(e);
                }
                catch { } });
                resolve();
            };
            if (this.cfg.secure) {
                this.socket = tls.connect({ host: this.cfg.host, port: this.cfg.port, rejectUnauthorized: false }, onReady);
            }
            else {
                const s = net.connect({ host: this.cfg.host, port: this.cfg.port });
                s.on('connect', onReady);
                this.socket = s;
            }
            this.socket.on('error', onError);
        });
    }
    async send_email(msg) {
        await this.expect([220]);
        this.send(`EHLO lextech`);
        await this.expect([250]);
        if (!this.cfg.secure) {
            this.send('STARTTLS');
            await this.expect([220]);
            await new Promise((res, rej) => {
                const tlsSock = tls.connect({
                    socket: this.socket,
                    rejectUnauthorized: false,
                }, res);
                tlsSock.on('error', rej);
                this.socket = tlsSock;
                this.socket.on('data', (c) => this.onData(c));
            });
            this.send(`EHLO lextech`);
            await this.expect([250]);
        }
        this.send('AUTH LOGIN');
        await this.expect([334]);
        this.send(b64(this.cfg.user));
        await this.expect([334]);
        this.send(b64(this.cfg.password));
        await this.expect([235]);
        this.send(`MAIL FROM:<${msg.from}>`);
        await this.expect([250]);
        const allTo = [...msg.to, ...(msg.cc || []), ...(msg.bcc || [])];
        for (const addr of allTo) {
            this.send(`RCPT TO:<${addr}>`);
            await this.expect([250]);
        }
        this.send('DATA');
        await this.expect([354]);
        const mime = buildMimeMessage(msg);
        this.socket.write(mime + '\r\n.\r\n');
        await this.expect([250]);
        this.send('QUIT');
        this.socket.destroy();
    }
}
async function sendEmail(cfg, msg) {
    const session = new SmtpSession(cfg);
    await session.connect();
    await session.send_email(msg);
}
async function testSmtpConnection(cfg) {
    const session = new SmtpSession(cfg);
    await session.connect();
}
