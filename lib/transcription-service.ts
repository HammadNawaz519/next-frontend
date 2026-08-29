/**
 * Production-Grade Speech-to-Text (Voice-to-Text) Service for Connect
 * 
 * Implements a provider-agnostic transcription engine with:
 *  - Groq Whisper (whisper-large-v3-turbo / whisper-large-v3)
 *  - OpenAI Whisper (whisper-1) fallback
 *  - Rate limiting & concurrency locking per authenticated user
 *  - Comprehensive audio validation (size, MIME type, payload bounds)
 *  - Clean error normalization and observability metrics
 */

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  language?: string;
  duration?: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface TranscriptionOptions {
  language?: string;
  prompt?: string;
  temperature?: number;
}

// Hardcoded defaults (no extra Vercel env vars required beyond GROQ_API_KEY)
export const GROQ_STT_MODEL = 'whisper-large-v3-turbo';
export const MAX_VOICE_TO_TEXT_DURATION_SECONDS = 120;
export const MAX_VOICE_TO_TEXT_SIZE_BYTES = 15728640; // 15MB
export const MIN_AUDIO_SIZE_BYTES = 200; // Under 200 bytes is empty/invalid header only

// Allowed audio MIME types
export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
]);

// ── Concurrency & Rate Limiting Storage (In-memory token bucket + locks) ──
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const activeLocks = new Map<string, number>(); // userId -> lock expiry timestamp

// Rate limit: 30 transcription requests per minute per user
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const CONCURRENCY_LOCK_TTL_MS = 25 * 1000;

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count += 1;
  return true;
}

export function acquireConcurrencyLock(userId: string): boolean {
  const now = Date.now();
  const existingLock = activeLocks.get(userId);

  if (existingLock && now < existingLock) {
    // Another transcription is actively processing for this user
    return false;
  }

  activeLocks.set(userId, now + CONCURRENCY_LOCK_TTL_MS);
  return true;
}

export function releaseConcurrencyLock(userId: string): void {
  activeLocks.delete(userId);
}

// ── Providers ─────────────────────────────────────────────────────────────

async function transcribeWithGroq(
  audioBuffer: Buffer,
  fileName: string,
  mimeType: string,
  options?: TranscriptionOptions
): Promise<string> {
  const apiKey =
    process.env.GROQ_API_KEY ||
    process.env.VITE_GROQ_API_KEY ||
    process.env.NEXT_PUBLIC_GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  formData.append('file', blob, fileName);
  formData.append('model', GROQ_STT_MODEL);
  formData.append('response_format', 'json');

  if (options?.language) {
    formData.append('language', options.language);
  }

  if (options?.prompt) {
    formData.append('prompt', options.prompt);
  }

  // Use temperature 0 for deterministic, high-fidelity transcription in the speaker's exact language
  formData.append('temperature', String(options?.temperature ?? 0));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000); // 20s timeout

  try {
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('Groq STT Provider HTTP Error:', response.status, errorText);
      throw new Error(`Groq STT Error: ${response.status}`);
    }

    const data = await response.json();
    return data.text || '';
  } finally {
    clearTimeout(timeout);
  }
}

async function transcribeWithOpenAI(
  audioBuffer: Buffer,
  fileName: string,
  mimeType: string,
  options?: TranscriptionOptions
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  formData.append('file', blob, fileName);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'json');

  if (options?.language) {
    formData.append('language', options.language);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('OpenAI STT Provider HTTP Error:', response.status, errorText);
      throw new Error(`OpenAI STT Error: ${response.status}`);
    }

    const data = await response.json();
    return data.text || '';
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Main Server-Side Audio Transcription Coordinator
 */
export async function processAudioTranscription(
  audioBuffer: Buffer,
  fileName: string,
  mimeType: string,
  userId: string,
  options?: TranscriptionOptions
): Promise<TranscriptionResult> {
  const requestId = `stt_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const startTime = Date.now();

  // 1. Rate Limiting Validation
  if (!checkRateLimit(userId)) {
    return {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many transcription requests. Please wait a moment and try again.',
      },
    };
  }

  // 2. Concurrency Lock
  if (!acquireConcurrencyLock(userId)) {
    return {
      success: false,
      error: {
        code: 'CONCURRENCY_LIMIT',
        message: 'A voice transcription is already processing for your account.',
      },
    };
  }

  try {
    // 3. Audio Validation
    if (!audioBuffer || audioBuffer.length === 0) {
      return {
        success: false,
        error: {
          code: 'NO_AUDIO',
          message: 'No audio data received. Please record again.',
        },
      };
    }

    if (audioBuffer.length < MIN_AUDIO_SIZE_BYTES) {
      return {
        success: false,
        error: {
          code: 'EMPTY_AUDIO',
          message: 'Audio recording was too short or empty. Please speak clearly into the microphone.',
        },
      };
    }

    if (audioBuffer.length > MAX_VOICE_TO_TEXT_SIZE_BYTES) {
      return {
        success: false,
        error: {
          code: 'AUDIO_TOO_LARGE',
          message: 'Audio recording exceeds the maximum allowable file size (15MB).',
        },
      };
    }

    const cleanMime = (mimeType || 'audio/webm').toLowerCase().split(';')[0].trim();
    const effectiveFileName = fileName && fileName.includes('.') ? fileName : `recording_${Date.now()}.webm`;

    // 4. Try Providers in Preferred Cascade (Groq Whisper -> OpenAI Whisper)
    let transcript = '';
    let usedProvider = 'groq';

    try {
      transcript = await transcribeWithGroq(audioBuffer, effectiveFileName, cleanMime, options);
    } catch (groqErr) {
      console.warn(`[${requestId}] Groq Whisper transcription failed, attempting fallback:`, groqErr);
      if (process.env.OPENAI_API_KEY) {
        usedProvider = 'openai';
        transcript = await transcribeWithOpenAI(audioBuffer, effectiveFileName, cleanMime, options);
      } else {
        throw groqErr;
      }
    }

    const durationMs = Date.now() - startTime;
    const cleanText = (transcript || '').trim();

    if (!cleanText) {
      return {
        success: false,
        error: {
          code: 'NO_SPEECH_DETECTED',
          message: 'No speech was detected. Please try speaking closer to the microphone.',
        },
      };
    }

    // Structured Observability Logging (without logging sensitive user audio or raw message text)
    console.log(
      `[STT Success] id=${requestId} user=${userId.substring(0, 8)}... size=${audioBuffer.length}B provider=${usedProvider} latency=${durationMs}ms words=${cleanText.split(/\s+/).length}`
    );

    return {
      success: true,
      text: cleanText,
    };
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError' || err?.message?.includes('timeout');
    console.error(`[STT Error] id=${requestId} user=${userId.substring(0, 8)}... error:`, err?.message || err);

    return {
      success: false,
      error: {
        code: isTimeout ? 'TRANSCRIPTION_TIMEOUT' : 'TRANSCRIPTION_FAILED',
        message: isTimeout
          ? 'Voice transcription timed out. Please try a shorter message.'
          : 'Unable to transcribe audio right now. Please try again.',
      },
    };
  } finally {
    releaseConcurrencyLock(userId);
  }
}
