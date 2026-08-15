import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

export const isCloudinaryConfigured = (): boolean => {
  return Boolean(cloudName && apiKey && apiSecret);
};

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

/**
 * Uploads a buffer or file to Cloudinary with automatic optimization (WebP/AVIF, adaptive compression)
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  folder: string = "connect/chat",
  resourceType: "auto" | "image" | "video" | "raw" = "auto"
): Promise<{ url: string; publicId: string; format: string; bytes: number }> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary credentials are not configured in environment variables.");
  }

  // Ensure config is applied
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        // Auto quality and auto format (delivers WebP/AVIF to modern browsers)
        transformation: [
          { quality: "auto" },
          { fetch_format: "auto" }
        ],
      },
      (error, result: UploadApiResponse | undefined) => {
        if (error || !result) {
          return reject(error || new Error("Failed to upload to Cloudinary"));
        }
        resolve({
          url: result.secure_url || result.url,
          publicId: result.public_id,
          format: result.format,
          bytes: result.bytes,
        });
      }
    );

    uploadStream.end(buffer);
  });
}
