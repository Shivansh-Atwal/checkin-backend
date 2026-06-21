import { Router } from 'express';
import { InventoryController } from '../controllers/inventoryController';
import { authenticate, checkPermission } from '../middleware/auth';
import { PERMISSIONS } from '../config/constants';

const router = Router();

router.use(authenticate);

router.get('/', checkPermission(PERMISSIONS.DASHBOARD_VIEW), InventoryController.getAll);
router.post('/', checkPermission(PERMISSIONS.DASHBOARD_VIEW), InventoryController.createOrUpdate);
router.put('/:id', checkPermission(PERMISSIONS.DASHBOARD_VIEW), InventoryController.update);
router.delete('/:id', checkPermission(PERMISSIONS.DASHBOARD_VIEW), InventoryController.delete);

export default router;
