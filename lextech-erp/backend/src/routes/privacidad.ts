import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getPrivacidad, putPrivacidad, exportarDatos } from '../controllers/privacidadController';

// Ajustes → Despacho → Datos y privacidad (ver privacidadController).
const router = Router();

router.get('/', requireAuth, getPrivacidad);
router.put('/', requireAuth, putPrivacidad);
router.get('/exportar', requireAuth, exportarDatos);

export default router;
