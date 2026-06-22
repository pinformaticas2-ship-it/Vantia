import { Router } from 'express';
import { handleEngineWebhook } from '../controllers/emailEngineWebhookController';

const router = Router();

// No Clerk auth — EmailEngine calls this directly
router.post('/', handleEngineWebhook);

export default router;
