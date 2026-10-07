import { Response } from 'express';
import pool from '../config/database';
import { logActivityForReq, resolveUserName } from './activityController';
import { createExpediente } from './expedientesController';
import { saveExpedienteAttachmentFromBuffer } from './filesController';
import { loadEmailContent, fetchEmailAttachmentBuffer, sendFromMailbox } from './emailController';
import {
  normalizeVistasConfig,
  findAgendaConflicts,
  renderPlantilla,
  buildRespuestaHtml,
  computeRecordatorioAt,
  formatMadrid,
  geminiAvailable,
  normalizeAutos,
  normalizeNig,
  VistasConfig,
  PlantillaVars,
} from '../services/vistasAutomation';
import { reconcileVistasIdle } from '../services/vistasIdle';

// ── Automatización de vistas: configuración y decisiones del abogado ────────
// La parte automática (leer el correo, extraer datos, comprobar la agenda,
// avisar) vive en services/vistasAutomation.ts. Aquí: el toggle por
// organización y los pasos 4-8 del flujo, que solo ocurren cuando una persona
// pulsa "Aceptar" o "Rechazar".

const ok = (res: Response, data: any) => res.json({ success: true, data });
const fail = (res: Response, msg: string, s = 500) => res.status(s).json({ success: false, error: msg });

const isManagerRol = (rol: string | undefined) => rol === 'propietario' || rol === 'admin';

async function loadOrgVistas(organizacionId: string) {
  const { rows } = await pool.query(
    `SELECT id, nombre, vistas_auto_enabled, vistas_auto_config, vistas_auto_activated_at,
            vistas_auto_last_run_at, vistas_auto_last_error
       FROM organizaciones WHERE id = $1`,
    [organizacionId],
  );
  if (!rows.length) return null;
  const org = rows[0];
  return { org, cfg: normalizeVistasConfig(org.vistas_auto_config) };
}

// Permisos (06/10/2026): las vistas son correos de un buzón concreto, así que
// solo las ven quien recibe ese correo (dueño del buzón vigilado) y el abogado
// responsable. Propietario/administradores solo activan y configuran la
// automatización; el rol soporte no ve nada de esto.
const isSoporte = (req: any) => req.organizacionRol === 'soporte';

/** El abogado responsable o el dueño del buzón vigilado (nunca soporte). */
function canSeeVistas(req: any, cfg: VistasConfig, mailboxOwner: string | null): boolean {
  const uid = req.auth?.userId;
  return !isSoporte(req) && !!uid && (uid === cfg.responsableUserId || uid === mailboxOwner);
}

async function mailboxOwnerOf(organizacionId: string, cfg: VistasConfig): Promise<{ owner: string | null; label: string | null; hasRefreshToken?: boolean; email?: string }> {
  if (!cfg.mailbox) return { owner: null, label: null };
  if (cfg.mailbox.type === 'imap') {
    const { rows } = await pool.query(
      `SELECT user_id, label, email FROM email_accounts WHERE id = $1 AND organizacion_id = $2`,
      [cfg.mailbox.id, organizacionId],
    );
    return rows.length ? { owner: rows[0].user_id, label: `${rows[0].label || rows[0].email} <${rows[0].email}>`, email: rows[0].email } : { owner: null, label: null };
  }
  const { rows } = await pool.query(
    `SELECT user_id, email, refresh_token_enc FROM email_oauth_profiles WHERE id = $1 AND organizacion_id = $2`,
    [cfg.mailbox.id, organizacionId],
  );
  return rows.length
    ? { owner: rows[0].user_id, label: `Gmail · ${rows[0].email}`, hasRefreshToken: Boolean(rows[0].refresh_token_enc), email: rows[0].email }
    : { owner: null, label: null };
}

async function listMiembros(organizacionId: string) {
  const { rows } = await pool.query(
    `SELECT user_id, rol FROM organizacion_miembros WHERE organizacion_id = $1 ORDER BY created_at ASC`,
    [organizacionId],
  );
  return Promise.all(rows.map(async (r: any) => ({ userId: r.user_id, rol: r.rol, nombre: await resolveUserName(r.user_id) })));
}

// ── GET /api/vistas/config ──────────────────────────────────────────────────
export async function getVistasConfig(req: any, res: Response) {
  try {
    const loaded = await loadOrgVistas(req.organizacionId);
    if (!loaded) return fail(res, 'Organización no encontrada', 404);
    const { org, cfg } = loaded;
    const mailbox = await mailboxOwnerOf(org.id, cfg);
    const canManage = isManagerRol(req.organizacionRol);
    const canSee = canSeeVistas(req, cfg, mailbox.owner);
    const base = { enabled: Boolean(org.vistas_auto_enabled), canManage, canSee };
    // ?lite=1: lo único que necesita el menú lateral (se consulta cada minuto).
    // La configuración (buzón vigilado, textos, firma) solo la ven quienes la gestionan.
    if (!canManage || req.query?.lite === '1') return ok(res, base);

    const uid = req.auth?.userId;
    // Solo se ofrecen como buzón a vigilar los del propio usuario -- un
    // administrador no puede poner a leer automáticamente el correo de otra
    // persona. El ya configurado se muestra siempre (aunque sea de otro).
    const [accounts, profiles, miembros] = await Promise.all([
      pool.query(
        `SELECT id, label, email FROM email_accounts WHERE organizacion_id = $1 AND user_id = $2 AND active = true ORDER BY created_at`,
        [org.id, uid],
      ),
      pool.query(
        `SELECT id, email, refresh_token_enc FROM email_oauth_profiles WHERE organizacion_id = $1 AND user_id = $2 ORDER BY created_at`,
        [org.id, uid],
      ),
      listMiembros(org.id),
    ]);
    const mailboxOptions = [
      ...accounts.rows.map((a: any) => ({ type: 'imap', id: a.id, label: `${a.label || a.email} <${a.email}>`, warning: null })),
      ...profiles.rows.map((p: any) => ({
        type: 'gmail', id: p.id, label: `Gmail · ${p.email}`,
        warning: p.refresh_token_enc ? null : 'Este Gmail se conectó antes de poder trabajar en segundo plano: vuelve a conectarlo desde Correo para que la automatización pueda leerlo.',
      })),
    ];
    if (cfg.mailbox && !mailboxOptions.some((m) => m.id === cfg.mailbox!.id) && mailbox.label) {
      mailboxOptions.push({ type: cfg.mailbox.type, id: cfg.mailbox.id, label: `${mailbox.label} (de otro usuario)`, warning: null });
    }

    // Otras organizaciones (de las que eres miembro) que vigilan este mismo
    // buzón: cada una crea su vista; el aviso solo te llega una vez.
    let mailboxCompartidoCon: string[] = [];
    if (org.vistas_auto_enabled && mailbox.email) {
      const { rows: otras } = await pool.query(
        `SELECT o.nombre FROM organizaciones o
           JOIN organizacion_miembros m ON m.organizacion_id = o.id AND m.user_id = $3
          WHERE o.id <> $1 AND o.vistas_auto_enabled = true
            AND (EXISTS (SELECT 1 FROM email_accounts a WHERE a.id::text = o.vistas_auto_config->'mailbox'->>'id' AND lower(a.email) = lower($2))
              OR EXISTS (SELECT 1 FROM email_oauth_profiles p WHERE p.id::text = o.vistas_auto_config->'mailbox'->>'id' AND lower(p.email) = lower($2)))
          ORDER BY o.nombre`,
        [org.id, mailbox.email, uid],
      );
      mailboxCompartidoCon = otras.map((r: any) => r.nombre);
    }

    return ok(res, {
      ...base,
      config: cfg,
      mailboxCompartidoCon,
      mailboxLabel: mailbox.label,
      mailboxWarning: cfg.mailbox?.type === 'gmail' && mailbox.label && !mailbox.hasRefreshToken
        ? 'El Gmail vigilado necesita volver a conectarse desde Correo para poder leerse en segundo plano.'
        : (cfg.mailbox && !mailbox.label ? 'El buzón configurado ya no existe. Elige otro.' : null),
      mailboxOptions,
      miembros,
      activatedAt: org.vistas_auto_activated_at,
      lastRunAt: org.vistas_auto_last_run_at,
      lastError: org.vistas_auto_last_error,
      iaDisponible: geminiAvailable(),
    });
  } catch (e: any) {
    return fail(res, e?.message || 'Error leyendo la configuración de vistas');
  }
}

