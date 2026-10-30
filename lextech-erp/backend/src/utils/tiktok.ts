import fs from 'fs';
import pool from '../config/database';
import { encryptPassword, decryptPassword } from './emailCrypto';

// ── TikTok (Login Kit + Display API + Content Posting API) ──────────────────
// Una cuenta de TikTok por organización (tabla tiktok_cuentas), mismo patrón
// que Dropbox: tokens cifrados, el access_token dura 24 h y se renueva solo
// con el refresh_token (que dura 1 año y TikTok puede cambiar al renovar).
//
// Requiere la app creada en developers.tiktok.com (organización "Ferrandez
// Pina", app "Vantia") con TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET en el
// entorno del backend, y TIKTOK_REDIRECT_URI dado de alta en Login Kit.
// Mientras la app no pase la revisión de TikTok solo funciona con las cuentas
// añadidas como "Target users" del Sandbox y todo lo publicado queda privado.

const API = 'https://open.tiktokapis.com';
export const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
export const TIKTOK_SCOPES = [
  'user.info.basic', 'user.info.profile', 'user.info.stats',
  'video.list', 'video.upload', 'video.publish',
].join(',');

export function tiktokRedirectUri(): string {
  return (process.env.TIKTOK_REDIRECT_URI || 'https://vantia.up.railway.app/api/tiktok/callback').trim();
}

export function tiktokClientKey(): string {
  const key = (process.env.TIKTOK_CLIENT_KEY || '').trim();
  if (!key) throw new Error('TIKTOK_CLIENT_KEY no está configurado en el backend');
  return key;
}

function tiktokClientSecret(): string {
  const secret = (process.env.TIKTOK_CLIENT_SECRET || '').trim();
  if (!secret) throw new Error('TIKTOK_CLIENT_SECRET no está configurado en el backend');
  return secret;
}

export class TikTokError extends Error {
  constructor(message: string, public code?: string, public status = 502) { super(message); }
}

// Mensajes en castellano para los errores de TikTok que puede ver un usuario.
const MENSAJES: Record<string, string> = {
  access_token_invalid: 'La conexión con TikTok ha caducado. Vuelve a conectar la cuenta.',
  scope_not_authorized: 'Falta un permiso de TikTok. Vuelve a conectar la cuenta y acepta todos los permisos.',
  spam_risk_too_many_posts: 'TikTok no deja publicar más hoy desde esta cuenta (límite diario alcanzado).',
  spam_risk_user_banned_from_posting: 'TikTok ha bloqueado la publicación desde esta cuenta.',
  reached_active_user_cap: 'TikTok ha alcanzado el límite diario de cuentas que publican desde Vantia. Prueba mañana.',
  unaudited_client_can_only_post_to_private_accounts: 'Mientras TikTok no apruebe la app, solo se puede publicar en privado ("Solo yo").',
  privacy_level_option_mismatch: 'Esa opción de privacidad no está disponible para esta cuenta.',
  rate_limit_exceeded: 'Demasiadas peticiones a TikTok. Espera un minuto y vuelve a intentarlo.',
};

async function tiktokFetch(path: string, opts: { token?: string; method?: string; body?: any; form?: Record<string, string> } = {}) {
  const headers: Record<string, string> = {};
  let body: any;
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(opts.form);
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json; charset=UTF-8';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${API}${path}`, { method: opts.method || (body ? 'POST' : 'GET'), headers, body });
  const data: any = await res.json().catch(() => ({}));
  // La API v2 devuelve { data, error: { code: 'ok' } }; OAuth devuelve
  // { error, error_description } a secas.
  const code = typeof data?.error === 'string' ? data.error : data?.error?.code;
  if (!res.ok || (code && code !== 'ok')) {
    const msg = MENSAJES[code] || data?.error_description || data?.error?.message || `Error de TikTok (${res.status})`;
    throw new TikTokError(msg, code, res.status === 401 ? 401 : 502);
  }
  return data;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  open_id: string;
  scope: string;
}

