"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const os_1 = __importDefault(require("os"));
const auth_1 = require("../middleware/auth");
const ocrController_1 = require("../controllers/ocrController");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    dest: os_1.default.tmpdir(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Solo se aceptan imágenes (JPG, PNG, WEBP)'));
        }
    },
});
router.post('/dni', auth_1.requireAuth, upload.single('dni_image'), ocrController_1.scanDNI);
exports.default = router;
