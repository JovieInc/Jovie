/**
 * Chat dictation transcription fallback (JOV-9665).
 *
 * Runtimes without Web Speech (Electron desktop, Firefox) record with
 * MediaRecorder and POST the clip here. Speech-to-text goes through the STT provider
 * adapter (lib/dictation/stt): Workers AI first, ElevenLabs fallback.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import {
  estimateDurationMs,
  transcribeDictationClip,
} from '@/lib/dictation/stt';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { chatTranscribeLimiter } from '@/lib/rate-limit/limiters';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const { userId, error } = await requireAuth();
  if (error) return error;

  const limit = await chatTranscribeLimiter.limit(userId);
  if (!limit.success) {
    return NextResponse.json(
      { error: 'Too many dictation requests. Try again in a moment.' },
      { status: 429, headers: NO_STORE_HEADERS }
    );
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('audio/')) {
    return NextResponse.json(
      { error: 'Expected an audio body' },
      { status: 415, headers: NO_STORE_HEADERS }
    );
  }

  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: 'Audio clip is empty or too large' },
      { status: audio.byteLength === 0 ? 400 : 413, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const text = await transcribeDictationClip({
      audio,
      mimeType: contentType,
      durationMs:
        Number(request.headers.get('x-audio-duration-ms')) ||
        estimateDurationMs(audio.byteLength),
    });
    return NextResponse.json({ text }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    captureError('Chat dictation transcription failed', err);
    return NextResponse.json(
      { error: 'Transcription failed' },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}
