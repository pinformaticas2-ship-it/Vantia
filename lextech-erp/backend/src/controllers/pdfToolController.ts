import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { PDFDocument, PDFPage, StandardFonts, rgb, degrees } from 'pdf-lib';
import pool from '../config/database';
import { TEMP_ROOT } from '../config/paths';
import { logActivityForReq } from './activityController';
import { ensureFileOnDisk, saveExpedienteAttachmentFromBuffer } from './filesController';

// Herramienta PDF de los documentos de clientes y expedientes (06/10/2026):
// fusionar varios documentos (PDF, Word, Excel, imágenes...) en un único PDF
// y retoques sencillos de páginas (quitar, reordenar, girar) con numeración
// opcional ("Documento nº X", "Página X de Y"). El resultado se guarda SIEMPRE
// como un documento nuevo junto a los originales -- nunca se sobrescribe nada.
//
// Rutas (routes/files.ts, detrás de requireFilesPermission, que ya comprueba
// que el cliente/expediente es de la organización activa):
//   GET  /api/files/:clientId/:fileId/as-pdf   el documento como PDF
//   POST /api/files/:clientId/pdf-tool         genera y guarda el PDF

const OFFICE_EXTS = new Set([
  '.doc', '.docx', '.odt', '.rtf', '.txt', '.xls', '.xlsx', '.ods', '.csv', '.ppt', '.pptx', '.odp', '.html', '.htm',
]);
const MAX_PARTES = 60;
const MAX_PAGINAS = 2000;

function sofficeCandidates(): string[] {
  if (process.platform === 'win32') {
    return [
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
      'soffice',
    ];
  }
  return ['soffice', '/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice'];
}

/** Convierte un documento de Office a PDF con LibreOffice (perfil propio por
 *  conversión, para que dos conversiones a la vez no se bloqueen). */
