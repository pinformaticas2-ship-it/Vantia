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
  deleteOrganizacionLogo,
  getPermisosMatrix,
  updatePermiso,
  getMemberPermisos,
  updateMemberPermiso,
  resetMemberPermisos,
  transferirPropiedad,
} from '../controllers/organizacionesController';

const router = Router();

router.get('/', requireAuth, getMyOrganizacion);
router.put('/', requireAuth, updateMyOrganizacion);
router.post('/', requireAuth, createOrganizacion);
router.post('/logo', requireAuth, uploadOrgLogo.single('logo'), uploadOrganizacionLogo);
router.delete('/logo', requireAuth, deleteOrganizacionLogo);
router.get('/miembros', requireAuth, getOrganizacionMiembros);
router.post('/miembros', requireAuth, addOrganizacionMiembro);
router.patch('/miembros/:id', requireAuth, updateOrganizacionMiembroRol);
router.post('/transferir-propiedad', requireAuth, transferirPropiedad);
router.delete('/miembros/:id', requireAuth, removeOrganizacionMiembro);
router.get('/permisos', requireAuth, getPermisosMatrix);
router.put('/permisos', requireAuth, updatePermiso);
router.get('/miembros/:id/permisos', requireAuth, getMemberPermisos);
router.put('/miembros/:id/permisos', requireAuth, updateMemberPermiso);
router.delete('/miembros/:id/permisos', requireAuth, resetMemberPermisos);
router.get('/impacto-borrado', requireAuth, getOrganizacionDeletionImpact);
router.delete('/', requireAuth, deleteOrganizacionActiva);

export default router;
