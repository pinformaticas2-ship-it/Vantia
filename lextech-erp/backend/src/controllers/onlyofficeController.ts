import { Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import pool from '../config/database';
import { resolveUserName } from './activityController';
import { issueTempToken, overwriteClientFileContent } from './filesController';

// ─────────────────────────────────────────────────────────────
// Editor de documentos en el navegador con ONLYOFFICE Docs
// ─────────────────────────────────────────────────────────────
// El Document Server corre aparte (Docker, ver onlyoffice/README.md). Flujo:
//   1. El frontend pide GET /api/files/:clientId/:fileId/onlyoffice y recibe
//      la configuración del editor firmada con ONLYOFFICE_JWT_SECRET.
//   2. El Document Server descarga el archivo por /api/files/dl/:token.
//   3. Al guardar (botón Guardar o al cerrar todos los usuarios) llama a
//      POST /api/files/onlyoffice/callback/:clientId/:fileId con la URL del
//      documento nuevo, y aquí se sobrescribe el adjunto (disco + nube).
//
// Variables de entorno:
//   ONLYOFFICE_URL         URL pública del Document Server (la carga el navegador)
//   ONLYOFFICE_JWT_SECRET  el mismo JWT_SECRET configurado en el Document Server
//   ONLYOFFICE_BACKEND_URL opcional: URL con la que el Document Server llega a
//                          este backend (por defecto PUBLIC_BACKEND_URL o la de
//                          la propia petición)

const DOCS_URL = (process.env.ONLYOFFICE_URL || '').trim().replace(/\/+$/, '');
const JWT_SECRET = (process.env.ONLYOFFICE_JWT_SECRET || '').trim();

export const onlyofficeEnabled = () => Boolean(DOCS_URL && JWT_SECRET);

const WORD_EXTS = ['doc', 'docx', 'docm', 'dot', 'dotx', 'odt', 'rtf', 'txt'];
const CELL_EXTS = ['xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'csv'];
const SLIDE_EXTS = ['ppt', 'pptx', 'odp'];
// Formatos que ONLYOFFICE guarda en el mismo formato. Los antiguos (.doc,
// .xls, .ppt, .rtf...) se abren solo para consulta: guardarlos exigiría
// convertirlos a OOXML y cambiar la extensión del adjunto.
const EDITABLE_EXTS = ['docx', 'docm', 'dotx', 'odt', 'xlsx', 'xlsm', 'ods', 'pptx', 'odp'];

function documentTypeFor(ext: string): 'word' | 'cell' | 'slide' | 'pdf' | null {
  if (WORD_EXTS.includes(ext)) return 'word';
  if (CELL_EXTS.includes(ext)) return 'cell';
  if (SLIDE_EXTS.includes(ext)) return 'slide';
  if (ext === 'pdf') return 'pdf';
  return null;
}

// ── JWT HS256 (lo que espera ONLYOFFICE) ─────────────────────
const b64url = (buf: Buffer) => buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function signJwt(payload: object): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token: string): any | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expected = Buffer.from(b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest()));
  const got = Buffer.from(parts[2]);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Clave de sesión del documento ────────────────────────────
// Todos los que abren el mismo archivo a la vez deben recibir la MISMA clave
// para coeditar. Con el botón Guardar (forcesave) el archivo cambia a mitad
// de sesión, así que la clave no puede salir solo de updated_at: se fija al
// abrir la primera vez y se libera cuando el Document Server cierra la sesión.
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const _sessionKeys = new Map<string, { key: string; exp: number }>();

function sessionKeyFor(fileId: string, updatedAt: Date | string | null): string {
  const hit = _sessionKeys.get(fileId);
  if (hit && hit.exp > Date.now()) return hit.key;
  const version = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  const key = `${fileId}-${version}`.replace(/[^0-9a-zA-Z._=-]/g, '').slice(0, 128);
  _sessionKeys.set(fileId, { key, exp: Date.now() + SESSION_TTL_MS });
  return key;
}

