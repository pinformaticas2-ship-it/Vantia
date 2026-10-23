import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireModulePermission } from '../middleware/requireModulePermission';
import {
  listarOportunidades, resumenCrm, verOportunidad, crearOportunidad, actualizarOportunidad,
  anadirActividad, convertirEnCliente, borrarOportunidad,
} from '../controllers/crmController';

// CRM (23/10/2026): oportunidades de clientes potenciales. Mismo permiso que
// Clientes: ver = lectura, crear/editar = edición.
const router = Router();
router.use(requireAuth, requireModulePermission('clientes'));

router.get('/resumen', resumenCrm);
router.get('/oportunidades', listarOportunidades);
router.post('/oportunidades', crearOportunidad);
router.get('/oportunidades/:id', verOportunidad);
router.put('/oportunidades/:id', actualizarOportunidad);
router.delete('/oportunidades/:id', borrarOportunidad);
router.post('/oportunidades/:id/actividades', anadirActividad);
router.post('/oportunidades/:id/convertir', convertirEnCliente);

export default router;
