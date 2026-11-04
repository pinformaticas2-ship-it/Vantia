import crypto from 'crypto';
import fs from 'fs';
import { Request, Response } from 'express';
import pool from '../config/database';
import { resolveUserName } from './activityController';
import {
  InstagramError, instagramConfigurado, instagramFaltaConfig, urlAutorizacionInstagram, cuentasCompartidasInstagram,
  instagramPublicBase, instagramVerifyToken, canjearCodigoInstagram, perfilInstagram, suscribirWebhooksInstagram,
  guardarCuentaInstagram, cuentaInstagram, paginaDeInstagram, tokenLargaDuracion, firmaValida, perfilRemitente, enviarMensajeInstagram, listarMediosInstagram,
  crearContenedorInstagram, estadoContenedorInstagram, publicarContenedorInstagram, comentariosInstagram,
  responderComentarioInstagram, ocultarComentarioInstagram, borrarComentarioInstagram, type FormatoInstagram,
} from '../utils/instagram';

// Comunicación Externa → Instagram. Conectar va por redirección completa
// (Vantia → Instagram → GET /api/instagram/callback → /dashboard/whatsapp?canal=instagram).
// Los mensajes llegan por el webhook (una URL para todos los despachos: se
// sabe de quién es cada uno por entry.id = cuenta de Instagram conectada).

const STATE_TTL_MIN = 15;
const VENTANA_MS = 24 * 3600 * 1000;
// Pasadas 24 h, una persona puede contestar hasta 7 días con la etiqueta HUMAN_AGENT.
const VENTANA_AGENTE_MS = 7 * 24 * 3600 * 1000;

const ok = (res: Response, data: any) => res.json({ success: true, data });
function err(res: Response, e: any, fallback = 'Error con Instagram') {
  const status = e instanceof InstagramError ? e.status : 500;
  return res.status(status).json({ success: false, error: e?.message || fallback, code: e?.code });
}
const ctx = (req: Request) => ({
  org: (req as any).organizacionId as string,
  rol: (req as any).organizacionRol as string,
  userId: (req as any).auth?.userId as string,
});
const esGestor = (rol: string) => rol === 'propietario' || rol === 'admin';

// GET /api/instagram/status
export async function getInstagramStatus(req: Request, res: Response) {
  try {
    const { org } = ctx(req);
    const configured = instagramConfigurado();
    const webhookUrl = `${instagramPublicBase()}/api/instagram/webhook`;
    const { rows } = await pool.query(
      `SELECT ig_user_id, username, name, profile_picture, scopes, token_expiry, webhook_ok, webhook_error, connected_at
         FROM instagram_cuentas WHERE organizacion_id=$1`, [org],
    );
    const base = { configured, faltaConfig: instagramFaltaConfig(), webhookUrl, verifyTokenConfigurado: Boolean(instagramVerifyToken()) };
    if (!rows.length) return ok(res, { ...base, connected: false });
    const r = rows[0];
    let account: any = { username: r.username, name: r.name, picture: r.profile_picture };
    let accountError: string | null = null;
    try {
      const c = await cuentaInstagram(org);
      const p = await perfilInstagram(c.token, c.igUserId);
      account = {
        username: p.username, name: p.name, picture: p.profile_picture_url,
        followers: p.followers_count, follows: p.follows_count, media: p.media_count,
      };
      await pool.query(
        `UPDATE instagram_cuentas SET username=$1, name=$2, profile_picture=$3, updated_at=NOW() WHERE organizacion_id=$4`,
        [p.username || null, p.name || null, p.profile_picture_url || null, org],
      );
    } catch (e: any) {
      accountError = e?.message || 'No se pudo leer la cuenta de Instagram';
    }
    const { rows: nl } = await pool.query(`SELECT COALESCE(SUM(no_leidos),0)::int AS n FROM instagram_contactos WHERE organizacion_id=$1`, [org]);
    return ok(res, {
      ...base, connected: true, account, accountError, noLeidos: nl[0].n,
      webhookOk: r.webhook_ok, webhookError: r.webhook_error, tokenExpira: r.token_expiry, connectedAt: r.connected_at,
      scopes: String(r.scopes || '').split(',').filter(Boolean),
    });
  } catch (e) { return err(res, e); }
}

