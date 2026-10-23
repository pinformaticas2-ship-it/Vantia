import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireModulePermission } from '../middleware/requireModulePermission';
import {
  listarOportunidades, resumenCrm, verOportunidad, crearOportunidad, actualizarOportunidad,
  anadirActividad, convertirEnCliente, borrarOportunidad, verConfig, crearEmbudo, guardarEmbudo, guardarCampos,
} from '../controllers/crmController';

// CRM (23/10/2026): oportunidades de clientes potenciales. Mismo permiso que
// Clientes: ver = lectura, crear/editar (y configurar embudos) = edición.
const router = Router();
router.use(requireAuth, requireModulePermission('clientes'));

router.get('/config', verConfig);
router.post('/embudos', crearEmbudo);
router.put('/embudos/:id', guardarEmbudo);
router.put('/campos', guardarCampos);
router.get('/resumen', resumenCrm);
router.get('/oportunidades', listarOportunidades);
router.post('/oportunidades', crearOportunidad);
router.get('/oportunidades/:id', verOportunidad);
router.put('/oportunidades/:id', actualizarOportunidad);
router.delete('/oportunidades/:id', borrarOportunidad);
router.post('/oportunidades/:id/actividades', anadirActividad);
router.post('/oportunidades/:id/convertir', convertirEnCliente);

export default router;
