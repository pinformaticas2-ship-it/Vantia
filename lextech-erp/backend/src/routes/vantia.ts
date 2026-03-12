import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { chatVantia } from '../controllers/vantiaController';

const router = Router();

router.post('/chat', requireAuth, chatVantia);

export default router;