// POST /api/instagram/connect → URL de autorización de Instagram
export async function startInstagramConnect(req: Request, res: Response) {
  try {
    const { org, rol, userId } = ctx(req);
    if (!esGestor(rol)) return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador pueden conectar Instagram.' });
    const returnOrigin = String(req.headers.origin || process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    if (!returnOrigin) return res.status(400).json({ success: false, error: 'No se sabe a qué dirección de Vantia volver.' });
    const state = crypto.randomBytes(24).toString('hex');
    await pool.query(`DELETE FROM instagram_oauth_states WHERE created_at < NOW() - INTERVAL '${STATE_TTL_MIN} minutes'`);
    await pool.query(
      `INSERT INTO instagram_oauth_states (state, organizacion_id, user_id, return_origin) VALUES ($1,$2,$3,$4)`,
      [state, org, userId, returnOrigin],
    );
    const url = urlAutorizacionInstagram(state);
    return ok(res, { url });
  } catch (e) { return err(res, e); }
}

// GET /api/instagram/callback — público: aquí vuelve el navegador desde Instagram.
export async function instagramCallback(req: Request, res: Response) {
  const state = String(req.query.state || '').replace(/#_$/, '');
  const { rows } = await pool.query(
    `DELETE FROM instagram_oauth_states WHERE state=$1 AND created_at > NOW() - INTERVAL '${STATE_TTL_MIN} minutes'
     RETURNING organizacion_id, user_id, return_origin`, [state],
  ).catch(() => ({ rows: [] as any[] }));
  const pending = rows[0];
  const fallbackOrigin = String(process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  const back = (result: 'ok' | 'error', message?: string) => {
    const origin = pending?.return_origin || fallbackOrigin;
    const qs = new URLSearchParams({ canal: 'instagram', instagram: result });
    if (message) qs.set('mensaje', message);
    if (!origin) return res.status(result === 'ok' ? 200 : 400).send(message || 'Instagram conectado. Ya puedes volver a Vantia.');
    return res.redirect(`${origin}/dashboard/whatsapp?${qs.toString()}`);
  };
  if (!pending) return back('error', 'La conexión con Instagram ha caducado. Vuelve a intentarlo.');
  if (req.query.error) {
    return back('error', req.query.error === 'access_denied' ? 'Has cancelado la conexión con Instagram.' : String(req.query.error_description || req.query.error));
  }
  const code = String(req.query.code || '');
  if (!code) return back('error', 'Instagram no ha devuelto el código de autorización.');
  try {
    let t = await canjearCodigoInstagram(code);
    // Con una configuración de token de usuario llega uno que caduca: se alarga.
    if (t.expiresIn) t = await tokenLargaDuracion(t.accessToken).catch(() => t);
    const { clientBusinessId, cuentas, permisos } = await cuentasCompartidasInstagram(t.accessToken);
    if (!cuentas.length) {
      console.warn('[instagram] sin cuentas compartidas; portfolio', clientBusinessId, 'permisos', permisos.join(','));
      const falta = permisos.length && !permisos.includes('business_management') ? ' Falta el permiso business_management en la configuración de Meta (usa una configuración con «token de acceso de usuario» que incluya business_management y pages_show_list).' : '';
      throw new InstagramError(`Meta no ha compartido ninguna cuenta de Instagram con Vantia.${falta}`
        + (permisos.length ? ` Permisos concedidos: ${permisos.join(', ')}.` : ' Vuelve a conectar y, al entrar, elige la cuenta profesional del despacho.'));
    }
    // Si el portfolio comparte varias, la primera que no esté ya en otro despacho.
    const { rows: ocupadas } = await pool.query(
      `SELECT ig_user_id FROM instagram_cuentas WHERE ig_user_id = ANY($1) AND organizacion_id<>$2`, [cuentas.map((c) => c.id), pending.organizacion_id],
    );
    const elegida = cuentas.find((c) => !ocupadas.some((o: any) => o.ig_user_id === c.id)) || cuentas[0];
    const perfil = await perfilInstagram(t.accessToken, elegida.id).catch(() => ({ id: elegida.id, username: elegida.username }));
    perfil.id = elegida.id;
    // Una cuenta de Instagram solo puede estar en un despacho (los mensajes se reparten por ella).
    const { rows: otra } = await pool.query(
      `SELECT organizacion_id FROM instagram_cuentas WHERE ig_user_id=$1 AND organizacion_id<>$2`, [elegida.id, pending.organizacion_id],
    );
    if (otra.length) return back('error', 'Esa cuenta de Instagram ya está conectada en otro despacho de Vantia.');
    // Token de usuario: se guarda el de la página vinculada (no caduca).
    const pagina = await paginaDeInstagram(t.accessToken, elegida.id);
    const guardado = pagina ? { accessToken: pagina.pageToken, expiresIn: null } : t;
    await guardarCuentaInstagram(pending.organizacion_id, pending.user_id, { ...guardado, clientBusinessId, pageId: pagina?.pageId }, perfil);
    try {
      await suscribirWebhooksInstagram({ igUserId: elegida.id, token: guardado.accessToken, pageId: pagina?.pageId });
      await pool.query(`UPDATE instagram_cuentas SET webhook_ok=TRUE, webhook_error=NULL WHERE organizacion_id=$1`, [pending.organizacion_id]);
    } catch (e: any) {
      await pool.query(`UPDATE instagram_cuentas SET webhook_ok=FALSE, webhook_error=$1 WHERE organizacion_id=$2`, [e?.message || String(e), pending.organizacion_id]);
    }
    return back('ok');
  } catch (e: any) {
    console.error('Instagram callback:', e?.message || e);
    return back('error', e?.message || 'No se pudo conectar Instagram.');
  }
}

// POST /api/instagram/conectar-token { token, igUserId? } — vía de pruebas:
// conecta con un identificador generado en el panel de Meta ("API setup with
// Unified login" → generar identificador), sin pasar por la ventana de Facebook.
export async function conectarConToken(req: Request, res: Response) {
  try {
    const { org, rol, userId } = ctx(req);
    if (!esGestor(rol)) return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador pueden conectar Instagram.' });
    const token = String(req.body?.token || '').trim();
    let igUserId = String(req.body?.igUserId || '').trim();
    if (token.length < 20) return res.status(400).json({ success: false, error: 'Pega el identificador de acceso completo.' });
    if (igUserId && !/^\d{5,25}$/.test(igUserId)) return res.status(400).json({ success: false, error: 'El ID de la cuenta de Instagram son solo números.' });

    let clientBusinessId: string | null = null;
    if (!igUserId) {
      const r = await cuentasCompartidasInstagram(token);
      clientBusinessId = r.clientBusinessId;
      if (!r.cuentas.length) {
        return res.status(400).json({ success: false, error: 'Con ese identificador no se ve ninguna cuenta de Instagram. Escribe también el ID de la cuenta.' });
      }
      igUserId = r.cuentas[0].id;
    }
    // Comprueba que el identificador da acceso de verdad a esa cuenta.
    const perfil = await perfilInstagram(token, igUserId);
    perfil.id = igUserId;
    const { rows: otra } = await pool.query(
      `SELECT 1 FROM instagram_cuentas WHERE ig_user_id=$1 AND organizacion_id<>$2`, [igUserId, org],
    );
    if (otra.length) return res.status(409).json({ success: false, error: 'Esa cuenta de Instagram ya está conectada en otro despacho de Vantia.' });
    // Con un token de usuario se guarda el de la página: no caduca si el de usuario era de larga duración.
    const pagina = await paginaDeInstagram(token, igUserId);
    const tokenCuenta = pagina?.pageToken || token;
    await guardarCuentaInstagram(org, userId, { accessToken: tokenCuenta, expiresIn: null, clientBusinessId, pageId: pagina?.pageId }, perfil);
    let webhookError: string | null = null;
    try { await suscribirWebhooksInstagram({ igUserId, token: tokenCuenta, pageId: pagina?.pageId }); }
    catch (e: any) { webhookError = e?.message || String(e); }
    await pool.query(`UPDATE instagram_cuentas SET webhook_ok=$1, webhook_error=$2 WHERE organizacion_id=$3`, [!webhookError, webhookError, org]);
    return ok(res, { username: perfil.username || null, webhookOk: !webhookError, webhookError });
  } catch (e) { return err(res, e); }
}

// POST /api/instagram/webhook/reintentar — vuelve a activar los avisos de mensajes.
export async function reintentarWebhook(req: Request, res: Response) {
  try {
    const { org, rol } = ctx(req);
    if (!esGestor(rol)) return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador.' });
    const c = await cuentaInstagram(org);
    try {
      await suscribirWebhooksInstagram(c);
      await pool.query(`UPDATE instagram_cuentas SET webhook_ok=TRUE, webhook_error=NULL WHERE organizacion_id=$1`, [org]);
      return ok(res, { webhookOk: true });
    } catch (e: any) {
      await pool.query(`UPDATE instagram_cuentas SET webhook_ok=FALSE, webhook_error=$1 WHERE organizacion_id=$2`, [e?.message || String(e), org]);
      throw e;
    }
  } catch (e) { return err(res, e); }
}

// DELETE /api/instagram — desconecta (borra el token; los mensajes se conservan).
export async function disconnectInstagram(req: Request, res: Response) {
  try {
    const { org, rol } = ctx(req);
    if (!esGestor(rol)) return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador pueden desconectar Instagram.' });
    await pool.query(`DELETE FROM instagram_cuentas WHERE organizacion_id=$1`, [org]);
    return ok(res, { connected: false });
  } catch (e) { return err(res, e); }
}

// ── Webhook (público) ─────────────────────────────────────────────────────

// GET /api/instagram/webhook — verificación de Meta al configurar el webhook.
export function verificarWebhook(req: Request, res: Response) {
  const esperado = instagramVerifyToken();
  if (req.query['hub.mode'] === 'subscribe' && esperado && req.query['hub.verify_token'] === esperado) {
    return res.status(200).send(String(req.query['hub.challenge'] || ''));
  }
  return res.sendStatus(403);
}

// POST /api/instagram/webhook — cuerpo en bruto (Buffer) para comprobar la firma.
export async function recibirWebhook(req: Request, res: Response) {
  const cuerpo: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  if (!firmaValida(cuerpo, req.headers['x-hub-signature-256'] as string | undefined)) return res.sendStatus(401);
  // Meta reintenta si no contestamos rápido: se responde ya y se procesa después.
  res.sendStatus(200);
  let datos: any;
  try { datos = JSON.parse(cuerpo.toString('utf8')); } catch { return; }
  procesarWebhook(datos).catch((e) => console.error('[instagram] webhook:', e?.message || e));
}

export async function procesarWebhook(datos: any): Promise<void> {
  if (datos?.object !== 'instagram') return;
  for (const entry of Array.isArray(datos.entry) ? datos.entry : []) {
    const { rows } = await pool.query(`SELECT organizacion_id FROM instagram_cuentas WHERE ig_user_id=$1`, [String(entry?.id || '')]);
    const org = rows[0]?.organizacion_id;
    if (!org) continue;
    for (const ev of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const m = ev?.message;
      if (!m?.mid || m.is_deleted || m.is_unsupported) continue;
      const echo = Boolean(m.is_echo);
      const igsid = String(echo ? ev?.recipient?.id : ev?.sender?.id || '');
      if (!igsid || igsid === String(entry.id)) continue;
      const fecha = ev.timestamp ? new Date(Number(ev.timestamp)) : new Date();
      const texto = m.text ? String(m.text) : null;
      const adjuntos = Array.isArray(m.attachments) && m.attachments.length
        ? m.attachments.map((a: any) => ({ tipo: a?.type, url: a?.payload?.url || null })) : null;
      const ins = await pool.query(
        `INSERT INTO instagram_mensajes (organizacion_id, igsid, mid, direccion, texto, adjuntos, enviado_por, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (organizacion_id, mid) WHERE mid IS NOT NULL DO NOTHING RETURNING id`,
        [org, igsid, m.mid, echo ? 'saliente' : 'entrante', texto, adjuntos ? JSON.stringify(adjuntos) : null, echo ? 'Desde Instagram' : null, fecha],
      );
      if (!ins.rowCount) continue; // ya estaba (p. ej. el eco de un mensaje enviado desde Vantia)
      const resumen = texto || (adjuntos ? `[${adjuntos[0].tipo === 'image' ? 'Imagen' : adjuntos[0].tipo === 'video' ? 'Vídeo' : adjuntos[0].tipo === 'audio' ? 'Audio' : 'Adjunto'}]` : '');
      await pool.query(
        `INSERT INTO instagram_contactos (organizacion_id, igsid, last_message_at, last_message_text, last_inbound_at, no_leidos)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (organizacion_id, igsid) DO UPDATE SET
           last_message_at = GREATEST(instagram_contactos.last_message_at, EXCLUDED.last_message_at),
           last_message_text = CASE WHEN EXCLUDED.last_message_at >= COALESCE(instagram_contactos.last_message_at, EXCLUDED.last_message_at) THEN EXCLUDED.last_message_text ELSE instagram_contactos.last_message_text END,
           last_inbound_at = COALESCE(GREATEST(instagram_contactos.last_inbound_at, EXCLUDED.last_inbound_at), instagram_contactos.last_inbound_at, EXCLUDED.last_inbound_at),
           no_leidos = instagram_contactos.no_leidos + EXCLUDED.no_leidos`,
        [org, igsid, fecha, resumen.slice(0, 300), echo ? null : fecha, echo ? 0 : 1],
      );
      if (!echo) await completarPerfil(org, igsid).catch(() => {});
    }
  }
}

/** Nombre, usuario y foto de quien escribe (una vez al día como mucho). */
async function completarPerfil(org: string, igsid: string) {
  const { rows } = await pool.query(
    `SELECT perfil_leido_at FROM instagram_contactos WHERE organizacion_id=$1 AND igsid=$2`, [org, igsid],
  );
  const leido = rows[0]?.perfil_leido_at;
  if (leido && Date.now() - new Date(leido).getTime() < 24 * 3600 * 1000) return;
  const c = await cuentaInstagram(org);
  const p = await perfilRemitente(c.token, igsid);
  await pool.query(
    `UPDATE instagram_contactos SET username=COALESCE($3, username), name=COALESCE($4, name), profile_pic=COALESCE($5, profile_pic), perfil_leido_at=NOW()
      WHERE organizacion_id=$1 AND igsid=$2`,
    [org, igsid, p?.username || null, p?.name || null, p?.profile_pic || null],
  );
}

// ── Bandeja de mensajes ───────────────────────────────────────────────────

// GET /api/instagram/conversaciones
export async function listarConversaciones(req: Request, res: Response) {
  try {
    const { org } = ctx(req);
    const { rows } = await pool.query(
      `SELECT c.igsid, c.username, c.name, c.profile_pic, c.client_id, c.last_message_at, c.last_message_text, c.no_leidos,
              c.last_inbound_at,
              e.first_name, e.last_name, e.commercial_name
         FROM instagram_contactos c
         LEFT JOIN entities e ON e.id = c.client_id AND e.organizacion_id = c.organizacion_id
        WHERE c.organizacion_id=$1
        ORDER BY c.last_message_at DESC NULLS LAST
        LIMIT 300`, [org],
    );
    return ok(res, rows.map((r) => ({
      igsid: r.igsid, username: r.username, nombre: r.name, foto: r.profile_pic, noLeidos: r.no_leidos,
      ultimoMensaje: r.last_message_text, ultimoMensajeAt: r.last_message_at,
      ventanaAbierta: Boolean(r.last_inbound_at && Date.now() - new Date(r.last_inbound_at).getTime() < VENTANA_AGENTE_MS),
      clienteId: r.client_id, cliente: r.client_id ? (r.commercial_name || `${r.first_name || ''} ${r.last_name || ''}`.trim()) : null,
    })));
  } catch (e) { return err(res, e); }
}

// GET /api/instagram/conversaciones/:igsid
export async function verConversacion(req: Request, res: Response) {
  try {
    const { org } = ctx(req);
    const igsid = String(req.params.igsid);
    const { rows: c } = await pool.query(`SELECT last_inbound_at FROM instagram_contactos WHERE organizacion_id=$1 AND igsid=$2`, [org, igsid]);
    if (!c.length) return res.status(404).json({ success: false, error: 'Conversación no encontrada.' });
    const { rows } = await pool.query(
      `SELECT id, direccion, texto, adjuntos, enviado_por, estado, error, created_at FROM instagram_mensajes
        WHERE organizacion_id=$1 AND igsid=$2 ORDER BY created_at ASC LIMIT 500`, [org, igsid],
    );
    await pool.query(`UPDATE instagram_contactos SET no_leidos=0 WHERE organizacion_id=$1 AND igsid=$2`, [org, igsid]);
    const ultimo = c[0].last_inbound_at ? new Date(c[0].last_inbound_at).getTime() : 0;
    const agenteHumano = Boolean(ultimo && Date.now() - ultimo >= VENTANA_MS);
    return ok(res, {
      mensajes: rows,
      ventanaAbierta: Boolean(ultimo && Date.now() - ultimo < VENTANA_AGENTE_MS),
      ventanaCierra: ultimo ? new Date(ultimo + (agenteHumano ? VENTANA_AGENTE_MS : VENTANA_MS)).toISOString() : null,
      agenteHumano,
    });
  } catch (e) { return err(res, e); }
}

// POST /api/instagram/conversaciones/:igsid/mensajes { texto }
export async function enviarMensaje(req: Request, res: Response) {
  try {
    const { org, userId } = ctx(req);
    const igsid = String(req.params.igsid);
    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ success: false, error: 'Escribe el mensaje.' });
    if (Buffer.byteLength(texto, 'utf8') > 1000) return res.status(400).json({ success: false, error: 'El mensaje es demasiado largo para Instagram (máx. ~1.000 caracteres).' });
    const { rows: c } = await pool.query(`SELECT last_inbound_at FROM instagram_contactos WHERE organizacion_id=$1 AND igsid=$2`, [org, igsid]);
    if (!c.length) return res.status(404).json({ success: false, error: 'Conversación no encontrada.' });
    const desde = c[0].last_inbound_at ? Date.now() - new Date(c[0].last_inbound_at).getTime() : Infinity;
    if (desde >= VENTANA_AGENTE_MS) {
      return res.status(400).json({ success: false, error: 'Han pasado más de 7 días desde su último mensaje: Instagram no deja contestar hasta que vuelva a escribir.' });
    }
    const cuenta = await cuentaInstagram(org);
    const autor = await resolveUserName(userId).catch(() => null);
    // Solo lo envía una persona desde la bandeja: es el uso permitido de HUMAN_AGENT.
    const r = await enviarMensajeInstagram(cuenta, { igsid }, texto, { agenteHumano: desde >= VENTANA_MS });
    const { rows } = await pool.query(
      `INSERT INTO instagram_mensajes (organizacion_id, igsid, mid, direccion, texto, enviado_por)
       VALUES ($1,$2,$3,'saliente',$4,$5)
       ON CONFLICT (organizacion_id, mid) WHERE mid IS NOT NULL DO UPDATE SET enviado_por=EXCLUDED.enviado_por
       RETURNING id, direccion, texto, adjuntos, enviado_por, estado, error, created_at`,
      [org, igsid, r?.message_id || null, texto, autor],
    );
    await pool.query(
      `UPDATE instagram_contactos SET last_message_at=NOW(), last_message_text=$3 WHERE organizacion_id=$1 AND igsid=$2`,
      [org, igsid, texto.slice(0, 300)],
    );
    return ok(res, rows[0]);
  } catch (e) { return err(res, e); }
}

// ── Publicaciones ─────────────────────────────────────────────────────────

// GET /api/instagram/medios?after=
export async function listarMedios(req: Request, res: Response) {
  try {
    const c = await cuentaInstagram(ctx(req).org);
    return ok(res, await listarMediosInstagram(c, req.query.after ? String(req.query.after) : undefined));
  } catch (e) { return err(res, e); }
}

// GET /api/instagram/archivo/:token — público: Meta descarga de aquí lo que se publica.
export async function servirArchivo(req: Request, res: Response) {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{48}$/.test(token)) return res.sendStatus(404);
  const { rows } = await pool.query(
    `SELECT archivo, mimetype FROM instagram_subidas WHERE token=$1 AND estado IN ('subiendo','procesando') AND created_at > NOW() - INTERVAL '2 hours'`,
    [token],
  ).catch(() => ({ rows: [] as any[] }));
  const r = rows[0];
  if (!r || !fs.existsSync(r.archivo)) return res.sendStatus(404);
  res.setHeader('Content-Type', r.mimetype);
  return res.sendFile(r.archivo);
}

