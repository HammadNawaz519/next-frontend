import {
  getSupabaseAdminClient,
  getSupabaseClient,
  CHAT_MEDIA_BUCKET,
  PUBLIC_MEDIA_BUCKET,
  SUPABASE_URL,
} from "./supabase";
import * as path from "path";
import * as fs from "fs";

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
 * Server-side upload of a buffer to Supabase Storage with local & data URL fallback.
 */
export async function uploadBufferToStorage(
  bucket: string,
  storagePath: string,
  buffer: Buffer,
  contentType: string = "application/octet-stream"
): Promise<{ url: string; path: string }> {
  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

    if (!error) {
      const url = getStoragePublicUrl(bucket, storagePath);
      return { url, path: storagePath };
    }
    console.warn("[Storage] Supabase upload failed, activating local storage fallback:", error.message);
  } catch (err: any) {
    console.warn("[Storage] Supabase client error, activating fallback:", err?.message);
  }

  // Fallback 1: Save to public/uploads/
  try {
    const publicUploadDir = path.join(process.cwd(), "public", "uploads", bucket);
    if (!fs.existsSync(publicUploadDir)) {
      fs.mkdirSync(publicUploadDir, { recursive: true });
    }
    const cleanFileName = storagePath.replace(/[^a-zA-Z0-9._-]/g, "_");
    const localFilePath = path.join(publicUploadDir, cleanFileName);
    fs.writeFileSync(localFilePath, buffer);
    return {
      url: `/uploads/${bucket}/${cleanFileName}`,
      path: storagePath,
    };
  } catch (localErr: any) {
    console.warn("[Storage] Local filesystem write fallback:", localErr?.message);
    // Fallback 2: Data URL
    const base64 = buffer.toString("base64");
    return {
      url: `data:${contentType};base64,${base64}`,
      path: storagePath,
    };
  }
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

/**
 * Empties an entire storage bucket of all files and folders.
 */
export async function emptyStorageBucket(bucket: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data: files, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
    if (error || !files || files.length === 0) return true;

    const pathsToDelete: string[] = [];
    for (const item of files) {
      if (item.name) {
        pathsToDelete.push(item.name);
        const { data: subFiles } = await supabase.storage.from(bucket).list(item.name, { limit: 1000 });
        if (subFiles && subFiles.length > 0) {
          for (const subItem of subFiles) {
            pathsToDelete.push(`${item.name}/${subItem.name}`);
            const { data: deepFiles } = await supabase.storage.from(bucket).list(`${item.name}/${subItem.name}`, { limit: 1000 });
            if (deepFiles && deepFiles.length > 0) {
              for (const deep of deepFiles) {
                pathsToDelete.push(`${item.name}/${subItem.name}/${deep.name}`);
              }
            }
          }
        }
      }
    }
    if (pathsToDelete.length > 0) {
      await supabase.storage.from(bucket).remove(pathsToDelete);
    }
    return true;
  } catch (e) {
    console.warn(`[Storage] Failed to empty bucket ${bucket}:`, e);
    return false;
  }
}
