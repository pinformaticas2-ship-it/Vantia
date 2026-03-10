import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { scanDNI } from '../controllers/ocrController';

const router = Router();

// Guardamos el archivo temporalmente en /tmp para procesarlo con Claude
const upload = multer({
  dest: '/tmp/',
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
router.post('/dni', requireAuth, upload.single('dni_image'), scanDNI);

export default router;
