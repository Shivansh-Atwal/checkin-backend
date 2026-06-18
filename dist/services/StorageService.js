"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// If credentials are provided in .env, we can interface with Cloudinary
const cloudinaryConfig = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
};
const isCloudinaryConfigured = !!cloudinaryConfig.cloudName &&
    !!cloudinaryConfig.apiKey &&
    !!cloudinaryConfig.apiSecret;
class StorageService {
    /**
     * Saves a file buffer locally or uploads it to Cloudinary
     * @returns URL of the uploaded asset
     */
    static async uploadFile(file, folder) {
        if (isCloudinaryConfigured) {
            try {
                // We can lazy load cloudinary to avoid errors if packages aren't fully resolved
                const cloudinary = require('cloudinary').v2;
                cloudinary.config({
                    cloud_name: cloudinaryConfig.cloudName,
                    api_key: cloudinaryConfig.apiKey,
                    api_secret: cloudinaryConfig.apiSecret,
                });
                return new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream({ folder: `hotelflow/${folder}` }, (error, result) => {
                        if (error)
                            return reject(error);
                        resolve(result.secure_url);
                    });
                    uploadStream.end(file.buffer);
                });
            }
            catch (err) {
                console.error('Cloudinary upload failed, falling back to local storage:', err);
            }
        }
        // Local Storage Fallback
        const uploadDir = path_1.default.join(__dirname, '..', '..', 'uploads', folder);
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        const fileExtension = path_1.default.extname(file.originalname);
        const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExtension}`;
        const destinationPath = path_1.default.join(uploadDir, uniqueFilename);
        await fs_1.default.promises.writeFile(destinationPath, file.buffer);
        // Return the relative URL served by Express static middleware
        return `/uploads/${folder}/${uniqueFilename}`;
    }
}
exports.StorageService = StorageService;
