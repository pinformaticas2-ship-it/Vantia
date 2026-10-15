import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireModulePermission } from '../middleware/requireModulePermission';
import pool from '../config/database';
import { DOCS_BASE, TipoDocBase, asegurarDocsBase, docsBaseActivos, estadoDocsBase, generarDocBase } from '../services/docsBaseExpediente';
import { logActivityForReq } from '../controllers/activityController';

// Documentos base de cada expediente (ver services/docsBaseExpediente).
const router = Router();
const esGestor = (req: any) => ['propietario', 'admin'].includes(req.organizacionRol);

// Ajustes → Automatizaciones: encender/apagar para la organización.
router.get('/config', requireAuth, async (req: any, res: Response) => {
  res.json({ success: true, data: { activo: await docsBaseActivos(req.organizacionId), canManage: esGestor(req) } });
});
router.put('/config', requireAuth, async (req: any, res: Response) => {
  if (!esGestor(req)) return res.status(403).json({ success: false, error: 'Solo el propietario o un administrador.' });
  const activo = Boolean(req.body?.activo);
  await pool.query(
    `UPDATE organizaciones SET docs_base_config = COALESCE(docs_base_config, '{}'::jsonb) || jsonb_build_object('activo', $2::boolean) WHERE id = $1`,
    [req.organizacionId, activo],
  );
  logActivityForReq(req, `Documentos base de expedientes ${activo ? 'activados' : 'desactivados'}`, 'ORGANIZACION', req.organizacionId).catch(() => {});
  res.json({ success: true, data: { activo, canManage: true } });
});

async function expedienteDeLaOrg(req: any): Promise<string | null> {
  const id = String(req.params.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await pool.query(`SELECT id FROM expedientes WHERE id = $1 AND organizacion_id = $2`, [id, req.organizacionId]);
  return rows[0]?.id || null;
}

// Estado de los documentos del expediente; si faltan, se generan (los que ya
// existían antes de activar la automatización, la primera vez que se abren).
router.get('/expedientes/:id', requireAuth, requireModulePermission('expedientes'), async (req: any, res: Response) => {
  try {
    const id = await expedienteDeLaOrg(req);
    if (!id) return res.status(404).json({ success: false, error: 'Expediente no encontrado.' });
    const activo = await docsBaseActivos(req.organizacionId);
    if (activo) await asegurarDocsBase(req.organizacionId, id, req.auth?.userId || 'SYSTEM');
    res.json({ success: true, data: { activo, docs: activo ? await estadoDocsBase(req.organizacionId, id) : [] } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message });
  }
});

// Volver a generar uno (con otra plantilla o con datos escritos a mano).
router.post('/expedientes/:id/:tipo', requireAuth, requireModulePermission('expedientes'), async (req: any, res: Response) => {
  const tipo = req.params.tipo as TipoDocBase;
  if (!DOCS_BASE.some((d) => d.tipo === tipo)) return res.status(400).json({ success: false, error: 'Documento desconocido.' });
  try {
    const id = await expedienteDeLaOrg(req);
    if (!id) return res.status(404).json({ success: false, error: 'Expediente no encontrado.' });
    await pool.query(
      `INSERT INTO expediente_docs_base (organizacion_id, expediente_id, tipo, estado) VALUES ($1, $2, $3, 'generando')
       ON CONFLICT (expediente_id, tipo) DO UPDATE SET estado = 'generando', error = NULL, updated_at = NOW()`,
      [req.organizacionId, id, tipo],
    );
    const plantilla = typeof req.body?.plantilla === 'string' ? req.body.plantilla : undefined;
    const valores = req.body?.valores && typeof req.body.valores === 'object' ? req.body.valores : undefined;
    try {
      await generarDocBase({ organizacionId: req.organizacionId, expedienteId: id, tipo, userId: req.auth?.userId || 'SYSTEM', plantilla, valores });
    } catch (e: any) {
      await pool.query(`UPDATE expediente_docs_base SET estado = 'error', error = $3, updated_at = NOW() WHERE expediente_id = $1 AND tipo = $2`, [id, tipo, String(e?.message || e).slice(0, 500)]);
      throw e;
    }
    const nombre = DOCS_BASE.find((d) => d.tipo === tipo)!.nombre;
    logActivityForReq(req, `Documento generado: ${nombre}`, 'EXPEDIENTE', id).catch(() => {});
    res.json({ success: true, data: { activo: true, docs: await estadoDocsBase(req.organizacionId, id) } });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'No se pudo generar el documento.' });
  }
});

export default router;
