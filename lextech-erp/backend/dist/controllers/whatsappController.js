"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWhatsAppStatus = getWhatsAppStatus;
exports.getWhatsAppConfig = getWhatsAppConfig;
exports.saveWhatsAppConfig = saveWhatsAppConfig;
exports.testWhatsAppConfig = testWhatsAppConfig;
exports.getWhatsAppContacts = getWhatsAppContacts;
exports.getConversationByClient = getConversationByClient;
exports.getConversationByPhone = getConversationByPhone;
exports.sendWhatsAppMessage = sendWhatsAppMessage;
exports.getSchedules = getSchedules;
exports.createSchedule = createSchedule;
exports.verifyWebhook = verifyWebhook;
exports.receiveWebhook = receiveWebhook;
const database_1 = __importDefault(require("../config/database"));
const activityController_1 = require("./activityController");
const DEFAULT_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
const ENV_ACCESS_TOKEN = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
const ENV_PHONE_NUMBER_ID = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const ENV_VERIFY_TOKEN = (process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
const ENV_WEBHOOK_BASE_URL = (process.env.WHATSAPP_WEBHOOK_BASE_URL || process.env.PUBLIC_BACKEND_URL || '').trim();
const ENV_BUSINESS_ACCOUNT_ID = (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim();
function userId(req) {
    return req.auth?.userId || 'SYSTEM';
}
function trimOrNull(value) {
    const v = String(value || '').trim();
    return v || null;
}
function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits)
        return '';
    if (digits.startsWith('34') && digits.length >= 11)
        return digits;
    if (digits.length === 9)
        return `34${digits}`;
    return digits;
}
function maskSecret(value) {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    if (raw.length <= 8)
        return '••••';
    return `${raw.slice(0, 4)}••••${raw.slice(-4)}`;
}
async function loadWhatsAppConfig() {
    try {
        const result = await database_1.default.query(`SELECT access_token, phone_number_id, verify_token, graph_version, webhook_base_url, business_account_id
       FROM whatsapp_settings
       WHERE id = 1
       LIMIT 1`);
        const row = result.rows[0];
        const accessToken = trimOrNull(row?.access_token) || ENV_ACCESS_TOKEN;
        const phoneNumberId = trimOrNull(row?.phone_number_id) || ENV_PHONE_NUMBER_ID;
        const verifyToken = trimOrNull(row?.verify_token) || ENV_VERIFY_TOKEN;
        const graphVersion = trimOrNull(row?.graph_version) || DEFAULT_GRAPH_VERSION;
        const webhookBaseUrl = trimOrNull(row?.webhook_base_url) || ENV_WEBHOOK_BASE_URL;
        const businessAccountId = trimOrNull(row?.business_account_id) || ENV_BUSINESS_ACCOUNT_ID;
        const source = row && (trimOrNull(row?.access_token) || trimOrNull(row?.phone_number_id) || trimOrNull(row?.verify_token))
            ? 'database'
            : 'environment';
        return {
            accessToken,
            phoneNumberId,
            verifyToken,
            graphVersion,
            webhookBaseUrl,
            businessAccountId,
            source,
        };
    }
    catch {
        return {
            accessToken: ENV_ACCESS_TOKEN,
            phoneNumberId: ENV_PHONE_NUMBER_ID,
            verifyToken: ENV_VERIFY_TOKEN,
            graphVersion: DEFAULT_GRAPH_VERSION,
            webhookBaseUrl: ENV_WEBHOOK_BASE_URL,
            businessAccountId: ENV_BUSINESS_ACCOUNT_ID,
            source: 'environment',
        };
    }
}
function getConfigStatus(config) {
    const webhookUrl = config.webhookBaseUrl
        ? `${config.webhookBaseUrl.replace(/\/$/, '')}/api/whatsapp/webhook`
        : '';
    return {
        configured: Boolean(config.accessToken && config.phoneNumberId),
        phoneNumberIdConfigured: Boolean(config.phoneNumberId),
        accessTokenConfigured: Boolean(config.accessToken),
        verifyTokenConfigured: Boolean(config.verifyToken),
        businessAccountIdConfigured: Boolean(config.businessAccountId),
        webhookBaseUrlConfigured: Boolean(config.webhookBaseUrl),
        graphVersion: config.graphVersion,
        configSource: config.source,
        webhookUrl,
        phoneNumberIdPreview: maskSecret(config.phoneNumberId),
        verifyTokenPreview: maskSecret(config.verifyToken),
        businessAccountIdPreview: maskSecret(config.businessAccountId),
        mode: 'whatsapp-business-cloud-api',
    };
}
async function resolveClientByPhone(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized)
        return null;
    const local = normalized.replace(/^34/, '');
    const candidates = Array.from(new Set([normalized, local]));
    const result = await database_1.default.query(`SELECT id,
            internal_number,
            first_name,
            last_name,
            commercial_name,
            phone_mobile,
            phone_1,
            email,
            type
     FROM entities
     WHERE regexp_replace(COALESCE(phone_mobile, ''), '\D', '', 'g') = ANY($1)
        OR regexp_replace(COALESCE(phone_1, ''), '\D', '', 'g') = ANY($1)
     ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT 1`, [candidates]);
    return result.rows[0] || null;
}
function clientLabel(client) {
    if (!client)
        return 'Sin cliente';
    const full = `${client.first_name || ''} ${client.last_name || ''}`.trim();
    return client.commercial_name || full || client.email || `Cliente ${client.internal_number || ''}`.trim();
}
async function graphRequest(config, path, init) {
    const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
        },
    });
    const text = await response.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    }
    catch {
        json = { raw: text };
    }
    if (!response.ok) {
        const providerError = json?.error?.message || text || `HTTP ${response.status}`;
        throw new Error(providerError);
    }
    return json;
}
async function getWhatsAppStatus(_req, res) {
    const config = await loadWhatsAppConfig();
    res.json({ success: true, data: getConfigStatus(config) });
}
async function getWhatsAppConfig(_req, res) {
    const config = await loadWhatsAppConfig();
    res.json({
        success: true,
        data: {
            graphVersion: config.graphVersion,
            phoneNumberId: config.phoneNumberId,
            verifyToken: config.verifyToken,
            webhookBaseUrl: config.webhookBaseUrl,
            businessAccountId: config.businessAccountId,
            hasAccessToken: Boolean(config.accessToken),
            accessTokenPreview: maskSecret(config.accessToken),
            ...getConfigStatus(config),
        },
    });
}
async function saveWhatsAppConfig(req, res) {
    const uid = userId(req);
    const userName = uid === 'SYSTEM' ? 'Sistema' : await (0, activityController_1.resolveUserName)(uid);
    const accessToken = trimOrNull(req.body?.accessToken);
    const phoneNumberId = trimOrNull(req.body?.phoneNumberId);
    const verifyToken = trimOrNull(req.body?.verifyToken);
    const graphVersion = trimOrNull(req.body?.graphVersion) || DEFAULT_GRAPH_VERSION;
    const webhookBaseUrl = trimOrNull(req.body?.webhookBaseUrl);
    const businessAccountId = trimOrNull(req.body?.businessAccountId);
    try {
        await database_1.default.query(`INSERT INTO whatsapp_settings
         (id, access_token, phone_number_id, verify_token, graph_version, webhook_base_url, business_account_id, updated_by_user_id, updated_by_user_name)
       VALUES
         (1, $1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         access_token = COALESCE(EXCLUDED.access_token, whatsapp_settings.access_token),
         phone_number_id = COALESCE(EXCLUDED.phone_number_id, whatsapp_settings.phone_number_id),
         verify_token = COALESCE(EXCLUDED.verify_token, whatsapp_settings.verify_token),
         graph_version = COALESCE(EXCLUDED.graph_version, whatsapp_settings.graph_version),
         webhook_base_url = COALESCE(EXCLUDED.webhook_base_url, whatsapp_settings.webhook_base_url),
         business_account_id = COALESCE(EXCLUDED.business_account_id, whatsapp_settings.business_account_id),
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_by_user_name = EXCLUDED.updated_by_user_name,
         updated_at = NOW()`, [accessToken, phoneNumberId, verifyToken, graphVersion, webhookBaseUrl, businessAccountId, uid, userName]);
        const config = await loadWhatsAppConfig();
        res.json({ success: true, data: getConfigStatus(config) });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'No se pudo guardar la configuración de WhatsApp' });
    }
}
async function testWhatsAppConfig(_req, res) {
    const config = await loadWhatsAppConfig();
    if (!config.accessToken || !config.phoneNumberId) {
        return res.status(400).json({ success: false, error: 'Faltan access token o phone number id para probar la conexión' });
    }
    try {
        const phoneData = await graphRequest(config, config.phoneNumberId);
        res.json({
            success: true,
            data: {
                displayPhoneNumber: phoneData?.display_phone_number || null,
                verifiedName: phoneData?.verified_name || null,
                qualityRating: phoneData?.quality_rating || null,
            },
        });
    }
    catch (error) {
        res.status(502).json({ success: false, error: error?.message || 'No se pudo validar la conexión con WhatsApp Business' });
    }
}
async function getWhatsAppContacts(_req, res) {
    try {
        const result = await database_1.default.query(`WITH latest AS (
         SELECT DISTINCT ON (wm.client_id)
           wm.client_id,
           wm.body,
           wm.created_at,
           wm.status,
           wm.direction
         FROM whatsapp_messages wm
         WHERE wm.client_id IS NOT NULL
         ORDER BY wm.client_id, wm.created_at DESC
       )
       SELECT
         e.id,
         e.internal_number,
         e.first_name,
         e.last_name,
         e.commercial_name,
         e.phone_mobile,
         e.phone_1,
         e.email,
         e.photo_url,
         e.type,
         l.body           AS last_message_body,
         l.created_at     AS last_message_at,
         l.status         AS last_message_status,
         l.direction      AS last_message_direction,
         COALESCE((
           SELECT COUNT(*)::int
           FROM whatsapp_messages wm2
           WHERE wm2.client_id = e.id
         ), 0)            AS message_count
       FROM entities e
       LEFT JOIN latest l ON l.client_id = e.id
       WHERE COALESCE(NULLIF(regexp_replace(COALESCE(e.phone_mobile, e.phone_1, ''), '\D', '', 'g'), ''), '') <> ''
       ORDER BY l.created_at DESC NULLS LAST, e.updated_at DESC NULLS LAST, e.created_at DESC`);
        res.json({ success: true, data: result.rows });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'No se pudieron cargar los contactos de WhatsApp' });
    }
}
async function getConversationByClient(req, res) {
    const { clientId } = req.params;
    try {
        const clientRes = await database_1.default.query(`SELECT id, internal_number, first_name, last_name, commercial_name, phone_mobile, phone_1, email, photo_url, type
       FROM entities WHERE id = $1 LIMIT 1`, [clientId]);
        if (clientRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
        }
        const messagesRes = await database_1.default.query(`SELECT *
       FROM whatsapp_messages
       WHERE client_id = $1
       ORDER BY created_at ASC`, [clientId]);
        res.json({
            success: true,
            data: {
                client: clientRes.rows[0],
                messages: messagesRes.rows,
            },
        });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'No se pudo cargar la conversación' });
    }
}
async function getConversationByPhone(req, res) {
    const phone = normalizePhone(req.params.phone);
    if (!phone)
        return res.status(400).json({ success: false, error: 'Teléfono inválido' });
    try {
        const messagesRes = await database_1.default.query(`SELECT *
       FROM whatsapp_messages
       WHERE from_phone = $1 OR to_phone = $1
       ORDER BY created_at ASC`, [phone]);
        const client = await resolveClientByPhone(phone);
        res.json({ success: true, data: { client, messages: messagesRes.rows } });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'No se pudo cargar la conversación' });
    }
}
async function sendWhatsAppMessage(req, res) {
    const uid = userId(req);
    const userName = uid === 'SYSTEM' ? 'Sistema' : await (0, activityController_1.resolveUserName)(uid);
    const { clientId, to, body } = req.body || {};
    const text = String(body || '').trim();
    const normalizedPhone = normalizePhone(to);
    const config = await loadWhatsAppConfig();
    if (!text)
        return res.status(400).json({ success: false, error: 'El mensaje es obligatorio' });
    if (!normalizedPhone)
        return res.status(400).json({ success: false, error: 'Falta un teléfono válido' });
    if (!getConfigStatus(config).configured) {
        return res.status(400).json({
            success: false,
            error: 'Falta configurar WhatsApp Business Cloud API en el módulo',
        });
    }
    try {
        const provider = await graphRequest(config, `${config.phoneNumberId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: normalizedPhone,
                type: 'text',
                text: {
                    preview_url: false,
                    body: text,
                },
            }),
        });
        const waMessageId = provider?.messages?.[0]?.id || null;
        const inserted = await database_1.default.query(`INSERT INTO whatsapp_messages
         (wa_message_id, client_id, direction, message_type, from_phone, to_phone, contact_name, body, status, sent_by_user_id, sent_by_user_name, raw_payload)
       VALUES ($1,$2,'outbound','text',NULL,$3,$4,$5,'sent',$6,$7,$8)
       RETURNING *`, [
            waMessageId,
            clientId || null,
            normalizedPhone,
            clientId ? null : normalizedPhone,
            text,
            uid,
            userName,
            JSON.stringify(provider),
        ]);
        res.status(201).json({ success: true, data: inserted.rows[0] });
    }
    catch (error) {
        res.status(502).json({
            success: false,
            error: error?.message || 'No se pudo enviar el mensaje por WhatsApp Business',
        });
    }
}
async function getSchedules(_req, res) {
    try {
        const result = await database_1.default.query(`SELECT *
       FROM whatsapp_schedules
       ORDER BY scheduled_for ASC, created_at DESC`);
        res.json({ success: true, data: result.rows });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'No se pudieron cargar los programados' });
    }
}
async function createSchedule(req, res) {
    const uid = userId(req);
    const userName = uid === 'SYSTEM' ? 'Sistema' : await (0, activityController_1.resolveUserName)(uid);
    const { clientId, phone, body, scheduledFor } = req.body || {};
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone)
        return res.status(400).json({ success: false, error: 'Falta un teléfono válido' });
    if (!trimOrNull(body))
        return res.status(400).json({ success: false, error: 'El mensaje es obligatorio' });
    if (!trimOrNull(scheduledFor))
        return res.status(400).json({ success: false, error: 'La fecha programada es obligatoria' });
    try {
        const result = await database_1.default.query(`INSERT INTO whatsapp_schedules
         (client_id, phone, body, scheduled_for, status, created_by_user_id, created_by_user_name)
       VALUES ($1,$2,$3,$4,'pending',$5,$6)
       RETURNING *`, [clientId || null, normalizedPhone, String(body).trim(), scheduledFor, uid, userName]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'No se pudo programar el mensaje' });
    }
}
async function verifyWebhook(req, res) {
    const config = await loadWhatsAppConfig();
    const mode = String(req.query['hub.mode'] || '');
    const token = String(req.query['hub.verify_token'] || '');
    const challenge = String(req.query['hub.challenge'] || '');
    if (mode === 'subscribe' && config.verifyToken && token === config.verifyToken) {
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
}
async function receiveWebhook(req, res) {
    try {
        const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
        for (const entry of entries) {
            const changes = Array.isArray(entry?.changes) ? entry.changes : [];
            for (const change of changes) {
                const value = change?.value || {};
                const metadataPhone = normalizePhone(value?.metadata?.display_phone_number || '');
                const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
                const messages = Array.isArray(value?.messages) ? value.messages : [];
                const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
                for (const status of statuses) {
                    const waMessageId = status?.id;
                    if (!waMessageId)
                        continue;
                    await database_1.default.query(`UPDATE whatsapp_messages
             SET status = $1,
                 raw_payload = COALESCE(raw_payload, '{}'::jsonb) || $2::jsonb,
                 updated_at = NOW()
             WHERE wa_message_id = $3`, [
                        status?.status || 'updated',
                        JSON.stringify({ status }),
                        waMessageId,
                    ]);
                }
                for (const message of messages) {
                    const fromPhone = normalizePhone(message?.from || '');
                    const body = message?.text?.body
                        || message?.button?.text
                        || message?.interactive?.button_reply?.title
                        || message?.interactive?.list_reply?.title
                        || null;
                    const client = await resolveClientByPhone(fromPhone);
                    const contact = contacts.find((item) => normalizePhone(item?.wa_id || '') === fromPhone);
                    const contactName = contact?.profile?.name || clientLabel(client);
                    await database_1.default.query(`INSERT INTO whatsapp_messages
               (wa_message_id, client_id, direction, message_type, from_phone, to_phone, contact_name, body, status, raw_payload)
             VALUES ($1,$2,'inbound',$3,$4,$5,$6,$7,'received',$8)
             ON CONFLICT (wa_message_id)
             DO UPDATE SET
               client_id = EXCLUDED.client_id,
               contact_name = EXCLUDED.contact_name,
               body = EXCLUDED.body,
               status = EXCLUDED.status,
               raw_payload = EXCLUDED.raw_payload,
               updated_at = NOW()`, [
                        message?.id || null,
                        client?.id || null,
                        message?.type || 'text',
                        fromPhone || null,
                        metadataPhone || null,
                        contactName,
                        body,
                        JSON.stringify({ message, contact, metadata: value?.metadata || null }),
                    ]);
                }
            }
        }
        res.sendStatus(200);
    }
    catch (error) {
        console.error('[whatsapp webhook] error:', error);
        res.sendStatus(500);
    }
}
