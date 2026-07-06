import { Request, Response } from 'express';
import path from 'path';
import pool from '../config/database';

// ── helpers ──────────────────────────────────────────────────────────────────
const ok  = (res: Response, data: any, status = 200) => res.status(status).json({ success: true,  data });
const err = (res: Response, msg: string, status = 500) => res.status(status).json({ success: false, error: msg });
const resolveAuthDisplayName = (auth: any) => {
  const claims = auth?.sessionClaims || {};
  const nameParts = [claims.first_name, claims.last_name].filter(Boolean);
  const resolved = [
    claims.name,
    nameParts.length ? nameParts.join(' ') : null,
    claims.username,
    claims.email,
  ].find(value => typeof value === 'string' && value.trim());
  return resolved || 'Sin nombre';
};
const unreadCountExpr = (userParam = '$1') => `
  (SELECT COUNT(*) FROM chat_mensajes msg
    WHERE msg.canal_id = c.id
      AND msg.deleted_at IS NULL
      AND msg.user_id != ${userParam}
      AND (m.last_read_at IS NULL OR msg.created_at > m.last_read_at)
  )::int
`;

// ── Canales ───────────────────────────────────────────────────────────────────

export async function getCanales(req: Request, res: Response) {
  const userId   = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  try {
    const { rows } = await pool.query(`
      SELECT
        c.id, c.nombre, c.descripcion, c.tipo,
        c.expediente_id, c.cliente_id, c.archivado, c.created_at,
        m.last_read_at, m.role_label, m.status AS my_status,
        ${unreadCountExpr('$1')} AS no_leidos,
        (SELECT contenido FROM chat_mensajes msg
          WHERE msg.canal_id = c.id AND msg.deleted_at IS NULL
          ORDER BY msg.created_at DESC LIMIT 1
        ) AS ultimo_mensaje,
        (SELECT user_name FROM chat_mensajes msg
          WHERE msg.canal_id = c.id AND msg.deleted_at IS NULL
          ORDER BY msg.created_at DESC LIMIT 1
        ) AS ultimo_mensaje_autor,
        (SELECT created_at FROM chat_mensajes msg
          WHERE msg.canal_id = c.id AND msg.deleted_at IS NULL
          ORDER BY msg.created_at DESC LIMIT 1
        ) AS ultimo_mensaje_at,
        (SELECT COUNT(*) FROM chat_miembros WHERE canal_id = c.id)::int AS total_miembros,
        (SELECT dm.user_id
          FROM chat_miembros dm
          WHERE dm.canal_id = c.id AND dm.user_id != $1
          ORDER BY dm.joined_at ASC
          LIMIT 1
        ) AS dm_target_user_id,
        (SELECT dm.user_name
          FROM chat_miembros dm
          WHERE dm.canal_id = c.id AND dm.user_id != $1
          ORDER BY dm.joined_at ASC
          LIMIT 1
        ) AS dm_target_user_name,
        (SELECT dm.avatar_url
          FROM chat_miembros dm
          WHERE dm.canal_id = c.id AND dm.user_id != $1
          ORDER BY dm.joined_at ASC
          LIMIT 1
        ) AS dm_target_avatar_url
      FROM chat_canales c
      JOIN chat_miembros m ON m.canal_id = c.id AND m.user_id = $1
      WHERE c.archivado = false
      ORDER BY COALESCE(c.updated_at, c.created_at) DESC, c.nombre ASC
    `, [userId]);

    return ok(res, rows);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function createCanal(req: Request, res: Response) {
  const userId   = (req as any).auth?.userId;
  const userName = resolveAuthDisplayName((req as any).auth);
  const avatarUrl = (req as any).auth?.sessionClaims?.picture || null;
  if (!userId) return err(res, 'No autenticado', 401);
  const { nombre, descripcion, tipo = 'publico', expediente_id, cliente_id } = req.body;
  if (!nombre?.trim()) return err(res, 'Nombre requerido', 400);
  try {
    const { rows } = await pool.query(`
      INSERT INTO chat_canales (nombre, descripcion, tipo, expediente_id, cliente_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [nombre.trim(), descripcion || null, tipo, expediente_id || null, cliente_id || null, userId]);
    const canal = rows[0];
    await pool.query(`
      INSERT INTO chat_miembros (canal_id, user_id, user_name, avatar_url, role, role_label, last_read_at)
      VALUES ($1, $2, $3, $4, 'admin', 'Administrador', NOW())
      ON CONFLICT (canal_id, user_id) DO NOTHING
    `, [canal.id, userId, userName, avatarUrl]);
    return ok(res, canal, 201);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function updateCanal(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const { nombre, descripcion } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE chat_canales SET nombre = COALESCE($1, nombre), descripcion = COALESCE($2, descripcion), updated_at = NOW()
      WHERE id = $3 RETURNING *
    `, [nombre?.trim() || null, descripcion ?? null, id]);
    if (!rows.length) return err(res, 'Canal no encontrado', 404);
    return ok(res, rows[0]);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function archivarCanal(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    await pool.query(`UPDATE chat_canales SET archivado = true WHERE id = $1`, [id]);
    return ok(res, { id });
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function marcarLeido(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    await pool.query(`UPDATE chat_miembros SET last_read_at = NOW() WHERE canal_id = $1 AND user_id = $2`, [id, userId]);
    return ok(res, { ok: true });
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function marcarTodoLeido(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  try {
    await pool.query(`UPDATE chat_miembros SET last_read_at = NOW() WHERE user_id = $1`, [userId]);
    return ok(res, { ok: true });
  } catch (e: any) {
    return err(res, e.message);
  }
}

/** GET /api/chat/canales/:id/miembros — miembros del canal con perfil */
export async function getCanalMiembros(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`
      SELECT user_id, user_name, avatar_url, role, role_label, status, joined_at, last_read_at
      FROM chat_miembros WHERE canal_id = $1
      ORDER BY role DESC, user_name ASC
    `, [id]);
    return ok(res, rows);
  } catch (e: any) {
    return err(res, e.message);
  }
}

// ── Status y Rol ──────────────────────────────────────────────────────────────

/** PUT /api/chat/me/status */
export async function updateMyStatus(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { status } = req.body;
  const valid = ['disponible', 'ocupado', 'no_molestar', 'en_juicio', 'en_reunion', 'ausente'];
  if (!valid.includes(status)) return err(res, 'Status no válido', 400);
  try {
    await pool.query(`UPDATE chat_miembros SET status = $1 WHERE user_id = $2`, [status, userId]);
    return ok(res, { status });
  } catch (e: any) {
    return err(res, e.message);
  }
}

/** PUT /api/chat/me/role */
export async function updateMyRole(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { role_label, canal_id } = req.body;
  if (!role_label?.trim()) return err(res, 'Role requerido', 400);
  try {
    if (canal_id) {
      await pool.query(`UPDATE chat_miembros SET role_label = $1 WHERE user_id = $2 AND canal_id = $3`, [role_label, userId, canal_id]);
    } else {
      await pool.query(`UPDATE chat_miembros SET role_label = $1 WHERE user_id = $2`, [role_label, userId]);
    }
    return ok(res, { role_label });
  } catch (e: any) {
    return err(res, e.message);
  }
}

// ── Mensajes ──────────────────────────────────────────────────────────────────

export async function getMensajes(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const { before, since, limit = '60' } = req.query as Record<string, string>;
  const lim = Math.min(parseInt(limit) || 60, 100);
  try {
    let query: string;
    let params: any[];
    const SEL = `
      SELECT m.*,
        (SELECT json_agg(json_build_object('emoji', r.emoji, 'user_id', r.user_id, 'user_name', r.user_name))
         FROM chat_reacciones r WHERE r.mensaje_id = m.id
        ) AS reacciones,
        (SELECT row_to_json(r2.*) FROM chat_mensajes r2 WHERE r2.id = m.reply_to_id) AS reply_to
      FROM chat_mensajes m
    `;
    if (since) {
      query = `${SEL} WHERE m.canal_id = $1 AND m.created_at > $2 AND m.deleted_at IS NULL ORDER BY m.created_at ASC LIMIT $3`;
      params = [id, since, lim];
    } else if (before) {
      query = `${SEL} WHERE m.canal_id = $1 AND m.created_at < (SELECT created_at FROM chat_mensajes WHERE id = $2) AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT $3`;
      params = [id, before, lim];
    } else {
      query = `${SEL} WHERE m.canal_id = $1 AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT $2`;
      params = [id, lim];
    }
    const { rows } = await pool.query(query, params);
    const msgs = before ? rows.reverse() : since ? rows : rows.reverse();
    return ok(res, msgs);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function sendMensaje(req: Request, res: Response) {
  const userId   = (req as any).auth?.userId;
  const userName = resolveAuthDisplayName((req as any).auth);
  const avatarUrl = (req as any).auth?.sessionClaims?.picture || null;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const { contenido, tipo = 'texto', reply_to_id, gif_url, image_url, file_url, file_name, file_mime } = req.body;
  if (!contenido?.trim() && !gif_url && !image_url && !file_url) return err(res, 'Contenido vacío', 400);
  try {
    const normalizedType = file_url ? 'archivo' : image_url ? 'imagen' : gif_url ? 'gif' : tipo;
    const fallbackContent = gif_url ? 'GIF' : image_url ? 'Imagen' : file_url ? (file_name || 'Archivo') : '';
    const { rows } = await pool.query(`
      INSERT INTO chat_mensajes (canal_id, user_id, user_name, avatar_url, contenido, tipo, reply_to_id, gif_url, image_url, file_url, file_name, file_mime)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *
    `, [id, userId, userName, avatarUrl, (contenido || '').trim() || fallbackContent, normalizedType, reply_to_id || null, gif_url || null, image_url || null, file_url || null, file_name || null, file_mime || null]);
    const msg: any = { ...rows[0], reacciones: null, reply_to: null };
    if (reply_to_id) {
      const { rows: r } = await pool.query(`SELECT * FROM chat_mensajes WHERE id = $1`, [reply_to_id]);
      msg.reply_to = r[0] || null;
    }
    // Actualizar last_read_at del propio autor
    await pool.query(`UPDATE chat_miembros SET last_read_at = NOW() WHERE canal_id = $1 AND user_id = $2`, [id, userId]);
    await pool.query(`DELETE FROM chat_typing_status WHERE canal_id = $1 AND user_id = $2`, [id, userId]);
    // Actualizar avatar en miembros
    await pool.query(`UPDATE chat_miembros SET avatar_url = COALESCE($1, avatar_url), user_name = $2 WHERE canal_id = $3 AND user_id = $4`,
      [avatarUrl, userName, id, userId]);
    await pool.query(`UPDATE chat_canales SET updated_at = NOW() WHERE id = $1`, [id]);
    return ok(res, msg, 201);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function uploadChatImage(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return err(res, 'Imagen requerida', 400);
  const imageUrl = path.posix.join('/uploads', 'chat', file.filename);
  return ok(res, {
    image_url: imageUrl,
    original_name: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  }, 201);
}

export async function uploadChatFile(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return err(res, 'Archivo requerido', 400);
  const fileUrl = path.posix.join('/uploads', 'chat', 'files', file.filename);
  return ok(res, {
    file_url: fileUrl,
    file_name: file.originalname,
    file_mime: file.mimetype,
    file_size: file.size,
  }, 201);
}

// ── Sesiones de expediente ────────────────────────────────────────────────────

export async function getSesionExpediente(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM chat_expediente_sesiones WHERE canal_id = $1 AND cerrado_at IS NULL ORDER BY iniciado_at DESC LIMIT 1`,
      [id]
    );
    return ok(res, rows[0] || null);
  } catch (e: any) { return err(res, e.message); }
}

export async function iniciarSesionExpediente(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const { expediente_id, expediente_ref } = req.body;
  if (!expediente_id) return err(res, 'expediente_id requerido', 400);
  try {
    // Cerrar sesión activa previa si existe
    await pool.query(
      `UPDATE chat_expediente_sesiones SET cerrado_at = NOW() WHERE canal_id = $1 AND cerrado_at IS NULL`,
      [id]
    );
    const { rows } = await pool.query(
      `INSERT INTO chat_expediente_sesiones (canal_id, expediente_id, expediente_ref, iniciado_por)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, expediente_id, expediente_ref || null, userId]
    );
    return ok(res, rows[0], 201);
  } catch (e: any) { return err(res, e.message); }
}

export async function cerrarSesionExpediente(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE chat_expediente_sesiones SET cerrado_at = NOW() WHERE canal_id = $1 AND cerrado_at IS NULL`,
      [id]
    );
    return ok(res, { ok: true });
  } catch (e: any) { return err(res, e.message); }
}

export async function getConversacionesExpediente(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    const { rows: sesiones } = await pool.query(
      `SELECT s.*, c.nombre AS canal_nombre, c.tipo AS canal_tipo
       FROM chat_expediente_sesiones s
       JOIN chat_canales c ON c.id = s.canal_id
       WHERE s.expediente_id = $1
       ORDER BY s.iniciado_at DESC`,
      [id]
    );
    // Para cada sesión, traer un snippet del primer y último mensaje
    const systemUsers = await getCachedSystemUsers();
    const clerkNames = new Map(
      systemUsers
        .filter((u: any) => u?.user_id)
        .map((u: any) => [u.user_id, u.user_name])
    );
    const enriched = await Promise.all(sesiones.map(async (s: any) => {
      const { rows: memberRows } = await pool.query(
        `SELECT user_id, user_name
         FROM chat_miembros
         WHERE canal_id = $1
         ORDER BY joined_at ASC NULLS LAST, user_name ASC`,
        [s.canal_id]
      );
      const memberNames = Array.from(
        new Set(
          memberRows
            .map((member: any) => {
              const candidates = [
                clerkNames.get(member.user_id),
                member.user_name,
              ].map((value: any) => (typeof value === 'string' ? value.trim() : ''));
              return candidates.find(value => value && value.toLowerCase() !== 'sin nombre') || '';
            })
            .filter(Boolean)
        )
      );
      const canalNombreResuelto =
        s.canal_tipo === 'dm' && memberNames.length
          ? memberNames.join(' · ')
          : s.canal_nombre;
      const iniciadoPorNombre =
        [
          clerkNames.get(s.iniciado_por),
          ...memberRows
            .filter((member: any) => member.user_id === s.iniciado_por)
            .map((member: any) => member.user_name),
        ]
          .map((value: any) => (typeof value === 'string' ? value.trim() : ''))
          .find(value => value && value.toLowerCase() !== 'sin nombre') || 'Sin nombre';

      const params = [s.canal_id, s.iniciado_at];
      let cutoffSql = '';
      if (s.cerrado_at) {
        params.push(s.cerrado_at);
        cutoffSql = `AND m.created_at <= $3`;
      }
      const { rows: msgs } = await pool.query(
        `SELECT
           m.id,
           m.user_id,
           m.user_name,
           m.contenido,
           m.tipo,
           m.image_url,
           m.file_url,
           m.file_name,
           m.gif_url,
           m.created_at,
           cm.user_name AS member_user_name
         FROM chat_mensajes m
         LEFT JOIN LATERAL (
           SELECT user_name
           FROM chat_miembros cm
           WHERE cm.canal_id = m.canal_id AND cm.user_id = m.user_id
           ORDER BY cm.joined_at DESC NULLS LAST
           LIMIT 1
         ) cm ON TRUE
         WHERE m.canal_id = $1 AND m.created_at >= $2 ${cutoffSql} AND m.deleted_at IS NULL
         ORDER BY m.created_at ASC`,
        params
      );
      return {
        ...s,
        canal_nombre: canalNombreResuelto,
        iniciado_por_nombre: iniciadoPorNombre,
        total_mensajes: msgs.length,
        mensajes: msgs.map((msg: any) => {
          const authorCandidates = [
            clerkNames.get(msg.user_id),
            msg.member_user_name,
            msg.user_name,
          ].map((value: any) => (typeof value === 'string' ? value.trim() : ''));
          const autor_nombre = authorCandidates.find(value => value && value.toLowerCase() !== 'sin nombre') || 'Sin nombre';
          return { ...msg, autor_nombre };
        }),
      };
    }));
    return ok(res, enriched);
  } catch (e: any) { return err(res, e.message); }
}

export async function getTypingStatus(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    await pool.query(
      `DELETE FROM chat_typing_status WHERE canal_id = $1 AND updated_at < NOW() - INTERVAL '10 seconds'`,
      [id]
    );
    const { rows } = await pool.query(`
      SELECT ts.user_id, ts.user_name, ts.avatar_url
      FROM chat_typing_status ts
      JOIN chat_miembros m ON m.canal_id = ts.canal_id AND m.user_id = ts.user_id
      WHERE ts.canal_id = $1
        AND ts.user_id != $2
        AND ts.updated_at >= NOW() - INTERVAL '6 seconds'
      ORDER BY ts.updated_at DESC
    `, [id, userId]);
    return ok(res, rows);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function updateTypingStatus(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  const userName = resolveAuthDisplayName((req as any).auth);
  const avatarUrl = (req as any).auth?.sessionClaims?.picture || null;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const { typing } = req.body as { typing?: boolean };
  try {
    const member = await pool.query(
      `SELECT 1 FROM chat_miembros WHERE canal_id = $1 AND user_id = $2 LIMIT 1`,
      [id, userId]
    );
    if (!member.rows.length) return err(res, 'No eres miembro de este canal', 403);

    if (!typing) {
      await pool.query(`DELETE FROM chat_typing_status WHERE canal_id = $1 AND user_id = $2`, [id, userId]);
      return ok(res, { typing: false });
    }

    await pool.query(`
      INSERT INTO chat_typing_status (canal_id, user_id, user_name, avatar_url, updated_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (canal_id, user_id)
      DO UPDATE SET user_name = EXCLUDED.user_name, avatar_url = EXCLUDED.avatar_url, updated_at = NOW()
    `, [id, userId, userName, avatarUrl]);
    return ok(res, { typing: true });
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function editMensaje(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const { contenido } = req.body;
  if (!contenido?.trim()) return err(res, 'Contenido vacío', 400);
  try {
    const { rows } = await pool.query(`
      UPDATE chat_mensajes SET contenido = $1, editado = true, updated_at = NOW()
      WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING *
    `, [contenido.trim(), id, userId]);
    if (!rows.length) return err(res, 'Mensaje no encontrado o sin permisos', 404);
    return ok(res, rows[0]);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function deleteMensaje(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, canal_id, user_id FROM chat_mensajes WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!rows.length) return err(res, 'Mensaje no encontrado', 404);

    const message = rows[0];
    if (message.user_id !== userId) {
      const { rows: membershipRows } = await pool.query(
        `SELECT role FROM chat_miembros WHERE canal_id = $1 AND user_id = $2`,
        [message.canal_id, userId]
      );
      if (membershipRows[0]?.role !== 'admin') {
        return err(res, 'Sin permisos para borrar este mensaje', 403);
      }
    }

    await pool.query(`UPDATE chat_mensajes SET deleted_at = NOW() WHERE id = $1`, [id]);
    return ok(res, { id });
  } catch (e: any) {
    return err(res, e.message);
  }
}

// ── Reacciones ────────────────────────────────────────────────────────────────

export async function toggleReaccion(req: Request, res: Response) {
  const userId   = (req as any).auth?.userId;
  const userName = resolveAuthDisplayName((req as any).auth);
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const { emoji } = req.body;
  if (!emoji) return err(res, 'Emoji requerido', 400);
  try {
    const existing = await pool.query(`SELECT id FROM chat_reacciones WHERE mensaje_id = $1 AND user_id = $2 AND emoji = $3`, [id, userId, emoji]);
    if (existing.rows.length) {
      await pool.query(`DELETE FROM chat_reacciones WHERE id = $1`, [existing.rows[0].id]);
      return ok(res, { action: 'removed', emoji });
    } else {
      await pool.query(`INSERT INTO chat_reacciones (mensaje_id, user_id, user_name, emoji) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [id, userId, userName, emoji]);
      return ok(res, { action: 'added', emoji });
    }
  } catch (e: any) {
    return err(res, e.message);
  }
}

// ── Fijar mensajes ────────────────────────────────────────────────────────────

export async function getFijados(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    const { rows } = await pool.query(`
      SELECT f.*, m.contenido, m.user_name, m.avatar_url, m.gif_url, m.image_url, m.tipo, m.created_at AS msg_created_at
      FROM chat_fijados f JOIN chat_mensajes m ON m.id = f.mensaje_id
      WHERE f.canal_id = $1 ORDER BY f.fijado_at DESC
    `, [id]);
    return ok(res, rows);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function fijarMensaje(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id, mensajeId } = req.params;
  try {
    await pool.query(`INSERT INTO chat_fijados (canal_id, mensaje_id, fijado_por) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [id, mensajeId, userId]);
    return ok(res, { canal_id: id, mensaje_id: mensajeId });
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function desfijarMensaje(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id, mensajeId } = req.params;
  try {
    await pool.query(`DELETE FROM chat_fijados WHERE canal_id = $1 AND mensaje_id = $2`, [id, mensajeId]);
    return ok(res, { id });
  } catch (e: any) {
    return err(res, e.message);
  }
}

// ── Búsqueda ──────────────────────────────────────────────────────────────────

export async function getFavoritos(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { canal_id } = req.query as Record<string, string>;
  try {
    const params: any[] = [userId];
    const canalFilter = canal_id ? 'AND f.canal_id = $2' : '';
    if (canal_id) params.push(canal_id);
    const { rows } = await pool.query(`
      SELECT
        f.*,
        m.contenido,
        m.user_id,
        m.user_name,
        m.avatar_url,
        m.gif_url,
        m.image_url,
        m.tipo,
        m.created_at AS msg_created_at
      FROM chat_favoritos f
      JOIN chat_mensajes m ON m.id = f.mensaje_id
      WHERE f.user_id = $1 ${canalFilter}
      ORDER BY f.favorito_at DESC
    `, params);
    return ok(res, rows);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function toggleFavorito(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    const existing = await pool.query(
      `SELECT id FROM chat_favoritos WHERE user_id = $1 AND mensaje_id = $2`,
      [userId, id]
    );
    if (existing.rows.length) {
      await pool.query(`DELETE FROM chat_favoritos WHERE user_id = $1 AND mensaje_id = $2`, [userId, id]);
      return ok(res, { action: 'removed', mensaje_id: id });
    }

    const message = await pool.query(`SELECT canal_id FROM chat_mensajes WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!message.rows.length) return err(res, 'Mensaje no encontrado', 404);

    const canalId = message.rows[0].canal_id;
    await pool.query(`
      INSERT INTO chat_favoritos (user_id, canal_id, mensaje_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, mensaje_id) DO NOTHING
    `, [userId, canalId, id]);
    return ok(res, { action: 'added', mensaje_id: id, canal_id: canalId });
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function buscarMensajes(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { q, canal_id } = req.query as Record<string, string>;
  if (!q?.trim()) return ok(res, []);
  try {
    const params: any[] = [`%${q.trim()}%`, userId];
    let canalFilter = '';
    if (canal_id) { canalFilter = `AND m.canal_id = $3`; params.push(canal_id); }
    const { rows } = await pool.query(`
      SELECT m.*, c.nombre AS canal_nombre
      FROM chat_mensajes m
      JOIN chat_canales  c  ON c.id = m.canal_id
      JOIN chat_miembros mb ON mb.canal_id = c.id AND mb.user_id = $2
      WHERE m.contenido ILIKE $1 AND m.deleted_at IS NULL ${canalFilter}
      ORDER BY m.created_at DESC LIMIT 50
    `, params);
    return ok(res, rows);
  } catch (e: any) {
    return err(res, e.message);
  }
}

// ── Usuarios / DMs ────────────────────────────────────────────────────────────

export async function getMiembrosGlobal(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (user_id) user_id, user_name, avatar_url, role_label, status
      FROM chat_miembros WHERE user_id != $1
      ORDER BY user_id, user_name ASC
    `, [userId]);
    return ok(res, rows);
  } catch (e: any) {
    return err(res, e.message);
  }
}

export async function getOrCreateDM(req: Request, res: Response) {
  const userId   = (req as any).auth?.userId;
  const userName = resolveAuthDisplayName((req as any).auth);
  const avatarUrl = (req as any).auth?.sessionClaims?.picture || null;
  if (!userId) return err(res, 'No autenticado', 401);
  const { target_user_id, target_user_name, target_avatar_url } = req.body;
  if (!target_user_id) return err(res, 'target_user_id requerido', 400);
  try {
    const { rows: existing } = await pool.query(`
      SELECT c.* FROM chat_canales c
      WHERE c.tipo = 'directo'
        AND EXISTS (SELECT 1 FROM chat_miembros m WHERE m.canal_id = c.id AND m.user_id = $1)
        AND EXISTS (SELECT 1 FROM chat_miembros m WHERE m.canal_id = c.id AND m.user_id = $2)
      LIMIT 1
    `, [userId, target_user_id]);
    if (existing.length) {
      return ok(res, {
        ...existing[0],
        dm_target_user_id: target_user_id,
        dm_target_user_name: target_user_name || 'Sin nombre',
        dm_target_avatar_url: target_avatar_url || null,
      });
    }
    const nombre = [userName, target_user_name || 'Sin nombre'].sort().join(' · ');
    const { rows } = await pool.query(`INSERT INTO chat_canales (nombre, tipo, created_by) VALUES ($1, 'directo', $2) RETURNING *`, [nombre, userId]);
    const canal = rows[0];
    await pool.query(`
      INSERT INTO chat_miembros (canal_id, user_id, user_name, avatar_url, role, last_read_at)
      VALUES ($1, $2, $3, $4, 'admin', NOW()), ($1, $5, $6, $7, 'miembro', NOW())
      ON CONFLICT (canal_id, user_id) DO NOTHING
    `, [canal.id, userId, userName, avatarUrl, target_user_id, target_user_name || 'Sin nombre', target_avatar_url || null]);
    return ok(res, {
      ...canal,
      dm_target_user_id: target_user_id,
      dm_target_user_name: target_user_name || 'Sin nombre',
      dm_target_avatar_url: target_avatar_url || null,
    }, 201);
  } catch (e: any) {
    return err(res, e.message);
  }
}

// ── Gestión de miembros del canal ─────────────────────────────────────────────

/** GET /api/chat/canales/disponibles — canales públicos a los que el user NO pertenece */
export async function getCanalesDisponibles(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.nombre, c.descripcion, c.tipo, c.created_at,
        (SELECT COUNT(*) FROM chat_miembros WHERE canal_id = c.id)::int AS total_miembros
      FROM chat_canales c
      WHERE c.tipo = 'publico' AND c.archivado = false
        AND NOT EXISTS (SELECT 1 FROM chat_miembros m WHERE m.canal_id = c.id AND m.user_id = $1)
      ORDER BY total_miembros DESC, c.nombre ASC
    `, [userId]);
    return ok(res, rows);
  } catch (e: any) {
    return err(res, e.message);
  }
}

/** POST /api/chat/canales/:id/join — unirse a un canal público */
export async function joinCanal(req: Request, res: Response) {
  const userId   = (req as any).auth?.userId;
  const userName = resolveAuthDisplayName((req as any).auth);
  const avatarUrl = (req as any).auth?.sessionClaims?.picture || null;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    const { rows: canal } = await pool.query(`SELECT * FROM chat_canales WHERE id = $1`, [id]);
    if (!canal.length) return err(res, 'Canal no encontrado', 404);
    if (canal[0].tipo !== 'publico') return err(res, 'Solo puedes unirte a canales públicos directamente', 403);
    await pool.query(`
      INSERT INTO chat_miembros (canal_id, user_id, user_name, avatar_url, role, role_label, last_read_at)
      VALUES ($1, $2, $3, $4, 'miembro', 'Miembro', NOW())
      ON CONFLICT (canal_id, user_id) DO UPDATE SET user_name = EXCLUDED.user_name
    `, [id, userId, userName, avatarUrl]);
    return ok(res, { canal_id: id });
  } catch (e: any) {
    return err(res, e.message);
  }
}

/** DELETE /api/chat/canales/:id/leave — salir de un canal */
export async function leaveCanal(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  try {
    await pool.query(`DELETE FROM chat_miembros WHERE canal_id = $1 AND user_id = $2`, [id, userId]);
    return ok(res, { canal_id: id });
  } catch (e: any) {
    return err(res, e.message);
  }
}

/** POST /api/chat/canales/:id/miembros — añadir miembro a canal (por admin) */
export async function addMiembro(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id } = req.params;
  const { target_user_id, target_user_name, target_avatar_url, role_label } = req.body;
  if (!target_user_id) return err(res, 'target_user_id requerido', 400);
  try {
    // Verificar que quien invita es miembro del canal
    const { rows: self } = await pool.query(
      `SELECT role FROM chat_miembros WHERE canal_id = $1 AND user_id = $2`, [id, userId]
    );
    if (!self.length) return err(res, 'No eres miembro de este canal', 403);
    await pool.query(`
      INSERT INTO chat_miembros (canal_id, user_id, user_name, avatar_url, role, role_label, last_read_at)
      VALUES ($1, $2, $3, $4, 'miembro', $5, NOW())
      ON CONFLICT (canal_id, user_id) DO UPDATE SET user_name = EXCLUDED.user_name, role_label = COALESCE(EXCLUDED.role_label, chat_miembros.role_label)
    `, [id, target_user_id, target_user_name || 'Sin nombre', target_avatar_url || null, role_label || 'Miembro']);
    return ok(res, { canal_id: id, user_id: target_user_id });
  } catch (e: any) {
    return err(res, e.message);
  }
}

/** DELETE /api/chat/canales/:id/miembros/:uid — eliminar miembro del canal */
export async function removeMiembro(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id, uid } = req.params;
  try {
    const { rows: self } = await pool.query(
      `SELECT role FROM chat_miembros WHERE canal_id = $1 AND user_id = $2`, [id, userId]
    );
    if (!self.length) return err(res, 'No eres miembro', 403);
    if (self[0].role !== 'admin' && uid !== userId) return err(res, 'Sin permisos', 403);
    await pool.query(`DELETE FROM chat_miembros WHERE canal_id = $1 AND user_id = $2`, [id, uid]);
    return ok(res, { canal_id: id, user_id: uid });
  } catch (e: any) {
    return err(res, e.message);
  }
}

