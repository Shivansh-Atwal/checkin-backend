"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
// Use memory storage for clean buffer streaming to storage services (Disk or Cloudinary)
const storage = multer_1.default.memoryStorage();
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
exports.upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // Limit size to 5MB
    },
    fileFilter: (req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return cb(new Error('Only image file uploads (.png, .jpg, .jpeg, .webp) are supported.'));
        }
        // Validate image format
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image file uploads are supported.'));
        }
    },
});
