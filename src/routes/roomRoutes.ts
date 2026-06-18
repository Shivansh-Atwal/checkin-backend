import { Router } from 'express';
import { RoomController } from '../controllers/roomController';
import { authenticate, checkPermission } from '../middleware/auth';
import { PERMISSIONS } from '../config/constants';
import { upload } from '../utils/uploader';

const router = Router();

router.use(authenticate);

router.get('/', checkPermission(PERMISSIONS.ROOMS_READ), RoomController.getAll);
router.get('/:id', checkPermission(PERMISSIONS.ROOMS_READ), RoomController.getById);
router.post('/', checkPermission(PERMISSIONS.ROOMS_CREATE), RoomController.create);
router.put('/:id', checkPermission(PERMISSIONS.ROOMS_UPDATE), RoomController.update);
router.patch('/:id/status', checkPermission(PERMISSIONS.ROOMS_UPDATE), RoomController.updateStatus);
router.delete('/:id', checkPermission(PERMISSIONS.ROOMS_DELETE), RoomController.delete);
router.post('/upload', checkPermission(PERMISSIONS.ROOMS_CREATE), upload.single('image'), RoomController.uploadImage);

export default router;
