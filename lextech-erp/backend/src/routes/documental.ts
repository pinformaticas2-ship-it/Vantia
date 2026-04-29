import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getBoeBlockById,
  getBoeDocumentById,
  getBoeSchemas,
  searchBoeDocuments,
  getCendojHighlights,
  searchCendoj,
  getDocumentalProviders,
} from '../controllers/documentalController';

const router = Router();

router.get('/providers', requireAuth, getDocumentalProviders);
router.get('/boe/schemas', requireAuth, getBoeSchemas);
router.get('/boe/search', requireAuth, searchBoeDocuments);
router.get('/boe/document/:id/block/:blockId', requireAuth, getBoeBlockById);
router.get('/boe/document/:id', requireAuth, getBoeDocumentById);
router.get('/cendoj/highlights', requireAuth, getCendojHighlights);
router.get('/cendoj/search', requireAuth, searchCendoj);

export default router;
