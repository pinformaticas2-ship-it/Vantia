import pool from '../config/database';
import { encryptPassword, decryptPassword } from './emailCrypto';

// ── Google Drive: documentos de expedientes ──────────────────────────────────
// El disco del contenedor de Railway es efímero -- se borra por completo en
// cada despliegue del backend. Los documentos de expedientes (subidos a
// mano o importados desde un PDF/ZIP) se guardan en Google Drive en su
// lugar, en una carpeta por organización con una subcarpeta por expediente.
//
// Conexión por organización (no por usuario): un único propietario/admin
// conecta una cuenta de Google una vez, con el scope "drive.file" -- ese
// scope SOLO da acceso a los archivos/carpetas que esta app cree, nunca al
// resto del Drive de esa cuenta. Se usa el flujo de código de autorización
// (access_type=offline) para tener un refresh_token real, igual que el
// perfil de Gmail "con enlace" (ver emailController.ts) -- de hecho se
// reutiliza el mismo Client ID / Secret de Google ya configurados
// (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET), porque es el mismo proyecto de
// Google Cloud; solo cambia el scope pedido.

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function googleTokenRequest(params: Record<string, string>): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET no están configurados en el backend');
  }
  const body = new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret });
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error_description || data.error || 'No se pudo comunicar con Google'), { googleError: data.error });
  return data as GoogleTokenResponse;
}

export async function exchangeGoogleDriveCode(code: string): Promise<GoogleTokenResponse> {
  // 'postmessage' es el redirect_uri exacto que exige Google cuando el
  // código se obtuvo con initCodeClient en modo popup.
  return googleTokenRequest({ code, redirect_uri: 'postmessage', grant_type: 'authorization_code' });
}

async function refreshGoogleDriveToken(refreshToken: string): Promise<GoogleTokenResponse> {
  return googleTokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
}