const FORMATOS: FormatoInstagram[] = ['REELS', 'IMAGE', 'STORIES'];

// POST /api/instagram/publicar (multipart: archivo + formato, caption, shareToFeed, thumbOffsetMs)
export async function publicar(req: Request, res: Response) {
  const file = (req as any).file as Express.Multer.File | undefined;
  try {
    const { org } = ctx(req);
    if (!file) return res.status(400).json({ success: false, error: 'Falta el archivo.' });
    const b = req.body || {};
    const formato = (FORMATOS.includes(b.formato) ? b.formato : 'REELS') as FormatoInstagram;
    const esVideo = file.mimetype.startsWith('video/');
    if (formato === 'REELS' && !esVideo) throw new InstagramError('Un reel tiene que ser un vídeo.', 'formato', 400);
    if (formato === 'IMAGE' && file.mimetype !== 'image/jpeg') throw new InstagramError('Instagram solo publica fotos en JPG.', 'formato', 400);
    const cuenta = await cuentaInstagram(org);
    const token = crypto.randomBytes(24).toString('hex');
    await pool.query(
      `INSERT INTO instagram_subidas (token, organizacion_id, archivo, mimetype) VALUES ($1,$2,$3,$4)`,
      [token, org, file.path, file.mimetype],
    );
    const url = `${instagramPublicBase()}/api/instagram/archivo/${token}`;
    const thumb = b.thumbOffsetMs !== undefined && b.thumbOffsetMs !== '' ? Number(b.thumbOffsetMs) : undefined;
    let containerId: string;
    try {
      containerId = await crearContenedorInstagram(cuenta, {
        formato, url, esVideo, caption: String(b.caption || ''),
        shareToFeed: b.shareToFeed === undefined ? true : String(b.shareToFeed) === 'true',
        thumbOffsetMs: Number.isFinite(thumb) ? thumb : undefined,
      });
    } catch (e) {
      await terminarSubida(token, 'error', (e as any)?.message);
      throw e;
    }
    await pool.query(`UPDATE instagram_subidas SET container_id=$1, estado='procesando' WHERE token=$2`, [containerId, token]);
    void seguirPublicacion(org, token, containerId);
    return ok(res, { publicacionId: token });
  } catch (e) {
    if (file?.path) fs.promises.unlink(file.path).catch(() => {});
    return err(res, e);
  }
}

