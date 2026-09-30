import { Request, Response } from 'express';
import pool from '../config/database';
import { getClerk } from './activityController';
import { resolveUserOrgMemberships } from './organizacionesController';
import { decryptPassword } from '../utils/emailCrypto';
import { dispatchEmail } from '../utils/mailer';
import { SmtpConfig, MailAttachment } from '../utils/smtp';

// ── Centro de soporte ────────────────────────────────────────────────────────
// Sistema de tickets por organización: cualquier miembro abre tickets y ve
// solo los suyos (y puede responder en ellos); únicamente los informáticos
// del despacho (rol "soporte") ven todos los de la organización, cambian su
// estado/prioridad y configuran el correo de soporte -- ni siquiera el
// propietario o un admin gestionan tickets ajenos. Cada ticket nuevo (y cada
// respuesta de quien lo abrió) se manda por correo al soporte_email de SU
// organización -- así cada despacho tiene su propio informático.

const CATEGORIAS = ['incidencia', 'consulta', 'peticion', 'otro'] as const;
const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'] as const;
const ESTADOS = ['abierto', 'en_progreso', 'esperando', 'resuelto', 'cerrado'] as const;

const CATEGORIA_LABEL: Record<string, string> = { incidencia: 'Incidencia', consulta: 'Consulta', peticion: 'Petición', otro: 'Otro' };
const PRIORIDAD_LABEL: Record<string, string> = { baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' };
const ESTADO_LABEL: Record<string, string> = { abierto: 'Abierto', en_progreso: 'En progreso', esperando: 'Esperando respuesta', resuelto: 'Resuelto', cerrado: 'Cerrado' };
const ROL_LABEL: Record<string, string> = { propietario: 'Propietario', admin: 'Administrador', miembro: 'Miembro', soporte: 'Soporte' };
// Mismos ids que MODULOS en frontend/src/pages/Soporte.tsx.
const MODULO_LABEL: Record<string, string> = {
  clientes: 'Clientes', expedientes: 'Expedientes', agenda: 'Agenda', tareas: 'Tareas', correo: 'Correo',
  chat: 'Chat interno', whatsapp: 'Comunicación externa', documental: 'Documental', directorio: 'Directorio profesional',
  facturacion: 'Tesorería / Facturación', vantia: 'Vantia IA', documentos: 'Documentos / Drive / Dropbox',
  configuracion: 'Configuración / usuarios', acceso: 'Acceso / inicio de sesión', otro: 'Otro',
};
const PRIORIDAD_COLOR: Record<string, string> = { baja: '#64748b', media: '#0284c7', alta: '#d97706', urgente: '#dc2626' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Retención de tickets cerrados: se borran a los RETENCION_DIAS de cerrarse,
// y nunca antes de AVISO_DIAS_ANTES días desde que se mandó el aviso por
// correo con el CSV (ver services/soporteRetencion.ts).
export const RETENCION_DIAS = 30;
export const AVISO_DIAS_ANTES = 7;
const DIA_MS = 86_400_000;

// Fecha prevista de borrado de un ticket cerrado (null si no está cerrado).
function fechaBorrado(t: any): Date | null {
  if (t.estado !== 'cerrado' || !t.cerrado_at) return null;
  const base = new Date(t.cerrado_at).getTime() + RETENCION_DIAS * DIA_MS;
  const trasAviso = t.aviso_borrado_at
    ? new Date(t.aviso_borrado_at).getTime() + AVISO_DIAS_ANTES * DIA_MS
    // Aún sin avisar: como pronto, 7 días después de que salga el aviso.
    : Math.max(Date.now(), new Date(t.cerrado_at).getTime() + (RETENCION_DIAS - AVISO_DIAS_ANTES) * DIA_MS) + AVISO_DIAS_ANTES * DIA_MS;
  return new Date(Math.max(base, trasAviso));
}

// SQL que mantiene cerrado_at/aviso_borrado_at coherentes con el nuevo
// estado ($n = estado nuevo): cerrar fija la fecha (si no la tenía ya),
// cualquier otro estado la borra y anula el aviso de borrado.
const RETENCION_SET = (p: string) => `
  cerrado_at = CASE WHEN ${p} = 'cerrado' THEN COALESCE(cerrado_at, NOW()) ELSE NULL END,
  aviso_borrado_at = CASE WHEN ${p} = 'cerrado' THEN aviso_borrado_at ELSE NULL END`;

function ok(res: Response, data: any) {
  return res.json({ success: true, data });
}
function err(res: Response, message: string, status = 500) {
  return res.status(status).json({ success: false, error: message });
}

function isGestor(rol: string | undefined): boolean {
  return rol === 'soporte';
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

export function escapeHtml(s: string): string {
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

// Envía un correo desde la cuenta de correo de `preferUserId` en la
// organización (quien abre/responde el ticket), y si no tiene ninguna, desde
// la primera cuenta activa de la organización. Antes iba siempre a la
// primera, y el ticket salía desde el buzón personal de un compañero
// cualquiera en vez de desde quien lo había abierto.
// Devuelve el error como texto en vez de lanzarlo: el ticket se guarda igual
// aunque el correo no salga, y el error queda visible en el propio ticket.
export async function sendOrgEmail(
  organizacionId: string, preferUserId: string, to: string, subject: string, html: string, replyTo?: string | null,
  attachments?: MailAttachment[],
): Promise<string | null> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM email_accounts WHERE organizacion_id = $1 AND active = true
        ORDER BY (user_id = $2) DESC, created_at ASC LIMIT 1`,
      [organizacionId, preferUserId],
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
      attachments,
    });
    return null;
  } catch (e: any) {
    return e?.message || String(e);
  }
}

export async function getSoporteEmail(organizacionId: string): Promise<{ email: string | null; orgNombre: string }> {
  const { rows } = await pool.query(`SELECT nombre, soporte_email FROM organizaciones WHERE id = $1`, [organizacionId]);
  return { email: rows[0]?.soporte_email || null, orgNombre: rows[0]?.nombre || '' };
}

export function ticketRef(numero: number) {
  return `#${String(numero).padStart(4, '0')}`;
}

// Fecha y hora completas en hora de España ("lunes, 29 de septiembre de
// 2026, 10:32 h") -- el servidor corre en UTC, así que sin timeZone la hora
// del correo saldría desplazada.
export function fmtFecha(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const s = new Date(d).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return `${s.charAt(0).toUpperCase()}${s.slice(1)} h`;
}

function describeUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android'
    : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  return [browser, os].filter(Boolean).join(' · ') || null;
}

const box = 'padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:1.55;color:#0f172a';

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:7px 12px 7px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top;width:190px">${label}</td>
    <td style="padding:7px 0;color:#0f172a;font-size:13px;vertical-align:top">${value}</td>
  </tr>`;
}

function pill(text: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${color};color:#fff;font-size:12px;font-weight:bold">${escapeHtml(text)}</span>`;
}

// Ficha completa del ticket: todo lo que el informático necesita sin tener
// que entrar en Vantia.
function ticketDetailsHtml(ticket: any, orgNombre: string): string {
  const abiertoPor = `<b>${escapeHtml(ticket.created_by_name || '—')}</b>`
    + (ticket.created_by_rol ? ` <span style="color:#64748b">(${escapeHtml(ROL_LABEL[ticket.created_by_rol] || ticket.created_by_rol)})</span>` : '')
    + (ticket.created_by_email ? `<br><a href="mailto:${escapeHtml(ticket.created_by_email)}" style="color:#0284c7">${escapeHtml(ticket.created_by_email)}</a>` : '');
  const equipo = describeUserAgent(ticket.user_agent);
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:4px 0 18px">
    ${row('Nº de ticket', `<b>${escapeHtml(ticketRef(ticket.numero))}</b>`)}
    ${row('Organización', escapeHtml(orgNombre))}
    ${row('Abierto por', abiertoPor)}
    ${row('Fecha y hora de la incidencia', `<b>${escapeHtml(fmtFecha(ticket.fecha_incidencia || ticket.created_at))}</b>`)}
    ${row('Ticket abierto el', escapeHtml(fmtFecha(ticket.created_at)))}
    ${row('Módulo afectado', escapeHtml(MODULO_LABEL[ticket.modulo] || 'No indicado'))}
    ${row('Categoría', escapeHtml(CATEGORIA_LABEL[ticket.categoria] || ticket.categoria))}
    ${row('Prioridad', pill(PRIORIDAD_LABEL[ticket.prioridad] || ticket.prioridad, PRIORIDAD_COLOR[ticket.prioridad] || '#64748b'))}
    ${row('Estado', escapeHtml(ESTADO_LABEL[ticket.estado] || ticket.estado))}
    ${equipo ? row('Navegador / equipo', escapeHtml(equipo)) : ''}
  </table>`;
}

export function emailLayout(titulo: string, subtitulo: string, color: string, cuerpo: string, pie: string): string {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;color:#0f172a">
    <div style="border-left:5px solid ${color};padding:4px 0 4px 14px;margin-bottom:18px">
      <div style="font-size:12px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:${color}">${escapeHtml(subtitulo)}</div>
      <div style="font-size:21px;font-weight:bold;margin-top:2px">${titulo}</div>
    </div>
    ${cuerpo}
    <p style="color:#94a3b8;font-size:12px;margin-top:22px;border-top:1px solid #e2e8f0;padding-top:12px">${pie}</p>
  </div>`;
}

async function conversacionHtml(ticketId: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT user_name, es_soporte, mensaje, created_at FROM soporte_ticket_mensajes WHERE ticket_id = $1 ORDER BY created_at ASC`,
    [ticketId],
  );
  if (!rows.length) return '';
  return `<h3 style="font-size:14px;margin:22px 0 8px">Conversación completa</h3>`
    + rows.map((m) => `<div style="margin-bottom:10px;padding:10px 14px;border-radius:10px;border:1px solid ${m.es_soporte ? '#bae6fd' : '#e2e8f0'};background:${m.es_soporte ? '#f0f9ff' : '#ffffff'}">
      <div style="font-size:12px;color:#64748b;margin-bottom:4px"><b style="color:#0f172a">${escapeHtml(m.user_name || 'Usuario')}</b>${m.es_soporte ? ' · Soporte' : ''} · ${escapeHtml(fmtFecha(m.created_at))}</div>
      <div style="font-size:13px;line-height:1.5">${nl2br(m.mensaje)}</div>
    </div>`).join('');
}

// Correo al soporte de la organización con el ticket (nuevo o con respuesta
// nueva del usuario). Guarda en el ticket a quién se mandó y el error, si lo hubo.
async function notifySoporte(ticket: any, mensaje?: { autorId: string; autor: string; texto: string }): Promise<void> {
  const { email, orgNombre } = await getSoporteEmail(ticket.organizacion_id);
  let error: string | null;
  if (!email) {
    error = 'La organización no tiene correo de soporte configurado.';
  } else {
    const color = PRIORIDAD_COLOR[ticket.prioridad] || '#dc2626';
    const subject = mensaje
      ? `[Soporte ${ticketRef(ticket.numero)}] Nueva respuesta · ${ticket.asunto}`
      : `[Soporte ${ticketRef(ticket.numero)}] ${PRIORIDAD_LABEL[ticket.prioridad]} · ${ticket.asunto} · ${fmtFecha(ticket.fecha_incidencia || ticket.created_at)}`;
    const cuerpo = mensaje
      ? `<p style="margin:0 0 6px;font-size:14px"><b>${escapeHtml(mensaje.autor)}</b> ha respondido el ${escapeHtml(fmtFecha(new Date()))}:</p>
         <div style="${box};margin-bottom:20px">${nl2br(mensaje.texto)}</div>
         ${ticketDetailsHtml(ticket, orgNombre)}
         <h3 style="font-size:14px;margin:0 0 8px">Descripción original</h3>
         <div style="${box}">${nl2br(ticket.descripcion)}</div>
         ${await conversacionHtml(ticket.id)}`
      : `${ticketDetailsHtml(ticket, orgNombre)}
         <h3 style="font-size:14px;margin:0 0 8px">Descripción de la incidencia</h3>
         <div style="${box}">${nl2br(ticket.descripcion)}</div>`;
    const html = emailLayout(
      `${escapeHtml(ticketRef(ticket.numero))} · ${escapeHtml(ticket.asunto)}`,
      mensaje ? 'Nueva respuesta en ticket de soporte' : `Nuevo ticket de soporte · Prioridad ${PRIORIDAD_LABEL[ticket.prioridad]}`,
      color,
      cuerpo,
      `Responde a este correo para contestar directamente a ${escapeHtml(ticket.created_by_name || 'quien abrió el ticket')}, o gestiona el ticket desde Vantia → Centro de soporte.`,
    );
    error = await sendOrgEmail(ticket.organizacion_id, mensaje?.autorId || ticket.created_by, email, subject, html, ticket.created_by_email);
  }
  await pool.query(
    `UPDATE soporte_tickets SET enviado_a = $1, email_error = $2 WHERE id = $3`,
    [email, error, ticket.id],
  );
  if (error) console.warn(`Soporte: no se pudo enviar el ticket ${ticket.id} por correo:`, error);
}

// Aviso por correo a quien abrió el ticket cuando soporte responde o cambia
// el estado (se envía desde la cuenta del informático que actúa). Best
// effort: si falla no se registra nada en el ticket.
async function notifyCreador(ticket: any, senderUserId: string, texto: string): Promise<void> {
  if (!ticket.created_by_email) return;
  const { orgNombre } = await getSoporteEmail(ticket.organizacion_id);
  const html = emailLayout(
    `${escapeHtml(ticketRef(ticket.numero))} · ${escapeHtml(ticket.asunto)}`,
    'Actualización de tu ticket de soporte',
    '#0284c7',
    `<div style="${box};margin-bottom:20px">${nl2br(texto)}</div>
     ${ticketDetailsHtml(ticket, orgNombre)}
     ${await conversacionHtml(ticket.id)}`,
    'Puedes responder desde Vantia → Centro de soporte.',
  );
  const error = await sendOrgEmail(ticket.organizacion_id, senderUserId, ticket.created_by_email, `[Soporte ${ticketRef(ticket.numero)}] ${ticket.asunto}`, html);
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
    createdByRol: t.created_by_rol,
    fechaIncidencia: t.fecha_incidencia || t.created_at,
    modulo: t.modulo,
    enviadoA: t.enviado_a,
    emailError: t.email_error,
    cerradoAt: t.cerrado_at || null,
    fechaBorrado: fechaBorrado(t),
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
    const tickets = rows.map(serializeTicket);
    // Tickets que se borrarán en los próximos AVISO_DIAS_ANTES días -- para el
    // aviso de "descarga el CSV" dentro de la app (solo lo ve soporte).
    const limite = Date.now() + AVISO_DIAS_ANTES * DIA_MS;
    const proximos = gestor ? tickets.filter((t) => t.fechaBorrado && t.fechaBorrado.getTime() <= limite) : [];
    return ok(res, {
      tickets,
      esGestor: gestor,
      soporteEmail: email,
      retencion: gestor ? {
        dias: RETENCION_DIAS,
        pendientesBorrado: proximos.length,
        proximoBorrado: proximos.length ? new Date(Math.min(...proximos.map((t) => t.fechaBorrado!.getTime()))) : null,
      } : null,
    });
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
  const modulo = req.body?.modulo && MODULO_LABEL[req.body.modulo] ? req.body.modulo : null;
  // Fecha/hora en que ocurrió la incidencia (la elige el usuario, por defecto
  // "ahora"). Se descarta si no es válida o está en el futuro -- en ese caso
  // se usa la de apertura del ticket.
  const fechaRaw = req.body?.fechaIncidencia ? new Date(req.body.fechaIncidencia) : null;
  const fechaIncidencia = fechaRaw && !isNaN(fechaRaw.getTime()) && fechaRaw.getTime() <= Date.now() + 5 * 60 * 1000
    ? fechaRaw : new Date();
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 500) || null;

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
         (organizacion_id, numero, asunto, descripcion, categoria, prioridad, created_by, created_by_name, created_by_email,
          created_by_rol, fecha_incidencia, modulo, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [ctx.organizacionId, n[0].next, asunto, descripcion, categoria, prioridad, ctx.userId, autor.nombre, autor.email,
        ctx.rol || null, fechaIncidencia, modulo, userAgent],
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
      `UPDATE soporte_tickets SET estado = $1::varchar, updated_at = NOW(), ${RETENCION_SET('$1::varchar')} WHERE id = $2 RETURNING *`,
      [nuevoEstado, ticket.id],
    );

    if (esSoporte) await notifyCreador(upd[0], ctx.userId, `${autor.nombre} ha respondido:\n\n${texto}`);
    else await notifySoporte(upd[0], { autorId: ctx.userId, autor: autor.nombre, texto });

    const m = rows[0];
    return ok(res, {
      mensaje: { id: m.id, userId: m.user_id, userName: m.user_name, esSoporte: m.es_soporte, mensaje: m.mensaje, createdAt: m.created_at },
      ticket: serializeTicket((await pool.query(`SELECT * FROM soporte_tickets WHERE id = $1`, [ticket.id])).rows[0]),
    });
  } catch (e: any) {
    return err(res, e?.message || String(e));
  }
}

// PATCH /api/soporte/tickets/:id — estado/prioridad (solo rol soporte).
export async function updateTicket(req: Request, res: Response) {
  try {
    const loaded = await loadTicketForUser(req, res);
    if (!loaded) return;
    const { ticket, ctx } = loaded;
    if (!isGestor(ctx.rol)) return err(res, 'Solo los informáticos del despacho pueden gestionar los tickets.', 403);
    const estado = req.body?.estado;
    const prioridad = req.body?.prioridad;

    if (estado !== undefined && !ESTADOS.includes(estado)) return err(res, 'Estado no válido.', 400);
    if (prioridad !== undefined && !PRIORIDADES.includes(prioridad)) return err(res, 'Prioridad no válida.', 400);

    const { rows } = await pool.query(
      `UPDATE soporte_tickets
          SET estado = COALESCE($1::varchar, estado), prioridad = COALESCE($2, prioridad), updated_at = NOW(),
              ${RETENCION_SET('COALESCE($1::varchar, estado)')}
        WHERE id = $3 RETURNING *`,
      [estado ?? null, prioridad ?? null, ticket.id],
    );
    const updated = rows[0];
    if (estado && estado !== ticket.estado && ticket.created_by !== ctx.userId) {
      await notifyCreador(updated, ctx.userId, `El estado de tu ticket ha cambiado a: ${ESTADO_LABEL[estado]}.`);
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
    if (!isGestor(loaded.ctx.rol)) return err(res, 'Solo los informáticos del despacho pueden reenviar tickets.', 403);
    await notifySoporte(loaded.ticket);
    const { rows } = await pool.query(`SELECT * FROM soporte_tickets WHERE id = $1`, [loaded.ticket.id]);
    return ok(res, serializeTicket(rows[0]));
  } catch (e: any) {
    return err(res, e?.message || String(e));
  }
}

// GET /api/soporte/config — correo de soporte de cada organización que el
// usuario puede gestionar (en las que tiene rol soporte).
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
      return err(res, 'Solo los informáticos del despacho pueden cambiar este correo.', 403);
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

// ── CSV y estadísticas ───────────────────────────────────────────────────────
// CSV con ";" y BOM UTF-8: es lo que Excel en español abre bien a la primera
// (con "," lo mete todo en una columna y sin BOM rompe las tildes).

function csvCell(v: any): string {
  const s = v == null ? '' : String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header: string[], rows: any[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

function fmtCsvFecha(d: string | Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// CSV completo de una lista de tickets (con su conversación entera).
export async function buildTicketsCsv(tickets: any[]): Promise<string> {
  const ids = tickets.map((t) => t.id);
  const { rows: mensajes } = ids.length
    ? await pool.query(
      `SELECT ticket_id, user_name, es_soporte, mensaje, created_at FROM soporte_ticket_mensajes
        WHERE ticket_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
      [ids],
    )
    : { rows: [] as any[] };
  const porTicket = new Map<string, any[]>();
  for (const m of mensajes) {
    if (!porTicket.has(m.ticket_id)) porTicket.set(m.ticket_id, []);
    porTicket.get(m.ticket_id)!.push(m);
  }
  const header = [
    'Nº ticket', 'Asunto', 'Categoría', 'Prioridad', 'Estado', 'Módulo afectado',
    'Abierto por', 'Email', 'Rol', 'Fecha incidencia', 'Fecha apertura', 'Fecha cierre',
    'Horas hasta el cierre', 'Borrado previsto', 'Descripción', 'Nº respuestas', 'Conversación',
  ];
  const rows = tickets.map((t) => {
    const conv = porTicket.get(t.id) || [];
    const horas = t.cerrado_at ? ((new Date(t.cerrado_at).getTime() - new Date(t.created_at).getTime()) / 3_600_000).toFixed(1).replace('.', ',') : '';
    return [
      ticketRef(t.numero), t.asunto, CATEGORIA_LABEL[t.categoria] || t.categoria, PRIORIDAD_LABEL[t.prioridad] || t.prioridad,
      ESTADO_LABEL[t.estado] || t.estado, MODULO_LABEL[t.modulo] || '', t.created_by_name, t.created_by_email,
      ROL_LABEL[t.created_by_rol] || t.created_by_rol || '', fmtCsvFecha(t.fecha_incidencia || t.created_at),
      fmtCsvFecha(t.created_at), fmtCsvFecha(t.cerrado_at), horas, fmtCsvFecha(fechaBorrado(t)),
      t.descripcion, conv.length,
      conv.map((m) => `[${fmtCsvFecha(m.created_at)}] ${m.user_name || 'Usuario'}${m.es_soporte ? ' (Soporte)' : ''}: ${m.mensaje}`).join('\n'),
    ];
  });
  return toCsv(header, rows);
}

