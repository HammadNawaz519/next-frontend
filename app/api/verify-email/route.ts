import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json() as { email: string; code: string };

    if (!email || !code) {
      return NextResponse.json(
        { message: "Email and code are required." },
        { status: 400 }
      );
    }

    const pending = await prisma.pendingUser.findUnique({ where: { email } });

    if (!pending) {
      return NextResponse.json(
        { message: "No pending registration found for this email." },
        { status: 404 }
      );
    }

    if (new Date() > pending.verifyExpiry) {
      await prisma.pendingUser.delete({ where: { email } });
      return NextResponse.json(
        { message: "Verification code expired. Please sign up again." },
        { status: 400 }
      );
    }

    if (pending.verifyCode !== code.trim()) {
      return NextResponse.json(
        { message: "Invalid verification code." },
        { status: 400 }
      );
    }

    // Promote PendingUser → real User
    await prisma.user.create({
      data: {
        email: pending.email,
        username: pending.username,
        name: pending.username,
        password: pending.password,
        emailVerified: new Date(),
      },
    });

    // Clean up pending record
    await prisma.pendingUser.delete({ where: { email } });

    return NextResponse.json({ message: "Email verified successfully." }, { status: 200 });
  } catch (error) {
    console.error("[VERIFY_EMAIL_ERROR]", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
