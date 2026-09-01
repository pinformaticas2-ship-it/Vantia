import { Router } from 'express';
import {
  getEntities, getEntityById, createEntity, updateEntity, patchEntity, deleteEntity, checkNifCif,
  getEntityImportHistory, getEntityImportBatchDetail, createEntityImportBatch, updateEntityImportBatch,
  undoEntityImportBatch, getEntitiesCounterConfig, setEntitiesCounterConfig,
} from '../controllers/entities';
import noteRoutes from './noteRoutes';
import { requireAuth } from '../middleware/auth';
import { requireModulePermission } from '../middleware/requireModulePermission';
import { uploadDNI } from './../middleware/upload';

const router = Router();
router.use(requireModulePermission('clientes'));

router.get('/', requireAuth, getEntities);
router.get('/check-nif', requireAuth, checkNifCif);
// Rutas literales ANTES de /:id, si no Express trata el segmento como un id
router.get('/counter-config', requireAuth, getEntitiesCounterConfig);
router.post('/counter-config', requireAuth, setEntitiesCounterConfig);
router.get('/imports', requireAuth, getEntityImportHistory);
router.get('/imports/:id', requireAuth, getEntityImportBatchDetail);
router.post('/imports', requireAuth, createEntityImportBatch);
router.patch('/imports/:id', requireAuth, updateEntityImportBatch);
router.post('/imports/:id/undo', requireAuth, undoEntityImportBatch);
router.get('/:id', requireAuth, getEntityById);
router.post('/', requireAuth, uploadDNI.single('dni_image'), createEntity);
router.put('/:id', requireAuth, updateEntity);
router.patch('/:id', requireAuth, patchEntity);
router.delete('/:id', requireAuth, deleteEntity);

// Montar rutas de notas bajo /api/entities/:id/notes
router.use('/:id/notes', noteRoutes);

export default router;