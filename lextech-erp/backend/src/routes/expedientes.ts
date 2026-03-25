import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getExpedientes,
  getStats,
  getExpediente,
  createExpediente,
  updateExpediente,
  deleteExpediente,
} from '../controllers/expedientesController';

const router = Router();

router.get('/stats',  requireAuth, getStats);
router.get('/',       requireAuth, getExpedientes);
router.get('/:id',    requireAuth, getExpediente);
router.post('/',      requireAuth, createExpediente);
router.put('/:id',    requireAuth, updateExpediente);
router.delete('/:id', requireAuth, deleteExpediente);

export default router;
