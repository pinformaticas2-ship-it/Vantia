import { Request, Response } from 'express';
import { createClerkClient } from '@clerk/backend';
import pool from '../config/database';
import { getClientIp } from '../utils/clientIp';

const pgErr = (e: any) =>
  `${e?.message || String(e)}${e?.code ? ' | code: ' + e.code : ''}`;

export type EventType =
  | 'ACTION'
  | 'LOGIN'
  | 'LOGOUT'
  | 'SERVER_START'
  | 'AUTH_ERROR'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VIEW'
  | 'EXPORT'
  | 'UPLOAD'
  | 'DOWNLOAD';

const _nameCache = new Map<string, { name: string; exp: number }>();
let _clerk: ReturnType<typeof createClerkClient> | null = null;

function getClerk() {
  if (!_clerk) _clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  return _clerk;
}

export async function resolveUserName(userId: string): Promise<string> {
  const hit = _nameCache.get(userId);
  if (hit && hit.exp > Date.now()) return hit.name;

  try {
    const user = await getClerk().users.getUser(userId);
    const name =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
      user.emailAddresses?.[0]?.emailAddress ||
      userId;

    _nameCache.set(userId, { name, exp: Date.now() + 10 * 60 * 1000 });
    return name;
  } catch {
    return userId;
  }
}

function getUA(req: Request): string {
  return (req.headers['user-agent'] || '').slice(0, 500);
}

function getDeviceId(req: Request): string | null {
  const raw = req.headers['x-device-id'];
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

export async function logActivity(
  userId: string,
  userName: string,
  actionType: string,
  entityType?: string,
  entityId?: string,
  entityName?: string,
  opts?: { eventType?: EventType; ipAddress?: string; sessionId?: string; userAgent?: string; deviceId?: string }
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO activity_log
         (user_id, user_name, action_type, entity_type, entity_id, entity_name,
          event_type, ip_address, session_id, user_agent, device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        userId,
        userName,
        actionType,
        entityType || null,
        entityId || null,
        entityName || null,
        opts?.eventType || 'ACTION',
        opts?.ipAddress || null,
        opts?.sessionId || null,
        opts?.userAgent || null,
        opts?.deviceId || null,
      ]
    );
  } catch (_e) {}
}

export async function logActivityForReq(
  req: Request,
  actionType: string,
  entityType?: string,
  entityId?: string,
  entityName?: string,
  eventType?: EventType
): Promise<void> {
  const userId = (req as any).auth?.userId || 'SYSTEM';
  const userName = userId === 'SYSTEM' ? 'Sistema' : await resolveUserName(userId);

  return logActivity(userId, userName, actionType, entityType, entityId, entityName, {
    eventType: eventType || 'ACTION',
    ipAddress: getClientIp(req),
    userAgent: getUA(req),
    deviceId: getDeviceId(req),
  });
}

export async function logServerStart(): Promise<void> {
  await logActivity('SYSTEM', 'Sistema', 'Servidor iniciado', undefined, undefined, undefined, {
    eventType: 'SERVER_START',
    ipAddress: 'localhost',
  });
  console.log('[Trazabilidad] SERVER_START registrado');
}

