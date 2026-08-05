import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let timestampIso: string | undefined;
    try {
      const body = await req.json();
      timestampIso = body?.timestamp;
    } catch {
      // Body may be empty on sendBeacon
    }

    const targetDate = timestampIso ? new Date(timestampIso) : new Date();

    const user = await prisma.user.update({
      where: { email: session.user.email },
      data: { lastSeen: targetDate },
      select: { id: true, email: true, lastSeen: true }
    });

    return NextResponse.json({
      success: true,
      lastSeen: user.lastSeen ? user.lastSeen.toISOString() : targetDate.toISOString()
    });
  } catch (error: any) {
    console.error("[LAST_SEEN_UPDATE_ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to update last seen" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
