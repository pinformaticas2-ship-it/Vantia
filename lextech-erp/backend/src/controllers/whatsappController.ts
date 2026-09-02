import { Request, Response } from 'express';
import pool from '../config/database';
import { resolveUserName } from './activityController';
import { sendPushToAll, sendPushToOrg } from '../utils/webPush';

type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  graphVersion: string;
  webhookBaseUrl: string;
  businessAccountId: string;
  source: 'database' | 'environment';
};

const DEFAULT_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
const ENV_ACCESS_TOKEN = (process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
const ENV_PHONE_NUMBER_ID = (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
const ENV_VERIFY_TOKEN = (process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
const ENV_WEBHOOK_BASE_URL = (process.env.WHATSAPP_WEBHOOK_BASE_URL || process.env.PUBLIC_BACKEND_URL || '').trim();
const ENV_BUSINESS_ACCOUNT_ID = (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim();

function userId(req: Request) {
  return (req as any).auth?.userId || 'SYSTEM';
}

function trimOrNull(value?: string | null) {
  const v = String(value || '').trim();
  return v || null;
}

function normalizePhone(value?: string | null) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('34') && digits.length >= 11) return digits;
  if (digits.length === 9) return `34${digits}`;
  return digits;
}

function maskSecret(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length <= 8) return '••••';
  return `${raw.slice(0, 4)}••••${raw.slice(-4)}`;
}

async function loadWhatsAppConfig(): Promise<WhatsAppConfig> {
  try {
    const result = await pool.query(
      `SELECT access_token, phone_number_id, verify_token, graph_version, webhook_base_url, business_account_id
       FROM whatsapp_settings
       WHERE id = 1
       LIMIT 1`,
    );
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
  } catch {
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

function getConfigStatus(config: WhatsAppConfig) {
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

async function resolveClientByPhone(phone?: string | null) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const local = normalized.replace(/^34/, '');
  const candidates = Array.from(new Set([normalized, local]));

  const result = await pool.query(
    `SELECT id,
            internal_number,
            first_name,
            last_name,
            commercial_name,
            phone_mobile,
            phone_1,
            email,
            type,
            organizacion_id
     FROM entities
     WHERE regexp_replace(COALESCE(phone_mobile, ''), '\D', '', 'g') = ANY($1)
        OR regexp_replace(COALESCE(phone_1, ''), '\D', '', 'g') = ANY($1)
     ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT 1`,
    [candidates],
  );

  return result.rows[0] || null;
}

function clientLabel(client: any) {
  if (!client) return 'Sin cliente';
  const full = `${client.first_name || ''} ${client.last_name || ''}`.trim();
  return client.commercial_name || full || client.email || `Cliente ${client.internal_number || ''}`.trim();
}

async function graphRequest(config: WhatsAppConfig, path: string, init?: RequestInit) {
  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!response.ok) {
    const providerError = json?.error?.message || text || `HTTP ${response.status}`;
    throw new Error(providerError);
  }
  return json;
}

export async function getWhatsAppStatus(_req: Request, res: Response) {
  const config = await loadWhatsAppConfig();
  res.json({ success: true, data: getConfigStatus(config) });
}

export async function getWhatsAppConfig(_req: Request, res: Response) {
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

export async function saveWhatsAppConfig(req: Request, res: Response) {
  const uid = userId(req);
  const userName = uid === 'SYSTEM' ? 'Sistema' : await resolveUserName(uid);

  const accessToken = trimOrNull(req.body?.accessToken);
  const phoneNumberId = trimOrNull(req.body?.phoneNumberId);
  const verifyToken = trimOrNull(req.body?.verifyToken);
  const graphVersion = trimOrNull(req.body?.graphVersion) || DEFAULT_GRAPH_VERSION;
  const webhookBaseUrl = trimOrNull(req.body?.webhookBaseUrl);
  const businessAccountId = trimOrNull(req.body?.businessAccountId);

  try {
    await pool.query(
      `INSERT INTO whatsapp_settings
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
         updated_at = NOW()`,
      [accessToken, phoneNumberId, verifyToken, graphVersion, webhookBaseUrl, businessAccountId, uid, userName],
    );

    const config = await loadWhatsAppConfig();
    res.json({ success: true, data: getConfigStatus(config) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'No se pudo guardar la configuración de WhatsApp' });
  }
}

export async function testWhatsAppConfig(_req: Request, res: Response) {
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
  } catch (error: any) {
    res.status(502).json({ success: false, error: error?.message || 'No se pudo validar la conexión con WhatsApp Business' });
  }
}

export async function getWhatsAppContacts(req: any, res: Response) {
  try {
    // WhatsApp comparte un único número de Business API entre organizaciones
    // (ver migración de whatsapp_messages), así que el aislamiento aquí se
    // consigue a través del propio contacto (entities SÍ está aislado por
    // organización desde Fase 1) en vez de por el mensaje.
    const result = await pool.query(
      `WITH latest AS (
         SELECT DISTINCT ON (wm.client_id)
           wm.client_id,
           wm.body,
           wm.created_at,
           wm.status,
           wm.direction
         FROM whatsapp_messages wm
         WHERE wm.client_id IS NOT NULL AND wm.channel = 'whatsapp'
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
           WHERE wm2.client_id = e.id AND wm2.channel = 'whatsapp'
         ), 0)            AS message_count
       FROM entities e
       LEFT JOIN latest l ON l.client_id = e.id
       WHERE e.organizacion_id = $1
         AND COALESCE(NULLIF(regexp_replace(COALESCE(e.phone_mobile, e.phone_1, ''), '\D', '', 'g'), ''), '') <> ''
       ORDER BY l.created_at DESC NULLS LAST, e.updated_at DESC NULLS LAST, e.created_at DESC`,
      [req.organizacionId],
    );

    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'No se pudieron cargar los contactos de WhatsApp' });
  }
}

