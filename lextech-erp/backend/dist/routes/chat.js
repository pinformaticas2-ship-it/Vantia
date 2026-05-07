"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const paths_1 = require("../config/paths");
const chatController_1 = require("../controllers/chatController");
const router = (0, express_1.Router)();
const uploadDir = paths_1.UPLOADS_CHAT_ROOT;
fs_1.default.mkdirSync(uploadDir, { recursive: true });
const chatUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir),
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname || '').toLowerCase() || '.png';
            const safeExt = ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext) ? ext : '.png';
            cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
        },
    }),
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/'))
            return cb(new Error('Solo se permiten imágenes'));
        cb(null, true);
    },
    limits: { fileSize: 10 * 1024 * 1024 },
});
router.get('/canales/disponibles', auth_1.requireAuth, chatController_1.getCanalesDisponibles);
router.get('/canales/buscar', auth_1.requireAuth, chatController_1.buscarCanalesDisponibles);
router.get('/unread', auth_1.requireAuth, chatController_1.getUnreadCounts);
router.put('/leido', auth_1.requireAuth, chatController_1.marcarTodoLeido);
router.get('/canales', auth_1.requireAuth, chatController_1.getCanales);
router.post('/canales', auth_1.requireAuth, chatController_1.createCanal);
router.put('/canales/:id', auth_1.requireAuth, chatController_1.updateCanal);
router.delete('/canales/:id', auth_1.requireAuth, chatController_1.archivarCanal);
router.put('/canales/:id/leido', auth_1.requireAuth, chatController_1.marcarLeido);
router.post('/canales/:id/join', auth_1.requireAuth, chatController_1.joinCanal);
router.delete('/canales/:id/leave', auth_1.requireAuth, chatController_1.leaveCanal);
router.get('/canales/:id/miembros', auth_1.requireAuth, chatController_1.getCanalMiembros);
router.post('/canales/:id/miembros', auth_1.requireAuth, chatController_1.addMiembro);
router.delete('/canales/:id/miembros/:uid', auth_1.requireAuth, chatController_1.removeMiembro);
router.put('/canales/:id/miembros/:uid/role', auth_1.requireAuth, chatController_1.updateMiembroRole);
router.get('/canales/:id/mensajes', auth_1.requireAuth, chatController_1.getMensajes);
router.post('/canales/:id/mensajes', auth_1.requireAuth, chatController_1.sendMensaje);
router.get('/canales/:id/typing', auth_1.requireAuth, chatController_1.getTypingStatus);
router.post('/canales/:id/typing', auth_1.requireAuth, chatController_1.updateTypingStatus);
router.post('/uploads/image', auth_1.requireAuth, chatUpload.single('image'), chatController_1.uploadChatImage);
router.put('/mensajes/:id', auth_1.requireAuth, chatController_1.editMensaje);
router.delete('/mensajes/:id', auth_1.requireAuth, chatController_1.deleteMensaje);
router.post('/mensajes/:id/reacciones', auth_1.requireAuth, chatController_1.toggleReaccion);
router.get('/canales/:id/fijados', auth_1.requireAuth, chatController_1.getFijados);
router.post('/canales/:id/fijar/:mensajeId', auth_1.requireAuth, chatController_1.fijarMensaje);
router.delete('/canales/:id/fijar/:mensajeId', auth_1.requireAuth, chatController_1.desfijarMensaje);
router.get('/favoritos', auth_1.requireAuth, chatController_1.getFavoritos);
router.post('/mensajes/:id/favorito', auth_1.requireAuth, chatController_1.toggleFavorito);
router.get('/buscar', auth_1.requireAuth, chatController_1.buscarMensajes);
router.get('/usuarios', auth_1.requireAuth, chatController_1.getSystemUsers);
router.get('/miembros', auth_1.requireAuth, chatController_1.getMiembrosGlobal);
router.post('/dm', auth_1.requireAuth, chatController_1.getOrCreateDM);
router.put('/me/status', auth_1.requireAuth, chatController_1.updateMyStatus);
router.put('/me/role', auth_1.requireAuth, chatController_1.updateMyRole);
exports.default = router;
