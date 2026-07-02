import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';
import { PermissionType } from '../config/constants';
import { tenantStorage } from '../config/db';
import { ENV } from '../config/env';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
  tenantId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'Access denied. No authentication token provided.'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, ENV.JWT_ACCESS_SECRET) as AuthUser;
    req.user = decoded;

    // Cross-tenant boundary check:
    const tokenTenantSchema = decoded.tenantId === 'public' ? 'public' : `tenant_${decoded.tenantId.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
    const store = tenantStorage.getStore();
    const activeTenantSchema = store?.tenantId || 'public';

    if (tokenTenantSchema !== activeTenantSchema) {
      return next(new AppError(403, 'Access denied. Token tenant does not match request tenant context.'));
    }

    next();
  } catch (error) {
    return next(new AppError(401, 'Invalid or expired authentication token.'));
  }
};

export const checkPermission = (requiredPermission: PermissionType) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, 'User not authenticated.'));
    }

    const { role, permissions } = req.user;

    // Admin has superuser access to all permissions
    if (role === 'ADMIN') {
      return next();
    }

    if (permissions && permissions.includes(requiredPermission)) {
      return next();
    }

    return next(new AppError(403, `Access denied. You do not have permission to perform this action (${requiredPermission}).`));
  };
};
