import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getExpedientes,
  getStats,
  getContrarioSuggestions,
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
  linkExpedienteCliente,
  deleteExpediente,
  getExpedienteHistorial,
  getCounterConfig,
  getCounterConfigYear,
  setCounterConfig,
} from '../controllers/expedientesController';
import {
  listNotificaciones,
  listNotificacionesPendientes,
  createNotificacion,
  updateNotificacion,
  deleteNotificacion,
} from '../controllers/notificacionesController';
import {
  listApuntes,
  createApunte,
  updateApunte,
  deleteApunte,
} from '../controllers/apuntesController';
import { getEmailsByExpediente } from '../controllers/emailController';
import { getConversacionesExpediente } from '../controllers/chatController';
import noteRoutes from './noteRoutes';

const router = Router();

router.get('/stats',  requireAuth, getStats);
router.get('/contrarios', requireAuth, getContrarioSuggestions);
router.get('/counter-config',        requireAuth, getCounterConfig);
router.get('/counter-config/:anio',  requireAuth, getCounterConfigYear);
router.post('/counter-config',       requireAuth, setCounterConfig);
router.get('/imports', requireAuth, getImportHistory);
router.get('/imports/:id', requireAuth, getImportBatchDetail);
router.get('/notificaciones/pendientes', requireAuth, listNotificacionesPendientes);
router.use('/:id/notes', noteRoutes);
router.get('/:id/related', requireAuth, getRelatedExpedientes);
router.post('/:id/related', requireAuth, addRelatedExpediente);
router.delete('/:id/related/:relatedId', requireAuth, removeRelatedExpediente);
router.get('/',       requireAuth, getExpedientes);
router.post('/imports', requireAuth, createImportBatch);
router.patch('/imports/:id', requireAuth, updateImportBatch);
router.post('/',      requireAuth, createExpediente);
router.get('/:id/historial', requireAuth, getExpedienteHistorial);
router.get('/:id',    requireAuth, getExpediente);
router.put('/:id',    requireAuth, updateExpediente);
router.patch('/:id/cliente', requireAuth, linkExpedienteCliente);
router.delete('/:id', requireAuth, deleteExpediente);

router.get('/:id/notificaciones',          requireAuth, listNotificaciones);
router.post('/:id/notificaciones',         requireAuth, createNotificacion);
router.put('/:id/notificaciones/:nid',     requireAuth, updateNotificacion);
router.delete('/:id/notificaciones/:nid',  requireAuth, deleteNotificacion);

router.get('/:id/emails',                 requireAuth, getEmailsByExpediente);
router.get('/:id/conversaciones',         requireAuth, getConversacionesExpediente);
router.get('/:id/apuntes',                requireAuth, listApuntes);
router.post('/:id/apuntes',               requireAuth, createApunte);
router.put('/:id/apuntes/:apunteId',      requireAuth, updateApunte);
router.delete('/:id/apuntes/:apunteId',   requireAuth, deleteApunte);

export default router;
