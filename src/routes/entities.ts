import { Router } from 'express';
import { getEntities, getEntityById, createEntity } from '../controllers/entities';
import { requireAuth } from '../middleware/auth';
import { uploadDNI } from './../middleware/upload';

const router = Router();

router.get('/', requireAuth, getEntities);
router.get('/:id', requireAuth, getEntityById);
router.post('/', requireAuth, uploadDNI.single('dni_image'), createEntity);

export default router;