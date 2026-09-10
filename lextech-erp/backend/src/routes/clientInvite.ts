import { Router } from 'express';
import { requireAuth as auth } from '../middleware/auth';
import { requireModulePermission } from '../middleware/requireModulePermission';
import { publicFormLimiter } from '../middleware/rateLimits';
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

// Rutas públicas (formulario del cliente)
router.get('/public/:token',  getPublicForm);
router.post('/public/:token', publicFormLimiter, submitPublicForm);

export default router;
