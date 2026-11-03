import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { requireAuth } from '../middleware/auth';
import { requireModulePermission } from '../middleware/requireModulePermission';
import { TEMP_ROOT } from '../config/paths';
import {
  getInstagramStatus, startInstagramConnect, conectarConToken, instagramCallback, disconnectInstagram, reintentarWebhook,
  listarConversaciones, verConversacion, enviarMensaje, listarMedios, publicar, estadoPublicacion,
  listarComentarios, responderComentario, ocultarComentario, borrarComentario, servirArchivo,
} from '../controllers/instagramController';

// Comunicación Externa → Instagram. El webhook va aparte (routes/instagramWebhook.ts)
// porque necesita el cuerpo en bruto para comprobar la firma de Meta.

// El archivo se guarda en disco temporal hasta que Meta lo descarga y se publica.
const TIPOS = ['video/mp4', 'video/quicktime', 'image/jpeg'];
const subida = multer({
  storage: multer.diskStorage({
    destination: TEMP_ROOT,
    filename: (_req, file, cb) => cb(null, `instagram-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (TIPOS.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato no soportado: vídeo MP4 o MOV, o foto JPG.') as any, false);
  },
});

const router = Router();

// Públicas: vuelta desde Instagram y archivos que descarga Meta al publicar.
router.get('/callback', instagramCallback);
router.get('/archivo/:token', servirArchivo);

router.use(requireAuth);
router.use(requireModulePermission('whatsapp'));

router.get('/status', getInstagramStatus);
router.post('/connect', startInstagramConnect);
router.post('/conectar-token', conectarConToken);
router.post('/webhook/reintentar', reintentarWebhook);
router.delete('/', disconnectInstagram);

router.get('/conversaciones', listarConversaciones);
router.get('/conversaciones/:igsid', verConversacion);
router.post('/conversaciones/:igsid/mensajes', enviarMensaje);

router.get('/medios', listarMedios);
router.get('/medios/:mediaId/comentarios', listarComentarios);
router.post('/publicar', subida.single('archivo'), publicar);
router.get('/publicar/:token', estadoPublicacion);

router.post('/comentarios/:id/responder', responderComentario);
router.post('/comentarios/:id/ocultar', ocultarComentario);
router.delete('/comentarios/:id', borrarComentario);

export default router;
