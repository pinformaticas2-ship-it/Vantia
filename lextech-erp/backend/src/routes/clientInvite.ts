import { Router } from 'express';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import {
  createInvite,
  listInvites,
  deleteInvite,
  getPublicForm,
  submitPublicForm,
} from '../controllers/clientInviteController';

const router = Router();
const auth = ClerkExpressRequireAuth();

// Rutas autenticadas
router.post('/',       auth, createInvite);
router.get('/',        auth, listInvites);
router.delete('/:id',  auth, deleteInvite);

// Rutas públicas (formulario del cliente)
router.get('/public/:token',  getPublicForm);
router.post('/public/:token', submitPublicForm);

export default router;
