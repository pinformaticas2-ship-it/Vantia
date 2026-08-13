import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  chatVantia, chatVantiaStream, getChatHistory, clearChatHistory,
  listConversations, deleteConversation, submitFeedback, diagRelay,
} from '../controllers/vantiaController';

const router = Router();

router.get('/conversations',          requireAuth, listConversations);
router.delete('/conversations/:id',   requireAuth, deleteConversation);
router.get('/chat/history',           requireAuth, getChatHistory);
router.delete('/chat/history',        requireAuth, clearChatHistory);
router.post('/chat',                  requireAuth, chatVantia);
router.post('/chat/stream',           requireAuth, chatVantiaStream);
router.post('/feedback',              requireAuth, submitFeedback);
router.get('/diag-relay',             diagRelay); // temporal, sin auth -- ver comentario en el controller

export default router;
