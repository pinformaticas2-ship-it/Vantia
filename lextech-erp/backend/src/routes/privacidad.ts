import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getPrivacidad, putPrivacidad, exportarDatos, exportarMisDatos, eliminarMiCuenta } from '../controllers/privacidadController';

// Ajustes → Despacho → Datos y privacidad (ver privacidadController).
const router = Router();

router.get('/', requireAuth, getPrivacidad);
router.put('/', requireAuth, putPrivacidad);
router.get('/exportar', requireAuth, exportarDatos);
// De cada persona (Ajustes → Mi cuenta → Privacidad)
router.get('/mis-datos', requireAuth, exportarMisDatos);
router.post('/eliminar-cuenta', requireAuth, eliminarMiCuenta);

export default router;
