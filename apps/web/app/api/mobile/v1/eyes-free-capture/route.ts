import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  EYES_FREE_ERROR,
  parseEyesFreeDestination,
  parseEyesFreeIdempotencyKey,
  parseEyesFreeTranscript,
} from '@/lib/mobile/eyes-free-capture';
import {
  invalidEyesFreeBody,
  submitEyesFreeCapture,
} from '@/lib/mobile/eyes-free-capture-handler';
import { getMobileSessionUserId } from '@/lib/mobile/session-auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const userId = await getMobileSessionUserId(request);
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const payload = (await request.json().catch(() => ({}))) as {
    readonly destination?: unknown;
    readonly transcript?: unknown;
    readonly clientTurnId?: unknown;
    readonly clientMessageId?: unknown;
  };

  const destination = parseEyesFreeDestination(payload.destination);
  if (!destination) {
    return NextResponse.json(
      invalidEyesFreeBody(EYES_FREE_ERROR.INVALID_DESTINATION, null),
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const transcript = parseEyesFreeTranscript(payload.transcript);
  if (!transcript) {
    return NextResponse.json(
      invalidEyesFreeBody(EYES_FREE_ERROR.TRANSCRIPTION_EMPTY, destination),
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const clientTurnId = parseEyesFreeIdempotencyKey(payload.clientTurnId);
  const clientMessageId = parseEyesFreeIdempotencyKey(payload.clientMessageId);
  if (!clientTurnId || !clientMessageId) {
    return NextResponse.json(
      invalidEyesFreeBody(EYES_FREE_ERROR.INVALID_IDEMPOTENCY, destination),
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const { httpStatus, result } = await submitEyesFreeCapture({
    userId,
    destination,
    transcript,
    clientTurnId,
    clientMessageId,
    signal: request.signal,
  });

  return NextResponse.json(result, {
    status: httpStatus,
    headers: NO_STORE_HEADERS,
  });
}
