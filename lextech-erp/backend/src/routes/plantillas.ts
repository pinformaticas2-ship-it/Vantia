import { Router, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import { requireAuth } from '../middleware/auth';
import { getDocPlantRoot } from '../controllers/filesController';
import { logActivityForReq } from '../controllers/activityController';
import {
  configPlantillas, usaNube, listarPlantillasNube, conectarCarpeta, desconectarCarpeta,
  subirPlantilla, importarIntegradas, proveedoresConectados, olvidarListado, carpetasDrive, elegirCarpetaDrive,
  puedeEscribir, rutaCarpetaSegura, crearCarpetaPlantillas, guardarPlantillaEditada,
} from '../services/plantillasNube';
import { driveTieneEscritura } from '../utils/googleDrive';
import { driveTieneLectura } from '../utils/googleDrive';
import pool from '../config/database';
import { requireModulePermission } from '../middleware/requireModulePermission';
import { CATALOGO_CAMPOS_MN } from '../data/catalogoCamposMN';
import { CATALOGO_MACROS_BASICAS } from '../data/catalogoMacrosBasicas';
import {
  guardarValores, etiquetaDe, configVariables, vantiaLaConoce, nombreVariablePropia, contextoPlantilla,
  valorVantia, esDeDespacho, esCampoLogo, grupoDe, logoDespachoConAviso, refPlantilla, ajustesDePlantilla,
} from '../services/plantillasDatos';
import { claveCanonica, esNombreMarcador, leerComoDocx, parrafosDePlantilla, camposDePlantilla, reemplazarTextoPlantilla } from '../services/plantillasWord';
import { rutaPlantillaOrg, nombrePlantillaOrg } from '../controllers/filesController';
import path from 'path';

// Ajustes → Mi Despacho → Plantillas (ver services/plantillasNube).
const router = Router();
const esGestor = (req: any) => ['propietario', 'admin'].includes(req.organizacionRol);
const soloGestor = (req: any, res: Response, next: any) =>
  esGestor(req) ? next() : res.status(403).json({ success: false, error: 'Solo el propietario o un administrador.' });
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 50, fields: 120 } });

