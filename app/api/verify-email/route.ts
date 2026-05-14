import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json(
        { message: "Email and code are required." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json(
        { message: "No account found for this email." },
        { status: 404 }
      );
    }

    if (user.emailVerified) {
      return NextResponse.json(
        { message: "Email is already verified." },
        { status: 400 }
      );
    }

    if (!user.verifyCode || !user.verifyExpiry) {
      return NextResponse.json(
        { message: "No verification code found. Please request a new one." },
        { status: 400 }
      );
    }

    if (new Date() > user.verifyExpiry) {
      return NextResponse.json(
        { message: "Verification code has expired. Please request a new one." },
        { status: 400 }
      );
    }

    if (user.verifyCode !== code.trim()) {
      return NextResponse.json(
        { message: "Invalid verification code." },
        { status: 400 }
      );
    }

    // Mark verified, clear OTP fields
    await prisma.user.update({
      where: { email },
      data: {
        emailVerified: new Date(),
        verifyCode: null,
        verifyExpiry: null,
      },
    });

    return NextResponse.json(
      { message: "Email verified successfully." },
      { status: 200 }
    );
  } catch (error) {
    console.error("[VERIFY_EMAIL_ERROR]", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}
