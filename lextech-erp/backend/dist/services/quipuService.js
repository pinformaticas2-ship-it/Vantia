"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestQuipuToken = requestQuipuToken;
exports.quipuApiFetch = quipuApiFetch;
exports.fetchQuipuBootstrap = fetchQuipuBootstrap;
exports.summarizeQuipuBootstrap = summarizeQuipuBootstrap;
const DEFAULT_QUIPU_BASE_URL = 'https://getquipu.com';
function normalizeBaseUrl(baseUrl) {
    const raw = String(baseUrl || DEFAULT_QUIPU_BASE_URL).trim();
    return raw.replace(/\/+$/, '');
}
function buildBasicAuth(appId, appSecret) {
    return Buffer.from(`${appId}:${appSecret}`).toString('base64');
}
async function parseQuipuResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    let parsed = null;
    if (text) {
        try {
            parsed = JSON.parse(text);
        }
        catch {
            parsed = text;
        }
    }
    if (!response.ok) {
        const detail = parsed?.errors?.[0]?.detail ||
            parsed?.error_description ||
            parsed?.error ||
            parsed?.message ||
            `Quipu respondió con ${response.status}`;
        throw new Error(String(detail));
    }
    if (contentType.includes('application/json') || typeof parsed === 'object') {
        return parsed;
    }
    return { raw: parsed };
}
async function requestQuipuToken(settings) {
    const baseUrl = normalizeBaseUrl(settings.base_url);
    const response = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${buildBasicAuth(settings.app_id, settings.app_secret)}`,
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            Accept: 'application/json',
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            scope: 'ecommerce',
        }),
    });
    const data = await parseQuipuResponse(response);
    const expiresIn = Number(data?.expires_in || 0);
    return {
        accessToken: String(data?.access_token || ''),
        tokenType: String(data?.token_type || 'bearer'),
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    };
}
async function quipuApiFetch(settings, path, init) {
    const tokenData = await requestQuipuToken(settings);
    const baseUrl = normalizeBaseUrl(settings.base_url);
    const headers = new Headers(init?.headers || {});
    headers.set('Authorization', `Bearer ${tokenData.accessToken}`);
    headers.set('Accept', 'application/vnd.quipu.v1+json');
    const hasBody = init?.body !== undefined && init?.body !== null;
    if (hasBody && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/vnd.quipu.v1+json');
    }
    const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers,
    });
    return parseQuipuResponse(response);
}
async function fetchQuipuBootstrap(settings) {
    const [contacts, invoices, numberingSeries] = await Promise.all([
        quipuApiFetch(settings, '/contacts?filter[kind]=client'),
        quipuApiFetch(settings, '/invoices?sort=-issued_at'),
        quipuApiFetch(settings, '/numbering_series'),
    ]);
    return {
        contacts: Array.isArray(contacts?.data) ? contacts.data : [],
        invoices: Array.isArray(invoices?.data) ? invoices.data : [],
        numberingSeries: Array.isArray(numberingSeries?.data) ? numberingSeries.data : [],
    };
}
function summarizeQuipuBootstrap(data) {
    return {
        contacts: data.contacts.length,
        invoices: data.invoices.length,
        numberingSeries: data.numberingSeries.length,
        syncedAt: new Date().toISOString(),
    };
}
