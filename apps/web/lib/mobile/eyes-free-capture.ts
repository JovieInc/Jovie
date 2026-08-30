/** Closed-destination eyes-free routing. Summer is founder-only via canUseOvChatMode. */

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

export function eyesFreeResult(input: {
  readonly destination: EyesFreeDestination;
  readonly status: EyesFreeCaptureStatus;
  readonly conversationId?: string | null;
  readonly turnId?: string | null;
  readonly assistantText?: string | null;
  readonly errorCode?: string | null;
}): EyesFreeCaptureResult {
  return {
    destination: input.destination,
    status: input.status,
    conversationId: input.conversationId ?? null,
    turnId: input.turnId ?? null,
    readback: eyesFreeReadback(input),
    errorCode: input.errorCode ?? null,
  };
}

type NdjsonEvent = {
  readonly type?: unknown;
  readonly errorCode?: unknown;
  readonly conversationId?: unknown;
  readonly turnId?: string;
  readonly text?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function lastEvent(
  events: readonly NdjsonEvent[],
  type: string
): NdjsonEvent | undefined {
  return [...events].reverse().find(event => event.type === type);
}

function parseNdjson(body: string): NdjsonEvent[] {
  return body.split('\n').flatMap(line => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    try {
      return [JSON.parse(trimmed) as NdjsonEvent];
    } catch {
      return [];
    }
  });
}

export function readbackFromMobileChatResponse(input: {
  readonly destination: EyesFreeDestination;
  readonly httpStatus: number;
  readonly body: string;
}): EyesFreeCaptureResult {
  const events = parseNdjson(input.body);
  const errorEvent = lastEvent(events, 'error');
  const completed = lastEvent(events, 'assistant.completed');
  const reserved = lastEvent(events, 'turn.reserved');
  const errorCode = asString(errorEvent?.errorCode);
  const conversationId =
    asString(completed?.conversationId) ?? asString(reserved?.conversationId);
  const turnId = asString(completed?.turnId) ?? asString(reserved?.turnId);
  const assistantText = asString(completed?.text);
  const dest = input.destination;

  if (
    input.httpStatus === 403 ||
    errorCode === 'OV_CHAT_FORBIDDEN' ||
    errorCode === EYES_FREE_ERROR.SUMMER_FORBIDDEN
  ) {
    return eyesFreeResult({
      destination: dest,
      status: 'forbidden',
      errorCode: EYES_FREE_ERROR.SUMMER_FORBIDDEN,
    });
  }
  if (input.httpStatus === 409 || errorCode === 'TURN_IN_PROGRESS') {
    return eyesFreeResult({
      destination: dest,
      status: 'in_progress',
      conversationId,
      turnId,
      errorCode: errorCode ?? 'TURN_IN_PROGRESS',
    });
  }
  if (
    input.httpStatus === 404 ||
    errorCode === 'MOBILE_CHAT_PROFILE_REQUIRED'
  ) {
    return eyesFreeResult({
      destination: dest,
      status: 'unavailable',
      errorCode: errorCode ?? EYES_FREE_ERROR.UNAVAILABLE,
    });
  }
  if (input.httpStatus >= 400 || errorEvent) {
    return eyesFreeResult({
      destination: dest,
      status: 'failed',
      conversationId,
      turnId,
      errorCode: errorCode ?? 'CAPTURE_FAILED',
    });
  }

  const isDuplicate =
    Boolean(completed) && !reserved && input.httpStatus === 200;
  return eyesFreeResult({
    destination: dest,
    status: isDuplicate ? 'duplicate' : 'completed',
    conversationId,
    turnId,
    assistantText,
  });
}