router.get('/config', requireAuth, async (req: any, res: Response) => {
  try {
    const cfg = await configPlantillas(req.organizacionId);
    const conectados = await proveedoresConectados(req.organizacionId);
    let total: number | null = null;
    let error: string | null = null;
    if (usaNube(cfg)) {
      try { total = (await listarPlantillasNube(req.organizacionId, true)).length; } catch (e: any) { error = e?.message || 'No se pudo leer la carpeta'; }
    }
    const { root } = getDocPlantRoot();
    res.json({
      success: true,
      data: {
        origen: usaNube(cfg) ? cfg.proveedor : 'integradas',
        carpetaUrl: cfg.proveedor === 'drive' && cfg.carpetaId ? `https://drive.google.com/drive/folders/${cfg.carpetaId}` : null,
        carpetaNombre: cfg.carpetaNombre || null,
        // En una carpeta elegida del Drive (no creada por Vantia) no se puede subir desde aquí.
        // Subir/editar: en Dropbox y en la carpeta creada por Vantia siempre; en una
        // carpeta elegida del Drive, con el permiso completo de Drive.
        sePuedeSubir: await puedeEscribir(req.organizacionId, cfg),
        driveEscritura: conectados.drive ? await driveTieneEscritura(req.organizacionId) : false,
        carpetaPropia: cfg.carpetaPropia !== false,
        driveLectura: conectados.drive ? await driveTieneLectura(req.organizacionId) : false,
        carpetaTexto: cfg.proveedor === 'dropbox' ? 'Dropbox › Aplicaciones › (Vantia) › Plantillas' : null,
        total, error, conectados,
        importacion: cfg.importacion || null,
        hayIntegradas: fs.existsSync(root),
        canManage: esGestor(req),
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

router.post('/conectar', requireAuth, soloGestor, async (req: any, res: Response) => {
  const proveedor = req.body?.proveedor === 'dropbox' ? 'dropbox' : 'drive';
  try {
    await conectarCarpeta(req.organizacionId, proveedor);
    logActivityForReq(req, `Plantillas del despacho: carpeta conectada en ${proveedor === 'drive' ? 'Google Drive' : 'Dropbox'}`, 'ORGANIZACION', req.organizacionId).catch(() => {});
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || 'No se pudo conectar la carpeta.' });
  }
});

// Explorador de carpetas de Drive (necesita el permiso de lectura de Drive).
router.get('/drive/carpetas', requireAuth, soloGestor, async (req: any, res: Response) => {
  try {
    if (!(await driveTieneLectura(req.organizacionId))) return res.status(403).json({ success: false, error: 'Falta el permiso de lectura de Google Drive.', code: 'SIN_LECTURA' });
    const padre = String(req.query.padre || 'root');
    res.json({ success: true, data: await carpetasDrive(req.organizacionId, padre) });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudieron leer las carpetas.' });
  }
});

router.post('/elegir-carpeta', requireAuth, soloGestor, async (req: any, res: Response) => {
  try {
    const id = String(req.body?.carpetaId || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'Falta la carpeta.' });
    await elegirCarpetaDrive(req.organizacionId, id, String(req.body?.nombre || ''));
    logActivityForReq(req, `Plantillas del despacho: carpeta de Drive elegida «${String(req.body?.nombre || id).slice(0, 200)}»`, 'ORGANIZACION', req.organizacionId).catch(() => {});
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || 'No se pudo elegir la carpeta.' });
  }
});

router.post('/desconectar', requireAuth, soloGestor, async (req: any, res: Response) => {
  await desconectarCarpeta(req.organizacionId);
  logActivityForReq(req, 'Plantillas del despacho: carpeta desconectada (se usan las integradas)', 'ORGANIZACION', req.organizacionId).catch(() => {});
  res.json({ success: true });
});

// Subir plantillas (.doc / .docx) a la carpeta, opcionalmente a una subcarpeta.
router.post('/subir', requireAuth, soloGestor, subida.array('files', 50), async (req: any, res: Response) => {
  const files = (req.files || []) as Express.Multer.File[];
  if (!(await puedeEscribir(req.organizacionId))) return res.status(403).json({ success: false, error: 'Vantia no tiene permiso para escribir en esa carpeta de Google Drive.', code: 'SIN_ESCRITURA' });
  const carpeta = rutaCarpetaSegura(req.body?.carpeta || '');
  // Al subir una carpeta, cada archivo trae su ruta relativa ("Encargos/Civil").
  const rutas: string[] = ([] as string[]).concat(req.body?.rutas ?? []);
  const cacheDrive = new Map<string, string>();
  const subidas: string[] = [];
  const rechazadas: string[] = [];
  for (const [i, f] of files.entries()) {
    const nombre = Buffer.from(f.originalname, 'latin1').toString('utf8').split(/[\\/]/).pop() || '';
    if (!/\.docx?$/i.test(nombre) || nombre.startsWith('~$')) { rechazadas.push(nombre); continue; }
    const destino = rutaCarpetaSegura([carpeta, rutas[i] || ''].filter(Boolean).join('/'));
    try { await subirPlantilla(req.organizacionId, nombre, f.buffer, destino, cacheDrive); subidas.push(destino ? `${destino}/${nombre}` : nombre); }
    catch (e: any) { return res.status(400).json({ success: false, error: e?.message || 'No se pudo subir.', subidas }); }
  }
  olvidarListado(req.organizacionId);
  if (subidas.length) logActivityForReq(req, `Plantillas subidas: ${subidas.join(', ').slice(0, 300)}`, 'ORGANIZACION', req.organizacionId).catch(() => {});
  res.json({ success: true, data: { subidas, rechazadas } });
});

// Copiar las plantillas integradas a la carpeta del despacho (en segundo plano).
router.post('/importar-integradas', requireAuth, soloGestor, async (req: any, res: Response) => {
  const cfg = await configPlantillas(req.organizacionId);
  if (!usaNube(cfg)) return res.status(400).json({ success: false, error: 'Primero conecta la carpeta de plantillas.' });
  if (cfg.importacion?.estado === 'importando' && Date.now() - new Date(cfg.importacion.at).getTime() < 60 * 60 * 1000) {
    return res.status(409).json({ success: false, error: 'Ya se están importando.' });
  }
  const { root } = getDocPlantRoot();
  if (!fs.existsSync(root)) return res.status(404).json({ success: false, error: 'No hay plantillas integradas en este servidor.' });
  importarIntegradas(req.organizacionId, root).catch((e) => console.error('[plantillas] importar:', e?.message));
  logActivityForReq(req, 'Plantillas del despacho: importación de las integradas iniciada', 'ORGANIZACION', req.organizacionId).catch(() => {});
  res.json({ success: true });
});

// ── Datos para documentos de un expediente ─────────────────────────────────
// Los datos propios del asunto que Vantia no guarda en otro sitio (fichas
// WIZINK, cláusulas, recursos, campos libres...): se rellenan una vez en el
// expediente y los usan todas sus plantillas (tabla plantillas_valores).
async function expedienteDeLaOrg(req: any): Promise<string | null> {
  const id = String(req.params.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await pool.query(`SELECT id FROM expedientes WHERE id = $1 AND organizacion_id = $2`, [id, req.organizacionId]);
  return rows[0]?.id || null;
}

router.get('/datos/:id', requireAuth, requireModulePermission('expedientes'), async (req: any, res: Response) => {
  try {
    const id = await expedienteDeLaOrg(req);
    if (!id) return res.status(404).json({ success: false, error: 'Expediente no encontrado.' });
    const { rows } = await pool.query(
      `SELECT clave, valor, updated_at FROM plantillas_valores WHERE organizacion_id = $1 AND expediente_id = $2`,
      [req.organizacionId, id],
    );
    // Campos que este despacho ya ha usado en otros expedientes (sugerencias)
    const { rows: usados } = await pool.query(
      `SELECT DISTINCT clave FROM plantillas_valores WHERE organizacion_id = $1 AND expediente_id IS NOT NULL`, [req.organizacionId],
    );
    // Variables de documentos del despacho: las propias "de cada expediente"
    // van primero; las desactivadas o con valor fijo no se piden aquí.
    const config = await configVariables(req.organizacionId);
    const propias = [...config.values()]
      .filter((v) => v.propia && v.activa && v.modo === 'expediente')
      .map((v) => ({ grupo: 'Variables del despacho', etiqueta: v.etiqueta || etiquetaDe(v.nombre), nombre: v.nombre, clave: v.clave }));
    const fuera = new Set([...config.values()].filter((v) => !v.activa || v.modo === 'fijo' || v.propia).map((v) => v.clave));
    const enCatalogo = new Set(CATALOGO_CAMPOS_MN.map((c) => c.clave));
    const extra = [...new Set([...rows.map((r) => r.clave), ...usados.map((r) => r.clave)])]
      .filter((k) => !enCatalogo.has(k) && !fuera.has(k))
      .map((k) => ({ grupo: 'Otros datos del expediente', etiqueta: etiquetaDe(k).replace(/_/g, ' '), nombre: k, clave: k }));
    res.json({
      success: true,
      data: {
        campos: [...propias, ...CATALOGO_CAMPOS_MN.filter((c) => !fuera.has(c.clave)), ...extra],
        valores: Object.fromEntries(rows.map((r) => [r.clave, r.valor])),
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

router.put('/datos/:id', requireAuth, requireModulePermission('expedientes'), async (req: any, res: Response) => {
  try {
    const id = await expedienteDeLaOrg(req);
    if (!id) return res.status(404).json({ success: false, error: 'Expediente no encontrado.' });
    const valores = req.body?.valores && typeof req.body.valores === 'object' ? req.body.valores : {};
    const n = Object.keys(valores).length;
    if (!n || n > 500) return res.status(400).json({ success: false, error: 'Nada que guardar.' });
    await guardarValores(req.organizacionId, id, req.auth?.userId || '', valores);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudo guardar.' });
  }
});

// ── Variables de documentos (25/11/2026) ────────────────────────────────────
// Ajustes → Mi Despacho → Variables de documentos: todas las variables que
// pueden llevar las plantillas, de dónde sale cada una, y lo que el despacho
// haya cambiado (desactivar, valor fijo) o creado (variables propias).
// Ver resolverValor en services/plantillasDatos.

const MODOS = ['auto', 'fijo', 'expediente'];
const textoValor = (v: any) => String(v ?? '').slice(0, 5000);

router.get('/variables', requireAuth, async (req: any, res: Response) => {
  try {
    const config = await configVariables(req.organizacionId);
    // Lo que sale hoy de Mi Despacho (sin expediente: los datos del despacho y la fecha).
    const ctx = await contextoPlantilla(req.organizacionId, null, null);
    const { logo } = await logoDespachoConAviso(req.organizacionId);
    const { rows: deDespacho } = await pool.query(
      `SELECT clave, valor FROM plantillas_valores WHERE organizacion_id = $1 AND expediente_id IS NULL`, [req.organizacionId],
    );
    const escritoDespacho = new Map<string, string>(deDespacho.map((r: any) => [r.clave, r.valor]));
    const { rows: porPlantilla } = await pool.query(
      `SELECT clave, COUNT(*)::int AS n FROM plantillas_variables_plantilla WHERE organizacion_id = $1 GROUP BY clave`, [req.organizacionId],
    );
    const enPlantillas = new Map<string, number>(porPlantilla.map((r: any) => [r.clave, r.n]));
    const vistas = new Set<string>();
    const fila = (c: { grupo: string; etiqueta: string; nombre: string; clave: string }, tipo: 'basica' | 'expediente') => {
      vistas.add(c.clave);
      const cfg = config.get(c.clave);
      const despacho = esDeDespacho(c.nombre) || /^FECHA_IMPRESION/.test(c.clave);
      let actual: string | null = null;
      if (despacho) actual = esCampoLogo(c.nombre) ? (logo ? 'logo' : '') : (valorVantia(c.nombre, ctx) || escritoDespacho.get(c.clave) || '');
      return {
        clave: c.clave, nombre: c.nombre, etiqueta: cfg?.etiqueta || c.etiqueta, grupo: c.grupo, tipo,
        automatica: vantiaLaConoce(c.nombre), despacho, imagen: esCampoLogo(c.nombre), actual,
        activa: cfg ? cfg.activa : true, modo: cfg?.modo || 'auto', valor: cfg?.valor ?? '',
        enPlantillas: enPlantillas.get(c.clave) || 0,
      };
    };
    const lista = [
      ...[...config.values()].filter((v) => v.propia).map((v) => ({
        clave: v.clave, nombre: v.nombre, etiqueta: v.etiqueta || etiquetaDe(v.nombre), grupo: 'Variables del despacho', tipo: 'propia',
        automatica: false, despacho: false, imagen: false, actual: null as string | null,
        activa: v.activa, modo: v.modo, valor: v.valor ?? '',
        enPlantillas: enPlantillas.get(v.clave) || 0,
      })),
      ...CATALOGO_MACROS_BASICAS.map((c) => fila(c, 'basica')),
      ...CATALOGO_CAMPOS_MN.filter((c) => !CATALOGO_MACROS_BASICAS.some((b) => b.clave === c.clave))
        .map((c) => fila({ ...c, grupo: `Datos del asunto › ${c.grupo}` }, 'expediente')),
    ];
    // Cambios guardados de variables que no están en los catálogos (plantillas propias).
    for (const v of config.values()) {
      if (v.propia || vistas.has(v.clave)) continue;
      lista.push(fila({ grupo: 'Otras variables', etiqueta: v.etiqueta || etiquetaDe(v.nombre), nombre: v.nombre, clave: v.clave }, 'basica'));
    }
    res.json({ success: true, data: { variables: lista, canManage: esGestor(req) } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudieron cargar las variables.' });
  }
});

/** Activar/desactivar una variable, darle (o quitarle) un valor fijo o cambiar su nombre visible. */
router.put('/variables/:clave', requireAuth, soloGestor, async (req: any, res: Response) => {
  try {
    const b = req.body || {};
    const clave = claveCanonica(String(req.params.clave || ''));
    if (!clave) return res.status(400).json({ success: false, error: 'Variable no válida.' });
    const { rows: ant } = await pool.query(`SELECT * FROM plantillas_variables WHERE organizacion_id = $1 AND clave = $2`, [req.organizacionId, clave]);
    const previa = ant[0];
    const propia = Boolean(previa?.propia);
    const nombre: string = previa?.nombre || String(b.nombre || '').trim().slice(0, 150);
    if (!nombre || claveCanonica(nombre) !== clave) return res.status(400).json({ success: false, error: 'Variable no válida.' });
    const activa = typeof b.activa === 'boolean' ? b.activa : (previa ? previa.activa : true);
    const modo = MODOS.includes(b.modo) ? b.modo : (previa?.modo || 'auto');
    if (!propia && modo === 'expediente') return res.status(400).json({ success: false, error: 'Solo las variables propias se rellenan en cada expediente.' });
    if (propia && modo === 'auto') return res.status(400).json({ success: false, error: 'Variable no válida.' });
    const valor = b.valor !== undefined ? textoValor(b.valor) : (previa?.valor ?? '');
    const etiqueta = b.etiqueta !== undefined ? (String(b.etiqueta).trim().slice(0, 150) || null) : (previa?.etiqueta ?? null);
    if (!propia && activa && modo === 'auto') {
      // Vuelve a como venía: sin fila.
      await pool.query(`DELETE FROM plantillas_variables WHERE organizacion_id = $1 AND clave = $2`, [req.organizacionId, clave]);
    } else {
      await pool.query(
        `INSERT INTO plantillas_variables (organizacion_id, clave, nombre, etiqueta, propia, activa, modo, valor, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (organizacion_id, clave) DO UPDATE SET etiqueta = EXCLUDED.etiqueta, activa = EXCLUDED.activa,
           modo = EXCLUDED.modo, valor = EXCLUDED.valor, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [req.organizacionId, clave, nombre, etiqueta, propia, activa, modo, modo === 'fijo' ? valor : '', req.auth?.userId || ''],
      );
    }
    const estado = !activa ? 'desactivada' : modo === 'fijo' ? 'con valor fijo' : 'activada';
    logActivityForReq(req, `Variable de documentos «${nombre}» ${estado}`, 'ORGANIZACION', req.organizacionId).catch(() => {});
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudo guardar la variable.' });
  }
});

/** Crear una variable propia del despacho. */
router.post('/variables', requireAuth, soloGestor, async (req: any, res: Response) => {
  try {
    const b = req.body || {};
    const nombre = nombreVariablePropia(b.nombre || b.etiqueta || '');
    const clave = claveCanonica(nombre);
    if (!clave || clave.length > 120) return res.status(400).json({ success: false, error: 'Escribe un nombre para la variable.' });
    // No puede pisar una variable que ya rellena Vantia o que viene de MN.
    if (vantiaLaConoce(nombre) || grupoDe(clave).grupo !== 'Otros'
      || CATALOGO_MACROS_BASICAS.some((c) => c.clave === clave) || CATALOGO_CAMPOS_MN.some((c) => c.clave === clave)) {
      return res.status(409).json({ success: false, error: 'Ese nombre ya lo usa una variable de las plantillas. Elige otro.' });
    }
    const modo = b.modo === 'expediente' ? 'expediente' : 'fijo';
    const etiqueta = String(b.etiqueta || '').trim().slice(0, 150) || etiquetaDe(nombre);
    const { rows } = await pool.query(
      `INSERT INTO plantillas_variables (organizacion_id, clave, nombre, etiqueta, propia, activa, modo, valor, updated_by)
       VALUES ($1, $2, $3, $4, TRUE, TRUE, $5, $6, $7)
       ON CONFLICT (organizacion_id, clave) DO NOTHING RETURNING clave`,
      [req.organizacionId, clave, nombre, etiqueta, modo, modo === 'fijo' ? textoValor(b.valor) : '', req.auth?.userId || ''],
    );
    if (!rows[0]) return res.status(409).json({ success: false, error: 'Ya existe una variable con ese nombre.' });
    logActivityForReq(req, `Variable de documentos creada: «${nombre}»`, 'ORGANIZACION', req.organizacionId).catch(() => {});
    res.json({ success: true, data: { clave, nombre } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudo crear la variable.' });
  }
});

/** Borrar una variable propia, o devolver una de las plantillas a como venía. */
router.delete('/variables/:clave', requireAuth, soloGestor, async (req: any, res: Response) => {
  try {
    const clave = claveCanonica(String(req.params.clave || ''));
    const { rows } = await pool.query(
      `DELETE FROM plantillas_variables WHERE organizacion_id = $1 AND clave = $2 RETURNING nombre, propia`, [req.organizacionId, clave],
    );
    if (rows[0]) {
      logActivityForReq(req, rows[0].propia ? `Variable de documentos borrada: «${rows[0].nombre}»` : `Variable de documentos «${rows[0].nombre}» como venía`, 'ORGANIZACION', req.organizacionId).catch(() => {});
    }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudo borrar la variable.' });
  }
});

/** Ajuste de una variable solo en una plantilla: 'general' (quitar el ajuste),
 *  'off' (desactivada aquí), 'on' (activa aquí aunque en general no) o 'fijo'. */
router.put('/variables-plantilla', requireAuth, soloGestor, async (req: any, res: Response) => {
  try {
    const b = req.body || {};
    const plantilla = refPlantilla(b.plantilla);
    const nombre = String(b.nombre || '').trim().slice(0, 150);
    const clave = claveCanonica(nombre);
    const estado = ['general', 'on', 'off', 'fijo', 'dato'].includes(b.estado) ? b.estado : null;
    if (!plantilla || !clave || !estado) return res.status(400).json({ success: false, error: 'Variable no válida.' });
    // 'dato': se rellena con otra variable (la que se elige en el editor).
    const origenDato = estado === 'dato' ? String(b.valor || '').trim().slice(0, 150) : '';
    if (estado === 'dato' && (!esNombreMarcador(origenDato) || claveCanonica(origenDato) === clave)) {
      return res.status(400).json({ success: false, error: 'Elige con qué dato se rellena.' });
    }
    if (estado === 'general') {
      await pool.query(`DELETE FROM plantillas_variables_plantilla WHERE organizacion_id = $1 AND plantilla = $2 AND clave = $3`, [req.organizacionId, plantilla, clave]);
    } else {
      await pool.query(
        `INSERT INTO plantillas_variables_plantilla (organizacion_id, plantilla, clave, nombre, estado, valor, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (organizacion_id, plantilla, clave) DO UPDATE SET estado = EXCLUDED.estado, valor = EXCLUDED.valor,
           updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [req.organizacionId, plantilla, clave, nombre, estado, estado === 'fijo' ? textoValor(b.valor) : estado === 'dato' ? origenDato : null, req.auth?.userId || ''],
      );
    }
    const que = estado === 'general' ? 'como en general' : estado === 'off' ? 'desactivada' : estado === 'on' ? 'activada' : estado === 'dato' ? `rellenada con «${origenDato}»` : 'con valor propio';
    logActivityForReq(req, `Plantilla «${plantilla.split('/').pop()}»: variable «${nombre}» ${que}`, 'ORGANIZACION', req.organizacionId).catch(() => {});
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudo guardar la variable.' });
  }
});

// ── Explorador y editor de plantillas (Ajustes → Plantillas del despacho) ────

/** Todas las plantillas del despacho, con su carpeta (para el explorador). */
router.get('/lista', requireAuth, soloGestor, async (req: any, res: Response) => {
  try {
    const cfg = await configPlantillas(req.organizacionId);
    if (usaNube(cfg)) {
      const lista = await listarPlantillasNube(req.organizacionId, req.query.refrescar === '1');
      return res.json({ success: true, data: { origen: cfg.proveedor, plantillas: lista.map((p) => ({ ref: p.ref, nombre: p.nombre, carpeta: p.carpeta, ext: p.ext })) } });
    }
    const { root } = getDocPlantRoot();
    const plantillas: { ref: string; nombre: string; carpeta: string; ext: string }[] = [];
    (function recorrer(dir: string, rel: string) {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) recorrer(path.join(dir, e.name), r);
        else if (/\.docx?$/i.test(e.name) && !e.name.startsWith('~$')) plantillas.push({ ref: r, nombre: e.name, carpeta: rel, ext: path.extname(e.name).toLowerCase() });
      }
    })(root, '');
    res.json({ success: true, data: { origen: 'integradas', plantillas } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudieron leer las plantillas.' });
  }
});

router.post('/carpeta', requireAuth, soloGestor, async (req: any, res: Response) => {
  try {
    const ruta = rutaCarpetaSegura(req.body?.ruta || '');
    if (!ruta) return res.status(400).json({ success: false, error: 'Escribe el nombre de la carpeta.' });
    if (!(await puedeEscribir(req.organizacionId))) return res.status(403).json({ success: false, error: 'Vantia no tiene permiso para escribir en esa carpeta de Google Drive.', code: 'SIN_ESCRITURA' });
    await crearCarpetaPlantillas(req.organizacionId, ruta);
    logActivityForReq(req, `Plantillas: carpeta «${ruta}» creada`, 'ORGANIZACION', req.organizacionId).catch(() => {});
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e?.message || 'No se pudo crear la carpeta.' });
  }
});

/** Lo que muestra el editor: el texto, las variables y cómo se rellena cada una. */
async function datosEditor(req: any, ref: string) {
  const ruta = await rutaPlantillaOrg(req.organizacionId, ref);
  if (!ruta) return null;
  const docx = await leerComoDocx(ruta);
  const nombres = camposDePlantilla(docx);
  const config = await configVariables(req.organizacionId);
  const ajustes = await ajustesDePlantilla(req.organizacionId, ref);
  const nube = ref.startsWith('nube:');
  const escribir = nube && (await puedeEscribir(req.organizacionId));
  return {
    ref,
    nombre: await nombrePlantillaOrg(req.organizacionId, ref),
    ext: path.extname(ruta).toLowerCase(),
    editable: escribir,
    motivo: escribir ? null : nube ? 'sin_permiso' : 'integrada',
    parrafos: parrafosDePlantilla(docx),
    campos: nombres.map((nombre) => {
      const clave = claveCanonica(nombre);
      const cfg = config.get(clave);
      const a = ajustes.get(clave);
      return {
        nombre, clave,
        etiqueta: cfg?.etiqueta || etiquetaDe(nombre),
        grupo: cfg?.propia ? 'Variables del despacho' : grupoDe(clave).grupo,
        conoceVantia: esCampoLogo(nombre) || (!cfg?.propia && vantiaLaConoce(nombre)),
        imagen: esCampoLogo(nombre),
        general: cfg ? { activa: cfg.activa, modo: cfg.modo, valor: cfg.valor ?? '', propia: cfg.propia } : null,
        enPlantilla: a ? { estado: a.estado, valor: a.valor ?? '' } : null,
      };
    }),
  };
}

router.get('/editor', requireAuth, soloGestor, async (req: any, res: Response) => {
  try {
    const d = await datosEditor(req, String(req.query.path || ''));
    if (!d) return res.status(404).json({ success: false, error: 'Plantilla no encontrada.' });
    res.json({ success: true, data: d });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudo abrir la plantilla.' });
  }
});

// Una edición a la vez por plantilla (dos clics seguidos o dos personas):
// cada una lee la versión que dejó la anterior.
const colas = new Map<string, Promise<unknown>>();
function enCola<T>(clave: string, fn: () => Promise<T>): Promise<T> {
  const previa = colas.get(clave) || Promise.resolve();
  const sig = previa.catch(() => undefined).then(fn);
  colas.set(clave, sig);
  sig.finally(() => { if (colas.get(clave) === sig) colas.delete(clave); }).catch(() => undefined);
  return sig;
}

/** Convertir un trozo de texto en variable ('marcar') o una variable en texto ('quitar'). */
router.post('/editor/texto', requireAuth, soloGestor, async (req: any, res: Response) => {
  const b = req.body || {};
  const ref = String(b.path || '');
  if (!ref.startsWith('nube:')) {
    return res.status(400).json({ success: false, error: 'Las plantillas integradas de Vantia son comunes a todos los despachos. Copiadlas a vuestra carpeta para poder editarlas.' });
  }
  try {
    if (!(await puedeEscribir(req.organizacionId))) return res.status(403).json({ success: false, error: 'Vantia no tiene permiso para escribir en esa carpeta de Google Drive.', code: 'SIN_ESCRITURA' });
    const esperado = String(b.esperado || '');
    let nuevo: string;
    if (b.accion === 'marcar') {
      const nombre = nombreVariablePropia(String(b.nombre || ''));
      if (!esNombreMarcador(nombre)) return res.status(400).json({ success: false, error: 'Nombre de variable no válido.' });
      if (/[«»]/.test(esperado)) return res.status(400).json({ success: false, error: 'El texto elegido ya contiene una variable.' });
      nuevo = `«${nombre}»`;
    } else if (b.accion === 'quitar') {
      if (!/^«[^«»]+»$/.test(esperado)) return res.status(400).json({ success: false, error: 'Eso no es una variable.' });
      nuevo = String(b.texto ?? '').replace(/[«»]/g, '').slice(0, 2000);
    } else {
      return res.status(400).json({ success: false, error: 'Acción no válida.' });
    }
    const nuevoRef = await enCola(`${req.organizacionId}|${ref}`, async () => {
      const ruta = await rutaPlantillaOrg(req.organizacionId, ref);
      if (!ruta) throw Object.assign(new Error('Plantilla no encontrada.'), { status: 404 });
      const docx = await leerComoDocx(ruta);
      const r = reemplazarTextoPlantilla(docx, {
        parte: String(b.parte || ''), parrafo: Number(b.parrafo), desde: Number(b.desde), hasta: Number(b.hasta),
        esperado, nuevo, todas: !!b.todas,
      });
      if (!r.cambios) throw Object.assign(new Error('No se ha cambiado nada.'), { status: 400 });
      return guardarPlantillaEditada(req.organizacionId, ref, r.docx);
    });
    const nombrePl = await nombrePlantillaOrg(req.organizacionId, nuevoRef);
    logActivityForReq(req, b.accion === 'marcar'
      ? `Plantilla «${nombrePl}»: «${esperado.slice(0, 80)}» pasa a ser la variable ${nuevo}`
      : `Plantilla «${nombrePl}»: variable ${esperado} quitada`, 'ORGANIZACION', req.organizacionId).catch(() => {});
    const d = await datosEditor(req, nuevoRef);
    res.json({ success: true, data: d });
  } catch (e: any) {
    const status = e?.status || (/ha cambiado|Selecciona/.test(e?.message || '') ? 409 : 500);
    res.status(status).json({ success: false, error: e?.message || 'No se pudo guardar la plantilla.' });
  }
});

export default router;
