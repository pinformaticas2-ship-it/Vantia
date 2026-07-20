import { Request, Response } from 'express';
import pool from '../config/database';
import { getClerk, resolveUserRole } from './activityController';

const pgErr = (e: any) =>
  `${e?.message || String(e)}${e?.detail ? ' | detail: ' + e.detail : ''}${e?.code ? ' | code: ' + e.code : ''}`;

export type OrgRol = 'propietario' | 'admin' | 'miembro';

export interface OrgMembership {
  organizacionId: string;
  organizacionNombre: string;
  rol: OrgRol;
}

const _membershipsCache = new Map<string, { memberships: OrgMembership[]; exp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function invalidateUserCache(userId: string) {
  _membershipsCache.delete(userId);
}

async function fetchMemberships(userId: string): Promise<OrgMembership[]> {
  const { rows } = await pool.query(
    `SELECT m.organizacion_id, o.nombre, m.rol
       FROM organizacion_miembros m
       JOIN organizaciones o ON o.id = m.organizacion_id
      WHERE m.user_id = $1
      ORDER BY m.created_at ASC`,
    [userId]
  );
  return rows.map((r) => ({ organizacionId: r.organizacion_id, organizacionNombre: r.nombre, rol: r.rol as OrgRol }));
}

// Autoprovisiona al usuario en la organización sembrada la primera vez que se
// le ve (misma filosofía que resolveUserRole: nunca deja a un usuario
// autenticado sin organización). El rol de Clerk publicMetadata (el único
// control de acceso que existía antes de este cambio) se respeta al migrar:
// si ya era 'admin' en Clerk, entra como 'propietario'/'admin' aquí; si no,
// como 'miembro'.
async function autoProvision(userId: string): Promise<OrgMembership[]> {
  const { rows: orgRows } = await pool.query(
    `SELECT id, nombre FROM organizaciones ORDER BY created_at ASC LIMIT 1`
  );
  if (orgRows.length === 0) return [];
  const org = orgRows[0];

  const { rows: existingAdmins } = await pool.query(
    `SELECT 1 FROM organizacion_miembros WHERE organizacion_id = $1 AND rol IN ('propietario','admin') LIMIT 1`,
    [org.id]
  );
  const clerkRole = await resolveUserRole(userId);
  const rol: OrgRol = clerkRole === 'admin' ? (existingAdmins.length === 0 ? 'propietario' : 'admin') : 'miembro';

  await pool.query(
    `INSERT INTO organizacion_miembros (organizacion_id, user_id, rol)
     VALUES ($1, $2, $3)
     ON CONFLICT (organizacion_id, user_id) DO NOTHING`,
    [org.id, userId, rol]
  );

  return fetchMemberships(userId);
}

export async function resolveUserOrgMemberships(userId: string): Promise<OrgMembership[]> {
  const hit = _membershipsCache.get(userId);
  if (hit && hit.exp > Date.now()) return hit.memberships;

  let memberships = await fetchMemberships(userId);
  if (memberships.length === 0) {
    memberships = await autoProvision(userId);
  }

  _membershipsCache.set(userId, { memberships, exp: Date.now() + CACHE_TTL_MS });
  return memberships;
}

function ok(res: Response, data: any) {
  return res.json({ success: true, data });
}
function err(res: Response, message: string, status = 500) {
  return res.status(status).json({ success: false, error: message });
}

function requireOrgContext(req: Request, res: Response): { organizacionId: string; organizacionRol: OrgRol } | null {
  const organizacionId = (req as any).organizacionId;
  const organizacionRol = (req as any).organizacionRol;
  if (!organizacionId) {
    err(res, 'No se pudo determinar la organización activa.', 400);
    return null;
  }
  return { organizacionId, organizacionRol };
}

// GET /api/organizacion — organización activa + todas las del usuario
export async function getMyOrganizacion(req: Request, res: Response) {
  try {
    const ctx = requireOrgContext(req, res);
    if (!ctx) return;
    const userId = (req as any).auth?.userId;
    const memberships = await resolveUserOrgMemberships(userId);
    const activa = memberships.find((m) => m.organizacionId === ctx.organizacionId) || memberships[0];
    return ok(res, {
      organizacion: activa ? { id: activa.organizacionId, nombre: activa.organizacionNombre } : null,
      rol: activa?.rol || null,
      organizaciones: memberships.map((m) => ({ id: m.organizacionId, nombre: m.organizacionNombre, rol: m.rol })),
    });
  } catch (e: any) {
    return err(res, pgErr(e));
  }
}

// PUT /api/organizacion — editar nombre (propietario/admin)
export async function updateMyOrganizacion(req: Request, res: Response) {
  try {
    const ctx = requireOrgContext(req, res);
    if (!ctx) return;
    if (ctx.organizacionRol !== 'propietario' && ctx.organizacionRol !== 'admin') {
      return err(res, 'Solo el propietario o un administrador pueden editar la organización.', 403);
    }
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return err(res, 'El nombre de la organización no puede estar vacío.', 400);

    await pool.query(
      `UPDATE organizaciones SET nombre = $1, updated_at = NOW() WHERE id = $2`,
      [nombre, ctx.organizacionId]
    );
    const userId = (req as any).auth?.userId;
    invalidateUserCache(userId);
    return ok(res, { id: ctx.organizacionId, nombre });
  } catch (e: any) {
    return err(res, pgErr(e));
  }
}

// POST /api/organizacion — crear una organización nueva (el creador es propietario)
export async function createOrganizacion(req: Request, res: Response) {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) return err(res, 'No autenticado', 401);
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return err(res, 'El nombre de la organización no puede estar vacío.', 400);

    const { rows } = await pool.query(
      `INSERT INTO organizaciones (nombre) VALUES ($1) RETURNING id, nombre`,
      [nombre]
    );
    const org = rows[0];
    await pool.query(
      `INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1, $2, 'propietario')`,
      [org.id, userId]
    );
    invalidateUserCache(userId);
    return ok(res, { id: org.id, nombre: org.nombre, rol: 'propietario' });
  } catch (e: any) {
    return err(res, pgErr(e));
  }
}