export async function getConversationByClient(req: any, res: Response) {
  const { clientId } = req.params;
  try {
    const clientRes = await pool.query(
      `SELECT id, internal_number, first_name, last_name, commercial_name, phone_mobile, phone_1, email, photo_url, type
       FROM entities WHERE id = $1 AND organizacion_id = $2 LIMIT 1`,
      [clientId, req.organizacionId],
    );
    if (clientRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    const messagesRes = await pool.query(
      `SELECT *
       FROM whatsapp_messages
       WHERE client_id = $1 AND channel = 'whatsapp'
       ORDER BY created_at ASC`,
      [clientId],
    );

    res.json({
      success: true,
      data: {
        client: clientRes.rows[0],
        messages: messagesRes.rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'No se pudo cargar la conversación' });
  }
}

export async function getConversationByPhone(req: any, res: Response) {
  const phone = normalizePhone(req.params.phone);
  if (!phone) return res.status(400).json({ success: false, error: 'Teléfono inválido' });

  try {
    // organizacion_id puede ser NULL (número todavía no vinculado a ningún
    // cliente) -- esos mensajes se dejan ver a cualquier organización hasta
    // que alguien los vincula, en vez de perderlos en un cajón que nadie ve.
    const messagesRes = await pool.query(
      `SELECT *
       FROM whatsapp_messages
       WHERE (from_phone = $1 OR to_phone = $1) AND channel = 'whatsapp'
         AND (organizacion_id = $2 OR organizacion_id IS NULL)
       ORDER BY created_at ASC`,
      [phone, req.organizacionId],
    );

    const client = await resolveClientByPhone(phone);
    res.json({ success: true, data: { client, messages: messagesRes.rows } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'No se pudo cargar la conversación' });
  }
}

export async function sendWhatsAppMessage(req: any, res: Response) {
  const uid = userId(req);
  const userName = uid === 'SYSTEM' ? 'Sistema' : await resolveUserName(uid);
  const { clientId, to, body } = req.body || {};
  const text = String(body || '').trim();
  const normalizedPhone = normalizePhone(to);
  const config = await loadWhatsAppConfig();

  if (!text) return res.status(400).json({ success: false, error: 'El mensaje es obligatorio' });
  if (!normalizedPhone) return res.status(400).json({ success: false, error: 'Falta un teléfono válido' });
  if (!getConfigStatus(config).configured) {
    return res.status(400).json({
      success: false,
      error: 'Falta configurar WhatsApp Business Cloud API en el módulo',
    });
  }
  // Si se indica un cliente, tiene que ser de la organización activa -- no
  // se deja enviar "en nombre de" un cliente de otro despacho.
  if (clientId) {
    const ownCheck = await pool.query(`SELECT 1 FROM entities WHERE id = $1 AND organizacion_id = $2`, [clientId, req.organizacionId]);
    if (!ownCheck.rows.length) return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
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
    const inserted = await pool.query(
      `INSERT INTO whatsapp_messages
         (wa_message_id, client_id, direction, message_type, from_phone, to_phone, contact_name, body, status, sent_by_user_id, sent_by_user_name, raw_payload, organizacion_id, channel)
       VALUES ($1,$2,'outbound','text',NULL,$3,$4,$5,'sent',$6,$7,$8,$9,'whatsapp')
       RETURNING *`,
      [
        waMessageId,
        clientId || null,
        normalizedPhone,
        clientId ? null : normalizedPhone,
        text,
        uid,
        userName,
        JSON.stringify(provider),
        req.organizacionId,
      ],
    );

    res.status(201).json({ success: true, data: inserted.rows[0] });
  } catch (error: any) {
    res.status(502).json({
      success: false,
      error: error?.message || 'No se pudo enviar el mensaje por WhatsApp Business',
    });
  }
}

export async function getSchedules(_req: Request, res: Response) {
  try {
    const result = await pool.query(
      `SELECT *
       FROM whatsapp_schedules
       ORDER BY scheduled_for ASC, created_at DESC`,
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'No se pudieron cargar los programados' });
  }
}

export async function createSchedule(req: Request, res: Response) {
  const uid = userId(req);
  const userName = uid === 'SYSTEM' ? 'Sistema' : await resolveUserName(uid);
  const { clientId, phone, body, scheduledFor } = req.body || {};
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) return res.status(400).json({ success: false, error: 'Falta un teléfono válido' });
  if (!trimOrNull(body)) return res.status(400).json({ success: false, error: 'El mensaje es obligatorio' });
  if (!trimOrNull(scheduledFor)) return res.status(400).json({ success: false, error: 'La fecha programada es obligatoria' });

  try {
    const result = await pool.query(
      `INSERT INTO whatsapp_schedules
         (client_id, phone, body, scheduled_for, status, created_by_user_id, created_by_user_name)
       VALUES ($1,$2,$3,$4,'pending',$5,$6)
       RETURNING *`,
      [clientId || null, normalizedPhone, String(body).trim(), scheduledFor, uid, userName],
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'No se pudo programar el mensaje' });
  }
}

