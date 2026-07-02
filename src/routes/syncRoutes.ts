import { Router } from 'express';
import { SyncController } from '../controllers/syncController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/delta', authenticate, SyncController.getDelta);

export default router;
