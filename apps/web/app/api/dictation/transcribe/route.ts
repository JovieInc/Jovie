import { NextResponse } from 'next/server';
import { getOptionalAuth } from '@/lib/auth/cached';
import { transcribeDictationAudio } from '@/lib/dictation/elevenlabs.server';
import { DictationError } from '@/lib/dictation/errors';
import { reserveDictationAudio } from '@/lib/dictation/quota.server';
import { BATCH_MAX_BYTES, measureWavSeconds } from '@/lib/dictation/wav';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** Bound the reader itself; Content-Length is untrusted and may be absent. */
async function readAudio(request: Request): Promise<ArrayBuffer> {
  if (!request.body) throw new DictationError('unknown');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BATCH_MAX_BYTES)
        throw new DictationError('dictation_cap_reached');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer.buffer;
}
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  const reply = (code: string, status: number) =>
    NextResponse.json({ code }, { status, headers });
  const { userId } = await getOptionalAuth();
  if (!userId) return reply('unauthorized', 401);
  if (request.headers.get('content-type')?.split(';')[0] !== 'audio/wav')
    return reply('unsupported_audio', 415);
  if (Number(request.headers.get('content-length')) > BATCH_MAX_BYTES)
    return reply('dictation_cap_reached', 429);
  try {
    const audio = await readAudio(request);
    const seconds = measureWavSeconds(audio);
    const capped = await reserveDictationAudio(userId, seconds);
    if (capped)
      return reply(capped, capped === 'dictation_cap_reached' ? 429 : 503);
    const text = await transcribeDictationAudio(audio, request.signal);
    return NextResponse.json({ text }, { headers });
  } catch (error) {
    if (error instanceof DictationError)
      return reply(
        error.code,
        error.code === 'dictation_cap_reached' ? 429 : 400
      );
    return reply('provider-down', 503);
  }
}
