import { Request, Response } from 'express';
import pool from '../config/database';

// ── Etiquetas de Vantia para el correo (27/11/2026) ─────────────────────────
// Iguales para Gmail e IMAP: nombre y color, varias por correo, guardadas en
// Vantia (no en el servidor de correo). Son de cada persona dentro de cada
// organización: nadie ve ni toca las etiquetas de otro, ni las de otra
// organización. Solo se pueden poner en correos de esa persona y organización.
// Tablas: correo_etiquetas y correo_etiquetas_emails (config/migrations.ts).

const ok = (res: Response, data: any) => res.json({ success: true, data });
const err = (res: Response, msg: string, s = 500) => res.status(s).json({ success: false, error: msg });
const uidDe = (req: Request) => String((req as any).auth?.userId || '');
const orgDe = (req: Request) => String((req as any).organizacionId || '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const COLORES_ETIQUETA = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];
const MAX_ETIQUETAS = 200;

const limpiarNombre = (v: any) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
const limpiarColor = (v: any) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : COLORES_ETIQUETA[5]);

/** Correo de esta persona y de esta organización (Gmail o IMAP). */
async function correoPropio(emailId: string, uid: string, org: string): Promise<boolean> {
  if (!UUID.test(emailId)) return false;
  const { rows } = await pool.query(
    `SELECT 1 FROM emails e
      WHERE e.id = $1 AND e.user_id = $2
        AND (e.account_id IN (SELECT id FROM email_accounts WHERE organizacion_id = $3)
             OR e.gmail_profile_id IN (SELECT id FROM email_oauth_profiles WHERE organizacion_id = $3))`,
    [emailId, uid, org],
  );
  return rows.length > 0;
}

