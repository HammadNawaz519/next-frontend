import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/mail";

export const dynamic = "force-dynamic";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json() as { email: string };

    if (!email) {
      return NextResponse.json({ message: "Email is required." }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // If already verified, nothing to resend
    const verifiedUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true },
    });
    if (verifiedUser) {
      return NextResponse.json({ message: "Email already verified." }, { status: 400 });
    }

    const pending = await prisma.pendingUser.findUnique({ where: { email: cleanEmail } });
    if (!pending) {
      return NextResponse.json(
        { message: "No pending registration found." },
        { status: 404 }
      );
    }

    // Rate limit: only allow resend once every 60 seconds.
    // verifyExpiry is set to (sentAt + 15 minutes), so sentAt ≈ verifyExpiry - 15 minutes.
    // If the remaining TTL is > 14 minutes, the code was sent very recently (<60s ago).
    const OTP_TTL_MS = 15 * 60 * 1000;
    const remainingMs = pending.verifyExpiry.getTime() - Date.now();
    const secondsSinceSent = (OTP_TTL_MS - remainingMs) / 1000;

    if (remainingMs > 0 && secondsSinceSent < 60) {
      const wait = Math.ceil(60 - secondsSinceSent);
      return NextResponse.json(
        { message: `Please wait ${wait}s before requesting a new code.`, wait },
        { status: 429 }
      );
    }

    const otp = generateOTP();
    const expiry = new Date(Date.now() + OTP_TTL_MS);

    await prisma.pendingUser.update({
      where: { email: cleanEmail },
      data: { verifyCode: otp, verifyExpiry: expiry },
    });

    await sendVerificationEmail(cleanEmail, otp, pending.username || 'User');

    return NextResponse.json({ message: "Verification code resent." }, { status: 200 });
  } catch (error) {
    console.error("[RESEND_CODE_ERROR]", error);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
