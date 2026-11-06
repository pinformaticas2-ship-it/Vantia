import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import pool from '../config/database';
import { ensureFileOnDisk, saveExpedienteAttachmentFromBuffer } from './filesController';
import { htmlADocx, limpiarHtml } from './documentosController';
import { logActivityForReq, resolveUserName } from './activityController';
import { IDIOMAS, MENSAJE_FALLO, traduccionDisponible } from '../utils/idiomas';
import {
  componerHtml, htmlDeArchivo, normalizarModo, partirBloques, sufijoIdioma,
  traducirBloques, traducirEscaneado, type Modo, type Resultado,
} from '../utils/traducirDocumento';

// ── Traducción de documentos en segundo plano ────────────────────────────────
// Un documento puede tardar varios minutos (varias peticiones a la IA), más de
// lo que aguanta una petición HTTP a través de Vercel. Se lanza un trabajo y el
// navegador pregunta por su estado (GET /api/traducciones/:id). Los trabajos
// viven en memoria: si el servidor se reinicia a mitad, se pierde y se avisa.

interface Trabajo {
  id: string; org: string; userId: string;
  estado: 'en_curso' | 'hecho' | 'error';
  hechos: number; total: number;
  error?: string;
  resultado?: { tipo: 'archivo'; archivoId: string; entidadId: string; nombre: string; parcial: boolean }
    | { tipo: 'documento'; documentoId: string; url: string; titulo: string; parcial: boolean };
  creado: number;
}
const trabajos = new Map<string, Trabajo>();
const DOS_HORAS = 2 * 3600_000;
const limpiar = () => { const t = Date.now() - DOS_HORAS; for (const [k, v] of trabajos) if (v.creado < t) trabajos.delete(k); };

const ctx = (req: Request) => ({ org: (req as any).organizacionId as string, userId: (req as any).auth?.userId as string });
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sinExtension = (n: string) => n.replace(/\.[^/.]+$/, '');
const nombreSeguro = (n: string) => n.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'Documento';

/** Comprobaciones comunes. Devuelve el idioma/modo o responde con el error. */
function preparar(req: Request, res: Response): { idioma: string; modo: Modo } | null {
  const { org, userId } = ctx(req);
  const idioma = String(req.body?.idioma || '').trim().toLowerCase();
  if (!IDIOMAS[idioma]) { res.status(400).json({ success: false, error: 'Elige el idioma al que traducir.' }); return null; }
  if (!traduccionDisponible()) { res.status(503).json({ success: false, error: MENSAJE_FALLO.sin_clave }); return null; }
  limpiar();
  // Una traducción a la vez por persona: cada una gasta varias peticiones del cupo de la IA.
  if ([...trabajos.values()].some((t) => t.org === org && t.userId === userId && t.estado === 'en_curso')) {
    res.status(429).json({ success: false, error: 'Ya tienes una traducción en curso. Espera a que termine.' }); return null;
  }
  return { idioma, modo: normalizarModo(req.body?.modo) };
}

function lanzar(req: Request, res: Response, trabajo: (t: Trabajo) => Promise<void>) {
  const { org, userId } = ctx(req);
  const t: Trabajo = { id: crypto.randomUUID(), org, userId, estado: 'en_curso', hechos: 0, total: 0, creado: Date.now() };
  trabajos.set(t.id, t);
  res.status(202).json({ success: true, data: { trabajoId: t.id } });
  trabajo(t).catch((e: any) => {
    console.warn('[traducción] fallo:', String(e?.message || e).slice(0, 300));
    t.estado = 'error'; t.error = 'No se pudo traducir el documento.';
  });
}

async function traducirHtml(t: Trabajo, html: string, idioma: string, nombre: string): Promise<Resultado> {
  return traducirBloques(partirBloques(html), idioma, nombre, (h, total) => { t.hechos = h; t.total = total; });
}

function fallo(t: Trabajo, r: Extract<Resultado, { ok: false }>) {
  t.estado = 'error';
  t.error = r.motivo === 'vacio' ? 'El documento no tiene texto que traducir.' : MENSAJE_FALLO[r.motivo];
}