// GET /api/organizacion/miembros
export async function getOrganizacionMiembros(req: Request, res: Response) {
  try {
    const ctx = requireOrgContext(req, res);
    if (!ctx) return;
    const { rows } = await pool.query(
      `SELECT id, user_id, rol, created_at FROM organizacion_miembros
        WHERE organizacion_id = $1 ORDER BY created_at ASC`,
      [ctx.organizacionId]
    );

    const clerk = getClerk();
    const miembros = await Promise.all(rows.map(async (m) => {
      let nombre = m.user_id;
      let email: string | null = null;
      try {
        const user = await clerk.users.getUser(m.user_id);
        nombre = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.emailAddresses?.[0]?.emailAddress || m.user_id;
        email = user.emailAddresses?.[0]?.emailAddress || null;
      } catch { /* usuario borrado en Clerk u otro fallo puntual */ }
      return { id: m.id, userId: m.user_id, nombre, email, rol: m.rol, createdAt: m.created_at };
    }));

    return ok(res, miembros);
  } catch (e: any) {
    return err(res, pgErr(e));
  }
}

// POST /api/organizacion/miembros — añadir por email de Clerk (propietario/admin)
export async function addOrganizacionMiembro(req: Request, res: Response) {
  try {
    const ctx = requireOrgContext(req, res);
    if (!ctx) return;
    if (ctx.organizacionRol !== 'propietario' && ctx.organizacionRol !== 'admin') {
      return err(res, 'Solo el propietario o un administrador pueden añadir miembros.', 403);
    }
    const email = String(req.body?.email || '').trim().toLowerCase();
    const rol: OrgRol = (req.body?.rol === 'admin' || req.body?.rol === 'propietario') ? req.body.rol : 'miembro';
    if (!email) return err(res, 'Indica un email.', 400);

    const clerk = getClerk();
    const { data: users } = await clerk.users.getUserList({ emailAddress: [email] });
    if (!users || users.length === 0) {
      return err(res, 'No existe ningún usuario con ese email. Debe haber iniciado sesión al menos una vez en Vantia antes de poder añadirlo.', 404);
    }
    const targetUserId = users[0].id;

    const { rows } = await pool.query(
      `INSERT INTO organizacion_miembros (organizacion_id, user_id, rol)
       VALUES ($1, $2, $3)
       ON CONFLICT (organizacion_id, user_id) DO UPDATE SET rol = EXCLUDED.rol
       RETURNING id, user_id, rol`,
      [ctx.organizacionId, targetUserId, rol]
    );
    invalidateUserCache(targetUserId);
    return ok(res, { id: rows[0].id, userId: rows[0].user_id, rol: rows[0].rol, email });
  } catch (e: any) {
    return err(res, pgErr(e));
  }
}

// PATCH /api/organizacion/miembros/:id — cambiar rol (solo propietario)
export async function updateOrganizacionMiembroRol(req: Request, res: Response) {
  try {
    const ctx = requireOrgContext(req, res);
    if (!ctx) return;
    if (ctx.organizacionRol !== 'propietario') {
      return err(res, 'Solo el propietario puede cambiar roles.', 403);
    }
    const rol: OrgRol = req.body?.rol;
    if (!['propietario', 'admin', 'miembro'].includes(rol)) return err(res, 'Rol inválido.', 400);

    const { rows } = await pool.query(
      `UPDATE organizacion_miembros SET rol = $1
        WHERE id = $2 AND organizacion_id = $3
        RETURNING id, user_id, rol`,
      [rol, req.params.id, ctx.organizacionId]
    );
    if (rows.length === 0) return err(res, 'Miembro no encontrado.', 404);
    invalidateUserCache(rows[0].user_id);
    return ok(res, { id: rows[0].id, userId: rows[0].user_id, rol: rows[0].rol });
  } catch (e: any) {
    return err(res, pgErr(e));
  }
}

// DELETE /api/organizacion/miembros/:id — quitar miembro (propietario/admin)
export async function removeOrganizacionMiembro(req: Request, res: Response) {
  try {
    const ctx = requireOrgContext(req, res);
    if (!ctx) return;
    if (ctx.organizacionRol !== 'propietario' && ctx.organizacionRol !== 'admin') {
      return err(res, 'Solo el propietario o un administrador pueden quitar miembros.', 403);
    }

    const { rows: target } = await pool.query(
      `SELECT user_id, rol FROM organizacion_miembros WHERE id = $1 AND organizacion_id = $2`,
      [req.params.id, ctx.organizacionId]
    );
    if (target.length === 0) return err(res, 'Miembro no encontrado.', 404);

    if (target[0].rol === 'propietario') {
      const { rows: otherOwners } = await pool.query(
        `SELECT 1 FROM organizacion_miembros WHERE organizacion_id = $1 AND rol = 'propietario' AND id <> $2`,
        [ctx.organizacionId, req.params.id]
      );
      if (otherOwners.length === 0) {
        return err(res, 'No puedes quitar al único propietario de la organización.', 400);
      }
    }

    await pool.query(`DELETE FROM organizacion_miembros WHERE id = $1`, [req.params.id]);
    invalidateUserCache(target[0].user_id);
    return ok(res, { removed: true });
  } catch (e: any) {
    return err(res, pgErr(e));
  }
}
