import { Request, Response, NextFunction } from 'express';
import { CustomerRepository } from '../repositories/CustomerRepository';
import { StorageService } from '../services/StorageService';
import { AuditLogService } from '../services/AuditLogService';
import { AppError } from '../middleware/errorHandler';

export class CustomerController {
  static async search(req: Request, res: Response, next: NextFunction) {
    try {
      const query = (req.query.q || '') as string;
      const customers = await CustomerRepository.search(query);
      res.status(200).json({
        success: true,
        data: customers,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const customer = await CustomerRepository.findById(id);
      if (!customer) {
        return next(new AppError(404, 'Customer profile not found.'));
      }
      res.status(200).json({
        success: true,
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    const { fullName, mobileNumber, alternateNumber, email, dob, gender, address, city, state, country, pincode, document } = req.body;

    if (!fullName || !mobileNumber) {
      return next(new AppError(400, 'Customer name and mobile number are required.'));
    }

    try {
      const existing = await CustomerRepository.findByMobile(mobileNumber);
      if (existing) {
        return next(new AppError(409, 'Customer with this mobile number already exists.'));
      }

      const parsedDob = dob ? new Date(dob) : undefined;

      const customer = await CustomerRepository.create({
        fullName,
        mobileNumber,
        alternateNumber,
        email,
        dob: parsedDob,
        gender,
        address,
        city,
        state,
        country,
        pincode,
        document,
      });

      // Log action
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Customer Created',
        ipAddress: req.ip as string,
        details: { customerId: customer?.id, mobileNumber },
      });

      res.status(201).json({
        success: true,
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    const id = req.params.id as string;
    try {
      const parsedDob = req.body.dob ? new Date(req.body.dob) : undefined;
      const customer = await CustomerRepository.update(id, {
        ...req.body,
        dob: parsedDob,
      });

      // Log action
      await AuditLogService.log({
        userId: req.user?.id,
        userName: req.user?.fullName,
        action: 'Customer Edited',
        ipAddress: req.ip as string,
        details: { customerId: id, updates: req.body },
      });

      res.status(200).json({
        success: true,
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  static async uploadDocument(req: Request, res: Response, next: NextFunction) {
    if (!req.file) {
      return next(new AppError(400, 'No document file uploaded.'));
    }

    const type = (req.query.type || 'documents') as 'documents' | 'customers';

    try {
      const fileUrl = await StorageService.uploadFile(req.file, type);
      res.status(200).json({
        success: true,
        data: { fileUrl },
      });
    } catch (error) {
      next(error);
    }
  }
}
