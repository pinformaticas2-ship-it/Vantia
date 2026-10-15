import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import pool from '../config/database';
import { driveFetch, findFolder, createFolder, ensureRootFolder, uploadFileToDrive, downloadDriveFile, isDriveConnected } from '../utils/googleDrive';
import { dropboxRpc, ensureFolder, uploadFileToDropbox, downloadDropboxFile } from '../utils/dropboxStorage';
import { isDropboxConnected } from '../utils/dropboxAuth';

// ── Plantillas del despacho en su nube (15/10/2026) ─────────────────────────
// Cada organización tiene sus plantillas en una carpeta "Plantillas" de su
// Google Drive o Dropbox (Ajustes → Mi Despacho → Plantillas). Mientras no
// la tenga configurada, se siguen usando las plantillas integradas
// (DocPlant), como antes.
//
//  - Dropbox (acceso "carpeta de la app"): lo que se ponga en
//    Apps/<app>/Plantillas, aunque sea desde el Dropbox del ordenador.
//  - Google Drive (permiso drive.file): Vantia solo ve lo que ella misma ha
//    subido, así que las plantillas se suben desde Vantia (se pueden editar
//    luego en Drive). Las añadidas directamente en Drive no se ven.
//
// Las plantillas de la nube se identifican como "nube:<id>" (id de Drive o
// de Dropbox) y se descargan a una caché local para usarlas.

export interface ConfigPlantillas {
  proveedor?: 'drive' | 'dropbox';
  carpetaId?: string;          // Drive: id de la carpeta "Plantillas"
  carpetaPath?: string;        // Dropbox: "/Plantillas"
  importacion?: { estado: 'importando' | 'hecha' | 'error'; hechos: number; total: number; error?: string; at: string };
}

export interface PlantillaNube { ref: string; nombre: string; carpeta: string; ext: string; modificada: string }

const CACHE = path.join(os.tmpdir(), 'vantia-plantillas-nube');
const EXT = /\.(docx?|DOCX?)$/;

export async function configPlantillas(organizacionId: string): Promise<ConfigPlantillas> {
  const { rows } = await pool.query(`SELECT plantillas_config FROM organizaciones WHERE id = $1`, [organizacionId]).catch(() => ({ rows: [] as any[] }));
  return rows[0]?.plantillas_config || {};
}

