import {
  getSupabaseAdminClient,
  getSupabaseClient,
  CHAT_MEDIA_BUCKET,
  PUBLIC_MEDIA_BUCKET,
  SUPABASE_URL,
} from "./supabase";
import * as path from "path";

export { CHAT_MEDIA_BUCKET, PUBLIC_MEDIA_BUCKET, SUPABASE_URL };

export interface MediaUploadTicket {
  bucket: string;
  storagePath: string;
  thumbnailPath?: string;
  publicUrl: string;
  thumbnailUrl?: string;
  uploadUrl?: string;
  uploadToken?: string;
  thumbnailUploadUrl?: string;
}

/**
 * Sanitizes a filename and ensures a clean, safe extension.
 */
export function sanitizeExtension(originalName: string, mimeType?: string): string {
  let ext = path.extname(originalName).toLowerCase();
  const mime = (mimeType || "").toLowerCase();

  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("svg")) return ".svg";
  if (mime.includes("mp4")) return ".mp4";
  if (mime.includes("webm")) return mime.startsWith("audio/") ? ".webm" : ".webm";
  if (mime.includes("ogg")) return ".ogg";
  if (mime.includes("mp3") || mime.includes("mpeg")) return ".mp3";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("quicktime") || ext === ".mov") return ".mov";
  if (mime.includes("pdf")) return ".pdf";

  if (ext && /^\.[a-z0-9]{2,5}$/.test(ext)) {
    return ext;
  }
  return ".bin";
}

/**
 * Builds a deterministic, collision-free conversation key from two user IDs.
 */
export function getConversationKey(userId1: string, userId2: string): string {
  const sorted = [String(userId1).trim(), String(userId2).trim()].sort();
  return `${sorted[0]}_${sorted[1]}`;
}

/**
 * Generates an isolated storage path for chat media.
 */
export function generateChatStoragePath(
  senderId: string,
  receiverId: string,
  messageId: string,
  originalFilename: string,
  mimeType?: string,
  isThumbnail: boolean = false
): string {
  const convKey = getConversationKey(senderId, receiverId);
  const ext = isThumbnail ? ".jpg" : sanitizeExtension(originalFilename, mimeType);
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  const prefix = isThumbnail ? "thumb_" : "";
  return `chat/${convKey}/${messageId}/${prefix}${Date.now()}_${randomSuffix}${ext}`;
}

/**
 * Generates an isolated storage path for user avatars.
 */
export function generateAvatarStoragePath(userId: string, originalFilename: string, mimeType?: string): string {
  const ext = sanitizeExtension(originalFilename, mimeType);
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  return `avatars/${userId}/${Date.now()}_${randomSuffix}${ext}`;
}

/**
 * Generates an isolated storage path for public posts/reels.
 */
export function generatePostStoragePath(userId: string, originalFilename: string, mimeType?: string): string {
  const ext = sanitizeExtension(originalFilename, mimeType);
  const randomSuffix = Math.random().toString(36).substring(2, 10);
  return `posts/${userId}/${Date.now()}_${randomSuffix}${ext}`;
}

/**
 * Gets the public URL for a file stored in Supabase Storage.
 */
export function getStoragePublicUrl(bucket: string, storagePath: string): string {
  if (!storagePath) return "";
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return storagePath;
  }
  const cleanPath = storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${cleanPath}`;
}

/**
 * Server-side creation of a presigned upload URL or authorized storage ticket.
 */
export async function createMediaUploadTicket(
  senderId: string,
  receiverId: string,
  messageId: string,
  originalFilename: string,
  mimeType?: string,
  hasThumbnail: boolean = false
): Promise<MediaUploadTicket> {
  const supabase = getSupabaseAdminClient();
  const bucket = CHAT_MEDIA_BUCKET;
  const storagePath = generateChatStoragePath(senderId, receiverId, messageId, originalFilename, mimeType, false);
  const publicUrl = getStoragePublicUrl(bucket, storagePath);

  let thumbnailPath: string | undefined;
  let thumbnailUrl: string | undefined;

  if (hasThumbnail) {
    thumbnailPath = generateChatStoragePath(senderId, receiverId, messageId, originalFilename, "image/jpeg", true);
    thumbnailUrl = getStoragePublicUrl(bucket, thumbnailPath);
  }

  // Attempt to generate signed upload URL (if signed bucket is configured)
  let uploadUrl: string | undefined;
  let uploadToken: string | undefined;
  let thumbnailUploadUrl: string | undefined;

  try {
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(storagePath);
    if (!uploadErr && uploadData?.signedUrl) {
      uploadUrl = uploadData.signedUrl;
      uploadToken = uploadData.token;
    }
  } catch (e) {
    // Fallback: direct REST endpoint with anon/service key
  }

  if (hasThumbnail && thumbnailPath) {
    try {
      const { data: thumbData, error: thumbErr } = await supabase.storage
        .from(bucket)
        .createSignedUploadUrl(thumbnailPath);
      if (!thumbErr && thumbData?.signedUrl) {
        thumbnailUploadUrl = thumbData.signedUrl;
      }
    } catch (e) {
      // Fallback
    }
  }

  return {
    bucket,
    storagePath,
    thumbnailPath,
    publicUrl,
    thumbnailUrl,
    uploadUrl,
    uploadToken,
    thumbnailUploadUrl,
  };
}

/**
 * Server-side upload of a buffer directly to Supabase Storage (bypasses third-party CDNs).
 */
export async function uploadBufferToStorage(
  bucket: string,
  storagePath: string,
  buffer: Buffer,
  contentType: string = "application/octet-stream"
): Promise<{ url: string; path: string }> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload to Supabase Storage: ${error.message}`);
  }

  const url = getStoragePublicUrl(bucket, storagePath);
  return { url, path: storagePath };
}

/**
 * Deletes one or more files from Supabase Storage.
 */
export async function deleteFilesFromStorage(bucket: string, paths: string[]): Promise<boolean> {
  if (!paths || paths.length === 0) return true;
  try {
    const supabase = getSupabaseAdminClient();
    const cleanPaths = paths
      .filter(Boolean)
      .map((p) => {
        // Strip full URL if provided
        if (p.includes(`/storage/v1/object/public/${bucket}/`)) {
          return p.split(`/storage/v1/object/public/${bucket}/`)[1];
        }
        if (p.includes(`/storage/v1/object/sign/${bucket}/`)) {
          return p.split(`/storage/v1/object/sign/${bucket}/`)[1].split("?")[0];
        }
        return p.startsWith("/") ? p.slice(1) : p;
      })
      .filter(Boolean);

    if (cleanPaths.length === 0) return true;

    const { error } = await supabase.storage.from(bucket).remove(cleanPaths);
    if (error) {
      console.warn("[Storage] Delete error:", error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[Storage] Failed to delete media:", err?.message);
    return false;
  }
}
