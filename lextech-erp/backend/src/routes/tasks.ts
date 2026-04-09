import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getTasks,
  getMyTasks,
  createTask,
  updateTask,
  patchTaskEstado,
  deleteTask,
  getIndicators,
  getEtapas,
  createEtapa,
} from '../controllers/tasksController';

const router = Router();

// ── Etapas (antes de rutas con :id) ──────────────────────────────
router.get('/etapas',               requireAuth, getEtapas);
router.post('/etapas',              requireAuth, createEtapa);

router.get('/me',                   requireAuth, getMyTasks);
router.get('/indicators/:clientId', requireAuth, getIndicators);
router.get('/client/:clientId',     requireAuth, getTasks);
router.post('/client/:clientId',    requireAuth, createTask);
router.put('/:id',                  requireAuth, updateTask);
router.patch('/:id/estado',         requireAuth, patchTaskEstado);
router.delete('/:id',               requireAuth, deleteTask);

export default router;
