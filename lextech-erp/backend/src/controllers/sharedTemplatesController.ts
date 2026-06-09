import { Request, Response } from 'express';
import pool from '../config/database';

// Tipos válidos de plantillas compartidas
const VALID_TYPES = ['email_template', 'email_signature', 'email_group', 'client_export'] as const;
type TemplateType = (typeof VALID_TYPES)[number];

function uid(req: Request): string {
  return (req as any).auth?.userId || 'unknown';
}

export async function listSharedTemplates(req: Request, res: Response) {
  const type = req.query.type as string;
  if (!VALID_TYPES.includes(type as TemplateType)) {
    return res.status(400).json({ success: false, error: 'Tipo de plantilla no válido' });
  }
  try {
    const result = await pool.query(
      `SELECT id, type, name, data, is_default, created_by, created_at, updated_at
       FROM shared_templates
       WHERE type = $1
       ORDER BY created_at ASC`,
      [type],
    );
    res.json({ success: true, data: result.rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
}

export async function createSharedTemplate(req: Request, res: Response) {
  const { type, name, data } = req.body as { type: string; name: string; data: Record<string, unknown> };
  if (!VALID_TYPES.includes(type as TemplateType)) {
    return res.status(400).json({ success: false, error: 'Tipo de plantilla no válido' });
  }
  if (!name?.trim()) {
    return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO shared_templates (type, name, data, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [type, name.trim(), JSON.stringify(data || {}), uid(req)],
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
}

export async function updateSharedTemplate(req: Request, res: Response) {
  const { id } = req.params;
  const { name, data } = req.body as { name: string; data: Record<string, unknown> };
  if (!name?.trim()) {
    return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });
  }
  try {
    const result = await pool.query(
      `UPDATE shared_templates
       SET name = $1, data = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [name.trim(), JSON.stringify(data || {}), id],
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'No encontrado' });
    res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
}

export async function deleteSharedTemplate(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM shared_templates WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'No encontrado' });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
}

export async function setDefaultSharedTemplate(req: Request, res: Response) {
  const { id } = req.params;
  try {
    // Primero obtenemos el type del template
    const tpl = await pool.query('SELECT type FROM shared_templates WHERE id = $1', [id]);
    if (tpl.rowCount === 0) return res.status(404).json({ success: false, error: 'No encontrado' });
    const type = tpl.rows[0].type;
    // Quitar default de todos los del mismo tipo y poner en este
    await pool.query(
      `UPDATE shared_templates SET is_default = (id = $1), updated_at = NOW() WHERE type = $2`,
      [id, type],
    );
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
}
