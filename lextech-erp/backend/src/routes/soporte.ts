import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  listTickets,
  createTicket,
  getTicket,
  addMensaje,
  updateTicket,
  reenviarTicket,
  getSoporteConfig,
  updateSoporteConfig,
} from '../controllers/soporteController';

const router = Router();

router.get('/tickets', requireAuth, listTickets);
router.post('/tickets', requireAuth, createTicket);
router.get('/tickets/:id', requireAuth, getTicket);
router.patch('/tickets/:id', requireAuth, updateTicket);
router.post('/tickets/:id/mensajes', requireAuth, addMensaje);
router.post('/tickets/:id/reenviar', requireAuth, reenviarTicket);

router.get('/config', requireAuth, getSoporteConfig);
router.put('/config/:organizacionId', requireAuth, updateSoporteConfig);

export default router;
