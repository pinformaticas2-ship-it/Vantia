import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { estadoTraduccion } from '../controllers/traduccionesController';

const router = Router();
// Estado de una traducción de documento lanzada por el usuario (ver traduccionesController).
router.get('/:id', requireAuth, estadoTraduccion);
export default router;
