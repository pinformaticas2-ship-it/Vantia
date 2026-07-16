import { Response } from 'express';
import pool from '../config/database';
import { logActivityForReq } from './activityController';

const pgErr = (e: any) => `${e?.message || String(e)}${e?.code ? ' | code: ' + e.code : ''}`;

function normalizeTipo(raw: any): 'PROCURADOR' | 'ABOGADO' | null {
  const value = String(raw || '').trim().toUpperCase();
  return value === 'PROCURADOR' || value === 'ABOGADO' ? value : null;
}

function nullIfEmpty(v: any): string | null {
  const value = String(v ?? '').trim();
  return value ? value : null;
}

const LABELS: Record<string, string> = { PROCURADOR: 'Procurador', ABOGADO: 'Abogado' };

export const getProfesionales = async (req: any, res: Response) => {
  const tipo = normalizeTipo(req.query.tipo);
  if (!tipo) return res.status(400).json({ success: false, error: 'tipo debe ser PROCURADOR o ABOGADO' });

  const q = String(req.query.q || '').trim();

  try {
    const conds = ['tipo = $1'];
    const vals: any[] = [tipo];
    if (q) {
      vals.push(`%${q}%`);
      conds.push(`(
        unaccent(COALESCE(first_name, '')) ILIKE unaccent($${vals.length})
        OR unaccent(COALESCE(last_name, '')) ILIKE unaccent($${vals.length})
        OR unaccent(COALESCE(despacho, '')) ILIKE unaccent($${vals.length})
        OR unaccent(COALESCE(colegio, '')) ILIKE unaccent($${vals.length})
        OR COALESCE(num_colegiado, '') ILIKE $${vals.length}
      )`);
    }

    const { rows } = await pool.query(
      `SELECT * FROM directorio_profesionales WHERE ${conds.join(' AND ')}
       ORDER BY first_name ASC, last_name ASC`,
      vals
    );
    res.json({ success: true, data: rows });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const getProfesionalById = async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM directorio_profesionales WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'No encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const createProfesional = async (req: any, res: Response) => {
  const tipo = normalizeTipo(req.body?.tipo);
  const firstName = nullIfEmpty(req.body?.first_name);
  if (!tipo) return res.status(400).json({ success: false, error: 'tipo debe ser PROCURADOR o ABOGADO' });
  if (!firstName) return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });

  const userId = req.auth?.userId || 'SYSTEM';
  const {
    last_name, colegio, num_colegiado, despacho, email, phone, address, notes,
    cuenta_consignaciones, codigo_repre, especialidad, turno_oficio,
  } = req.body || {};

  try {
    const { rows } = await pool.query(
      `INSERT INTO directorio_profesionales
         (tipo, first_name, last_name, colegio, num_colegiado, despacho, email, phone, address, notes, created_by,
          cuenta_consignaciones, codigo_repre, especialidad, turno_oficio)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        tipo, firstName, nullIfEmpty(last_name), nullIfEmpty(colegio), nullIfEmpty(num_colegiado),
        nullIfEmpty(despacho), nullIfEmpty(email), nullIfEmpty(phone), nullIfEmpty(address),
        nullIfEmpty(notes), userId,
        nullIfEmpty(cuenta_consignaciones), nullIfEmpty(codigo_repre), nullIfEmpty(especialidad),
        turno_oficio === true || turno_oficio === 'true',
      ]
    );
    const p = rows[0];
    logActivityForReq(req, `${LABELS[tipo]} creado: ${p.first_name} ${p.last_name || ''}`.trim(), 'DIRECTORIO', p.id, undefined, 'CREATE');
    res.status(201).json({ success: true, data: p });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const updateProfesional = async (req: any, res: Response) => {
  const firstName = nullIfEmpty(req.body?.first_name);
  if (!firstName) return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });

  const {
    last_name, colegio, num_colegiado, despacho, email, phone, address, notes,
    cuenta_consignaciones, codigo_repre, especialidad, turno_oficio,
  } = req.body || {};

  try {
    const { rows } = await pool.query(
      `UPDATE directorio_profesionales SET
         first_name = $1, last_name = $2, colegio = $3, num_colegiado = $4,
         despacho = $5, email = $6, phone = $7, address = $8, notes = $9,
         cuenta_consignaciones = $10, codigo_repre = $11, especialidad = $12, turno_oficio = $13,
         updated_at = NOW()
       WHERE id = $14
       RETURNING *`,
      [
        firstName, nullIfEmpty(last_name), nullIfEmpty(colegio), nullIfEmpty(num_colegiado),
        nullIfEmpty(despacho), nullIfEmpty(email), nullIfEmpty(phone), nullIfEmpty(address),
        nullIfEmpty(notes),
        nullIfEmpty(cuenta_consignaciones), nullIfEmpty(codigo_repre), nullIfEmpty(especialidad),
        turno_oficio === true || turno_oficio === 'true',
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'No encontrado' });
    const p = rows[0];
    logActivityForReq(req, `${LABELS[p.tipo] || p.tipo} actualizado: ${p.first_name} ${p.last_name || ''}`.trim(), 'DIRECTORIO', p.id, undefined, 'UPDATE');
    res.json({ success: true, data: p });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};

export const deleteProfesional = async (req: any, res: Response) => {
  try {
    const { rows } = await pool.query(`DELETE FROM directorio_profesionales WHERE id = $1 RETURNING *`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'No encontrado' });
    const p = rows[0];
    logActivityForReq(req, `${LABELS[p.tipo] || p.tipo} eliminado: ${p.first_name} ${p.last_name || ''}`.trim(), 'DIRECTORIO', p.id, undefined, 'DELETE');
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: pgErr(e) });
  }
};
