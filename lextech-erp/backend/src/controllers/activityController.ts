import { Response } from 'express';
import pool from '../config/database';

const pgErr = (e: any) =>
  `${e?.message || String(e)}${e?.code ? ' | code: ' + e.code : ''}`;

// ─────────────────────────────────────────────────────────────
// GET /api/activity  — últimas 50 acciones
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
