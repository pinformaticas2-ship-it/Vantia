import fs from 'fs';
import path from 'path';
import pool from '../config/database';
import { UPLOADS_CLIENTS_ROOT as UPLOADS_ROOT, CLIENT_FILES_ROOT as LOCAL_CLIENT_FILES_ROOT } from '../config/paths';
import {
  getDriveStartPageToken,
  listDriveChanges,
  recordDriveError,
  clearDriveError,
} from './googleDrive';

// Sondeo periódico: refleja en Vantia los cambios hechos DIRECTAMENTE en
// Google Drive (renombrar o borrar/mover a la papelera un archivo), que de
// otra forma Vantia nunca vería -- todo lo demás en este módulo Drive es
// Vantia -> Drive (subir, renombrar, borrar desde la app).
async function syncDriveChangesForOrganizacion(organizacionId: string): Promise<void> {
  const { rows } = await pool.query(
    `SELECT google_drive_changes_page_token FROM organizaciones WHERE id = $1`,
    [organizacionId],
  );
  if (!rows.length) return;
  const storedToken = rows[0].google_drive_changes_page_token as string | null;

  // Primera vez: no hay nada que reconciliar todavía, solo se guarda el
  // cursor de partida para el próximo sondeo.
  if (!storedToken) {
    const startToken = await getDriveStartPageToken(organizacionId);
    await pool.query(
      `UPDATE organizaciones SET google_drive_changes_page_token = $1 WHERE id = $2`,
      [startToken, organizacionId],
    );
    return;
  }

  const { changes, newPageToken } = await listDriveChanges(organizacionId, storedToken);

  for (const change of changes) {
    const { rows: fileRows } = await pool.query(
      `SELECT id, client_id, original_name, attachment_type FROM client_files WHERE drive_file_id = $1`,
      [change.fileId],
    );
    if (!fileRows.length) continue; // no es un archivo que gestionemos (o ya se borró por nuestro lado)
    const fileRow = fileRows[0];

    const wasRemoved = change.removed || change.file?.trashed;
    if (wasRemoved) {
      await pool.query(`DELETE FROM client_files WHERE id = $1`, [fileRow.id]);
      // Best-effort: limpiar también la copia local en caché de este contenedor.
      try {
        const localTypeDir = path.join(LOCAL_CLIENT_FILES_ROOT, fileRow.client_id, fileRow.attachment_type || 'Sin clasificar');
        const localPath = path.join(localTypeDir, fileRow.original_name);
        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      } catch (_) { /* fallo silencioso */ }
      continue;
    }

    const newName = change.file?.name;
    if (newName && newName !== fileRow.original_name) {
      await pool.query(
        `UPDATE client_files SET original_name = $1, updated_at = NOW() WHERE id = $2`,
        [newName, fileRow.id],
      );
    }
  }

  await pool.query(
    `UPDATE organizaciones SET google_drive_changes_page_token = $1 WHERE id = $2`,
    [newPageToken, organizacionId],
  );
}

// El sondeo corre cada 20s -- si una pasada tarda más que eso (organización
// con muchos cambios pendientes, o Drive lento), esta guarda evita que se
// solapen dos pasadas a la vez sobre la misma organización.
let syncInProgress = false;

export async function syncAllOrganizacionesDriveChanges(): Promise<void> {
  if (syncInProgress) return;
  syncInProgress = true;
  try {
    const { rows } = await pool.query(
      `SELECT id FROM organizaciones WHERE google_drive_refresh_token_enc IS NOT NULL`,
    );
    for (const row of rows) {
      try {
        await syncDriveChangesForOrganizacion(row.id);
        await clearDriveError(row.id, 'sync');
      } catch (err: any) {
        await recordDriveError(row.id, err, 'sync');
      }
    }
  } finally {
    syncInProgress = false;
  }
}
