import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/mail";

export const dynamic = "force-dynamic";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, email, password, phone } = body as {
      username?: string;
      email: string;
      password: string;
      phone?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { message: "Email and password are required." },
        { status: 400 }
      );
    }

    // Check if email is already a verified account
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { message: "An account with this email already exists." },
        { status: 409 }
      );
    }

    // Check username uniqueness
    if (username) {
      const takenUsername = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (takenUsername) {
        return NextResponse.json(
          { message: "This username is already taken." },
          { status: 409 }
        );
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    // Store in PendingUser — only promoted to User after OTP verified
    await prisma.pendingUser.upsert({
      where: { email },
      update: {
        username: username ?? null,
        phone: phone ?? null,
        password: hashedPassword,
        verifyCode: otp,
        verifyExpiry: expiry,
      },
      create: {
        email,
        username: username ?? null,
        phone: phone ?? null,
        password: hashedPassword,
        verifyCode: otp,
        verifyExpiry: expiry,
      },
    });

    // Send OTP email
    await sendVerificationEmail(email, otp, username);

    return NextResponse.json(
      { message: "Verification code sent.", requiresVerification: true },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[REGISTER_ERROR]", error);
    // If email send failed, surface a clear message
    if (error?.message?.toLowerCase().includes("mail")) {
      return NextResponse.json(
        { message: "Failed to send verification email. Check your email address." },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { message: "Internal server error. Please try again." },
      { status: 500 }
    );
  }
}
