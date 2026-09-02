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
  confirmDocumentImportDeadline,
  deleteDocumentImportBatch,
} from '../controllers/documentImportController';

const router = Router();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB máximo
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.zip', '.pdf'].includes(ext) ||
      ['application/zip', 'application/x-zip-compressed', 'application/x-zip', 'application/pdf'].includes(file.mimetype);
    cb(null, ok);
  },
});

// Acepta tanto un ZIP con varios documentos como un único PDF suelto
// (mismo campo "zip" del formulario, por compatibilidad con el frontend existente).
router.post('/upload',   requireAuth, upload.single('zip'), uploadDocumentImport);
router.get('/batch/:id', requireAuth, getDocumentImportBatch);
router.get('/batches',   requireAuth, listDocumentImportBatches);
router.delete('/batch/:id', requireAuth, deleteDocumentImportBatch);
router.post('/batch/:batchId/items/:itemId/accept', requireAuth, acceptDocumentImportItem);
router.post('/batch/:batchId/items/:itemId/confirm-deadline', requireAuth, confirmDocumentImportDeadline);

export default router;
