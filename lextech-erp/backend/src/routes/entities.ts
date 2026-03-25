import { Router } from 'express';
import { getEntities, getEntityById, createEntity, updateEntity, patchEntity, deleteEntity } from '../controllers/entities';
import noteRoutes from './noteRoutes';
import { requireAuth } from '../middleware/auth';
import { uploadDNI } from './../middleware/upload';

const router = Router();

router.get('/', requireAuth, getEntities);
router.get('/:id', requireAuth, getEntityById);
router.post('/', requireAuth, uploadDNI.single('dni_image'), createEntity);
router.put('/:id', requireAuth, updateEntity);
router.patch('/:id', requireAuth, patchEntity);
router.delete('/:id', requireAuth, deleteEntity);

// Montar rutas de notas bajo /api/entities/:id/notes
router.use('/:id/notes', noteRoutes);

export default router;