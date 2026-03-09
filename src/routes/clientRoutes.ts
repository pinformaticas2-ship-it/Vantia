import { Router } from 'express';
import { getClients, createClient } from '../controllers/clientController';
import { requireAuth } from '../middleware/auth';

const router = Router();

// Definimos las URLs del módulo
// GET /api/clients -> Devuelve la lista
// POST /api/clients -> Crea uno nuevo

// Ambas protegidas por 'requireAuth' (Solo abogados logueados)
router.get('/', requireAuth, getClients);
router.post('/', requireAuth, createClient);

export default router;