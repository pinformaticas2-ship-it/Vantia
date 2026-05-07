"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientIp = getClientIp;
function normalizeIp(ip) {
    const trimmed = ip.trim();
    if (!trimmed)
        return '';
    if (trimmed.startsWith('::ffff:'))
        return trimmed.slice(7);
    if (trimmed === '::1')
        return '127.0.0.1';
    return trimmed;
}
function firstHeaderValue(value) {
    if (!value)
        return '';
    const raw = Array.isArray(value) ? value[0] : value;
    return raw.split(',')[0]?.trim() || '';
}
function isIpv4(ip) {
    return /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(ip);
}
function getClientIp(req) {
    const candidates = [
        firstHeaderValue(req.headers['x-client-ip']),
        firstHeaderValue(req.headers['x-forwarded-for']),
        String(req.ip || ''),
        String(req.socket?.remoteAddress || ''),
    ];
    for (const candidate of candidates) {
        const normalized = normalizeIp(candidate);
        if (isIpv4(normalized))
            return normalized;
    }
    for (const candidate of candidates) {
        const normalized = normalizeIp(candidate);
        if (normalized)
            return normalized;
    }
    return 'desconocida';
}
