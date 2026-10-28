/**
 * Chat dictation transcription fallback (JOV-9665).
 *
 * Runtimes without Web Speech (Electron desktop, Firefox) record with
 * MediaRecorder and POST the clip here. Speech-to-text runs through the
 * allowlisted AI Gateway transcription model, never a provider SDK.
 */

import { NextRequest, NextResponse } from 'next/server';
import { gateway, transcribe } from '@/lib/ai/sdk';
import { requireAuth } from '@/lib/auth/require-auth';
import { DICTATION_TRANSCRIPTION_MODEL } from '@/lib/chat/dictation-server';
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
    const result = await transcribe({
      model: gateway.transcription(DICTATION_TRANSCRIPTION_MODEL),
      audio,
    });
    return NextResponse.json(
      { text: result.text.trim() },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    captureError('Chat dictation transcription failed', err);
    return NextResponse.json(
      { error: 'Transcription failed' },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}
