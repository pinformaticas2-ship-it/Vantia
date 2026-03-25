"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const vantiaController_1 = require("../controllers/vantiaController");
const router = (0, express_1.Router)();
router.get('/chat/history', auth_1.requireAuth, vantiaController_1.getChatHistory);
router.post('/chat', auth_1.requireAuth, vantiaController_1.chatVantia);
exports.default = router;
