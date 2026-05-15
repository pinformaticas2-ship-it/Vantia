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
const uuidv4 = () => crypto_1.default.randomUUID();
const auth_1 = require("../middleware/auth");
const filesController_1 = require("../controllers/filesController");
const router = (0, express_1.Router)();
const storage = multer_1.default.diskStorage({
    destination: (req, _file, cb) => {
        const clientId = req.params.clientId;
        const dir = path_1.default.join(filesController_1.UPLOADS_ROOT, clientId);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
});
router.get('/templates', auth_1.requireAuth, filesController_1.listTemplates);
router.get('/templates/preview-pdf', auth_1.requireAuth, filesController_1.previewTemplateAsPdf);
router.get('/templates/preview', auth_1.requireAuth, filesController_1.previewTemplateAsHtml);
router.get('/templates/download', auth_1.requireAuth, filesController_1.downloadTemplate);
router.get('/templates/blank.docx', auth_1.requireAuth, filesController_1.downloadBlank);
router.get('/test-preview', auth_1.requireAuth, filesController_1.testPreviewImages);
router.post('/:clientId/create-blank', auth_1.requireAuth, filesController_1.createBlankDocument);
router.get('/:clientId', auth_1.requireAuth, filesController_1.listFiles);
router.post('/:clientId', auth_1.requireAuth, upload.array('files', 50), filesController_1.uploadFiles);
router.put('/:clientId/:fileId', auth_1.requireAuth, filesController_1.updateFileMetadata);
router.post('/:clientId/:fileId/open-local', auth_1.requireAuth, filesController_1.openFileLocally);
router.get('/:clientId/:fileId/preview-pdf', auth_1.requireAuth, filesController_1.previewWordAsPdf);
router.get('/:clientId/:fileId/preview-html', auth_1.requireAuth, filesController_1.previewDocxAsHtml);
router.get('/:clientId/:fileId/preview-excel', auth_1.requireAuth, filesController_1.previewExcelAsHtml);
router.get('/:clientId/:fileId/download', auth_1.requireAuth, filesController_1.downloadFile);
router.delete('/:clientId/:fileId', auth_1.requireAuth, filesController_1.deleteFile);
exports.default = router;
