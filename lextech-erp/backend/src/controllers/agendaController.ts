import { Response } from 'express';
import pool from '../config/database';
import { logActivityForReq } from './activityController';

const pgErr = (e: any) => `${e?.message || String(e)}${e?.code ? ' | code: ' + e.code : ''}`;

// ─────────────────────────────────────────────────────────────
// GET /api/agenda  — eventos en rango de fechas
// Query params: from (ISO), to (ISO), status, type
// ─────────────────────────────────────────────────────────────
export const getEvents = async (req: any, res: Response) => {
  try {
    const from   = (req.query.from   as string) || '';
    const to     = (req.query.to     as string) || '';
    const status = (req.query.status as string) || '';
    const type   = (req.query.type   as string) || '';

    const conds: string[] = [];
    const vals:  any[]    = [];
    let p = 1;

    if (from) { conds.push(`start_at >= $${p}`); vals.push(from); p++; }
    if (to)   { conds.push(`start_at <= $${p}`); vals.push(to);   p++; }
    if (status) { conds.push(`status = $${p}`); vals.push(status); p++; }
    if (type)   { conds.push(`type   = $${p}`); vals.push(type);   p++; }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM agenda_events ${where} ORDER BY start_at ASC LIMIT 500`,
      vals
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('❌ getEvents:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/agenda/upcoming  — próximos N eventos desde ahora
// ─────────────────────────────────────────────────────────────
export const getUpcomingEvents = async (req: any, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || '10'), 50);
    const result = await pool.query(
      `SELECT * FROM agenda_events
       WHERE start_at >= NOW() AND status != 'cancelado'
       ORDER BY start_at ASC
       LIMIT $1`,
      [limit]
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error('❌ getUpcomingEvents:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/agenda/:id
// ─────────────────────────────────────────────────────────────
export const getEventById = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM agenda_events WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ success: false, error: 'Evento no encontrado' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/agenda  — crear evento
// ─────────────────────────────────────────────────────────────
export const createEvent = async (req: any, res: Response) => {
  const userId = req.auth?.userId || 'SYSTEM';
  const {
    title, description, start_at, end_at, all_day,
    type, status, expediente_id, cliente_id, location, color,
  } = req.body;

  if (!title?.trim())  return res.status(400).json({ success: false, error: 'El título es obligatorio.' });
  if (!start_at)       return res.status(400).json({ success: false, error: 'La fecha de inicio es obligatoria.' });

  // Resolver nombre del usuario
  const { resolveUserName } = await import('./activityController');
  const userName = userId === 'SYSTEM' ? 'Sistema' : await resolveUserName(userId);

  try {
    const result = await pool.query(
      `INSERT INTO agenda_events
         (user_id, user_name, title, description, start_at, end_at, all_day,
          type, status, expediente_id, cliente_id, location, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        userId, userName,
        title.trim(),
        description?.trim() || null,
        start_at,
        end_at || null,
        all_day ?? false,
        type || 'cita',
        status || 'pendiente',
        expediente_id || null,
        cliente_id || null,
        location?.trim() || null,
        color || null,
      ]
    );
    await logActivityForReq(req, 'Evento agenda creado', 'AGENDA', result.rows[0].id, title.trim());
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('❌ createEvent:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/agenda/:id  — actualizar evento
// ─────────────────────────────────────────────────────────────
export const updateEvent = async (req: any, res: Response) => {
  const { id } = req.params;
  const {
    title, description, start_at, end_at, all_day,
    type, status, expediente_id, cliente_id, location, color,
  } = req.body;

  if (!title?.trim())  return res.status(400).json({ success: false, error: 'El título es obligatorio.' });
  if (!start_at)       return res.status(400).json({ success: false, error: 'La fecha de inicio es obligatoria.' });

  try {
    const result = await pool.query(
      `UPDATE agenda_events SET
         title = $1, description = $2, start_at = $3, end_at = $4,
         all_day = $5, type = $6, status = $7,
         expediente_id = $8, cliente_id = $9, location = $10, color = $11,
         updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        title.trim(),
        description?.trim() || null,
        start_at,
        end_at || null,
        all_day ?? false,
        type || 'cita',
        status || 'pendiente',
        expediente_id || null,
        cliente_id || null,
        location?.trim() || null,
        color || null,
        id,
      ]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ success: false, error: 'Evento no encontrado' });

    await logActivityForReq(req, 'Evento agenda modificado', 'AGENDA', id, title.trim());
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('❌ updateEvent:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/agenda/:id  — eliminar evento
// ─────────────────────────────────────────────────────────────
export const deleteEvent = async (req: any, res: Response) => {
  const { id } = req.params;
  try {
    const existing = await pool.query(`SELECT title FROM agenda_events WHERE id = $1`, [id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ success: false, error: 'Evento no encontrado' });

    await pool.query(`DELETE FROM agenda_events WHERE id = $1`, [id]);
    await logActivityForReq(req, 'Evento agenda eliminado', 'AGENDA', id, existing.rows[0].title);
    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ deleteEvent:', pgErr(error));
    res.status(500).json({ success: false, error: pgErr(error) });
  }
};
