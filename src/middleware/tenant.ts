import { Request, Response, NextFunction } from 'express';
import { tenantStorage, getPrismaClientForSchema } from '../config/db';

export const tenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Extract tenant schema name from request header 'X-Tenant-Id'
  const tenantHeader = req.headers['x-tenant-id'] as string;
  
  // Default schema name is 'public'
  const schemaName = tenantHeader && tenantHeader.toLowerCase() !== 'public'
    ? `tenant_${tenantHeader.toLowerCase().replace(/[^a-z0-9_]/g, '')}`
    : 'public';
  
  try {
    const client = getPrismaClientForSchema(schemaName);
    tenantStorage.run(client, () => {
      next();
    });
  } catch (err) {
    next(err);
  }
};
