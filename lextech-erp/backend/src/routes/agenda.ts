import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getEvents,
  getUpcomingEvents,
  getEventById,
  getOrganizationOptions,
  createEvent,
  updateEvent,
  deleteEvent,
  importGoogleEvents,
  syncGoogleEvents,
} from '../controllers/agendaController';

const router = Router();

router.get('/',            requireAuth, getEvents);
router.get('/upcoming',    requireAuth, getUpcomingEvents);
router.get('/options',     requireAuth, getOrganizationOptions);
router.post('/import-google', requireAuth, importGoogleEvents);
router.post('/sync-google', requireAuth, syncGoogleEvents);
router.get('/:id',         requireAuth, getEventById);
router.post('/',           requireAuth, createEvent);
router.put('/:id',         requireAuth, updateEvent);
router.delete('/:id',      requireAuth, deleteEvent);

export default router;
