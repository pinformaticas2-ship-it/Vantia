import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getTasks,
  createTask,
  updateTask,
  patchTaskEstado,
  deleteTask,
  getIndicators,
} from '../controllers/tasksController';

const router = Router();

router.get('/indicators/:clientId', requireAuth, getIndicators);
router.get('/client/:clientId',     requireAuth, getTasks);
router.post('/client/:clientId',    requireAuth, createTask);
router.put('/:id',                  requireAuth, updateTask);
router.patch('/:id/estado',         requireAuth, patchTaskEstado);
router.delete('/:id',               requireAuth, deleteTask);

export default router;
