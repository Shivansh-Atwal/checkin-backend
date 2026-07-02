"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const syncController_1 = require("../controllers/syncController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/delta', auth_1.authenticate, syncController_1.SyncController.getDelta);
exports.default = router;