// Tickets cerrados agrupados por mes de cierre: lo ya borrado (recuento
// guardado en soporte_cierres_mensuales) + lo que todavía existe.
export async function getEstadisticasMensuales(organizacionId: string) {
  const { rows } = await pool.query(
    `SELECT to_char(mes, 'YYYY-MM') AS mes, categoria, SUM(total)::int AS total, SUM(horas) AS horas
       FROM (
         SELECT mes, categoria, total, suma_horas_resolucion AS horas
           FROM soporte_cierres_mensuales WHERE organizacion_id = $1
         UNION ALL
         SELECT date_trunc('month', cerrado_at AT TIME ZONE 'Europe/Madrid')::date, categoria, 1,
                EXTRACT(EPOCH FROM (cerrado_at - created_at)) / 3600
           FROM soporte_tickets
          WHERE organizacion_id = $1 AND estado = 'cerrado' AND cerrado_at IS NOT NULL
       ) x
      GROUP BY mes, categoria
      ORDER BY mes DESC`,
    [organizacionId],
  );
  const meses = new Map<string, { mes: string; total: number; porCategoria: Record<string, number>; horas: number }>();
  for (const r of rows) {
    if (!meses.has(r.mes)) meses.set(r.mes, { mes: r.mes, total: 0, porCategoria: {}, horas: 0 });
    const m = meses.get(r.mes)!;
    m.total += r.total;
    m.horas += Number(r.horas) || 0;
    m.porCategoria[r.categoria] = (m.porCategoria[r.categoria] || 0) + r.total;
  }
  return [...meses.values()].map((m) => ({
    mes: m.mes,
    total: m.total,
    porCategoria: m.porCategoria,
    horasMediaResolucion: m.total ? m.horas / m.total : null,
  }));
}

