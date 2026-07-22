import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { uploadOrgLogo } from '../middleware/upload';
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
  uploadOrganizacionLogo,
} from '../controllers/organizacionesController';

const router = Router();

router.get('/', requireAuth, getMyOrganizacion);
router.put('/', requireAuth, updateMyOrganizacion);
router.post('/', requireAuth, createOrganizacion);
router.post('/logo', requireAuth, uploadOrgLogo.single('logo'), uploadOrganizacionLogo);
router.get('/miembros', requireAuth, getOrganizacionMiembros);
router.post('/miembros', requireAuth, addOrganizacionMiembro);
router.patch('/miembros/:id', requireAuth, updateOrganizacionMiembroRol);
router.delete('/miembros/:id', requireAuth, removeOrganizacionMiembro);
router.get('/impacto-borrado', requireAuth, getOrganizacionDeletionImpact);
router.delete('/', requireAuth, deleteOrganizacionActiva);

export default router;