// POST /api/files/:clientId/:fileId/traducir  { idioma, modo }
// El resultado (.docx) se adjunta junto al original, en el mismo cliente o expediente.
export async function traducirArchivo(req: Request, res: Response) {
  try {
    const { clientId, fileId } = req.params;
    if (!UUID_RE.test(fileId)) return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    const { rows } = await pool.query(
      `SELECT id, original_name, document_name, stored_name, mimetype, storage_provider, drive_file_id, dropbox_file_id
         FROM client_files WHERE id = $1 AND client_id = $2`, [fileId, clientId],
    );
    const f = rows[0];
    if (!f) return res.status(404).json({ success: false, error: 'Archivo no encontrado.' });
    const p = preparar(req, res); if (!p) return;
    const { userId } = ctx(req);
    lanzar(req, res, async (t) => {
      const ruta = await ensureFileOnDisk(clientId, f.stored_name, f.storage_provider, f.drive_file_id, f.dropbox_file_id);
      if (!fs.existsSync(ruta)) { t.estado = 'error'; t.error = 'No se encontró el archivo.'; return; }
      const nombre = f.document_name || sinExtension(f.original_name);
      const origen = await htmlDeArchivo(ruta, f.original_name, f.mimetype || '');
      if ('aviso' in origen) { t.estado = 'error'; t.error = origen.aviso; return; }
      let r: Resultado;
      if ('escaneado' in origen) { t.total = 1; r = await traducirEscaneado(origen.escaneado, p.idioma, nombre); t.hechos = 1; }
      else r = await traducirHtml(t, origen.html, p.idioma, nombre);
      if ('motivo' in r) return fallo(t, r);
      const titulo = `${nombreSeguro(nombre)} ${sufijoIdioma(p.idioma, p.modo)}`;
      const buf = await htmlADocx(titulo, componerHtml(r, { idioma: p.idioma, modo: p.modo, nombre }));
      const archivo = await saveExpedienteAttachmentFromBuffer(clientId, buf, `${titulo}.docx`, DOCX, userId);
      await pool.query(`UPDATE client_files SET document_name = $1 WHERE id = $2`, [titulo, archivo.id]).catch(() => {});
      void logActivityForReq(req, `Documento traducido (${IDIOMAS[p.idioma]}): ${nombre}`, 'DOCUMENTO', clientId).catch(() => {});
      t.resultado = { tipo: 'archivo', archivoId: archivo.id, entidadId: clientId, nombre: titulo, parcial: r.parcial };
      t.estado = 'hecho';
    });
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ success: false, error: e?.message || 'No se pudo traducir el documento.' });
  }
}

// POST /api/documentos/:id/traducir  { idioma, modo }  → documento nuevo en el editor
export async function traducirDocumentoEditor(req: Request, res: Response) {
  try {
    const { org, userId } = ctx(req);
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ success: false, error: 'Documento no encontrado.' });
    const { rows } = await pool.query(
      `SELECT id, titulo, contenido, expediente_id FROM documentos WHERE id = $1 AND organizacion_id = $2`, [req.params.id, org],
    );
    const d = rows[0];
    if (!d) return res.status(404).json({ success: false, error: 'Documento no encontrado.' });
    const p = preparar(req, res); if (!p) return;
    lanzar(req, res, async (t) => {
      const r = await traducirHtml(t, String(d.contenido || ''), p.idioma, d.titulo);
      if ('motivo' in r) return fallo(t, r);
      const titulo = `${String(d.titulo || 'Documento').slice(0, 260)} ${sufijoIdioma(p.idioma, p.modo)}`;
      const autor = await resolveUserName(userId).catch(() => null);
      const ins = await pool.query(
        `INSERT INTO documentos (organizacion_id, titulo, contenido, expediente_id, created_by, created_by_name, updated_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
        [org, titulo, limpiarHtml(componerHtml(r, { idioma: p.idioma, modo: p.modo, nombre: d.titulo })), d.expediente_id, userId, autor],
      );
      void logActivityForReq(req, `Documento traducido (${IDIOMAS[p.idioma]}): ${d.titulo}`, 'DOCUMENTO', ins.rows[0].id).catch(() => {});
      t.resultado = { tipo: 'documento', documentoId: ins.rows[0].id, url: `/dashboard/documentos/${ins.rows[0].id}`, titulo, parcial: r.parcial };
      t.estado = 'hecho';
    });
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ success: false, error: e?.message || 'No se pudo traducir el documento.' });
  }
}

// GET /api/traducciones/:id  → estado del trabajo (solo quien lo lanzó)
export function estadoTraduccion(req: Request, res: Response) {
  const { org, userId } = ctx(req);
  const t = trabajos.get(String(req.params.id));
  if (!t || t.org !== org || t.userId !== userId) {
    return res.status(404).json({ success: false, error: 'La traducción ya no está disponible (puede que el servidor se haya reiniciado). Vuelve a lanzarla.' });
  }
  return res.json({ success: true, data: { estado: t.estado, hechos: t.hechos, total: t.total, error: t.error, resultado: t.resultado } });
}

export const _paraTests = { trabajos };