// Renueva y devuelve un access_token válido para la organización, guardando
// el nuevo token en BD si hacía falta renovarlo (margen de 60s).
export async function getDriveAccessToken(organizacionId: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT google_drive_access_token_enc, google_drive_refresh_token_enc, google_drive_token_expiry
       FROM organizaciones WHERE id = $1`,
    [organizacionId],
  );
  if (!rows.length) throw new Error('Organización no encontrada');
  const row = rows[0];
  if (!row.google_drive_refresh_token_enc) {
    throw Object.assign(new Error('Esta organización no tiene Google Drive conectado.'), { code: 'DRIVE_NOT_CONNECTED' });
  }

  const isExpired = !row.google_drive_token_expiry || new Date(row.google_drive_token_expiry).getTime() <= Date.now() + 60_000;
  if (!isExpired) return decryptPassword(row.google_drive_access_token_enc);

  const refreshToken = decryptPassword(row.google_drive_refresh_token_enc);
  let tokenData: GoogleTokenResponse;
  try {
    tokenData = await refreshGoogleDriveToken(refreshToken);
  } catch (e: any) {
    // invalid_grant = Google ya no acepta este refresh_token (revocado desde la
    // cuenta de Google, caducado -- p. ej. app de Google Cloud en modo "Prueba"
    // -- o contraseña cambiada). Se marca la conexión como caída para que la app
    // avise y pida volver a vincular Drive; cualquier otro error (red, Google
    // caído) es transitorio y NO desvincula nada.
    if (e?.googleError === 'invalid_grant') {
      await pool.query(
        `UPDATE organizaciones
            SET google_drive_access_token_enc=NULL, google_drive_refresh_token_enc=NULL, google_drive_token_expiry=NULL,
                google_drive_changes_page_token=NULL,
                google_drive_last_error='La conexión con Google Drive caducó o fue revocada. Hay que volver a vincularla.',
                google_drive_last_error_at=now()
          WHERE id=$1`,
        [organizacionId],
      ).catch(() => {});
      throw Object.assign(new Error('La conexión con Google Drive caducó. Vuelve a vincularla.'), { code: 'DRIVE_NOT_CONNECTED' });
    }
    throw e;
  }
  const newExpiry = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);
  await pool.query(
    `UPDATE organizaciones SET google_drive_access_token_enc=$1, google_drive_token_expiry=$2, updated_at=NOW() WHERE id=$3`,
    [encryptPassword(tokenData.access_token), newExpiry, organizacionId],
  );
  return tokenData.access_token;
}

async function driveFetch(organizacionId: string, path: string, init?: RequestInit): Promise<Response> {
  const token = await getDriveAccessToken(organizacionId);
  return fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
}

async function findFolder(organizacionId: string, name: string, parentId: string | null): Promise<string | null> {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
    parentId ? `'${parentId}' in parents` : `'root' in parents`,
  ].join(' and ');
  const res = await driveFetch(organizacionId, `/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`);
  if (!res.ok) return null;
  const data: any = await res.json().catch(() => ({}));
  return data.files?.[0]?.id || null;
}

async function createFolder(organizacionId: string, name: string, parentId: string | null): Promise<string> {
  const res = await driveFetch(organizacionId, '/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'No se pudo crear la carpeta en Google Drive');
  return data.id;
}

// Carpeta raíz del despacho -- se crea una única vez y se recuerda su ID en
// organizaciones.google_drive_root_folder_id.
export async function ensureRootFolder(organizacionId: string): Promise<string> {
  const { rows } = await pool.query(`SELECT nombre, google_drive_root_folder_id FROM organizaciones WHERE id=$1`, [organizacionId]);
  if (!rows.length) throw new Error('Organización no encontrada');
  if (rows[0].google_drive_root_folder_id) return rows[0].google_drive_root_folder_id;

  const folderName = `Vantia - ${rows[0].nombre || 'Despacho'}`;
  const existing = await findFolder(organizacionId, folderName, null);
  const folderId = existing || await createFolder(organizacionId, folderName, null);
  await pool.query(`UPDATE organizaciones SET google_drive_root_folder_id=$1 WHERE id=$2`, [folderId, organizacionId]);
  return folderId;
}

// Carpeta "Expedientes" dentro de la carpeta raíz del despacho -- estructura
// fija: <Despacho> / Expedientes / <expediente> / adjuntos.
export async function ensureExpedientesFolder(organizacionId: string): Promise<string> {
  const { rows } = await pool.query(`SELECT google_drive_expedientes_folder_id FROM organizaciones WHERE id=$1`, [organizacionId]);
  if (rows.length && rows[0].google_drive_expedientes_folder_id) return rows[0].google_drive_expedientes_folder_id;

  const rootId = await ensureRootFolder(organizacionId);
  const existing = await findFolder(organizacionId, 'Expedientes', rootId);
  const folderId = existing || await createFolder(organizacionId, 'Expedientes', rootId);
  await pool.query(`UPDATE organizaciones SET google_drive_expedientes_folder_id=$1 WHERE id=$2`, [folderId, organizacionId]);
  return folderId;
}

// Carpeta del expediente dentro de "Expedientes" -- se crea la primera vez
// que hace falta (alta del expediente, o primer documento que se le sube) y
// se recuerda en expedientes.google_drive_folder_id.
export async function ensureExpedienteFolder(organizacionId: string, expedienteId: string, expedienteName: string): Promise<string> {
  const { rows } = await pool.query(`SELECT google_drive_folder_id FROM expedientes WHERE id=$1`, [expedienteId]);
  if (rows.length && rows[0].google_drive_folder_id) return rows[0].google_drive_folder_id;

  const expedientesFolderId = await ensureExpedientesFolder(organizacionId);
  const safeName = (expedienteName || 'Expediente sin nombre').slice(0, 200);
  const folderId = await createFolder(organizacionId, safeName, expedientesFolderId);
  await pool.query(`UPDATE expedientes SET google_drive_folder_id=$1 WHERE id=$2`, [folderId, expedienteId]);
  return folderId;
}

// Sube un archivo directamente a una carpeta de Drive (subida "multipart":
// un bloque de metadatos JSON + el contenido del archivo, en una sola
// petición -- de sobra para los tamaños de documento habituales aquí).
export async function uploadFileToDrive(
  organizacionId: string,
  folderId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ id: string; webViewLink?: string }> {
  const boundary = `vantia-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
      'utf8',
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--`, 'utf8'),
  ]);

  const token = await getDriveAccessToken(organizacionId);
  const res = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'No se pudo subir el archivo a Google Drive');
  return data;
}

// Descarga el contenido de un archivo de Drive para servirlo/previsualizarlo
// a través de nuestro propio backend (igual que ya se hace con los archivos
// locales -- el frontend no habla con Drive directamente).
export async function downloadDriveFile(organizacionId: string, fileId: string): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
  const [metaRes, contentRes] = await Promise.all([
    driveFetch(organizacionId, `/files/${fileId}?fields=name,mimeType`),
    driveFetch(organizacionId, `/files/${fileId}?alt=media`),
  ]);
  if (!metaRes.ok || !contentRes.ok) throw new Error('No se pudo descargar el archivo de Google Drive');
  const meta: any = await metaRes.json();
  const arrayBuffer = await contentRes.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType: meta.mimeType || 'application/octet-stream', name: meta.name || 'archivo' };
}

// Mueve un archivo a otra carpeta (cambia sus "parents") sin volver a subir
// los bytes -- se usa para pasar un documento de la carpeta temporal de
// importación a la carpeta definitiva del expediente al aceptar la revisión.
export async function moveDriveFile(organizacionId: string, fileId: string, newParentId: string, oldParentId?: string): Promise<void> {
  const params = new URLSearchParams({ addParents: newParentId, fields: 'id,parents' });
  if (oldParentId) params.set('removeParents', oldParentId);
  const res = await driveFetch(organizacionId, `/files/${fileId}?${params}`, { method: 'PATCH' });
  if (!res.ok) {
    const data: any = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || 'No se pudo mover el archivo en Google Drive');
  }
}

export async function deleteDriveFile(organizacionId: string, fileId: string): Promise<void> {
  await driveFetch(organizacionId, `/files/${fileId}`, { method: 'DELETE' }).catch(() => undefined);
}

// Sobrescribe el contenido de un archivo ya existente en Drive (misma id,
// sin crear una copia nueva) -- se usa cuando el documento se edita en el
// sitio (Word/Excel guardando de vuelta a través de nuestro servidor).
export async function updateDriveFileContent(organizacionId: string, fileId: string, buffer: Buffer, mimeType?: string): Promise<void> {
  const token = await getDriveAccessToken(organizacionId);
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mimeType || 'application/octet-stream',
      },
      body: buffer,
    },
  );
  if (!res.ok) {
    const data: any = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || 'No se pudo actualizar el archivo en Google Drive');
  }
}

export async function renameDriveFile(organizacionId: string, fileId: string, newName: string): Promise<void> {
  const res = await driveFetch(organizacionId, `/files/${fileId}?fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) {
    const data: any = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || 'No se pudo renombrar el archivo en Google Drive');
  }
}

