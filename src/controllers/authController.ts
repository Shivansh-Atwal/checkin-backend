import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRepository } from '../repositories/UserRepository';
import { AppError } from '../middleware/errorHandler';
import prisma from '../config/db';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'default-hotelflow-jwt-access-secret-key-reception';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'default-hotelflow-jwt-refresh-secret-key-owner';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

export class AuthController {
  static async login(req: Request, res: Response, next: NextFunction) {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError(400, 'Email and password are required.'));
    }

    try {
      const user = await UserRepository.findByEmail(email);
      if (!user || user.isDisabled) {
        return next(new AppError(401, 'Invalid credentials or account disabled.'));
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return next(new AppError(401, 'Invalid credentials.'));
      }

      // Compile permissions: Role permissions or direct overrides
      const allPermissions = user.hasCustomPermissions
        ? user.userPermissions.map((up) => up.permission.name)
        : user.role.permissions.map((rp) => rp.permission.name);

      // Create tokens
      const accessToken = jwt.sign(
        {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role.name,
          permissions: allPermissions,
        },
        ACCESS_SECRET as jwt.Secret,
        { expiresIn: ACCESS_EXPIRY as any }
      );

      const refreshToken = jwt.sign(
        { id: user.id },
        REFRESH_SECRET as jwt.Secret,
        { expiresIn: REFRESH_EXPIRY as any }
      );

      // Record Login History
      await prisma.loginHistory.create({
        data: {
          userId: user.id,
          ipAddress: (req.ip as string) || null,
          userAgent: req.headers['user-agent'] || null,
        },
      });

      res.status(200).json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role.name,
            permissions: allPermissions,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async refresh(req: Request, res: Response, next: NextFunction) {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return next(new AppError(400, 'Refresh token is required.'));
    }

    try {
      const decoded = jwt.verify(refreshToken, REFRESH_SECRET as jwt.Secret) as { id: string };
      const user = await UserRepository.findById(decoded.id);

      if (!user || user.isDisabled) {
        return next(new AppError(401, 'User account not found or disabled.'));
      }

      // Compile permissions: Role permissions or direct overrides
      const allPermissions = user.hasCustomPermissions
        ? user.userPermissions.map((up) => up.permission.name)
        : user.role.permissions.map((rp) => rp.permission.name);

      const newAccessToken = jwt.sign(
        {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role.name,
          permissions: allPermissions,
        },
        ACCESS_SECRET as jwt.Secret,
        { expiresIn: ACCESS_EXPIRY as any }
      );

      res.status(200).json({
        success: true,
        data: {
          accessToken: newAccessToken,
        },
      });
    } catch (error) {
      return next(new AppError(401, 'Invalid or expired refresh token.'));
    }
  }

  static async getProfile(req: Request, res: Response, next: NextFunction) {
    if (!req.user) {
      return next(new AppError(401, 'Not authenticated.'));
    }

    try {
      const user = await UserRepository.findById(req.user.id);
      if (!user) {
        return next(new AppError(404, 'User not found.'));
      }

      res.status(200).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role.name,
          isDisabled: user.isDisabled,
          permissions: req.user.permissions,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
