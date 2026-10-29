import { NextResponse } from 'next/server';
import {
  requireFounderPrincipal,
  SUMMER_NO_STORE_HEADERS,
} from '@/lib/ovie/summer-founder-gate';
import { isSummerVoiceConfigured } from '@/lib/ovie/summer-voice';

/** Voice UI flag: the control stays hidden until the agent is configured. */
export async function GET(): Promise<NextResponse> {
  const gate = await requireFounderPrincipal();
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json(
    { enabled: isSummerVoiceConfigured() },
    { headers: SUMMER_NO_STORE_HEADERS }
  );
}
