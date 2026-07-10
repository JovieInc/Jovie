import type { UIMessage } from 'ai';
import { NextResponse } from 'next/server';
import { parseJsonBody } from '@/lib/http/parse-json';

/** Maximum allowed chat POST body size (bytes). */
export const MAX_CHAT_BODY_SIZE = 256 * 1024;

/** Maximum allowed message length (characters). */
export const MAX_MESSAGE_LENGTH = 4000;

/** Maximum allowed messages per request. */
export const MAX_MESSAGES_PER_REQUEST = 50;

/** Maximum parts per UIMessage. */
export const MAX_PARTS_PER_MESSAGE = 50;

/** Maximum serialized size of all message parts combined (bytes). */
export const MAX_TOTAL_PARTS_SERIALIZED_BYTES = 128 * 1024;

export type ChatRequestBody = {
  messages?: unknown;
  profileId?: unknown;
  conversationId?: unknown;
  artistContext?: unknown;
  clientTurnId?: unknown;
  clientMessageId?: unknown;
  source?: unknown;
  toolIntent?: unknown;
  modelRotationStep?: unknown;
  /** Pinned opportunity card (JOV-3933) — server injects into system prompt. */
  pinnedOpportunity?: unknown;
};

type MessagePart = { type: string; text?: string };

export function extractUIMessageText(parts: MessagePart[]): string {
  return parts
    .filter(
      (p): p is { type: 'text'; text: string } =>
        p.type === 'text' && typeof p.text === 'string'
    )
    .map(p => p.text)
    .join('');
}

function measurePartsSerializedBytes(parts: unknown[]): number {
  try {
    return new TextEncoder().encode(JSON.stringify(parts)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function validateMessage(message: unknown): string | null {
  if (typeof message !== 'object' || message === null || !('role' in message)) {
    return 'Invalid message format';
  }

  const msg = message as Record<string, unknown>;

  if (msg.role !== 'user' && msg.role !== 'assistant') {
    return 'Invalid message role';
  }

  if (!('parts' in msg) || !Array.isArray(msg.parts)) {
    return 'Invalid message format';
  }

  if (msg.parts.length > MAX_PARTS_PER_MESSAGE) {
    return `Too many message parts. Maximum is ${MAX_PARTS_PER_MESSAGE}`;
  }

  const partsBytes = measurePartsSerializedBytes(msg.parts);
  if (partsBytes > MAX_TOTAL_PARTS_SERIALIZED_BYTES) {
    return 'Message parts payload too large';
  }

  if (msg.role === 'user') {
    const contentStr = extractUIMessageText(msg.parts as MessagePart[]);
    if (contentStr.length > MAX_MESSAGE_LENGTH) {
      return `Message too long. Maximum is ${MAX_MESSAGE_LENGTH} characters`;
    }
  }

  return null;
}

function measureChatRequestBodyBytes(
  messages: readonly UIMessage[],
  staticBody: Record<string, unknown>
): number {
  try {
    return new TextEncoder().encode(JSON.stringify({ ...staticBody, messages }))
      .byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Trim chat messages so the serialized POST body stays within server limits.
 * Drops oldest messages first while preserving the most recent turn.
 */
export function trimMessagesForChatRequest(
  messages: readonly UIMessage[],
  staticBody: Record<string, unknown>
): UIMessage[] {
  if (messages.length === 0) {
    return [];
  }

  let trimmed = [...messages];
  while (
    trimmed.length > 1 &&
    measureChatRequestBodyBytes(trimmed, staticBody) > MAX_CHAT_BODY_SIZE
  ) {
    trimmed = trimmed.slice(1);
  }

  if (trimmed.length > MAX_MESSAGES_PER_REQUEST) {
    trimmed = trimmed.slice(-MAX_MESSAGES_PER_REQUEST);
  }

  return trimmed;
}

export function validateMessagesArray(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return 'Messages must be an array';
  }
  if (messages.length === 0) {
    return 'Messages array cannot be empty';
  }
  if (messages.length > MAX_MESSAGES_PER_REQUEST) {
    return `Too many messages. Maximum is ${MAX_MESSAGES_PER_REQUEST}`;
  }

  let totalPartsBytes = 0;
  for (const message of messages) {
    const error = validateMessage(message);
    if (error) {
      return error;
    }

    if (
      typeof message === 'object' &&
      message !== null &&
      Array.isArray((message as { parts?: unknown }).parts)
    ) {
      totalPartsBytes += measurePartsSerializedBytes(
        (message as { parts: unknown[] }).parts
      );
      if (totalPartsBytes > MAX_TOTAL_PARTS_SERIALIZED_BYTES) {
        return 'Total message parts payload too large';
      }
    }
  }

  return null;
}

export type ParsedChatRequest =
  | { ok: true; body: ChatRequestBody; uiMessages: UIMessage[] }
  | { ok: false; response: NextResponse };

export async function parseChatRequestBody(
  request: Request,
  options: {
    corsHeaders: HeadersInit;
    requestId: string;
  }
): Promise<ParsedChatRequest> {
  const parsedBody = await parseJsonBody<ChatRequestBody>(request, {
    route: '/api/chat',
    headers: {
      ...options.corsHeaders,
      'x-request-id': options.requestId,
    },
    maxBodySize: MAX_CHAT_BODY_SIZE,
    logContext: { requestId: options.requestId },
  });

  if (!parsedBody.ok) {
    return { ok: false, response: parsedBody.response };
  }

  const body = parsedBody.data;
  const messagesError = validateMessagesArray(body.messages);
  if (messagesError) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: messagesError, requestId: options.requestId },
        {
          status: 400,
          headers: {
            ...options.corsHeaders,
            'x-request-id': options.requestId,
          },
        }
      ),
    };
  }

  return {
    ok: true,
    body,
    uiMessages: body.messages as UIMessage[],
  };
}
