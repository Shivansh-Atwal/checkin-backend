import { Router } from 'express';
import { AdminController } from '../controllers/adminController';
import { authenticate, checkPermission } from '../middleware/auth';
import { PERMISSIONS } from '../config/constants';

const router = Router();

router.use(authenticate);

// Employee Management
router.get('/employees', checkPermission(PERMISSIONS.EMPLOYEES_MANAGE), AdminController.getAllEmployees);
router.post('/employees', checkPermission(PERMISSIONS.EMPLOYEES_MANAGE), AdminController.createEmployee);
router.put('/employees/:id', checkPermission(PERMISSIONS.EMPLOYEES_MANAGE), AdminController.updateEmployee);
router.patch('/employees/:id/disable', checkPermission(PERMISSIONS.EMPLOYEES_MANAGE), AdminController.disableEmployee);
router.put('/employees/:id/reset-password', checkPermission(PERMISSIONS.EMPLOYEES_MANAGE), AdminController.resetPassword);

// Audit Logs
router.get('/audit-logs', checkPermission(PERMISSIONS.AUDITLOGS_READ), AdminController.getAuditLogs);

// System Metrics
router.get('/dashboard-stats', checkPermission(PERMISSIONS.DASHBOARD_VIEW), AdminController.getDashboardStats);
router.get('/reports', checkPermission(PERMISSIONS.REPORTS_READ), AdminController.getReports);
router.get('/revenue-report', checkPermission(PERMISSIONS.REPORTS_READ), AdminController.getRevenueReport);
router.get('/permissions', checkPermission(PERMISSIONS.EMPLOYEES_MANAGE), AdminController.getSystemPermissions);

export default router;