async function officeToPdf(sourcePath: string): Promise<Buffer> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'vantia-pdf-'));
  const ext = path.extname(sourcePath).toLowerCase();
  const input = path.join(work, `doc${ext}`);
  fs.copyFileSync(sourcePath, input);
  const profile = `file:///${path.join(work, 'profile').replace(/\\/g, '/').replace(/^\//, '')}`;
  let lastError = 'LibreOffice no está disponible en el servidor.';
  try {
    for (const bin of sofficeCandidates()) {
      if (bin.includes('\\') && !fs.existsSync(bin)) continue;
      const ok = await new Promise<boolean>((resolve) => {
        execFile(bin, [`-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', work, input],
          { timeout: 120_000, windowsHide: true },
          (err) => { if (err) lastError = err.message; resolve(!err); });
      });
      const out = path.join(work, 'doc.pdf');
      if (ok && fs.existsSync(out)) return fs.readFileSync(out);
    }
    throw new Error(`No se pudo convertir a PDF: ${lastError}`);
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* temporal */ }
  }
}

async function imageToPdf(buffer: Buffer, mimetype: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const img = mimetype === 'image/png' ? await doc.embedPng(buffer) : await doc.embedJpg(buffer);
  // A4 vertical u horizontal según la imagen, con margen.
  const landscape = img.width > img.height;
  const [W, H] = landscape ? [841.89, 595.28] : [595.28, 841.89];
  const page = doc.addPage([W, H]);
  const scale = Math.min((W - 40) / img.width, (H - 40) / img.height, 1);
  const w = img.width * scale; const h = img.height * scale;
  page.drawImage(img, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
  return Buffer.from(await doc.save());
}

interface FileRow { id: string; stored_name: string; original_name: string; mimetype: string; storage_provider: string | null; drive_file_id: string | null; dropbox_file_id: string | null }

async function loadFileRow(clientId: string, fileId: string): Promise<FileRow | null> {
  const { rows } = await pool.query(
    `SELECT id, stored_name, original_name, mimetype, storage_provider, drive_file_id, dropbox_file_id
       FROM client_files WHERE id = $1 AND client_id = $2`,
    [fileId, clientId],
  );
  return rows[0] || null;
}

/** El documento como PDF (con caché en disco de lo convertido). */
async function fileAsPdf(clientId: string, row: FileRow): Promise<Buffer> {
  const source = await ensureFileOnDisk(clientId, row.stored_name, row.storage_provider, row.drive_file_id, row.dropbox_file_id);
  if (!fs.existsSync(source)) throw new Error(`«${row.original_name}» no está disponible en el servidor.`);
  const ext = path.extname(row.original_name || row.stored_name).toLowerCase();
  const mime = String(row.mimetype || '');
  if (mime === 'application/pdf' || ext === '.pdf') return fs.readFileSync(source);
  if (mime === 'image/jpeg' || mime === 'image/png' || ['.jpg', '.jpeg', '.png'].includes(ext)) {
    return imageToPdf(fs.readFileSync(source), mime === 'image/png' || ext === '.png' ? 'image/png' : 'image/jpeg');
  }
  if (!OFFICE_EXTS.has(ext) && !/word|spreadsheet|presentation|opendocument|text\//.test(mime)) {
    throw new Error(`«${row.original_name}» no se puede convertir a PDF (formato no admitido).`);
  }
  const stat = fs.statSync(source);
  const cacheDir = path.join(TEMP_ROOT, 'pdf_tool_cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const cached = path.join(cacheDir, `${row.id}_${Math.round(stat.mtimeMs)}.pdf`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  const pdf = await officeToPdf(source);
  try { fs.writeFileSync(cached, pdf); } catch { /* la caché es opcional */ }
  return pdf;
}

const isNotFound = (e: any) => /no est[aá] disponible|no se puede convertir/.test(String(e?.message || ''));

// ── GET /api/files/:clientId/:fileId/as-pdf ─────────────────────────────────
export async function getFileAsPdf(req: any, res: Response) {
  try {
    const row = await loadFileRow(req.params.clientId, req.params.fileId);
    if (!row) return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    const pdf = await fileAsPdf(req.params.clientId, row);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(pdf);
  } catch (e: any) {
    return res.status(isNotFound(e) ? 422 : 500).json({ success: false, error: e?.message || 'Error convirtiendo a PDF' });
  }
}

// ── Numeración ───────────────────────────────────────────────────────────────

/** Escribe un texto en la posición VISUAL indicada, teniendo en cuenta el giro
 *  de la página (las coordenadas del PDF son las de la página sin girar). */
function drawLabel(page: PDFPage, font: any, text: string, where: 'top-right' | 'bottom-center', size = 10) {
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const box = page.getMediaBox();
  const w = box.width; const h = box.height;
  const [VW, VH] = rot === 90 || rot === 270 ? [h, w] : [w, h];
  const tw = font.widthOfTextAtSize(text, size);
  const pad = 4;
  const vx = where === 'top-right' ? VW - tw - 28 : (VW - tw) / 2;
  const vy = where === 'top-right' ? VH - 28 - size : 18;
  // Visual (vx, vy) → espacio de usuario según el giro.
  const map = (x: number, y: number): [number, number] => {
    if (rot === 90) return [w - y, x];
    if (rot === 180) return [w - x, h - y];
    if (rot === 270) return [y, h - x];
    return [x, y];
  };
  const [rx, ry] = map(vx - pad, vy - pad);
  page.drawRectangle({
    x: box.x + rx, y: box.y + ry, width: tw + pad * 2, height: size + pad * 2,
    rotate: degrees(rot), color: rgb(1, 1, 1), borderColor: rgb(0.75, 0.75, 0.75), borderWidth: where === 'top-right' ? 0.8 : 0,
  });
  const [tx, ty] = map(vx, vy + size * 0.22);
  page.drawText(text, { x: box.x + tx, y: box.y + ty, size, font, color: rgb(0.1, 0.1, 0.1), rotate: degrees(rot) });
}

interface ParteInput { fileId: string; paginas?: { index: number; rotacion?: number }[] }

// ── POST /api/files/:clientId/pdf-tool ──────────────────────────────────────
export async function runPdfTool(req: any, res: Response) {
  const { clientId } = req.params;
  try {
    const partes: ParteInput[] = Array.isArray(req.body?.partes) ? req.body.partes : [];
    const numerarDocumentos = req.body?.opciones?.numerarDocumentos === true;
    const numerarPaginas = req.body?.opciones?.numerarPaginas === true;
    const primerNumero = Math.max(1, Math.min(9999, Math.round(Number(req.body?.opciones?.primerNumero) || 1)));
    let nombre = String(req.body?.nombre || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 180);
    if (!partes.length) return res.status(400).json({ success: false, error: 'Elige al menos un documento.' });
    if (partes.length > MAX_PARTES) return res.status(400).json({ success: false, error: `Como mucho ${MAX_PARTES} documentos a la vez.` });

    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);
    const font_b = await out.embedFont(StandardFonts.HelveticaBold);
    const inicioDeDocumento: number[] = [];
    const cache = new Map<string, PDFDocument>();
    const nombres: string[] = [];

    for (const parte of partes) {
      const row = await loadFileRow(clientId, String(parte.fileId || ''));
      if (!row) return res.status(404).json({ success: false, error: 'Uno de los documentos ya no existe en esta ficha.' });
      let src = cache.get(row.id);
      if (!src) {
        const buf = await fileAsPdf(clientId, row);
        try {
          src = await PDFDocument.load(buf, { ignoreEncryption: true });
        } catch {
          return res.status(422).json({ success: false, error: `«${row.original_name}» está dañado o protegido y no se puede abrir.` });
        }
        cache.set(row.id, src);
      }
      const total = src.getPageCount();
      const paginas = Array.isArray(parte.paginas) && parte.paginas.length
        ? parte.paginas.filter((p) => Number.isInteger(p?.index) && p.index >= 0 && p.index < total)
        : Array.from({ length: total }, (_, index) => ({ index, rotacion: 0 }));
      if (!paginas.length) continue;
      if (out.getPageCount() + paginas.length > MAX_PAGINAS) {
        return res.status(400).json({ success: false, error: `El resultado superaría ${MAX_PAGINAS} páginas.` });
      }
      inicioDeDocumento.push(out.getPageCount());
      nombres.push(row.original_name);
      const copiadas = await out.copyPages(src, paginas.map((p) => p.index));
      copiadas.forEach((pg, i) => {
        const extra = [90, 180, 270].includes(Number(paginas[i].rotacion)) ? Number(paginas[i].rotacion) : 0;
        if (extra) pg.setRotation(degrees((pg.getRotation().angle + extra) % 360));
        out.addPage(pg);
      });
    }
    const totalPaginas = out.getPageCount();
    if (!totalPaginas) return res.status(400).json({ success: false, error: 'No hay ninguna página seleccionada.' });

    if (numerarDocumentos) {
      inicioDeDocumento.forEach((start, i) => drawLabel(out.getPage(start), font_b, `DOCUMENTO Nº ${primerNumero + i}`, 'top-right', 11));
    }
    if (numerarPaginas) {
      for (let i = 0; i < totalPaginas; i++) drawLabel(out.getPage(i), font, `Página ${i + 1} de ${totalPaginas}`, 'bottom-center', 9);
    }

    if (!nombre) {
      nombre = nombres.length > 1
        ? `Documentos fusionados ${new Date().toISOString().slice(0, 10)}`
        : `${path.basename(nombres[0], path.extname(nombres[0]))} (editado)`;
    }
    if (!/\.pdf$/i.test(nombre)) nombre += '.pdf';

    out.setProducer('Vantia');
    out.setTitle(nombre.replace(/\.pdf$/i, ''));
    const bytes = Buffer.from(await out.save());
    const saved = await saveExpedienteAttachmentFromBuffer(clientId, bytes, nombre, 'application/pdf', req.auth?.userId || 'SYSTEM');
    logActivityForReq(req, nombres.length > 1
      ? `PDF fusionado: ${nombre} (${nombres.length} documentos, ${totalPaginas} páginas)`
      : `PDF editado: ${nombre} (${totalPaginas} páginas)`, 'CLIENT', clientId);
    return res.status(201).json({ success: true, data: { ...saved, paginas: totalPaginas } });
  } catch (e: any) {
    return res.status(isNotFound(e) ? 422 : 500).json({ success: false, error: e?.message || 'Error generando el PDF' });
  }
}
