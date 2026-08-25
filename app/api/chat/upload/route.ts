import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import {
  uploadBufferToStorage,
  generateChatStoragePath,
  CHAT_MEDIA_BUCKET,
  sanitizeExtension,
} from "@/lib/media-storage";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check if the request is JSON (Direct Upload Completion / Metadata creation)
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      const {
        receiverId,
        mediaUrl,
        thumbnailUrl,
        type = "image",
        mimeType,
        fileSize,
        width,
        height,
        duration,
        storagePath,
        replyTo,
      } = body;

      if (!receiverId || !mediaUrl) {
        return NextResponse.json({ error: "Receiver ID and Media URL are required" }, { status: 400 });
      }

      let userId = (session.user as any)?.id as string | undefined;
      if (!userId) {
        const found = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true },
        });
        if (!found) return NextResponse.json({ error: "User not found" }, { status: 404 });
        userId = found.id;
      }

      // Un-hide chat for both users
      prisma.hiddenSocialChat
        .deleteMany({
          where: {
            OR: [
              { userId, hiddenUserId: receiverId },
              { userId: receiverId, hiddenUserId: userId },
            ],
          },
        })
        .catch(() => {});

      const message = await prisma.socialMessage.create({
        data: {
          content: mediaUrl,
          type: type || "image",
          senderId: userId,
          receiverId,
          ...(replyTo
            ? {
                replyToId: replyTo.id,
                replyToContent: replyTo.content,
                replyToSenderName: replyTo.senderName,
              }
            : {}),
        },
        include: {
          reactions: true,
        },
      });

      return NextResponse.json({
        success: true,
        message,
        metadata: {
          thumbnailUrl,
          mimeType,
          fileSize,
          width,
          height,
          duration,
          storagePath,
        },
      });
    }

    // Fallback: multipart/form-data upload
    const formData = await req.formData();
    const rawFiles = formData.getAll("files").concat(formData.getAll("file")) as File[];
    const files = rawFiles.filter((f) => f && typeof f !== "string" && f.size > 0);
    const receiverId = formData.get("receiverId") as string | null;
    const singleType = (formData.get("type") as string | null) || "file";

    if (!receiverId) {
      return NextResponse.json({ error: "Receiver ID is required" }, { status: 400 });
    }

    let userId = (session.user as any)?.id as string | undefined;
    if (!userId) {
      const found = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      });
      if (!found) return NextResponse.json({ error: "User not found" }, { status: 404 });
      userId = found.id;
    }
    const currentUserId = userId;

    // Un-hide chat if previously hidden
    prisma.hiddenSocialChat
      .deleteMany({
        where: {
          OR: [
            { userId: currentUserId, hiddenUserId: receiverId },
            { userId: receiverId, hiddenUserId: currentUserId },
          ],
        },
      })
      .catch(() => {});

    const uploadSingleBufferToSupabase = async (
      buffer: Buffer,
      originalName: string,
      mimeTypeInput?: string
    ): Promise<{ url: string; type: string; storagePath: string }> => {
      let itemType = singleType;
      const mime = (mimeTypeInput || "").toLowerCase();

      if (mime.startsWith("image/") || [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"].includes(sanitizeExtension(originalName))) {
        itemType = "image";
      } else if (mime.startsWith("video/") || [".mp4", ".webm", ".mov", ".mkv"].includes(sanitizeExtension(originalName))) {
        itemType = "video";
      } else if (mime.startsWith("audio/") || [".mp3", ".wav", ".ogg", ".webm", ".m4a"].includes(sanitizeExtension(originalName))) {
        itemType = "voice";
      }

      const messageId = "msg-" + Date.now();
      const storagePath = generateChatStoragePath(
        currentUserId,
        receiverId,
        messageId,
        originalName,
        mime || "application/octet-stream"
      );

      const { url } = await uploadBufferToStorage(
        CHAT_MEDIA_BUCKET,
        storagePath,
        buffer,
        mime || "application/octet-stream"
      );

      return { url, type: itemType, storagePath };
    };

    if (files.length > 1) {
      const uploadedItems = await Promise.all(
        files.map(async (f) => {
          const bytes = await f.arrayBuffer();
          const buffer = Buffer.from(bytes);
          const { url, type, storagePath } = await uploadSingleBufferToSupabase(
            buffer,
            f.name || "media",
            f.type
          );
          return { url, type, name: f.name || "media", storagePath };
        })
      );

      const message = await prisma.socialMessage.create({
        data: {
          content: JSON.stringify(uploadedItems),
          type: "media_album",
          senderId: currentUserId,
          receiverId: receiverId,
        },
        include: {
          reactions: true,
        },
      });

      return NextResponse.json({ success: true, message, items: uploadedItems });
    } else if (files.length === 1) {
      const f = files[0];
      const bytes = await f.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const { url, type, storagePath } = await uploadSingleBufferToSupabase(
        buffer,
        f.name || "media",
        f.type
      );

      const message = await prisma.socialMessage.create({
        data: {
          content: url,
          type: type,
          senderId: currentUserId,
          receiverId: receiverId,
        },
        include: {
          reactions: true,
        },
      });

      return NextResponse.json({ success: true, message, storagePath });
    } else {
      return NextResponse.json({ error: "No media file provided" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[CHAT_UPLOAD_ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process media upload" },
      { status: 500 }
    );
  }
}
