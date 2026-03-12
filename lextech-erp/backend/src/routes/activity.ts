import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getActivity } from '../controllers/activityController';

const router = Router();

router.get('/', requireAuth, getActivity);

export default router;
