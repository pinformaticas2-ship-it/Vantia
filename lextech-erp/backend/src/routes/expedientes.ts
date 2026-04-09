import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getExpedientes,
  getStats,
  getImportHistory,
  getImportBatchDetail,
  getExpediente,
  createImportBatch,
  createExpediente,
  updateImportBatch,
  updateExpediente,
  deleteExpediente,
} from '../controllers/expedientesController';

const router = Router();

router.get('/stats',  requireAuth, getStats);
router.get('/imports', requireAuth, getImportHistory);
router.get('/imports/:id', requireAuth, getImportBatchDetail);
router.get('/',       requireAuth, getExpedientes);
router.post('/imports', requireAuth, createImportBatch);
router.patch('/imports/:id', requireAuth, updateImportBatch);
router.post('/',      requireAuth, createExpediente);
router.get('/:id',    requireAuth, getExpediente);
router.put('/:id',    requireAuth, updateExpediente);
router.delete('/:id', requireAuth, deleteExpediente);

export default router;