async function terminarSubida(token: string, estado: string, error?: string | null, mediaId?: string | null) {
  const { rows } = await pool.query(
    `UPDATE instagram_subidas SET estado=$2, error=$3, media_id=COALESCE($4, media_id) WHERE token=$1 RETURNING archivo`,
    [token, estado, error || null, mediaId || null],
  );
  if (rows[0]?.archivo) fs.promises.unlink(rows[0].archivo).catch(() => {});
}

/** Espera a que Meta procese el archivo y lo publica (hasta ~10 min). */
async function seguirPublicacion(org: string, token: string, containerId: string) {
  try {
    const cuenta = await cuentaInstagram(org);
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, i < 6 ? 5000 : 10000));
      const { estado, detalle } = await estadoContenedorInstagram(cuenta, containerId);
      if (estado === 'FINISHED') {
        const mediaId = await publicarContenedorInstagram(cuenta, containerId);
        await terminarSubida(token, 'publicado', null, mediaId);
        return;
      }
      if (estado === 'ERROR' || estado === 'EXPIRED') {
        await terminarSubida(token, 'error', detalle || 'Instagram no ha podido procesar el archivo.');
        return;
      }
    }
    await terminarSubida(token, 'error', 'Instagram está tardando demasiado en procesar el archivo.');
  } catch (e: any) {
    await terminarSubida(token, 'error', e?.message || String(e));
  }
}

