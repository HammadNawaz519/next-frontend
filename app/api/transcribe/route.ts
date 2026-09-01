import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { processAudioTranscription } from '@/lib/transcription-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // Max execution timeout for serverless route

/**
 * POST /api/transcribe
 * 
 * Authenticated speech-to-text endpoint for Connect.
 * Accepts audio recording via multipart/form-data and transcribes it server-side.
 * Returns clean text for insertion into the existing message composer.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authentication & Authorization Check
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHENTICATED',
            message: 'You must be logged in to use voice transcription.',
          },
        },
        { status: 401 }
      );
    }

    const cleanEmail = session.user.email.toLowerCase().trim();
    const currentUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: session.user.email },
          { email: cleanEmail }
        ]
      },
      select: { id: true, email: true },
    });

    if (!currentUser) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User account not found or unauthorized.',
          },
        },
        { status: 403 }
      );
    }

    // 2. Parse Multipart Form Data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const language = (formData.get('language') as string) || undefined;
    const prompt = (formData.get('prompt') as string) || undefined;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_AUDIO',
            message: 'No audio file was attached to the request.',
          },
        },
        { status: 400 }
      );
    }

    // 3. Convert File to ArrayBuffer & Buffer for Safe Processing
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // 4. Process Audio through Provider Pipeline
    const result = await processAudioTranscription(
      audioBuffer,
      file.name || 'recording.webm',
      file.type || 'audio/webm',
      currentUser.id,
      {
        language,
        prompt,
      }
    );

    if (!result.success) {
      const statusCode =
        result.error?.code === 'RATE_LIMITED'
          ? 429
          : result.error?.code === 'CONCURRENCY_LIMIT'
          ? 429
          : result.error?.code === 'AUDIO_TOO_LARGE' || result.error?.code === 'EMPTY_AUDIO'
          ? 400
          : 500;

      return NextResponse.json(result, { status: statusCode });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    console.error('Unhandled /api/transcribe error:', err);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred during audio transcription.',
        },
      },
      { status: 500 }
    );
  }
}
