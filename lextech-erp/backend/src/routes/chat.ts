import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { UPLOADS_CHAT_ROOT } from '../config/paths';
import {
  getCanales, createCanal, updateCanal, archivarCanal, marcarLeido, marcarTodoLeido, getCanalMiembros,
  getMensajes, sendMensaje, editMensaje, deleteMensaje,
  toggleReaccion,
  getFijados, fijarMensaje, desfijarMensaje, getFavoritos, toggleFavorito,
  buscarMensajes, getMiembrosGlobal, getOrCreateDM,
  updateMyStatus, updateMyRole,
  getCanalesDisponibles, joinCanal, leaveCanal,
  addMiembro, removeMiembro, updateMiembroRole,
  getSystemUsers, buscarCanalesDisponibles, getUnreadCounts, uploadChatImage, uploadChatFile,
  getTypingStatus, updateTypingStatus,
} from '../controllers/chatController';

const router = Router();
const uploadDir = UPLOADS_CHAT_ROOT;
const fileUploadDir = path.join(UPLOADS_CHAT_ROOT, 'files');
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(fileUploadDir, { recursive: true });

const chatUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      const safeExt = ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext) ? ext : '.png';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Solo se permiten imágenes'));
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ALLOWED_FILE_TYPES = [
  'image/', 'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'text/plain', 'text/csv',
];

const chatFileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, fileUploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const allowed = ALLOWED_FILE_TYPES.some(t => file.mimetype.startsWith(t));
    if (!allowed) return cb(new Error('Tipo de archivo no permitido'));
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Canales (orden importante: rutas con segmento fijo antes que :id)
router.get   ('/canales/disponibles',            requireAuth, getCanalesDisponibles);
router.get   ('/canales/buscar',                 requireAuth, buscarCanalesDisponibles);
router.get   ('/unread',                         requireAuth, getUnreadCounts);
router.put   ('/leido',                          requireAuth, marcarTodoLeido);
router.get   ('/canales',                        requireAuth, getCanales);
router.post  ('/canales',                        requireAuth, createCanal);
router.put   ('/canales/:id',                    requireAuth, updateCanal);
router.delete('/canales/:id',                    requireAuth, archivarCanal);
router.put   ('/canales/:id/leido',              requireAuth, marcarLeido);
router.post  ('/canales/:id/join',               requireAuth, joinCanal);
router.delete('/canales/:id/leave',              requireAuth, leaveCanal);

// Miembros del canal
router.get   ('/canales/:id/miembros',           requireAuth, getCanalMiembros);
router.post  ('/canales/:id/miembros',           requireAuth, addMiembro);
router.delete('/canales/:id/miembros/:uid',      requireAuth, removeMiembro);
router.put   ('/canales/:id/miembros/:uid/role', requireAuth, updateMiembroRole);

// Mensajes de un canal
router.get   ('/canales/:id/mensajes',           requireAuth, getMensajes);
router.post  ('/canales/:id/mensajes',           requireAuth, sendMensaje);
router.get   ('/canales/:id/typing',             requireAuth, getTypingStatus);
router.post  ('/canales/:id/typing',             requireAuth, updateTypingStatus);
router.post  ('/uploads/image',                  requireAuth, chatUpload.single('image'), uploadChatImage);
router.post  ('/uploads/file',                   requireAuth, chatFileUpload.single('file'), uploadChatFile);

// Mensajes (editar / borrar)
router.put   ('/mensajes/:id',                   requireAuth, editMensaje);
router.delete('/mensajes/:id',                   requireAuth, deleteMensaje);

// Reacciones
router.post  ('/mensajes/:id/reacciones',        requireAuth, toggleReaccion);

// Fijados
router.get   ('/canales/:id/fijados',            requireAuth, getFijados);
router.post  ('/canales/:id/fijar/:mensajeId',   requireAuth, fijarMensaje);
router.delete('/canales/:id/fijar/:mensajeId',   requireAuth, desfijarMensaje);

// Búsqueda de mensajes
router.get   ('/favoritos',                      requireAuth, getFavoritos);
router.post  ('/mensajes/:id/favorito',          requireAuth, toggleFavorito);
router.get   ('/buscar',                         requireAuth, buscarMensajes);

// Usuarios del sistema (Clerk)
router.get   ('/usuarios',                       requireAuth, getSystemUsers);

// Usuarios conocidos en chat (fallback)
router.get   ('/miembros',                       requireAuth, getMiembrosGlobal);

// DMs
router.post  ('/dm',                             requireAuth, getOrCreateDM);

// Perfil propio
router.put   ('/me/status',                      requireAuth, updateMyStatus);
router.put   ('/me/role',                        requireAuth, updateMyRole);

export default router;
