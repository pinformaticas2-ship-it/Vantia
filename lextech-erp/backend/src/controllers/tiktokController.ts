import crypto from 'crypto';
import fs from 'fs';
import { Request, Response } from 'express';
import pool from '../config/database';
import {
  TIKTOK_AUTHORIZE_URL, TIKTOK_SCOPES, TikTokError, tiktokClientKey, tiktokRedirectUri,
  exchangeTikTokCode, saveTikTokTokens, getTikTokAccessToken, revokeTikTokToken,
  getTikTokUser, listTikTokVideos, getTikTokCreatorInfo, publishTikTokVideo, sendTikTokDraft, getTikTokPublishStatus,
} from '../utils/tiktok';

// Comunicación Externa → TikTok. Conectar la cuenta va por redirección de
// página completa (no popup): Vantia → TikTok → GET /api/tiktok/callback
// (aquí, sin sesión de Clerk) → de vuelta a /dashboard/whatsapp?canal=tiktok.
// Como el callback no trae sesión, la organización y el usuario se recuperan
// del "state" guardado en tiktok_oauth_states al empezar.

const STATE_TTL_MIN = 15;

function ok(res: Response, data: any) {
  return res.json({ success: true, data });
}

function err(res: Response, e: any, fallback = 'Error con TikTok') {
  const status = e instanceof TikTokError ? e.status : 500;
  return res.status(status).json({ success: false, error: e?.message || fallback, code: e?.code });
}

function ctx(req: Request) {
  return {
    organizacionId: (req as any).organizacionId as string,
    rol: (req as any).organizacionRol as string,
    userId: (req as any).auth?.userId as string,
  };
}

function isAdmin(rol: string) {
  return rol === 'propietario' || rol === 'admin';
}

// GET /api/tiktok/status
export async function getTikTokStatus(req: Request, res: Response) {
  try {
    const { organizacionId } = ctx(req);
    const configured = Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
    const { rows } = await pool.query(
      `SELECT open_id, display_name, avatar_url, username, scopes, connected_at FROM tiktok_cuentas WHERE organizacion_id=$1`,
      [organizacionId],
    );
    if (!rows.length) return ok(res, { configured, connected: false });
    const row = rows[0];
    let account: any = {
      displayName: row.display_name, avatarUrl: row.avatar_url, username: row.username,
    };
    let accountError: string | null = null;
    try {
      const u = await getTikTokUser(await getTikTokAccessToken(organizacionId));
      account = {
        displayName: u.display_name, avatarUrl: u.avatar_url, username: u.username, bio: u.bio_description,
        profileUrl: u.profile_deep_link, isVerified: u.is_verified, followers: u.follower_count,
        following: u.following_count, likes: u.likes_count, videos: u.video_count,
      };
      await pool.query(
        `UPDATE tiktok_cuentas SET display_name=$1, avatar_url=$2, username=$3, updated_at=NOW() WHERE organizacion_id=$4`,
        [u.display_name || null, u.avatar_url || null, u.username || null, organizacionId],
      );
    } catch (e: any) {
      accountError = e?.message || 'No se pudo leer la cuenta de TikTok';
    }
    return ok(res, {
      configured, connected: true, account, accountError,
      scopes: String(row.scopes || '').split(',').filter(Boolean), connectedAt: row.connected_at,
    });
  } catch (e) {
    return err(res, e);
  }
}

