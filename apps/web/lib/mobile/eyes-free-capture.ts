/**
 * Eyes-free iOS capture routing (JOV-5468).
 *
 * Destination is a closed enum. Summer is founder-only via the existing
 * OV/admin gate — never a client-only switch or free-form string.
 */

import { MOBILE_CHAT_MAX_TEXT_LENGTH } from '@/lib/mobile/chat/contract';

export const EYES_FREE_DESTINATIONS = ['jovie', 'summer'] as const;

export type EyesFreeDestination = (typeof EYES_FREE_DESTINATIONS)[number];

export const EYES_FREE_ERROR = {
  INVALID_DESTINATION: 'INVALID_DESTINATION',
  TRANSCRIPTION_EMPTY: 'TRANSCRIPTION_EMPTY',
  INVALID_IDEMPOTENCY: 'INVALID_IDEMPOTENCY',
  SUMMER_FORBIDDEN: 'SUMMER_FORBIDDEN',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type EyesFreeCaptureStatus =
  | 'completed'
  | 'duplicate'
  | 'in_progress'
  | 'forbidden'
  | 'unavailable'
  | 'failed';

export type EyesFreeCaptureResult = {
  readonly destination: EyesFreeDestination;
  readonly status: EyesFreeCaptureStatus;
  readonly conversationId: string | null;
  readonly turnId: string | null;
  readonly readback: string;
  readonly errorCode: string | null;
};

export function parseEyesFreeDestination(
  value: unknown
): EyesFreeDestination | null {
  return value === 'jovie' || value === 'summer' ? value : null;
}

export function parseEyesFreeTranscript(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const transcript = value.trim();
  if (
    transcript.length === 0 ||
    transcript.length > MOBILE_CHAT_MAX_TEXT_LENGTH
  ) {
    return null;
  }
  return transcript;
}

export function parseEyesFreeIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  if (key.length < 8 || key.length > 128) return null;
  return key;
}

export function chatModeForEyesFreeDestination(
  destination: EyesFreeDestination
): 'ov' | null {
  return destination === 'summer' ? 'ov' : null;
}

export function authorizeEyesFreeDestination(
  destination: EyesFreeDestination,
  canUseSummer: boolean
):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly status: 403;
      readonly errorCode: typeof EYES_FREE_ERROR.SUMMER_FORBIDDEN;
    } {
  if (destination === 'summer' && !canUseSummer) {
    return {
      ok: false,
      status: 403,
      errorCode: EYES_FREE_ERROR.SUMMER_FORBIDDEN,
    };
  }
  return { ok: true };
}

export function eyesFreeReadback(input: {
  readonly destination: EyesFreeDestination;
  readonly status: EyesFreeCaptureStatus;
  readonly assistantText?: string | null;
  readonly errorCode?: string | null;
}): string {
  if (input.status === 'forbidden') {
    return 'Summer is only available to the founder.';
  }
  if (input.status === 'unavailable') {
    return 'Capture is unavailable. Try again from Jovie.';
  }
  if (input.status === 'in_progress') {
    return 'That capture is still running. I will keep this request.';
  }
  if (input.status === 'failed') {
    return 'I could not finish that capture. Retry from Jovie.';
  }

  const spoken = input.assistantText?.trim();
  if (spoken) return spoken;

  return input.destination === 'summer' ? 'Sent to Summer.' : 'Sent to Jovie.';
}

type NdjsonEvent = {
  readonly type?: unknown;
  readonly errorCode?: unknown;
  readonly message?: unknown;
  readonly conversationId?: unknown;
  readonly turnId?: string;
  readonly text?: unknown;
};

export function readbackFromMobileChatResponse(input: {
  readonly destination: EyesFreeDestination;
  readonly httpStatus: number;
  readonly body: string;
}): EyesFreeCaptureResult {
  const events: NdjsonEvent[] = input.body
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .flatMap(line => {
      try {
        return [JSON.parse(line) as NdjsonEvent];
      } catch {
        return [];
      }
    });

  const errorEvent = [...events]
    .reverse()
    .find(event => event.type === 'error');
  const completed = [...events]
    .reverse()
    .find(event => event.type === 'assistant.completed');
  const reserved = [...events]
    .reverse()
    .find(event => event.type === 'turn.reserved');

  const errorCode =
    typeof errorEvent?.errorCode === 'string' ? errorEvent.errorCode : null;
  const conversationId =
    (typeof completed?.conversationId === 'string'
      ? completed.conversationId
      : null) ??
    (typeof reserved?.conversationId === 'string'
      ? reserved.conversationId
      : null);
  const turnId =
    (typeof completed?.turnId === 'string' ? completed.turnId : null) ??
    (typeof reserved?.turnId === 'string' ? reserved.turnId : null);
  const assistantText =
    typeof completed?.text === 'string' ? completed.text : null;

  if (
    input.httpStatus === 403 ||
    errorCode === 'OV_CHAT_FORBIDDEN' ||
    errorCode === EYES_FREE_ERROR.SUMMER_FORBIDDEN
  ) {
    return {
      destination: input.destination,
      status: 'forbidden',
      conversationId: null,
      turnId: null,
      readback: eyesFreeReadback({
        destination: input.destination,
        status: 'forbidden',
      }),
      errorCode: EYES_FREE_ERROR.SUMMER_FORBIDDEN,
    };
  }

  if (input.httpStatus === 409 || errorCode === 'TURN_IN_PROGRESS') {
    return {
      destination: input.destination,
      status: 'in_progress',
      conversationId,
      turnId,
      readback: eyesFreeReadback({
        destination: input.destination,
        status: 'in_progress',
      }),
      errorCode: errorCode ?? 'TURN_IN_PROGRESS',
    };
  }

  if (
    input.httpStatus === 404 ||
    errorCode === 'MOBILE_CHAT_PROFILE_REQUIRED'
  ) {
    return {
      destination: input.destination,
      status: 'unavailable',
      conversationId: null,
      turnId: null,
      readback: eyesFreeReadback({
        destination: input.destination,
        status: 'unavailable',
      }),
      errorCode: errorCode ?? EYES_FREE_ERROR.UNAVAILABLE,
    };
  }

  if (input.httpStatus >= 400 || errorEvent) {
    return {
      destination: input.destination,
      status: 'failed',
      conversationId,
      turnId,
      readback: eyesFreeReadback({
        destination: input.destination,
        status: 'failed',
        errorCode,
      }),
      errorCode: errorCode ?? 'CAPTURE_FAILED',
    };
  }

  const isDuplicate =
    Boolean(completed) && !reserved && input.httpStatus === 200;

  return {
    destination: input.destination,
    status: isDuplicate ? 'duplicate' : 'completed',
    conversationId,
    turnId,
    readback: eyesFreeReadback({
      destination: input.destination,
      status: isDuplicate ? 'duplicate' : 'completed',
      assistantText,
    }),
    errorCode: null,
  };
}
