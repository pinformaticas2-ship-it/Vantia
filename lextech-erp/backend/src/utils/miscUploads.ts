import path from 'path';
import pool from '../config/database';

// Almacén genérico para blobs pequeños que antes vivían solo en el disco
// efímero de Railway (fotos de DNI, logos de organización) -- mismo patrón
// que chat_uploads: el contenido va a Postgres (persistente), la URL pública
// sigue teniendo la misma forma de siempre (/uploads/<carpeta>/<archivo>),
// así que no hace falta tocar nada en el frontend.
export type MiscUploadKind = 'dni' | 'org_logo';

export async function saveMiscUpload(
  file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  kind: MiscUploadKind,
): Promise<string> {
  const ext = path.extname(file.originalname || '') || (kind === 'org_logo' ? '.png' : '.jpg');
  const filename = `${kind}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  await pool.query(
    `INSERT INTO misc_uploads (filename, kind, original_name, mimetype, size_bytes, data)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [filename, kind, file.originalname || null, file.mimetype, file.size, file.buffer],
  );
  return filename;
}

export async function deleteMiscUpload(filename: string): Promise<void> {
  try {
    await pool.query(`DELETE FROM misc_uploads WHERE filename = $1`, [filename]);
  } catch { /* best effort */ }
}
