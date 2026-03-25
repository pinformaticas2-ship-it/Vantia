"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const activityController_1 = require("../controllers/activityController");
const router = (0, express_1.Router)();
router.get('/', auth_1.requireAuth, activityController_1.getActivity);
router.get('/client/:clientId', auth_1.requireAuth, activityController_1.getClientActivity);
exports.default = router;
