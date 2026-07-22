import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import pool from '../config/database';
import { getClerk, resolveUserRole } from './activityController';
import { UPLOADS_ORG_LOGOS_ROOT } from '../config/paths';

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

function nullIfEmpty(v: any): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
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

// GET /api/organizacion — organización activa (con sus datos de personalización) + todas las del usuario
export async function getMyOrganizacion(req: Request, res: Response) {
  try {
    const ctx = requireOrgContext(req, res);
    if (!ctx) return;
    const userId = (req as any).auth?.userId;
    const memberships = await resolveUserOrgMemberships(userId);
    const activa = memberships.find((m) => m.organizacionId === ctx.organizacionId) || memberships[0];

    let organizacion = null;
    if (activa) {
      const { rows } = await pool.query(
        `SELECT id, nombre, nif_cif, direccion_fiscal, logo_url, texto_legal_facturas FROM organizaciones WHERE id = $1`,
        [activa.organizacionId]
      );
      const org = rows[0];
      organizacion = org ? {
        id: org.id,
        nombre: org.nombre,
        nifCif: org.nif_cif,
        direccionFiscal: org.direccion_fiscal,
        logoUrl: org.logo_url,
        textoLegalFacturas: org.texto_legal_facturas,
      } : { id: activa.organizacionId, nombre: activa.organizacionNombre };
    }

    return ok(res, {
      organizacion,
      rol: activa?.rol || null,
      organizaciones: memberships.map((m) => ({ id: m.organizacionId, nombre: m.organizacionNombre, rol: m.rol })),
    });
  } catch (e: any) {
    return err(res, pgErr(e));
  }
}

// PUT /api/organizacion — editar nombre + datos de personalización (propietario/admin)
export async function updateMyOrganizacion(req: Request, res: Response) {
  try {
    const ctx = requireOrgContext(req, res);
    if (!ctx) return;
    if (ctx.organizacionRol !== 'propietario' && ctx.organizacionRol !== 'admin') {
      return err(res, 'Solo el propietario o un administrador pueden editar la organización.', 403);
    }
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return err(res, 'El nombre de la organización no puede estar vacío.', 400);
    const nifCif = nullIfEmpty(req.body?.nifCif);
    const direccionFiscal = nullIfEmpty(req.body?.direccionFiscal);
    const textoLegalFacturas = nullIfEmpty(req.body?.textoLegalFacturas);

    await pool.query(
      `UPDATE organizaciones
         SET nombre = $1, nif_cif = $2, direccion_fiscal = $3, texto_legal_facturas = $4, updated_at = NOW()
       WHERE id = $5`,
      [nombre, nifCif, direccionFiscal, textoLegalFacturas, ctx.organizacionId]
    );
    const userId = (req as any).auth?.userId;
    invalidateUserCache(userId);
    return ok(res, { id: ctx.organizacionId, nombre, nifCif, direccionFiscal, textoLegalFacturas });
  } catch (e: any) {
    return err(res, pgErr(e));
  }
}

// POST /api/organizacion — crear una organización nueva (el creador es propietario).
// Acepta ya de entrada los mismos datos de personalización que la edición
// (salvo el logo, que necesita que la organización exista primero para
// poder asociarle un fichero).
export async function createOrganizacion(req: Request, res: Response) {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) return err(res, 'No autenticado', 401);
    const nombre = String(req.body?.nombre || '').trim();
    if (!nombre) return err(res, 'El nombre de la organización no puede estar vacío.', 400);
    const nifCif = nullIfEmpty(req.body?.nifCif);
    const direccionFiscal = nullIfEmpty(req.body?.direccionFiscal);
    const textoLegalFacturas = nullIfEmpty(req.body?.textoLegalFacturas);

    const { rows } = await pool.query(
      `INSERT INTO organizaciones (nombre, nif_cif, direccion_fiscal, texto_legal_facturas)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, nif_cif, direccion_fiscal, texto_legal_facturas`,
      [nombre, nifCif, direccionFiscal, textoLegalFacturas]
    );
    const org = rows[0];
    await pool.query(
      `INSERT INTO organizacion_miembros (organizacion_id, user_id, rol) VALUES ($1, $2, 'propietario')`,
      [org.id, userId]
    );
    invalidateUserCache(userId);
    return ok(res, {
      id: org.id, nombre: org.nombre, rol: 'propietario',
      nifCif: org.nif_cif, direccionFiscal: org.direccion_fiscal, textoLegalFacturas: org.texto_legal_facturas,
    });
  } catch (e: any) {
    return err(res, pgErr(e));
  }
}

