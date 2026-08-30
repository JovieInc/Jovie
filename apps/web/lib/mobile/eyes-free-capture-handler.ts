import 'server-only';

import { canUseOvChatMode } from '@/lib/chat/ov-mode';
import type { ParsedMobileChatTurnRequest } from '@/lib/mobile/chat/contract';
import { handleMobileChatTurn } from '@/lib/mobile/chat/turn-handler';
import {
  authorizeEyesFreeDestination,
  chatModeForEyesFreeDestination,
  EYES_FREE_ERROR,
  type EyesFreeCaptureResult,
  type EyesFreeDestination,
  eyesFreeReadback,
  readbackFromMobileChatResponse,
} from '@/lib/mobile/eyes-free-capture';

export async function submitEyesFreeCapture(input: {
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
      result: {
        destination: input.destination,
        status: 'forbidden',
        conversationId: null,
        turnId: null,
        readback: eyesFreeReadback({
          destination: input.destination,
          status: 'forbidden',
        }),
        errorCode: authorized.errorCode,
      },
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

  if (result.status === 'forbidden') {
    return { httpStatus: 403, result };
  }
  if (result.status === 'unavailable') {
    return { httpStatus: 404, result };
  }
  if (result.status === 'in_progress') {
    return { httpStatus: 409, result };
  }
  if (result.status === 'failed') {
    return {
      httpStatus: response.status >= 400 ? response.status : 500,
      result,
    };
  }

  return { httpStatus: 200, result };
}

export function invalidEyesFreeBody(
  errorCode: (typeof EYES_FREE_ERROR)[keyof typeof EYES_FREE_ERROR],
  destination: EyesFreeDestination | null
): EyesFreeCaptureResult {
  const resolvedDestination = destination ?? 'jovie';
  const status =
    errorCode === EYES_FREE_ERROR.SUMMER_FORBIDDEN ? 'forbidden' : 'failed';
  return {
    destination: resolvedDestination,
    status,
    conversationId: null,
    turnId: null,
    readback: eyesFreeReadback({
      destination: resolvedDestination,
      status,
      errorCode,
    }),
    errorCode,
  };
}
