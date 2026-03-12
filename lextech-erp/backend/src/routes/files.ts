import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
const uuidv4 = () => crypto.randomUUID();
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import { listFiles, uploadFiles, downloadFile, deleteFile, UPLOADS_ROOT, listTemplates, downloadTemplate, downloadBlank, createBlankDocument, updateFileMetadata, openFileLocally, previewDocxAsHtml } from '../controllers/filesController';

const requireAuth = ClerkExpressRequireAuth({});
const router = Router();

// Multer: guarda en uploads/clients/:clientId/ con nombre único
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const clientId = req.params.clientId;
    const dir = path.join(UPLOADS_ROOT, clientId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max por archivo
});

// ── Rutas de plantillas (ANTES de las rutas dinámicas) ──────────
router.get('/templates',              requireAuth, listTemplates);
router.get('/templates/download',     requireAuth, downloadTemplate);
router.get('/templates/blank.docx',   requireAuth, downloadBlank);

// ── Rutas de archivos del cliente ────────────────────────────
router.post('/:clientId/create-blank',              requireAuth, createBlankDocument);
router.get('/:clientId',                            requireAuth, listFiles);
router.post('/:clientId',                           requireAuth, upload.array('files', 50), uploadFiles);
router.put('/:clientId/:fileId',                    requireAuth, updateFileMetadata);
router.post('/:clientId/:fileId/open-local',        requireAuth, openFileLocally);
router.get('/:clientId/:fileId/preview-html',       requireAuth, previewDocxAsHtml);
router.get('/:clientId/:fileId/download',           requireAuth, downloadFile);
router.delete('/:clientId/:fileId',                 requireAuth, deleteFile);

export default router;
