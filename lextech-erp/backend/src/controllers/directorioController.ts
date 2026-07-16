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

// Columnas de texto editables (comunes a Procurador/Abogado + las propias de
// cada tipo, que simplemente quedan NULL para el tipo al que no le aplican)
const TEXT_FIELDS = [
  'last_name', 'colegio', 'num_colegiado', 'despacho', 'nif_cif',
  'email', 'website',
  'address_street', 'address_cp', 'address_town', 'address_province', 'address_country',
  'phone_1', 'phone_2', 'phone_3', 'mobile', 'fax',
  'notes',
  'cuenta_consignaciones', 'codigo_repre', 'especialidad',
] as const;

function readTextFields(body: any): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of TEXT_FIELDS) out[f] = nullIfEmpty(body?.[f]);
  return out;
}

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
        OR COALESCE(nif_cif, '') ILIKE $${vals.length}
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

function normalizeEstado(raw: any): string {
  return String(raw || '').trim() === 'Baja' ? 'Baja' : 'Alta';
}

export const createProfesional = async (req: any, res: Response) => {
  const tipo = normalizeTipo(req.body?.tipo);
  const firstName = nullIfEmpty(req.body?.first_name);
  if (!tipo) return res.status(400).json({ success: false, error: 'tipo debe ser PROCURADOR o ABOGADO' });
  if (!firstName) return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });

  const userId = req.auth?.userId || 'SYSTEM';
  const fields = readTextFields(req.body);
  fields.address_country = fields.address_country || 'España';
  const turnoOficio = req.body?.turno_oficio === true || req.body?.turno_oficio === 'true';
  const estado = normalizeEstado(req.body?.estado);

  const cols = ['tipo', 'first_name', 'created_by', 'turno_oficio', 'estado', ...TEXT_FIELDS];
  const vals: any[] = [tipo, firstName, userId, turnoOficio, estado, ...TEXT_FIELDS.map(f => fields[f])];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');

  try {
    const { rows } = await pool.query(
      `INSERT INTO directorio_profesionales (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      vals
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

  const fields = readTextFields(req.body);
  fields.address_country = fields.address_country || 'España';
  const turnoOficio = req.body?.turno_oficio === true || req.body?.turno_oficio === 'true';
  const estado = normalizeEstado(req.body?.estado);

  const setCols = ['first_name', 'turno_oficio', 'estado', ...TEXT_FIELDS];
  const vals: any[] = [firstName, turnoOficio, estado, ...TEXT_FIELDS.map(f => fields[f])];
  const setClause = setCols.map((c, i) => `${c} = $${i + 1}`).join(', ');

  try {
    const { rows } = await pool.query(
      `UPDATE directorio_profesionales SET ${setClause}, updated_at = NOW()
       WHERE id = $${setCols.length + 1}
       RETURNING *`,
      [...vals, req.params.id]
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
