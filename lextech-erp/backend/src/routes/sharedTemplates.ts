import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  listSharedTemplates,
  createSharedTemplate,
  updateSharedTemplate,
  deleteSharedTemplate,
  setDefaultSharedTemplate,
} from '../controllers/sharedTemplatesController';

const router = Router();
router.use(requireAuth);

router.get('/',           listSharedTemplates);
router.post('/',          createSharedTemplate);
router.put('/:id',        updateSharedTemplate);
router.delete('/:id',     deleteSharedTemplate);
router.patch('/:id/default', setDefaultSharedTemplate);

export default router;
