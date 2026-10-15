import { Router, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import { requireAuth } from '../middleware/auth';
import { getDocPlantRoot } from '../controllers/filesController';
import { logActivityForReq } from '../controllers/activityController';
import {
  configPlantillas, usaNube, listarPlantillasNube, conectarCarpeta, desconectarCarpeta,
  subirPlantilla, importarIntegradas, proveedoresConectados, olvidarListado,
} from '../services/plantillasNube';

// Ajustes → Mi Despacho → Plantillas (ver services/plantillasNube).
const router = Router();
const esGestor = (req: any) => ['propietario', 'admin'].includes(req.organizacionRol);
const soloGestor = (req: any, res: Response, next: any) =>
  esGestor(req) ? next() : res.status(403).json({ success: false, error: 'Solo el propietario o un administrador.' });
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 50 } });

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

router.post('/desconectar', requireAuth, soloGestor, async (req: any, res: Response) => {
  await desconectarCarpeta(req.organizacionId);
  logActivityForReq(req, 'Plantillas del despacho: carpeta desconectada (se usan las integradas)', 'ORGANIZACION', req.organizacionId).catch(() => {});
  res.json({ success: true });
});

// Subir plantillas (.doc / .docx) a la carpeta, opcionalmente a una subcarpeta.
router.post('/subir', requireAuth, soloGestor, subida.array('files', 50), async (req: any, res: Response) => {
  const files = (req.files || []) as Express.Multer.File[];
  const carpeta = String(req.body?.carpeta || '').replace(/[\\:*?"<>|]/g, '').slice(0, 200);
  const subidas: string[] = [];
  const rechazadas: string[] = [];
  for (const f of files) {
    const nombre = Buffer.from(f.originalname, 'latin1').toString('utf8');
    if (!/\.docx?$/i.test(nombre)) { rechazadas.push(nombre); continue; }
    try { await subirPlantilla(req.organizacionId, nombre, f.buffer, carpeta); subidas.push(nombre); }
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

export default router;
