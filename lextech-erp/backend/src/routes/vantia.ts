import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { chatVantia, getChatHistory, listConversations, deleteConversation } from '../controllers/vantiaController';

const router = Router();

router.get('/conversations',          requireAuth, listConversations);
router.delete('/conversations/:id',   requireAuth, deleteConversation);
router.get('/chat/history',           requireAuth, getChatHistory);
router.post('/chat',                  requireAuth, chatVantia);

export default router;
