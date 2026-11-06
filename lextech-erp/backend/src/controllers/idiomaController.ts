import { Response } from 'express';
import pool from '../config/database';
import { IDIOMAS, MENSAJE_FALLO, NOMBRE_ES, normalizarIdioma, traduccionDisponible, traducirCorreo, type MotivoFallo } from '../utils/idiomas';

// GET /api/email/idiomas-destinatarios?emails=a@x.com,b@y.com
// Clientes del despacho activo, entre esos correos, que prefieren que se les
// escriba en otro idioma. El redactor de Correo lo usa para ofrecer el correo
// bilingüe.
export const idiomasDestinatarios = async (req: any, res: Response) => {
  const organizacionId = req.organizacionId;
  const emails = String(req.query.emails || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase().replace(/^.*<([^>]+)>.*$/, '$1'))
    .filter((e) => /^[^@\s]+@[^@\s]+$/.test(e))
    .slice(0, 50);
  if (!organizacionId || !emails.length) return res.json({ success: true, data: [], traduccionDisponible: traduccionDisponible() });
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, commercial_name, LOWER(TRIM(email)) AS email, idioma
       FROM entities
       WHERE organizacion_id = $1 AND LOWER(TRIM(email)) = ANY($2::text[]) AND idioma IS NOT NULL AND idioma <> 'es'`,
      [organizacionId, emails],
    );
    res.json({
      success: true,
      traduccionDisponible: traduccionDisponible(),
      data: rows.map((r) => ({
        clienteId: r.id,
        email: r.email,
        nombre: r.commercial_name || [r.first_name, r.last_name].filter(Boolean).join(' '),
        idioma: r.idioma,
        idiomaNombre: NOMBRE_ES[r.idioma] || r.idioma,   // "inglés" (para el aviso)
        idiomaNativo: IDIOMAS[r.idioma] || r.idioma,     // "English" (dentro del correo)
      })),
    });
  } catch (e: any) {
    console.warn('idiomasDestinatarios:', e?.message || e);
    res.status(500).json({ success: false, error: 'No se pudo consultar el idioma de los destinatarios.' });
  }
};

// POST /api/email/traducir  { texto, idioma, html?, recibido?, asunto? }
// recibido: true (o idioma 'es') = traducir un correo recibido, de cualquier idioma, al pedido.
// asunto: si se manda, se traduce en la MISMA petición a la IA (data.asunto).
const ESTADO_FALLO: Record<MotivoFallo, number> = { sin_clave: 503, cupo: 429, saturada: 503, otro: 502 };
export const traducirTexto = async (req: any, res: Response) => {
  const texto = String(req.body?.texto || '');
  const asunto = typeof req.body?.asunto === 'string' ? req.body.asunto : undefined;
  const idioma = normalizarIdioma(req.body?.idioma);
  if (!texto.trim()) return res.status(400).json({ success: false, error: 'No hay nada que traducir.' });
  if (texto.length > 30000) return res.status(400).json({ success: false, error: 'El texto es demasiado largo para traducirlo de una vez.' });
  const r = await traducirCorreo({ cuerpo: texto, asunto, idioma, html: Boolean(req.body?.html), recibido: Boolean(req.body?.recibido) });
  if ('motivo' in r) return res.status(ESTADO_FALLO[r.motivo]).json({ success: false, motivo: r.motivo, error: MENSAJE_FALLO[r.motivo] });
  res.json({ success: true, data: { traduccion: r.cuerpo, asunto: r.asunto, idioma, idiomaNombre: IDIOMAS[idioma] } });
};
