import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

export const isCloudinaryConfigured = (): boolean => {
  const cName = process.env.CLOUDINARY_CLOUD_NAME;
  const k = process.env.CLOUDINARY_API_KEY;
  const s = process.env.CLOUDINARY_API_SECRET;
  const url = process.env.CLOUDINARY_URL;
  return Boolean((cName && k && s) || url);
};

export const getCloudinaryInstance = () => {
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloudinary_url: process.env.CLOUDINARY_URL,
      secure: true,
    });
  } else if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  return cloudinary;
};

/**
 * Uploads a buffer to Cloudinary — NO eager transforms so upload is instant.
 * Quality/format optimization is applied at delivery time via URL params.
 */
export async function uploadToCloudinary(
  buffer: Buffer,
  folder: string = "connect/chat",
  resourceType: "auto" | "image" | "video" | "raw" = "auto"
): Promise<{ url: string; publicId: string; format: string; bytes: number }> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary credentials are not configured in environment variables.");
  }

  const cld = getCloudinaryInstance();

  return new Promise((resolve, reject) => {
    const uploadStream = cld.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        // No eager transforms — raw upload is significantly faster.
        // Quality/format is applied on-the-fly by Cloudinary's CDN at delivery.
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