export async function isDriveConnected(organizacionId: string): Promise<boolean> {
  const { rows } = await pool.query(`SELECT google_drive_refresh_token_enc FROM organizaciones WHERE id=$1`, [organizacionId]);
  return Boolean(rows[0]?.google_drive_refresh_token_enc);
}

// Registro compartido del último error real al hablar con Drive -- se puede
// consultar con una query directa a la BD sin depender de los logs de
// Railway. Nunca lanza: registrar el error no debe romper la operación que
// falló al hablar con Drive.
export async function recordDriveError(organizacionId: string, err: any): Promise<void> {
  const message = String(err?.message || err).slice(0, 1000);
  console.warn('[googleDrive] Error:', message);
  await pool.query(
    `UPDATE organizaciones SET google_drive_last_error = $1, google_drive_last_error_at = now() WHERE id = $2`,
    [message, organizacionId],
  ).catch(() => {});
}

export async function clearDriveError(organizacionId: string): Promise<void> {
  await pool.query(
    `UPDATE organizaciones SET google_drive_last_error = NULL, google_drive_last_error_at = NULL WHERE id = $1`,
    [organizacionId],
  ).catch(() => {});
}

// ── Google Drive Changes API: detectar cambios hechos FUERA de Vantia ─────
// Hasta aquí todo el módulo es Vantia -> Drive (subir, renombrar, borrar
// desde la app). Esto es lo contrario: si alguien renombra o borra un
// archivo directamente en la web de Drive, Vantia no se entera solo -- hay
// que preguntarle a Google qué cambió. La Changes API funciona con un
// cursor (pageToken): se pide uno inicial, y en cada sondeo se listan solo
// los cambios ocurridos desde el último cursor guardado.
export async function getDriveStartPageToken(organizacionId: string): Promise<string> {
  const res = await driveFetch(organizacionId, '/changes/startPageToken');
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'No se pudo obtener el cursor de cambios de Google Drive');
  return data.startPageToken;
}

export interface DriveChange {
  fileId: string;
  removed: boolean;
  file?: { id: string; name: string; trashed?: boolean; parents?: string[] };
}

// Devuelve todos los cambios desde `pageToken` (recorriendo la paginación
// internamente) y el nuevo cursor a guardar para el próximo sondeo.
export async function listDriveChanges(organizacionId: string, pageToken: string): Promise<{ changes: DriveChange[]; newPageToken: string }> {
  const changes: DriveChange[] = [];
  let token = pageToken;
  for (;;) {
    const params = new URLSearchParams({
      pageToken: token,
      fields: 'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,trashed,parents))',
      spaces: 'drive',
      pageSize: '1000',
    });
    const res = await driveFetch(organizacionId, `/changes?${params}`);
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || 'No se pudo listar los cambios de Google Drive');
    if (Array.isArray(data.changes)) changes.push(...data.changes);
    if (data.nextPageToken) { token = data.nextPageToken; continue; }
    return { changes, newPageToken: data.newStartPageToken || token };
  }
}
