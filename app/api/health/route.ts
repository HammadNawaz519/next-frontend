import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Perform 1ms lightweight query to keep Neon database active
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'healthy', db: 'connected', timestamp: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}
