import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getExpedientes,
  getStats,
  getImportHistory,
  getImportBatchDetail,
  getExpediente,
  getRelatedExpedientes,
  addRelatedExpediente,
  removeRelatedExpediente,
  createImportBatch,
  createExpediente,
  updateImportBatch,
  updateExpediente,
  deleteExpediente,
} from '../controllers/expedientesController';
import {
  listNotificaciones,
  createNotificacion,
  updateNotificacion,
  deleteNotificacion,
} from '../controllers/notificacionesController';
import noteRoutes from './noteRoutes';

const router = Router();

router.get('/stats',  requireAuth, getStats);
router.get('/imports', requireAuth, getImportHistory);
router.get('/imports/:id', requireAuth, getImportBatchDetail);
router.use('/:id/notes', noteRoutes);
router.get('/:id/related', requireAuth, getRelatedExpedientes);
router.post('/:id/related', requireAuth, addRelatedExpediente);
router.delete('/:id/related/:relatedId', requireAuth, removeRelatedExpediente);
router.get('/',       requireAuth, getExpedientes);
router.post('/imports', requireAuth, createImportBatch);
router.patch('/imports/:id', requireAuth, updateImportBatch);
router.post('/',      requireAuth, createExpediente);
router.get('/:id',    requireAuth, getExpediente);
router.put('/:id',    requireAuth, updateExpediente);
router.delete('/:id', requireAuth, deleteExpediente);

router.get('/:id/notificaciones',          requireAuth, listNotificaciones);
router.post('/:id/notificaciones',         requireAuth, createNotificacion);
router.put('/:id/notificaciones/:nid',     requireAuth, updateNotificacion);
router.delete('/:id/notificaciones/:nid',  requireAuth, deleteNotificacion);

export default router;
