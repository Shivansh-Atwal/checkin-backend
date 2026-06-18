import multer from 'multer';

// Use memory storage for clean buffer streaming to storage services (Disk or Cloudinary)
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Limit size to 5MB
  },
  fileFilter: (req, file, cb) => {
    // Validate image format
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image file uploads are supported.'));
    }
  },
});
