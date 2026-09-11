import { Router } from 'express';
import { requireAuth as auth } from '../middleware/auth';
import { requireModulePermission } from '../middleware/requireModulePermission';
import { publicFormLimiter } from '../middleware/rateLimits';
import { uploadDNI } from '../middleware/upload';
import {
  createInvite,
  listInvites,
  deleteInvite,
  getPublicForm,
  submitPublicForm,
} from '../controllers/clientInviteController';

const router = Router();

// Rutas autenticadas -- invitar clientes es parte del módulo 'clientes'.
router.post('/',       auth, requireModulePermission('clientes'), createInvite);
router.get('/',        auth, requireModulePermission('clientes'), listInvites);
router.delete('/:id',  auth, requireModulePermission('clientes'), deleteInvite);

// Rutas públicas (formulario del cliente) -- uploadDNI.single admite tanto
// multipart/form-data (con foto de DNI adjunta) como el envío sin archivo,
// así que no rompe nada si el cliente no adjunta nada.
router.get('/public/:token',  getPublicForm);
router.post('/public/:token', publicFormLimiter, uploadDNI.single('dni_image'), submitPublicForm);

export default router;
