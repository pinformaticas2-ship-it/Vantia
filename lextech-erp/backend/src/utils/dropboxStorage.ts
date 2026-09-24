import pool from '../config/database';
import { getDropboxAccessToken } from './dropboxAuth';

// ── Dropbox: fase 2, documentos de expedientes ───────────────────────────────
// La app está conectada con acceso "App folder": todo lo que se lee/escribe
// aquí vive dentro de esa carpeta propia del Dropbox del usuario (Dropbox la
// crea sola la primera vez, normalmente como "Apps/<nombre de la app>"), así
// que los paths de este módulo son SIEMPRE relativos a esa carpeta -- no hace
// falta una carpeta raíz "Vantia - <org>" como en Drive.
//
// Estructura: /Expedientes/<expediente>/<adjuntos>.

const DROPBOX_API = 'https://api.dropboxapi.com/2';
const DROPBOX_CONTENT_API = 'https://content.dropboxapi.com/2';

export async function recordDropboxError(organizacionId: string, err: any): Promise<void> {
  const message = String(err?.message || err).slice(0, 1000);
  console.warn('[dropbox] Error:', message);
  await pool.query(
    `UPDATE organizaciones SET dropbox_last_error = $1, dropbox_last_error_at = now() WHERE id = $2`,
    [message, organizacionId],
  ).catch(() => {});
}

export async function clearDropboxError(organizacionId: string): Promise<void> {
  await pool.query(
    `UPDATE organizaciones SET dropbox_last_error = NULL, dropbox_last_error_at = NULL WHERE id = $1`,
    [organizacionId],
  ).catch(() => {});
}

async function dropboxRpc(organizacionId: string, path: string, body: Record<string, any>): Promise<any> {
  const token = await getDropboxAccessToken(organizacionId);
  const res = await fetch(`${DROPBOX_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error_summary || data?.error?.['.tag'] || 'No se pudo comunicar con Dropbox';
    throw Object.assign(new Error(msg), { dropboxTag: data?.error?.['.tag'] });
  }
  return data;
}

// Dropbox no tiene "buscar por nombre y crear si no existe" en una sola
// llamada: create_folder_v2 falla con path/conflict/folder si ya existe --
// eso es justo la señal de "ya está, sigue" (idempotente).
async function ensureFolder(organizacionId: string, path: string): Promise<void> {
  try {
    await dropboxRpc(organizacionId, '/files/create_folder_v2', { path, autorename: false });
  } catch (e: any) {
    if (e?.dropboxTag !== 'path' && !String(e?.message || '').includes('conflict')) throw e;
  }
}

// Carpeta "Expedientes" -- se asegura que exista, sin necesidad de cachear
// nada (es un path fijo dentro de la carpeta de la app).
export async function ensureExpedientesFolder(organizacionId: string): Promise<string> {
  const path = '/Expedientes';
  await ensureFolder(organizacionId, path);
  return path;
}

// Carpeta del expediente dentro de "Expedientes" -- se cachea el path exacto
// en expedientes.dropbox_folder_path (el nombre puede llevar autorename si
// coincidía con otro, así que no basta con recalcularlo siempre a mano).
export async function ensureExpedienteFolder(organizacionId: string, expedienteId: string, expedienteName: string): Promise<string> {
  const { rows } = await pool.query(`SELECT dropbox_folder_path FROM expedientes WHERE id = $1`, [expedienteId]);
  if (rows.length && rows[0].dropbox_folder_path) return rows[0].dropbox_folder_path;

  const expedientesPath = await ensureExpedientesFolder(organizacionId);
  const safeName = (expedienteName || 'Expediente sin nombre').replace(/[/\\]/g, '-').slice(0, 200);
  const folderPath = `${expedientesPath}/${safeName}`;
  const data = await dropboxRpc(organizacionId, '/files/create_folder_v2', { path: folderPath, autorename: true }).catch(async (e: any) => {
    // Si ya existe exactamente ese path (sin autorename porque coincide con
    // uno que ya es nuestro), create_folder_v2 con autorename:true no
    // debería fallar por conflicto -- pero por si acaso, se usa el mismo path.
    if (e?.dropboxTag === 'path') return { metadata: { path_display: folderPath } };
    throw e;
  });
  const finalPath = data?.metadata?.path_display || folderPath;
  await pool.query(`UPDATE expedientes SET dropbox_folder_path = $1 WHERE id = $2`, [finalPath, expedienteId]);
  return finalPath;
}

export async function uploadFileToDropbox(
  organizacionId: string,
  folderPath: string,
  filename: string,
  buffer: Buffer,
  _mimeType: string,
): Promise<{ id: string; path: string }> {
  const token = await getDropboxAccessToken(organizacionId);
  const path = `${folderPath}/${filename}`;
  const res = await fetch(`${DROPBOX_CONTENT_API}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: true, mute: true }),
    },
    body: buffer,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error_summary || 'No se pudo subir el archivo a Dropbox');
  return { id: data.id, path: data.path_display };
}

// Sobrescribe el contenido de un archivo ya existente (mismo id) -- se usa
// cuando el documento se edita en el sitio (Word/Excel guardando de vuelta).
export async function updateDropboxFileContent(organizacionId: string, fileId: string, buffer: Buffer): Promise<void> {
  const token = await getDropboxAccessToken(organizacionId);
  const res = await fetch(`${DROPBOX_CONTENT_API}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path: fileId, mode: 'overwrite', mute: true }),
    },
    body: buffer,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error_summary || 'No se pudo actualizar el archivo en Dropbox');
}

// Descarga por id (no por path) -- así sigue funcionando aunque el archivo
// se haya renombrado o movido de carpeta desde la última vez.
export async function downloadDropboxFile(organizacionId: string, fileId: string): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
  const token = await getDropboxAccessToken(organizacionId);
  const res = await fetch(`${DROPBOX_CONTENT_API}/files/download`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path: fileId }),
    },
  });
  if (!res.ok) {
    const data: any = await res.json().catch(() => ({}));
    throw new Error(data?.error_summary || 'No se pudo descargar el archivo de Dropbox');
  }
  const resultHeader = res.headers.get('dropbox-api-result');
  const meta: any = resultHeader ? JSON.parse(resultHeader) : {};
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType: 'application/octet-stream', name: meta.name || 'archivo' };
}

// Dropbox unifica renombrar y mover en la misma llamada: cambiar solo el
// nombre es "moverlo" a la misma carpeta con otro nombre.
export async function moveOrRenameDropboxFile(organizacionId: string, fileId: string, toFolderPath: string, toName: string): Promise<{ id: string; path: string }> {
  const data = await dropboxRpc(organizacionId, '/files/move_v2', {
    from_path: fileId,
    to_path: `${toFolderPath}/${toName}`,
    autorename: true,
  });
  return { id: data?.metadata?.id || fileId, path: data?.metadata?.path_display };
}

export async function deleteDropboxFile(organizacionId: string, fileId: string): Promise<void> {
  await dropboxRpc(organizacionId, '/files/delete_v2', { path: fileId }).catch(() => {});
}

export { isDropboxConnected } from './dropboxAuth';
