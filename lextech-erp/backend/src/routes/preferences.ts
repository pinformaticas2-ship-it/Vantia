import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getMyPreferences, updateMyPreferences } from '../controllers/preferencesController';

const router = Router();

router.get('/',  requireAuth, getMyPreferences);
router.put('/',  requireAuth, updateMyPreferences);

export default router;
