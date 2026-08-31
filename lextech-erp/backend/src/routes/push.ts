import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getPushConfig, subscribePush, unsubscribePush } from '../controllers/pushController';

const router = Router();

router.get('/config', requireAuth, getPushConfig);
router.post('/subscribe', requireAuth, subscribePush);
router.post('/unsubscribe', requireAuth, unsubscribePush);

export default router;
