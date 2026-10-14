import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { registrarErrorCliente, listarErroresCliente } from '../controllers/erroresClienteController';

// Errores de la app en el navegador (ver erroresClienteController).
const router = Router();

router.post('/', requireAuth, registrarErrorCliente);
router.get('/', requireAuth, listarErroresCliente);

export default router;
