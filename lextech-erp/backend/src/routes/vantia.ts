import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { vantiaLimiter } from '../middleware/rateLimits';
import {
  chatVantia, chatVantiaStream, getChatHistory, clearChatHistory,
  listConversations, deleteConversation, submitFeedback,
  confirmVantiaAction, cancelVantiaAction, getVantiaUsage,
} from '../controllers/vantiaController';

const router = Router();

router.get('/conversations',          requireAuth, listConversations);
router.delete('/conversations/:id',   requireAuth, deleteConversation);
router.get('/chat/history',           requireAuth, getChatHistory);
router.delete('/chat/history',        requireAuth, clearChatHistory);
router.post('/chat',                  requireAuth, vantiaLimiter, chatVantia);
router.post('/chat/stream',           requireAuth, vantiaLimiter, chatVantiaStream);
router.post('/feedback',              requireAuth, submitFeedback);
router.get('/usage',                  requireAuth, getVantiaUsage);
router.post('/actions/:token/confirm', requireAuth, vantiaLimiter, confirmVantiaAction);
router.post('/actions/:token/cancel',  requireAuth, cancelVantiaAction);

export default router;
