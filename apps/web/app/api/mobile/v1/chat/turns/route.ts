import { NextResponse } from 'next/server';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { getMobileSessionUserId } from '@/lib/mobile/session-auth';

export const runtime = 'nodejs';

const NDJSON_HEADERS = {
  ...NO_STORE_HEADERS,
  'Content-Type': 'application/x-ndjson; charset=utf-8',
} as const;

const MAX_TEXT_LENGTH = 4000;

interface MobileChatTurnRequest {
  readonly conversationId?: unknown;
  readonly clientTurnId?: unknown;
  readonly clientMessageId?: unknown;
  readonly text?: unknown;
  readonly source?: unknown;
}

function isValidSource(source: unknown): source is 'typed' {
  return source === 'typed';
}

function isValidOptionalString(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length > 0);
}

function parseMobileChatTurnRequest(value: MobileChatTurnRequest): {
  readonly conversationId?: string;
  readonly clientTurnId: string;
  readonly clientMessageId: string;
  readonly text: string;
  readonly source: 'typed';
} | null {
  if (
    !isValidOptionalString(value.conversationId) ||
    typeof value.clientTurnId !== 'string' ||
    value.clientTurnId.length === 0 ||
    typeof value.clientMessageId !== 'string' ||
    value.clientMessageId.length === 0 ||
    typeof value.text !== 'string' ||
    value.text.trim().length === 0 ||
    value.text.length > MAX_TEXT_LENGTH ||
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

function ndjsonEvent(event: Record<string, unknown>): string {
  return `${JSON.stringify(event)}\n`;
}

export async function POST(request: Request) {
  const userId = await getMobileSessionUserId(request);
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const payload = (await request
    .json()
    .catch(() => ({}))) as MobileChatTurnRequest;
  const parsed = parseMobileChatTurnRequest(payload);
  if (!parsed) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  return new Response(
    ndjsonEvent({
      type: 'error',
      errorCode: 'MOBILE_CHAT_RUNTIME_DISABLED',
      message: 'Native chat is not enabled for this build.',
    }),
    {
      status: 501,
      headers: NDJSON_HEADERS,
    }
  );
}
