import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userCount = await prisma.user.count();
    const accountCount = await prisma.account.count();

    return NextResponse.json({
      status: "connected ✅",
      database: "Supabase PostgreSQL (supabase)",
      tables: {
        users: userCount,
        accounts: accountCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error ❌", message: error.message },
      { status: 500 }
    );
  }
}
