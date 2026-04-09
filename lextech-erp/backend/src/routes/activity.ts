import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getActivity,
  getClientActivity,
  addClientActivity,
  getActivityByUsers,
  getUserActivity,
  registerLogin,
  registerLogout,
} from '../controllers/activityController';

const router = Router();

// Auth events — deben ir antes de las rutas genéricas
router.post('/login',              requireAuth, registerLogin);
router.post('/logout',             requireAuth, registerLogout);

// Consultas
router.get('/',                    requireAuth, getActivity);
router.get('/users',               requireAuth, getActivityByUsers);
router.get('/user/:userId',        requireAuth, getUserActivity);
router.get('/client/:clientId',    requireAuth, getClientActivity);
router.post('/client/:clientId',   requireAuth, addClientActivity);

export default router;
