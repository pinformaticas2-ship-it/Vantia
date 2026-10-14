import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getMyPreferences, updateMyPreferences, getMyExtras, updateMyExtras } from '../controllers/preferencesController';

const router = Router();

router.get('/',  requireAuth, getMyPreferences);
router.put('/',  requireAuth, updateMyPreferences);
router.get('/extras', requireAuth, getMyExtras);
router.put('/extras', requireAuth, updateMyExtras);

export default router;