export async function exchangeTikTokCode(code: string): Promise<TokenResponse> {
  return tiktokFetch('/v2/oauth/token/', {
    form: {
      client_key: tiktokClientKey(),
      client_secret: tiktokClientSecret(),
      code,
      grant_type: 'authorization_code',
      redirect_uri: tiktokRedirectUri(),
    },
  });
}

export async function saveTikTokTokens(organizacionId: string, userId: string, t: TokenResponse) {
  await pool.query(
    `INSERT INTO tiktok_cuentas (organizacion_id, open_id, scopes, access_token_enc, refresh_token_enc,
                                 token_expiry, refresh_expiry, connected_by, connected_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
     ON CONFLICT (organizacion_id) DO UPDATE SET
       open_id=EXCLUDED.open_id, scopes=EXCLUDED.scopes, access_token_enc=EXCLUDED.access_token_enc,
       refresh_token_enc=EXCLUDED.refresh_token_enc, token_expiry=EXCLUDED.token_expiry,
       refresh_expiry=EXCLUDED.refresh_expiry, connected_by=EXCLUDED.connected_by,
       connected_at=NOW(), updated_at=NOW()`,
    [
      organizacionId, t.open_id, t.scope, encryptPassword(t.access_token), encryptPassword(t.refresh_token),
      new Date(Date.now() + (t.expires_in || 86400) * 1000),
      new Date(Date.now() + (t.refresh_expires_in || 31536000) * 1000),
      userId,
    ],
  );
}

