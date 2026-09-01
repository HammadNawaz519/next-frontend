import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { createMediaUploadTicket } from "@/lib/media-storage";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const {
      receiverId,
      messageId = "msg-" + Date.now() + Math.random().toString(36).substring(7),
      filename = "media.bin",
      mimeType = "application/octet-stream",
      hasThumbnail = false,
    } = body;

    if (!receiverId) {
      return NextResponse.json({ error: "Receiver ID is required" }, { status: 400 });
    }

    let userId = (session.user as any)?.id as string | undefined;
    if (!userId) {
      const cleanEmail = session.user.email.toLowerCase().trim();
      const found = await prisma.user.findFirst({
        where: {
          OR: [
            { email: session.user.email },
            { email: cleanEmail }
          ]
        },
        select: { id: true },
      });
      if (!found) return NextResponse.json({ error: "User not found" }, { status: 404 });
      userId = found.id;
    }

    // Generate direct upload ticket
    const ticket = await createMediaUploadTicket(
      userId,
      receiverId,
      messageId,
      filename,
      mimeType,
      hasThumbnail
    );

    return NextResponse.json({
      success: true,
      ticket,
    });
  } catch (error: any) {
    console.error("[PRESIGN_MEDIA_ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate upload authorization" },
      { status: 500 }
    );
  }
}
