import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/user/activity — update online/offline/heartbeat status
export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" };
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const email = session.user.email.toLowerCase().trim();
    const currentUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: session.user.email },
          { email: email }
        ]
      },
      select: { id: true, email: true }
    });

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let action: string = "heartbeat";
    try {
      const body = await req.json();
      action = body?.action || "heartbeat";
    } catch {
      // sendBeacon may send empty body
    }

    const now = new Date();

    let data: any = { lastHeartbeat: now, lastSeen: now };

    if (action === "online") {
      data = { isOnline: true, lastSeen: now, lastHeartbeat: now };
    } else if (action === "offline") {
      data = { isOnline: false, lastSeen: now, lastHeartbeat: now };
    }

    const user = await (prisma.user as any).update({
      where: { id: currentUser.id },
      data,
      select: {
        id: true,
        email: true,
        isOnline: true,
        lastSeen: true,
        lastHeartbeat: true,
        showActivityStatus: true,
      },
    });

    return NextResponse.json({ success: true, user }, { headers });
  } catch (error: any) {
    console.error("[ACTIVITY_UPDATE_ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update activity" },
      { status: 500, headers }
    );
  }
}

// GET /api/user/activity?userId=xxx — fetch another user's activity status
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const user = await (prisma.user as any).findUnique({
      where: { id: userId },
      select: {
        id: true,
        showActivityStatus: true,
        isOnline: true,
        lastSeen: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Privacy: if user has disabled activity status, return null for status fields
    if (!user.showActivityStatus) {
      return NextResponse.json({ showActivityStatus: false, isOnline: null, lastSeen: null });
    }

    return NextResponse.json({
      showActivityStatus: true,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen ? user.lastSeen.toISOString() : null,
    });
  } catch (error: any) {
    console.error("[ACTIVITY_GET_ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to get activity" },
      { status: 500 }
    );
  }
}

// PATCH /api/user/activity — toggle showActivityStatus
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const showActivityStatus = Boolean(body?.showActivityStatus);

    const user = await (prisma.user as any).update({
      where: { email: session.user.email },
      data: { showActivityStatus },
      select: { id: true, showActivityStatus: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (error: any) {
    console.error("[ACTIVITY_TOGGLE_ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to toggle activity status" },
      { status: 500 }
    );
  }
}
