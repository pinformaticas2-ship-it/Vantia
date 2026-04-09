import fs from 'fs';
import path from 'path';
import pool from '../config/database';

// Mismas rutas que en filesController para mantener coherencia
const LOCAL_ROOT = process.env.CLIENT_FILES_PATH
  ? path.resolve(process.env.CLIENT_FILES_PATH)
  : path.join(process.env.USERPROFILE || process.env.HOME || '', 'lextech-client-files');

const UPLOADS_ROOT = path.join(__dirname, '../../uploads/clients');

// Mapa de timers pendientes (debounce por archivo)
const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Ignora ficheros temporales que crea Word mientras edita, y el _CLIENTE.txt */
function isTemp(name: string): boolean {
  return (
    name.startsWith('~$') ||
    name.startsWith('~') ||
    name.endsWith('.tmp') ||
    name.endsWith('.TMP') ||
    name.startsWith('.') ||
    name === '_CLIENTE.txt'
  );
}

/**
 * Sincroniza un archivo modificado localmente de vuelta al servidor.
 * Soporta tanto la estructura nueva (clientId/tipoFolder/archivo)
 * como la antigua (clientId/archivo) para compatibilidad.
 */
async function syncToServer(clientId: string, originalName: string, typeFolder?: string) {
  // Construir la ruta local correcta según si hay subcarpeta de tipo o no
  const localPath = typeFolder
    ? path.join(LOCAL_ROOT, clientId, typeFolder, originalName)
    : path.join(LOCAL_ROOT, clientId, originalName);

  if (!fs.existsSync(localPath)) return;

  try {
    const { size } = fs.statSync(localPath);

    // Buscar el archivo en la DB; si hay typeFolder usarlo como pista adicional
    let result;
    if (typeFolder) {
      // Buscar primero con la carpeta de tipo como attachment_type
      result = await pool.query(
        `SELECT stored_name FROM client_files
         WHERE client_id = $1 AND original_name = $2
         AND (attachment_type = $3 OR attachment_type IS NULL)
         LIMIT 1`,
        [clientId, originalName, typeFolder]
      );
      // Si no coincide exactamente, buscar solo por nombre
      if (!result.rows.length) {
        result = await pool.query(
          `SELECT stored_name FROM client_files
           WHERE client_id = $1 AND original_name = $2 LIMIT 1`,
          [clientId, originalName]
        );
      }
    } else {
      result = await pool.query(
        `SELECT stored_name FROM client_files
         WHERE client_id = $1 AND original_name = $2 LIMIT 1`,
        [clientId, originalName]
      );
    }

    if (!result.rows.length) return;

    const { stored_name } = result.rows[0];
    const serverDir  = path.join(UPLOADS_ROOT, clientId);
    const serverPath = path.join(serverDir, stored_name);

    if (!fs.existsSync(serverDir)) fs.mkdirSync(serverDir, { recursive: true });

    fs.copyFileSync(localPath, serverPath);

    await pool.query(
      `UPDATE client_files SET size_bytes = $1 WHERE client_id = $2 AND original_name = $3`,
      [size, clientId, originalName]
    );

    const subfolder = typeFolder ? `${typeFolder}/` : '';
    console.log(`✅ Auto-sync: ${clientId}/${subfolder}${originalName} (${size} bytes)`);
  } catch (err: any) {
    console.error(`❌ Auto-sync error [${clientId}/${originalName}]:`, err.message);
  }
}

export function startLocalFilesWatcher() {
  if (!fs.existsSync(LOCAL_ROOT)) {
    console.log('ℹ️  Watcher no iniciado — la carpeta local aún no existe:', LOCAL_ROOT);
    return;
  }

  try {
    fs.watch(LOCAL_ROOT, { recursive: true }, (_event, filename) => {
      if (!filename) return;

      // En Windows el separador puede ser '\' o '/'
      const parts = filename.split(/[\\/]/);

      if (parts.length === 2) {
        // Estructura antigua: clientId/archivo.ext (compatibilidad hacia atrás)
        const clientId    = parts[0];
        const originalName = parts[1];
        if (!originalName || isTemp(originalName)) return;

        const key = `${clientId}/${originalName}`;
        if (pending.has(key)) clearTimeout(pending.get(key)!);
        pending.set(key, setTimeout(() => {
          pending.delete(key);
          syncToServer(clientId, originalName, undefined);
        }, 1500));

      } else if (parts.length >= 3) {
        // Estructura nueva: clientId/tipoFolder/archivo.ext
        const clientId    = parts[0];
        const typeFolder  = parts[1];
        const originalName = parts[2];

        if (!originalName || isTemp(originalName)) return;

        const key = `${clientId}/${typeFolder}/${originalName}`;
        if (pending.has(key)) clearTimeout(pending.get(key)!);
        pending.set(key, setTimeout(() => {
          pending.delete(key);
          syncToServer(clientId, originalName, typeFolder);
        }, 1500));
      }
    });

    console.log('👁️  Watcher de cambios locales activo en:', LOCAL_ROOT);
  } catch (err: any) {
    console.error('❌ Error al iniciar watcher:', err.message);
  }
}
