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

export const getQuipuStatus = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
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
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  const appId = sanitizeText(req.body?.appId);
  const appSecret = sanitizeText(req.body?.appSecret);
  const baseUrl = sanitizeText(req.body?.baseUrl) || 'https://getquipu.com';

  if (!appId || !appSecret) {
    return res.status(400).json({ success: false, error: 'App ID y App Secret son obligatorios.' });
  }

  try {
    const token = await requestQuipuToken({ app_id: appId, app_secret: appSecret, base_url: baseUrl });
    const userName = await resolveUserName(userId);
    const result = await pool.query(
      `INSERT INTO quipu_settings
         (user_id, app_id, app_secret, base_url, access_token, token_type, token_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE
       SET app_id = EXCLUDED.app_id,
           app_secret = EXCLUDED.app_secret,
           base_url = EXCLUDED.base_url,
           access_token = EXCLUDED.access_token,
           token_type = EXCLUDED.token_type,
           token_expires_at = EXCLUDED.token_expires_at,
           updated_at = NOW()
       RETURNING *`,
      [userId, appId, appSecret, baseUrl, token.accessToken, token.tokenType, token.expiresAt],
    );

    await logActivityForReq(req, 'Configuración Quipu guardada', 'QUIPU', result.rows[0].id, userName, 'UPDATE');

    res.json({
      success: true,
      data: {
        connected: true,
        baseUrl: result.rows[0].base_url,
        tokenExpiresAt: result.rows[0].token_expires_at,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'No se pudo validar la conexión con Quipu.' });
  }
};

export const disconnectQuipu = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
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
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    const settings = await getStoredQuipuSettings(userId);
    if (!settings) {
      return res.status(400).json({ success: false, error: 'Primero debes configurar Quipu.' });
    }

    const bootstrap = await fetchQuipuBootstrap(settings);
    const summary = summarizeQuipuBootstrap(bootstrap);

    await pool.query(
      `UPDATE quipu_settings
       SET last_sync_at = NOW(),
           sync_summary = $2,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId, JSON.stringify(summary)],
    );

    await logActivityForReq(req, 'Sincronización Quipu ejecutada', 'QUIPU', settings.id, undefined, 'UPDATE');

    res.json({
      success: true,
      data: {
        summary,
        contacts: bootstrap.contacts.slice(0, 20),
        invoices: bootstrap.invoices.slice(0, 20),
        numberingSeries: bootstrap.numberingSeries,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'No se pudo sincronizar con Quipu.' });
  }
};
