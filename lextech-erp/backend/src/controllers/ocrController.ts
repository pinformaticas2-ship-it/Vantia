import { Response } from 'express';
import { createWorker } from 'tesseract.js';
import fs from 'fs';

/**
 * Extrae los campos del DNI a partir del texto OCR.
 * Soporta tanto texto libre como la zona MRZ (Machine Readable Zone).
 */
function parseDNIText(raw: string) {
  const text  = raw.toUpperCase();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ── NIF / NIE ─────────────────────────────────────────────
  // DNI:  8 dígitos + letra     ej: 12345678Z
  // NIE:  X/Y/Z + 7 dígitos + letra  ej: X1234567A
  const nifMatch = text.match(/\b([XYZ]\d{7}[A-Z]|\d{8}[A-Z])\b/);
  const nif_cif  = nifMatch ? nifMatch[1] : null;

  // ── Nombre / Apellidos desde la MRZ ──────────────────────
  // La MRZ del DNI TD1 tiene una línea con '<<' como separador:
  // APELLIDO1<<APELLIDO2<<NOMBRE<<<<<<<<<<<<
  let first_name: string | null = null;
  let last_name:  string | null = null;

  const mrzLine = lines.find(l =>
    l.includes('<<') && l.length > 15 && /^[A-Z<\s]+$/.test(l)
  );

  if (mrzLine) {
    const clean  = mrzLine.replace(/\s/g, '');
    const parts  = clean.split('<<').filter(Boolean);
    if (parts[0]) last_name  = parts[0].replace(/</g, ' ').trim();
    if (parts[1]) first_name = parts[1].replace(/</g, ' ').trim();
  }

  // ── Fallback: etiquetas de texto libre ────────────────────
  if (!last_name) {
    const m = text.match(/APELLIDOS?\s*[:\-]?\s*([A-ZÁÉÍÓÚÜÑ ]{3,})/);
    if (m) last_name = m[1].trim();
  }
  if (!first_name) {
    const m = text.match(/NOMBRE\s*[:\-]?\s*([A-ZÁÉÍÓÚÜÑ ]{2,})/);
    if (m) first_name = m[1].trim();
  }

  // ── Fecha de nacimiento ───────────────────────────────────
  // Formatos: DD MM YYYY | DD-MM-YYYY | DD/MM/YYYY
  let birth_date: string | null = null;
  const dateMatch = text.match(/\b(\d{2})[\s\-\/](\d{2})[\s\-\/](\d{4})\b/);
  if (dateMatch) birth_date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;

  // ── Localidad ─────────────────────────────────────────────
  let address_town: string | null = null;
  const townMatch = text.match(
    /(?:MUNICIPIO|LOCALIDAD|LUGAR DE NACIMIENTO|LUGAR NAC\.?)\s*[:\-]?\s*([A-ZÁÉÍÓÚÜÑ ]{3,})/
  );
  if (townMatch) address_town = townMatch[1].trim();

  return { first_name, last_name, nif_cif, birth_date, address_town };
}

// ─────────────────────────────────────────────────────────────
// POST /api/ocr/dni
// ─────────────────────────────────────────────────────────────
export const scanDNI = async (req: any, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen.' });
  }

  const tempPath = req.file.path;
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

  try {
    // Tesseract con español + inglés para mejor cobertura de caracteres
    worker = await createWorker(['spa', 'eng'], 1, {
      logger: () => {}, // silenciar logs de progreso
    });

    const { data: { text } } = await worker.recognize(tempPath);

    const extracted = parseDNIText(text);

    return res.json({ success: true, data: extracted });

  } catch (error: any) {
    console.error('❌ Error OCR Tesseract:', error.message);
    return res.status(500).json({
      success: false,
      error: 'No se pudo procesar la imagen. Asegúrate de que sea clara y esté bien iluminada.',
    });
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    try { fs.unlinkSync(tempPath); } catch {}
  }
};
