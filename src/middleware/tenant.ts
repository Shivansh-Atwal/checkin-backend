import { Request, Response, NextFunction } from 'express';
import { tenantStorage, getPrismaClientForSchema, isValidSchema } from '../config/db';
import { AppError } from './errorHandler';

export const tenantMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const path = req.path;

  // Global public paths that do not require tenant database context resolution
  const globalBypassPaths = [
    '/health',
    '/favicon.ico',
    '/api/auth/login',
    '/api/auth/register-tenant',
    '/api/auth/refresh' // Refresh token has encoded tenant scope
  ];

  if (globalBypassPaths.some((p) => path.startsWith(p))) {
    return next();
  }

  const tenantHeader = req.headers['x-tenant-id'] as string;
  if (!tenantHeader) {
    return next(new AppError(400, 'X-Tenant-Id header is required to resolve tenant database context.'));
  }

  const slug = tenantHeader.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug) {
    return next(new AppError(400, 'Invalid tenant identifier format.'));
  }

  const schemaName = `tenant_${slug}`;

  if (!isValidSchema(schemaName)) {
    return next(new AppError(404, `Tenant context resolution failed: Invalid or inactive Tenant ID: '${tenantHeader}'`));
  }

  try {
    const client = getPrismaClientForSchema(schemaName);
    tenantStorage.run({ client, tenantId: schemaName }, () => {
      next();
    });
  } catch (err: any) {
    return next(new AppError(404, `Tenant context resolution failed: ${err.message}`));
  }
};