/** PUT /api/chat/canales/:id/miembros/:uid/role — cambiar rol en el canal */
export async function updateMiembroRole(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { id, uid } = req.params;
  const { role, role_label } = req.body;
  try {
    const { rows: self } = await pool.query(
      `SELECT role FROM chat_miembros WHERE canal_id = $1 AND user_id = $2`, [id, userId]
    );
    if (!self.length || self[0].role !== 'admin') return err(res, 'Sin permisos de admin', 403);
    await pool.query(
      `UPDATE chat_miembros SET role = COALESCE($1, role), role_label = COALESCE($2, role_label) WHERE canal_id = $3 AND user_id = $4`,
      [role || null, role_label || null, id, uid]
    );
    return ok(res, { ok: true });
  } catch (e: any) {
    return err(res, e.message);
  }
}

// ── Usuarios del sistema (Clerk) ──────────────────────────────────────────────
import { createClerkClient } from '@clerk/backend';
let _clerk2: ReturnType<typeof createClerkClient> | null = null;
function getClerk2() {
  if (!_clerk2) _clerk2 = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  return _clerk2;
}

const _usersCache = { data: [] as any[], exp: 0 };

function mapClerkUserSummary(u: any) {
  return {
    user_id: u.id,
    user_name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.emailAddresses?.[0]?.emailAddress || u.username || 'Sin nombre',
    avatar_url: u.imageUrl || null,
    email: u.emailAddresses?.[0]?.emailAddress || null,
    role_label: (u.publicMetadata?.role as string) || 'Colaborador',
  };
}

