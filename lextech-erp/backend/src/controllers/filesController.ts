import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import pool from '../config/database';

const UPLOADS_ROOT = path.join(__dirname, '../../uploads/clients');

// Asegura que el directorio del cliente existe
function ensureClientDir(clientId: string) {
  const dir = path.join(UPLOADS_ROOT, clientId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─────────────────────────────────────────────────────────────
// GET /api/files/:clientId  — lista de archivos del cliente
// ─────────────────────────────────────────────────────────────
export const listFiles = async (req: any, res: Response) => {
  const { clientId } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, original_name, stored_name, mimetype, size_bytes, category, created_by, created_at
       FROM client_files WHERE client_id = $1 ORDER BY created_at DESC`,
      [clientId]
    );
    res.json({ success: true, data: result.rows });
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
    for (const file of files) {
      const result = await pool.query(
        `INSERT INTO client_files (client_id, original_name, stored_name, mimetype, size_bytes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [clientId, file.originalname, file.filename, file.mimetype, file.size, userId]
      );
      inserted.push(result.rows[0]);
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
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(original_name)}"`);
    res.sendFile(filePath);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/files/:clientId/:fileId  — borrar archivo
// ─────────────────────────────────────────────────────────────
export const deleteFile = async (req: any, res: Response) => {
  const { clientId, fileId } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM client_files WHERE id = $1 AND client_id = $2 RETURNING stored_name`,
      [fileId, clientId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }
    const filePath = path.join(UPLOADS_ROOT, clientId, result.rows[0].stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export { ensureClientDir, UPLOADS_ROOT };

// ─────────────────────────────────────────────────────────────
// PLANTILLAS — DocPlant
// ─────────────────────────────────────────────────────────────

// DocPlant vive 3 niveles arriba de backend/src/controllers/
const DOCPLANT_ROOT = process.env.DOCPLANT_PATH
  ? path.resolve(process.env.DOCPLANT_PATH)
  : path.join(__dirname, '../../../DocPlant');

// Blank .docx completo — generado y verificado con Python/zipfile
const BLANK_DOCX_B64 =
  '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' +
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
