import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ message: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    const { currentPassword, newPassword } = (await req.json()) as {
      currentPassword: string;
      newPassword: string;
    };

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ message: 'Current and new password are required.' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ message: 'Password must be at least 6 characters.' }, { status: 400 });
    }

    const email = session.user.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json({ message: 'Account not found.' }, { status: 404 });
    }

    // Verify current password (plain text comparison — no hashing in this project)
    if (user.password !== currentPassword) {
      return NextResponse.json({ message: 'Current password is incorrect.' }, { status: 400 });
    }

    // Update password
    await prisma.user.update({
      where: { email },
      data: { password: newPassword },
    });

    return NextResponse.json({ message: 'Password updated successfully.' }, { status: 200 });
  } catch (error) {
    console.error('[CHANGE_PASSWORD_ERROR]', error);
    return NextResponse.json({ message: 'Internal server error. Please try again.' }, { status: 500 });
  }
}