// ── POST /api/vistas/config/preview ─────────────────────────────────────────
// Vista previa de los correos de respuesta con la configuración que se está
// editando (aún sin guardar) y unos datos de ejemplo. Usa el mismo render que
// el envío real, así lo que se ve es lo que sale.
export async function previewVistasConfigCorreo(req: any, res: Response) {
  try {
    if (!isManagerRol(req.organizacionRol)) return fail(res, 'Solo el propietario o un administrador pueden configurar esta automatización.', 403);
    const loaded = await loadOrgVistas(req.organizacionId);
    if (!loaded) return fail(res, 'Organización no encontrada', 404);
    const cfg = normalizeVistasConfig({ ...loaded.cfg, ...(req.body?.config || {}) });
    const ejemploFecha = new Date(Date.now() + 14 * 86_400_000);
    ejemploFecha.setUTCHours(9, 30, 0, 0);
    const vars: PlantillaVars = {
      asunto_original: 'Señalamiento de vista - Autos 945/2026',
      fecha: formatMadrid(ejemploFecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      hora: formatMadrid(ejemploFecha, { hour: '2-digit', minute: '2-digit' }),
      juzgado: 'Juzgado de Primera Instancia nº 3 de Murcia',
      autos: '945/2026',
      abogado: req.auth?.userId ? await resolveUserName(req.auth.userId) : 'Abogado',
      despacho: loaded.org.nombre || '',
      mensaje: '',
    };
    const original = {
      from: 'Procurador Ejemplo <procurador@ejemplo.es>',
      fecha: new Date(),
      texto: 'Buenos días,\n\nLes comunico que se ha señalado vista en los autos 945/2026.\n\nUn saludo.',
    };
    const render = (tpl: typeof cfg.plantillaAceptar) => {
      const r = renderPlantilla(tpl, vars, cfg.correo);
      return { asunto: r.asunto, html: buildRespuestaHtml(r.texto, cfg.correo, original) };
    };
    return ok(res, { aceptar: render(cfg.plantillaAceptar), rechazar: render(cfg.plantillaRechazar) });
  } catch (e: any) {
    return fail(res, e?.message || 'Error generando la vista previa');
  }
}

// ── PUT /api/vistas/config ──────────────────────────────────────────────────
export async function updateVistasConfig(req: any, res: Response) {
  try {
    if (!isManagerRol(req.organizacionRol)) {
      return fail(res, 'Solo el propietario o un administrador pueden cambiar esta automatización.', 403);
    }
    const loaded = await loadOrgVistas(req.organizacionId);
    if (!loaded) return fail(res, 'Organización no encontrada', 404);
    const { org, cfg: current } = loaded;
    const enabled = req.body?.enabled === true;
    // La dirección desde la que se usa Vantia, para el enlace de los avisos
    // por correo (el backend no la conoce de otra forma).
    const origin = String(req.headers?.origin || '');
    const next = normalizeVistasConfig({ ...current, ...(req.body?.config || {}), ...(/^https?:\/\//.test(origin) ? { appUrl: origin } : {}) });
    const uid = req.auth?.userId;

    // Un único interruptor, sin pantalla de configuración: al activar, si no
    // hay un buzón válido ya elegido, se vigila uno del propio usuario en esta
    // organización (primero una cuenta IMAP, si no un Gmail que pueda leerse
    // en segundo plano).
    if (enabled && (!next.mailbox || !(await mailboxOwnerOf(org.id, next)).owner)) {
      const { rows: acc } = await pool.query(
        `SELECT id FROM email_accounts WHERE organizacion_id = $1 AND user_id = $2 AND active = true ORDER BY created_at LIMIT 1`,
        [org.id, uid],
      );
      if (acc.length) {
        next.mailbox = { type: 'imap', id: acc[0].id };
      } else {
        const { rows: gp } = await pool.query(
          `SELECT id FROM email_oauth_profiles WHERE organizacion_id = $1 AND user_id = $2 AND refresh_token_enc IS NOT NULL ORDER BY created_at LIMIT 1`,
          [org.id, uid],
        );
        if (!gp.length) {
          return fail(res, 'Conecta primero tu correo en el módulo Correo (en esta organización) para que la automatización tenga un buzón que vigilar.', 400);
        }
        next.mailbox = { type: 'gmail', id: gp[0].id };
      }
    }

    if (next.mailbox) {
      const changed = next.mailbox.id !== current.mailbox?.id;
      const table = next.mailbox.type === 'imap' ? 'email_accounts' : 'email_oauth_profiles';
      const { rows } = await pool.query(
        `SELECT user_id FROM ${table} WHERE id = $1 AND organizacion_id = $2`,
        [next.mailbox.id, org.id],
      );
      if (!rows.length) return fail(res, 'El buzón elegido no existe en esta organización.', 400);
      if (changed && rows[0].user_id !== uid) {
        return fail(res, 'Solo puedes elegir un buzón conectado por ti.', 403);
      }
    }
    if (enabled && !next.mailbox) return fail(res, 'Elige el buzón de correo que recibe las vistas antes de activar la automatización.', 400);
    if (next.responsableUserId) {
      const { rows } = await pool.query(
        `SELECT 1 FROM organizacion_miembros WHERE organizacion_id = $1 AND user_id = $2`,
        [org.id, next.responsableUserId],
      );
      if (!rows.length) return fail(res, 'El abogado responsable no pertenece a esta organización.', 400);
    }

    // Se empieza a vigilar "desde ahora" al activar o al cambiar de buzón:
    // nunca se procesa la bandeja histórica ni lo recibido mientras estaba apagado.
    const restart = enabled && (!org.vistas_auto_enabled || next.mailbox?.id !== current.mailbox?.id);
    await pool.query(
      `UPDATE organizaciones
          SET vistas_auto_enabled = $2,
              vistas_auto_config = $3,
              vistas_auto_activated_at = CASE WHEN $4 THEN NOW() ELSE vistas_auto_activated_at END,
              vistas_auto_last_error = CASE WHEN $4 THEN NULL ELSE vistas_auto_last_error END,
              updated_at = NOW()
        WHERE id = $1`,
      [org.id, enabled, JSON.stringify(next), restart],
    );
    await logActivityForReq(req, enabled === Boolean(org.vistas_auto_enabled)
      ? 'Configuración de la automatización de vistas actualizada'
      : `Automatización de vistas ${enabled ? 'activada' : 'desactivada'}`, 'ORGANIZACION', org.id, org.nombre);
    // Abrir (o cerrar) ya la escucha inmediata del buzón, sin esperar al minuto.
    void reconcileVistasIdle();
    return getVistasConfig(req, res);
  } catch (e: any) {
    return fail(res, e?.message || 'Error guardando la configuración de vistas');
  }
}

// ── Listado / detalle ───────────────────────────────────────────────────────

const LIST_FIELDS = `id, estado, from_email, from_name, subject, received_at, datos, extraccion_origen,
  fecha_vista, duracion_min, responsable_user_id, responsable_nombre, conflictos, expediente_id,
  agenda_event_id, recordatorio_at, recordatorio_enviado_at, pasos, error, decidido_por_nombre,
  decidido_at, created_at, tipo, relacion`;

/** Condición SQL de visibilidad: cada uno ve solo las suyas (como abogado
 *  responsable o dueño del buzón), también propietario/admin; soporte, nada. */
function scopeCond(req: any, params: any[]): string {
  if (isSoporte(req)) return ' AND false';
  params.push(req.auth?.userId || '');
  return ` AND (responsable_user_id = $${params.length} OR mailbox_user_id = $${params.length})`;
}

export async function listVistas(req: any, res: Response) {
  try {
    const estado = String(req.query.estado || 'pendiente');
    const params: any[] = [req.organizacionId];
    let cond = `organizacion_id = $1`;
    if (estado === 'todas') cond += ` AND estado <> 'ignorada'`;
    else if (estado === 'pendiente') cond += ` AND estado IN ('pendiente','procesando','error')`;
    // 'Aceptadas' incluye lo resuelto sin crear vista nueva (documentación
    // añadida a un expediente, vista existente modificada).
    else if (estado === 'aceptada') cond += ` AND estado IN ('aceptada','documentada','modificada')`;
    else { params.push(estado); cond += ` AND estado = $${params.length}`; }
    cond += scopeCond(req, params);
    const order = estado === 'aceptada' ? 'fecha_vista DESC NULLS LAST' : 'created_at DESC';
    const { rows } = await pool.query(
      `SELECT ${LIST_FIELDS} FROM vistas_solicitudes WHERE ${cond} ORDER BY ${order} LIMIT 200`,
      params,
    );
    return ok(res, rows);
  } catch (e: any) {
    return fail(res, e?.message || 'Error listando vistas');
  }
}

/** GET /api/vistas/avisos — para la campana (se sondea cada pocos segundos,
 *  así que es una sola consulta indexada). */
export async function getVistasAvisos(req: any, res: Response) {
  try {
    // Con la automatización apagada el módulo no existe: la campana no avisa.
    const { rows: on } = await pool.query(`SELECT vistas_auto_enabled FROM organizaciones WHERE id = $1`, [req.organizacionId]);
    if (!on[0]?.vistas_auto_enabled) return ok(res, []);
    const params: any[] = [req.organizacionId];
    const scope = scopeCond(req, params);
    const { rows } = await pool.query(
      `SELECT id, estado, tipo, subject, fecha_vista, datos->>'juzgado' AS juzgado,
              jsonb_array_length(conflictos) AS num_conflictos, recordatorio_at, created_at
         FROM vistas_solicitudes
        WHERE organizacion_id = $1 ${scope}
          AND (estado = 'pendiente'
               OR (estado = 'aceptada' AND recordatorio_at <= NOW() AND fecha_vista > NOW()))
        ORDER BY created_at DESC
        LIMIT 20`,
      params,
    );
    return ok(res, rows);
  } catch (e: any) {
    return fail(res, e?.message || 'Error leyendo avisos de vistas');
  }
}

async function loadSolicitud(req: any, res: Response) {
  const loaded = await loadOrgVistas(req.organizacionId);
  if (!loaded) { fail(res, 'Organización no encontrada', 404); return null; }
  const { rows } = await pool.query(
    `SELECT * FROM vistas_solicitudes WHERE id = $1 AND organizacion_id = $2`,
    [req.params.id, req.organizacionId],
  );
  if (!rows.length) { fail(res, 'Solicitud de vista no encontrada', 404); return null; }
  const sol = rows[0];
  const uid = req.auth?.userId;
  if (isSoporte(req) || !uid || (uid !== sol.responsable_user_id && uid !== sol.mailbox_user_id && uid !== loaded.cfg.responsableUserId)) {
    fail(res, 'No tienes acceso a esta vista.', 403);
    return null;
  }
  return { sol, ...loaded };
}

async function findCoincidencias(organizacionId: string, datos: any) {
  // Normalizado: '000945/2023' y '945/2023' son los mismos autos.
  const autos = normalizeAutos(datos?.num_autos);
  const nig = normalizeNig(datos?.nig);
  if (!autos && !nig) return [];
  const { rows } = await pool.query(
    `SELECT id, anio, num_exp, descripcion, juzgado, num_autos, nig, cliente_nombre
       FROM expedientes
      WHERE organizacion_id = $1 AND (num_autos IS NOT NULL OR nig IS NOT NULL)
      ORDER BY created_at DESC
      LIMIT 5000`,
    [organizacionId],
  );
  return rows.filter((r: any) => (autos && normalizeAutos(r.num_autos) === autos) || (nig && normalizeNig(r.nig) === nig)).slice(0, 5);
}

export async function getVista(req: any, res: Response) {
  try {
    const ctx = await loadSolicitud(req, res);
    if (!ctx) return;
    const { sol, cfg } = ctx;
    let adjuntos: any[] = [];
    let emailDisponible = false;
    try {
      const { rows } = await pool.query(`SELECT attachments_json FROM emails WHERE id = $1`, [sol.email_id]);
      if (rows.length) {
        emailDisponible = true;
        adjuntos = JSON.parse(rows[0].attachments_json || '[]').map((a: any, i: number) => ({ index: i, filename: a.filename, contentType: a.contentType, size: a.size }));
      }
    } catch { /**/ }
    const [coincidencias, miembros] = await Promise.all([findCoincidencias(req.organizacionId, sol.datos), listMiembros(req.organizacionId)]);
    let expediente = null;
    if (sol.expediente_id) {
      const { rows } = await pool.query(
        `SELECT id, anio, num_exp, descripcion FROM expedientes WHERE id = $1 AND organizacion_id = $2`,
        [sol.expediente_id, req.organizacionId],
      );
      expediente = rows[0] || null;
    }
    return ok(res, {
      ...sol,
      adjuntos,
      emailDisponible,
      coincidencias,
      miembros,
      expediente,
      defaults: {
        duracionMin: cfg.duracionMin,
        recordatorioDias: cfg.recordatorioDias,
        recordatorioHora: cfg.recordatorioHora,
        guardarAdjuntos: cfg.guardarAdjuntos,
        responsableUserId: cfg.responsableUserId,
      },
    });
  } catch (e: any) {
    return fail(res, e?.message || 'Error leyendo la vista');
  }
}

function parseDate(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** GET /api/vistas/:id/conflictos?fecha=ISO&duracion=&responsable= — para
 *  volver a comprobar el hueco en vivo cuando el abogado cambia fecha/hora/
 *  responsable en el formulario antes de aceptar. */
export async function getVistaConflictos(req: any, res: Response) {
  try {
    const ctx = await loadSolicitud(req, res);
    if (!ctx) return;
    const fecha = parseDate(req.query.fecha) || (ctx.sol.fecha_vista ? new Date(ctx.sol.fecha_vista) : null);
    if (!fecha) return ok(res, []);
    const dur = Math.min(600, Math.max(15, Number(req.query.duracion) || ctx.sol.duracion_min || ctx.cfg.duracionMin));
    // 07/10/2026: ya no se elige abogado; la vista va a la agenda de quien la acepta.
    const responsable = String(req.auth?.userId || '');
    // Ni los eventos de esta solicitud ni, si es un cambio de fecha, la propia
    // vista que se va a mover cuentan como choque.
    const exclude = [ctx.sol.agenda_event_id, ctx.sol.recordatorio_event_id, ctx.sol.relacion?.vista?.agenda_event_id].filter(Boolean);
    return ok(res, await findAgendaConflicts(req.organizacionId, responsable, fecha, dur, exclude));
  } catch (e: any) {
    return fail(res, e?.message || 'Error comprobando la agenda');
  }
}

// ── Correo de respuesta ─────────────────────────────────────────────────────

async function buildPlantillaVars(req: any, ctx: { sol: any; org: any }, input: any): Promise<PlantillaVars> {
  const datos = { ...(ctx.sol.datos || {}), ...(input || {}) };
  const fecha = parseDate(input?.fecha) || (ctx.sol.fecha_vista ? new Date(ctx.sol.fecha_vista) : null);
  const abogadoId = input?.responsable_user_id || ctx.sol.responsable_user_id || req.auth?.userId;
  return {
    asunto_original: String(ctx.sol.subject || '').replace(/^\s*(re|rv|fw|fwd)\s*:\s*/i, ''),
    fecha: fecha ? formatMadrid(fecha, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '(fecha por confirmar)',
    hora: fecha ? formatMadrid(fecha, { hour: '2-digit', minute: '2-digit' }) : '',
    juzgado: String(datos.juzgado || '').trim(),
    autos: String(datos.num_autos || '').trim(),
    abogado: abogadoId ? await resolveUserName(abogadoId) : '',
    despacho: ctx.org.nombre || '',
    mensaje: String(input?.mensaje || '').trim(),
  };
}

/** POST /api/vistas/:id/preview { tipo: 'aceptar'|'rechazar', ...campos } */
export async function previewVistaCorreo(req: any, res: Response) {
  try {
    const ctx = await loadSolicitud(req, res);
    if (!ctx) return;
    const tipo = req.body?.tipo === 'rechazar' ? 'rechazar' : 'aceptar';
    const vars = await buildPlantillaVars(req, ctx, req.body);
    const tpl = tipo === 'aceptar' ? ctx.cfg.plantillaAceptar : ctx.cfg.plantillaRechazar;
    const r = renderPlantilla(tpl, vars, ctx.cfg.correo);
    return ok(res, {
      para: ctx.sol.from_email, asunto: r.asunto, texto: r.texto,
      firmaRegistrada: ctx.cfg.correo.firmaHtml ? (ctx.cfg.correo.firmaNombre || 'registrada') : null,
    });
  } catch (e: any) {
    return fail(res, e?.message || 'Error generando el correo');
  }
}

async function enviarRespuesta(ctx: { sol: any; cfg: VistasConfig }, asunto: string, texto: string, expedienteId: string | null) {
  if (!ctx.sol.from_email) throw new Error('El correo original no tiene remitente al que responder.');
  await sendFromMailbox({
    accountId: ctx.sol.account_id,
    gmailProfileId: ctx.sol.gmail_profile_id,
    to: ctx.sol.from_email,
    subject: asunto,
    html: buildRespuestaHtml(texto, ctx.cfg.correo, {
      from: ctx.sol.from_name ? `${ctx.sol.from_name} <${ctx.sol.from_email}>` : ctx.sol.from_email,
      fecha: ctx.sol.received_at ? new Date(ctx.sol.received_at) : null,
      texto: String(ctx.sol.body_text || ''),
    }),
    inReplyTo: ctx.sol.message_id,
    expedienteId,
  });
}

/** Pasa la solicitud a 'procesando' solo si sigue en uno de los estados
 *  esperados -- evita que un doble clic (o dos abogados a la vez) ejecuten
 *  el flujo dos veces. */
async function claim(id: string, from: string[]): Promise<string | null> {
  // El UPDATE bloquea la fila y, si otro lo cambió mientras esperaba,
  // vuelve a evaluar el WHERE con el estado nuevo -- solo uno gana.
  const { rows } = await pool.query(
    `WITH prev AS (SELECT estado FROM vistas_solicitudes WHERE id = $1)
     UPDATE vistas_solicitudes SET estado = 'procesando', updated_at = NOW()
      WHERE id = $1 AND estado = ANY($2::text[])
      RETURNING (SELECT estado FROM prev) AS previo`,
    [id, from],
  );
  return rows[0]?.previo || null;
}

async function unclaim(id: string, previo: string, error: string | null) {
  await pool.query(`UPDATE vistas_solicitudes SET estado = $2, error = $3, updated_at = NOW() WHERE id = $1`, [id, previo, error]);
}

function txt(v: any, max = 300): string | null {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, max) : null;
}

/** Llama al mismo handler que el botón "Nuevo expediente" (numeración por
 *  organización, cliente validado, trazabilidad) en vez de duplicar su lógica. */
async function crearExpedienteComoUsuario(req: any, body: any): Promise<any> {
  const fakeReq = Object.create(req);
  fakeReq.body = body;
  let status = 200;
  let payload: any = null;
  const fakeRes: any = {
    status(code: number) { status = code; return fakeRes; },
    json(data: any) { payload = data; return fakeRes; },
  };
  await createExpediente(fakeReq, fakeRes);
  if (status >= 400 || !payload?.data?.id) throw new Error(payload?.error || 'No se pudo crear el expediente');
  return payload.data;
}

type Paso = { paso: string; ok: boolean; detalle: string };

/** Paso común "documentación": vincula el correo al expediente, guarda sus
 *  adjuntos en los documentos del expediente (Drive/Dropbox según la
 *  organización) y el texto del correo como nota. Nunca lanza: devuelve el paso. */
async function guardarDocumentacion(sol: any, expedienteId: string, guardarAdjuntos: boolean, deciderName: string): Promise<Paso> {
  try {
    let guardados = 0;
    const fallidos: string[] = [];
    const email = await loadEmailContent(sol.email_id).catch(() => null);
    if (email) {
      await pool.query(`UPDATE emails SET expediente_id = $1 WHERE id = $2 AND expediente_id IS NULL`, [expedienteId, sol.email_id]);
      const adj = JSON.parse(email.attachments_json || '[]');
      if (guardarAdjuntos) {
        for (let i = 0; i < adj.length; i++) {
          try {
            const file = await fetchEmailAttachmentBuffer(sol.email_id, i);
            if (!file) { fallidos.push(adj[i]?.filename || `adjunto ${i + 1}`); continue; }
            await saveExpedienteAttachmentFromBuffer(expedienteId, file.content, file.filename, file.contentType, deciderName);
            guardados++;
          } catch {
            fallidos.push(adj[i]?.filename || `adjunto ${i + 1}`);
          }
        }
      }
    }
    const cuerpo = String(sol.body_text || '').trim();
    await pool.query(
      `INSERT INTO notes (expediente_id, content, category, priority, color, created_by)
       VALUES ($1,$2,'legal','alta','#FCA5A5',$3)`,
      [expedienteId, `✉️ Correo recibido — ${sol.from_name || sol.from_email || ''}\nAsunto: ${sol.subject || ''}\n\n${cuerpo.slice(0, 15000)}`, deciderName],
    );
    const detalle = !email
      ? 'El correo original ya no está en la bandeja: solo se guardó su texto como nota'
      : `${guardados} adjunto${guardados === 1 ? '' : 's'} guardado${guardados === 1 ? '' : 's'} y el correo como nota${fallidos.length ? ` · no se pudieron guardar: ${fallidos.join(', ')}` : ''}`;
    // ok aunque fallase algún adjunto: así un reintento no vuelve a guardar
    // (duplicados) los que sí se guardaron. El detalle lo dice.
    return { paso: 'documentos', ok: true, detalle };
  } catch (e: any) {
    return { paso: 'documentos', ok: false, detalle: e?.message || String(e) };
  }
}

// ── POST /api/vistas/:id/aceptar ────────────────────────────────────────────
export async function aceptarVista(req: any, res: Response) {
  const ctx = await loadSolicitud(req, res).catch((e) => { fail(res, e?.message || 'Error'); return null; });
  if (!ctx) return;
  const { sol, cfg } = ctx;
  const b = req.body || {};
  const fecha = parseDate(b.fecha);
  if (!fecha) return fail(res, 'Indica la fecha y hora de la vista.', 400);
  const duracion = Math.min(600, Math.max(15, Number(b.duracion_min) || sol.duracion_min || cfg.duracionMin));
  const uid = req.auth?.userId;

  // 07/10/2026: ya no se elige abogado; la vista va a la agenda de quien la acepta.
  let responsableId: string = String(uid);
  const { rows: miembro } = await pool.query(
    `SELECT 1 FROM organizacion_miembros WHERE organizacion_id = $1 AND user_id = $2`,
    [req.organizacionId, responsableId],
  );
  if (!miembro.length) responsableId = uid;
  const responsableNombre = await resolveUserName(responsableId);

  const previo = await claim(sol.id, ['pendiente', 'descartada', 'error']);
  if (!previo) return fail(res, 'Esta vista ya se está procesando o ya se decidió.', 409);

  const pasos: Paso[] = Array.isArray(sol.pasos) ? sol.pasos.filter((p: Paso) => p.ok) : [];
  const yaHecho = (paso: string) => pasos.some((p) => p.paso === paso && p.ok);
  const datos = {
    ...(sol.datos || {}),
    tipo_acto: txt(b.tipo_acto, 120) ?? sol.datos?.tipo_acto ?? null,
    juzgado: txt(b.juzgado) ?? sol.datos?.juzgado ?? null,
    sala: txt(b.sala, 120) ?? sol.datos?.sala ?? null,
    num_autos: txt(b.num_autos, 120) ?? sol.datos?.num_autos ?? null,
    nig: txt(b.nig, 60) ?? sol.datos?.nig ?? null,
  };
  const deciderName = await resolveUserName(uid);
  let expedienteId: string | null = sol.expediente_id || null;
  let agendaEventId: string | null = sol.agenda_event_id || null;
  let recordatorioEventId: string | null = sol.recordatorio_event_id || null;
  let recordatorioAt: Date | null = null;

  try {
    // 4 · Correo de confirmación al remitente. Si falla, no se toca nada más:
    // la solicitud vuelve a su estado y el abogado puede reintentar.
    if (b.enviar_correo !== false && !yaHecho('correo')) {
      try {
        const vars = await buildPlantillaVars(req, ctx, { ...b, ...datos, fecha, responsable_user_id: responsableId });
        const r = renderPlantilla(cfg.plantillaAceptar, vars, cfg.correo);
        await enviarRespuesta(ctx, txt(b.asunto, 900) || r.asunto, String(b.cuerpo || '').trim() || r.texto, expedienteId);
        pasos.push({ paso: 'correo', ok: true, detalle: `Confirmación enviada a ${sol.from_email}` });
      } catch (e: any) {
        await unclaim(sol.id, previo, `No se pudo enviar el correo: ${e?.message || e}`);
        return fail(res, `No se pudo enviar el correo de confirmación: ${e?.message || e}`, 502);
      }
    }

    // 5 · Expediente: uno existente de la organización o uno nuevo.
    if (!expedienteId) {
      try {
        const modo = b.expediente?.modo === 'existente' ? 'existente' : 'nuevo';
        if (modo === 'existente') {
          const { rows } = await pool.query(
            `SELECT id, anio, num_exp FROM expedientes WHERE id = $1 AND organizacion_id = $2`,
            [b.expediente?.id, req.organizacionId],
          );
          if (!rows.length) throw new Error('El expediente elegido no existe en esta organización');
          expedienteId = rows[0].id;
          pasos.push({ paso: 'expediente', ok: true, detalle: `Vinculada al expediente ${rows[0].anio}/${rows[0].num_exp}` });
        } else {
          const descripcion = txt(b.expediente?.descripcion, 500)
            || [datos.tipo_acto ? String(datos.tipo_acto).replace(/^./, (c: string) => c.toUpperCase()) : 'Vista', datos.num_autos ? `autos ${datos.num_autos}` : null, datos.juzgado].filter(Boolean).join(' · ');
          const exp = await crearExpedienteComoUsuario(req, {
            descripcion,
            tipo: 'judicial',
            cliente_id: b.expediente?.cliente_id || null,
            juzgado: datos.juzgado,
            num_autos: datos.num_autos,
            nig: datos.nig,
            tipo_proc: sol.datos?.tipo_procedimiento || null,
            contrario: sol.datos?.contrario || null,
            abogado_propio: responsableNombre,
            fecha_inicio: new Date().toISOString().slice(0, 10),
            observaciones: `Alta automática desde el correo "${sol.subject || ''}" de ${sol.from_name || sol.from_email || 'remitente desconocido'}.`,
          });
          expedienteId = exp.id;
          pasos.push({ paso: 'expediente', ok: true, detalle: `Expediente ${exp.anio}/${exp.num_exp} creado` });
        }
      } catch (e: any) {
        pasos.push({ paso: 'expediente', ok: false, detalle: e?.message || String(e) });
      }
    }

    // 6 · Agenda del abogado responsable.
    const { rows: expRow } = expedienteId
      ? await pool.query(`SELECT cliente_id FROM expedientes WHERE id = $1`, [expedienteId])
      : { rows: [] as any[] };
    const clienteId = expRow[0]?.cliente_id || null;
    const lugar = [datos.juzgado, datos.sala, sol.datos?.direccion].filter(Boolean).join(', ').slice(0, 300) || null;
    const tituloBase = `${datos.tipo_acto ? String(datos.tipo_acto).replace(/^./, (c: string) => c.toUpperCase()) : 'Vista'}${datos.num_autos ? ` · autos ${datos.num_autos}` : ''}`;
    const descripcionEvento = [
      datos.juzgado && `Juzgado: ${datos.juzgado}`,
      datos.sala && `Sala: ${datos.sala}`,
      datos.num_autos && `Autos: ${datos.num_autos}`,
      datos.nig && `NIG: ${datos.nig}`,
      sol.datos?.partes && `Partes: ${sol.datos.partes}`,
      sol.datos?.modalidad && `Modalidad: ${sol.datos.modalidad}`,
      sol.datos?.resumen,
      `Correo de origen: ${sol.from_email || ''} — "${sol.subject || ''}"`,
    ].filter(Boolean).join('\n');
    const enlace = /^https?:\/\//i.test(String(sol.datos?.enlace_telematico || '')) ? String(sol.datos.enlace_telematico).slice(0, 500) : null;

    if (agendaEventId) {
      await pool.query(
        `UPDATE agenda_events
            SET start_at = $2, end_at = $3, expediente_id = COALESCE(expediente_id, $5),
                cliente_id = COALESCE(cliente_id, $6), updated_at = NOW()
          WHERE id = $1 AND organizacion_id = $4`,
        [agendaEventId, fecha, new Date(fecha.getTime() + duracion * 60000), req.organizacionId, expedienteId, clienteId],
      );
    } else {
      try {
        const { rows } = await pool.query(
          `INSERT INTO agenda_events
             (user_id, user_name, title, description, start_at, end_at, all_day, type, status,
              expediente_id, cliente_id, location, source, meet_url, organizacion_id)
           VALUES ($1,$2,$3,$4,$5,$6,false,'vista','pendiente',$7,$8,$9,'vistas_auto',$10,$11)
           RETURNING id`,
          [
            responsableId, responsableNombre, `⚖️ ${tituloBase}`.slice(0, 300), descripcionEvento,
            fecha, new Date(fecha.getTime() + duracion * 60000), expedienteId, clienteId, lugar, enlace, req.organizacionId,
          ],
        );
        agendaEventId = rows[0].id;
        pasos.push({ paso: 'agenda', ok: true, detalle: `Añadida a la agenda de ${responsableNombre}` });
      } catch (e: any) {
        pasos.push({ paso: 'agenda', ok: false, detalle: e?.message || String(e) });
      }
    }

    // 7 · Documentación: adjuntos del correo + el propio correo como nota.
    if (expedienteId && !yaHecho('documentos')) {
      pasos.push(await guardarDocumentacion(sol, expedienteId, b.guardar_adjuntos ?? cfg.guardarAdjuntos, deciderName));
    }

    // 8 · Recordatorio de preparación (por defecto 1 día antes).
    const sinRecordatorio = b.recordatorio === false;
    recordatorioAt = sinRecordatorio ? null : (parseDate(b.recordatorio_at) || computeRecordatorioAt(fecha, sol.datos?.fecha_preparacion || null, cfg));
    if (recordatorioAt && recordatorioAt >= fecha) recordatorioAt = null;
    if (recordatorioAt) {
      try {
        if (recordatorioEventId) {
          await pool.query(
            `UPDATE agenda_events SET start_at = $2, end_at = $3, updated_at = NOW() WHERE id = $1 AND organizacion_id = $4`,
            [recordatorioEventId, recordatorioAt, new Date(recordatorioAt.getTime() + 30 * 60000), req.organizacionId],
          );
        } else {
          const { rows } = await pool.query(
            `INSERT INTO agenda_events
               (user_id, user_name, title, description, start_at, end_at, all_day, type, status,
                expediente_id, cliente_id, source, organizacion_id)
             VALUES ($1,$2,$3,$4,$5,$6,false,'tarea','pendiente',$7,$8,'vistas_auto',$9)
             RETURNING id`,
            [
              responsableId, responsableNombre, `📚 Preparar: ${tituloBase}`.slice(0, 300),
              `Vista el ${formatMadrid(fecha, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.\n${descripcionEvento}`,
              recordatorioAt, new Date(recordatorioAt.getTime() + 30 * 60000), expedienteId, clienteId, req.organizacionId,
            ],
          );
          recordatorioEventId = rows[0].id;
        }
        pasos.push({ paso: 'recordatorio', ok: true, detalle: `Recordatorio el ${formatMadrid(recordatorioAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` });
      } catch (e: any) {
        pasos.push({ paso: 'recordatorio', ok: false, detalle: e?.message || String(e) });
      }
    }

    // Un mismo paso puede aparecer varias veces tras reintentos -- se queda el último.
    const finalPasos = Object.values(pasos.reduce((acc: Record<string, Paso>, p) => { acc[p.paso] = p; return acc; }, {}));
    const errores = finalPasos.filter((p) => !p.ok);
    // Si falló algo imprescindible (expediente o agenda), queda en "error" para
    // poder reintentar desde la página de Vistas sin repetir lo ya hecho.
    const critico = errores.some((p) => p.paso === 'expediente' || p.paso === 'agenda');
    await pool.query(
      `UPDATE vistas_solicitudes
          SET estado = $2, datos = $3, fecha_vista = $4, duracion_min = $5,
              -- Aceptada como vista (aunque llegara como "cambio" o "documentación"):
              -- a partir de ahora es la vista de esos autos.
              tipo = 'vista',
              responsable_user_id = $6, responsable_nombre = $7, expediente_id = $8,
              agenda_event_id = $9, recordatorio_event_id = $10, recordatorio_at = $11,
              recordatorio_enviado_at = NULL, pasos = $12, error = $13,
              decidido_por = $14, decidido_por_nombre = $15, decidido_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [
        sol.id, critico ? 'error' : 'aceptada', JSON.stringify(datos), fecha, duracion,
        responsableId, responsableNombre, expedienteId, agendaEventId, recordatorioEventId, recordatorioAt,
        JSON.stringify(finalPasos), errores.length ? errores.map((p) => `${p.paso}: ${p.detalle}`).join(' | ') : null,
        uid, deciderName,
      ],
    );
    await logActivityForReq(req, `Vista aceptada: ${tituloBase}`, expedienteId ? 'EXPEDIENTE' : 'AGENDA', expedienteId || agendaEventId || undefined, sol.subject || undefined);
    return ok(res, { estado: critico ? 'error' : 'aceptada', pasos: finalPasos, expedienteId, agendaEventId });
  } catch (e: any) {
    await pool.query(
      `UPDATE vistas_solicitudes SET estado = 'error', pasos = $2, error = $3, expediente_id = COALESCE($4, expediente_id),
              agenda_event_id = COALESCE($5, agenda_event_id), recordatorio_event_id = COALESCE($6, recordatorio_event_id), updated_at = NOW()
        WHERE id = $1`,
      [sol.id, JSON.stringify(pasos), e?.message || String(e), expedienteId, agendaEventId, recordatorioEventId],
    ).catch(() => {});
    return fail(res, e?.message || 'Error procesando la vista');
  }
}

// ── POST /api/vistas/:id/rechazar ───────────────────────────────────────────
export async function rechazarVista(req: any, res: Response) {
  try {
    const ctx = await loadSolicitud(req, res);
    if (!ctx) return;
    const { sol, cfg } = ctx;
    const b = req.body || {};
    const previo = await claim(sol.id, ['pendiente', 'descartada']);
    if (!previo) return fail(res, 'Esta vista ya se está procesando o ya se decidió.', 409);

    const pasos: Paso[] = [];
    if (b.enviar_correo !== false) {
      try {
        const vars = await buildPlantillaVars(req, ctx, b);
        const r = renderPlantilla(cfg.plantillaRechazar, vars, cfg.correo);
        await enviarRespuesta(ctx, txt(b.asunto, 900) || r.asunto, String(b.cuerpo || '').trim() || r.texto, null);
        pasos.push({ paso: 'correo', ok: true, detalle: `Respuesta de rechazo enviada a ${sol.from_email}` });
      } catch (e: any) {
        await unclaim(sol.id, previo, `No se pudo enviar el correo: ${e?.message || e}`);
        return fail(res, `No se pudo enviar el correo de rechazo: ${e?.message || e}`, 502);
      }
    }
    const uid = req.auth?.userId;
    await pool.query(
      `UPDATE vistas_solicitudes SET estado = 'rechazada', pasos = $2, error = NULL,
              decidido_por = $3, decidido_por_nombre = $4, decidido_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [sol.id, JSON.stringify(pasos), uid, await resolveUserName(uid)],
    );
    await logActivityForReq(req, `Vista rechazada: ${sol.subject || ''}`, 'AGENDA', sol.id, sol.from_email || undefined);
    return ok(res, { estado: 'rechazada', pasos });
  } catch (e: any) {
    return fail(res, e?.message || 'Error rechazando la vista');
  }
}

// ── POST /api/vistas/:id/documentar ─────────────────────────────────────────
// Correo de un procedimiento que ya tiene expediente (mismos autos/NIG):
// se añade su documentación a ese expediente, sin crear nada nuevo.
export async function documentarVista(req: any, res: Response) {
  try {
    const ctx = await loadSolicitud(req, res);
    if (!ctx) return;
    const { sol, cfg } = ctx;
    const b = req.body || {};
    const expedienteId = String(b.expediente_id || sol.relacion?.expediente?.id || '');
    const { rows: exp } = await pool.query(
      `SELECT id, anio, num_exp FROM expedientes WHERE id = $1 AND organizacion_id = $2`,
      [expedienteId, req.organizacionId],
    );
    if (!exp.length) return fail(res, 'Elige el expediente al que añadir la documentación.', 400);
    const previo = await claim(sol.id, ['pendiente', 'descartada', 'error']);
    if (!previo) return fail(res, 'Esta solicitud ya se está procesando o ya se decidió.', 409);

    const uid = req.auth?.userId;
    const deciderName = await resolveUserName(uid);
    const pasos: Paso[] = [await guardarDocumentacion(sol, exp[0].id, b.guardar_adjuntos ?? cfg.guardarAdjuntos, deciderName)];
    pasos[0].detalle = `Expediente ${exp[0].anio}/${exp[0].num_exp}: ${pasos[0].detalle}`;
    await pool.query(
      `UPDATE vistas_solicitudes SET estado = $2, expediente_id = $3, pasos = $4, error = $5,
              decidido_por = $6, decidido_por_nombre = $7, decidido_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [sol.id, pasos[0].ok ? 'documentada' : 'error', exp[0].id, JSON.stringify(pasos), pasos[0].ok ? null : pasos[0].detalle, uid, deciderName],
    );
    await logActivityForReq(req, `Documentación añadida desde correo: ${sol.subject || ''}`, 'EXPEDIENTE', exp[0].id, sol.from_email || undefined);
    return ok(res, { estado: pasos[0].ok ? 'documentada' : 'error', pasos, expedienteId: exp[0].id });
  } catch (e: any) {
    return fail(res, e?.message || 'Error añadiendo la documentación');
  }
}

// ── POST /api/vistas/:id/modificar ──────────────────────────────────────────
// Mismo procedimiento que una vista ya aceptada, con otra fecha (aplazamiento,
// cambio de hora/sala...): se mueve ESA vista -- evento de agenda,
// recordatorio de preparación -- en vez de crear otra, y se guarda la
// documentación en su expediente. Opcionalmente se confirma por correo.
export async function modificarVista(req: any, res: Response) {
  const ctx = await loadSolicitud(req, res).catch((e) => { fail(res, e?.message || 'Error'); return null; });
  if (!ctx) return;
  const { sol, cfg } = ctx;
  const b = req.body || {};
  const vistaId = String(b.vista_id || sol.relacion?.vista?.id || '');
  const { rows: origRows } = await pool.query(
    `SELECT * FROM vistas_solicitudes WHERE id = $1 AND organizacion_id = $2 AND estado = 'aceptada'`,
    [vistaId, req.organizacionId],
  );
  if (!origRows.length) return fail(res, 'No se encontró la vista aceptada que se quiere modificar.', 400);
  const orig = origRows[0];
  const fecha = parseDate(b.fecha) || (sol.fecha_vista ? new Date(sol.fecha_vista) : null);
  if (!fecha) return fail(res, 'Indica la nueva fecha y hora de la vista.', 400);
  const duracion = Math.min(600, Math.max(15, Number(b.duracion_min) || orig.duracion_min || cfg.duracionMin));

  const previo = await claim(sol.id, ['pendiente', 'descartada', 'error']);
  if (!previo) return fail(res, 'Esta solicitud ya se está procesando o ya se decidió.', 409);
  const uid = req.auth?.userId;
  const deciderName = await resolveUserName(uid);
  const pasos: Paso[] = [];
  const antes = orig.fecha_vista ? new Date(orig.fecha_vista) : null;
  const fmtLargo = (d: Date) => formatMadrid(d, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  // Correo de confirmación de la nueva fecha (opcional; si falla, no se toca nada).
  if (b.enviar_correo === true) {
    try {
      const vars = await buildPlantillaVars(req, { sol, org: ctx.org }, { ...orig.datos, ...b, fecha, responsable_user_id: orig.responsable_user_id });
      const r = renderPlantilla(cfg.plantillaAceptar, vars, cfg.correo);
      await enviarRespuesta({ sol, cfg }, txt(b.asunto, 900) || r.asunto, String(b.cuerpo || '').trim() || r.texto, orig.expediente_id);
      pasos.push({ paso: 'correo', ok: true, detalle: `Confirmación de la nueva fecha enviada a ${sol.from_email}` });
    } catch (e: any) {
      await unclaim(sol.id, previo, `No se pudo enviar el correo: ${e?.message || e}`);
      return fail(res, `No se pudo enviar el correo: ${e?.message || e}`, 502);
    }
  }

  try {
    const fin = new Date(fecha.getTime() + duracion * 60000);
    if (orig.agenda_event_id) {
      await pool.query(
        `UPDATE agenda_events SET start_at = $2, end_at = $3, updated_at = NOW() WHERE id = $1 AND organizacion_id = $4`,
        [orig.agenda_event_id, fecha, fin, req.organizacionId],
      );
    }
    pasos.push({ paso: 'agenda', ok: true, detalle: `Vista movida${antes ? ` del ${fmtLargo(antes)}` : ''} al ${fmtLargo(fecha)}` });

    let recordatorioAt: Date | null = computeRecordatorioAt(fecha, sol.datos?.fecha_preparacion || orig.datos?.fecha_preparacion || null, cfg);
    if (recordatorioAt && recordatorioAt >= fecha) recordatorioAt = null;
    if (orig.recordatorio_event_id && recordatorioAt) {
      await pool.query(
        `UPDATE agenda_events SET start_at = $2, end_at = $3, updated_at = NOW() WHERE id = $1 AND organizacion_id = $4`,
        [orig.recordatorio_event_id, recordatorioAt, new Date(recordatorioAt.getTime() + 30 * 60000), req.organizacionId],
      );
    }
    if (recordatorioAt) pasos.push({ paso: 'recordatorio', ok: true, detalle: `Recordatorio movido al ${fmtLargo(recordatorioAt)}` });

    await pool.query(
      `UPDATE vistas_solicitudes
          SET fecha_vista = $2, duracion_min = $3, recordatorio_at = $4, recordatorio_enviado_at = NULL,
              datos = datos || $5::jsonb, updated_at = NOW()
        WHERE id = $1`,
      [orig.id, fecha, duracion, recordatorioAt, JSON.stringify({ modificada_por_solicitud: sol.id, fecha_anterior: antes })],
    );

    if (orig.expediente_id) pasos.push(await guardarDocumentacion(sol, orig.expediente_id, b.guardar_adjuntos ?? cfg.guardarAdjuntos, deciderName));

    await pool.query(
      `UPDATE vistas_solicitudes SET estado = 'modificada', expediente_id = $2, fecha_vista = $3, duracion_min = $4,
              pasos = $5, error = NULL, decidido_por = $6, decidido_por_nombre = $7, decidido_at = NOW(), updated_at = NOW()
        WHERE id = $1`,
      [sol.id, orig.expediente_id, fecha, duracion, JSON.stringify(pasos), uid, deciderName],
    );
    await logActivityForReq(req, `Vista modificada: ${antes ? fmtLargo(antes) + ' → ' : ''}${fmtLargo(fecha)}`, orig.expediente_id ? 'EXPEDIENTE' : 'AGENDA', orig.expediente_id || orig.agenda_event_id || undefined, sol.subject || undefined);
    return ok(res, { estado: 'modificada', pasos, vistaId: orig.id });
  } catch (e: any) {
    await pool.query(`UPDATE vistas_solicitudes SET estado = 'error', pasos = $2, error = $3, updated_at = NOW() WHERE id = $1`,
      [sol.id, JSON.stringify(pasos), e?.message || String(e)]).catch(() => {});
    return fail(res, e?.message || 'Error modificando la vista');
  }
}

// ── POST /api/vistas/:id/descartar · /reabrir ───────────────────────────────
// Descartar = "no es una vista" (sin responder a nadie). Reabrir = el
// detector se equivocó y sí lo era: vuelve a pendientes para decidir.
export async function descartarVista(req: any, res: Response) {
  try {
    const ctx = await loadSolicitud(req, res);
    if (!ctx) return;
    const { rowCount } = await pool.query(
      `UPDATE vistas_solicitudes SET estado = 'descartada', updated_at = NOW() WHERE id = $1 AND estado = 'pendiente'`,
      [ctx.sol.id],
    );
    if (!rowCount) return fail(res, 'Solo se pueden descartar vistas pendientes.', 409);
    return ok(res, { estado: 'descartada' });
  } catch (e: any) {
    return fail(res, e?.message || 'Error descartando la vista');
  }
}

export async function reabrirVista(req: any, res: Response) {
  try {
    const ctx = await loadSolicitud(req, res);
    if (!ctx) return;
    const { rowCount } = await pool.query(
      `UPDATE vistas_solicitudes
          SET estado = 'pendiente',
              responsable_user_id = COALESCE(responsable_user_id, $2),
              duracion_min = COALESCE(duracion_min, $3),
              updated_at = NOW()
        WHERE id = $1 AND estado = 'descartada'`,
      [ctx.sol.id, ctx.cfg.responsableUserId, ctx.cfg.duracionMin],
    );
    if (!rowCount) return fail(res, 'Solo se pueden recuperar vistas descartadas.', 409);
    return ok(res, { estado: 'pendiente' });
  } catch (e: any) {
    return fail(res, e?.message || 'Error recuperando la vista');
  }
}

// ── POST /api/vistas/:id/cancelar ───────────────────────────────────────────
// Cancela una vista ya aceptada (07/10/2026): la quita de la agenda (vista y
// recordatorio), y deja de contar como "la vista de esos autos", así que otro
// señalamiento del mismo procedimiento se puede aceptar como vista nueva. El
// expediente y su documentación se conservan.
export async function cancelarVista(req: any, res: Response) {
  try {
    const ctx = await loadSolicitud(req, res);
    if (!ctx) return;
    const { sol } = ctx;
    const motivo = String(req.body?.motivo || '').trim().slice(0, 500);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT id, agenda_event_id, recordatorio_event_id, pasos FROM vistas_solicitudes
          WHERE id = $1 AND organizacion_id = $2 AND estado = 'aceptada' FOR UPDATE`,
        [sol.id, req.organizacionId],
      );
      if (!rows.length) {
        await client.query('ROLLBACK');
        return fail(res, 'Solo se pueden cancelar vistas aceptadas.', 409);
      }
      const eventos = [rows[0].agenda_event_id, rows[0].recordatorio_event_id].filter(Boolean);
      if (eventos.length) {
        await client.query(`DELETE FROM agenda_events WHERE id = ANY($1::uuid[]) AND organizacion_id = $2`, [eventos, req.organizacionId]);
      }
      const quien = await resolveUserName(req.auth?.userId);
      const pasos = [...(Array.isArray(rows[0].pasos) ? rows[0].pasos : []), {
        paso: 'cancelada', ok: true,
        detalle: `Cancelada por ${quien}${motivo ? `: ${motivo}` : ''}. Quitada de la agenda; el expediente se conserva.`,
      }];
      await client.query(
        `UPDATE vistas_solicitudes
            SET estado = 'cancelada', agenda_event_id = NULL, recordatorio_event_id = NULL,
                recordatorio_at = NULL, pasos = $2, updated_at = NOW()
          WHERE id = $1`,
        [sol.id, JSON.stringify(pasos)],
      );
      // Lo que estaba esperando como "cambio" o "repetición" de esta vista pasa
      // a ser una vista nueva del mismo expediente (si trae fecha).
      await client.query(
        `UPDATE vistas_solicitudes
            SET tipo = CASE WHEN fecha_vista IS NOT NULL THEN 'vista' ELSE tipo END,
                relacion = relacion - 'vista', updated_at = NOW()
          WHERE organizacion_id = $1 AND estado IN ('pendiente','descartada','error')
            AND relacion->'vista'->>'id' = $2`,
        [req.organizacionId, sol.id],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    await logActivityForReq(req, `Vista cancelada: ${sol.subject || ''}`.slice(0, 300), sol.expediente_id ? 'EXPEDIENTE' : 'AGENDA', sol.expediente_id || undefined, sol.subject || undefined);
    return ok(res, { estado: 'cancelada' });
  } catch (e: any) {
    return fail(res, e?.message || 'Error cancelando la vista');
  }
}

// ── GET /api/vistas/:id/adjuntos/:index ─────────────────────────────────────
// El abogado responsable no tiene por qué ser el dueño del buzón, así que no
// puede usar la descarga de Correo (filtrada por user_id) -- esta va por la
// visibilidad de la propia solicitud.
export async function downloadVistaAdjunto(req: any, res: Response) {
  try {
    const ctx = await loadSolicitud(req, res);
    if (!ctx) return;
    const file = await fetchEmailAttachmentBuffer(ctx.sol.email_id, Number(req.params.index));
    if (!file) return fail(res, 'Adjunto no disponible', 404);
    const ascii = file.filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    return res.send(file.content);
  } catch (e: any) {
    return fail(res, e?.message || 'Error descargando el adjunto');
  }
}