async function getCachedSystemUsers() {
  if (_usersCache.exp > Date.now()) return _usersCache.data;
  try {
    const list = await getClerk2().users.getUserList({ limit: 200 });
    const users = (list.data || []).map(mapClerkUserSummary);
    _usersCache.data = users;
    _usersCache.exp = Date.now() + 60_000;
    return users;
  } catch {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (user_id) user_id, user_name, avatar_url, role_label
      FROM chat_miembros ORDER BY user_id, user_name ASC
    `);
    _usersCache.data = rows;
    _usersCache.exp = Date.now() + 30_000;
    return rows;
  }
}

/** GET /api/chat/usuarios — todos los usuarios de Clerk (caché 60s) */
export async function getSystemUsers(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  try {
    return ok(res, await getCachedSystemUsers());
  } catch (e: any) {
    // Fallback: devolver los usuarios conocidos desde chat_miembros
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (user_id) user_id, user_name, avatar_url, role_label
      FROM chat_miembros ORDER BY user_id, user_name ASC
    `);
    return ok(res, rows);
  }
}

/** GET /api/chat/canales/disponibles?q=xxx — canales públicos no unidos + búsqueda */
export async function buscarCanalesDisponibles(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  const { q } = req.query as Record<string, string>;
  try {
    const params: any[] = [userId];
    let filter = '';
    if (q?.trim()) { filter = `AND (c.nombre ILIKE $2 OR c.descripcion ILIKE $2)`; params.push(`%${q.trim()}%`); }
    const { rows } = await pool.query(`
      SELECT c.id, c.nombre, c.descripcion, c.tipo, c.created_at,
        (SELECT COUNT(*) FROM chat_miembros WHERE canal_id = c.id)::int AS total_miembros,
        EXISTS(SELECT 1 FROM chat_miembros WHERE canal_id = c.id AND user_id = $1) AS ya_unido
      FROM chat_canales c
      WHERE c.tipo = 'publico' AND c.archivado = false ${filter}
      ORDER BY total_miembros DESC, c.nombre ASC LIMIT 30
    `, params);
    return ok(res, rows);
  } catch (e: any) {
    return err(res, e.message);
  }
}

/** GET /api/chat/unread — conteo ligero de no-leídos por canal (incluye tipo y target DM) */
export async function getUnreadCounts(req: Request, res: Response) {
  const userId = (req as any).auth?.userId;
  if (!userId) return err(res, 'No autenticado', 401);
  try {
    const { rows } = await pool.query(`
      SELECT c.id AS canal_id,
        c.tipo,
        ${unreadCountExpr('$1')} AS no_leidos,
        (SELECT dm.user_id FROM chat_miembros dm
          WHERE dm.canal_id = c.id AND dm.user_id != $1
          LIMIT 1
        ) AS dm_target_user_id
      FROM chat_canales c
      JOIN chat_miembros m ON m.canal_id = c.id AND m.user_id = $1
      WHERE c.archivado = false
    `, [userId]);
    return ok(res, rows);
  } catch (e: any) {
    return err(res, e.message);
  }
}
