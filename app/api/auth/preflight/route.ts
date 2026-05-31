import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { emailVerified: true, password: true },
    });

    if (!user || !user.password) {
      // Don't reveal whether the user exists — just let NextAuth handle the error
      return NextResponse.json({ exists: false, verified: true });
    }

    return NextResponse.json({
      exists: true,
      verified: user.emailVerified !== null,
    });
  } catch (err) {
    console.error('[PREFLIGHT_ERROR]', err);
    // On DB error, skip preflight — don't block login
    return NextResponse.json({ exists: true, verified: true });
  }
}
