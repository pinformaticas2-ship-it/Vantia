import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  disconnectQuipu,
  getQuipuStatus,
  saveQuipuCredentials,
  syncQuipuBootstrap,
} from '../controllers/quipuController';

const router = Router();

router.get('/status', requireAuth, getQuipuStatus);
router.post('/connect', requireAuth, saveQuipuCredentials);
router.post('/sync', requireAuth, syncQuipuBootstrap);
router.delete('/disconnect', requireAuth, disconnectQuipu);

export default router;
