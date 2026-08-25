export interface OptimizedMediaResult {
  file: File | Blob;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailBlob?: Blob;
  mimeType: string;
  fileSize: number;
}

export const MEDIA_LIMITS = {
  MAX_IMAGE_SIZE: 25 * 1024 * 1024, // 25 MB
  MAX_VIDEO_SIZE: 100 * 1024 * 1024, // 100 MB
  MAX_VOICE_SIZE: 25 * 1024 * 1024, // 25 MB
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50 MB
};

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/svg+xml",
];

export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  "video/ogg",
];

export const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
  "audio/aac",
  "audio/m4a",
];

/**
 * Validates a file's type and size.
 */
export function validateMediaFile(
  file: File,
  expectedType: "image" | "video" | "voice" | "file" = "file"
): { isValid: boolean; error?: string } {
  if (!file) return { isValid: false, error: "No file provided" };

  const mime = file.type.toLowerCase();
  const size = file.size;

  if (expectedType === "image" || mime.startsWith("image/")) {
    if (size > MEDIA_LIMITS.MAX_IMAGE_SIZE) {
      return { isValid: false, error: "Image exceeds the 25MB limit." };
    }
  } else if (expectedType === "video" || mime.startsWith("video/")) {
    if (size > MEDIA_LIMITS.MAX_VIDEO_SIZE) {
      return { isValid: false, error: "Video exceeds the 100MB limit." };
    }
  } else if (expectedType === "voice" || mime.startsWith("audio/")) {
    if (size > MEDIA_LIMITS.MAX_VOICE_SIZE) {
      return { isValid: false, error: "Audio exceeds the 25MB limit." };
    }
  } else {
    if (size > MEDIA_LIMITS.MAX_FILE_SIZE) {
      return { isValid: false, error: "File exceeds the 50MB limit." };
    }
  }

  return { isValid: true };
}

/**
 * Optimizes an image client-side (resizes to HD 1080p/1920p max dimension & compresses).
 */
export async function optimizeImageClient(
  file: File,
  maxDimension = 1920,
  quality = 0.85
): Promise<OptimizedMediaResult> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return {
      file,
      mimeType: file.type,
      fileSize: file.size,
    };
  }

  return new Promise((resolve) => {
    const fallbackTimeout = setTimeout(() => {
      resolve({
        file,
        mimeType: file.type,
        fileSize: file.size,
      });
    }, 2500);

    try {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        try {
          URL.revokeObjectURL(url);
          clearTimeout(fallbackTimeout);

          let { width, height } = img;
          const originalWidth = width;
          const originalHeight = height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");

          if (!ctx) {
            resolve({
              file,
              width: originalWidth,
              height: originalHeight,
              mimeType: file.type,
              fileSize: file.size,
            });
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Generate lightweight thumbnail
          const thumbCanvas = document.createElement("canvas");
          const thumbDim = 320;
          let tw = width;
          let th = height;
          if (tw > thumbDim || th > thumbDim) {
            if (tw > th) {
              th = Math.round((th * thumbDim) / tw);
              tw = thumbDim;
            } else {
              tw = Math.round((tw * thumbDim) / th);
              th = thumbDim;
            }
          }
          thumbCanvas.width = tw;
          thumbCanvas.height = th;
          const thumbCtx = thumbCanvas.getContext("2d");
          if (thumbCtx) {
            thumbCtx.drawImage(img, 0, 0, tw, th);
          }

          thumbCanvas.toBlob(
            (thumbBlob) => {
              canvas.toBlob(
                (blob) => {
                  if (blob && blob.size < file.size) {
                    const optimizedFile = new File(
                      [blob],
                      file.name.replace(/\.[^/.]+$/, "") + ".jpg",
                      { type: "image/jpeg" }
                    );
                    resolve({
                      file: optimizedFile,
                      width,
                      height,
                      thumbnailBlob: thumbBlob || undefined,
                      mimeType: "image/jpeg",
                      fileSize: optimizedFile.size,
                    });
                  } else {
                    resolve({
                      file,
                      width: originalWidth,
                      height: originalHeight,
                      thumbnailBlob: thumbBlob || undefined,
                      mimeType: file.type,
                      fileSize: file.size,
                    });
                  }
                },
                "image/jpeg",
                quality
              );
            },
            "image/jpeg",
            0.7
          );
        } catch (err) {
          clearTimeout(fallbackTimeout);
          resolve({ file, mimeType: file.type, fileSize: file.size });
        }
      };

      img.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
        clearTimeout(fallbackTimeout);
        resolve({ file, mimeType: file.type, fileSize: file.size });
      };

      img.src = url;
    } catch (err) {
      clearTimeout(fallbackTimeout);
      resolve({ file, mimeType: file.type, fileSize: file.size });
    }
  });
}

