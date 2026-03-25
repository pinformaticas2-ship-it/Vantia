import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { chatVantia, getChatHistory } from '../controllers/vantiaController';

const router = Router();

router.get('/chat/history', requireAuth, getChatHistory);
router.post('/chat', requireAuth, chatVantia);

export default router;
