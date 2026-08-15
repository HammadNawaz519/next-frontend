import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || "connect-media";
const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || "";

export const isR2Configured = (): boolean => {
  return Boolean(accountId && accessKeyId && secretAccessKey);
};

export const getR2Client = (): S3Client => {
  if (!isR2Configured()) {
    throw new Error("Cloudflare R2 is not configured. Missing credentials in environment.");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
    },
  });
};

/**
 * Uploads a binary buffer directly to Cloudflare R2 bucket
 */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<{ url: string; key: string }> {
  const s3 = getR2Client();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3.send(command);

  // If public URL / custom domain is configured, use it, otherwise use direct public R2 endpoint
  const finalPublicUrl = publicUrl.replace(/\/$/, "");
  const fileUrl = finalPublicUrl ? `${finalPublicUrl}/${key}` : `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${key}`;

  return {
    url: fileUrl,
    key,
  };
}

/**
 * Generates a presigned upload URL for direct client-to-R2 upload (bypasses server memory)
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 300
): Promise<{ uploadUrl: string; fileUrl: string; key: string }> {
  const s3 = getR2Client();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });

  const finalPublicUrl = publicUrl.replace(/\/$/, "");
  const fileUrl = finalPublicUrl ? `${finalPublicUrl}/${key}` : `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${key}`;

  return {
    uploadUrl,
    fileUrl,
    key,
  };
}
