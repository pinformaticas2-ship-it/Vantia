import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireModulePermission } from '../middleware/requireModulePermission';
import { costlyActionLimiter } from '../middleware/rateLimits';
import {
  listarDocumentos, verDocumento, crearDocumento, actualizarDocumento, borrarDocumento,
  exportarDocx, guardarEnExpediente, generarConIa,
} from '../controllers/documentosController';

// Documentos (editor de texto de Vantia). Mismo permiso que el módulo
// Documental: ver = lectura, crear/editar = edición.
const router = Router();
router.use(requireAuth, requireModulePermission('documental'));

router.get('/', listarDocumentos);
router.post('/', crearDocumento);
router.post('/generar', costlyActionLimiter, generarConIa);
router.get('/:id', verDocumento);
router.put('/:id', actualizarDocumento);
router.delete('/:id', borrarDocumento);
router.get('/:id/docx', exportarDocx);
router.post('/:id/guardar-en-expediente', guardarEnExpediente);

export default router;
