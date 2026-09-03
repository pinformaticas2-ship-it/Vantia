import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { publicFormLimiter } from '../middleware/rateLimits';
import { getPushConfig, subscribePush, unsubscribePush, dismissPlazoPush } from '../controllers/pushController';

const router = Router();

router.get('/config', requireAuth, getPushConfig);
router.post('/subscribe', requireAuth, subscribePush);
router.post('/unsubscribe', requireAuth, unsubscribePush);
// Sin requireAuth a propósito: lo llama el service worker desde el botón
// "No volver a avisar" del aviso push, autorizado por su propio token de un
// solo uso -- ver dismissPlazoPush.
router.post('/dismiss-plazo', publicFormLimiter, dismissPlazoPush);

export default router;
