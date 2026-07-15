import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getMyQuickLinks,
  createQuickLink,
  updateQuickLink,
  deleteQuickLink,
} from '../controllers/quickLinksController';

const router = Router();

router.get('/',      requireAuth, getMyQuickLinks);
router.post('/',     requireAuth, createQuickLink);
router.put('/:id',   requireAuth, updateQuickLink);
router.delete('/:id', requireAuth, deleteQuickLink);

export default router;
