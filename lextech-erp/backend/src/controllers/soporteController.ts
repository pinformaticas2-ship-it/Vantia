import { Request, Response } from 'express';
import pool from '../config/database';
import { getClerk } from './activityController';
import { resolveUserOrgMemberships } from './organizacionesController';
import { decryptPassword } from '../utils/emailCrypto';
import { dispatchEmail } from '../utils/mailer';
import { SmtpConfig } from '../utils/smtp';

// ── Centro de soporte ────────────────────────────────────────────────────────
// Sistema de tickets por organización: cualquier miembro abre tickets y ve
// los suyos; propietario/admin/soporte ("gestores") ven todos los de la
// organización, los responden y cambian su estado. Cada ticket nuevo (y cada
// respuesta de quien lo abrió) se manda por correo al soporte_email de SU
// organización -- así cada despacho tiene su propio informático.

const CATEGORIAS = ['incidencia', 'consulta', 'peticion', 'otro'] as const;
const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'] as const;
const ESTADOS = ['abierto', 'en_progreso', 'esperando', 'resuelto', 'cerrado'] as const;

const CATEGORIA_LABEL: Record<string, string> = { incidencia: 'Incidencia', consulta: 'Consulta', peticion: 'Petición', otro: 'Otro' };
const PRIORIDAD_LABEL: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' };
const ESTADO_LABEL: Record<string, string> = { abierto: 'Abierto', en_progreso: 'En progreso', esperando: 'Esperando respuesta', resuelto: 'Resuelto', cerrado: 'Cerrado' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ok(res: Response, data: any) {
  return res.json({ success: true, data });
}
function err(res: Response, message: string, status = 500) {
  return res.status(status).json({ success: false, error: message });
}

function isGestor(rol: string | undefined): boolean {
  return rol === 'propietario' || rol === 'admin' || rol === 'soporte';
}

function requireCtx(req: Request, res: Response): { organizacionId: string; rol: string; userId: string } | null {
  const organizacionId = (req as any).organizacionId;
  const userId = (req as any).auth?.userId;
  if (!organizacionId || !userId) {
    err(res, 'No se pudo determinar la organización activa.', 400);
    return null;
  }
  return { organizacionId, rol: (req as any).organizacionRol, userId };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const nl2br = (s: string) => escapeHtml(s).replace(/\n/g, '<br>');

async function getUserInfo(userId: string): Promise<{ nombre: string; email: string | null }> {
  try {
    const user = await getClerk().users.getUser(userId);
    const email = user.emailAddresses?.[0]?.emailAddress || null;
    const nombre = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || email || userId;
    return { nombre, email };
  } catch {
    return { nombre: userId, email: null };
  }
}

// Envía un correo desde la primera cuenta de correo activa de la
// organización (mismo criterio que el correo de bienvenida a clientes).
// Devuelve el error como texto en vez de lanzarlo: el ticket se guarda igual
// aunque el correo no salga, y el error queda visible en el propio ticket.
async function sendOrgEmail(organizacionId: string, to: string, subject: string, html: string, replyTo?: string | null): Promise<string | null> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM email_accounts WHERE organizacion_id = $1 AND active = true ORDER BY created_at ASC LIMIT 1`,
      [organizacionId],
    );
    if (!rows.length) return 'La organización no tiene ninguna cuenta de correo configurada para enviar.';
    const acc = rows[0];
    const smtpCfg: SmtpConfig = {
      host: acc.smtp_host, port: acc.smtp_port, secure: acc.smtp_secure,
      user: acc.username, password: decryptPassword(acc.password_enc),
    };
    await dispatchEmail(smtpCfg, {
      from: acc.email,
      fromName: acc.label || undefined,
      to: [to],
      subject,
      html,
      replyTo: replyTo || undefined,
    });
    return null;
  } catch (e: any) {
    return e?.message || String(e);
  }
}

async function getSoporteEmail(organizacionId: string): Promise<{ email: string | null; orgNombre: string }> {
  const { rows } = await pool.query(`SELECT nombre, soporte_email FROM organizaciones WHERE id = $1`, [organizacionId]);
  return { email: rows[0]?.soporte_email || null, orgNombre: rows[0]?.nombre || '' };
}

function ticketRef(numero: number) {
  return `#${String(numero).padStart(4, '0')}`;
}

// Correo al soporte de la organización con el ticket (nuevo o con respuesta
// nueva del usuario). Guarda en el ticket a quién se mandó y el error, si lo hubo.
async function notifySoporte(ticket: any, mensaje?: { autor: string; texto: string }): Promise<void> {
  const { email, orgNombre } = await getSoporteEmail(ticket.organizacion_id);
  let error: string | null;
  if (!email) {
    error = 'La organización no tiene correo de soporte configurado.';
  } else {
    const subject = mensaje
      ? `[Soporte ${ticketRef(ticket.numero)}] Nueva respuesta: ${ticket.asunto}`
      : `[Soporte ${ticketRef(ticket.numero)}] ${PRIORIDAD_LABEL[ticket.prioridad]} · ${ticket.asunto}`;
    const html = `
      <h2 style="margin:0 0 8px">${escapeHtml(ticketRef(ticket.numero))} · ${escapeHtml(ticket.asunto)}</h2>
      <p style="margin:0 0 12px;color:#555">
        <b>Organización:</b> ${escapeHtml(orgNombre)}<br>
        <b>Abierto por:</b> ${escapeHtml(ticket.created_by_name || '')}${ticket.created_by_email ? ` &lt;${escapeHtml(ticket.created_by_email)}&gt;` : ''}<br>
        <b>Categoría:</b> ${CATEGORIA_LABEL[ticket.categoria]} · <b>Prioridad:</b> ${PRIORIDAD_LABEL[ticket.prioridad]} · <b>Estado:</b> ${ESTADO_LABEL[ticket.estado]}
      </p>
      ${mensaje
        ? `<p><b>${escapeHtml(mensaje.autor)} ha respondido:</b></p><div style="padding:12px;background:#f5f5f5;border-radius:8px">${nl2br(mensaje.texto)}</div>`
        : `<div style="padding:12px;background:#f5f5f5;border-radius:8px">${nl2br(ticket.descripcion)}</div>`}
      <p style="color:#888;font-size:12px;margin-top:16px">Gestiona este ticket desde Vantia → Centro de soporte.</p>
    `.trim();
    error = await sendOrgEmail(ticket.organizacion_id, email, subject, html, ticket.created_by_email);
  }
  await pool.query(
    `UPDATE soporte_tickets SET enviado_a = $1, email_error = $2 WHERE id = $3`,
    [email, error, ticket.id],
  );
  if (error) console.warn(`Soporte: no se pudo enviar el ticket ${ticket.id} por correo:`, error);
}

// Aviso por correo a quien abrió el ticket cuando soporte responde o cambia
// el estado. Best effort: si falla no se registra nada en el ticket.
async function notifyCreador(ticket: any, texto: string): Promise<void> {
  if (!ticket.created_by_email) return;
  const html = `
    <h2 style="margin:0 0 8px">${escapeHtml(ticketRef(ticket.numero))} · ${escapeHtml(ticket.asunto)}</h2>
    <div style="padding:12px;background:#f5f5f5;border-radius:8px">${nl2br(texto)}</div>
    <p style="color:#888;font-size:12px;margin-top:16px">Estado actual: ${ESTADO_LABEL[ticket.estado]}. Puedes responder desde Vantia → Centro de soporte.</p>
  `.trim();
  const error = await sendOrgEmail(ticket.organizacion_id, ticket.created_by_email, `[Soporte ${ticketRef(ticket.numero)}] ${ticket.asunto}`, html);
  if (error) console.warn(`Soporte: no se pudo avisar al creador del ticket ${ticket.id}:`, error);
}

async function loadTicketForUser(req: Request, res: Response): Promise<{ ticket: any; ctx: { organizacionId: string; rol: string; userId: string } } | null> {
  const ctx = requireCtx(req, res);
  if (!ctx) return null;
  const { rows } = await pool.query(
    `SELECT * FROM soporte_tickets WHERE id = $1 AND organizacion_id = $2`,
    [req.params.id, ctx.organizacionId],
  );
  const ticket = rows[0];
  if (!ticket || (!isGestor(ctx.rol) && ticket.created_by !== ctx.userId)) {
    err(res, 'Ticket no encontrado.', 404);
    return null;
  }
  return { ticket, ctx };
}

function serializeTicket(t: any) {
  return {
    id: t.id,
    numero: t.numero,
    asunto: t.asunto,
    descripcion: t.descripcion,
    categoria: t.categoria,
    prioridad: t.prioridad,
    estado: t.estado,
    createdBy: t.created_by,
    createdByName: t.created_by_name,
    createdByEmail: t.created_by_email,
    enviadoA: t.enviado_a,
    emailError: t.email_error,
    mensajesCount: t.mensajes_count != null ? Number(t.mensajes_count) : undefined,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

// GET /api/soporte/tickets
export async function listTickets(req: Request, res: Response) {
  try {
    const ctx = requireCtx(req, res);
    if (!ctx) return;
    const gestor = isGestor(ctx.rol);
    const params: any[] = [ctx.organizacionId];
    let where = `t.organizacion_id = $1`;
    if (!gestor) {
      params.push(ctx.userId);
      where += ` AND t.created_by = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT t.*, (SELECT COUNT(*) FROM soporte_ticket_mensajes m WHERE m.ticket_id = t.id) AS mensajes_count
         FROM soporte_tickets t
        WHERE ${where}
        ORDER BY t.updated_at DESC`,
      params,
    );
    const { email } = await getSoporteEmail(ctx.organizacionId);
    return ok(res, { tickets: rows.map(serializeTicket), esGestor: gestor, soporteEmail: email });
  } catch (e: any) {
    return err(res, e?.message || String(e));
  }
}

// POST /api/soporte/tickets
export async function createTicket(req: Request, res: Response) {
  const ctx = requireCtx(req, res);
  if (!ctx) return;
  const asunto = String(req.body?.asunto || '').trim().slice(0, 200);
  const descripcion = String(req.body?.descripcion || '').trim();
  const categoria = CATEGORIAS.includes(req.body?.categoria) ? req.body.categoria : 'incidencia';
  const prioridad = PRIORIDADES.includes(req.body?.prioridad) ? req.body.prioridad : 'media';
  if (!asunto) return err(res, 'El asunto es obligatorio.', 400);
  if (!descripcion) return err(res, 'La descripción es obligatoria.', 400);

  const autor = await getUserInfo(ctx.userId);
  const client = await pool.connect();
  let ticket: any;
  try {
    await client.query('BEGIN');
    // Numeración correlativa por organización: el lock evita que dos tickets
    // creados a la vez se lleven el mismo número.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`soporte_tickets:${ctx.organizacionId}`]);
    const { rows: n } = await client.query(
      `SELECT COALESCE(MAX(numero), 0) + 1 AS next FROM soporte_tickets WHERE organizacion_id = $1`,
      [ctx.organizacionId],
    );
    const { rows } = await client.query(
      `INSERT INTO soporte_tickets
         (organizacion_id, numero, asunto, descripcion, categoria, prioridad, created_by, created_by_name, created_by_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [ctx.organizacionId, n[0].next, asunto, descripcion, categoria, prioridad, ctx.userId, autor.nombre, autor.email],
    );
    await client.query('COMMIT');
    ticket = rows[0];
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    return err(res, e?.message || String(e));
  } finally {
    client.release();
  }

  await notifySoporte(ticket);
  const { rows } = await pool.query(`SELECT * FROM soporte_tickets WHERE id = $1`, [ticket.id]);
  return ok(res, serializeTicket(rows[0]));
}

// GET /api/soporte/tickets/:id
export async function getTicket(req: Request, res: Response) {
  try {
    const loaded = await loadTicketForUser(req, res);
    if (!loaded) return;
    const { rows } = await pool.query(
      `SELECT id, user_id, user_name, es_soporte, mensaje, created_at
         FROM soporte_ticket_mensajes WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [loaded.ticket.id],
    );
    return ok(res, {
      ticket: serializeTicket(loaded.ticket),
      mensajes: rows.map((m) => ({
        id: m.id, userId: m.user_id, userName: m.user_name, esSoporte: m.es_soporte, mensaje: m.mensaje, createdAt: m.created_at,
      })),
    });
  } catch (e: any) {
    return err(res, e?.message || String(e));
  }
}

// POST /api/soporte/tickets/:id/mensajes
export async function addMensaje(req: Request, res: Response) {
  try {
    const loaded = await loadTicketForUser(req, res);
    if (!loaded) return;
    const { ticket, ctx } = loaded;
    const texto = String(req.body?.mensaje || '').trim();
    if (!texto) return err(res, 'El mensaje no puede estar vacío.', 400);

    const esCreador = ticket.created_by === ctx.userId;
    const esSoporte = isGestor(ctx.rol) && !esCreador;
    const autor = await getUserInfo(ctx.userId);
    const { rows } = await pool.query(
      `INSERT INTO soporte_ticket_mensajes (ticket_id, user_id, user_name, es_soporte, mensaje)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [ticket.id, ctx.userId, autor.nombre, esSoporte, texto],
    );
    // Responder reabre un ticket resuelto/cerrado si lo hace quien lo abrió;
    // si responde soporte, lo deja "esperando respuesta" del usuario.
    const nuevoEstado = esSoporte
      ? (ticket.estado === 'abierto' || ticket.estado === 'en_progreso' ? 'esperando' : ticket.estado)
      : (ticket.estado === 'esperando' || ticket.estado === 'resuelto' || ticket.estado === 'cerrado' ? 'abierto' : ticket.estado);
    const { rows: upd } = await pool.query(
      `UPDATE soporte_tickets SET estado = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [nuevoEstado, ticket.id],
    );

    if (esSoporte) await notifyCreador(upd[0], `${autor.nombre} ha respondido:\n\n${texto}`);
    else await notifySoporte(upd[0], { autor: autor.nombre, texto });

    const m = rows[0];
    return ok(res, {
      mensaje: { id: m.id, userId: m.user_id, userName: m.user_name, esSoporte: m.es_soporte, mensaje: m.mensaje, createdAt: m.created_at },
      ticket: serializeTicket((await pool.query(`SELECT * FROM soporte_tickets WHERE id = $1`, [ticket.id])).rows[0]),
    });
  } catch (e: any) {
    return err(res, e?.message || String(e));
  }
}

// PATCH /api/soporte/tickets/:id — estado/prioridad (gestores). Quien abrió
// el ticket solo puede cerrarlo o reabrirlo.
export async function updateTicket(req: Request, res: Response) {
  try {
    const loaded = await loadTicketForUser(req, res);
    if (!loaded) return;
    const { ticket, ctx } = loaded;
    const gestor = isGestor(ctx.rol);
    const estado = req.body?.estado;
    const prioridad = req.body?.prioridad;

    if (estado !== undefined && !ESTADOS.includes(estado)) return err(res, 'Estado no válido.', 400);
    if (prioridad !== undefined && !PRIORIDADES.includes(prioridad)) return err(res, 'Prioridad no válida.', 400);
    if (!gestor) {
      if (prioridad !== undefined || (estado !== undefined && estado !== 'cerrado' && estado !== 'abierto')) {
        return err(res, 'Solo el equipo de soporte puede cambiar esto.', 403);
      }
    }

    const { rows } = await pool.query(
      `UPDATE soporte_tickets
          SET estado = COALESCE($1, estado), prioridad = COALESCE($2, prioridad), updated_at = NOW()
        WHERE id = $3 RETURNING *`,
      [estado ?? null, prioridad ?? null, ticket.id],
    );
    const updated = rows[0];
    if (gestor && estado && estado !== ticket.estado && ticket.created_by !== ctx.userId) {
      await notifyCreador(updated, `El estado de tu ticket ha cambiado a: ${ESTADO_LABEL[estado]}.`);
    }
    return ok(res, serializeTicket(updated));
  } catch (e: any) {
    return err(res, e?.message || String(e));
  }
}

// POST /api/soporte/tickets/:id/reenviar — reintenta el correo al soporte
// (p.ej. después de configurar el correo o la cuenta de envío).
export async function reenviarTicket(req: Request, res: Response) {
  try {
    const loaded = await loadTicketForUser(req, res);
    if (!loaded) return;
    await notifySoporte(loaded.ticket);
    const { rows } = await pool.query(`SELECT * FROM soporte_tickets WHERE id = $1`, [loaded.ticket.id]);
    return ok(res, serializeTicket(rows[0]));
  } catch (e: any) {
    return err(res, e?.message || String(e));
  }
}

// GET /api/soporte/config — correo de soporte de cada organización que el
// usuario puede gestionar (propietario/admin/soporte en ella).
export async function getSoporteConfig(req: Request, res: Response) {
  try {
    const userId = (req as any).auth?.userId;
    const memberships = (await resolveUserOrgMemberships(userId)).filter((m) => isGestor(m.rol));
    if (!memberships.length) return ok(res, []);
    const { rows } = await pool.query(
      `SELECT o.id, o.nombre, o.soporte_email,
              EXISTS (SELECT 1 FROM email_accounts a WHERE a.organizacion_id = o.id AND a.active = true) AS tiene_cuenta_envio
         FROM organizaciones o WHERE o.id = ANY($1::uuid[]) ORDER BY o.nombre`,
      [memberships.map((m) => m.organizacionId)],
    );
    return ok(res, rows.map((r) => ({
      organizacionId: r.id, nombre: r.nombre, soporteEmail: r.soporte_email, tieneCuentaEnvio: r.tiene_cuenta_envio,
    })));
  } catch (e: any) {
    return err(res, e?.message || String(e));
  }
}

// PUT /api/soporte/config/:organizacionId
export async function updateSoporteConfig(req: Request, res: Response) {
  try {
    const userId = (req as any).auth?.userId;
    const organizacionId = req.params.organizacionId;
    const membership = (await resolveUserOrgMemberships(userId)).find((m) => m.organizacionId === organizacionId);
    if (!membership || !isGestor(membership.rol)) {
      return err(res, 'Solo el propietario, un administrador o soporte pueden cambiar este correo.', 403);
    }
    const email = String(req.body?.soporteEmail || '').trim();
    if (email && !EMAIL_RE.test(email)) return err(res, 'El correo no es válido.', 400);
    await pool.query(
      `UPDATE organizaciones SET soporte_email = $1, updated_at = NOW() WHERE id = $2`,
      [email || null, organizacionId],
    );
    return ok(res, { organizacionId, soporteEmail: email || null });
  } catch (e: any) {
    return err(res, e?.message || String(e));
  }
}
