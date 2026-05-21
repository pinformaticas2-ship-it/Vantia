import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pool from '../config/database';
import { logActivityForReq } from './activityController';
import { CLIENT_FILES_ROOT as LOCAL_CLIENT_FILES_ROOT, TEMP_ROOT, UPLOADS_CLIENTS_ROOT as UPLOADS_ROOT } from '../config/paths';

const LIBREOFFICE_ENABLED =
  String(process.env.ENABLE_LIBREOFFICE_PREVIEW || "true").trim().toLowerCase() !== "false";

type LocalEditWatcher = {
  watcher: fs.FSWatcher;
  timer: NodeJS.Timeout | null;
  lastSyncedMtimeMs: number;
};

const localEditWatchers = new Map<string, LocalEditWatcher>();

// ─── Tipos de adjunto → subcarpetas ────────────────────────────
// Cada tipo tiene su propia carpeta dentro del directorio del cliente
const ATTACHMENT_TYPE_FOLDERS = [
  'Sin clasificar',
  'AUTO',
  'ESCRITO PROCESAL',
  'FACTURAS',
  'PODER',
  'EVIDENCIA',
] as const;

/** Sanea el nombre del tipo para usarlo como nombre de carpeta */
function typeFolderName(attachmentType?: string | null): string {
  return (attachmentType && attachmentType.trim()) ? attachmentType.trim() : 'Sin clasificar';
}