// GET /api/email/etiquetas
export async function listarEtiquetas(req: Request, res: Response) {
  const uid = uidDe(req), org = orgDe(req);
  if (!uid || !org) return err(res, 'No autenticado', 401);
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.nombre, e.color,
              (SELECT COUNT(*)::int FROM correo_etiquetas_emails x WHERE x.etiqueta_id = e.id) AS total
         FROM correo_etiquetas e
        WHERE e.organizacion_id = $1 AND e.user_id = $2
        ORDER BY lower(e.nombre)`,
      [org, uid],
    );
    return ok(res, rows);
  } catch (e: any) { return err(res, e.message); }
}

// POST /api/email/etiquetas {nombre, color}
export async function crearEtiqueta(req: Request, res: Response) {
  const uid = uidDe(req), org = orgDe(req);
  if (!uid || !org) return err(res, 'No autenticado', 401);
  const nombre = limpiarNombre(req.body?.nombre);
  if (!nombre) return err(res, 'Escribe el nombre de la etiqueta.', 400);
  try {
    const { rows: n } = await pool.query(`SELECT COUNT(*)::int AS n FROM correo_etiquetas WHERE organizacion_id = $1 AND user_id = $2`, [org, uid]);
    if (n[0].n >= MAX_ETIQUETAS) return err(res, 'Has llegado al máximo de etiquetas.', 400);
    // Dos personas creándola a la vez (o un doble clic): la segunda recibe la misma.
    const { rows } = await pool.query(
      `INSERT INTO correo_etiquetas (organizacion_id, user_id, nombre, color) VALUES ($1,$2,$3,$4)
       ON CONFLICT (organizacion_id, user_id, (lower(nombre))) DO UPDATE SET nombre = correo_etiquetas.nombre
       RETURNING id, nombre, color`,
      [org, uid, nombre, limpiarColor(req.body?.color)],
    );
    return ok(res, { ...rows[0], total: 0 });
  } catch (e: any) { return err(res, e.message); }
}

// PATCH /api/email/etiquetas/:id {nombre?, color?}
export async function editarEtiqueta(req: Request, res: Response) {
  const uid = uidDe(req), org = orgDe(req);
  if (!uid || !org) return err(res, 'No autenticado', 401);
  const id = String(req.params.id || '');
  if (!UUID.test(id)) return err(res, 'Etiqueta no encontrada', 404);
  const nombre = req.body?.nombre !== undefined ? limpiarNombre(req.body.nombre) : null;
  if (nombre === '') return err(res, 'Escribe el nombre de la etiqueta.', 400);
  try {
    const { rows } = await pool.query(
      `UPDATE correo_etiquetas SET nombre = COALESCE($4, nombre), color = COALESCE($5, color)
        WHERE id = $1 AND organizacion_id = $2 AND user_id = $3
        RETURNING id, nombre, color`,
      [id, org, uid, nombre, req.body?.color !== undefined ? limpiarColor(req.body.color) : null],
    );
    if (!rows.length) return err(res, 'Etiqueta no encontrada', 404);
    return ok(res, rows[0]);
  } catch (e: any) {
    if (e?.code === '23505') return err(res, 'Ya tienes una etiqueta con ese nombre.', 409);
    return err(res, e.message);
  }
}

// DELETE /api/email/etiquetas/:id — quita la etiqueta de los correos, no borra correos.
export async function borrarEtiqueta(req: Request, res: Response) {
  const uid = uidDe(req), org = orgDe(req);
  if (!uid || !org) return err(res, 'No autenticado', 401);
  const id = String(req.params.id || '');
  if (!UUID.test(id)) return err(res, 'Etiqueta no encontrada', 404);
  try {
    const { rowCount } = await pool.query(`DELETE FROM correo_etiquetas WHERE id = $1 AND organizacion_id = $2 AND user_id = $3`, [id, org, uid]);
    if (!rowCount) return err(res, 'Etiqueta no encontrada', 404);
    return ok(res, { id });
  } catch (e: any) { return err(res, e.message); }
}

// GET /api/email/etiquetas/asignadas?ids=a,b,c → { [emailId]: [etiquetaId…] }
export async function etiquetasDeCorreos(req: Request, res: Response) {
  const uid = uidDe(req), org = orgDe(req);
  if (!uid || !org) return err(res, 'No autenticado', 401);
  const ids = String(req.query.ids || '').split(',').map((x) => x.trim()).filter((x) => UUID.test(x)).slice(0, 300);
  if (!ids.length) return ok(res, {});
  try {
    const { rows } = await pool.query(
      `SELECT x.email_id::text AS email_id, x.etiqueta_id::text AS etiqueta_id
         FROM correo_etiquetas_emails x
         JOIN correo_etiquetas e ON e.id = x.etiqueta_id
        WHERE e.organizacion_id = $1 AND e.user_id = $2 AND x.email_id = ANY($3::uuid[])`,
      [org, uid, ids],
    );
    const out: Record<string, string[]> = {};
    for (const r of rows) (out[r.email_id] ||= []).push(r.etiqueta_id);
    return ok(res, out);
  } catch (e: any) { return err(res, e.message); }
}

// PUT /api/email/etiquetas/correo/:emailId {etiquetas: [id…]} — deja exactamente esas.
export async function ponerEtiquetasCorreo(req: Request, res: Response) {
  const uid = uidDe(req), org = orgDe(req);
  if (!uid || !org) return err(res, 'No autenticado', 401);
  const emailId = String(req.params.emailId || '');
  const pedidas = Array.isArray(req.body?.etiquetas) ? [...new Set(req.body.etiquetas.map(String).filter((x: string) => UUID.test(x)))] as string[] : null;
  if (!pedidas) return err(res, 'Lista de etiquetas no válida', 400);
  const client = await pool.connect();
  try {
    if (!(await correoPropio(emailId, uid, org))) return err(res, 'Correo no encontrado', 404);
    // Solo etiquetas de esta persona en esta organización.
    const { rows: validas } = await client.query(
      `SELECT id::text AS id FROM correo_etiquetas WHERE organizacion_id = $1 AND user_id = $2 AND id = ANY($3::uuid[])`,
      [org, uid, pedidas],
    );
    const ids = validas.map((r) => r.id);
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM correo_etiquetas_emails x USING correo_etiquetas e
        WHERE x.etiqueta_id = e.id AND x.email_id = $1 AND e.organizacion_id = $2 AND e.user_id = $3 AND NOT (x.etiqueta_id = ANY($4::uuid[]))`,
      [emailId, org, uid, ids],
    );
    if (ids.length) {
      await client.query(
        `INSERT INTO correo_etiquetas_emails (etiqueta_id, email_id)
         SELECT unnest($1::uuid[]), $2 ON CONFLICT DO NOTHING`,
        [ids, emailId],
      );
    }
    await client.query('COMMIT');
    return ok(res, { emailId, etiquetas: ids });
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    return err(res, e.message);
  } finally { client.release(); }
}
