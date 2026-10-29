import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { requireAuth } from '../middleware/auth';
import { requireModulePermission } from '../middleware/requireModulePermission';
import { TEMP_ROOT } from '../config/paths';
import {
  getTikTokStatus, startTikTokConnect, tiktokCallback, disconnectTikTok,
  getTikTokVideos, getTikTokCreator, publishToTikTok, getTikTokPublish,
} from '../controllers/tiktokController';

// El vídeo se guarda en disco temporal solo mientras se sube a TikTok (se
// borra al terminar); en memoria no cabría un vídeo grande.
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: TEMP_ROOT,
    filename: (_req, file, cb) => cb(null, `tiktok-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (VIDEO_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato no soportado. Sube un vídeo MP4, MOV o WebM.') as any, false);
  },
});

const router = Router();

// Aquí vuelve el navegador desde TikTok: sin sesión de Clerk (ver controlador).
router.get('/callback', tiktokCallback);

router.use(requireAuth);
router.use(requireModulePermission('whatsapp'));

router.get('/status', getTikTokStatus);
router.post('/connect', startTikTokConnect);
router.delete('/', disconnectTikTok);
router.get('/videos', getTikTokVideos);
router.get('/creator-info', getTikTokCreator);
router.post('/publish', uploadVideo.single('video'), publishToTikTok);
router.get('/publish/:publishId', getTikTokPublish);

export default router;