// Asegura que el directorio del cliente existe (servidor — estructura plana)
function ensureClientDir(clientId: string) {
  const dir = path.join(UPLOADS_ROOT, clientId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Asegura que la subcarpeta local del cliente para un tipo concreto existe.
 * Estructura:  {LOCAL_CLIENT_FILES_ROOT}/{clientId}/{attachmentType}/
 */
function ensureLocalClientDir(clientId: string, attachmentType?: string | null): string {
  const typeFolder = typeFolderName(attachmentType);
  const dir = path.join(LOCAL_CLIENT_FILES_ROOT, clientId, typeFolder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureLocalEditableDir(clientId: string, attachmentType?: string | null, fileId?: string): string {
  const baseDir = ensureLocalClientDir(clientId, attachmentType);
  if (!fileId) return baseDir;
  const dir = path.join(baseDir, fileId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function closeLocalEditWatcher(localPath: string) {
  const existing = localEditWatchers.get(localPath);
  if (!existing) return;
  if (existing.timer) clearTimeout(existing.timer);
  try { existing.watcher.close(); } catch (_) {}
  localEditWatchers.delete(localPath);
}

function watchLocalEditableFile(localPath: string, serverPath: string, fileId: string, clientId: string) {
  closeLocalEditWatcher(localPath);

  let lastSyncedMtimeMs = fs.existsSync(localPath) ? fs.statSync(localPath).mtimeMs : 0;

  const syncBackToServer = async () => {
    try {
      if (!fs.existsSync(localPath) || !fs.existsSync(serverPath)) return;
      const localStat = fs.statSync(localPath);
      if (localStat.mtimeMs <= lastSyncedMtimeMs) return;

      fs.copyFileSync(localPath, serverPath);
      lastSyncedMtimeMs = fs.statSync(localPath).mtimeMs;

      await pool.query(
        `UPDATE client_files
         SET size_bytes = $1
         WHERE id = $2 AND client_id = $3`,
        [localStat.size, fileId, clientId]
      );
    } catch (_) {
      // Fallo silencioso: Word/Excel pueden seguir bloqueando el archivo unos ms.
    }
  };

  const watcher = fs.watch(localPath, () => {
    const current = localEditWatchers.get(localPath);
    if (!current) return;
    if (current.timer) clearTimeout(current.timer);
    current.timer = setTimeout(() => {
      syncBackToServer().catch(() => {});
    }, 1200);
  });

  localEditWatchers.set(localPath, {
    watcher,
    timer: null,
    lastSyncedMtimeMs,
  });
}

/**
 * Crea TODAS las subcarpetas de tipos para un cliente.
 * También genera un fichero _CLIENTE.txt con el nombre legible si se pasa.
 */
async function initClientFolders(clientId: string): Promise<void> {
  try {
    // Crear subcarpeta para cada tipo de adjunto
    for (const folder of ATTACHMENT_TYPE_FOLDERS) {
      const dir = path.join(LOCAL_CLIENT_FILES_ROOT, clientId, folder);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    // Obtener nombre del cliente y escribir fichero informativo
    const info = await pool.query(
      `SELECT first_name, last_name, commercial_name, nif_cif, internal_number
       FROM entities WHERE id = $1 LIMIT 1`,
      [clientId]
    );
    if (info.rows.length) {
      const r = info.rows[0];
      const displayName = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.commercial_name || r.nif_cif || clientId;
      const txtPath = path.join(LOCAL_CLIENT_FILES_ROOT, clientId, '_CLIENTE.txt');
      if (!fs.existsSync(txtPath)) {
        fs.writeFileSync(txtPath,
          `Cliente: ${displayName}\nNIF/CIF: ${r.nif_cif || '—'}\nNº Interno: ${r.internal_number || '—'}\nID: ${clientId}\n`,
          'utf8'
        );
      }
    }
  } catch (_) {/* fallo silencioso */}
}

// Sincroniza archivo del servidor a la subcarpeta local del tipo correspondiente
function syncFileToLocal(
  clientId: string,
  fileName: string,
  sourceFilePath: string,
  attachmentType?: string | null
): string | null {
  try {
    const localDir = ensureLocalClientDir(clientId, attachmentType);
    const destPath = path.join(localDir, fileName);
    fs.copyFileSync(sourceFilePath, destPath);
    return destPath;
  } catch (err) {
    // Fallar silenciosamente si no se puede copiar a local
    return null;
  }
}

/**
 * Mueve el archivo local cuando cambia su tipo o nombre.
 * Busca en todos los subfolders si no lo encuentra en el esperado.
 */
function moveLocalFile(
  clientId: string,
  oldOriginalName: string,
  newOriginalName: string,
  oldType: string | null,
  newType: string | null
): void {
  try {
    const oldFolder = typeFolderName(oldType);
    const newFolder = typeFolderName(newType);
    const clientRoot = path.join(LOCAL_CLIENT_FILES_ROOT, clientId);

    // Intentar encontrar el archivo: primero en la carpeta esperada
    let sourcePath = path.join(clientRoot, oldFolder, oldOriginalName);

    // Si no está en la carpeta esperada, buscar en todas las subcarpetas
    if (!fs.existsSync(sourcePath)) {
      for (const folder of ATTACHMENT_TYPE_FOLDERS) {
        const candidate = path.join(clientRoot, folder, oldOriginalName);
        if (fs.existsSync(candidate)) { sourcePath = candidate; break; }
      }
      // Último recurso: raíz del cliente (archivos no migrados)
      if (!fs.existsSync(sourcePath)) {
        const rootCandidate = path.join(clientRoot, oldOriginalName);
        if (fs.existsSync(rootCandidate)) sourcePath = rootCandidate;
      }
    }

    if (!fs.existsSync(sourcePath)) return; // no existe localmente, nada que mover

    const destDir  = ensureLocalClientDir(clientId, newType);
    const destPath = path.join(destDir, newOriginalName);

    // Si origen y destino son el mismo fichero, no hacer nada
    if (sourcePath === destPath) return;

    fs.copyFileSync(sourcePath, destPath);
    // Borrar el original sólo si era un fichero diferente
    try { fs.unlinkSync(sourcePath); } catch (_) {}
  } catch (_) {/* fallo silencioso */}
}

// ─────────────────────────────────────────────────────────────
// GET /api/files/:clientId  — lista de archivos del cliente
// ─────────────────────────────────────────────────────────────
export const listFiles = async (req: any, res: Response) => {
  const { clientId } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, original_name, stored_name, mimetype, size_bytes, category, document_name, attachment_type, created_by, created_at, updated_at
       FROM client_files WHERE client_id = $1 ORDER BY created_at DESC`,
      [clientId]
    );
    const rows = result.rows.map((row: any) => {
      if (!isOfficeOpenable(row.original_name, row.mimetype)) return row;
      const token = crypto.randomUUID();
      _tempTokens.set(token, { clientId, fileId: row.id, exp: Date.now() + 30 * 60 * 1000 });
      return { ...row, open_token: token };
    });
    // Asegurar que las carpetas del cliente existen (silencioso, en background)
    initClientFolders(clientId).catch(() => {});
    res.json({ success: true, data: rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/files/:clientId  — subir uno o varios archivos
// ─────────────────────────────────────────────────────────────
export const uploadFiles = async (req: any, res: Response) => {
  const { clientId } = req.params;
  const userId = req.auth?.userId || 'SYSTEM';
  const files: Express.Multer.File[] = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    return res.status(400).json({ success: false, error: 'No se recibieron archivos.' });
  }

  try {
    const inserted: any[] = [];
    const clientDir = ensureClientDir(clientId);
    for (const file of files) {
      // Extraer solo el nombre del archivo si viene de una carpeta anidada (ej: "carpeta/archivo.txt" -> "archivo.txt")
      const baseFileName = path.basename(file.originalname);
      const result = await pool.query(
        `INSERT INTO client_files (client_id, original_name, stored_name, mimetype, size_bytes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [clientId, baseFileName, file.filename, file.mimetype, file.size, userId]
      );
      inserted.push(result.rows[0]);

      // Sincronizar archivo a subcarpeta local del tipo (por defecto "Sin clasificar")
      const sourceFile = path.join(clientDir, file.filename);
      syncFileToLocal(clientId, baseFileName, sourceFile, 'Sin clasificar');

      // Registrar en historial
      logActivityForReq(req, `Archivo subido: ${baseFileName}`, 'CLIENT', clientId);
    }
    res.status(201).json({ success: true, data: inserted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/files/:clientId/:fileId/download  — servir archivo
// ─────────────────────────────────────────────────────────────
export const downloadFile = async (req: any, res: Response) => {
  const { clientId, fileId } = req.params;
  try {
    const result = await pool.query(
      `SELECT stored_name, original_name, mimetype FROM client_files WHERE id = $1 AND client_id = $2`,
      [fileId, clientId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }
    const { stored_name, original_name, mimetype } = result.rows[0];
    const filePath = path.join(UPLOADS_ROOT, clientId, stored_name);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco.' });
    }
    res.setHeader('Content-Type', mimetype);
    // RFC 5987: filename= con ASCII seguro + filename*= para caracteres Unicode
    const asciiName = original_name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(original_name)}`
    );
    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// Temporary one-time download tokens (no auth header required)
// Lets native apps (Word, Excel, PDF Studio) fetch files directly
// ─────────────────────────────────────────────────────────────
const _tempTokens = new Map<string, { clientId: string; fileId: string; exp: number }>();
const _cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [t, d] of _tempTokens) if (d.exp < now) _tempTokens.delete(t);
}, 60_000);
if (typeof (_cleanupTimer as any).unref === 'function') (_cleanupTimer as any).unref();

const isOfficeOpenable = (fileName?: string | null, mimeType?: string | null) => {
  const ext = path.extname(fileName || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  return [
    '.doc', '.docx', '.odt', '.rtf', '.dot', '.dotx',
    '.xls', '.xlsx', '.xlsm', '.xlsb', '.ods', '.csv',
    '.ppt', '.pptx', '.odp',
  ].includes(ext)
    || mime.includes('word')
    || mime.includes('excel')
    || mime.includes('spreadsheet')
    || mime.includes('presentation');
};

export const createTempToken = async (req: any, res: Response) => {
  const { clientId, fileId } = req.params;
  try {
    const token = crypto.randomUUID();
    _tempTokens.set(token, { clientId, fileId, exp: Date.now() + 30 * 60 * 1000 });
    res.json({ success: true, token });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const downloadByToken = async (req: any, res: Response) => {
  const { token } = req.params;
  const data = _tempTokens.get(token);
  if (!data || data.exp < Date.now()) {
    return res.status(401).json({ success: false, error: 'Token inválido o expirado.' });
  }
  // HEAD requests (Office probes URL before GET) — answer with headers but keep token alive
  const isHead = req.method === 'HEAD';
  if (!isHead) _tempTokens.delete(token);
  try {
    const result = await pool.query(
      `SELECT stored_name, original_name, mimetype, client_id FROM client_files WHERE id = $1 LIMIT 1`,
      [data.fileId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    const { stored_name, original_name, mimetype, client_id } = result.rows[0];
    const realClientId = client_id || data.clientId;
    const filePath = path.join(UPLOADS_ROOT, realClientId, stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco.' });
    res.setHeader('Content-Type', mimetype);
    const asciiName = original_name.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
    res.setHeader('Content-Disposition', `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(original_name)}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (isHead) return res.status(200).end();
    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/files/dl/:token/launch  — redirect server-side a ms-word/excel/powerpoint
// El redirect HTTP preserva | sin codificar (evita %7C de Chrome)
// ─────────────────────────────────────────────────────────────
export const launchWithOffice = async (req: any, res: Response) => {
  const { token } = req.params;
  const data = _tempTokens.get(token);
  if (!data || data.exp < Date.now()) {
    return res.status(401).send('Token inválido o expirado.');
  }
  try {
    const result = await pool.query(
      `SELECT original_name FROM client_files WHERE id = $1 LIMIT 1`,
      [data.fileId]
    );
    if (result.rows.length === 0) return res.status(404).send('Archivo no encontrado.');
    const { original_name } = result.rows[0];
    const ext = (original_name || '').split('.').pop()?.toLowerCase() ?? '';
    const excelExts = ['xls','xlsx','xlsm','xlsb','ods','csv'];
    const pptExts   = ['ppt','pptx','odp'];
    const scheme = excelExts.includes(ext) ? 'ms-excel'
      : pptExts.includes(ext) ? 'ms-powerpoint'
      : 'ms-word';
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host  = req.headers['x-forwarded-host']  || req.get('host');
    const fileUrl = `${proto}://${host}/api/files/dl/${token}`;
    // Literal | in Location header — Chrome passes it as-is to Windows ShellExecute
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Location', `${scheme}:ofe|u|${fileUrl}`);
    res.status(302).end();
  } catch (err: any) {
    res.status(500).send(err.message);
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/files/:clientId/:fileId  — borrar archivo
// ─────────────────────────────────────────────────────────────
export const deleteFile = async (req: any, res: Response) => {
  const { clientId, fileId } = req.params;
  const userId = req.auth?.userId || 'SYSTEM';
  try {
    const result = await pool.query(
      `DELETE FROM client_files WHERE id = $1 AND client_id = $2 RETURNING stored_name, original_name, attachment_type`,
      [fileId, clientId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }
    const { stored_name, original_name, attachment_type } = result.rows[0];
    // Borrar del servidor (almacenamiento plano con UUID)
    const filePath = path.join(UPLOADS_ROOT, clientId, stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    // Borrar del directorio local (subcarpeta por tipo)
    const localTypeDir = path.join(LOCAL_CLIENT_FILES_ROOT, clientId, typeFolderName(attachment_type));
    const localFilePath = path.join(localTypeDir, original_name);
    if (fs.existsSync(localFilePath)) { try { fs.unlinkSync(localFilePath); } catch (_) {} }
    logActivityForReq(req, `Archivo eliminado: ${original_name || stored_name}`, 'CLIENT', clientId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// PUT /api/files/:clientId/:fileId  — actualizar nombre y tipo
// ─────────────────────────────────────────────────────────────
export const updateFileMetadata = async (req: any, res: Response) => {
  const { clientId, fileId } = req.params;
  const { document_name, attachment_type } = req.body;

  try {
    // Leer valores actuales ANTES de actualizar (para mover el fichero local)
    const existing = await pool.query(
      `SELECT original_name, attachment_type FROM client_files WHERE id = $1 AND client_id = $2`,
      [fileId, clientId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }
    const oldOriginalName  = existing.rows[0].original_name as string;
    const oldAttachType    = existing.rows[0].attachment_type as string | null;

    let originalNameUpdate = '';
    let params: any[];
    let newOriginalName    = oldOriginalName;

    if (document_name) {
      const ext = path.extname(oldOriginalName || '.docx');
      newOriginalName     = `${document_name}${ext}`;
      originalNameUpdate  = `, original_name = $5`;
      params = [document_name, attachment_type || 'Sin clasificar', fileId, clientId, newOriginalName];
    } else {
      params = [null, attachment_type || 'Sin clasificar', fileId, clientId];
    }

    const query = `
      UPDATE client_files
      SET document_name = $1, attachment_type = $2, updated_at = NOW() ${originalNameUpdate}
      WHERE id = $3 AND client_id = $4
      RETURNING id, document_name, attachment_type, original_name, updated_at
    `;

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }

    // Mover fichero local si cambió el tipo o el nombre
    const newAttachType = attachment_type || 'Sin clasificar';
    const typeChanged   = typeFolderName(oldAttachType) !== typeFolderName(newAttachType);
    const nameChanged   = newOriginalName !== oldOriginalName;
    if (typeChanged || nameChanged) {
      moveLocalFile(clientId, oldOriginalName, newOriginalName, oldAttachType, newAttachType);
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/files/:clientId/create-blank  — crear doc en blanco
// ─────────────────────────────────────────────────────────────
export const createBlankDocument = async (req: any, res: Response) => {
  const { clientId } = req.params;
  const { document_name, attachment_type } = req.body;
  const userId = req.auth?.userId || 'SYSTEM';

  try {
    // Preparar buffer del .docx en blanco
    const blankDocx = Buffer.from(BLANK_DOCX_B64, 'base64');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const storedName = `${timestamp}_blank.docx`;
    // Si se proporciona document_name, usarlo; si no, usar fecha
    const originalName = document_name
      ? `${document_name}.docx`
      : `Nuevo documento ${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.docx`;

    // Asegurar que la carpeta del cliente existe
    const clientDir = ensureClientDir(clientId);
    const filePath = path.join(clientDir, storedName);

    // Guardar archivo en disco
    fs.writeFileSync(filePath, blankDocx);

    // Sincronizar a subcarpeta local del tipo correspondiente
    syncFileToLocal(clientId, originalName, filePath, attachment_type || 'Sin clasificar');

    // Guardar en base de datos con metadatos
    const result = await pool.query(
      `INSERT INTO client_files (client_id, original_name, stored_name, mimetype, size_bytes, document_name, attachment_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, original_name`,
      [clientId, originalName, storedName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', blankDocx.length, document_name || null, attachment_type || 'Sin clasificar', userId]
    );

    const fileId = result.rows[0].id;
    // URL de descarga con token incluido (el cliente la usará para Word)
    const downloadUrl = `/api/files/${clientId}/${fileId}/download`;

    logActivityForReq(req, `Documento creado: ${originalName}`, 'CLIENT', clientId);

    res.status(201).json({
      success: true,
      data: {
        id: fileId,
        original_name: result.rows[0].original_name,
        downloadUrl: downloadUrl,
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/files/:clientId/:fileId/open-local
// Copia el archivo a la carpeta local y lo abre con la app del SO
// ─────────────────────────────────────────────────────────────
export const openFileLocally = async (req: any, res: Response) => {
  const { clientId, fileId } = req.params;
  try {
    const result = await pool.query(
      `SELECT stored_name, original_name, attachment_type FROM client_files WHERE id = $1 AND client_id = $2`,
      [fileId, clientId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }
    const { stored_name, original_name, attachment_type } = result.rows[0];
    const serverPath = path.join(UPLOADS_ROOT, clientId, stored_name);

    if (!fs.existsSync(serverPath)) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco.' });
    }

    // Cada adjunto editable vive en su propia subcarpeta para que no se
    // pisen archivos con el mismo nombre dentro del mismo expediente.
    const localDir  = ensureLocalEditableDir(clientId, attachment_type, fileId);
    const localPath = path.join(localDir, original_name);
    const serverStat = fs.statSync(serverPath);
    const shouldRefreshLocal =
      !fs.existsSync(localPath) ||
      fs.statSync(localPath).mtimeMs < serverStat.mtimeMs;

    if (shouldRefreshLocal) {
      fs.copyFileSync(serverPath, localPath);
    }

    watchLocalEditableFile(localPath, serverPath, fileId, clientId);

    // Abrir con la aplicación por defecto del SO
    const { spawn } = require('child_process');
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', localPath], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [localPath], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [localPath], { detached: true, stdio: 'ignore' }).unref();
    }

    res.json({ success: true, localPath });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/files/:clientId/:fileId/preview-html
// Convierte .docx a HTML para previsualización en el navegador
// ─────────────────────────────────────────────────────────────
export const previewDocxAsHtml = async (req: any, res: Response) => {
  const { clientId, fileId } = req.params;
  try {
    const result = await pool.query(
      `SELECT stored_name, original_name, mimetype FROM client_files WHERE id = $1 AND client_id = $2`,
      [fileId, clientId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }
    const { stored_name, original_name, mimetype } = result.rows[0];
    const ext = path.extname(original_name || stored_name || '').toLowerCase();
    const isWord =
      mimetype?.includes('word') ||
      mimetype?.includes('wordprocessingml') ||
      ext === '.doc' ||
      ext === '.docx';

    // Solo permitir previsualizar archivos Word
    if (!isWord) {
      return res.status(400).json({ success: false, error: 'Este tipo de archivo no es soportado para previsualización.' });
    }

    const filePath = path.join(UPLOADS_ROOT, clientId, stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco.' });
    }

    let previewSourcePath = filePath;
    if (ext === '.doc') {
      const tempDir = TEMP_ROOT;
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const outputDocx = path.join(tempDir, `client_doc_preview_${fileId}.docx`);

      try {
        if (fs.existsSync(outputDocx)) {
          const srcMtime = fs.statSync(filePath).mtimeMs;
          const cacheMtime = fs.statSync(outputDocx).mtimeMs;
          if (cacheMtime >= srcMtime) {
            previewSourcePath = outputDocx;
          }
        }
      } catch (_) {}

      if (previewSourcePath === filePath) {
        const converterScript = path.join(tempDir, `client_doc_to_docx_${fileId}.py`);
        const converterCode = `import sys, os, subprocess, shutil

doc_path = sys.argv[1]
out_path = sys.argv[2]
converted = False

try:
    import win32com.client
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    doc = word.Documents.Open(doc_path, False, True)
    doc.SaveAs(out_path, FileFormat=16)
    doc.Close(False)
    word.Quit()
    if os.path.exists(out_path):
        converted = True
except Exception:
    pass

if not converted:
    try:
        doc_esc = doc_path.replace("'", "''")
        out_esc = out_path.replace("'", "''")
        ps_cmd = (
            "$ErrorActionPreference='Stop';"
            "$w=New-Object -ComObject Word.Application;"
            "$w.Visible=$false;$w.DisplayAlerts=0;"
            "$d=$w.Documents.Open('" + doc_esc + "',$false,$true);"
            "$d.SaveAs('" + out_esc + "',16);"
            "$d.Close($false);$w.Quit()"
        )
        r = subprocess.run(
            ['powershell', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps_cmd],
            timeout=60, capture_output=True
        )
        if r.returncode == 0 and os.path.exists(out_path):
            converted = True
    except Exception:
        pass

if not converted:
    if sys.platform == 'win32':
        soffice_paths = [
            r'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
            r'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
            'soffice',
        ]
    else:
        soffice_paths = ['soffice', '/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice']
    out_dir = os.path.dirname(out_path)
    for soffice in soffice_paths:
        try:
            r = subprocess.run(
                [soffice, '--headless', '--convert-to', 'docx', '--outdir', out_dir, doc_path],
                timeout=60, capture_output=True
            )
            candidate = os.path.join(out_dir, os.path.splitext(os.path.basename(doc_path))[0] + '.docx')
            if os.path.exists(candidate):
                if candidate != out_path:
                    shutil.move(candidate, out_path)
                if os.path.exists(out_path):
                    converted = True
                    break
        except Exception:
            continue

print('OK' if converted else 'FAILED')
sys.exit(0 if converted else 1)
`;
        fs.writeFileSync(converterScript, converterCode, 'utf-8');
        const { execFile } = require('child_process');
        const pythonCmds = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];

        let converted = false;
        for (const pythonCmd of pythonCmds) {
          const success = await new Promise<boolean>((resolve) => {
            execFile(pythonCmd, [converterScript, filePath, outputDocx], { timeout: 90000 }, (err: any) => {
              resolve(!err && fs.existsSync(outputDocx));
            });
          });
          if (success) {
            converted = true;
            break;
          }
        }
        try { fs.unlinkSync(converterScript); } catch (_) {}
        if (!converted) {
          return res.status(500).json({ success: false, error: 'No se pudo convertir el archivo .doc para generar la vista previa.' });
        }
        previewSourcePath = outputDocx;
      }
    }

    // Crear script Python temporal
    const tempDir = TEMP_ROOT;
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const scriptPath = path.join(tempDir, `preview_${fileId}.py`);

    // Convertir barras invertidas a normales para que Python no las interprete como escapes
    const normalizedPath = previewSourcePath.replace(/\\/g, '/');

    const pythonScript = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io, base64
from zipfile import ZipFile
from xml.etree import ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# ─── Helpers de namespace y color ────────────────────────────────────────────
W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

def wattr(elem, name, default=None):
    """Lee un atributo w:name usando el URI completo (necesario en ElementTree)."""
    return elem.get(f'{{{W_NS}}}{name}', default)

# Cache de colores del tema del documento actual
_theme_colors = {}

def load_theme_colors(docx):
    """Carga la paleta de colores de word/theme/theme1.xml en _theme_colors."""
    global _theme_colors
    _theme_colors = {}
    try:
        theme_xml = docx.read('word/theme/theme1.xml').decode('utf-8')
        root_t = ET.fromstring(theme_xml.encode('utf-8'))
        AN = 'http://schemas.openxmlformats.org/drawingml/2006/main'
        color_map = {
            'dark1':'dk1','light1':'lt1','dark2':'dk2','light2':'lt2',
            'accent1':'accent1','accent2':'accent2','accent3':'accent3',
            'accent4':'accent4','accent5':'accent5','accent6':'accent6',
            'hyperlink':'hlink','followedHyperlink':'folHlink',
        }
        clr_scheme = root_t.find(f'.//{{{AN}}}clrScheme')
        if clr_scheme is None: return
        for w_name, a_name in color_map.items():
            el = clr_scheme.find(f'{{{AN}}}{a_name}')
            if el is None: continue
            srgb = el.find(f'{{{AN}}}srgbClr')
            if srgb is not None:
                _theme_colors[w_name] = srgb.get('val', '000000'); continue
            sys_clr = el.find(f'{{{AN}}}sysClr')
            if sys_clr is not None:
                _theme_colors[w_name] = sys_clr.get('lastClr', '000000')
    except:
        pass

def _apply_tint_shade(hex6, tint=None, shade=None):
    """Aclara (tint) u oscurece (shade) un color hex de 6 dígitos (valores 0-FF)."""
    try:
        r, g, b = int(hex6[0:2],16), int(hex6[2:4],16), int(hex6[4:6],16)
        if tint is not None:
            t = int(tint, 16) / 255.0
            r = int(r + (255-r)*(1-t)); g = int(g + (255-g)*(1-t)); b = int(b + (255-b)*(1-t))
        if shade is not None:
            s = int(shade, 16) / 255.0
            r = int(r*s); g = int(g*s); b = int(b*s)
        clamp = lambda v: max(0, min(255, v))
        return f'{clamp(r):02X}{clamp(g):02X}{clamp(b):02X}'
    except:
        return hex6

def resolve_clr(elem):
    """Resuelve w:themeColor+Tint/Shade o w:val a un color CSS #RRGGBB."""
    theme_color = wattr(elem, 'themeColor')
    tint        = wattr(elem, 'themeTint')
    shade_v     = wattr(elem, 'themeShade')
    val         = wattr(elem, 'val')
    if theme_color and theme_color in _theme_colors:
        hex6 = _theme_colors[theme_color]
        if tint or shade_v:
            hex6 = _apply_tint_shade(hex6, tint, shade_v)
        return f'#{hex6}'
    if val and val.lower() not in ('auto', 'none', ''):
        return f'#{val}'
    return None

_HIGHLIGHT = {
    'yellow':'#FFFF00','green':'#00FF00','cyan':'#00FFFF','magenta':'#FF00FF',
    'blue':'#0000FF','red':'#FF0000','darkBlue':'#000080','darkCyan':'#008080',
    'darkGreen':'#008000','darkMagenta':'#800080','darkRed':'#800000',
    'darkYellow':'#808000','darkGray':'#808080','lightGray':'#C0C0C0',
    'black':'#000000','white':'#FFFFFF',
}

def _is_on(elem):
    """Devuelve True si un elemento toggle (b, i, strike…) está activo."""
    v = wattr(elem, 'val', 'true').lower()
    return v not in ('false', '0', 'off')

def get_run_style(run, ns):
    """Extrae TODOS los estilos de un run con colores de tema, relleno, super/sub, etc."""
    style = {}
    rPr = run.find('w:rPr', ns)
    if not rPr: return style

    # ── Color de fuente ───────────────────────────────────────────────────────
    color_el = rPr.find('w:color', ns)
    if color_el is not None:
        c = resolve_clr(color_el)
        if c: style['color'] = c

    # ── Tamaño de fuente ──────────────────────────────────────────────────────
    for sz_tag in ('w:sz', 'w:szCs'):
        sz = rPr.find(sz_tag, ns)
        if sz is not None:
            try: style['font-size'] = f'{int(wattr(sz,"val","22"))//2}pt'; break
            except: pass

    # ── Familia de fuente ─────────────────────────────────────────────────────
    rFonts = rPr.find('w:rFonts', ns)
    if rFonts is not None:
        f = wattr(rFonts,'ascii') or wattr(rFonts,'hAnsi') or wattr(rFonts,'cs')
        if f: style['font-family'] = f'"{f}",sans-serif'

    # ── Negrita ───────────────────────────────────────────────────────────────
    b_el = rPr.find('w:b', ns)
    if b_el is not None and _is_on(b_el): style['font-weight'] = 'bold'

    # ── Cursiva ───────────────────────────────────────────────────────────────
    i_el = rPr.find('w:i', ns)
    if i_el is not None and _is_on(i_el): style['font-style'] = 'italic'

    # ── Subrayado ─────────────────────────────────────────────────────────────
    u = rPr.find('w:u', ns)
    if u is not None:
        uval = wattr(u, 'val', 'single')
        if uval and uval not in ('none','false','0'):
            style['text-decoration'] = 'underline double' if uval == 'double' else 'underline'

    # ── Tachado ───────────────────────────────────────────────────────────────
    deco = style.get('text-decoration', '')
    for st_tag in ('w:strike', 'w:dstrike'):
        st = rPr.find(st_tag, ns)
        if st is not None and _is_on(st):
            deco = (deco + ' line-through').strip()
    if deco: style['text-decoration'] = deco

    # ── Resaltado (highlight marker) ──────────────────────────────────────────
    hl = rPr.find('w:highlight', ns)
    if hl is not None:
        hval = wattr(hl, 'val')
        if hval in _HIGHLIGHT: style['background-color'] = _HIGHLIGHT[hval]

    # ── Relleno/sombreado del texto (w:shd en rPr) ───────────────────────────
    shd = rPr.find('w:shd', ns)
    if shd is not None:
        # Intentar resolver via themeColor/fill
        c = resolve_clr(shd)
        if not c:
            fill = wattr(shd, 'fill')
            if fill and fill.lower() not in ('auto', 'none', 'ffffff', ''):
                c = f'#{fill}'
        if c and 'background-color' not in style:
            style['background-color'] = c

    # ── Superíndice / Subíndice ───────────────────────────────────────────────
    va = rPr.find('w:vertAlign', ns)
    if va is not None:
        vval = wattr(va, 'val', '')
        if vval == 'superscript':
            style['vertical-align'] = 'super'; style['font-size'] = '75%'
        elif vval == 'subscript':
            style['vertical-align'] = 'sub'; style['font-size'] = '75%'

    # ── Versalitas / Mayúsculas ───────────────────────────────────────────────
    sc = rPr.find('w:smallCaps', ns)
    if sc is not None and _is_on(sc): style['font-variant'] = 'small-caps'
    caps = rPr.find('w:caps', ns)
    if caps is not None and _is_on(caps): style['text-transform'] = 'uppercase'

    # ── Espaciado entre caracteres ────────────────────────────────────────────
    sp_el = rPr.find('w:spacing', ns)
    if sp_el is not None:
        spval = wattr(sp_el, 'val')
        if spval:
            try: style['letter-spacing'] = f'{int(spval)/20:.1f}pt'
            except: pass

    return style

def para_to_html(para, ns, rels, images):
    """Convierte un párrafo a HTML con TODOS los estilos"""
    style = {}
    pPr = para.find('w:pPr', ns)

    if pPr:
        # Alineación
        jc = pPr.find('w:jc', ns)
        if jc is not None:
            align = wattr(jc, 'val')
            if align == 'center': style['text-align'] = 'center'
            elif align == 'right': style['text-align'] = 'right'
            elif align == 'both': style['text-align'] = 'justify'

        # Espacios y línea
        spacing = pPr.find('w:spacing', ns)
        if spacing is not None:
            before = wattr(spacing, 'before')
            after  = wattr(spacing, 'after')
            line   = wattr(spacing, 'line')
            try:
                if before: style['margin-top']    = f'{int(before)//100}px'
                if after:  style['margin-bottom'] = f'{int(after)//100}px'
                if line:   style['line-height']   = f'{int(line)/240:.2f}'
            except: pass

        # Indentación
        ind = pPr.find('w:ind', ns)
        if ind is not None:
            left  = wattr(ind, 'left')
            right = wattr(ind, 'right')
            hang  = wattr(ind, 'hanging')
            try:
                if left: style['margin-left']    = f'{int(left)//20}px'
                if right: style['margin-right']  = f'{int(right)//20}px'
                if hang: style['text-indent']    = f'-{int(hang)//20}px'
            except: pass

        # Fondo/Sombreado de párrafo
        shd = pPr.find('w:shd', ns)
        if shd is not None:
            c = resolve_clr(shd)
            if not c:
                fill = wattr(shd, 'fill')
                if fill and fill.lower() not in ('auto', 'none', ''):
                    c = f'#{fill}'
            if c: style['background-color'] = c

        # Bordes
        pBdr = pPr.find('w:pBdr', ns)
        if pBdr:
            top = pBdr.find('w:top', ns)
            if top: style['border-top'] = '1px solid #000'
            bottom = pBdr.find('w:bottom', ns)
            if bottom: style['border-bottom'] = '1px solid #000'

    html = '<p style="' + ';'.join([f'{k}:{v}' for k,v in style.items()]) + '">'

    for run in para.findall('.//w:r', ns):
        s = get_run_style(run, ns)
        css = ';'.join([f'{k}:{v}' for k,v in s.items()])

        for t in run.findall('.//w:t', ns):
            if t.text:
                txt = t.text.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
                html += f'<span style="{css}">{txt}</span>' if css else txt

        # Imágenes (inline y anchor)
        for draw in run.findall('w:drawing', ns):
            for container in list(draw.findall('wp:inline', ns)) + list(draw.findall('wp:anchor', ns)):
                for blip in container.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip'):
                    e = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                    if e and e in rels:
                        img_path = rels[e]
                        img_name = img_path.split('/')[-1]
                        if img_name in images:
                            data = images[img_name]
                            html += f'<img src="data:{data["mime"]};base64,{data["data"]}" style="max-width:100%;height:auto;margin:8px 0;border-radius:4px;display:block;"/>'

    html += '</p>'
    return html

def extract_text_from_element(element, ns, rels, images):
    """Extrae texto con formato MEJORADO (colores exactos, tamaños, etc) de un elemento XML"""
    html = ''
    for run in element.findall('.//w:r', ns):
        # Usar la función mejorada get_run_style
        s = get_run_style(run, ns)
        css = ';'.join([f'{k}:{v}' for k,v in s.items()])

        # Procesar texto
        for text_elem in run.findall('.//w:t', ns):
            if text_elem.text:
                text = text_elem.text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                if css.strip():
                    html += f'<span style="{css}">{text}</span>'
                else:
                    html += text

        # Procesar imágenes (inline y anchor)
        for drawing in run.findall('w:drawing', ns):
            for container in list(drawing.findall('wp:inline', ns)) + list(drawing.findall('wp:anchor', ns)):
                for blip in container.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip'):
                    embed = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                    if embed and embed in rels:
                        img_path = rels[embed]
                        img_name = img_path.split('/')[-1]
                        if img_name in images:
                            img_data = images[img_name]
                            html += '<img src="data:' + img_data['mime'] + ';base64,' + img_data['data'] + '" style="max-width:100%;height:auto;margin:8px 0;border-radius:4px;display:block;"/>'
    return html

try:
    file_path = sys.argv[1] if len(sys.argv) > 1 else '${normalizedPath}'
    with ZipFile(file_path, 'r') as docx:
        # Leer XML del documento
        xml_content = docx.read('word/document.xml').decode('utf-8')
        root = ET.fromstring(xml_content.encode('utf-8'))

        # Namespaces (IMPORTANTE: incluir todos para procesar imágenes)
        ns = {
            'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
            'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
            'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
            'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
            'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture'
        }

        # Cargar relaciones para mapear IDs de imágenes
        rels = {}
        try:
            rels_content = docx.read('word/_rels/document.xml.rels')
            rels_root = ET.fromstring(rels_content)
            for rel in rels_root.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                rel_id = rel.get('Id')
                target = rel.get('Target')
                rels[rel_id] = target
        except:
            pass

        # Cargar imágenes en memoria
        images = {}
        try:
            for item in docx.namelist():
                if item.startswith('word/media/'):
                    img_name = item.split('/')[-1]
                    img_data = docx.read(item)
                    img_b64 = base64.b64encode(img_data).decode('utf-8')
                    # Detectar tipo MIME
                    if img_name.lower().endswith('.png'):
                        mime = 'image/png'
                    elif img_name.lower().endswith('.jpg') or img_name.lower().endswith('.jpeg'):
                        mime = 'image/jpeg'
                    elif img_name.lower().endswith('.gif'):
                        mime = 'image/gif'
                    else:
                        mime = 'image/jpeg'
                    images[img_name] = {'data': img_b64, 'mime': mime}
        except:
            pass

        # Cargar colores del tema para resolución precisa
        load_theme_colors(docx)

        # Extraer encabezados y pies de página
        header_html = ''
        footer_html = ''

        # Buscar encabezados
        for i in range(1, 4):  # Típicamente hay hasta 3 encabezados
            try:
                header_content = docx.read(f'word/header{i}.xml').decode('utf-8')
                header_root = ET.fromstring(header_content.encode('utf-8'))
                for para in header_root.findall('.//w:p', ns):
                    text = extract_text_from_element(para, ns, rels, images)
                    if text.strip():
                        header_html += f'<p style="margin: 8px 0; padding: 10px 0; border-bottom: 1px solid #ddd; font-size: 10pt;">{text}</p>'
            except:
                pass

        # Buscar pies de página
        for i in range(1, 4):  # Típicamente hay hasta 3 pies
            try:
                footer_content = docx.read(f'word/footer{i}.xml').decode('utf-8')
                footer_root = ET.fromstring(footer_content.encode('utf-8'))
                for para in footer_root.findall('.//w:p', ns):
                    text = extract_text_from_element(para, ns, rels, images)
                    if text.strip():
                        footer_html += f'<p style="margin: 8px 0; padding: 10px 0; border-top: 1px solid #ddd; font-size: 10pt;">{text}</p>'
            except:
                pass

        # Procesar párrafos del documento
        html_content = []
        for para in root.findall('.//w:p', ns):
            html = para_to_html(para, ns, rels, images)
            # Incluir si tiene texto, spans, o imágenes — nunca filtrar párrafos con <img
            if html.count('<span') > 0 or html.count('<img') > 0 or any(c in html for c in ['áéíóúñ']):
                html_content.append(html)
            elif len(html) > len('<p style=""></p>') + 5:
                # Párrafo con contenido no vacío aunque no tenga span ni img
                html_content.append(html)

        html = '<?xml version="1.0" encoding="UTF-8"?><html><head><meta charset="UTF-8"><style>body { font-family: Calibri, Arial, sans-serif; color: #333; } .header { margin: 20px; border-bottom: 2px solid #ddd; padding-bottom: 15px; } .content { margin: 20px; line-height: 1.5; } .footer { margin: 20px; border-top: 2px solid #ddd; padding-top: 15px; } p { margin: 12px 0; } span { display: inline; }</style></head><body>'

        if header_html:
            html += '<div class="header">' + header_html + '</div>'

        html += '<div class="content">' + ''.join(html_content) + '</div>'

        if footer_html:
            html += '<div class="footer">' + footer_html + '</div>'

        html += '</body></html>'

        # Asegurar UTF-8 en salida
        print(html)
except Exception as e:
    import traceback
    error_msg = traceback.format_exc()
    print('<html><body style="background: #fff3cd;"><div style="padding: 20px; color: #856404;"><h3>Error al procesar</h3><pre style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px;">' + error_msg.replace('<', '&lt;').replace('>', '&gt;') + '</pre></div></body></html>')
`;

    fs.writeFileSync(scriptPath, pythonScript);

    const { execFile } = require('child_process');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    execFile(pythonCmd, [scriptPath, previewSourcePath], { timeout: 10000, maxBuffer: 10 * 1024 * 1024 }, (error: any, stdout: any, stderr: any) => {
      try {
        // Limpiar script temporal
        try { fs.unlinkSync(scriptPath); } catch (_) {}

        if (error) {
          console.error('Python execution error:', error.message);
          console.error('Stderr:', stderr);
          return res.status(500).json({ success: false, error: `Error al ejecutar: ${error.message}` });
        }

        const htmlContent = stdout.trim();
        if (!htmlContent) {
          console.error('No output from Python script');
          return res.status(500).json({ success: false, error: 'Sin salida del script.' });
        }

        console.log('HTML generated length:', htmlContent.length);
        console.log('Contains <img:', htmlContent.includes('<img'));
        console.log('Contains data:image:', htmlContent.includes('data:image'));

        if (!htmlContent.includes('<html')) {
          console.error('Invalid HTML generated:', htmlContent.substring(0, 200));
          return res.status(500).json({ success: false, error: 'HTML inválido generado.' });
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(htmlContent);
      } catch (err: any) {
        console.error('Preview error:', err.message);
        res.status(500).json({ success: false, error: err.message });
      }
    });
  } catch (err: any) {
    console.error('Preview endpoint error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/files/:clientId/:fileId/preview-excel
// Convierte .xlsx a HTML usando solo Python stdlib (zipfile + xml.etree)
// No requiere openpyxl ni ningún paquete externo.
// ─────────────────────────────────────────────────────────────
export const previewExcelAsHtml = async (req: any, res: Response) => {
  const { clientId, fileId } = req.params;
  try {
    const result = await pool.query(
      `SELECT stored_name, original_name, mimetype FROM client_files WHERE id = $1 AND client_id = $2`,
      [fileId, clientId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }
    const { stored_name } = result.rows[0];

    const filePath = path.join(UPLOADS_ROOT, clientId, stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco.' });
    }

    const tempDir = path.join(require('os').tmpdir(), 'lextech_previews');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const scriptPath = path.join(tempDir, `excel_preview_${fileId}.py`);

    const pythonScript = `# -*- coding: utf-8 -*-
# Pure Python stdlib — no openpyxl required
import sys, io, zipfile, re
import xml.etree.ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SS_NS  = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
R_NS   = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

def esc(s):
    return str(s).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')

def col_letter(n):
    result = ''
    n += 1
    while n > 0:
        n, r = divmod(n - 1, 26)
        result = chr(65 + r) + result
    return result

def parse_ref(ref):
    m = re.match(r'([A-Za-z]+)(\\d+)', ref)
    if not m: return (0, 0)
    col_s, row_s = m.group(1).upper(), m.group(2)
    col_idx = 0
    for ch in col_s:
        col_idx = col_idx * 26 + (ord(ch) - 64)
    return (int(row_s) - 1, col_idx - 1)

def fmt_num(raw):
    try:
        f = float(raw)
        return str(int(f)) if f == int(f) else str(round(f, 10)).rstrip('0').rstrip('.')
    except:
        return raw

try:
    wb_path = sys.argv[1]
    # Detect format by magic bytes: XLSX=ZIP (50 4B 03 04), XLS=OLE (D0 CF 11 E0)
    with open(wb_path, 'rb') as _f:
        magic = _f.read(4)
    is_zip = magic[:4] == b'PK\x03\x04'
    is_ole = magic[:4] == b'\xd0\xcf\x11\xe0'
    if not is_zip:
        label = '.xls (formato antiguo)' if (is_ole or wb_path.lower().endswith('.xls')) else 'formato desconocido'
        print(f'<html><body style="padding:30px;font-family:Calibri,Arial,sans-serif;background:#fffbf0"><div style="max-width:420px;margin:60px auto;background:white;border:1px solid #fcd34d;border-radius:12px;padding:28px 32px;text-align:center"><div style="font-size:40px;margin-bottom:12px">📊</div><p style="font-size:14px;font-weight:700;color:#92400e;margin:0 0 8px">Formato no compatible</p><p style="font-size:12px;color:#a16207;margin:0;line-height:1.6">Este archivo es <strong>{label}</strong> y no se puede previsualizar directamente.<br>Ábrelo en Excel y guárdalo como <strong>.xlsx</strong> para poder visualizarlo.</p></div></body></html>')
        sys.exit(0)
    with zipfile.ZipFile(wb_path, 'r') as zf:
        names_set = set(zf.namelist())

        # Shared strings
        shared = []
        if 'xl/sharedStrings.xml' in names_set:
            with zf.open('xl/sharedStrings.xml') as f:
                root = ET.parse(f).getroot()
                for si in root.findall('{' + SS_NS + '}si'):
                    parts = [t.text for t in si.iter('{' + SS_NS + '}t') if t.text]
                    shared.append(''.join(parts))

        # Sheet names from workbook.xml
        sheet_names = []
        sheet_rids  = {}
        if 'xl/workbook.xml' in names_set:
            with zf.open('xl/workbook.xml') as f:
                root = ET.parse(f).getroot()
                for sh in root.iter('{' + SS_NS + '}sheet'):
                    nm  = sh.get('name', 'Hoja')
                    rid = sh.get('{' + R_NS + '}id', '')
                    sheet_names.append(nm)
                    sheet_rids[nm] = rid

        # Workbook relationships
        rid_to_target = {}
        if 'xl/_rels/workbook.xml.rels' in names_set:
            with zf.open('xl/_rels/workbook.xml.rels') as f:
                root = ET.parse(f).getroot()
                for rel in root.findall('{' + REL_NS + '}Relationship'):
                    rid_to_target[rel.get('Id','')] = rel.get('Target','')

        if not sheet_names:
            for nm in sorted(names_set):
                if nm.startswith('xl/worksheets/sheet') and nm.endswith('.xml'):
                    sheet_names.append(nm.split('/')[-1].replace('.xml',''))

        # Date style indices (optional, skip if error)
        date_style_ids = set()
        try:
            if 'xl/styles.xml' in names_set:
                with zf.open('xl/styles.xml') as f:
                    sroot = ET.parse(f).getroot()
                BUILTIN_DATE = set(list(range(14,18)) + [22] + list(range(27,37)) + list(range(45,48)) + list(range(50,59)))
                custom_date = set()
                nfmts = sroot.find('{' + SS_NS + '}numFmts')
                if nfmts:
                    for nf in nfmts.findall('{' + SS_NS + '}numFmt'):
                        fid  = int(nf.get('numFmtId','0'))
                        fstr = nf.get('formatCode','').lower()
                        if any(x in fstr for x in ('yy','mm','dd','hh')):
                            custom_date.add(fid)
                xfs = sroot.find('.//{' + SS_NS + '}cellXfs')
                if xfs:
                    for i, xf in enumerate(xfs.findall('{' + SS_NS + '}xf')):
                        fid = int(xf.get('numFmtId','0'))
                        if fid in BUILTIN_DATE or fid in custom_date:
                            date_style_ids.add(i)
        except: pass

        tabs_html   = ''
        sheets_html = ''

        for idx, sname in enumerate(sheet_names):
            rid  = sheet_rids.get(sname, '')
            tgt  = rid_to_target.get(rid, 'worksheets/sheet' + str(idx+1) + '.xml')
            tgt  = tgt.lstrip('/')
            fp   = ('xl/' + tgt) if not tgt.startswith('xl/') else tgt
            fp   = fp.replace('//', '/')
            if fp not in names_set:
                fp = 'xl/worksheets/sheet' + str(idx+1) + '.xml'
            if fp not in names_set:
                continue

            tabs_html += ('<button class="tab-btn" onclick="showSheet(' + str(idx) + ')" id="tab-' + str(idx) + '">'
                          + esc(sname) + '</button>')

            with zf.open(fp) as f:
                root = ET.parse(f).getroot()

            grid = {}
            max_row = max_col = 0

            for row_el in root.findall('.//{' + SS_NS + '}row'):
                for c_el in row_el.findall('{' + SS_NS + '}c'):
                    ref  = c_el.get('r','')
                    if not ref: continue
                    rr, cc = parse_ref(ref)
                    ctype  = c_el.get('t','n')
                    si_idx = c_el.get('s')
                    v_el   = c_el.find('{' + SS_NS + '}v')
                    is_el  = c_el.find('{' + SS_NS + '}is')

                    val = ''
                    if is_el is not None:
                        parts = [t.text for t in is_el.iter('{' + SS_NS + '}t') if t.text]
                        val = ''.join(parts)
                    elif v_el is not None and v_el.text is not None:
                        raw = v_el.text
                        if ctype == 's':
                            try: val = shared[int(raw)]
                            except: val = raw
                        elif ctype == 'b':
                            val = 'VERDADERO' if raw == '1' else 'FALSO'
                        elif ctype in ('str','inlineStr','e'):
                            val = raw
                        else:
                            if si_idx and int(si_idx) in date_style_ids:
                                try:
                                    from datetime import datetime, timedelta
                                    dt = datetime(1899,12,30) + timedelta(days=float(raw))
                                    val = dt.strftime('%d/%m/%Y')
                                except: val = fmt_num(raw)
                            else:
                                val = fmt_num(raw)

                    grid[(rr,cc)] = esc(val)
                    if rr > max_row: max_row = rr
                    if cc > max_col: max_col = cc

            tbl = '<table><thead><tr><th class="row-hdr"></th>'
            for c in range(max_col + 1):
                tbl += '<th class="col-hdr">' + col_letter(c) + '</th>'
            tbl += '</tr></thead><tbody>'
            for r in range(max_row + 1):
                tbl += '<tr><td class="row-hdr">' + str(r+1) + '</td>'
                for c in range(max_col + 1):
                    tbl += '<td>' + grid.get((r,c),'') + '</td>'
                tbl += '</tr>'
            tbl += '</tbody></table>'

            disp = 'block' if idx == 0 else 'none'
            sheets_html += '<div class="sheet" id="sheet-' + str(idx) + '" style="display:' + disp + '">' + tbl + '</div>'

    CSS = '''*{box-sizing:border-box}
body{font-family:Calibri,Arial,sans-serif;font-size:13px;margin:0;background:#f8fafc;color:#1e293b}
.toolbar{background:#fff;border-bottom:1px solid #e2e8f0;padding:8px 12px;display:flex;gap:6px;flex-wrap:wrap;position:sticky;top:0;z-index:10}
.tab-btn{padding:5px 14px;font-size:12px;font-weight:600;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;background:#f1f5f9;color:#475569;transition:all .15s}
.tab-btn.active{background:#fff;border-color:#16a34a;color:#15803d;box-shadow:0 1px 4px rgba(22,163,74,.2)}
.sheet-wrap{overflow:auto;padding:12px;height:calc(100vh - 54px)}
table{border-collapse:collapse;white-space:nowrap}
td,th{border:1px solid #e2e8f0;padding:3px 8px;min-width:56px}
.row-hdr,.col-hdr{background:#f1f5f9;color:#94a3b8;font-size:11px;font-weight:600;text-align:center;min-width:32px;user-select:none}
td{vertical-align:middle}'''

    JS = '''function showSheet(n){
  document.querySelectorAll('.sheet').forEach((e,i)=>e.style.display=i===n?'block':'none');
  document.querySelectorAll('.tab-btn').forEach((e,i)=>e.classList.toggle('active',i===n));
}
showSheet(0);'''

    html = ('<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + CSS +
            '</style></head><body><div class="toolbar">' + tabs_html +
            '</div><div class="sheet-wrap">' + sheets_html +
            '</div><script>' + JS + '</script></body></html>')
    print(html)

except Exception:
    import traceback
    err = traceback.format_exc().replace('<','&lt;').replace('>','&gt;')
    print('<html><body style="padding:20px;font-family:Arial;color:#b91c1c"><h3>Error al procesar Excel</h3><pre style="font-size:12px">' + err + '</pre></body></html>')
`;

    fs.writeFileSync(scriptPath, pythonScript, { encoding: 'utf8' });

    const { execFile } = require('child_process');

    // Try multiple Python commands in order
    const pythonCandidates: string[] = process.platform === 'win32'
      ? ['python', 'py', 'python3']
      : ['python3', 'python'];

    const tryNext = (candidates: string[]) => {
      if (candidates.length === 0) {
        try { fs.unlinkSync(scriptPath); } catch (_) {}
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(
          `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="background:#fffbf0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:Calibri,Arial,sans-serif;">
  <div style="text-align:center;padding:32px 40px;background:white;border:1px solid #fcd34d;border-radius:12px;max-width:380px;box-shadow:0 2px 12px rgba(0,0,0,.06)">
    <div style="font-size:44px;margin-bottom:14px">&#128202;</div>
    <p style="font-size:14px;font-weight:700;color:#92400e;margin:0 0 8px">Python no encontrado</p>
    <p style="font-size:12px;color:#a16207;margin:0;line-height:1.6">Instala Python 3 para poder previsualizar archivos Excel.</p>
  </div>
</body></html>`
        );
      }
      const [cmd, ...rest] = candidates;
      execFile(cmd, [scriptPath, filePath], { timeout: 60000, maxBuffer: 50 * 1024 * 1024 }, (err: any, stdout: string, stderr: string) => {
        if (err && (err.code === 'ENOENT' || err.code === 127 || /not found|cannot find/i.test(err.message || ''))) {
          return tryNext(rest);
        }
        try { fs.unlinkSync(scriptPath); } catch (_) {}
        if (err) {
          // Devolver 200 con HTML de error para que el iframe lo muestre (no 500)
          const detail = (stderr || err.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 2000);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.status(200).send(
            `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="padding:20px;font-family:Calibri,Arial,sans-serif;color:#b91c1c">
  <h3 style="margin-top:0">Error al procesar el Excel</h3>
  <pre style="background:#fff3f3;border:1px solid #fca5a5;border-radius:6px;padding:12px;font-size:12px;overflow-x:auto;white-space:pre-wrap">${detail}</pre>
</body></html>`
          );
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(stdout);
      });
    };

    tryNext(pythonCandidates);

  } catch (err: any) {
    const detail = (err.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="padding:20px;font-family:Calibri,Arial,sans-serif;color:#b91c1c">
  <h3 style="margin-top:0">Error interno</h3>
  <pre style="background:#fff3f3;border:1px solid #fca5a5;border-radius:6px;padding:12px;font-size:12px">${detail}</pre>
</body></html>`
    );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/files/:clientId/:fileId/preview-pdf
// Convierte .docx/.doc a PDF para una previsualización mucho más fiel
// que la versión HTML. Si no puede convertir, devuelve error para que
// el frontend pueda caer al preview HTML actual.
// ─────────────────────────────────────────────────────────────────────────────
export const previewWordAsPdf = async (req: any, res: Response) => {
  if (!LIBREOFFICE_ENABLED) return res.status(503).json({ success: false, error: 'Vista previa PDF temporalmente no disponible.' });
  const { clientId, fileId } = req.params;
  try {
    const result = await pool.query(
      `SELECT stored_name, original_name, mimetype FROM client_files WHERE id = $1 AND client_id = $2`,
      [fileId, clientId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }

    const { stored_name, original_name, mimetype } = result.rows[0];
    const ext = path.extname(original_name || stored_name || '').toLowerCase();

    // Tipos que LibreOffice puede convertir a PDF
    const LIBREOFFICE_EXTS = new Set([
      '.doc','.docx','.odt','.rtf','.txt',
      '.xls','.xlsx','.ods','.csv',
      '.ppt','.pptx','.odp',
      '.html','.htm','.xml',
    ]);
    const canConvert =
      LIBREOFFICE_EXTS.has(ext) ||
      mimetype?.includes('word') ||
      mimetype?.includes('spreadsheet') ||
      mimetype?.includes('presentation') ||
      mimetype?.includes('opendocument') ||
      mimetype === 'text/plain' ||
      mimetype === 'text/html' ||
      mimetype === 'text/csv';

    if (!canConvert) {
      return res.status(400).json({ success: false, error: 'Formato no convertible a PDF.' });
    }

    const sourcePath = path.join(UPLOADS_ROOT, clientId, stored_name);
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco.' });
    }

    const srcStat = fs.statSync(sourcePath);
    const cacheKey = Buffer.from(`${clientId}:${fileId}:${sourcePath}`).toString('hex').slice(0, 32);
    const tempDir = path.join(TEMP_ROOT, `word_preview_${cacheKey}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const outputPdf = path.join(tempDir, `preview.pdf`);

    if (fs.existsSync(outputPdf)) {
      const pdfStat = fs.statSync(outputPdf);
      if (pdfStat.mtimeMs >= srcStat.mtimeMs) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent((original_name || 'preview').replace(/\.(docx?|DOCX?)$/, '.pdf'))}"`);
        return res.sendFile(outputPdf);
      }
    }

    try { if (fs.existsSync(outputPdf)) fs.unlinkSync(outputPdf); } catch (_) {}

    const converterScript = path.join(tempDir, `word_to_pdf_${cacheKey}.py`);
    const converterCode = `import sys, os, subprocess, shutil

source_path = sys.argv[1]
output_pdf = sys.argv[2]
converted = False

def convert_with_word_com(src, out_pdf):
    import win32com.client
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    doc = None
    try:
        doc = word.Documents.Open(src, False, True)
        doc.SaveAs(out_pdf, FileFormat=17)
    finally:
        if doc is not None:
            try: doc.Close(False)
            except Exception: pass
        try: word.Quit()
        except Exception: pass

try:
    convert_with_word_com(source_path, output_pdf)
    if os.path.exists(output_pdf):
        converted = True
except Exception:
    pass

if not converted:
    try:
        src_esc = source_path.replace("'", "''")
        out_esc = output_pdf.replace("'", "''")
        ps_cmd = (
            "$ErrorActionPreference='Stop';"
            "$w=New-Object -ComObject Word.Application;"
            "$w.Visible=$false;$w.DisplayAlerts=0;"
            "$d=$w.Documents.Open('" + src_esc + "',$false,$true);"
            "$d.SaveAs('" + out_esc + "',17);"
            "$d.Close($false);$w.Quit()"
        )
        r = subprocess.run(
            ['powershell', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps_cmd],
            timeout=90, capture_output=True
        )
        if r.returncode == 0 and os.path.exists(output_pdf):
            converted = True
    except Exception:
        pass

if not converted:
    if sys.platform == 'win32':
        soffice_paths = [
            r'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
            r'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
            'soffice',
        ]
    else:
        soffice_paths = ['soffice', '/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice']
    out_dir = os.path.dirname(output_pdf)
    for soffice in soffice_paths:
        try:
            try:
                candidate = os.path.join(out_dir, os.path.splitext(os.path.basename(source_path))[0] + '.pdf')
                if os.path.exists(candidate):
                    os.remove(candidate)
            except Exception:
                pass
            r = subprocess.run(
                [soffice, '--headless', '--convert-to', 'pdf', '--outdir', out_dir, source_path],
                timeout=90, capture_output=True
            )
            candidate = os.path.join(out_dir, os.path.splitext(os.path.basename(source_path))[0] + '.pdf')
            if os.path.exists(candidate):
                if candidate != output_pdf:
                    shutil.move(candidate, output_pdf)
                if os.path.exists(output_pdf):
                    converted = True
                    break
        except Exception:
            continue

if converted and os.path.exists(output_pdf):
    print('OK')
    sys.exit(0)
print('FAILED')
sys.exit(1)
`;

    fs.writeFileSync(converterScript, converterCode, 'utf-8');
    const { execFile } = require('child_process');
    const pythonCmds = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];

    const tryPython = (index: number) => {
      if (index >= pythonCmds.length) {
        try { fs.unlinkSync(converterScript); } catch (_) {}
        return res.status(503).json({
          success: false,
          error: 'No se pudo convertir el documento Word a PDF para la vista previa.',
        });
      }
      execFile(pythonCmds[index], [converterScript, sourcePath, outputPdf], { timeout: 120000 }, (err: any) => {
        const success = !err && fs.existsSync(outputPdf);
        if (!success) return tryPython(index + 1);
        try { fs.unlinkSync(converterScript); } catch (_) {}
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent((original_name || 'preview').replace(/\.(docx?|DOCX?)$/, '.pdf'))}"`);
        return res.sendFile(outputPdf);
      });
    };

    return tryPython(0);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// Test endpoint to verify images work in preview
export const testPreviewImages = async (req: any, res: Response) => {
  const testHtml = `<?xml version="1.0" encoding="UTF-8"?><html><head><meta charset="UTF-8"><style>body { font-family: Calibri, Arial, sans-serif; margin: 20px; } h1 { color: #333; } p { margin: 12px 0; } img { max-width: 100%; height: auto; border-radius: 4px; margin: 10px 0; border: 2px solid #ddd; }</style></head><body><h1>Test Preview with Base64 Images</h1><p>This is a test document to verify images display correctly in previews.</p><p>Simple red pixel below:</p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==" alt="test image"/><p>If you see a red square above, images work correctly!</p></body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(testHtml);
};

export { ensureClientDir, UPLOADS_ROOT };

// ─────────────────────────────────────────────────────────────
// PLANTILLAS — DocPlant
// ─────────────────────────────────────────────────────────────

// DocPlant está en la raíz del backend (junto a package.json).
// Usamos __dirname (dist/controllers/) → ../../DocPlant para ser
// independientes del CWD que Railway pueda establecer.
const DOCPLANT_ROOT = process.env.DOCPLANT_PATH
  ? path.resolve(process.env.DOCPLANT_PATH)
  : path.resolve(__dirname, '../../DocPlant');

// Blank .docx completo — generado y verificado con Python/zipfile
const BLANK_DOCX_B64 =
  'UEsDBBQAAAAIALxZa1zdyKT7KwEAAJ4DAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbLWTTU8CMRCG' +
  '7/6Kpley29WDMYaFgx9H5YA/oGlnobFf6QzI/ntnATkYhBjx2M687/NOMx1PN8GLNRR0Kbbyum6k' +
  'gGiSdXHRyrf5c3UnBZKOVvsUoZU9oJxOrsbzPgMKFkds5ZIo3yuFZglBY50yRK50qQRNfCwLlbV5' +
  '1wtQN01zq0yKBJEqGjzkZPwInV55Ek8bvt4FKeBRiodd48Bqpc7ZO6OJ62od7TdKtSfUrNz24NJl' +
  'HHGDVEcJQ+VnwF73yi9TnAUx04VedOAu9ZGKVTaZVWBlfdrmSM7Udc7AQT+45ZIMIPKTB18fKkG7' +
  'ODqXA6n3gJdPsfM9jwciFvxHgL3zqQisnpWUkReqwO8jfG3MoK4YnqGQOz30gcjWf54ZhmW0YI+w' +
  '1fZ7TT4BUEsDBBQAAAAIALxZa1xsFqhW5gAAAE0CAAALAAAAX3JlbHMvLnJlbHOtks1KA0EMgO8+' +
  'xZB7d7YVRKSzvYjQm0h9gDCT3R2680Mmre3bO4iKlVp68DiZ5MuXkOXqECa1Jy4+RQPzpgVF0Sbn' +
  '42DgdfM0uwdVBKPDKUUycKQCq+5m+UITSq0po89FVUgsBkaR/KB1sSMFLE3KFOtPnzig1CcPOqPd' +
  '4kB60bZ3mn8yoDthqrUzwGs3B7U5ZrqGnfreW3pMdhcoypkWvzIqGXkgMfCW2Gn3GW4qFvR5m8X1' +
  'Nn9PqgMJOhTUNjHNMtdqFl8X+y1UXZ5ruHxkXBK6/c/10EEoOnKXlTDnLyN9cgXdO1BLAwQUAAAA' +
  'CAC8WWtcYfaUIvUAAACCAQAAEQAAAHdvcmQvZG9jdW1lbnQueG1sTZDPbsMgDMbve4qI+wpZp6yN' +
  'QnrbbdOkbg9Ag/NHAhyB2yx7+kGUKr1g//Dnz4bq9GtNdgMfBnSS5TvBMnAN6sF1kv18vz8fWBZI' +
  'Oa0MOpBshsBO9VM1lRqbqwVHWXRwoZwk64nGkvPQ9GBV2OEILtZa9FZRRN/xCb0ePTYQQhxgDX8R' +
  'ouBWDY7V0fKCek5xXI4vv4QzzQayqbwpI9lnMjOM1xVfFXyVB2ho7ejOf1EfF8rzoyhYzPuYF4f9' +
  'ITUmwYfy8ZZwTJr9a5L4oetpwwsSod3YQPtQ7UFp8JK9iWPCFpEesLvSgmLd874av7+Qb79X/wNQ' +
  'SwMEFAAAAAgAvFlrXN/w1by+AAAAngEAABwAAAB3b3JkL19yZWxzL2RvY3VtZW50LnhtbC5yZWxz' +
  'rZDNCsIwEITvPkXYu031ICKmvYjgVeoDhHT7g2kSsqvYtzeggoUePHicXeabYfblY7DijpF67xSs' +
  'shwEOuPr3rUKLtVxuQVBrF2trXeoYESCsljsz2g1Jw91fSCRII4UdMxhJyWZDgdNmQ/o0qfxcdCc' +
  'ZGxl0OaqW5TrPN/I+M2AYsIUp1pBPNUrENUY8Be2b5re4MGb24COZyIk8WhTf1Hp2CIreOkscUDO' +
  'x6//Go/MadfvAu/Lp4KczFo8AVBLAwQUAAAACAC8WWtcDcG1gSUBAAAHAgAADwAAAHdvcmQvc3R5' +
  'bGVzLnhtbGVRXU+EMBB891eQvt8ViV6UXLkYlcQXY/z4ASsUaFLa2i2H+OttC8TL+dTOdHdmd7o/' +
  'fPcyOXKLQitGLrcpSbiqdC1Uy8jHe7m5IQk6UDVIrTgjE0dyKC72Y45ukhwT368wHxnpnDM5pVh1' +
  'vAfcasOVf2u07cF5aFs6alsbqyuO6OV7SbM03dEehCKFF6x19cAbGKTDAO2LXeCC4lFq5TAZc8BK' +
  'CEbuQYpPK4hnujuFJwwN5fjjH44gGcmuZkaCaleO4+bxLdB00afnruYcRVEDlYgq0DhufWq7NAwg' +
  'RQgou75dwesgPQGD04uJWUxOZem/xWOwXsJNxrcbsNBaMF1QrecybxlQLHyqGXkOIcsYooKer/st' +
  'dNz7q4wfMc8RG/9uWPwCUEsDBBQAAAAIALxZa1zjfgPa4AAAAE4BAAARAAAAd29yZC9zZXR0aW5n' +
  'cy54bWxlkD1uwzAMhfeewuBeywnQHxiRs3XrlPQAikwnAiRREJm46enLNC08dCP5Hvk+cLP9TLG5' +
  'YOVA2cKq7aDB7GkM+WjhY//2+AoNi8uji5TRwhUZtsPDZu4ZRdTFjV7I3M8WTiKlN4b9CZPjlgpm' +
  '1SaqyYm29WhmqmOp5JFZV1M06657NsmFDIOe/CJKzdwXrB6zKE7XgbkJI07uHGXvDjuhopaLixZe' +
  '1r+yp1ScLNXujqa+7JJC36fhEGKQ6zuNCCqda/iHnIKvxDRJqyuGpil4/IGGv8zV0y3SLJlm+cTw' +
  'DVBLAwQUAAAACAC8WWtczSdz1sMAAAAeAQAAEQAAAGRvY1Byb3BzL2NvcmUueG1sVc9NasNADAXg' +
  'fU8xzD6WnUUpZjxZtasuQkkPIDSqber5QaOE9Pa1Qwnp8kniQ88drnExF5Y65zTYrmmt4UQ5zGkc' +
  '7OfpbfdiTVVMAZeceLA/XO3BPzkqPWXho+TCojNXs0Kp9lQGO6mWHqDSxBFrs16kdfmVJaKuUUYo' +
  'SN84Muzb9hkiKwZUhA3clbto/8hAd7KcZbkBgYAXjpy0Qtd0YL0L1JMwahb/ztcT02ReP44OHubb' +
  '18KXeSvrOweP8Zb+V/K/UEsDBBQAAAAIALxZa1w4gd0pqAAAAOUAAAAQAAAAZG9jUHJvcHMvYXBw' +
  'LnhtbE2OsQrCMBQAd78iZG9THUQkTRHUyaFo/YCQvraB9iUkr9L+vZm043FwnKyWaWQfCNE6LPk+' +
  'LzgDNK612Jf83dyzE2eRNLZ6dAglXyHySu1kHZyHQBYiSwWMJR+I/FmIaAaYdMyTxmQ6FyZNCUMv' +
  'XNdZA1dn5gmQxKEojgIWAmyhzfwvyJW8eD9aoylNqQcsDZiB3Z61FFshU+kFZg6WVlVIsUUp/oPq' +
  'C1BLAQIUAxQAAAAIALxZa1zdyKT7KwEAAJ4DAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9U' +
  'eXBlc10ueG1sUEsBAhQDFAAAAAgAvFlrXGwWqFbmAAAATQIAAAsAAAAAAAAAAAAAAIABXAEAAF9y' +
  'ZWxzLy5yZWxzUEsBAhQDFAAAAAgAvFlrXGH2lCL1AAAAggEAABEAAAAAAAAAAAAAAIABawIAAHdv' +
  'cmQvZG9jdW1lbnQueG1sUEsBAhQDFAAAAAgAvFlrXN/w1by+AAAAngEAABwAAAAAAAAAAAAAAIAB' +
  'jwMAAHdvcmQvX3JlbHMvZG9jdW1lbnQueG1sLnJlbHNQSwECFAMUAAAACAC8WWtcDcG1gSUBAAAH' +
  'AgAADwAAAAAAAAAAAAAAgAGHBAAAd29yZC9zdHlsZXMueG1sUEsBAhQDFAAAAAgAvFlrXON+A9rg' +
  'AAAATgEAABEAAAAAAAAAAAAAAIAB2QUAAHdvcmQvc2V0dGluZ3MueG1sUEsBAhQDFAAAAAgAvFlr' +
  'XM0nc9bDAAAAHgEAABEAAAAAAAAAAAAAAIAB6AYAAGRvY1Byb3BzL2NvcmUueG1sUEsBAhQDFAAA' +
  'AAgAvFlrXDiB3SmoAAAA5QAAABAAAAAAAAAAAAAAAIAB2gcAAGRvY1Byb3BzL2FwcC54bWxQSwUG' +
  'AAAAAAgACAD8AQAAsAgAAAAA';

interface TemplateFile { name: string; path: string; ext: string; }
interface TemplateFolder { name: string; files: TemplateFile[]; }

function scanDocPlant(dir: string, relBase: string): TemplateFile[] {
  const out: TemplateFile[] = [];
  if (!fs.existsSync(dir)) return out;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const fullPath = path.join(dir, e.name);
      const relPath  = relBase ? `${relBase}/${e.name}` : e.name;
      if (e.isDirectory()) {
        out.push(...scanDocPlant(fullPath, relPath));
      } else if (e.isFile() && /\.(doc|docx)$/i.test(e.name)) {
        out.push({ name: e.name, path: relPath, ext: path.extname(e.name).toLowerCase() });
      }
    }
  } catch (_e) { /* ignora errores de lectura de directorios individuales */ }
  return out;
}

// GET /api/files/templates/preview?path=...
// Preview HTML de plantillas — usa el mismo script Python completo que previewDocxAsHtml
// Soporta .docx (preview completo) y .doc (mensaje amigable)
// GET /api/files/templates/preview?path=...
// Preview HTML de plantillas .docx y .doc del DocPlant
// .docx: mismo script Python completo con colores de tema que previewDocxAsHtml
// .doc: intenta conversión con LibreOffice; si no disponible, muestra aviso
export const previewTemplateAsHtml = async (req: any, res: Response) => {
  const relPath = req.query.path as string | undefined;
  if (!relPath) return res.status(400).json({ success: false, error: 'Parámetro path requerido.' });

  const resolved = path.resolve(DOCPLANT_ROOT, relPath);
  const docplantRoot = path.resolve(DOCPLANT_ROOT);
  if (!resolved.startsWith(docplantRoot + path.sep) && resolved !== docplantRoot) {
    return res.status(403).json({ success: false, error: 'Acceso denegado.' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ success: false, error: 'Plantilla no encontrada.' });
  }

  const { execFile } = require('child_process');
  const ext = path.extname(resolved).toLowerCase();

  // Helper: genera preview HTML de un .docx dado su ruta en disco
  const runDocxPreview = (docxPath: string) => {
    try {
      const tempDir = TEMP_ROOT;
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const scriptId = Buffer.from(relPath + docxPath).toString('hex').slice(0, 20);
      const scriptPath = path.join(tempDir, `tpl_${scriptId}.py`);

      const pythonScript = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, io, base64
from zipfile import ZipFile
from xml.etree import ElementTree as ET

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# ─── Helpers de namespace y color ────────────────────────────────────────────
W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

def wattr(elem, name, default=None):
    """Lee un atributo w:name usando el URI completo (necesario en ElementTree)."""
    return elem.get(f'{{{W_NS}}}{name}', default)

# Cache de colores del tema del documento actual
_theme_colors = {}

def load_theme_colors(docx):
    """Carga la paleta de colores de word/theme/theme1.xml en _theme_colors."""
    global _theme_colors
    _theme_colors = {}
    try:
        theme_xml = docx.read('word/theme/theme1.xml').decode('utf-8')
        root_t = ET.fromstring(theme_xml.encode('utf-8'))
        AN = 'http://schemas.openxmlformats.org/drawingml/2006/main'
        color_map = {
            'dark1':'dk1','light1':'lt1','dark2':'dk2','light2':'lt2',
            'accent1':'accent1','accent2':'accent2','accent3':'accent3',
            'accent4':'accent4','accent5':'accent5','accent6':'accent6',
            'hyperlink':'hlink','followedHyperlink':'folHlink',
        }
        clr_scheme = root_t.find(f'.//{{{AN}}}clrScheme')
        if clr_scheme is None: return
        for w_name, a_name in color_map.items():
            el = clr_scheme.find(f'{{{AN}}}{a_name}')
            if el is None: continue
            srgb = el.find(f'{{{AN}}}srgbClr')
            if srgb is not None:
                _theme_colors[w_name] = srgb.get('val', '000000'); continue
            sys_clr = el.find(f'{{{AN}}}sysClr')
            if sys_clr is not None:
                _theme_colors[w_name] = sys_clr.get('lastClr', '000000')
    except:
        pass

def _apply_tint_shade(hex6, tint=None, shade=None):
    """Aclara (tint) u oscurece (shade) un color hex de 6 dígitos (valores 0-FF)."""
    try:
        r, g, b = int(hex6[0:2],16), int(hex6[2:4],16), int(hex6[4:6],16)
        if tint is not None:
            t = int(tint, 16) / 255.0
            r = int(r + (255-r)*(1-t)); g = int(g + (255-g)*(1-t)); b = int(b + (255-b)*(1-t))
        if shade is not None:
            s = int(shade, 16) / 255.0
            r = int(r*s); g = int(g*s); b = int(b*s)
        clamp = lambda v: max(0, min(255, v))
        return f'{clamp(r):02X}{clamp(g):02X}{clamp(b):02X}'
    except:
        return hex6

def resolve_clr(elem):
    """Resuelve w:themeColor+Tint/Shade o w:val a un color CSS #RRGGBB."""
    theme_color = wattr(elem, 'themeColor')
    tint        = wattr(elem, 'themeTint')
    shade_v     = wattr(elem, 'themeShade')
    val         = wattr(elem, 'val')
    if theme_color and theme_color in _theme_colors:
        hex6 = _theme_colors[theme_color]
        if tint or shade_v:
            hex6 = _apply_tint_shade(hex6, tint, shade_v)
        return f'#{hex6}'
    if val and val.lower() not in ('auto', 'none', ''):
        return f'#{val}'
    return None

_HIGHLIGHT = {
    'yellow':'#FFFF00','green':'#00FF00','cyan':'#00FFFF','magenta':'#FF00FF',
    'blue':'#0000FF','red':'#FF0000','darkBlue':'#000080','darkCyan':'#008080',
    'darkGreen':'#008000','darkMagenta':'#800080','darkRed':'#800000',
    'darkYellow':'#808000','darkGray':'#808080','lightGray':'#C0C0C0',
    'black':'#000000','white':'#FFFFFF',
}

def _is_on(elem):
    """Devuelve True si un elemento toggle (b, i, strike…) está activo."""
    v = wattr(elem, 'val', 'true').lower()
    return v not in ('false', '0', 'off')

def get_run_style(run, ns):
    """Extrae TODOS los estilos de un run con colores de tema, relleno, super/sub, etc."""
    style = {}
    rPr = run.find('w:rPr', ns)
    if not rPr: return style

    # ── Color de fuente ───────────────────────────────────────────────────────
    color_el = rPr.find('w:color', ns)
    if color_el is not None:
        c = resolve_clr(color_el)
        if c: style['color'] = c

    # ── Tamaño de fuente ──────────────────────────────────────────────────────
    for sz_tag in ('w:sz', 'w:szCs'):
        sz = rPr.find(sz_tag, ns)
        if sz is not None:
            try: style['font-size'] = f'{int(wattr(sz,"val","22"))//2}pt'; break
            except: pass

    # ── Familia de fuente ─────────────────────────────────────────────────────
    rFonts = rPr.find('w:rFonts', ns)
    if rFonts is not None:
        f = wattr(rFonts,'ascii') or wattr(rFonts,'hAnsi') or wattr(rFonts,'cs')
        if f: style['font-family'] = f'"{f}",sans-serif'

    # ── Negrita ───────────────────────────────────────────────────────────────
    b_el = rPr.find('w:b', ns)
    if b_el is not None and _is_on(b_el): style['font-weight'] = 'bold'

    # ── Cursiva ───────────────────────────────────────────────────────────────
    i_el = rPr.find('w:i', ns)
    if i_el is not None and _is_on(i_el): style['font-style'] = 'italic'

    # ── Subrayado ─────────────────────────────────────────────────────────────
    u = rPr.find('w:u', ns)
    if u is not None:
        uval = wattr(u, 'val', 'single')
        if uval and uval not in ('none','false','0'):
            style['text-decoration'] = 'underline double' if uval == 'double' else 'underline'

    # ── Tachado ───────────────────────────────────────────────────────────────
    deco = style.get('text-decoration', '')
    for st_tag in ('w:strike', 'w:dstrike'):
        st = rPr.find(st_tag, ns)
        if st is not None and _is_on(st):
            deco = (deco + ' line-through').strip()
    if deco: style['text-decoration'] = deco

    # ── Resaltado (highlight marker) ──────────────────────────────────────────
    hl = rPr.find('w:highlight', ns)
    if hl is not None:
        hval = wattr(hl, 'val')
        if hval in _HIGHLIGHT: style['background-color'] = _HIGHLIGHT[hval]

    # ── Relleno/sombreado del texto (w:shd en rPr) ───────────────────────────
    shd = rPr.find('w:shd', ns)
    if shd is not None:
        # Intentar resolver via themeColor/fill
        c = resolve_clr(shd)
        if not c:
            fill = wattr(shd, 'fill')
            if fill and fill.lower() not in ('auto', 'none', 'ffffff', ''):
                c = f'#{fill}'
        if c and 'background-color' not in style:
            style['background-color'] = c

    # ── Superíndice / Subíndice ───────────────────────────────────────────────
    va = rPr.find('w:vertAlign', ns)
    if va is not None:
        vval = wattr(va, 'val', '')
        if vval == 'superscript':
            style['vertical-align'] = 'super'; style['font-size'] = '75%'
        elif vval == 'subscript':
            style['vertical-align'] = 'sub'; style['font-size'] = '75%'

    # ── Versalitas / Mayúsculas ───────────────────────────────────────────────
    sc = rPr.find('w:smallCaps', ns)
    if sc is not None and _is_on(sc): style['font-variant'] = 'small-caps'
    caps = rPr.find('w:caps', ns)
    if caps is not None and _is_on(caps): style['text-transform'] = 'uppercase'

    # ── Espaciado entre caracteres ────────────────────────────────────────────
    sp_el = rPr.find('w:spacing', ns)
    if sp_el is not None:
        spval = wattr(sp_el, 'val')
        if spval:
            try: style['letter-spacing'] = f'{int(spval)/20:.1f}pt'
            except: pass

    return style

def para_to_html(para, ns, rels, images):
    """Convierte un párrafo a HTML con TODOS los estilos"""
    style = {}
    pPr = para.find('w:pPr', ns)

    if pPr:
        # Alineación
        jc = pPr.find('w:jc', ns)
        if jc is not None:
            align = wattr(jc, 'val')
            if align == 'center': style['text-align'] = 'center'
            elif align == 'right': style['text-align'] = 'right'
            elif align == 'both': style['text-align'] = 'justify'

        # Espacios y línea
        spacing = pPr.find('w:spacing', ns)
        if spacing is not None:
            before = wattr(spacing, 'before')
            after  = wattr(spacing, 'after')
            line   = wattr(spacing, 'line')
            try:
                if before: style['margin-top']    = f'{int(before)//100}px'
                if after:  style['margin-bottom'] = f'{int(after)//100}px'
                if line:   style['line-height']   = f'{int(line)/240:.2f}'
            except: pass

        # Indentación
        ind = pPr.find('w:ind', ns)
        if ind is not None:
            left  = wattr(ind, 'left')
            right = wattr(ind, 'right')
            hang  = wattr(ind, 'hanging')
            try:
                if left: style['margin-left']    = f'{int(left)//20}px'
                if right: style['margin-right']  = f'{int(right)//20}px'
                if hang: style['text-indent']    = f'-{int(hang)//20}px'
            except: pass

        # Fondo/Sombreado de párrafo
        shd = pPr.find('w:shd', ns)
        if shd is not None:
            c = resolve_clr(shd)
            if not c:
                fill = wattr(shd, 'fill')
                if fill and fill.lower() not in ('auto', 'none', ''):
                    c = f'#{fill}'
            if c: style['background-color'] = c

        # Bordes
        pBdr = pPr.find('w:pBdr', ns)
        if pBdr:
            top = pBdr.find('w:top', ns)
            if top: style['border-top'] = '1px solid #000'
            bottom = pBdr.find('w:bottom', ns)
            if bottom: style['border-bottom'] = '1px solid #000'

    html = '<p style="' + ';'.join([f'{k}:{v}' for k,v in style.items()]) + '">'

    for run in para.findall('.//w:r', ns):
        s = get_run_style(run, ns)
        css = ';'.join([f'{k}:{v}' for k,v in s.items()])

        for t in run.findall('.//w:t', ns):
            if t.text:
                txt = t.text.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
                html += f'<span style="{css}">{txt}</span>' if css else txt

        # Imágenes (inline y anchor)
        for draw in run.findall('w:drawing', ns):
            for container in list(draw.findall('wp:inline', ns)) + list(draw.findall('wp:anchor', ns)):
                for blip in container.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip'):
                    e = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                    if e and e in rels:
                        img_path = rels[e]
                        img_name = img_path.split('/')[-1]
                        if img_name in images:
                            data = images[img_name]
                            html += f'<img src="data:{data["mime"]};base64,{data["data"]}" style="max-width:100%;height:auto;margin:8px 0;border-radius:4px;display:block;"/>'

    html += '</p>'
    return html

def extract_text_from_element(element, ns, rels, images):
    """Extrae texto con formato MEJORADO (colores exactos, tamaños, etc) de un elemento XML"""
    html = ''
    for run in element.findall('.//w:r', ns):
        # Usar la función mejorada get_run_style
        s = get_run_style(run, ns)
        css = ';'.join([f'{k}:{v}' for k,v in s.items()])

        # Procesar texto
        for text_elem in run.findall('.//w:t', ns):
            if text_elem.text:
                text = text_elem.text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                if css.strip():
                    html += f'<span style="{css}">{text}</span>'
                else:
                    html += text

        # Procesar imágenes (inline y anchor)
        for drawing in run.findall('w:drawing', ns):
            for container in list(drawing.findall('wp:inline', ns)) + list(drawing.findall('wp:anchor', ns)):
                for blip in container.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip'):
                    embed = blip.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed')
                    if embed and embed in rels:
                        img_path = rels[embed]
                        img_name = img_path.split('/')[-1]
                        if img_name in images:
                            img_data = images[img_name]
                            html += '<img src="data:' + img_data['mime'] + ';base64,' + img_data['data'] + '" style="max-width:100%;height:auto;margin:8px 0;border-radius:4px;display:block;"/>'
    return html

try:
    file_path = sys.argv[1]
    with ZipFile(file_path, 'r') as docx:
        # Leer XML del documento
        xml_content = docx.read('word/document.xml').decode('utf-8')
        root = ET.fromstring(xml_content.encode('utf-8'))

        # Namespaces (IMPORTANTE: incluir todos para procesar imágenes)
        ns = {
            'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
            'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
            'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
            'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
            'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture'
        }

        # Cargar relaciones para mapear IDs de imágenes
        rels = {}
        try:
            rels_content = docx.read('word/_rels/document.xml.rels')
            rels_root = ET.fromstring(rels_content)
            for rel in rels_root.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                rel_id = rel.get('Id')
                target = rel.get('Target')
                rels[rel_id] = target
        except:
            pass

        # Cargar imágenes en memoria
        images = {}
        try:
            for item in docx.namelist():
                if item.startswith('word/media/'):
                    img_name = item.split('/')[-1]
                    img_data = docx.read(item)
                    img_b64 = base64.b64encode(img_data).decode('utf-8')
                    # Detectar tipo MIME
                    if img_name.lower().endswith('.png'):
                        mime = 'image/png'
                    elif img_name.lower().endswith('.jpg') or img_name.lower().endswith('.jpeg'):
                        mime = 'image/jpeg'
                    elif img_name.lower().endswith('.gif'):
                        mime = 'image/gif'
                    else:
                        mime = 'image/jpeg'
                    images[img_name] = {'data': img_b64, 'mime': mime}
        except:
            pass

        # Cargar colores del tema para resolución precisa
        load_theme_colors(docx)

        # Extraer encabezados y pies de página
        header_html = ''
        footer_html = ''

        # Buscar encabezados
        for i in range(1, 4):  # Típicamente hay hasta 3 encabezados
            try:
                header_content = docx.read(f'word/header{i}.xml').decode('utf-8')
                header_root = ET.fromstring(header_content.encode('utf-8'))
                for para in header_root.findall('.//w:p', ns):
                    text = extract_text_from_element(para, ns, rels, images)
                    if text.strip():
                        header_html += f'<p style="margin: 8px 0; padding: 10px 0; border-bottom: 1px solid #ddd; font-size: 10pt;">{text}</p>'
            except:
                pass

        # Buscar pies de página
        for i in range(1, 4):  # Típicamente hay hasta 3 pies
            try:
                footer_content = docx.read(f'word/footer{i}.xml').decode('utf-8')
                footer_root = ET.fromstring(footer_content.encode('utf-8'))
                for para in footer_root.findall('.//w:p', ns):
                    text = extract_text_from_element(para, ns, rels, images)
                    if text.strip():
                        footer_html += f'<p style="margin: 8px 0; padding: 10px 0; border-top: 1px solid #ddd; font-size: 10pt;">{text}</p>'
            except:
                pass

        # Procesar párrafos del documento
        html_content = []
        for para in root.findall('.//w:p', ns):
            html = para_to_html(para, ns, rels, images)
            # Incluir si tiene texto, spans, o imágenes — nunca filtrar párrafos con <img
            if html.count('<span') > 0 or html.count('<img') > 0 or any(c in html for c in ['áéíóúñ']):
                html_content.append(html)
            elif len(html) > len('<p style=""></p>') + 5:
                # Párrafo con contenido no vacío aunque no tenga span ni img
                html_content.append(html)

        html = '<?xml version="1.0" encoding="UTF-8"?><html><head><meta charset="UTF-8"><style>body { font-family: Calibri, Arial, sans-serif; color: #333; } .header { margin: 20px; border-bottom: 2px solid #ddd; padding-bottom: 15px; } .content { margin: 20px; line-height: 1.5; } .footer { margin: 20px; border-top: 2px solid #ddd; padding-top: 15px; } p { margin: 12px 0; } span { display: inline; }</style></head><body>'

        if header_html:
            html += '<div class="header">' + header_html + '</div>'

        html += '<div class="content">' + ''.join(html_content) + '</div>'

        if footer_html:
            html += '<div class="footer">' + footer_html + '</div>'

        html += '</body></html>'

        # Asegurar UTF-8 en salida
        print(html)
except Exception as e:
    import traceback
    error_msg = traceback.format_exc()
    print('<html><body style="background: #fff3cd;"><div style="padding: 20px; color: #856404;"><h3>Error al procesar</h3><pre style="background: #fff; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px;">' + error_msg.replace('<', '&lt;').replace('>', '&gt;') + '</pre></div></body></html>')
`;
      fs.writeFileSync(scriptPath, pythonScript, { encoding: 'utf-8' });

      const cmds = process.platform === 'win32'
        ? ['python', 'py', 'python3']
        : ['python3', 'python'];

      const tryCmd = (i: number) => {
        if (i >= cmds.length) {
          try { fs.unlinkSync(scriptPath); } catch (_) {}
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="background:#fff3cd;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:Calibri,Arial,sans-serif;">
  <div style="text-align:center;padding:28px 36px;background:white;border:1px solid #fcd34d;border-radius:12px;max-width:380px">
    <p style="font-size:13px;color:#92400e;margin:0">No se pudo generar la vista previa.<br>Asegúrate de que Python esté instalado.</p>
  </div>
</body></html>`);
        }
        execFile(cmds[i], [scriptPath, docxPath], { timeout: 20000, maxBuffer: 10 * 1024 * 1024 }, (error: any, stdout: any) => {
          if (error) { tryCmd(i + 1); return; }
          try { fs.unlinkSync(scriptPath); } catch (_) {}
          // Si se convirtió desde .doc, limpiar el docx temporal
          if (docxPath !== resolved) { try { fs.unlinkSync(docxPath); } catch (_) {} }
          const html = stdout.trim();
          if (!html || !html.includes('<html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(200).send('<html><body style="padding:20px;color:#856404">Error al procesar el archivo.</body></html>');
          }
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.send(html);
        });
      };
      tryCmd(0);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  // ── .docx: preview directo ────────────────────────────────────
  if (ext === '.docx') {
    return runDocxPreview(resolved);
  }

  // ── .doc: convertir a .docx vía Python (win32com → PowerShell → LibreOffice) ─
  if (ext === '.doc') {
    const tempDir = TEMP_ROOT;
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const scriptId2 = Buffer.from(relPath).toString('hex').slice(0, 16);
    const outputDocx = path.join(tempDir, `doc_converted_${scriptId2}.docx`);

    // ── Caché: si el .docx ya existe y es más nuevo que el .doc, reutilizarlo ──
    try {
      if (fs.existsSync(outputDocx)) {
        const srcMtime  = fs.statSync(resolved).mtimeMs;
        const cacheMtime = fs.statSync(outputDocx).mtimeMs;
        if (cacheMtime >= srcMtime) {
          return runDocxPreview(outputDocx);
        }
      }
    } catch (_) {}

    // Convertir .doc → .docx usando un script Python (win32com → PowerShell → LibreOffice)
    const converterScript = path.join(tempDir, `converter_${scriptId2}.py`);
    const converterCode = `import sys, os, subprocess, shutil

doc_path = sys.argv[1]
out_path = sys.argv[2]
converted = False

# Intento 1: win32com.client (requiere pywin32 + Microsoft Word instalado)
try:
    import win32com.client
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    doc = word.Documents.Open(doc_path, False, True)
    doc.SaveAs(out_path, FileFormat=16)
    doc.Close(False)
    word.Quit()
    if os.path.exists(out_path):
        converted = True
except Exception:
    pass

# Intento 2: PowerShell Word COM desde Python
if not converted:
    try:
        doc_esc = doc_path.replace("'", "''")
        out_esc = out_path.replace("'", "''")
        ps_cmd = (
            "$ErrorActionPreference='Stop';"
            "$w=New-Object -ComObject Word.Application;"
            "$w.Visible=$false;$w.DisplayAlerts=0;"
            "$d=$w.Documents.Open('" + doc_esc + "',$false,$true);"
            "$d.SaveAs('" + out_esc + "',16);"
            "$d.Close($false);$w.Quit()"
        )
        r = subprocess.run(
            ['powershell', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps_cmd],
            timeout=60, capture_output=True
        )
        if r.returncode == 0 and os.path.exists(out_path):
            converted = True
    except Exception:
        pass

# Intento 3: LibreOffice
if not converted:
    if sys.platform == 'win32':
        soffice_paths = [
            r'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
            r'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
            'soffice',
        ]
    else:
        soffice_paths = ['soffice', '/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice']
    out_dir = os.path.dirname(out_path)
    for soffice in soffice_paths:
        try:
            r = subprocess.run(
                [soffice, '--headless', '--convert-to', 'docx', '--outdir', out_dir, doc_path],
                timeout=60, capture_output=True
            )
            candidate = os.path.join(out_dir, os.path.splitext(os.path.basename(doc_path))[0] + '.docx')
            if os.path.exists(candidate):
                if candidate != out_path:
                    shutil.move(candidate, out_path)
                if os.path.exists(out_path):
                    converted = True
                    break
        except Exception:
            continue

if converted:
    print('OK')
    sys.exit(0)
else:
    print('FAILED')
    sys.exit(1)
`;
    fs.writeFileSync(converterScript, converterCode, 'utf-8');

    const pythonCmds = process.platform === 'win32'
      ? ['python', 'py', 'python3']
      : ['python3', 'python'];

    const tryPythonConverter = (i: number) => {
      if (i >= pythonCmds.length) {
        try { fs.unlinkSync(converterScript); } catch (_) {}
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="background:#fffbf0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:Calibri,Arial,sans-serif;">
  <div style="text-align:center;padding:32px 40px;background:white;border:1px solid #fcd34d;border-radius:12px;max-width:380px;box-shadow:0 2px 12px rgba(0,0,0,.06)">
    <div style="font-size:44px;margin-bottom:14px">&#128196;</div>
    <p style="font-size:14px;font-weight:700;color:#92400e;margin:0 0 8px">Formato .doc</p>
    <p style="font-size:12px;color:#a16207;margin:0;line-height:1.6">
      Para previsualizar este formato es necesario tener <strong>Microsoft Word</strong> o <strong>LibreOffice</strong> instalado.<br>
      Descárgalo para abrirlo directamente en Word.
    </p>
  </div>
</body></html>`);
      }
      execFile(pythonCmds[i], [converterScript, resolved, outputDocx], { timeout: 90000 }, (err: any, stdout: any) => {
        const success = !err && fs.existsSync(outputDocx);
        if (!success) return tryPythonConverter(i + 1);
        try { fs.unlinkSync(converterScript); } catch (_) {}
        runDocxPreview(outputDocx);
      });
    };
    tryPythonConverter(0);
    return;
  }

  // Otros formatos — aviso genérico
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="padding:24px;font-family:sans-serif;color:#856404">
  <p>Vista previa no disponible para <strong>${ext}</strong></p>
</body></html>`);
}

// ─────────────────────────────────────────────────────────────
// MIGRACIÓN: mueve archivos de la estructura plana antigua
// ({clientId}/archivo.ext) a la nueva ({clientId}/{tipo}/archivo.ext)
// Se llama una vez al arrancar el servidor.
// ─────────────────────────────────────────────────────────────
export async function migrateLocalFoldersStructure(): Promise<void> {
  if (!fs.existsSync(LOCAL_CLIENT_FILES_ROOT)) return;

  try {
    console.log('📂 Migración de carpetas locales: verificando estructura…');

    // Obtener todos los registros de archivos agrupados por cliente
    const result = await pool.query(
      `SELECT client_id, original_name, attachment_type FROM client_files ORDER BY client_id`
    );

    let moved = 0;

    for (const row of result.rows) {
      const { client_id, original_name, attachment_type } = row;
      const typeFolder   = typeFolderName(attachment_type);
      const clientRoot   = path.join(LOCAL_CLIENT_FILES_ROOT, client_id);
      const flatPath     = path.join(clientRoot, original_name);   // ruta antigua (plana)
      const subPath      = path.join(clientRoot, typeFolder, original_name); // ruta nueva

      // Si el archivo existe en la raíz del cliente (estructura plana) pero NO en la subcarpeta
      if (fs.existsSync(flatPath) && !fs.existsSync(subPath)) {
        try {
          const destDir = path.join(clientRoot, typeFolder);
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          fs.copyFileSync(flatPath, subPath);
          fs.unlinkSync(flatPath);
          moved++;
        } catch (_) { /* fallo silencioso por archivo */ }
      }
    }

    // Crear las carpetas de tipos para todos los clientes con directorio local
    const clientDirs = fs.existsSync(LOCAL_CLIENT_FILES_ROOT)
      ? fs.readdirSync(LOCAL_CLIENT_FILES_ROOT, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)
      : [];

    for (const clientId of clientDirs) {
      await initClientFolders(clientId);
    }

    if (moved > 0) {
      console.log(`✅ Migración completada: ${moved} archivo(s) movido(s) a subcarpetas.`);
    } else {
      console.log('✅ Migración: estructura de carpetas ya actualizada.');
    }
  } catch (err: any) {
    console.error('⚠️  Error en migración de carpetas locales:', err.message);
  }
}

// GET /api/files/templates
export const listTemplates = (_req: any, res: Response) => {
  try {
    const root = DOCPLANT_ROOT;
    if (!fs.existsSync(root)) {
      return res.json({ success: true, data: [], warning: `DocPlant no encontrado en: ${root}` });
    }
    const allFiles = scanDocPlant(root, '');
    const map = new Map<string, TemplateFile[]>();
    for (const f of allFiles) {
      const key = f.path.includes('/') ? f.path.split('/')[0] : 'General';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    const folders: TemplateFolder[] = [];
    for (const [name, files] of map) {
      folders.push({ name, files: files.sort((a, b) => a.name.localeCompare(b.name, 'es')) });
    }
    res.json({ success: true, data: folders.sort((a, b) => a.name.localeCompare(b.name, 'es')) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const previewTemplateAsPdf = async (req: any, res: Response) => {
  if (!LIBREOFFICE_ENABLED) return res.status(503).json({ success: false, error: 'Vista previa PDF temporalmente no disponible.' });
  const relPath = req.query.path as string | undefined;
  if (!relPath) return res.status(400).json({ success: false, error: 'Parámetro path requerido.' });

  const resolved = path.resolve(DOCPLANT_ROOT, relPath);
  const docplantRoot = path.resolve(DOCPLANT_ROOT);
  if (!resolved.startsWith(docplantRoot + path.sep) && resolved !== docplantRoot) {
    return res.status(403).json({ success: false, error: 'Acceso denegado.' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ success: false, error: 'Plantilla no encontrada.' });
  }

  const ext = path.extname(resolved).toLowerCase();
  if (ext !== '.doc' && ext !== '.docx') {
    return res.status(400).json({ success: false, error: 'Solo se puede generar PDF para plantillas Word.' });
  }

  try {
    const srcStat = fs.statSync(resolved);
    const cacheKey = Buffer.from(`tpl:${relPath}:${resolved}`).toString('hex').slice(0, 32);
    const tempDir = path.join(TEMP_ROOT, `tpl_preview_${cacheKey}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const outputPdf = path.join(tempDir, `preview.pdf`);

    if (fs.existsSync(outputPdf)) {
      const pdfStat = fs.statSync(outputPdf);
      if (pdfStat.mtimeMs >= srcStat.mtimeMs) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(resolved).replace(/\.(docx?|DOCX?)$/, '.pdf'))}"`);
        return res.sendFile(outputPdf);
      }
    }

    try { if (fs.existsSync(outputPdf)) fs.unlinkSync(outputPdf); } catch (_) {}

    const converterScript = path.join(tempDir, `tpl_word_to_pdf_${cacheKey}.py`);
    const converterCode = `import sys, os, subprocess, shutil

source_path = sys.argv[1]
output_pdf = sys.argv[2]
converted = False

def convert_with_word_com(src, out_pdf):
    import win32com.client
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    doc = None
    try:
        doc = word.Documents.Open(src, False, True)
        doc.SaveAs(out_pdf, FileFormat=17)
    finally:
        if doc is not None:
            try: doc.Close(False)
            except Exception: pass
        try: word.Quit()
        except Exception: pass

try:
    convert_with_word_com(source_path, output_pdf)
    if os.path.exists(output_pdf):
        converted = True
except Exception:
    pass

if not converted:
    try:
        src_esc = source_path.replace("'", "''")
        out_esc = output_pdf.replace("'", "''")
        ps_cmd = (
            "$ErrorActionPreference='Stop';"
            "$w=New-Object -ComObject Word.Application;"
            "$w.Visible=$false;$w.DisplayAlerts=0;"
            "$d=$w.Documents.Open('" + src_esc + "',$false,$true);"
            "$d.SaveAs('" + out_esc + "',17);"
            "$d.Close($false);$w.Quit()"
        )
        r = subprocess.run(
            ['powershell', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps_cmd],
            timeout=90, capture_output=True
        )
        if r.returncode == 0 and os.path.exists(output_pdf):
            converted = True
    except Exception:
        pass

if not converted:
    if sys.platform == 'win32':
        soffice_paths = [
            r'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
            r'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
            'soffice',
        ]
    else:
        soffice_paths = ['soffice', '/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice']
    out_dir = os.path.dirname(output_pdf)
    for soffice in soffice_paths:
        try:
            try:
                candidate = os.path.join(out_dir, os.path.splitext(os.path.basename(source_path))[0] + '.pdf')
                if os.path.exists(candidate):
                    os.remove(candidate)
            except Exception:
                pass
            r = subprocess.run(
                [soffice, '--headless', '--convert-to', 'pdf', '--outdir', out_dir, source_path],
                timeout=90, capture_output=True
            )
            candidate = os.path.join(out_dir, os.path.splitext(os.path.basename(source_path))[0] + '.pdf')
            if os.path.exists(candidate):
                if candidate != output_pdf:
                    shutil.move(candidate, output_pdf)
                if os.path.exists(output_pdf):
                    converted = True
                    break
        except Exception:
            continue

if converted and os.path.exists(output_pdf):
    print('OK')
    sys.exit(0)
print('FAILED')
sys.exit(1)
`;

    fs.writeFileSync(converterScript, converterCode, 'utf-8');
    const { execFile } = require('child_process');
    const pythonCmds = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];

    const tryPython = (index: number) => {
      if (index >= pythonCmds.length) {
        try { fs.unlinkSync(converterScript); } catch (_) {}
        return res.status(503).json({ success: false, error: 'No se pudo convertir la plantilla Word a PDF para la vista previa.' });
      }
      execFile(pythonCmds[index], [converterScript, resolved, outputPdf], { timeout: 120000 }, (err: any) => {
        const success = !err && fs.existsSync(outputPdf);
        if (!success) return tryPython(index + 1);
        try { fs.unlinkSync(converterScript); } catch (_) {}
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(resolved).replace(/\.(docx?|DOCX?)$/, '.pdf'))}"`);
        return res.sendFile(outputPdf);
      });
    };

    return tryPython(0);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/files/templates/download?path=...
export const downloadTemplate = (req: any, res: Response) => {
  const filePath = req.query.path as string | undefined;
  if (!filePath) return res.status(400).json({ success: false, error: 'Parámetro path requerido.' });
  const resolved = path.resolve(DOCPLANT_ROOT, filePath);
  const root = path.resolve(DOCPLANT_ROOT);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return res.status(403).json({ success: false, error: 'Acceso denegado.' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ success: false, error: 'Plantilla no encontrada.' });
  }
  const ext = path.extname(resolved).toLowerCase();
  const mime = ext === '.docx'
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/msword';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(resolved))}"`);
  res.sendFile(resolved);
};

// GET /api/files/templates/blank.docx
export const downloadBlank = (_req: any, res: Response) => {
  const buf = Buffer.from(BLANK_DOCX_B64, 'base64');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename="Nuevo%20documento.docx"');
  res.setHeader('Content-Length', String(buf.length));
  res.send(buf);
};
