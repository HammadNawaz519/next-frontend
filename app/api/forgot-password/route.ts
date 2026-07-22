import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/mail";

export const dynamic = "force-dynamic";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(req: Request) {
  try {
    const { email } = (await req.json()) as { email: string };

    if (!email) {
      return NextResponse.json({ message: "Email is required." }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if user exists in User or PendingUser
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    const pendingUser = await prisma.pendingUser.findUnique({ where: { email: cleanEmail } });

    if (!user && !pendingUser) {
      return NextResponse.json(
        { message: "No account found with this email address." },
        { status: 404 }
      );
    }

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.pendingUser.upsert({
      where: { email: cleanEmail },
      update: {
        verifyCode: otp,
        verifyExpiry: expiry,
      },
      create: {
        email: cleanEmail,
        username: user?.username ?? pendingUser?.username ?? cleanEmail.split("@")[0],
        password: user?.password ?? pendingUser?.password ?? "",
        verifyCode: otp,
        verifyExpiry: expiry,
      },
    });

    const displayName = user?.name || user?.username || pendingUser?.username || cleanEmail;
    await sendVerificationEmail(cleanEmail, otp, displayName);

    return NextResponse.json(
      { message: "Password reset code sent to your email." },
      { status: 200 }
    );
  } catch (error) {
    console.error("[FORGOT_PASSWORD_ERROR]", error);
    return NextResponse.json(
      { message: "Failed to send reset code. Please try again." },
      { status: 500 }
    );
  }
}