// POST /api/tiktok/connect -- devuelve la URL de autorización de TikTok.
export async function startTikTokConnect(req: Request, res: Response) {
  try {
    const { organizacionId, rol, userId } = ctx(req);
    if (!isAdmin(rol)) {
      return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador pueden conectar TikTok.' });
    }
    // A dónde volver al terminar: el origen del frontend que hace la petición
    // (ya validado por CORS), o FRONTEND_URL si no viene.
    const returnOrigin = String(req.headers.origin || process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    if (!returnOrigin) return res.status(400).json({ success: false, error: 'No se sabe a qué dirección de Vantia volver.' });

    const state = crypto.randomBytes(24).toString('hex');
    await pool.query(`DELETE FROM tiktok_oauth_states WHERE created_at < NOW() - INTERVAL '${STATE_TTL_MIN} minutes'`);
    await pool.query(
      `INSERT INTO tiktok_oauth_states (state, organizacion_id, user_id, return_origin) VALUES ($1,$2,$3,$4)`,
      [state, organizacionId, userId, returnOrigin],
    );
    const url = `${TIKTOK_AUTHORIZE_URL}?client_key=${encodeURIComponent(tiktokClientKey())}`
      + `&response_type=code&scope=${encodeURIComponent(TIKTOK_SCOPES)}`
      + `&redirect_uri=${encodeURIComponent(tiktokRedirectUri())}&state=${state}&disable_auto_auth=1`;
    return ok(res, { url });
  } catch (e) {
    return err(res, e);
  }
}

// GET /api/tiktok/callback -- público: aquí vuelve el navegador desde TikTok.
export async function tiktokCallback(req: Request, res: Response) {
  const state = String(req.query.state || '');
  const { rows } = await pool.query(
    `DELETE FROM tiktok_oauth_states WHERE state=$1 AND created_at > NOW() - INTERVAL '${STATE_TTL_MIN} minutes'
     RETURNING organizacion_id, user_id, return_origin`,
    [state],
  ).catch(() => ({ rows: [] as any[] }));
  const pending = rows[0];
  const fallbackOrigin = String(process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  const back = (result: 'ok' | 'error', message?: string) => {
    const origin = pending?.return_origin || fallbackOrigin;
    const qs = new URLSearchParams({ canal: 'tiktok', tiktok: result });
    if (message) qs.set('mensaje', message);
    if (!origin) return res.status(result === 'ok' ? 200 : 400).send(message || 'TikTok conectado. Ya puedes volver a Vantia.');
    return res.redirect(`${origin}/dashboard/whatsapp?${qs.toString()}`);
  };

  if (!pending) return back('error', 'La conexión con TikTok ha caducado. Vuelve a intentarlo.');
  if (req.query.error) {
    return back('error', req.query.error === 'access_denied'
      ? 'Has cancelado la conexión con TikTok.'
      : String(req.query.error_description || req.query.error));
  }
  const code = String(req.query.code || '');
  if (!code) return back('error', 'TikTok no ha devuelto el código de autorización.');

  try {
    const tokens = await exchangeTikTokCode(code);
    await saveTikTokTokens(pending.organizacion_id, pending.user_id, tokens);
    try {
      const u = await getTikTokUser(tokens.access_token);
      await pool.query(
        `UPDATE tiktok_cuentas SET display_name=$1, avatar_url=$2, username=$3 WHERE organizacion_id=$4`,
        [u.display_name || null, u.avatar_url || null, u.username || null, pending.organizacion_id],
      );
    } catch { /* el perfil se vuelve a leer en /status */ }
    return back('ok');
  } catch (e: any) {
    console.error('TikTok callback:', e?.message || e);
    return back('error', e?.message || 'No se pudo conectar TikTok.');
  }
}

// DELETE /api/tiktok -- desconecta (revoca en TikTok y borra los tokens).
export async function disconnectTikTok(req: Request, res: Response) {
  try {
    const { organizacionId, rol } = ctx(req);
    if (!isAdmin(rol)) {
      return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador pueden desconectar TikTok.' });
    }
    try {
      await revokeTikTokToken(await getTikTokAccessToken(organizacionId));
    } catch { /* aunque falle la revocación, se borra aquí igualmente */ }
    await pool.query(`DELETE FROM tiktok_cuentas WHERE organizacion_id=$1`, [organizacionId]);
    return ok(res, { connected: false });
  } catch (e) {
    return err(res, e);
  }
}

// GET /api/tiktok/videos?cursor=
export async function getTikTokVideos(req: Request, res: Response) {
  try {
    const { organizacionId } = ctx(req);
    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
    const token = await getTikTokAccessToken(organizacionId);
    return ok(res, await listTikTokVideos(token, cursor));
  } catch (e) {
    return err(res, e);
  }
}

// GET /api/tiktok/creator-info -- opciones de privacidad e interacción que
// TikTok permite a esta cuenta (hay que mostrarlas antes de publicar).
export async function getTikTokCreator(req: Request, res: Response) {
  try {
    const { organizacionId } = ctx(req);
    const info = await getTikTokCreatorInfo(await getTikTokAccessToken(organizacionId));
    return ok(res, {
      nickname: info.creator_nickname, username: info.creator_username, avatarUrl: info.creator_avatar_url,
      privacyOptions: info.privacy_level_options || [],
      commentDisabled: Boolean(info.comment_disabled), duetDisabled: Boolean(info.duet_disabled),
      stitchDisabled: Boolean(info.stitch_disabled), maxDurationSec: info.max_video_post_duration_sec,
    });
  } catch (e) {
    return err(res, e);
  }
}

// POST /api/tiktok/publish (multipart: video + campos)
// modo=borrador → a los borradores de la app de TikTok (sin más campos).
export async function publishToTikTok(req: Request, res: Response) {
  const file = (req as any).file as Express.Multer.File | undefined;
  try {
    const { organizacionId } = ctx(req);
    if (!file) return res.status(400).json({ success: false, error: 'Falta el vídeo.' });
    const b = req.body || {};
    if (b.modo === 'borrador') {
      const token = await getTikTokAccessToken(organizacionId);
      return ok(res, { publishId: await sendTikTokDraft(token, file.path, file.mimetype) });
    }
    const title = String(b.title || '').slice(0, 2200);
    const privacyLevel = String(b.privacyLevel || '');
    if (!privacyLevel) return res.status(400).json({ success: false, error: 'Elige quién puede ver el vídeo.' });
    const flag = (v: any) => v === true || v === 'true' || v === '1';

    const token = await getTikTokAccessToken(organizacionId);
    const publishId = await publishTikTokVideo(token, file.path, file.mimetype, {
      title, privacyLevel,
      disableComment: flag(b.disableComment), disableDuet: flag(b.disableDuet), disableStitch: flag(b.disableStitch),
      brandContent: flag(b.brandContent), brandOrganic: flag(b.brandOrganic),
      isAigc: flag(b.isAigc),
      coverMs: b.coverMs !== undefined && b.coverMs !== '' && Number.isFinite(Number(b.coverMs)) ? Number(b.coverMs) : undefined,
    });
    return ok(res, { publishId });
  } catch (e) {
    return err(res, e);
  } finally {
    if (file?.path) fs.promises.unlink(file.path).catch(() => {});
  }
}

// GET /api/tiktok/publish/:publishId
export async function getTikTokPublish(req: Request, res: Response) {
  try {
    const { organizacionId } = ctx(req);
    const s = await getTikTokPublishStatus(await getTikTokAccessToken(organizacionId), req.params.publishId);
    return ok(res, { status: s.status, failReason: s.fail_reason || null, postIds: s.publicaly_available_post_id || [] });
  } catch (e) {
    return err(res, e);
  }
}
