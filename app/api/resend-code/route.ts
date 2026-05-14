import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/mail";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ message: "Email is required." }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ message: "Email already verified." }, { status: 400 });
    }

    const pending = await prisma.pendingUser.findUnique({ where: { email } });

    if (!pending) {
      return NextResponse.json({ message: "No pending registration found." }, { status: 404 });
    }

    // Rate limit: only resend if last code was sent > 60s ago (or expired)
    if (pending.verifyExpiry) {
      const sentAt = new Date(pending.verifyExpiry.getTime() - 15 * 60 * 1000);
      const secondsSinceSent = (Date.now() - sentAt.getTime()) / 1000;
      if (secondsSinceSent < 60) {
        const wait = Math.ceil(60 - secondsSinceSent);
        return NextResponse.json(
          { message: `Please wait ${wait}s before requesting a new code.`, wait },
          { status: 429 }
        );
      }
    }

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.pendingUser.update({
      where: { email },
      data: { verifyCode: otp, verifyExpiry: expiry },
    });

    sendVerificationEmail(email, otp, pending.username).catch((err) =>
      console.error("[RESEND_MAIL_ERROR]", err)
    );

    return NextResponse.json({ message: "Verification code resent." }, { status: 200 });
  } catch (error) {
    console.error("[RESEND_CODE_ERROR]", error);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}
