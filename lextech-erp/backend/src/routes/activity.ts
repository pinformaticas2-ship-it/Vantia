import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getActivity,
  getClientActivity,
  addClientActivity,
  getActivityByUsers,
  getUserActivity,
  getMyActivity,
  registerLogin,
  registerLogout,
  getNivelTrazabilidad,
  getAccesosTemporales,
  concederAccesoTemporal,
  revocarAccesoTemporal,
} from '../controllers/activityController';

const router = Router();

// Auth events — deben ir antes de las rutas genéricas
router.post('/login',              requireAuth, registerLogin);
router.post('/logout',             requireAuth, registerLogout);

// Consultas
router.get('/',                    requireAuth, getActivity);
router.get('/me',                  requireAuth, getMyActivity);
// Quién ve qué (14/10/2026): nivel propio y accesos temporales de soporte.
router.get('/nivel',               requireAuth, getNivelTrazabilidad);
router.get('/accesos-temporales',  requireAuth, getAccesosTemporales);
router.post('/accesos-temporales', requireAuth, concederAccesoTemporal);
router.delete('/accesos-temporales/:userId', requireAuth, revocarAccesoTemporal);
router.get('/users',               requireAuth, getActivityByUsers);
router.get('/user/:userId',        requireAuth, getUserActivity);
router.get('/client/:clientId',    requireAuth, getClientActivity);
router.post('/client/:clientId',   requireAuth, addClientActivity);

export default router;
