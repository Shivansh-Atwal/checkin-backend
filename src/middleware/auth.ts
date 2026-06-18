import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler';
import { PermissionType } from '../config/constants';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'default-hotelflow-jwt-access-secret-key-reception';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
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
    const decoded = jwt.verify(token, ACCESS_SECRET) as AuthUser;
    req.user = decoded;
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

    if (permissions.includes(requiredPermission)) {
      return next();
    }

    return next(new AppError(403, `Access denied. You do not have permission to perform this action (${requiredPermission}).`));
  };
};