// GET /api/instagram/publicar/:token — estado de una publicación en curso.
export async function estadoPublicacion(req: Request, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT estado, error, media_id FROM instagram_subidas WHERE token=$1 AND organizacion_id=$2`, [req.params.token, ctx(req).org],
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Publicación no encontrada.' });
    return ok(res, { estado: rows[0].estado, error: rows[0].error, mediaId: rows[0].media_id });
  } catch (e) { return err(res, e); }
}

// ── Comentarios ───────────────────────────────────────────────────────────

/** El medio es de la cuenta conectada a este despacho. */
async function medioPropio(org: string, mediaId: string) {
  const c = await cuentaInstagram(org);
  const { igUserId } = c;
  const r = await fetch(`https://graph.facebook.com/v26.0/${encodeURIComponent(mediaId)}?fields=owner,username`, { headers: { Authorization: `Bearer ${c.token}` } });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok || (d?.owner?.id && String(d.owner.id) !== igUserId)) throw new InstagramError('Publicación no encontrada.', 'not_found', 404);
  return c;
}

// GET /api/instagram/medios/:mediaId/comentarios
export async function listarComentarios(req: Request, res: Response) {
  try {
    const c = await medioPropio(ctx(req).org, String(req.params.mediaId));
    return ok(res, await comentariosInstagram(c, String(req.params.mediaId)));
  } catch (e) { return err(res, e); }
}

