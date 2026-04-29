import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import { requireAuth } from '../middleware/auth';
import { scanDNI } from '../controllers/ocrController';

const router = Router();

// os.tmpdir() devuelve la carpeta temporal correcta en Windows, Linux y Mac
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máximo
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan imágenes (JPG, PNG, WEBP)'));
    }
  },
});

// POST /api/ocr/dni
router.post(
  '/dni',
  requireAuth,
  upload.fields([
    { name: 'dni_front_image', maxCount: 1 },
    { name: 'dni_back_image', maxCount: 1 },
    { name: 'dni_image', maxCount: 1 },
  ]),
  scanDNI,
);

export default router;