// POST /api/organizacion/logo — subir/reemplazar el logotipo (propietario/admin)
export async function uploadOrganizacionLogo(req: Request, res: Response) {
  try {
    const ctx = requireOrgContext(req, res);
    if (!ctx) return;
    if (ctx.organizacionRol !== 'propietario' && ctx.organizacionRol !== 'admin') {
      return err(res, 'Solo el propietario o un administrador pueden cambiar el logotipo.', 403);
    }
    const file = (req as any).file;
    if (!file) return err(res, 'No se recibió ninguna imagen.', 400);

    const { rows } = await pool.query(`SELECT logo_url FROM organizaciones WHERE id = $1`, [ctx.organizacionId]);
    const previousUrl = rows[0]?.logo_url as string | undefined;

    const logoUrl = `/uploads/org-logos/${file.filename}`;
    await pool.query(
      `UPDATE organizaciones SET logo_url = $1, updated_at = NOW() WHERE id = $2`,
      [logoUrl, ctx.organizacionId]
    );

    // Borrar el fichero anterior para no acumular logos huérfanos
    if (previousUrl && previousUrl.startsWith('/uploads/org-logos/')) {
      const previousPath = path.join(UPLOADS_ORG_LOGOS_ROOT, path.basename(previousUrl));
      fs.unlink(previousPath, () => {});
    }

    return ok(res, { logoUrl });
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

// GET /api/organizacion/impacto-borrado — cuenta lo que se perdería al
// borrar la organización activa, para mostrar advertencias reales (no
// genéricas) antes de dejar confirmar el borrado.
export async function getOrganizacionDeletionImpact(req: Request, res: Response) {
  try {
    const ctx = requireOrgContext(req, res);
    if (!ctx) return;
    if (ctx.organizacionRol !== 'propietario') {
      return err(res, 'Solo el propietario puede eliminar la organización.', 403);
    }

    const [clientes, expedientes, miembros, totalOrgs] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS n FROM entities WHERE organizacion_id = $1`, [ctx.organizacionId]),
      pool.query(`SELECT COUNT(*)::int AS n FROM expedientes WHERE organizacion_id = $1`, [ctx.organizacionId]),
      pool.query(`SELECT COUNT(*)::int AS n FROM organizacion_miembros WHERE organizacion_id = $1 AND user_id <> $2`, [ctx.organizacionId, (req as any).auth?.userId]),
      pool.query(`SELECT COUNT(*)::int AS n FROM organizaciones`),
    ]);

    return ok(res, {
      clientes: clientes.rows[0].n,
      expedientes: expedientes.rows[0].n,
      otrosMiembros: miembros.rows[0].n,
      esLaUnica: totalOrgs.rows[0].n <= 1,
    });
  } catch (e: any) {
    return err(res, pgErr(e));
  }
}

// DELETE /api/organizacion — elimina la organización activa por completo:
// clientes, expedientes, lotes de importación y miembros. Solo el
// propietario, y solo si escribe el nombre exacto de la organización --
// no hay forma de deshacerlo.
export async function deleteOrganizacionActiva(req: Request, res: Response) {
  const ctx = requireOrgContext(req, res);
  if (!ctx) return;
  if (ctx.organizacionRol !== 'propietario') {
    return err(res, 'Solo el propietario puede eliminar la organización.', 403);
  }

  const client = await pool.connect();
  try {
    const { rows: orgRows } = await client.query(`SELECT nombre FROM organizaciones WHERE id = $1`, [ctx.organizacionId]);
    if (!orgRows.length) return err(res, 'Organización no encontrada.', 404);
    const nombreReal = String(orgRows[0].nombre || '').trim();

    const confirmNombre = String(req.body?.confirmNombre || '').trim();
    if (!confirmNombre || confirmNombre !== nombreReal) {
      return err(res, 'El nombre no coincide. Escribe el nombre exacto de la organización para confirmar.', 400);
    }

    const { rows: totalOrgs } = await client.query(`SELECT COUNT(*)::int AS n FROM organizaciones`);
    if (totalOrgs[0].n <= 1) {
      return err(res, 'No puedes eliminar la única organización del sistema.', 400);
    }

    const { rows: memberRows } = await client.query(
      `SELECT user_id FROM organizacion_miembros WHERE organizacion_id = $1`,
      [ctx.organizacionId]
    );
    // client_invite_links se crea de forma perezosa (ver clientInviteController.ts) --
    // puede que todavía no exista, o que exista pero sin organizacion_id si nadie
    // ha usado "Alta con enlace" desde que se añadió esa columna (ensureTable()
    // solo la añade cuando alguien llama a esas rutas). Comprobar solo la tabla
    // no basta: hay que asegurar también la columna antes de filtrar por ella.
    const { rows: inviteTableRows } = await client.query(`SELECT to_regclass('client_invite_links') AS reg`);
    const hasInviteTable = Boolean(inviteTableRows[0]?.reg);
    if (hasInviteTable) {
      try {
        await client.query(`ALTER TABLE client_invite_links ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES organizaciones(id);`);
      } catch (_e: any) {}
    }

    await client.query('BEGIN');
    try {
      await client.query(`DELETE FROM entities WHERE organizacion_id = $1`, [ctx.organizacionId]);
      await client.query(`DELETE FROM expedientes WHERE organizacion_id = $1`, [ctx.organizacionId]);
      await client.query(`DELETE FROM entity_import_batches WHERE organizacion_id = $1`, [ctx.organizacionId]);
      await client.query(`DELETE FROM expediente_import_batches WHERE organizacion_id = $1`, [ctx.organizacionId]);
      if (hasInviteTable) {
        await client.query(`DELETE FROM client_invite_links WHERE organizacion_id = $1`, [ctx.organizacionId]);
      }
      // organizacion_miembros cae en cascada al borrar la organización (FK ON DELETE CASCADE)
      await client.query(`DELETE FROM organizaciones WHERE id = $1`, [ctx.organizacionId]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }

    for (const m of memberRows) invalidateUserCache(m.user_id);

    return ok(res, { deleted: true });
  } catch (e: any) {
    return err(res, pgErr(e));
  } finally {
    client.release();
  }
}