// POST /api/instagram/comentarios/:id/responder { texto, privado? }
export async function responderComentario(req: Request, res: Response) {
  try {
    const { org } = ctx(req);
    const texto = String(req.body?.texto || '').trim();
    if (!texto) return res.status(400).json({ success: false, error: 'Escribe la respuesta.' });
    const c = await cuentaInstagram(org);
    const id = String(req.params.id);
    if (req.body?.privado) {
      // Respuesta privada: un mensaje directo a quien comentó (una sola vez, en los 7 días siguientes).
      return ok(res, await enviarMensajeInstagram(c, { commentId: id }, texto));
    }
    return ok(res, await responderComentarioInstagram(c, id, texto));
  } catch (e) { return err(res, e); }
}

// POST /api/instagram/comentarios/:id/ocultar { ocultar }
export async function ocultarComentario(req: Request, res: Response) {
  try {
    const c = await cuentaInstagram(ctx(req).org);
    return ok(res, await ocultarComentarioInstagram(c, String(req.params.id), req.body?.ocultar !== false));
  } catch (e) { return err(res, e); }
}

// DELETE /api/instagram/comentarios/:id
export async function borrarComentario(req: Request, res: Response) {
  try {
    const c = await cuentaInstagram(ctx(req).org);
    return ok(res, await borrarComentarioInstagram(c, String(req.params.id)));
  } catch (e) { return err(res, e); }
}