function backendBaseUrl(req: any): string {
  const configured = (process.env.ONLYOFFICE_BACKEND_URL || process.env.PUBLIC_BACKEND_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

// ─────────────────────────────────────────────────────────────
// GET /api/files/onlyoffice/status
// ─────────────────────────────────────────────────────────────
export const onlyofficeStatus = (_req: any, res: Response) => {
  res.json({ success: true, enabled: onlyofficeEnabled() });
};

// ─────────────────────────────────────────────────────────────
// GET /api/files/:clientId/:fileId/onlyoffice?mode=view
// ─────────────────────────────────────────────────────────────
export const getEditorConfig = async (req: any, res: Response) => {
  if (!onlyofficeEnabled()) {
    return res.status(503).json({ success: false, error: 'El editor de documentos no está configurado en el servidor.' });
  }
  const { clientId, fileId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, original_name, updated_at, created_at FROM client_files WHERE id = $1 AND client_id = $2`,
      [fileId, clientId],
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    const file = rows[0];

    const ext = path.extname(file.original_name || '').slice(1).toLowerCase();
    const documentType = documentTypeFor(ext);
    if (!documentType) {
      return res.status(415).json({ success: false, error: 'Este tipo de archivo no se puede abrir en el editor.' });
    }

    const canEdit = EDITABLE_EXTS.includes(ext)
      && req.filesPuedeEditar === true
      && req.query.mode !== 'view';

    const userId = req.auth?.userId || 'anon';
    const userName = await resolveUserName(userId);
    const base = backendBaseUrl(req);

    const config: any = {
      documentType,
      document: {
        fileType: ext,
        key: sessionKeyFor(file.id, file.updated_at || file.created_at),
        title: file.original_name,
        url: `${base}/api/files/dl/${issueTempToken(clientId, file.id)}`,
        permissions: {
          edit: canEdit,
          comment: canEdit,
          review: canEdit,
          download: true,
          print: true,
        },
      },
      editorConfig: {
        mode: canEdit ? 'edit' : 'view',
        lang: 'es',
        region: 'es-ES',
        callbackUrl: `${base}/api/files/onlyoffice/callback/${encodeURIComponent(clientId)}/${encodeURIComponent(file.id)}`,
        user: { id: userId, name: userName },
        coEditing: { mode: 'fast', change: true },
        customization: {
          forcesave: true,
          autosave: true,
          compactHeader: true,
          hideRightMenu: false,
          feedback: false,
          help: false,
        },
      },
    };
    config.token = signJwt(config);

    res.json({ success: true, documentServerUrl: DOCS_URL, config, canEdit });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/files/onlyoffice/callback/:clientId/:fileId
// Lo llama el Document Server (sin sesión de Clerk): se autentica con el JWT
// firmado con el secreto compartido. Siempre hay que responder {error:0} si
// se ha procesado bien; cualquier otra cosa hace que el editor avise de error.
// ─────────────────────────────────────────────────────────────
export const editorCallback = async (req: any, res: Response) => {
  if (!onlyofficeEnabled()) return res.status(503).json({ error: 1 });
  const { clientId, fileId } = req.params;

  // El token llega en el cuerpo ({token}) o en la cabecera Authorization con
  // el cuerpo envuelto en {payload}, según la versión del Document Server.
  let data: any = null;
  if (typeof req.body?.token === 'string') {
    data = verifyJwt(req.body.token);
  } else {
    const auth = String(req.headers.authorization || '');
    const verified = auth.startsWith('Bearer ') ? verifyJwt(auth.slice(7)) : null;
    data = verified?.payload ?? null;
  }
  if (!data) return res.status(403).json({ error: 1, message: 'JWT inválido' });

  try {
    const status = Number(data.status);
    // 2 = listo para guardar (todos cerraron), 6 = guardado forzado (botón Guardar)
    if ((status === 2 || status === 6) && data.url) {
      const ext = String(data.filetype || '').toLowerCase();
      const { rows } = await pool.query(`SELECT original_name FROM client_files WHERE id = $1`, [fileId]);
      const originalExt = path.extname(rows[0]?.original_name || '').slice(1).toLowerCase();
      if (ext && originalExt && ext !== originalExt) {
        console.warn(`[ONLYOFFICE] Formato devuelto (${ext}) distinto del original (${originalExt}) en ${fileId}; no se guarda.`);
        return res.json({ error: 1 });
      }

      const resp = await fetch(String(data.url));
      if (!resp.ok) throw new Error(`No se pudo descargar el documento editado (${resp.status})`);
      const body = Buffer.from(await resp.arrayBuffer());
      if (!body.length) throw new Error('El documento editado llegó vacío');

      const editorId = Array.isArray(data.users) && data.users.length ? String(data.users[0]) : 'SYSTEM';
      const editorName = editorId === 'SYSTEM' ? 'Sistema' : await resolveUserName(editorId);
      const r = await overwriteClientFileContent(fileId, clientId, body, {
        userId: editorId,
        userName: editorName,
        label: 'el editor del ERP',
      });
      if (r.status !== 200) throw new Error(r.error || 'No se pudo guardar el archivo');
    }

    // 2 / 4 = la sesión de edición se ha cerrado: la próxima apertura usa una
    // clave nueva (el archivo ya tiene la versión guardada).
    if (status === 2 || status === 4) {
      const hit = _sessionKeys.get(fileId);
      if (hit && hit.key === data.key) _sessionKeys.delete(fileId);
    }

    res.json({ error: 0 });
  } catch (err: any) {
    console.error('[ONLYOFFICE] Error en callback:', err?.message || err);
    res.json({ error: 1 });
  }
};
