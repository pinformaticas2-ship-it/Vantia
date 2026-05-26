import { Router } from 'express';
import multer      from 'multer';
import * as path   from 'path';
import * as os     from 'os';
import { requireAuth } from '../middleware/auth';
import {
  uploadDocumentImport,
  getDocumentImportBatch,
  listDocumentImportBatches,
  acceptDocumentImportItem,
  deleteDocumentImportBatch,
} from '../controllers/documentImportController';

const router = Router();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB máximo
  fileFilter: (_req, file, cb) => {
    const ok = ['.zip', '.ZIP'].includes(path.extname(file.originalname)) ||
      ['application/zip', 'application/x-zip-compressed', 'application/x-zip'].includes(file.mimetype);
    cb(null, ok);
  },
});

router.post('/upload',   requireAuth, upload.single('zip'), uploadDocumentImport);
router.get('/batch/:id', requireAuth, getDocumentImportBatch);
router.get('/batches',   requireAuth, listDocumentImportBatches);
router.delete('/batch/:id', requireAuth, deleteDocumentImportBatch);
router.post('/batch/:batchId/items/:itemId/accept', requireAuth, acceptDocumentImportItem);

export default router;
