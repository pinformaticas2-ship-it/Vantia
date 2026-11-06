import { Response } from 'express';
import { MENSAJE_FALLO, pedirGemini, type MotivoFallo } from '../utils/idiomas';

// POST /api/ia/json  { prompt, imagenes?: [{ mime, base64 }] }
// IA genérica que devuelve JSON, para herramientas internas que la necesitan
// (la Calculadora de costas: leer una resolución y el asistente de cambios).
// Mismo Gemini, reintentos y cupos que la traducción.
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ESTADO: Record<MotivoFallo, number> = { sin_clave: 503, cupo: 429, saturada: 503, otro: 502 };

export const iaJson = async (req: any, res: Response) => {
  const prompt = String(req.body?.prompt || '');
  if (!prompt.trim()) return res.status(400).json({ success: false, error: 'Falta el texto para la IA.' });
  if (prompt.length > 90_000) return res.status(400).json({ success: false, error: 'El texto es demasiado largo para la IA.' });
  const imagenes = (Array.isArray(req.body?.imagenes) ? req.body.imagenes : [])
    .slice(0, 10)
    .map((i: any) => ({ mime: String(i?.mime || ''), base64: String(i?.base64 || '') }))
    .filter((i: { mime: string; base64: string }) => MIMES.has(i.mime) && i.base64 && i.base64.length < 3_000_000 && /^[A-Za-z0-9+/=]+$/.test(i.base64));
  const r = await pedirGemini({ texto: prompt, imagenes, json: true, validar: (t) => { JSON.parse(t); return true; } });
  if ('motivo' in r) {
    return res.status(ESTADO[r.motivo]).json({ success: false, motivo: r.motivo, error: MENSAJE_FALLO[r.motivo].replace('traducir el texto', 'responder') });
  }
  res.json({ success: true, data: JSON.parse(r.texto) });
};
