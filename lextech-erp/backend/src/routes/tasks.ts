import express, { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { requireAuth } from '../middleware/auth';
import { requireModulePermission } from '../middleware/requireModulePermission';
import {
  getTasks,
  getMyTasks,
  createTask,
  updateTask,
  patchTaskEstado,
  deleteTask,
  getIndicators,
  getExpedienteIndicators,
  getEtapas,
  createEtapa,
  deleteEtapa,
  reorderEtapas,
  listTaskFiles,
  uploadTaskFiles,
  updateTaskFileMetadata,
  downloadTaskFile,
  createTaskFileTempToken,
  downloadTaskFileByToken,
  launchTaskFileWithOffice,
  taskOfficeBridgePage,
  syncTaskFileByToken,
  deleteTaskFile,
  previewTaskWordAsPdf,
  previewTaskWordAsHtml,
  previewTaskExcelAsHtml,
  TASK_FILES_ROOT,
} from '../controllers/tasksController';

const router = Router();
const rawBinary = express.raw({ type: 'application/octet-stream', limit: '100mb' });
const uuidv4 = () => crypto.randomUUID();

const taskFilesStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const taskId = req.params.id;
    const dir = path.join(TASK_FILES_ROOT, taskId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const uploadTaskFilesMiddleware = multer({
  storage: taskFilesStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.get('/files/dl/:token/launch', launchTaskFileWithOffice);
router.get('/files/dl/:token/bridge', taskOfficeBridgePage);
router.get('/files/dl/:token', downloadTaskFileByToken);
router.put('/files/dl/:token/sync', rawBinary, syncTaskFileByToken);

// El resto de rutas exige sesión (arriba están las de enlace con token
// firmado, para el puente con Office, que no llevan sesión de Clerk).
router.use(requireModulePermission('tareas'));

// ── Etapas (antes de rutas con :id) ──────────────────────────────
router.get('/etapas',               requireAuth, getEtapas);
router.post('/etapas',              requireAuth, createEtapa);
router.patch('/etapas/reorder',     requireAuth, reorderEtapas);
router.delete('/etapas/:id',        requireAuth, deleteEtapa);

router.get('/me',                   requireAuth, getMyTasks);
router.get('/indicators/expediente/:expedienteId', requireAuth, getExpedienteIndicators);
router.get('/indicators/:clientId',               requireAuth, getIndicators);
router.get('/client/:clientId',     requireAuth, getTasks);
router.post('/client/:clientId',    requireAuth, createTask);
router.get('/:id/files',            requireAuth, listTaskFiles);
router.post('/:id/files',           requireAuth, uploadTaskFilesMiddleware.array('files', 20), uploadTaskFiles);
router.put('/:id/files/:fileId',    requireAuth, updateTaskFileMetadata);
router.get('/:id/files/:fileId/preview-pdf', requireAuth, previewTaskWordAsPdf);
router.get('/:id/files/:fileId/preview-html', requireAuth, previewTaskWordAsHtml);
router.get('/:id/files/:fileId/preview-excel', requireAuth, previewTaskExcelAsHtml);
router.get('/:id/files/:fileId/download', requireAuth, downloadTaskFile);
router.post('/:id/files/:fileId/temp-token', requireAuth, createTaskFileTempToken);
router.delete('/:id/files/:fileId', requireAuth, deleteTaskFile);
router.put('/:id',                  requireAuth, updateTask);
router.patch('/:id/estado',         requireAuth, patchTaskEstado);
router.delete('/:id',               requireAuth, deleteTask);

export default router;
