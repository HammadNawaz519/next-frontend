import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { email, code, newPassword } = (await req.json()) as {
      email: string;
      code: string;
      newPassword: string;
    };

    if (!email || !code || !newPassword) {
      return NextResponse.json(
        { message: "Email, code, and new password are required." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const pending = await prisma.pendingUser.findUnique({ where: { email: cleanEmail } });

    if (!pending) {
      return NextResponse.json(
        { message: "No password reset request found for this email." },
        { status: 404 }
      );
    }

    if (new Date() > pending.verifyExpiry) {
      return NextResponse.json(
        { message: "Verification code expired. Please request a new code." },
        { status: 400 }
      );
    }

    if (pending.verifyCode !== code.trim()) {
      return NextResponse.json(
        { message: "Invalid verification code." },
        { status: 400 }
      );
    }

    // Update password in User table (plain text, no hashing)
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (user) {
      await prisma.user.update({
        where: { email: cleanEmail },
        data: { password: newPassword },
      });
    } else {
      // If user was pending registration, create user with plain text password
      await prisma.user.create({
        data: {
          email: pending.email,
          username: pending.username,
          name: pending.username,
          password: newPassword,
          phone: pending.phone,
          emailVerified: new Date(),
        },
      });
    }

    // Delete pending record
    await prisma.pendingUser.delete({ where: { email: cleanEmail } });

    return NextResponse.json(
      { message: "Password reset successfully. You can now sign in." },
      { status: 200 }
    );
  } catch (error) {
    console.error("[RESET_PASSWORD_ERROR]", error);
    return NextResponse.json(
      { message: "Failed to reset password. Please try again." },
      { status: 500 }
    );
  }
}