async function guardarConfig(organizacionId: string, cambios: Partial<ConfigPlantillas>) {
  await pool.query(
    `UPDATE organizaciones SET plantillas_config = COALESCE(plantillas_config, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
    [organizacionId, JSON.stringify(cambios)],
  );
}

export const usaNube = (cfg: ConfigPlantillas) => Boolean(cfg.proveedor && (cfg.carpetaId || cfg.carpetaPath));

// ── Listado (con una caché corta: se pide al abrir cada ventana de plantillas)
const listados = new Map<string, { exp: number; data: PlantillaNube[] }>();
export function olvidarListado(organizacionId: string) { listados.delete(organizacionId); }

async function listarDrive(organizacionId: string, carpetaId: string): Promise<PlantillaNube[]> {
  const out: PlantillaNube[] = [];
  const pendientes: { id: string; ruta: string }[] = [{ id: carpetaId, ruta: '' }];
  let vueltas = 0;
  while (pendientes.length && vueltas++ < 200) {
    const { id, ruta } = pendientes.shift()!;
    let pageToken = '';
    do {
      const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
      const res = await driveFetch(organizacionId, `/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,modifiedTime)&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`);
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || 'No se pudo leer la carpeta de plantillas en Google Drive');
      for (const f of data.files || []) {
        if (f.mimeType === 'application/vnd.google-apps.folder') pendientes.push({ id: f.id, ruta: ruta ? `${ruta}/${f.name}` : f.name });
        else if (EXT.test(f.name) && !f.name.startsWith('~$')) out.push({ ref: `nube:${f.id}`, nombre: f.name, carpeta: ruta, ext: path.extname(f.name).toLowerCase(), modificada: f.modifiedTime });
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);
  }
  return out;
}

async function listarDropbox(organizacionId: string, carpetaPath: string): Promise<PlantillaNube[]> {
  const out: PlantillaNube[] = [];
  let data = await dropboxRpc(organizacionId, '/files/list_folder', { path: carpetaPath, recursive: true, limit: 2000 });
  for (let vueltas = 0; vueltas < 50; vueltas++) {
    for (const e of data.entries || []) {
      if (e['.tag'] !== 'file' || !EXT.test(e.name) || e.name.startsWith('~$')) continue;
      const rel = String(e.path_display || '').slice(carpetaPath.length).replace(/^\//, '');
      out.push({ ref: `nube:${e.id}`, nombre: e.name, carpeta: path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel), ext: path.extname(e.name).toLowerCase(), modificada: e.server_modified });
    }
    if (!data.has_more) break;
    data = await dropboxRpc(organizacionId, '/files/list_folder/continue', { cursor: data.cursor });
  }
  return out;
}

export async function listarPlantillasNube(organizacionId: string, refrescar = false): Promise<PlantillaNube[]> {
  const hit = listados.get(organizacionId);
  if (!refrescar && hit && hit.exp > Date.now()) return hit.data;
  const cfg = await configPlantillas(organizacionId);
  if (!usaNube(cfg)) return [];
  const data = cfg.proveedor === 'drive' ? await listarDrive(organizacionId, cfg.carpetaId!) : await listarDropbox(organizacionId, cfg.carpetaPath!);
  data.sort((a, b) => a.carpeta.localeCompare(b.carpeta, 'es') || a.nombre.localeCompare(b.nombre, 'es'));
  listados.set(organizacionId, { exp: Date.now() + 60_000, data });
  return data;
}

/** Descarga (con caché por versión) una plantilla de la nube y devuelve su ruta local. */
export async function rutaLocalPlantillaNube(organizacionId: string, ref: string): Promise<string | null> {
  if (!ref.startsWith('nube:')) return null;
  const lista = await listarPlantillasNube(organizacionId);
  const p = lista.find((x) => x.ref === ref);
  if (!p) return null; // de otra organización, o ya no está en la carpeta
  const cfg = await configPlantillas(organizacionId);
  const id = ref.slice('nube:'.length);
  const clave = crypto.createHash('sha1').update(`${organizacionId}|${id}|${p.modificada}`).digest('hex');
  const dir = path.join(CACHE, organizacionId);
  const destino = path.join(dir, `${clave}${p.ext}`);
  if (fs.existsSync(destino)) return destino;
  await fs.promises.mkdir(dir, { recursive: true });
  const f = cfg.proveedor === 'drive' ? await downloadDriveFile(organizacionId, id) : await downloadDropboxFile(organizacionId, id);
  await fs.promises.writeFile(destino, f.buffer);
  return destino;
}

/** Crea (si no existe) la carpeta "Plantillas" en la nube elegida y la deja como origen. */
export async function conectarCarpeta(organizacionId: string, proveedor: 'drive' | 'dropbox'): Promise<ConfigPlantillas> {
  if (proveedor === 'drive') {
    if (!(await isDriveConnected(organizacionId))) throw new Error('Primero conecta Google Drive en Ajustes → Integraciones.');
    const raiz = await ensureRootFolder(organizacionId);
    const carpetaId = (await findFolder(organizacionId, 'Plantillas', raiz)) || (await createFolder(organizacionId, 'Plantillas', raiz));
    await guardarConfig(organizacionId, { proveedor, carpetaId, carpetaPath: null as any });
  } else {
    if (!(await isDropboxConnected(organizacionId))) throw new Error('Primero conecta Dropbox en Ajustes → Integraciones.');
    await ensureFolder(organizacionId, '/Plantillas');
    await guardarConfig(organizacionId, { proveedor, carpetaPath: '/Plantillas', carpetaId: null as any });
  }
  olvidarListado(organizacionId);
  return configPlantillas(organizacionId);
}

export async function desconectarCarpeta(organizacionId: string) {
  await pool.query(`UPDATE organizaciones SET plantillas_config = '{}'::jsonb WHERE id = $1`, [organizacionId]);
  olvidarListado(organizacionId);
}

/** Carpeta (y subcarpetas) de destino dentro de "Plantillas". */
async function carpetaDestino(organizacionId: string, cfg: ConfigPlantillas, subcarpeta: string, cacheDrive: Map<string, string>): Promise<string> {
  const partes = subcarpeta.split('/').map((s) => s.trim()).filter(Boolean);
  if (cfg.proveedor === 'dropbox') {
    const p = [cfg.carpetaPath, ...partes].join('/');
    if (partes.length) await ensureFolder(organizacionId, p);
    return p;
  }
  let actual = cfg.carpetaId!;
  let ruta = '';
  for (const parte of partes) {
    ruta = ruta ? `${ruta}/${parte}` : parte;
    const hit = cacheDrive.get(ruta);
    if (hit) { actual = hit; continue; }
    actual = (await findFolder(organizacionId, parte, actual)) || (await createFolder(organizacionId, parte, actual));
    cacheDrive.set(ruta, actual);
  }
  return actual;
}

export async function subirPlantilla(organizacionId: string, nombre: string, buffer: Buffer, subcarpeta = '', cacheDrive = new Map<string, string>()) {
  const cfg = await configPlantillas(organizacionId);
  if (!usaNube(cfg)) throw new Error('Primero conecta la carpeta de plantillas.');
  const destino = await carpetaDestino(organizacionId, cfg, subcarpeta, cacheDrive);
  const mime = nombre.toLowerCase().endsWith('.docx')
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/msword';
  if (cfg.proveedor === 'drive') await uploadFileToDrive(organizacionId, destino, nombre, buffer, mime);
  else await uploadFileToDropbox(organizacionId, destino, nombre, buffer, mime);
}

/** Copia las plantillas integradas (DocPlant) a la carpeta de la nube, en
 *  segundo plano y sin repetir las que ya estén (mismo nombre y carpeta). */
export async function importarIntegradas(organizacionId: string, raiz: string): Promise<void> {
  const archivos: { abs: string; carpeta: string; nombre: string }[] = [];
  (function recorrer(dir: string, rel: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(abs, rel ? `${rel}/${e.name}` : e.name);
      else if (EXT.test(e.name) && !e.name.startsWith('~$')) archivos.push({ abs, carpeta: rel, nombre: e.name });
    }
  })(raiz, '');
  const ya = new Set((await listarPlantillasNube(organizacionId, true)).map((p) => `${p.carpeta}/${p.nombre}`));
  const faltan = archivos.filter((a) => !ya.has(`${a.carpeta}/${a.nombre}`));
  const estado = { estado: 'importando' as const, hechos: 0, total: faltan.length, at: new Date().toISOString() };
  await guardarConfig(organizacionId, { importacion: estado });
  const cacheDrive = new Map<string, string>();
  try {
    for (const a of faltan) {
      await subirPlantilla(organizacionId, a.nombre, await fs.promises.readFile(a.abs), a.carpeta, cacheDrive);
      estado.hechos++;
      if (estado.hechos % 10 === 0) await guardarConfig(organizacionId, { importacion: estado });
    }
    await guardarConfig(organizacionId, { importacion: { ...estado, estado: 'hecha' } });
  } catch (e: any) {
    await guardarConfig(organizacionId, { importacion: { ...estado, estado: 'error', error: String(e?.message || e).slice(0, 300) } });
  } finally {
    olvidarListado(organizacionId);
  }
}

export async function proveedoresConectados(organizacionId: string) {
  const [drive, dropbox] = await Promise.all([
    isDriveConnected(organizacionId).catch(() => false),
    isDropboxConnected(organizacionId).catch(() => false),
  ]);
  return { drive, dropbox };
}
