import { Router } from 'express';
import { CustomerController } from '../controllers/customerController';
import { authenticate, checkPermission } from '../middleware/auth';
import { PERMISSIONS } from '../config/constants';
import { upload } from '../utils/uploader';

const router = Router();

router.use(authenticate);

router.get('/search', checkPermission(PERMISSIONS.CUSTOMERS_READ), CustomerController.search);
router.get('/:id', checkPermission(PERMISSIONS.CUSTOMERS_READ), CustomerController.getById);
router.post('/', checkPermission(PERMISSIONS.CUSTOMERS_CREATE), CustomerController.create);
router.put('/:id', checkPermission(PERMISSIONS.CUSTOMERS_UPDATE), CustomerController.update);
router.post('/upload', checkPermission(PERMISSIONS.CUSTOMERS_CREATE), upload.single('document'), CustomerController.uploadDocument);

export default router;
