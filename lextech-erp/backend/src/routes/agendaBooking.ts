import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { publicFormLimiter } from '../middleware/rateLimits';
import {
  getMyBookingPage,
  upsertMyBookingPage,
  getPublicBookingPage,
  getPublicBookingSlots,
  createPublicBooking,
} from '../controllers/agendaBookingController';

const router = Router();

// ── Autenticado: configurar mi página de reservas ───────────────────────────
router.get('/mine', requireAuth, getMyBookingPage);
router.put('/mine', requireAuth, upsertMyBookingPage);

// ── Público: sin requireAuth, cualquiera con el enlace puede reservar ──────
router.get('/public/:token',       getPublicBookingPage);
router.get('/public/:token/slots', getPublicBookingSlots);
router.post('/public/:token',      publicFormLimiter, createPublicBooking);

export default router;
