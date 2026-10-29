import { NextResponse } from 'next/server';
import {
  requireFounderPrincipal,
  SUMMER_NO_STORE_HEADERS,
} from '@/lib/ovie/summer-founder-gate';
import { createSummerVoiceSession } from '@/lib/ovie/summer-voice';

/** Mints a short-lived signed provider URL; the provider API key never reaches the browser. */
export async function POST(): Promise<NextResponse> {
  const gate = await requireFounderPrincipal();
  if (gate instanceof NextResponse) return gate;
  const session = await createSummerVoiceSession();
  if (!session.ok) {
    return NextResponse.json(
      { error: session.code },
      {
        status: session.code === 'voice_not_configured' ? 503 : 502,
        headers: SUMMER_NO_STORE_HEADERS,
      }
    );
  }
  return NextResponse.json(session, { headers: SUMMER_NO_STORE_HEADERS });
}