function mesLabel(mes: string): string {
  const [y, mo] = mes.split('-').map(Number);
  const s = new Date(Date.UTC(y, mo - 1, 15)).toLocaleString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// GET /api/soporte/estadisticas
export async function getEstadisticas(req: Request, res: Response) {
  try {
    const ctx = requireCtx(req, res);
    if (!ctx) return;
    if (!isGestor(ctx.rol)) return err(res, 'Solo los informáticos del despacho pueden ver las estadísticas.', 403);
    return ok(res, await getEstadisticasMensuales(ctx.organizacionId));
  } catch (e: any) {
    return err(res, e?.message || String(e));
  }
}

// GET /api/soporte/export?tipo=pendientes|cerrados|todos|mensual — descarga CSV
export async function exportCsv(req: Request, res: Response) {
  try {
    const ctx = requireCtx(req, res);
    if (!ctx) return;
    if (!isGestor(ctx.rol)) return err(res, 'Solo los informáticos del despacho pueden descargar tickets.', 403);
    const tipo = String(req.query.tipo || 'cerrados');
    const hoy = new Date().toISOString().slice(0, 10);
    let csv: string;
    let nombre: string;

    if (tipo === 'mensual') {
      const stats = await getEstadisticasMensuales(ctx.organizacionId);
      csv = toCsv(
        ['Mes', 'Tickets cerrados', ...CATEGORIAS.map((c) => CATEGORIA_LABEL[c]), 'Tiempo medio hasta el cierre (horas)'],
        stats.map((s) => [
          mesLabel(s.mes), s.total, ...CATEGORIAS.map((c) => s.porCategoria[c] || 0),
          s.horasMediaResolucion != null ? s.horasMediaResolucion.toFixed(1).replace('.', ',') : '',
        ]),
      );
      nombre = `soporte-resumen-mensual-${hoy}.csv`;
    } else {
      const where = tipo === 'todos' ? '' : `AND estado = 'cerrado'`;
      const { rows } = await pool.query(
        `SELECT * FROM soporte_tickets WHERE organizacion_id = $1 ${where} ORDER BY numero ASC`,
        [ctx.organizacionId],
      );
      const limite = Date.now() + AVISO_DIAS_ANTES * DIA_MS;
      const tickets = tipo === 'pendientes'
        ? rows.filter((t) => { const f = fechaBorrado(t); return f && f.getTime() <= limite; })
        : rows;
      csv = await buildTicketsCsv(tickets);
      nombre = `soporte-tickets-${tipo === 'pendientes' ? 'a-borrar' : tipo}-${hoy}.csv`;
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    return res.send(csv);
  } catch (e: any) {
    return err(res, e?.message || String(e));
  }
}
