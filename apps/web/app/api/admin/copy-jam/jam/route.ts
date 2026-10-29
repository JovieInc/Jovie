import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin/middleware';
import { getCachedAuth } from '@/lib/auth/cached';
import { CopyJamAiUnavailableError } from '@/lib/copy-jam/ai.server';
import { runJam } from '@/lib/copy-jam/jam.server';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const transcriptBody = z
  .object({ transcript: z.string().trim().min(1).max(8000) })
  .strict();

/**
 * A voice jam from the Ovie recorder: audio bytes (audio/*) or a pasted
 * transcript (application/json). Returns what was stored and what was not.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const authError = await requireAdmin({ session: 'fresh' });
  if (authError) return authError;
  const auth = await getCachedAuth();
  const by = auth.actorUserId ?? auth.userId ?? 'admin';

  try {
    const type = request.headers.get('content-type') ?? '';
    if (type.startsWith('application/json')) {
      const parsed = transcriptBody.safeParse(
        await request.json().catch(() => null)
      );
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'invalid_transcript' },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      const result = await runJam({
        transcript: parsed.data.transcript,
        by,
        source: 'ovie-voice',
      });
      return NextResponse.json(result, { headers: NO_STORE_HEADERS });
    }
    if (!type.startsWith('audio/') && !type.startsWith('video/webm')) {
      return NextResponse.json(
        { error: 'unsupported_media' },
        { status: 415, headers: NO_STORE_HEADERS }
      );
    }
    const audio = await request.arrayBuffer();
    if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: 'audio_size' },
        { status: 413, headers: NO_STORE_HEADERS }
      );
    }
    const result = await runJam({ audio, by, source: 'ovie-voice' });
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof CopyJamAiUnavailableError) {
      return NextResponse.json(
        { error: 'voice_unavailable' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    await captureError('Copy jam failed', error, {
      route: '/api/admin/copy-jam/jam',
    });
    return NextResponse.json(
      { error: 'jam_failed' },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }
}
