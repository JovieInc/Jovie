import { NextResponse } from 'next/server';
import { getOptionalAuth } from '@/lib/auth/cached';
import { mintDictationToken } from '@/lib/dictation/elevenlabs.server';
import { DICTATION_LIMITS } from '@/lib/dictation/limits';
import {
  checkDictationMintLimit,
  reserveDictationAudio,
} from '@/lib/dictation/quota.server';

export const runtime = 'nodejs';
export async function POST() {
  const { userId } = await getOptionalAuth();
  const headers = { 'Cache-Control': 'no-store' };
  if (!userId)
    return NextResponse.json(
      { code: 'unauthorized' },
      { status: 401, headers }
    );
  const limited = await checkDictationMintLimit(userId);
  if (limited)
    return NextResponse.json(
      { code: limited },
      { status: limited === 'rate_limited' ? 429 : 503, headers }
    );
  const capped = await reserveDictationAudio(
    userId,
    DICTATION_LIMITS.maxSessionSeconds
  );
  if (capped)
    return NextResponse.json(
      { code: capped },
      { status: capped === 'dictation_cap_reached' ? 429 : 503, headers }
    );
  try {
    const token = await mintDictationToken();
    return NextResponse.json(
      {
        provider: 'elevenlabs-stream',
        token,
        expiresAt: Date.now() + 15 * 60 * 1000,
        wsUrl: 'wss://api.elevenlabs.io/v1/speech-to-text/realtime',
        modelId: 'scribe_v2_realtime',
        maxSessionSec: DICTATION_LIMITS.maxSessionSeconds,
      },
      { headers }
    );
  } catch {
    return NextResponse.json(
      { code: 'provider-down' },
      { status: 503, headers }
    );
  }
}
