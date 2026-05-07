"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const auth_1 = require("../middleware/auth");
const tasksController_1 = require("../controllers/tasksController");
const router = (0, express_1.Router)();
const uuidv4 = () => crypto_1.default.randomUUID();
const taskFilesStorage = multer_1.default.diskStorage({
    destination: (req, _file, cb) => {
        const taskId = req.params.id;
        const dir = path_1.default.join(tasksController_1.TASK_FILES_ROOT, taskId);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    },
});
const uploadTaskFilesMiddleware = (0, multer_1.default)({
    storage: taskFilesStorage,
    limits: { fileSize: 50 * 1024 * 1024 },
});
router.get('/etapas', auth_1.requireAuth, tasksController_1.getEtapas);
router.post('/etapas', auth_1.requireAuth, tasksController_1.createEtapa);
router.get('/me', auth_1.requireAuth, tasksController_1.getMyTasks);
router.get('/indicators/:clientId', auth_1.requireAuth, tasksController_1.getIndicators);
router.get('/client/:clientId', auth_1.requireAuth, tasksController_1.getTasks);
router.post('/client/:clientId', auth_1.requireAuth, tasksController_1.createTask);
router.get('/:id/files', auth_1.requireAuth, tasksController_1.listTaskFiles);
router.post('/:id/files', auth_1.requireAuth, uploadTaskFilesMiddleware.array('files', 20), tasksController_1.uploadTaskFiles);
router.put('/:id/files/:fileId', auth_1.requireAuth, tasksController_1.updateTaskFileMetadata);
router.get('/:id/files/:fileId/preview-pdf', auth_1.requireAuth, tasksController_1.previewTaskWordAsPdf);
router.get('/:id/files/:fileId/preview-html', auth_1.requireAuth, tasksController_1.previewTaskWordAsHtml);
router.get('/:id/files/:fileId/preview-excel', auth_1.requireAuth, tasksController_1.previewTaskExcelAsHtml);
router.get('/:id/files/:fileId/download', auth_1.requireAuth, tasksController_1.downloadTaskFile);
router.delete('/:id/files/:fileId', auth_1.requireAuth, tasksController_1.deleteTaskFile);
router.put('/:id', auth_1.requireAuth, tasksController_1.updateTask);
router.patch('/:id/estado', auth_1.requireAuth, tasksController_1.patchTaskEstado);
router.delete('/:id', auth_1.requireAuth, tasksController_1.deleteTask);
exports.default = router;
