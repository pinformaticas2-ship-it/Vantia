import crypto from 'crypto';
import pool from '../config/database';
import { encryptPassword, decryptPassword } from './emailCrypto';

// ── Instagram (API de Instagram con inicio de sesión de Instagram) ──────────
// graph.instagram.com, sin página de Facebook. Una cuenta profesional
// (empresa o creador) por despacho. Hace falta en el entorno del backend:
//   INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET  (Meta → la app → Instagram →
//     "Configuración de la API con inicio de sesión de Instagram")
//   INSTAGRAM_REDIRECT_URI  (dada de alta en "Configuración del inicio de
//     sesión empresarial"; por defecto la de producción)
//   INSTAGRAM_WEBHOOK_VERIFY_TOKEN  (el mismo texto que se pone al configurar
//     el webhook en Meta)
//   INSTAGRAM_PUBLIC_BASE_URL  (URL pública del backend desde la que Meta
//     descarga los vídeos e imágenes que se publican; por defecto producción)
// El token largo dura 60 días; se renueva solo (ver renovarTokensInstagram).

const API = 'https://graph.instagram.com';
export const IG_VERSION = 'v26.0';
export const INSTAGRAM_AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
export const INSTAGRAM_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
  'instagram_business_content_publish',
].join(',');

const env = (k: string) => (process.env[k] || '').trim();

export function instagramConfigurado(): boolean {
  return Boolean(env('INSTAGRAM_APP_ID') && env('INSTAGRAM_APP_SECRET'));
}
export function instagramAppId(): string {
  const v = env('INSTAGRAM_APP_ID');
  if (!v) throw new InstagramError('INSTAGRAM_APP_ID no está configurado en el backend', 'no_config', 503);
  return v;
}
function instagramAppSecret(): string {
  const v = env('INSTAGRAM_APP_SECRET');
  if (!v) throw new InstagramError('INSTAGRAM_APP_SECRET no está configurado en el backend', 'no_config', 503);
  return v;
}
export function instagramRedirectUri(): string {
  return env('INSTAGRAM_REDIRECT_URI') || 'https://vantia.up.railway.app/api/instagram/callback';
}
export function instagramPublicBase(): string {
  return (env('INSTAGRAM_PUBLIC_BASE_URL') || 'https://vantia.up.railway.app').replace(/\/+$/, '');
}
export function instagramVerifyToken(): string {
  return env('INSTAGRAM_WEBHOOK_VERIFY_TOKEN');
}

export class InstagramError extends Error {
  constructor(message: string, public code?: string | number, public status = 502) { super(message); }
}

// Mensajes en castellano para los errores que puede ver un usuario.
function mensajeError(code: any, subcode: any, msg: string): string {
  if (code === 190) return 'La conexión con Instagram ha caducado. Vuelve a conectar la cuenta.';
  // Antes que el de permisos: comparte el código 10.
  if ((code === 10 && subcode === 2534022) || /outside of allowed window/i.test(msg)) {
    return 'Han pasado más de 24 horas desde el último mensaje de esta persona: Instagram no deja contestar hasta que vuelva a escribir.';
  }
  if (code === 10 || code === 200) return 'Falta un permiso de Instagram. Vuelve a conectar la cuenta y acepta todos los permisos.';
  if (code === 4 || code === 17 || code === 32 || code === 613) return 'Instagram limita el número de peticiones. Espera un poco y vuelve a intentarlo.';
  if (code === 9 && subcode === 2207042) return 'Instagram no deja publicar más hoy desde esta cuenta (límite diario).';
  return msg || 'Error de Instagram';
}

async function igFetch(url: string, opts: { token?: string; method?: string; body?: any; form?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {};
  let body: any;
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(opts.form);
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, { method: opts.method || (body ? 'POST' : 'GET'), headers, body });
  const data: any = await res.json().catch(() => ({}));
  const e = data?.error;
  if (!res.ok || e || data?.error_type) {
    const code = e?.code ?? data?.code;
    const msg = e?.message || data?.error_message || `Error de Instagram (${res.status})`;
    throw new InstagramError(mensajeError(code, e?.error_subcode, msg), code, code === 190 ? 401 : (res.status >= 500 ? 502 : 400));
  }
  return data;
}

const g = (path: string) => `${API}/${IG_VERSION}/${path.replace(/^\/+/, '')}`;
const unwrap = (d: any) => (Array.isArray(d?.data) && d.data.length === 1 && !d.paging ? d.data[0] : d);

// ── Inicio de sesión ──────────────────────────────────────────────────────

