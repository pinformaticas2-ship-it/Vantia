import { Response } from 'express';
import pool from '../config/database';

const pgErr = (e: any) => `${e?.message || String(e)}${e?.code ? ' | code: ' + e.code : ''}`;

function normalizeUrl(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

export const getMyQuickLinks = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    const { rows } = await pool.query(
      `SELECT id, label, url, sort_order, created_at
       FROM user_quick_links WHERE user_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [userId]
    );
    res.json({ success: true, data: rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const createQuickLink = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  const label = String(req.body?.label || '').trim().slice(0, 120);
  const url = normalizeUrl(req.body?.url);
  if (!label || !url) return res.status(400).json({ success: false, error: 'Nombre y URL son obligatorios' });

  try {
    const { rows: maxRow } = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM user_quick_links WHERE user_id = $1`,
      [userId]
    );
    const { rows } = await pool.query(
      `INSERT INTO user_quick_links (user_id, label, url, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING id, label, url, sort_order, created_at`,
      [userId, label, url, maxRow[0].next]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const updateQuickLink = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  const label = String(req.body?.label || '').trim().slice(0, 120);
  const url = normalizeUrl(req.body?.url);
  if (!label || !url) return res.status(400).json({ success: false, error: 'Nombre y URL son obligatorios' });

  try {
    const { rows } = await pool.query(
      `UPDATE user_quick_links SET label = $1, url = $2, updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING id, label, url, sort_order, created_at`,
      [label, url, req.params.id, userId]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Enlace no encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const deleteQuickLink = async (req: any, res: Response) => {
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ success: false, error: 'No autenticado' });

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM user_quick_links WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId]
    );
    if (!rowCount) return res.status(404).json({ success: false, error: 'Enlace no encontrado' });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};