/** Access token válido de la organización (lo renueva si caduca en < 5 min). */
export async function getTikTokAccessToken(organizacionId: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT access_token_enc, refresh_token_enc, token_expiry FROM tiktok_cuentas WHERE organizacion_id=$1`,
    [organizacionId],
  );
  if (!rows.length) throw new TikTokError('No hay ninguna cuenta de TikTok conectada.', 'not_connected', 404);
  const row = rows[0];
  if (row.token_expiry && new Date(row.token_expiry).getTime() > Date.now() + 5 * 60_000) {
    return decryptPassword(row.access_token_enc);
  }
  const t: TokenResponse = await tiktokFetch('/v2/oauth/token/', {
    form: {
      client_key: tiktokClientKey(),
      client_secret: tiktokClientSecret(),
      grant_type: 'refresh_token',
      refresh_token: decryptPassword(row.refresh_token_enc),
    },
  });
  // TikTok puede devolver un refresh_token distinto: hay que guardar el nuevo.
  await pool.query(
    `UPDATE tiktok_cuentas SET access_token_enc=$1, refresh_token_enc=$2, token_expiry=$3, refresh_expiry=$4, updated_at=NOW()
      WHERE organizacion_id=$5`,
    [
      encryptPassword(t.access_token), encryptPassword(t.refresh_token),
      new Date(Date.now() + (t.expires_in || 86400) * 1000),
      new Date(Date.now() + (t.refresh_expires_in || 31536000) * 1000),
      organizacionId,
    ],
  );
  return t.access_token;
}

export async function revokeTikTokToken(accessToken: string) {
  await tiktokFetch('/v2/oauth/revoke/', {
    form: { client_key: tiktokClientKey(), client_secret: tiktokClientSecret(), token: accessToken },
  });
}

const USER_FIELDS = [
  'open_id', 'avatar_url', 'display_name', 'username', 'bio_description', 'profile_deep_link',
  'is_verified', 'follower_count', 'following_count', 'likes_count', 'video_count',
].join(',');

export async function getTikTokUser(token: string) {
  const data = await tiktokFetch(`/v2/user/info/?fields=${USER_FIELDS}`, { token });
  return data?.data?.user || {};
}

const VIDEO_FIELDS = [
  'id', 'title', 'video_description', 'duration', 'cover_image_url', 'share_url', 'embed_link',
  'create_time', 'view_count', 'like_count', 'comment_count', 'share_count',
].join(',');

export async function listTikTokVideos(token: string, cursor?: number) {
  const body: any = { max_count: 20 };
  if (cursor) body.cursor = cursor;
  const data = await tiktokFetch(`/v2/video/list/?fields=${VIDEO_FIELDS}`, { token, body });
  return { videos: data?.data?.videos || [], cursor: data?.data?.cursor, hasMore: Boolean(data?.data?.has_more) };
}

export async function getTikTokCreatorInfo(token: string) {
  const data = await tiktokFetch('/v2/post/publish/creator_info/query/', { token, body: {} });
  return data?.data || {};
}

export interface PublishOptions {
  title: string;
  privacyLevel: string;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  brandContent: boolean;
  brandOrganic: boolean;
  /** Etiqueta de TikTok "Contenido generado por IA". */
  isAigc: boolean;
  /** Fotograma (ms desde el inicio) que TikTok usa como portada. */
  coverMs?: number;
}

// Tamaño de trozo para subir el vídeo: TikTok pide trozos de 5 a 64 MB; un
// vídeo de hasta 64 MB va en un solo trozo, y el último trozo se queda con el
// resto (puede llegar a 128 MB).
const MAX_SINGLE_CHUNK = 64 * 1024 * 1024;
const CHUNK = 10 * 1024 * 1024;

/** Publica directamente (FILE_UPLOAD) y devuelve el publish_id para seguir el estado. */
export async function publishTikTokVideo(token: string, filePath: string, mimetype: string, opts: PublishOptions): Promise<string> {
  const post_info: Record<string, any> = {
    title: opts.title,
    privacy_level: opts.privacyLevel,
    disable_comment: opts.disableComment,
    disable_duet: opts.disableDuet,
    disable_stitch: opts.disableStitch,
    brand_content_toggle: opts.brandContent,
    brand_organic_toggle: opts.brandOrganic,
    is_aigc: opts.isAigc,
  };
  if (typeof opts.coverMs === 'number' && opts.coverMs >= 0) post_info.video_cover_timestamp_ms = Math.round(opts.coverMs);
  return uploadTikTokVideo(token, '/v2/post/publish/video/init/', filePath, mimetype, { post_info });
}

/**
 * Envía el vídeo a los borradores de la app de TikTok (scope video.upload):
 * al usuario le llega una notificación y lo termina allí (música, efectos,
 * texto, portada, privacidad), cosas que la API no permite hacer.
 */
export async function sendTikTokDraft(token: string, filePath: string, mimetype: string): Promise<string> {
  return uploadTikTokVideo(token, '/v2/post/publish/inbox/video/init/', filePath, mimetype, {});
}

async function uploadTikTokVideo(token: string, initPath: string, filePath: string, mimetype: string, extra: Record<string, any>): Promise<string> {
  const size = fs.statSync(filePath).size;
  const chunkSize = size <= MAX_SINGLE_CHUNK ? size : CHUNK;
  const totalChunks = size <= MAX_SINGLE_CHUNK ? 1 : Math.floor(size / CHUNK);

  const init = await tiktokFetch(initPath, {
    token,
    body: {
      ...extra,
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: totalChunks },
    },
  });
  const publishId: string = init?.data?.publish_id;
  const uploadUrl: string = init?.data?.upload_url;
  if (!publishId || !uploadUrl) throw new TikTokError('TikTok no ha devuelto dónde subir el vídeo.');

  const fd = fs.openSync(filePath, 'r');
  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = i === totalChunks - 1 ? size - 1 : start + chunkSize - 1;
      const buf = Buffer.alloc(end - start + 1);
      fs.readSync(fd, buf, 0, buf.length, start);
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': mimetype,
          'Content-Length': String(buf.length),
          'Content-Range': `bytes ${start}-${end}/${size}`,
        },
        body: buf,
      });
      if (!res.ok && res.status !== 206) {
        throw new TikTokError(`TikTok ha rechazado la subida del vídeo (${res.status}).`);
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  return publishId;
}

export async function getTikTokPublishStatus(token: string, publishId: string) {
  const data = await tiktokFetch('/v2/post/publish/status/fetch/', { token, body: { publish_id: publishId } });
  return data?.data || {};
}
