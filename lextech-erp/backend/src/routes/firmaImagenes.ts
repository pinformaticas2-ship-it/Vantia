import express, { Router, Request, Response } from 'express';
import pool from '../config/database';
import { requireAuth } from '../middleware/auth';

// Imágenes de las firmas de correo (logo, fondo, firma en imagen...), 07/10/2026.
// Se guardan en la BD (el disco del servidor se borra en cada despliegue) y se
// sirven en una URL PÚBLICA: quien recibe el correo tiene que poder verlas sin
// sesión. El id es un UUID aleatorio, así que la URL no se puede adivinar.

const TIPOS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };
const MAX_BYTES = 3 * 1024 * 1024;

const router = Router();
router.use(requireAuth);

// POST /api/firma-imagenes   (cuerpo: la imagen tal cual, Content-Type image/*)
router.post('/', express.raw({ type: Object.keys(TIPOS), limit: MAX_BYTES }), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).organizacionId;
    if (!orgId) return res.status(403).json({ success: false, error: 'No perteneces a ninguna organización.' });
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = TIPOS[mime];
    if (!ext) return res.status(400).json({ success: false, error: 'Formato no admitido: usa PNG, JPG o GIF (son los que se ven en todos los programas de correo).' });
    const data = req.body as Buffer;
    if (!Buffer.isBuffer(data) || !data.length) return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
    const { rows } = await pool.query(
      `INSERT INTO firma_imagenes (organizacion_id, mimetype, size_bytes, data, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orgId, mime, data.length, data, (req as any).auth?.userId || null],
    );
    return res.status(201).json({ success: true, data: { id: rows[0].id, path: `/api/public/firma-imagen/${rows[0].id}.${ext}` } });
  } catch (e: any) {
    const tooBig = e?.type === 'entity.too.large';
    return res.status(tooBig ? 413 : 500).json({ success: false, error: tooBig ? 'La imagen pesa más de 3 MB.' : (e?.message || 'Error guardando la imagen') });
  }
});

export default router;

// GET /api/public/firma-imagen/:file   (sin sesión: lo pide el correo del destinatario)
export async function servirFirmaImagen(req: Request, res: Response) {
  const id = String(req.params.file || '').replace(/\.(png|jpg|gif)$/i, '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).end();
  try {
    const { rows } = await pool.query(`SELECT mimetype, data FROM firma_imagenes WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).end();
    res.set({
      'Content-Type': rows[0].mimetype,
      // Una imagen nunca cambia (cada subida es un id nuevo).
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.removeHeader('Pragma');
    res.removeHeader('Expires');
    return res.send(rows[0].data);
  } catch {
    return res.status(500).end();
  }
}
