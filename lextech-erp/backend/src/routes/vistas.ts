import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { costlyActionLimiter } from '../middleware/rateLimits';
import {
  getVistasConfig,
  updateVistasConfig,
  previewVistasConfigCorreo,
  listVistas,
  getVistasAvisos,
  getVista,
  getVistaConflictos,
  previewVistaCorreo,
  aceptarVista,
  rechazarVista,
  descartarVista,
  reabrirVista,
  cancelarVista,
  aplicarCancelacionVista,
  downloadVistaAdjunto,
  documentarVista,
  modificarVista,
} from '../controllers/vistasController';

// La visibilidad de cada solicitud la decide el propio controlador
// (propietario/admin, abogado responsable o dueño del buzón vigilado), no la
// matriz de permisos por módulo: es un flujo transversal que toca Correo,
// Expedientes y Agenda a la vez.
const router = Router();
router.use(requireAuth);

router.get('/config', getVistasConfig);
router.put('/config', updateVistasConfig);
router.post('/config/preview', previewVistasConfigCorreo);
router.get('/', listVistas);
router.get('/avisos', getVistasAvisos);
router.get('/:id', getVista);
router.get('/:id/conflictos', getVistaConflictos);
router.get('/:id/adjuntos/:index', downloadVistaAdjunto);
router.post('/:id/preview', previewVistaCorreo);
router.post('/:id/aceptar', costlyActionLimiter, aceptarVista);
router.post('/:id/rechazar', costlyActionLimiter, rechazarVista);
router.post('/:id/documentar', costlyActionLimiter, documentarVista);
router.post('/:id/modificar', costlyActionLimiter, modificarVista);
router.post('/:id/descartar', descartarVista);
router.post('/:id/reabrir', reabrirVista);
router.post('/:id/cancelar', cancelarVista);
router.post('/:id/aplicar-cancelacion', costlyActionLimiter, aplicarCancelacionVista);

export default router;
