import { Response } from 'express';
import { createClerkClient } from '@clerk/backend';
import pool from '../config/database';

const pgErr = (e: any) =>
  `${e?.message || String(e)}${e?.code ? ' | code: ' + e.code : ''}`;

// ── Caché de nombres de usuario (Clerk API) ───────────────────
const _nameCache = new Map<string, { name: string; exp: number }>();

// Cliente Clerk inicializado de forma diferida para que dotenv ya haya cargado
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
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
      || user.emailAddresses?.[0]?.emailAddress
      || userId;
    _nameCache.set(userId, { name, exp: Date.now() + 10 * 60 * 1000 }); // 10 min
    return name;
  } catch (e) {
    console.error('⚠️ resolveUserName error para', userId, ':', e);
    return userId;
  }
}

// ── Helper para registrar con nombre real desde req ───────────
export async function logActivityForReq(
  req: any,
  actionType: string,
  entityType?: string,
  entityId?: string,
  entityName?: string
): Promise<void> {
  const userId   = req.auth?.userId || 'SYSTEM';
  const userName = userId === 'SYSTEM' ? 'Sistema' : await resolveUserName(userId);
  return logActivity(userId, userName, actionType, entityType, entityId, entityName);
}


// ─────────────────────────────────────────────────────────────
// GET /api/activity  — últimas 50 acciones globales
// ─────────────────────────────────────────────────────────────
export const getActivity = async (_req: any, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT id, user_id, user_name, action_type,
             entity_type, entity_id, entity_name, created_at
      FROM activity_log
      ORDER BY created_at DESC
      LIMIT 50
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('❌ getActivity:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/activity/client/:clientId — historial de un cliente
// ─────────────────────────────────────────────────────────────
export const getClientActivity = async (req: any, res: Response) => {
  const { clientId } = req.params;
  try {
    const result = await pool.query(`
      SELECT id, user_id, user_name, action_type,
             entity_type, entity_id, entity_name, created_at
      FROM activity_log
      WHERE entity_id = $1
      ORDER BY created_at DESC
      LIMIT 200
    `, [clientId]);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('❌ getClientActivity:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/activity/client/:clientId — añadir actuación manual
// ─────────────────────────────────────────────────────────────
export const addClientActivity = async (req: any, res: Response) => {
  const { clientId } = req.params;
  const { action_type, description } = req.body;
  const userId   = req.auth?.userId || 'SYSTEM';
  const userName = userId === 'SYSTEM' ? 'Sistema' : await resolveUserName(userId);

  if (!action_type || !action_type.trim()) {
    return res.status(400).json({ success: false, error: 'action_type es obligatorio.' });
  }

  try {
    // Obtener nombre del cliente para entity_name
    const clientRes = await pool.query(
      `SELECT COALESCE(commercial_name, CONCAT(first_name, ' ', last_name)) AS name
       FROM entities WHERE id = $1`,
      [clientId]
    );
    const entityName = clientRes.rows[0]?.name || clientId;

    const fullAction = description?.trim()
      ? `${action_type.trim()}: ${description.trim()}`
      : action_type.trim();

    const result = await pool.query(
      `INSERT INTO activity_log (user_id, user_name, action_type, entity_type, entity_id, entity_name)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, userName, fullAction, 'CLIENT', clientId, entityName]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('❌ addClientActivity:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// Helper exportable para registrar una acción desde otros controladores
// ─────────────────────────────────────────────────────────────
export async function logActivity(
  userId: string,
  userName: string,
  actionType: string,
  entityType?: string,
  entityId?: string,
  entityName?: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO activity_log (user_id, user_name, action_type, entity_type, entity_id, entity_name)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, userName, actionType, entityType || null, entityId || null, entityName || null]
    );
  } catch (_e) {
    // Silencioso — no interrumpir el flujo principal si falla el log
  }
}
