import multer from 'multer';
import path from 'path';

// Use memory storage for clean buffer streaming to storage services (Disk or Cloudinary)
const storage = multer.memoryStorage();

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Limit size to 5MB
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error('Only image file uploads (.png, .jpg, .jpeg, .webp) are supported.'));
    }
    // Validate image format
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image file uploads are supported.'));
    }
  },
});
