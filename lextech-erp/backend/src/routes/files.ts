import express, { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
const uuidv4 = () => crypto.randomUUID();
import { requireAuth } from '../middleware/auth';
import { listFiles, uploadFiles, downloadFile, deleteFile, UPLOADS_ROOT, listTemplates, downloadTemplate, downloadMergedTemplate, downloadBlank, createBlankDocument, updateFileMetadata, openFileLocally, previewDocxAsHtml, previewExcelAsHtml, previewTemplateAsHtml, testPreviewImages, previewWordAsPdf, previewTemplateAsPdf, createTempToken, downloadByToken, launchWithOffice, officeBridgePage, syncClientFileByToken } from '../controllers/filesController';
const router = Router();
const rawBinary = express.raw({ type: 'application/octet-stream', limit: '100mb' });

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

// ── Token temporal de descarga (sin auth, para apps nativas) ────
router.get('/dl/:token/launch',       launchWithOffice);
router.get('/dl/:token/bridge',       officeBridgePage);
router.get('/dl/:token',              downloadByToken);
router.put('/dl/:token/sync',         rawBinary, syncClientFileByToken);

// ── Rutas de plantillas (ANTES de las rutas dinámicas) ──────────
router.get('/templates',              requireAuth, listTemplates);
router.get('/templates/preview-pdf',  requireAuth, previewTemplateAsPdf);
router.get('/templates/preview',      requireAuth, previewTemplateAsHtml);
router.get('/templates/download',     requireAuth, downloadTemplate);
router.get('/templates/merge',        requireAuth, downloadMergedTemplate);
router.get('/templates/blank.docx',   requireAuth, downloadBlank);
router.get('/test-preview',           requireAuth, testPreviewImages);

// ── Rutas de archivos del cliente ────────────────────────────
router.post('/:clientId/create-blank',              requireAuth, createBlankDocument);
router.get('/:clientId',                            requireAuth, listFiles);
router.post('/:clientId',                           requireAuth, upload.array('files', 50), uploadFiles);
router.put('/:clientId/:fileId',                    requireAuth, updateFileMetadata);
router.post('/:clientId/:fileId/open-local',        requireAuth, openFileLocally);
router.get('/:clientId/:fileId/preview-pdf',        requireAuth, previewWordAsPdf);
router.get('/:clientId/:fileId/preview-html',       requireAuth, previewDocxAsHtml);
router.get('/:clientId/:fileId/preview-excel',      requireAuth, previewExcelAsHtml);
router.get('/:clientId/:fileId/download',           requireAuth, downloadFile);
router.post('/:clientId/:fileId/temp-token',        requireAuth, createTempToken);
router.delete('/:clientId/:fileId',                 requireAuth, deleteFile);

export default router;