/** code → token corto (1 h) → token largo (60 días). */
export async function canjearCodigoInstagram(code: string) {
  const corto = unwrap(await igFetch('https://api.instagram.com/oauth/access_token', {
    form: {
      client_id: instagramAppId(),
      client_secret: instagramAppSecret(),
      grant_type: 'authorization_code',
      redirect_uri: instagramRedirectUri(),
      code: code.replace(/#_$/, ''),
    },
  }));
  if (!corto?.access_token) throw new InstagramError('Instagram no ha devuelto el token.');
  const largo = await igFetch(
    `${API}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(instagramAppSecret())}&access_token=${encodeURIComponent(corto.access_token)}`,
  );
  return {
    accessToken: String(largo.access_token),
    expiresIn: Number(largo.expires_in || 5184000),
    userId: String(corto.user_id || ''),
    permisos: String(corto.permissions || ''),
  };
}

export async function perfilInstagram(token: string) {
  const d = unwrap(await igFetch(g(`me?fields=user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count&access_token=${encodeURIComponent(token)}`)));
  return d;
}

/** Activa los avisos (webhook) de mensajes y comentarios para la cuenta. */
export async function suscribirWebhooksInstagram(token: string) {
  await igFetch(g(`me/subscribed_apps?subscribed_fields=messages,comments&access_token=${encodeURIComponent(token)}`), { method: 'POST' });
}

export async function guardarCuentaInstagram(org: string, userId: string, t: { accessToken: string; expiresIn: number; permisos: string }, perfil: any) {
  await pool.query(
    `INSERT INTO instagram_cuentas (organizacion_id, ig_user_id, username, name, profile_picture, scopes, access_token_enc,
                                    token_expiry, token_refreshed_at, connected_by, connected_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,NOW(),NOW())
     ON CONFLICT (organizacion_id) DO UPDATE SET
       ig_user_id=EXCLUDED.ig_user_id, username=EXCLUDED.username, name=EXCLUDED.name, profile_picture=EXCLUDED.profile_picture,
       scopes=EXCLUDED.scopes, access_token_enc=EXCLUDED.access_token_enc, token_expiry=EXCLUDED.token_expiry,
       token_refreshed_at=NOW(), connected_by=EXCLUDED.connected_by, connected_at=NOW(), updated_at=NOW()`,
    [org, String(perfil.user_id || perfil.id), perfil.username || null, perfil.name || null, perfil.profile_picture_url || null,
      t.permisos, encryptPassword(t.accessToken), new Date(Date.now() + t.expiresIn * 1000), userId],
  );
}

export interface CuentaInstagram { igUserId: string; token: string; username: string | null }

export async function cuentaInstagram(org: string): Promise<CuentaInstagram> {
  const { rows } = await pool.query(
    `SELECT ig_user_id, username, access_token_enc, token_expiry FROM instagram_cuentas WHERE organizacion_id=$1`, [org],
  );
  if (!rows.length) throw new InstagramError('No hay ninguna cuenta de Instagram conectada.', 'not_connected', 404);
  if (rows[0].token_expiry && new Date(rows[0].token_expiry).getTime() < Date.now()) {
    throw new InstagramError('La conexión con Instagram ha caducado. Vuelve a conectar la cuenta.', 190, 401);
  }
  return { igUserId: rows[0].ig_user_id, token: decryptPassword(rows[0].access_token_enc), username: rows[0].username };
}

/** Renueva los tokens que caducan en menos de 15 días (y tienen más de 24 h). */
export async function renovarTokensInstagram(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT organizacion_id, access_token_enc FROM instagram_cuentas
      WHERE token_expiry < NOW() + INTERVAL '15 days' AND token_expiry > NOW()
        AND COALESCE(token_refreshed_at, connected_at) < NOW() - INTERVAL '25 hours'`,
  );
  let n = 0;
  for (const r of rows) {
    try {
      const d = await igFetch(`${API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(decryptPassword(r.access_token_enc))}`);
      await pool.query(
        `UPDATE instagram_cuentas SET access_token_enc=$1, token_expiry=$2, token_refreshed_at=NOW(), updated_at=NOW() WHERE organizacion_id=$3`,
        [encryptPassword(d.access_token), new Date(Date.now() + Number(d.expires_in || 5184000) * 1000), r.organizacion_id],
      );
      n++;
    } catch (e: any) {
      console.warn('[instagram] no se pudo renovar el token:', r.organizacion_id, e?.message || e);
    }
  }
  return n;
}

// ── Webhook ────────────────────────────────────────────────────────────────

/** Firma X-Hub-Signature-256 (HMAC-SHA256 del cuerpo con el secreto de la app). */
export function firmaValida(cuerpo: Buffer, cabecera: string | undefined): boolean {
  if (!cabecera || !cabecera.startsWith('sha256=')) return false;
  // Vale el secreto de la app de Instagram o, si se configuró, el de la app de Meta.
  const secretos = [env('INSTAGRAM_APP_SECRET'), env('META_APP_SECRET')].filter(Boolean);
  const recibida = Buffer.from(cabecera.slice(7), 'hex');
  return secretos.some((s) => {
    const esperada = crypto.createHmac('sha256', s).update(cuerpo).digest();
    return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
  });
}

// ── Mensajes ───────────────────────────────────────────────────────────────

export async function perfilRemitente(token: string, igsid: string) {
  return unwrap(await igFetch(g(`${igsid}?fields=name,username,profile_pic`), { token }));
}

export async function enviarMensajeInstagram(c: CuentaInstagram, destino: { igsid?: string; commentId?: string }, texto: string) {
  const recipient = destino.commentId ? { comment_id: destino.commentId } : { id: destino.igsid };
  return igFetch(g(`${c.igUserId}/messages`), { token: c.token, body: { recipient, message: { text: texto } } });
}

// ── Publicaciones ──────────────────────────────────────────────────────────

const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';

export async function listarMediosInstagram(c: CuentaInstagram, after?: string) {
  const d = await igFetch(g(`${c.igUserId}/media?fields=${MEDIA_FIELDS}&limit=24${after ? `&after=${encodeURIComponent(after)}` : ''}`), { token: c.token });
  return { medios: d?.data || [], siguiente: d?.paging?.next ? d?.paging?.cursors?.after || null : null };
}

export type FormatoInstagram = 'REELS' | 'IMAGE' | 'STORIES';

export async function crearContenedorInstagram(c: CuentaInstagram, o: {
  formato: FormatoInstagram; url: string; esVideo: boolean; caption?: string; shareToFeed?: boolean; thumbOffsetMs?: number;
}) {
  const body: Record<string, any> = {};
  if (o.formato === 'REELS') {
    Object.assign(body, { media_type: 'REELS', video_url: o.url, share_to_feed: o.shareToFeed !== false });
    if (typeof o.thumbOffsetMs === 'number' && o.thumbOffsetMs >= 0) body.thumb_offset = Math.round(o.thumbOffsetMs);
  } else if (o.formato === 'STORIES') {
    Object.assign(body, { media_type: 'STORIES', [o.esVideo ? 'video_url' : 'image_url']: o.url });
  } else {
    body.image_url = o.url;
  }
  if (o.caption && o.formato !== 'STORIES') body.caption = o.caption.slice(0, 2200);
  const d = await igFetch(g(`${c.igUserId}/media`), { token: c.token, body });
  if (!d?.id) throw new InstagramError('Instagram no ha creado la publicación.');
  return String(d.id);
}

export async function estadoContenedorInstagram(c: CuentaInstagram, containerId: string) {
  const d = await igFetch(g(`${containerId}?fields=status_code,status`), { token: c.token });
  return { estado: String(d?.status_code || ''), detalle: d?.status || null };
}

export async function publicarContenedorInstagram(c: CuentaInstagram, containerId: string) {
  const d = await igFetch(g(`${c.igUserId}/media_publish`), { token: c.token, body: { creation_id: containerId } });
  return String(d?.id || '');
}

// ── Comentarios ────────────────────────────────────────────────────────────

export async function comentariosInstagram(c: CuentaInstagram, mediaId: string) {
  const d = await igFetch(g(`${mediaId}/comments?fields=id,text,timestamp,username,from,like_count,hidden,replies{id,text,timestamp,username,from}&limit=50`), { token: c.token });
  return d?.data || [];
}
export async function responderComentarioInstagram(c: CuentaInstagram, commentId: string, texto: string) {
  return igFetch(g(`${commentId}/replies`), { token: c.token, body: { message: texto } });
}
export async function ocultarComentarioInstagram(c: CuentaInstagram, commentId: string, ocultar: boolean) {
  return igFetch(g(`${commentId}?hide=${ocultar ? 'true' : 'false'}`), { token: c.token, method: 'POST' });
}
export async function borrarComentarioInstagram(c: CuentaInstagram, commentId: string) {
  return igFetch(g(commentId), { token: c.token, method: 'DELETE' });
}

/** Revisa cada 12 h los tokens de Instagram y renueva los que van a caducar. */
export function startRenovacionInstagram(): void {
  const pasada = async () => {
    const { tomarTurno, soltarTurno } = await import('./turnos');
    if (!(await tomarTurno('instagram-tokens', 11 * 3600_000).catch(() => false))) return;
    try { await renovarTokensInstagram(); }
    catch (e: any) { console.error('[instagram] renovar tokens:', e?.message || e); }
    finally { await soltarTurno('instagram-tokens').catch(() => {}); }
  };
  setTimeout(() => { void pasada(); setInterval(() => void pasada(), 12 * 3600_000); }, 5 * 60_000);
}