/**
 * Extracts video duration, dimensions, and generates a poster thumbnail frame.
 */
export async function extractVideoMetadataAndThumbnail(
  file: File
): Promise<OptimizedMediaResult> {
  return new Promise((resolve) => {
    const fallbackTimeout = setTimeout(() => {
      resolve({
        file,
        mimeType: file.type || "video/mp4",
        fileSize: file.size,
      });
    }, 4000);

    try {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(0.5, Math.max(0, video.duration / 4));
      };

      video.onseeked = () => {
        try {
          clearTimeout(fallbackTimeout);
          const duration = video.duration || 0;
          const width = video.videoWidth || 640;
          const height = video.videoHeight || 360;

          const canvas = document.createElement("canvas");
          const maxThumbDim = 480;
          let tw = width;
          let th = height;
          if (tw > maxThumbDim || th > maxThumbDim) {
            if (tw > th) {
              th = Math.round((th * maxThumbDim) / tw);
              tw = maxThumbDim;
            } else {
              tw = Math.round((tw * maxThumbDim) / th);
              th = maxThumbDim;
            }
          }
          canvas.width = tw;
          canvas.height = th;

          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, tw, th);
            canvas.toBlob(
              (thumbnailBlob) => {
                URL.revokeObjectURL(url);
                resolve({
                  file,
                  width,
                  height,
                  duration: Math.round(duration * 10) / 10,
                  thumbnailBlob: thumbnailBlob || undefined,
                  mimeType: file.type || "video/mp4",
                  fileSize: file.size,
                });
              },
              "image/jpeg",
              0.75
            );
          } else {
            URL.revokeObjectURL(url);
            resolve({
              file,
              width,
              height,
              duration: Math.round(duration * 10) / 10,
              mimeType: file.type || "video/mp4",
              fileSize: file.size,
            });
          }
        } catch (err) {
          URL.revokeObjectURL(url);
          clearTimeout(fallbackTimeout);
          resolve({ file, mimeType: file.type || "video/mp4", fileSize: file.size });
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        clearTimeout(fallbackTimeout);
        resolve({ file, mimeType: file.type || "video/mp4", fileSize: file.size });
      };

      video.src = url;
    } catch (err) {
      clearTimeout(fallbackTimeout);
      resolve({ file, mimeType: file.type || "video/mp4", fileSize: file.size });
    }
  });
}

/**
 * Uploads a file with real-time percentage progress callback using XMLHttpRequest.
 */
export function uploadBinaryWithProgress(
  uploadUrl: string,
  data: Blob | File | BufferSource,
  contentType: string,
  onProgress?: (progressPercent: number) => void
): Promise<{ success: boolean; status: number; responseText?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve({ success: true, status: xhr.status, responseText: xhr.responseText });
      } else {
        reject(new Error(`Upload failed with HTTP status ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error during direct upload"));
    };

    xhr.ontimeout = () => {
      reject(new Error("Upload timed out"));
    };

    xhr.send(data);
  });
}