export async function verifyWebhook(req: Request, res: Response) {
  const config = await loadWhatsAppConfig();
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');

  if (mode === 'subscribe' && config.verifyToken && token === config.verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

export async function receiveWebhook(req: Request, res: Response) {
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
          if (!waMessageId) continue;
          await pool.query(
            `UPDATE whatsapp_messages
             SET status = $1,
                 raw_payload = COALESCE(raw_payload, '{}'::jsonb) || $2::jsonb,
                 updated_at = NOW()
             WHERE wa_message_id = $3`,
            [
              status?.status || 'updated',
              JSON.stringify({ status }),
              waMessageId,
            ],
          );
        }

        for (const message of messages) {
          const fromPhone = normalizePhone(message?.from || '');
          const body =
            message?.text?.body
            || message?.button?.text
            || message?.interactive?.button_reply?.title
            || message?.interactive?.list_reply?.title
            || null;
          const client = await resolveClientByPhone(fromPhone);
          const contact = contacts.find((item: any) => normalizePhone(item?.wa_id || '') === fromPhone);
          const contactName = contact?.profile?.name || clientLabel(client);

          await pool.query(
            `INSERT INTO whatsapp_messages
               (wa_message_id, client_id, direction, message_type, from_phone, to_phone, contact_name, body, status, raw_payload, organizacion_id, channel)
             VALUES ($1,$2,'inbound',$3,$4,$5,$6,$7,'received',$8,$9,'whatsapp')
             ON CONFLICT (wa_message_id)
             DO UPDATE SET
               client_id = EXCLUDED.client_id,
               contact_name = EXCLUDED.contact_name,
               body = EXCLUDED.body,
               status = EXCLUDED.status,
               raw_payload = EXCLUDED.raw_payload,
               organizacion_id = COALESCE(whatsapp_messages.organizacion_id, EXCLUDED.organizacion_id),
               updated_at = NOW()`,
            [
              message?.id || null,
              client?.id || null,
              message?.type || 'text',
              fromPhone || null,
              metadataPhone || null,
              contactName,
              body,
              JSON.stringify({ message, contact, metadata: value?.metadata || null }),
              client?.organizacion_id || null,
            ],
          );

          // Si el número ya está vinculado a un cliente, se sabe de qué
          // organización es el mensaje y el push se manda solo a ese
          // despacho; si no, se manda a todo el mundo (igual que antes) para
          // que alguien lo vea y lo vincule.
          const pushPayload = {
            title: contactName || 'WhatsApp',
            body: body || 'Mensaje recibido',
            url: client?.id ? `/dashboard/whatsapp?clientId=${client.id}&mode=thread` : '/dashboard/whatsapp',
            tag: `whatsapp-${fromPhone}`,
          };
          if (client?.organizacion_id) void sendPushToOrg(client.organizacion_id, pushPayload);
          else void sendPushToAll(pushPayload);
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('[whatsapp webhook] error:', error);
    res.sendStatus(500);
  }
}
