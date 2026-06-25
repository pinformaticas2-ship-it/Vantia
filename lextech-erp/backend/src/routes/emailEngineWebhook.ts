import { Router } from 'express';
import { handleEngineWebhook } from '../controllers/emailEngineWebhookController';

const router = Router();
router.post('/', handleEngineWebhook);

export default router;
