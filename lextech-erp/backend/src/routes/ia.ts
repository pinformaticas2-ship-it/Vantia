import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { vantiaLimiter } from '../middleware/rateLimits';
import { iaJson } from '../controllers/iaController';

const router = Router();
// Cada llamada cuesta cupo de Gemini: mismo límite por usuario que VantIA.
router.post('/json', requireAuth, vantiaLimiter, iaJson);
export default router;
