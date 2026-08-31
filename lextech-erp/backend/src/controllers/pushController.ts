import { Request, Response } from 'express';
import pool from '../config/database';
import { pushEnabled, vapidPublicKey } from '../utils/webPush';

export async function getPushConfig(_req: Request, res: Response) {
  return res.json({ data: { enabled: pushEnabled(), publicKey: vapidPublicKey() } });
}

export async function subscribePush(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const sub = req.body?.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'Suscripción incompleta' });
  }
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);
  try {
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE
         SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
      [userId, endpoint, p256dh, auth, userAgent],
    );
    return res.status(201).json({ data: { ok: true } });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}

export async function unsubscribePush(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ error: 'No autenticado' });
  const endpoint = req.body?.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'endpoint requerido' });
  try {
    await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2`, [endpoint, userId]);
    return res.status(204).end();
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
