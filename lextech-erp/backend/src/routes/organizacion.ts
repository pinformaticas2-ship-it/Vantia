import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getMyOrganizacion,
  updateMyOrganizacion,
  createOrganizacion,
  getOrganizacionMiembros,
  addOrganizacionMiembro,
  updateOrganizacionMiembroRol,
  removeOrganizacionMiembro,
  getOrganizacionDeletionImpact,
  deleteOrganizacionActiva,
} from '../controllers/organizacionesController';

const router = Router();

router.get('/', requireAuth, getMyOrganizacion);
router.put('/', requireAuth, updateMyOrganizacion);
router.post('/', requireAuth, createOrganizacion);
router.get('/miembros', requireAuth, getOrganizacionMiembros);
router.post('/miembros', requireAuth, addOrganizacionMiembro);
router.patch('/miembros/:id', requireAuth, updateOrganizacionMiembroRol);
router.delete('/miembros/:id', requireAuth, removeOrganizacionMiembro);
router.get('/impacto-borrado', requireAuth, getOrganizacionDeletionImpact);
router.delete('/', requireAuth, deleteOrganizacionActiva);

export default router;
