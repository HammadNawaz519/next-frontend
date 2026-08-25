import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { deleteFilesFromStorage, CHAT_MEDIA_BUCKET, PUBLIC_MEDIA_BUCKET } from "@/lib/media-storage";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { paths = [], bucket = CHAT_MEDIA_BUCKET } = body;

    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const targetBucket = bucket === "public-media" ? PUBLIC_MEDIA_BUCKET : CHAT_MEDIA_BUCKET;
    const success = await deleteFilesFromStorage(targetBucket, paths);

    return NextResponse.json({
      success,
      deletedCount: paths.length,
    });
  } catch (error: any) {
    console.error("[DELETE_MEDIA_ERROR]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to delete media" },
      { status: 500 }
    );
  }
}
