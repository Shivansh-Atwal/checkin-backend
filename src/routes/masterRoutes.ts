import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import prisma from '../config/db';
import { RoomRepository } from '../repositories/RoomRepository';

const router = Router();

router.use(authenticate);

router.get('/room-types', async (req, res, next) => {
  try {
    const rooms = await prisma.room.findMany({ select: { capacity: true } });
    const values = Array.from(
      new Set(rooms.map((room) => (room.capacity > 2 ? 'Deluxe' : 'Standard')))
    ).sort();

    res.status(200).json({
      success: true,
      data: values.length > 0 ? values : ['Standard', 'Deluxe'],
    });
  } catch (error) {
    next(error);
  }
});

router.get('/categories', (req, res) => {
  res.status(200).json({
    success: true,
    data: ['Room', 'Food', 'Beverage', 'Laundry', 'Service', 'Other'],
  });
});

router.get('/room-status', (req, res) => {
  res.status(200).json({
    success: true,
    data: ['AVAILABLE', 'OCCUPIED', 'ADVANCE_BOOKED'],
  });
});

router.get('/customer-types', (req, res) => {
  res.status(200).json({
    success: true,
    data: ['Walk-In', 'Advance Booking', 'Corporate', 'Returning Guest'],
  });
});

router.get('/identity-types', (req, res) => {
  res.status(200).json({
    success: true,
    data: ['AADHAAR CARD', 'PAN CARD', 'PASSPORT', 'DRIVING LICENSE', 'VOTER ID'],
  });
});

router.get('/pricing', async (req, res, next) => {
  try {
    const rooms = await RoomRepository.getAll();
    const pricing = rooms.map((room) => ({
      roomId: room.id,
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      capacity: room.capacity,
      pricePerNight: 0,
    }));

    res.status(200).json({ success: true, data: pricing });
  } catch (error) {
    next(error);
  }
});

export default router;
