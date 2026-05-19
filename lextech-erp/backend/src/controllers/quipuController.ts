import { Response } from 'express';
import pool from '../config/database';
import { logActivityForReq, resolveUserName } from './activityController';
import {
  fetchQuipuBootstrap,
  requestQuipuToken,
  summarizeQuipuBootstrap,
} from '../services/quipuService';

const sanitizeText = (value: any) => {
  const text = String(value ?? '').trim();
  return text || null;
};

async function getStoredQuipuSettings(userId: string) {
  const result = await pool.query(`SELECT * FROM quipu_settings WHERE user_id = $1 LIMIT 1`, [userId]);
  return result.rows[0] || null;
}

function mapQuipuStatus(status: string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'cobrada';
  if (s === 'overdue') return 'vencida';
  if (s === 'sent' || s === 'issued') return 'enviada';
  return 'pendiente';
}

async function ensureQuipuSyncTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quipu_contacts (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id           VARCHAR(150) NOT NULL,
      quipu_setting_id  UUID REFERENCES quipu_settings(id) ON DELETE CASCADE,
      external_id       VARCHAR(255) NOT NULL,
      external_type     VARCHAR(80),
      kind              VARCHAR(50),
      contact_name      VARCHAR(255),
      tax_id            VARCHAR(100),
      email             VARCHAR(255),
      raw_payload       JSONB NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, external_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quipu_invoices (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id           VARCHAR(150) NOT NULL,
      quipu_setting_id  UUID REFERENCES quipu_settings(id) ON DELETE CASCADE,
      external_id       VARCHAR(255) NOT NULL,
      external_type     VARCHAR(80),
      contact_name      VARCHAR(255),
      number            VARCHAR(120),
      status            VARCHAR(60),
      issue_date        DATE,
      due_date          DATE,
      total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
      raw_payload       JSONB NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, external_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quipu_numbering_series (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id           VARCHAR(150) NOT NULL,
      quipu_setting_id  UUID REFERENCES quipu_settings(id) ON DELETE CASCADE,
      external_id       VARCHAR(255) NOT NULL,
      external_type     VARCHAR(80),
      name              VARCHAR(255),
      prefix            VARCHAR(80),
      next_number       INTEGER NOT NULL DEFAULT 0,
      raw_payload       JSONB NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, external_id)
    )
  `);
}

async function persistQuipuBootstrap(userId: string, settingId: string, bootstrap: {
  contacts: any[];
  invoices: any[];
  numberingSeries: any[];
}) {
  await ensureQuipuSyncTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`DELETE FROM quipu_contacts WHERE user_id = $1`, [userId]);
    for (const item of bootstrap.contacts) {
      await client.query(
        `INSERT INTO quipu_contacts
           (user_id, quipu_setting_id, external_id, external_type, kind, contact_name, tax_id, email, raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          userId,
          settingId,
          String(item?.id || ''),
          String(item?.type || 'contacts'),
          String(item?.attributes?.kind || 'client'),
          String(item?.attributes?.name || item?.attributes?.trade_name || ''),
          String(item?.attributes?.tax_id || item?.attributes?.vat_number || ''),
          String(item?.attributes?.email || ''),
          JSON.stringify(item),
        ],
      );
    }

    await client.query(`DELETE FROM quipu_invoices WHERE user_id = $1`, [userId]);
    for (const item of bootstrap.invoices) {
      await client.query(
        `INSERT INTO quipu_invoices
           (user_id, quipu_setting_id, external_id, external_type, contact_name, number, status, issue_date, due_date, total_amount, raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          userId,
          settingId,
          String(item?.id || ''),
          String(item?.type || 'invoices'),
          String(item?.attributes?.contact_name || item?.attributes?.recipient_name || ''),
          String(item?.attributes?.number || item?.attributes?.serial_number || ''),
          String(item?.attributes?.status || ''),
          item?.attributes?.issue_date || item?.attributes?.issued_at || null,
          item?.attributes?.due_date || null,
          Number(item?.attributes?.total_amount || item?.attributes?.total || 0),
          JSON.stringify(item),
        ],
      );
    }

    await client.query(`DELETE FROM quipu_numbering_series WHERE user_id = $1`, [userId]);
    for (const item of bootstrap.numberingSeries) {
      await client.query(
        `INSERT INTO quipu_numbering_series
           (user_id, quipu_setting_id, external_id, external_type, name, prefix, next_number, raw_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          userId,
          settingId,
          String(item?.id || ''),
          String(item?.type || 'numbering_series'),
          String(item?.attributes?.name || ''),
          String(item?.attributes?.prefix || ''),
          Number(item?.attributes?.next_number || 0),
          JSON.stringify(item),
        ],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export const getQuipuStatus = async (req: any, res: Response) => {
  const userId = req.auth()?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    const settings = await getStoredQuipuSettings(userId);
    if (!settings) {
      return res.json({ success: true, data: { connected: false } });
    }

    res.json({
      success: true,
      data: {
        connected: true,
        baseUrl: settings.base_url,
        ownerSlug: settings.owner_slug || null,
        lastSyncAt: settings.last_sync_at,
        syncSummary: settings.sync_summary || null,
        quipuCompany: settings.quipu_company || null,
        quipuEmail: settings.quipu_email || null,
        hasAccessToken: Boolean(settings.access_token),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'No se pudo cargar el estado de Quipu.' });
  }
};

export const saveQuipuCredentials = async (req: any, res: Response) => {
  const userId = req.auth()?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  const appId = sanitizeText(req.body?.appId);
  const appSecret = sanitizeText(req.body?.appSecret);
  const baseUrl = sanitizeText(req.body?.baseUrl) || 'https://getquipu.com';
  const ownerSlug = sanitizeText(req.body?.ownerSlug);

  if (!appId || !appSecret || !ownerSlug) {
    return res.status(400).json({ success: false, error: 'App ID, App Secret y owner_slug son obligatorios.' });
  }

  try {
    const token = await requestQuipuToken({ app_id: appId, app_secret: appSecret, base_url: baseUrl, owner_slug: ownerSlug });
    const userName = await resolveUserName(userId);
    const result = await pool.query(
      `INSERT INTO quipu_settings
         (user_id, app_id, app_secret, base_url, owner_slug, access_token, token_type, token_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id) DO UPDATE
       SET app_id = EXCLUDED.app_id,
           app_secret = EXCLUDED.app_secret,
           base_url = EXCLUDED.base_url,
           owner_slug = EXCLUDED.owner_slug,
           access_token = EXCLUDED.access_token,
           token_type = EXCLUDED.token_type,
           token_expires_at = EXCLUDED.token_expires_at,
           updated_at = NOW()
       RETURNING *`,
      [userId, appId, appSecret, baseUrl, ownerSlug, token.accessToken, token.tokenType, token.expiresAt],
    );

    await logActivityForReq(req, 'Configuración Quipu guardada', 'QUIPU', result.rows[0].id, userName, 'UPDATE');

    res.json({
      success: true,
      data: {
        connected: true,
        baseUrl: result.rows[0].base_url,
        ownerSlug: result.rows[0].owner_slug,
        tokenExpiresAt: result.rows[0].token_expires_at,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'No se pudo validar la conexión con Quipu.' });
  }
};

export const disconnectQuipu = async (req: any, res: Response) => {
  const userId = req.auth()?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    await pool.query(`DELETE FROM quipu_settings WHERE user_id = $1`, [userId]);
    await logActivityForReq(req, 'Conexión Quipu eliminada', 'QUIPU', undefined, undefined, 'DELETE');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'No se pudo desconectar Quipu.' });
  }
};

