import { Request, Response } from 'express';
import pool from '../config/database';
import { randomBytes } from 'crypto';
import { sendClientWelcomeEmail } from '../utils/clientWelcomeEmail';

function userId(req: Request) { return (req as any).auth?.userId || 'SYSTEM'; }
function userName(req: Request) { return (req as any).auth?.firstName || (req as any).auth?.name || 'Usuario'; }
const ok  = (res: Response, data: any) => res.json({ success: true, data });
const err = (res: Response, msg: string, s = 500) => res.status(s).json({ success: false, error: msg });

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_invite_links (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      token       TEXT        UNIQUE NOT NULL,
      created_by  TEXT        NOT NULL,
      creator_name TEXT       NOT NULL DEFAULT '',
      label       TEXT        NOT NULL DEFAULT '',
      status      TEXT        NOT NULL DEFAULT 'pendiente'
                              CHECK (status IN ('pendiente','completado','expirado')),
      client_id   UUID        REFERENCES entities(id) ON DELETE SET NULL,
      expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      used_at     TIMESTAMPTZ
    )
  `);
  // Esta tabla no pasa por migrations.ts (se crea perezosamente aquí), así
  // que la columna de organización se añade y respalda de la misma forma
  // que migrations.ts hace para entities/expedientes: nullable, backfill a
  // la organización más antigua, y luego NOT NULL.
  try {
    await pool.query(`ALTER TABLE client_invite_links ADD COLUMN IF NOT EXISTS organizacion_id UUID REFERENCES organizaciones(id);`);
    await pool.query(`
      UPDATE client_invite_links SET organizacion_id = (SELECT id FROM organizaciones ORDER BY created_at LIMIT 1)
      WHERE organizacion_id IS NULL
    `);
    await pool.query(`ALTER TABLE client_invite_links ALTER COLUMN organizacion_id SET NOT NULL;`);
  } catch (_e: any) {}
}

// POST /api/clientes/invites  — genera un nuevo enlace
export async function createInvite(req: Request, res: Response) {
  const uid  = userId(req);
  const organizacionId = (req as any).organizacionId;
  if (!uid) return err(res, 'No autenticado', 401);
  if (!organizacionId) return err(res, 'No se pudo determinar la organización activa', 400);
  try {
    await ensureTable();
    const token  = randomBytes(18).toString('base64url');
    const label  = (req.body?.label || '').trim();
    const uname  = userName(req);
    await pool.query(
      `INSERT INTO client_invite_links (token, created_by, creator_name, label, organizacion_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [token, uid, uname, label, organizacionId],
    );
    return ok(res, { token });
  } catch (e: any) {
    return err(res, e.message);
  }
}

// GET /api/clientes/invites  — lista los enlaces de la organización activa
export async function listInvites(req: Request, res: Response) {
  const uid = userId(req);
  const organizacionId = (req as any).organizacionId;
  if (!uid) return err(res, 'No autenticado', 401);
  if (!organizacionId) return err(res, 'No se pudo determinar la organización activa', 400);
  try {
    await ensureTable();
    const { rows } = await pool.query(
      `SELECT l.*, e.first_name || COALESCE(' ' || e.last_name, '') AS client_name
       FROM client_invite_links l
       LEFT JOIN entities e ON e.id = l.client_id
       WHERE l.organizacion_id = $1
       ORDER BY l.created_at DESC
       LIMIT 100`,
      [organizacionId],
    );
    return ok(res, rows);
  } catch (e: any) {
    return err(res, e.message);
  }
}

// DELETE /api/clientes/invites/:id
export async function deleteInvite(req: Request, res: Response) {
  const uid = userId(req);
  const organizacionId = (req as any).organizacionId;
  if (!uid) return err(res, 'No autenticado', 401);
  if (!organizacionId) return err(res, 'No se pudo determinar la organización activa', 400);
  try {
    await pool.query(
      `DELETE FROM client_invite_links WHERE id=$1 AND organizacion_id=$2`,
      [req.params.id, organizacionId],
    );
    return ok(res, { deleted: true });
  } catch (e: any) {
    return err(res, e.message);
  }
}

// GET /api/public/cliente-form/:token  — comprueba el token (público)
export async function getPublicForm(req: Request, res: Response) {
  try {
    await ensureTable();
    const { rows } = await pool.query(
      `SELECT id, status, label, creator_name, expires_at FROM client_invite_links WHERE token=$1`,
      [req.params.token],
    );
    if (!rows.length) return err(res, 'Enlace no válido', 404);
    const link = rows[0];
    if (link.status !== 'pendiente') return err(res, 'Este enlace ya ha sido utilizado', 410);
    if (new Date(link.expires_at) < new Date()) return err(res, 'Este enlace ha expirado', 410);
    return ok(res, { label: link.label, creator_name: link.creator_name });
  } catch (e: any) {
    return err(res, e.message);
  }
}

