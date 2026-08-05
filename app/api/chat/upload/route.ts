import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import * as fs from "fs";
import * as path from "path";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true }
    });

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const receiverId = formData.get("receiverId") as string | null;
    let type = (formData.get("type") as string | null) || "file";
    const base64Data = formData.get("base64") as string | null;

    if (!receiverId) {
      return NextResponse.json({ error: "Receiver ID is required" }, { status: 400 });
    }

    let fileUrl = "";

    if (file && typeof file !== "string") {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Determine extension
      const originalName = file.name || "media";
      let ext = path.extname(originalName).toLowerCase();
      if (!ext) {
        if (file.type.includes("png")) ext = ".png";
        else if (file.type.includes("jpeg") || file.type.includes("jpg")) ext = ".jpg";
        else if (file.type.includes("gif")) ext = ".gif";
        else if (file.type.includes("webm")) ext = ".webm";
        else if (file.type.includes("mp4")) ext = ".mp4";
        else if (file.type.includes("ogg")) ext = ".ogg";
        else ext = ".bin";
      }

      if (file.type.startsWith("image/")) type = "image";
      else if (file.type.startsWith("video/")) type = "video";
      else if (file.type.startsWith("audio/")) type = "voice";

      const uploadsDir = path.join(process.cwd(), "public", "uploads", "chat");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, buffer);

      fileUrl = `/uploads/chat/${filename}`;
    } else if (base64Data && base64Data.startsWith("data:")) {
      // Handle base64 fallback
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const rawBuffer = Buffer.from(matches[2], "base64");

        let ext = ".bin";
        if (mimeType.includes("png")) ext = ".png";
        else if (mimeType.includes("jpeg") || mimeType.includes("jpg")) ext = ".jpg";
        else if (mimeType.includes("gif")) ext = ".gif";
        else if (mimeType.includes("webm")) ext = ".webm";
        else if (mimeType.includes("mp4")) ext = ".mp4";
        else if (mimeType.includes("ogg")) ext = ".ogg";

        if (mimeType.startsWith("image/")) type = "image";
        else if (mimeType.startsWith("video/")) type = "video";
        else if (mimeType.startsWith("audio/")) type = "voice";

        const uploadsDir = path.join(process.cwd(), "public", "uploads", "chat");
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${ext}`;
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, rawBuffer);

        fileUrl = `/uploads/chat/${filename}`;
      } else {
        return NextResponse.json({ error: "Invalid base64 format" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "No file or media data provided" }, { status: 400 });
    }

    // Un-hide chat if previously hidden
    await prisma.hiddenSocialChat.deleteMany({
      where: {
        OR: [
          { userId: currentUser.id, hiddenUserId: receiverId },
          { userId: receiverId, hiddenUserId: currentUser.id }
        ]
      }
    });

    const message = await prisma.socialMessage.create({
      data: {
        content: fileUrl,
        type: type,
        senderId: currentUser.id,
        receiverId: receiverId
      },
      include: {
        reactions: true
      }
    });

    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    console.error("[CHAT_UPLOAD_ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process media upload" },
      { status: 500 }
    );
  }
}
