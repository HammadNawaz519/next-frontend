import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

import { sendVerificationEmail } from "@/lib/mail";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: Request) {
  try {
    const { username, email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { message: "Email and password are required." },
        { status: 400 }
      );
    }

    // Block if a verified User already exists with this email
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { message: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // Block if username is already taken by a real (verified) user
    if (username) {
      const existingUsername = await prisma.user.findUnique({
        where: { username },
      });
      if (existingUsername) {
        return NextResponse.json(
          { message: "This username is already taken." },
          { status: 409 }
        );
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    console.log(`[DEV_OTP] Generated OTP for ${email}: ${otp}`);
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save/overwrite in PendingUser — not in User
    await prisma.pendingUser.upsert({
      where: { email },
      update: {
        username: username || null,
        password: hashedPassword,
        verifyCode: otp,
        verifyExpiry: expiry,
      },
      create: {
        email,
        username: username || null,
        password: hashedPassword,
        verifyCode: otp,
        verifyExpiry: expiry,
      },
    });

    // Send OTP email
    sendVerificationEmail(email, otp, username).catch((err) =>
      console.error("[MAIL_ERROR]", err)
    );

    return NextResponse.json(
      { message: "Verification code sent.", requiresVerification: true },
      { status: 200 }
    );
  } catch (error) {
    console.error("[REGISTER_ERROR]", error);
    return NextResponse.json(
      { message: "Internal server error. Please try again." },
      { status: 500 }
    );
  }
}
