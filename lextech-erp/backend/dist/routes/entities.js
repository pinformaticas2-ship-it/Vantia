"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const entities_1 = require("../controllers/entities");
const noteRoutes_1 = __importDefault(require("./noteRoutes"));
const auth_1 = require("../middleware/auth");
const upload_1 = require("./../middleware/upload");
const router = (0, express_1.Router)();
router.get('/', auth_1.requireAuth, entities_1.getEntities);
router.get('/:id', auth_1.requireAuth, entities_1.getEntityById);
router.post('/', auth_1.requireAuth, upload_1.uploadDNI.single('dni_image'), entities_1.createEntity);
router.put('/:id', auth_1.requireAuth, entities_1.updateEntity);
router.patch('/:id', auth_1.requireAuth, entities_1.patchEntity);
router.delete('/:id', auth_1.requireAuth, entities_1.deleteEntity);
router.use('/:id/notes', noteRoutes_1.default);
exports.default = router;
