import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import pool from '../config/database';

const UPLOADS_ROOT = path.join(__dirname, '../../uploads/clients');

// Ruta local para almacenar archivos de clientes (carpeta por cliente)
const LOCAL_CLIENT_FILES_ROOT = process.env.CLIENT_FILES_PATH
  ? path.resolve(process.env.CLIENT_FILES_PATH)
  : path.join(process.env.USERPROFILE || process.env.HOME || '', 'lextech-client-files');

// Asegura que el directorio del cliente existe (servidor)
function ensureClientDir(clientId: string) {
  const dir = path.join(UPLOADS_ROOT, clientId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Asegura que la carpeta local del cliente existe
function ensureLocalClientDir(clientId: string) {
  const dir = path.join(LOCAL_CLIENT_FILES_ROOT, clientId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Sincroniza archivo del servidor a carpeta local del cliente
function syncFileToLocal(clientId: string, fileName: string, sourceFilePath: string) {
  try {
    const localDir = ensureLocalClientDir(clientId);
    const destPath = path.join(localDir, fileName);
    fs.copyFileSync(sourceFilePath, destPath);
    return destPath;
  } catch (err) {
    // Fallar silenciosamente si no se puede copiar a local
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/files/:clientId  — lista de archivos del cliente
// ─────────────────────────────────────────────────────────────
export const listFiles = async (req: any, res: Response) => {
  const { clientId } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, original_name, stored_name, mimetype, size_bytes, category, document_name, attachment_type, created_by, created_at
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

      // Sincronizar archivo a carpeta local del cliente
      const sourceFile = path.join(clientDir, file.filename);
      syncFileToLocal(clientId, baseFileName, sourceFile);
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
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(original_name)}"`);
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

// ─────────────────────────────────────────────────────────────
// PUT /api/files/:clientId/:fileId  — actualizar nombre y tipo
// ─────────────────────────────────────────────────────────────
export const updateFileMetadata = async (req: any, res: Response) => {
  const { clientId, fileId } = req.params;
  const { document_name, attachment_type } = req.body;

  try {
    // Si document_name cambia, también actualizar original_name
    const originalNameUpdate = document_name ? `, original_name = $5` : '';
    const params = document_name
      ? [document_name, attachment_type || 'Sin clasificar', fileId, clientId, `${document_name}.docx`]
      : [null, attachment_type || 'Sin clasificar', fileId, clientId];

    const query = `
      UPDATE client_files
      SET document_name = $1, attachment_type = $2 ${originalNameUpdate}
      WHERE id = $3 AND client_id = $4
      RETURNING id, document_name, attachment_type, original_name
    `;

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
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

    // Sincronizar a carpeta local del cliente
    syncFileToLocal(clientId, originalName, filePath);

    // Guardar en base de datos con metadatos
    const result = await pool.query(
      `INSERT INTO client_files (client_id, original_name, stored_name, mimetype, size_bytes, document_name, attachment_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, original_name`,
      [clientId, originalName, storedName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', blankDocx.length, document_name || null, attachment_type || 'Sin clasificar', userId]
    );

    const fileId = result.rows[0].id;
    // URL de descarga con token incluido (el cliente la usará para Word)
    const downloadUrl = `/api/files/${clientId}/${fileId}/download`;

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
      `SELECT stored_name, original_name FROM client_files WHERE id = $1 AND client_id = $2`,
      [fileId, clientId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    }
    const { stored_name, original_name } = result.rows[0];
    const serverPath = path.join(UPLOADS_ROOT, clientId, stored_name);

    if (!fs.existsSync(serverPath)) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco.' });
    }

    // Copiar versión fresca a la carpeta local del cliente
    const localDir  = ensureLocalClientDir(clientId);
    const localPath = path.join(localDir, original_name);
    fs.copyFileSync(serverPath, localPath);

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

    // Solo permitir previsualizar archivos Word
    if (!mimetype?.includes('wordprocessingml') && !original_name?.endsWith('.docx')) {
      return res.status(400).json({ success: false, error: 'Este tipo de archivo no es soportado para previsualización.' });
    }

    const filePath = path.join(UPLOADS_ROOT, clientId, stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Archivo no encontrado en disco.' });
    }

    // Crear script Python temporal
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const scriptPath = path.join(tempDir, `preview_${fileId}.py`);

    // Convertir barras invertidas a normales para que Python no las interprete como escapes
    const normalizedPath = filePath.replace(/\\/g, '/');

    const pythonScript = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io
import base64
from zipfile import ZipFile
from xml.etree import ElementTree as ET

# Forzar salida UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def extract_text_from_element(element, ns, rels, images):
    """Extrae texto con formato de un elemento XML"""
    html = ''
    for run in element.findall('.//w:r', ns):
        # Propiedades del run
        rPr = run.find('w:rPr', ns)
        bold = rPr is not None and rPr.find('w:b', ns) is not None
        italic = rPr is not None and rPr.find('w:i', ns) is not None
        underline = rPr is not None and rPr.find('w:u', ns) is not None
        color = '000000'
        size = '11'

        if rPr is not None:
            color_elem = rPr.find('w:color', ns)
            if color_elem is not None:
                color = color_elem.get('w:val', '000000')
            sz_elem = rPr.find('w:sz', ns)
            if sz_elem is not None:
                size_val = int(sz_elem.get('w:val', '22')) // 2
                size = str(size_val)

        styles = f'color: #{color}; font-size: {size}pt;'
        if bold:
            styles += ' font-weight: bold;'
        if italic:
            styles += ' font-style: italic;'
        if underline:
            styles += ' text-decoration: underline;'

        # Procesar texto
        for text_elem in run.findall('.//w:t', ns):
            if text_elem.text:
                text = text_elem.text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                if styles.strip():
                    html += f'<span style="{styles}">{text}</span>'
                else:
                    html += text

        # Procesar imágenes
        for drawing in run.findall('.//w:drawing', ns):
            for inline in drawing.findall('.//wp:inline', ns):
                for graphic_data in inline.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}graphicData', ns):
                    for pic in graphic_data.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/picture}pic', ns):
                        for blip in pic.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}blip', ns):
                            embed = blip.get('{' + ns['r'] + '}embed')
                            if embed and embed in rels:
                                img_path = rels[embed]
                                img_name = img_path.split('/')[-1]
                                if img_name in images:
                                    img_data = images[img_name]
                                    html += '<img src="data:' + img_data['mime'] + ';base64,' + img_data['data'] + '" style="max-width: 100%; height: auto; margin: 5px 0; border-radius: 4px;" />'
    return html

try:
    file_path = sys.argv[1] if len(sys.argv) > 1 else '${normalizedPath}'
    with ZipFile(file_path, 'r') as docx:
        # Leer XML del documento
        xml_content = docx.read('word/document.xml').decode('utf-8')
        root = ET.fromstring(xml_content.encode('utf-8'))

        # Namespaces
        ns = {
            'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
            'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
            'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'
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

        # Procesar párrafos del documento con estilos
        html_content = []
        for para in root.findall('.//w:p', ns):
            runs = para.findall('.//w:r', ns)
            if not runs:
                continue

            para_html = '<p style="margin: 12px 0; line-height: 1.5;">'

            # Obtener texto del párrafo usando la función auxiliar
            text = extract_text_from_element(para, ns, rels, images)

            if text.strip():
                para_html += text
                para_html += '</p>'
                html_content.append(para_html)

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
    execFile(pythonCmd, [scriptPath, filePath], { timeout: 10000, maxBuffer: 10 * 1024 * 1024 }, (error: any, stdout: any, stderr: any) => {
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
