import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  requireFounderPrincipal,
  SUMMER_NO_STORE_HEADERS,
} from '@/lib/ovie/summer-founder-gate';
import { askSummerForVoice } from '@/lib/ovie/summer-voice';

export const maxDuration = 60;

const bodySchema = z
  .object({ question: z.string().trim().min(1).max(2000) })
  .strict();

/** Backend of the voice agent's `ask_summer` client tool. */
export async function POST(request: Request): Promise<NextResponse> {
  const gate = await requireFounderPrincipal();
  if (gate instanceof NextResponse) return gate;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_question' },
      { status: 400, headers: SUMMER_NO_STORE_HEADERS }
    );
  }
  const answer = await askSummerForVoice({
    question: parsed.data.question,
    principalHash: gate.principalHash,
    signal: request.signal,
  });
  if (!answer.ok) {
    return NextResponse.json(
      { error: answer.code },
      { status: 503, headers: SUMMER_NO_STORE_HEADERS }
    );
  }
  return NextResponse.json(answer, { headers: SUMMER_NO_STORE_HEADERS });
}
