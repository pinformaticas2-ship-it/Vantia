import fs from 'fs';
import path from 'path';
import { leerComoDocx } from '../services/plantillasWord';

// ── Texto de un documento adjunto (22/10/2026) ───────────────────────────────
// PDF (pdf-parse), Word (mammoth; .doc/.odt/.rtf pasan antes a .docx con
// LibreOffice, como las plantillas) y texto plano. Las imágenes y los PDF
// escaneados no tienen texto: se devuelve un aviso en vez de inventar nada.

export type TextoDocumento = { texto: string } | { aviso: string };

const PLANOS = ['.txt', '.csv', '.md', '.eml', '.json', '.xml'];

export async function textoDeDocumento(ruta: string, nombre: string, mime = ''): Promise<TextoDocumento> {
  const ext = path.extname(nombre).toLowerCase();
  if (ext === '.pdf' || mime === 'application/pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: await fs.promises.readFile(ruta) });
    try {
      const t = String((await parser.getText())?.text || '').trim();
      return t ? { texto: t } : { aviso: 'PDF sin texto (parece escaneado)' };
    } finally {
      await Promise.resolve(parser.destroy?.()).catch(() => {});
    }
  }
  if (['.docx', '.doc', '.odt', '.rtf'].includes(ext)) {
    const mammoth = require('mammoth');
    const buffer = ext === '.docx' ? await fs.promises.readFile(ruta) : await leerComoDocx(ruta);
    const t = String((await mammoth.extractRawText({ buffer }))?.value || '').trim();
    return t ? { texto: t } : { aviso: 'documento vacío' };
  }
  if (ext === '.html' || ext === '.htm') {
    const html = await fs.promises.readFile(ruta, 'utf8');
    return { texto: html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
  }
  if (PLANOS.includes(ext) || mime.startsWith('text/')) return { texto: (await fs.promises.readFile(ruta, 'utf8')).trim() };
  if (mime.startsWith('image/')) return { aviso: 'imagen (sin texto)' };
  return { aviso: `tipo de archivo que no se puede leer (${ext || mime || 'desconocido'})` };
}
