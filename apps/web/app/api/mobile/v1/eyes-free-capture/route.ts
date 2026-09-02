import { NextResponse } from 'next/server';
import { canUseOvChatMode } from '@/lib/chat/ov-mode';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import type { ParsedMobileChatTurnRequest } from '@/lib/mobile/chat/contract';
import { handleMobileChatTurn } from '@/lib/mobile/chat/turn-handler';
import {
  authorizeEyesFreeDestination,
  chatModeForEyesFreeDestination,
  EYES_FREE_ERROR,
  type EyesFreeCaptureResult,
  type EyesFreeDestination,
  eyesFreeResult,
  parseEyesFreeDestination,
  parseEyesFreeIdempotencyKey,
  parseEyesFreeTranscript,
  readbackFromMobileChatResponse,
} from '@/lib/mobile/eyes-free-capture';
import { getMobileSessionUserId } from '@/lib/mobile/session-auth';

export const runtime = 'nodejs';

function invalidEyesFreeBody(
  errorCode: (typeof EYES_FREE_ERROR)[keyof typeof EYES_FREE_ERROR],
  destination: EyesFreeDestination | null
): EyesFreeCaptureResult {
  const resolvedDestination = destination ?? 'jovie';
  return eyesFreeResult({
    destination: resolvedDestination,
    status:
      errorCode === EYES_FREE_ERROR.SUMMER_FORBIDDEN ? 'forbidden' : 'failed',
    errorCode,
  });
}

async function submitEyesFreeCapture(input: {
  readonly userId: string;
  readonly destination: EyesFreeDestination;
  readonly transcript: string;
  readonly clientTurnId: string;
  readonly clientMessageId: string;
  readonly signal: AbortSignal;
}): Promise<{
  readonly httpStatus: number;
  readonly result: EyesFreeCaptureResult;
}> {
  const authorized = authorizeEyesFreeDestination(
    input.destination,
    await canUseOvChatMode(input.userId)
  );
  if (!authorized.ok) {
    return {
      httpStatus: 403,
      result: eyesFreeResult({
        destination: input.destination,
        status: 'forbidden',
        errorCode: authorized.errorCode,
      }),
    };
  }
  const parsed: ParsedMobileChatTurnRequest = {
    clientTurnId: input.clientTurnId,
    clientMessageId: input.clientMessageId,
    text: input.transcript,
    source: 'typed',
    chatMode: chatModeForEyesFreeDestination(input.destination),
  };
  const response = await handleMobileChatTurn(
    input.userId,
    parsed,
    input.signal
  );
  const result = readbackFromMobileChatResponse({
    destination: input.destination,
    httpStatus: response.status,
    body: await response.text(),
  });
  if (result.status === 'forbidden') return { httpStatus: 403, result };
  if (result.status === 'unavailable') return { httpStatus: 404, result };
  if (result.status === 'in_progress') return { httpStatus: 409, result };
  if (result.status === 'failed') {
    return {
      httpStatus: response.status >= 400 ? response.status : 500,
      result,
    };
  }
  return { httpStatus: 200, result };
}

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
  const transcript = parseEyesFreeTranscript(payload.transcript);
  const clientTurnId = parseEyesFreeIdempotencyKey(payload.clientTurnId);
  const clientMessageId = parseEyesFreeIdempotencyKey(payload.clientMessageId);
  if (!destination || !transcript || !clientTurnId || !clientMessageId) {
    const errorCode = !destination
      ? EYES_FREE_ERROR.INVALID_DESTINATION
      : !transcript
        ? EYES_FREE_ERROR.TRANSCRIPTION_EMPTY
        : EYES_FREE_ERROR.INVALID_IDEMPOTENCY;
    return NextResponse.json(invalidEyesFreeBody(errorCode, destination), {
      status: 400,
      headers: NO_STORE_HEADERS,
    });
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
