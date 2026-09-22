import pool from '../config/database';
import { encryptPassword, decryptPassword } from './emailCrypto';

// ── Dropbox: fase 1, solo vinculación ────────────────────────────────────────
// Igual que Drive: conexión por organización (no por usuario), flujo de
// código de autorización con refresh_token real (token_access_type=offline)
// para no tener que reconectar cada pocas horas. A diferencia de Google, no
// hay una librería JS oficial para el popup, así que el flujo lo monta el
// propio frontend (ver lib/dropboxConnect.ts + pages/DropboxOAuthCallback.tsx).
//
// Requiere una app creada en https://www.dropbox.com/developers/apps, con
// DROPBOX_APP_KEY / DROPBOX_APP_SECRET en las variables de entorno del
// backend, y el redirect URI exacto (origen del frontend + /dropbox-oauth-
// callback) dado de alta en esa app.

const DROPBOX_TOKEN_ENDPOINT = 'https://api.dropboxapi.com/oauth2/token';
export const DROPBOX_AUTHORIZE_ENDPOINT = 'https://www.dropbox.com/oauth2/authorize';

interface DropboxTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  account_id?: string;
}

async function dropboxTokenRequest(params: Record<string, string>): Promise<DropboxTokenResponse> {
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error('DROPBOX_APP_KEY/DROPBOX_APP_SECRET no están configurados en el backend');
  }
  const body = new URLSearchParams({ ...params, client_id: appKey, client_secret: appSecret });
  const res = await fetch(DROPBOX_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || 'No se pudo comunicar con Dropbox');
  return data as DropboxTokenResponse;
}

export async function exchangeDropboxCode(code: string, redirectUri: string): Promise<DropboxTokenResponse> {
  return dropboxTokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
}

async function refreshDropboxToken(refreshToken: string): Promise<DropboxTokenResponse> {
  return dropboxTokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
}

// Renueva y devuelve un access_token válido, guardando el nuevo en BD si
// hacía falta renovarlo (margen de 60s). Se deja lista para cuando la fase 2
// (guardar documentos en Dropbox) la necesite.
export async function getDropboxAccessToken(organizacionId: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT dropbox_access_token_enc, dropbox_refresh_token_enc, dropbox_token_expiry FROM organizaciones WHERE id = $1`,
    [organizacionId],
  );
  if (!rows.length) throw new Error('Organización no encontrada');
  const row = rows[0];
  if (!row.dropbox_refresh_token_enc) {
    throw Object.assign(new Error('Esta organización no tiene Dropbox conectado.'), { code: 'DROPBOX_NOT_CONNECTED' });
  }

  const isExpired = !row.dropbox_token_expiry || new Date(row.dropbox_token_expiry).getTime() <= Date.now() + 60_000;
  if (!isExpired) return decryptPassword(row.dropbox_access_token_enc);

  const refreshToken = decryptPassword(row.dropbox_refresh_token_enc);
  const tokenData = await refreshDropboxToken(refreshToken);
  const newExpiry = new Date(Date.now() + (tokenData.expires_in || 14400) * 1000);
  await pool.query(
    `UPDATE organizaciones SET dropbox_access_token_enc=$1, dropbox_token_expiry=$2, updated_at=NOW() WHERE id=$3`,
    [encryptPassword(tokenData.access_token), newExpiry, organizacionId],
  );
  return tokenData.access_token;
}

export async function isDropboxConnected(organizacionId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT dropbox_refresh_token_enc FROM organizaciones WHERE id=$1`, [organizacionId]);
  return Boolean(rows[0]?.dropbox_refresh_token_enc);
}