export const registerLogin = async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    const userName = await resolveUserName(userId);
    const ip = getClientIp(req);
    const sessionId = (req as any).auth?.sessionId || null;
    const deviceId = getDeviceId(req);

    const { rows } = await pool.query(
      `
      SELECT id FROM activity_log
      WHERE user_id=$1 AND event_type='LOGIN' AND ip_address=$2
        AND COALESCE(device_id, '') = COALESCE($3, '')
        AND created_at > NOW()-INTERVAL '30 minutes'
      ORDER BY created_at DESC LIMIT 1`,
      [userId, ip, deviceId]
    );

    if (rows.length) {
      return res.json({ success: true, data: { already: true } });
    }

    await logActivity(
      userId,
      userName,
      `Inicio de sesión desde ${ip}`,
      undefined,
      undefined,
      undefined,
      { eventType: 'LOGIN', ipAddress: ip, sessionId, userAgent: getUA(req), deviceId }
    );

    return res.json({ success: true, data: { logged: true, ip } });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const registerLogout = async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    const userName = await resolveUserName(userId);
    const ip = getClientIp(req);
    const sessionId = (req as any).auth?.sessionId || null;
    const deviceId = getDeviceId(req);

    await logActivity(userId, userName, 'Cierre de sesión', undefined, undefined, undefined, {
      eventType: 'LOGOUT',
      ipAddress: ip,
      sessionId,
      userAgent: getUA(req),
      deviceId,
    });

    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const getActivity = async (req: Request, res: Response) => {
  const limit = Math.min(parseInt((req.query.limit as string) || '100'), 500);
  const eventType = (req.query.event_type as string) || '';

  try {
    const params: any[] = [limit];
    const filter = eventType ? `WHERE event_type=$2` : '';
    if (eventType) params.push(eventType);

    const { rows } = await pool.query(
      `
      SELECT id, user_id, user_name, action_type,
             entity_type, entity_id, entity_name,
             event_type, ip_address, session_id, user_agent, device_id, created_at
      FROM activity_log
      ${filter}
      ORDER BY created_at DESC LIMIT $1
    `,
      params
    );

    res.json({ success: true, data: rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const getClientActivity = async (req: Request, res: Response) => {
  const { clientId } = req.params;

  try {
    const { rows } = await pool.query(
      `
      SELECT al.id, al.user_id, al.user_name, al.action_type,
             al.entity_type, al.entity_id, al.entity_name,
             al.event_type, al.ip_address, al.device_id, al.created_at,
             cm.avatar_url
      FROM activity_log al
      LEFT JOIN (
        SELECT DISTINCT ON (user_id) user_id, avatar_url
        FROM chat_miembros
        WHERE avatar_url IS NOT NULL AND avatar_url <> ''
        ORDER BY user_id, joined_at DESC NULLS LAST
      ) cm ON cm.user_id = al.user_id
      WHERE al.entity_id=$1
      ORDER BY al.created_at DESC LIMIT 200`,
      [clientId]
    );

    res.json({ success: true, data: rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const addClientActivity = async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const { action_type, description } = req.body;
  const userId = (req as any).auth?.userId || 'SYSTEM';
  const userName = userId === 'SYSTEM' ? 'Sistema' : await resolveUserName(userId);

  if (!action_type?.trim()) {
    return res.status(400).json({ success: false, error: 'action_type es obligatorio.' });
  }

  try {
    const cr = await pool.query(
      `SELECT COALESCE(commercial_name,CONCAT(first_name,' ',last_name)) AS name FROM entities WHERE id=$1`, 
      [clientId]
    );
    const entityName = cr.rows[0]?.name || clientId;
    const fullAction = description?.trim()
      ? `${action_type.trim()}: ${description.trim()}`
      : action_type.trim();

    const { rows } = await pool.query(
      `INSERT INTO activity_log
         (user_id,user_name,action_type,entity_type,entity_id,entity_name,event_type,ip_address,user_agent,device_id)
       VALUES ($1,$2,$3,'CLIENT',$4,$5,'ACTION',$6,$7,$8) RETURNING *`,
      [userId, userName, fullAction, clientId, entityName, getClientIp(req), getUA(req), getDeviceId(req)]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const getActivityByUsers = async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        user_id,
        (array_agg(user_name ORDER BY created_at DESC))[1]              AS user_name,
        COUNT(*)::int                                                   AS total_actions,
        COUNT(*) FILTER (WHERE event_type='LOGIN')::int                 AS total_logins,
        COUNT(*) FILTER (WHERE event_type='LOGOUT')::int                AS total_logouts,
        MAX(created_at)                                                 AS last_action_at,
        MIN(created_at)                                                 AS first_action_at,
        MAX(CASE WHEN event_type='LOGIN' THEN created_at END)           AS last_login_at,
        (array_agg(ip_address ORDER BY created_at DESC)
          FILTER (WHERE ip_address IS NOT NULL AND ip_address!='localhost'))[1] AS last_ip,
        (array_agg(device_id ORDER BY created_at DESC)
          FILTER (WHERE device_id IS NOT NULL AND device_id!=''))[1] AS last_device_id,
        json_agg(DISTINCT event_type) FILTER (WHERE event_type IS NOT NULL) AS event_types,
        json_agg(DISTINCT entity_type) FILTER (WHERE entity_type IS NOT NULL) AS entity_types
      FROM activity_log
      WHERE user_id != 'SYSTEM'
      GROUP BY user_id
      ORDER BY MAX(created_at) DESC
    `);

    res.json({ success: true, data: rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const getUserActivity = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const limit = Math.min(parseInt((req.query.limit as string) || '500'), 1000);
  const offset = parseInt((req.query.offset as string) || '0');
  const eventType = (req.query.event_type as string) || '';
  
  try {
    const params: any[] = [userId, limit, offset];
    const filter = eventType ? `AND event_type=$4` : '';
    if (eventType) params.push(eventType);

    const [rows, total] = await Promise.all([
      pool.query(
        `
        SELECT id, user_id, user_name, action_type,
               entity_type, entity_id, entity_name,
               event_type, ip_address, session_id, user_agent, device_id, created_at
        FROM activity_log
        WHERE user_id=$1 ${filter}
        ORDER BY created_at DESC LIMIT $2 OFFSET $3
      `,
        params
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM activity_log WHERE user_id=$1`, [userId]),
    ]);

    res.json({ success: true, data: rows.rows, total: total.rows[0]?.total ?? 0 });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const getMyActivity = async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }
  const limit = Math.min(parseInt((req.query.limit as string) || '100'), 500);
  const offset = parseInt((req.query.offset as string) || '0');
  const eventType = (req.query.event_type as string) || '';

  try {
    const params: any[] = [userId, limit, offset];
    const filter = eventType ? `AND event_type=$4` : '';
    if (eventType) params.push(eventType);

    const [rows, total] = await Promise.all([
      pool.query(
        `
        SELECT id, user_id, user_name, action_type,
               entity_type, entity_id, entity_name,
               event_type, ip_address, session_id, user_agent, device_id, created_at
        FROM activity_log
        WHERE user_id=$1 ${filter}
        ORDER BY created_at DESC LIMIT $2 OFFSET $3
      `,
        params
      ),
      pool.query(`SELECT COUNT(*)::int AS total FROM activity_log WHERE user_id=$1`, [userId]),
    ]);

    return res.json({ success: true, data: rows.rows, total: total.rows[0]?.total ?? 0 });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: pgErr(e) });
  }
};
