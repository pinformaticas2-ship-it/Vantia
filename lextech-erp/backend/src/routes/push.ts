import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { publicFormLimiter } from '../middleware/rateLimits';
import { getPushConfig, subscribePush, unsubscribePush, dismissPlazoPush, getAvisoPrefs, putAvisoPrefs, testPush, getDescartados, addDescartados } from '../controllers/pushController';

const router = Router();

router.get('/config', requireAuth, getPushConfig);
router.post('/subscribe', requireAuth, subscribePush);
router.post('/unsubscribe', requireAuth, unsubscribePush);
router.get('/preferencias', requireAuth, getAvisoPrefs);
router.put('/preferencias', requireAuth, putAvisoPrefs);
router.post('/prueba', requireAuth, testPush);
router.get('/descartados', requireAuth, getDescartados);
router.post('/descartados', requireAuth, addDescartados);
// Sin requireAuth a propósito: lo llama el service worker desde el botón
// "No volver a avisar" del aviso push, autorizado por su propio token de un
// solo uso -- ver dismissPlazoPush.
router.post('/dismiss-plazo', publicFormLimiter, dismissPlazoPush);

export default router;
