import 'server-only';

export const MOBILE_CHAT_MAX_TEXT_LENGTH = 4000;

export const MOBILE_CHAT_RUNTIME_DISABLED_CODE = 'MOBILE_CHAT_RUNTIME_DISABLED';
export const MOBILE_CHAT_ALPHA_REQUIRED_CODE = 'MOBILE_CHAT_ALPHA_REQUIRED';
export const MOBILE_CHAT_PROFILE_REQUIRED_CODE = 'MOBILE_CHAT_PROFILE_REQUIRED';
export const TURN_IN_PROGRESS_ERROR_CODE = 'TURN_IN_PROGRESS';

export type MobileChatTurnSource = 'typed';

export interface MobileChatTurnRequest {
  readonly conversationId?: unknown;
  readonly clientTurnId?: unknown;
  readonly clientMessageId?: unknown;
  readonly text?: unknown;
  readonly source?: unknown;
}

export interface ParsedMobileChatTurnRequest {
  readonly conversationId?: string;
  readonly clientTurnId: string;
  readonly clientMessageId: string;
  readonly text: string;
  readonly source: MobileChatTurnSource;
}

export type MobileChatNdjsonEvent =
  | {
      readonly type: 'turn.reserved';
      readonly conversationId: string;
      readonly turnId: string;
      readonly clientTurnId: string;
    }
  | {
      readonly type: 'assistant.delta';
      readonly clientTurnId: string;
      readonly text: string;
    }
  | {
      readonly type: 'assistant.completed';
      readonly clientTurnId: string;
      readonly conversationId: string;
      readonly turnId: string;
      readonly text: string;
    }
  | {
      readonly type: 'web.handoff';
      readonly clientTurnId: string;
      readonly conversationId: string;
      readonly url: string;
      readonly summary: string;
    }
  | {
      readonly type: 'error';
      readonly errorCode: string;
      readonly message: string;
    };

export const MOBILE_CHAT_NDJSON_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  'Content-Type': 'application/x-ndjson; charset=utf-8',
} as const;

function isValidSource(source: unknown): source is MobileChatTurnSource {
  return source === 'typed';
}

function isValidOptionalString(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length > 0);
}

export function parseMobileChatTurnRequest(
  value: MobileChatTurnRequest
): ParsedMobileChatTurnRequest | null {
  if (
    !isValidOptionalString(value.conversationId) ||
    typeof value.clientTurnId !== 'string' ||
    value.clientTurnId.length === 0 ||
    typeof value.clientMessageId !== 'string' ||
    value.clientMessageId.length === 0 ||
    typeof value.text !== 'string' ||
    value.text.trim().length === 0 ||
    value.text.length > MOBILE_CHAT_MAX_TEXT_LENGTH ||
    !isValidSource(value.source)
  ) {
    return null;
  }

  return {
    conversationId: value.conversationId,
    clientTurnId: value.clientTurnId,
    clientMessageId: value.clientMessageId,
    text: value.text.trim(),
    source: value.source,
  };
}

export function encodeMobileChatNdjsonEvent(
  event: MobileChatNdjsonEvent
): string {
  return `${JSON.stringify(event)}\n`;
}

export function buildMobileChatHandoffUrl(conversationId: string): string {
  return `/app/chat/${conversationId}`;
}
