import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireModulePermission } from '../middleware/requireModulePermission';
import { publicFormLimiter } from '../middleware/rateLimits';
import { getPlaudStatus, connectPlaud, disconnectPlaud, receivePlaudWebhook } from '../controllers/plaudController';

const router = Router();

// ── Autenticado: conectar/desconectar un expediente concreto ───────────────
router.get('/expedientes/:id/status', requireAuth, requireModulePermission('expedientes'), getPlaudStatus);
router.post('/expedientes/:id/connect', requireAuth, requireModulePermission('expedientes'), connectPlaud);
router.delete('/expedientes/:id/connect', requireAuth, requireModulePermission('expedientes'), disconnectPlaud);

// ── Público: lo llama Zapier, protegido por el token de la URL ─────────────
router.post('/webhook/:token', publicFormLimiter, receivePlaudWebhook);

export default router;