export const syncQuipuBootstrap = async (req: any, res: Response) => {
  const userId = req.auth()?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    const settings = await getStoredQuipuSettings(userId);
    if (!settings) {
      return res.status(400).json({ success: false, error: 'Primero debes configurar Quipu.' });
    }

    const bootstrap = await fetchQuipuBootstrap(settings);
    const summary = summarizeQuipuBootstrap(bootstrap);
    await persistQuipuBootstrap(userId, settings.id, bootstrap);

    // Import Quipu invoices into facturacion_facturas so they show in the billing UI
    let importedCount = 0;
    for (const item of bootstrap.invoices) {
      const quipuId = String(item?.id || '').trim();
      const num = String(item?.attributes?.number || item?.attributes?.serial_number || quipuId).trim();
      const contacto = String(item?.attributes?.contact_name || item?.attributes?.recipient_name || 'Quipu').trim();
      const fecha = item?.attributes?.issue_date || item?.attributes?.issued_at || new Date().toISOString().slice(0, 10);
      const vencimiento = item?.attributes?.due_date || null;
      const total = Number(item?.attributes?.total_amount || item?.attributes?.total || 0);
      const estado = mapQuipuStatus(item?.attributes?.status || '');

      if (!quipuId) continue;
      try {
        await pool.query(
          `INSERT INTO facturacion_facturas
             (user_id, created_by, num, contacto, fecha, vencimiento, total, estado,
              area, responsable, forma_pago, serie, tipo_cliente, quipu_id)
           VALUES ($1,'Quipu Sync',$2,$3,$4,$5,$6,$7,'procesal','Quipu','transferencia','QUIPU','empresa',$8)
           ON CONFLICT (user_id, quipu_id) WHERE quipu_id IS NOT NULL
           DO UPDATE SET
             num        = EXCLUDED.num,
             contacto   = EXCLUDED.contacto,
             fecha      = EXCLUDED.fecha,
             vencimiento= EXCLUDED.vencimiento,
             total      = EXCLUDED.total,
             estado     = EXCLUDED.estado,
             updated_at = NOW()`,
          [userId, num, contacto, fecha, vencimiento, total, estado, quipuId],
        );
        importedCount++;
      } catch (_e: any) { /* skip individual import errors */ }
    }

    await pool.query(
      `UPDATE quipu_settings
       SET last_sync_at = NOW(),
           sync_summary = $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, JSON.stringify({ ...summary, importedToFacturacion: importedCount })],
    );

    await logActivityForReq(req, 'Sincronización Quipu ejecutada', 'QUIPU', settings.id, undefined, 'UPDATE');

    res.json({
      success: true,
      data: {
        summary: { ...summary, importedToFacturacion: importedCount },
        contacts: bootstrap.contacts.slice(0, 20),
        invoices: bootstrap.invoices.slice(0, 20),
        numberingSeries: bootstrap.numberingSeries,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'No se pudo sincronizar con Quipu.' });
  }
};
