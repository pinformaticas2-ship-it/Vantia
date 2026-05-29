import { Response } from 'express';
import pool from '../config/database';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_TIPOS = ['cargo', 'abono'] as const;

function userName(req: any): string {
  const c = req.auth?.sessionClaims;
  if (!c) return req.auth?.userId || 'Sistema';
  return (
    c.name || c.full_name ||
    [c.first_name, c.last_name].filter(Boolean).join(' ') ||
    c.email || req.auth?.userId || 'Sistema'
  );
}

export const listApuntes = async (req: any, res: Response) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).json({ success: false, error: 'ID inválido.' });
  try {
    const result = await pool.query(
      `SELECT * FROM expediente_apuntes WHERE expediente_id = $1 ORDER BY fecha DESC, created_at DESC`,
      [id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (e: any) {
    console.error('Error listando apuntes:', e);
    return res.status(500).json({ success: false, error: 'Error al obtener apuntes.' });
  }
};

export const createApunte = async (req: any, res: Response) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).json({ success: false, error: 'ID inválido.' });

  const { concepto, tipo = 'cargo', importe, fecha, notas } = req.body;
  if (!concepto?.trim()) return res.status(400).json({ success: false, error: 'El concepto es obligatorio.' });
  if (!VALID_TIPOS.includes(tipo)) return res.status(400).json({ success: false, error: 'Tipo inválido.' });
  const importeNum = parseFloat(importe);
  if (!Number.isFinite(importeNum) || importeNum < 0) return res.status(400).json({ success: false, error: 'Importe inválido.' });

  try {
    const result = await pool.query(
      `INSERT INTO expediente_apuntes (expediente_id, concepto, tipo, importe, fecha, notas, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, concepto.trim(), tipo, importeNum, fecha || new Date().toISOString().slice(0, 10), notas?.trim() || null, userName(req)]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    console.error('Error creando apunte:', e);
    return res.status(500).json({ success: false, error: 'Error al crear el apunte.' });
  }
};

export const updateApunte = async (req: any, res: Response) => {
  const { id, apunteId } = req.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(apunteId))
    return res.status(400).json({ success: false, error: 'ID inválido.' });

  const { concepto, tipo, importe, fecha, notas } = req.body;
  const updates: string[] = [];
  const vals: any[] = [];

  if (concepto !== undefined) { updates.push(`concepto = $${vals.length + 1}`); vals.push(concepto.trim()); }
  if (tipo !== undefined) {
    if (!VALID_TIPOS.includes(tipo)) return res.status(400).json({ success: false, error: 'Tipo inválido.' });
    updates.push(`tipo = $${vals.length + 1}`); vals.push(tipo);
  }
  if (importe !== undefined) {
    const n = parseFloat(importe);
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ success: false, error: 'Importe inválido.' });
    updates.push(`importe = $${vals.length + 1}`); vals.push(n);
  }
  if (fecha !== undefined) { updates.push(`fecha = $${vals.length + 1}`); vals.push(fecha); }
  if (notas !== undefined) { updates.push(`notas = $${vals.length + 1}`); vals.push(notas?.trim() || null); }

  if (!updates.length) return res.status(400).json({ success: false, error: 'Nada que actualizar.' });

  vals.push(apunteId, id);
  try {
    const result = await pool.query(
      `UPDATE expediente_apuntes SET ${updates.join(', ')} WHERE id = $${vals.length - 1} AND expediente_id = $${vals.length} RETURNING *`,
      vals
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Apunte no encontrado.' });
    return res.json({ success: true, data: result.rows[0] });
  } catch (e: any) {
    console.error('Error actualizando apunte:', e);
    return res.status(500).json({ success: false, error: 'Error al actualizar el apunte.' });
  }
};

export const deleteApunte = async (req: any, res: Response) => {
  const { id, apunteId } = req.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(apunteId))
    return res.status(400).json({ success: false, error: 'ID inválido.' });
  try {
    const result = await pool.query(
      `DELETE FROM expediente_apuntes WHERE id = $1 AND expediente_id = $2 RETURNING id`,
      [apunteId, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Apunte no encontrado.' });
    return res.json({ success: true });
  } catch (e: any) {
    console.error('Error eliminando apunte:', e);
    return res.status(500).json({ success: false, error: 'Error al eliminar el apunte.' });
  }
};
