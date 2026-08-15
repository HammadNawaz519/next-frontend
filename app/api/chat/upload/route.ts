import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { isR2Configured, uploadToR2 } from "@/lib/r2";
import { isCloudinaryConfigured, uploadToCloudinary } from "@/lib/cloudinary";
import * as fs from "fs";
import * as path from "path";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const formData = await req.formData();
    const rawFiles = formData.getAll("files").concat(formData.getAll("file")) as File[];
    const files = rawFiles.filter(f => f && typeof f !== "string" && f.size > 0);
    const receiverId = formData.get("receiverId") as string | null;
    let singleType = (formData.get("type") as string | null) || "file";
    const base64Data = formData.get("base64") as string | null;

    if (!receiverId) {
      return NextResponse.json({ error: "Receiver ID is required" }, { status: 400 });
    }

    // Use id from JWT session first (fastest path), fall back to DB lookup
    let userId = (session.user as any)?.id as string | undefined;
    if (!userId) {
      const found = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true }
      });
      if (!found) return NextResponse.json({ error: "User not found" }, { status: 404 });
      userId = found.id;
    }
    const currentUserId = userId;

    // Fire-and-forget: un-hide chat (non-critical, doesn't block upload)
    prisma.hiddenSocialChat.deleteMany({
      where: {
        OR: [
          { userId: currentUserId, hiddenUserId: receiverId },
          { userId: receiverId, hiddenUserId: currentUserId }
        ]
      }
    }).catch(() => {});

    const uploadSingleBuffer = async (buffer: Buffer, originalName: string, mimeTypeInput?: string): Promise<{ url: string; type: string }> => {
      let ext = path.extname(originalName).toLowerCase();
      let itemType = "file";
      const mime = (mimeTypeInput || "").toLowerCase();

      if (mime.startsWith("image/") || [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".heic"].includes(ext)) {
        itemType = "image";
        if (!ext) ext = ".jpg";
      } else if (mime.startsWith("video/") || [".mp4", ".webm", ".mov", ".mkv"].includes(ext)) {
        itemType = "video";
        if (!ext) ext = ".mp4";
      } else if (mime.startsWith("audio/") || [".mp3", ".wav", ".ogg", ".webm", ".m4a"].includes(ext)) {
        itemType = "voice";
        if (!ext) ext = ".mp3";
      } else {
        if (!ext) ext = ".bin";
      }

      const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;

      if (isCloudinaryConfigured()) {
        const resourceType = itemType === "image" ? "image" : itemType === "video" || itemType === "voice" ? "video" : "auto";
        const cldResult = await uploadToCloudinary(buffer, `connect/chat/${currentUserId}`, resourceType);
        return { url: cldResult.url, type: itemType };
      } else if (isR2Configured()) {
        const r2Result = await uploadToR2(buffer, `chat/${currentUserId}/${filename}`, mime || "application/octet-stream");
        return { url: r2Result.url, type: itemType };
      } else {
        const uploadsDir = path.join(process.cwd(), "public", "uploads", "chat");
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, buffer);
        return { url: `/uploads/chat/${filename}`, type: itemType };
      }
    };

    // Un-hide chat if previously hidden
    await prisma.hiddenSocialChat.deleteMany({
      where: {
        OR: [
          { userId: currentUserId, hiddenUserId: receiverId },
          { userId: receiverId, hiddenUserId: currentUserId }
        ]
      }
    });

    if (files.length > 1) {
      // Parallel concurrent upload for all files in batch
      const uploadedItems = await Promise.all(
        files.map(async (f) => {
          const bytes = await f.arrayBuffer();
          const buffer = Buffer.from(bytes);
          const { url, type } = await uploadSingleBuffer(buffer, f.name || "media", f.type);
          return { url, type, name: f.name || "media" };
        })
      );

      const message = await prisma.socialMessage.create({
        data: {
          content: JSON.stringify(uploadedItems),
          type: "media_album",
          senderId: currentUserId,
          receiverId: receiverId
        },
        include: {
          reactions: true
        }
      });

      return NextResponse.json({ success: true, message, items: uploadedItems });
    } else if (files.length === 1) {
      const f = files[0];
      const bytes = await f.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const { url, type } = await uploadSingleBuffer(buffer, f.name || "media", f.type);

      const message = await prisma.socialMessage.create({
        data: {
          content: url,
          type: type,
          senderId: currentUserId,
          receiverId: receiverId
        },
        include: {
          reactions: true
        }
      });

      return NextResponse.json({ success: true, message });
    } else if (base64Data && base64Data.startsWith("data:")) {
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const rawBuffer = Buffer.from(matches[2], "base64");
        const { url, type } = await uploadSingleBuffer(rawBuffer, "upload" + Date.now(), mimeType);

        const message = await prisma.socialMessage.create({
          data: {
            content: url,
            type: type,
            senderId: currentUserId,
            receiverId: receiverId
          },
          include: {
            reactions: true
          }
        });

        return NextResponse.json({ success: true, message });
      } else {
        return NextResponse.json({ error: "Invalid base64 format" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "No file or media data provided" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[CHAT_UPLOAD_ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process media upload" },
      { status: 500 }
    );
  }
}