// POST /api/public/cliente-form/:token  — envía el formulario (público)
export async function submitPublicForm(req: Request, res: Response) {
  try {
    await ensureTable();
    const { rows } = await pool.query(
      `SELECT id, status, created_by, expires_at, organizacion_id FROM client_invite_links WHERE token=$1`,
      [req.params.token],
    );
    if (!rows.length) return err(res, 'Enlace no válido', 404);
    const link = rows[0];
    if (link.status !== 'pendiente') return err(res, 'Este enlace ya ha sido utilizado', 410);
    if (new Date(link.expires_at) < new Date()) return err(res, 'Este enlace ha expirado', 410);

    const { first_name, last_name, email, telefono, nif_cif, observaciones } = req.body;
    if (!first_name?.trim()) return err(res, 'El nombre es obligatorio', 400);
    const nifTrimmed = (nif_cif || '').trim() || null;

    // Crear la entidad (cliente). Nombres de columna reales de "entities"
    // (antes este INSERT usaba entity_type/telefono/observaciones, que no
    // existen en la tabla -- por eso este formulario público nunca llegaba
    // a crear el cliente).
    let clientId: string;
    try {
      const { rows: ent } = await pool.query(
        `INSERT INTO entities
           (first_name, last_name, email, phone_1, nif_cif,
            type, created_by, organizacion_id)
         VALUES ($1,$2,$3,$4,$5,'CLIENTE',$6,$7)
         RETURNING id`,
        [
          first_name.trim(),
          (last_name || '').trim() || null,
          (email || '').trim() || null,
          (telefono || '').trim() || null,
          nifTrimmed,
          link.created_by,
          link.organizacion_id,
        ],
      );
      clientId = ent[0].id;
    } catch (e: any) {
      // idx_entities_org_nif_cif: ya existe un cliente con ese NIF/CIF en esta
      // organización (p.ej. de alguien que ya se dio de alta antes por otra
      // vía). En vez de reventar con el error técnico de Postgres delante del
      // cliente que rellena el formulario, reutilizamos esa ficha y
      // completamos los huecos con lo que acaba de mandar.
      if (e.code === '23505' && nifTrimmed) {
        const { rows: existing } = await pool.query(
          `SELECT id FROM entities WHERE organizacion_id = $1 AND nif_cif = $2 LIMIT 1`,
          [link.organizacion_id, nifTrimmed],
        );
        if (!existing.length) throw e;
        clientId = existing[0].id;
        await pool.query(
          `UPDATE entities SET
             last_name = COALESCE(NULLIF(last_name, ''), $1),
             email     = COALESCE(NULLIF(email, ''), $2),
             phone_1   = COALESCE(NULLIF(phone_1, ''), $3)
           WHERE id = $4`,
          [(last_name || '').trim() || null, (email || '').trim() || null, (telefono || '').trim() || null, clientId],
        );
      } else {
        throw e;
      }
    }

    // Foto del DNI, si el cliente la adjuntó en el formulario (opcional --
    // ver uploadDNI.single('dni_image') en la ruta). Mismo patrón que el
    // alta manual desde el panel. No se pisa una foto que ya hubiera (caso
    // de ficha reutilizada arriba).
    const dniFile = (req as any).file as { filename: string } | undefined;
    if (dniFile) {
      try {
        await pool.query(
          `UPDATE entities SET dni_image_url = $1 WHERE id = $2 AND (dni_image_url IS NULL OR dni_image_url = '')`,
          [`/uploads/dnis/${dniFile.filename}`, clientId],
        );
      } catch (_e) { /* best effort, no bloquea el alta */ }
    }

    // "observaciones" no es una columna de entities -- se guarda como nota
    // del cliente recién creado, igual que hace el resto de la app.
    const observacionesTrimmed = (observaciones || '').trim();
    if (observacionesTrimmed) {
      await pool.query(
        `INSERT INTO notes (client_id, content, category, created_by)
         VALUES ($1, $2, 'general', $3)`,
        [clientId, observacionesTrimmed, link.created_by],
      );
    }

    // Marcar enlace como completado
    await pool.query(
      `UPDATE client_invite_links
       SET status='completado', client_id=$1, used_at=NOW()
       WHERE id=$2`,
      [clientId, link.id],
    );

    // Correo de confirmación al cliente (fire-and-forget, ver clientWelcomeEmail.ts)
    void sendClientWelcomeEmail(link.organizacion_id, {
      email: (email || '').trim() || null,
      first_name: first_name.trim(),
      last_name: (last_name || '').trim() || null,
    });

    return ok(res, { message: 'Datos recibidos correctamente', client_id: clientId });
  } catch (e: any) {
    console.error('❌ submitPublicForm:', e);
    // Nunca mandar el mensaje crudo de Postgres a un formulario público.
    if (e.code === '23505') {
      return err(res, 'Ya existe un cliente registrado con estos datos. Ponte en contacto con el despacho.', 409);
    }
    return err(res, 'No se pudo enviar el formulario. Inténtalo de nuevo o contacta con el despacho.', 500);
  }
}
