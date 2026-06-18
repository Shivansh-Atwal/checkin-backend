"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminController_1 = require("../controllers/adminController");
const auth_1 = require("../middleware/auth");
const constants_1 = require("../config/constants");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
// Employee Management
router.get('/employees', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.EMPLOYEES_MANAGE), adminController_1.AdminController.getAllEmployees);
router.post('/employees', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.EMPLOYEES_MANAGE), adminController_1.AdminController.createEmployee);
router.put('/employees/:id', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.EMPLOYEES_MANAGE), adminController_1.AdminController.updateEmployee);
router.patch('/employees/:id/disable', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.EMPLOYEES_MANAGE), adminController_1.AdminController.disableEmployee);
router.put('/employees/:id/reset-password', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.EMPLOYEES_MANAGE), adminController_1.AdminController.resetPassword);
// Audit Logs
router.get('/audit-logs', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.AUDITLOGS_READ), adminController_1.AdminController.getAuditLogs);
// System Metrics
router.get('/dashboard-stats', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.DASHBOARD_VIEW), adminController_1.AdminController.getDashboardStats);
router.get('/reports', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.REPORTS_READ), adminController_1.AdminController.getReports);
router.get('/permissions', (0, auth_1.checkPermission)(constants_1.PERMISSIONS.EMPLOYEES_MANAGE), adminController_1.AdminController.getSystemPermissions);
exports.default = router;
