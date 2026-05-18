import { Request, Response } from 'express';
import pool from '../config/database';

export async function listNotificaciones(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM exp_notificaciones WHERE expediente_id = $1 ORDER BY fecha_recepcion DESC, created_at DESC`,
      [id]
    );
    res.json({ data: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function createNotificacion(req: Request, res: Response) {
  const { id } = req.params;
  const { tipo, titulo, descripcion, fecha_recepcion, fecha_limite, estado } = req.body;
  const userId = (req as any).auth?.userId || 'SYSTEM';
  if (!titulo || !fecha_recepcion) {
    return res.status(400).json({ error: 'titulo y fecha_recepcion son obligatorios' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO exp_notificaciones (expediente_id, tipo, titulo, descripcion, fecha_recepcion, fecha_limite, estado, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, tipo || 'notificacion', titulo, descripcion || null, fecha_recepcion, fecha_limite || null, estado || 'pendiente', userId]
    );
    res.status(201).json({ data: rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function updateNotificacion(req: Request, res: Response) {
  const { id, nid } = req.params;
  const { tipo, titulo, descripcion, fecha_recepcion, fecha_limite, estado } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE exp_notificaciones
       SET tipo=$1, titulo=$2, descripcion=$3, fecha_recepcion=$4, fecha_limite=$5, estado=$6
       WHERE id=$7 AND expediente_id=$8 RETURNING *`,
      [tipo, titulo, descripcion || null, fecha_recepcion, fecha_limite || null, estado, nid, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
    res.json({ data: rows[0] });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}

export async function deleteNotificacion(req: Request, res: Response) {
  const { id, nid } = req.params;
  try {
    await pool.query(`DELETE FROM exp_notificaciones WHERE id=$1 AND expediente_id=$2`, [nid, id]);
    res.status(204).end();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
