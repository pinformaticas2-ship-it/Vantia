import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getActivity, getClientActivity } from '../controllers/activityController';

const router = Router();

router.get('/',                 requireAuth, getActivity);
router.get('/client/:clientId', requireAuth, getClientActivity);

export default router;
