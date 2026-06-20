import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/login', AuthController.login);
router.post('/refresh', AuthController.refresh);
router.post('/register-tenant', AuthController.registerTenant);
router.get('/profile', authenticate, AuthController.getProfile);

export default router;
