import fs from 'fs';
import path from 'path';

// If credentials are provided in .env, we can interface with Cloudinary
const cloudinaryConfig = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};

const isCloudinaryConfigured =
  !!cloudinaryConfig.cloudName &&
  !!cloudinaryConfig.apiKey &&
  !!cloudinaryConfig.apiSecret;

export class StorageService {
  /**
   * Saves a file buffer locally or uploads it to Cloudinary
   * @returns URL of the uploaded asset
   */
  static async uploadFile(
    file: Express.Multer.File,
    folder: 'documents' | 'rooms' | 'customers'
  ): Promise<string> {
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
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: `hotelflow/${folder}` },
            (error: any, result: any) => {
              if (error) return reject(error);
              resolve(result.secure_url);
            }
          );
          uploadStream.end(file.buffer);
        });
      } catch (err) {
        console.error('Cloudinary upload failed, falling back to local storage:', err);
      }
    }

    // Local Storage Fallback
    const uploadDir = path.join(__dirname, '..', '..', 'uploads', folder);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileExtension = path.extname(file.originalname);
    const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExtension}`;
    const destinationPath = path.join(uploadDir, uniqueFilename);

    await fs.promises.writeFile(destinationPath, file.buffer);

    // Return the relative URL served by Express static middleware
    return `/uploads/${folder}/${uniqueFilename}`;
  }
}
