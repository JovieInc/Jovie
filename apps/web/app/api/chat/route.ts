import { randomUUID } from 'node:crypto';
import { gateway } from '@ai-sdk/gateway';
import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { NextResponse } from 'next/server';
import { resolveArtistContext } from '@/lib/chat/context';
import { buildSystemPrompt } from '@/lib/chat/prompts';
import { buildChatTools } from '@/lib/chat/tools';
import { CHAT_MODEL } from '@/lib/constants/ai-models';
import { getEntitlements } from '@/lib/entitlements/registry';
import { CORS_HEADERS } from '@/lib/http/headers';
import {
  checkAiChatRateLimitForPlan,
  createRateLimitHeaders,
} from '@/lib/rate-limit';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync/billing-info';

export const maxDuration = 30;

/** Maximum allowed message length (characters) */
const MAX_MESSAGE_LENGTH = 4000;

/** Maximum allowed messages per request */
const MAX_MESSAGES_PER_REQUEST = 50;

/**
 * Extracts text content from a UIMessage's parts array.
 */
function extractUIMessageText(
  parts: Array<{ type: string; text?: string }>
): string {
  return parts
    .filter(
      (p): p is { type: 'text'; text: string } =>
        p.type === 'text' && typeof p.text === 'string'
    )
    .map(p => p.text)
    .join('');
}

/**
 * Validates a single UIMessage object.
 * AI SDK v6 UIMessages have { id, role, parts } instead of { role, content }.
 * Returns an error message string if invalid, null if valid.
 */
function validateMessage(message: unknown): string | null {
  if (typeof message !== 'object' || message === null || !('role' in message)) {
    return 'Invalid message format';
  }

  const msg = message as Record<string, unknown>;

  if (msg.role !== 'user' && msg.role !== 'assistant') {
    return 'Invalid message role';
  }

  // UIMessages must have a parts array
  if (!('parts' in msg) || !Array.isArray(msg.parts)) {
    return 'Invalid message format';
  }

  // Validate content length for user messages
  if (msg.role === 'user') {
    const contentStr = extractUIMessageText(
      msg.parts as Array<{ type: string; text?: string }>
    );
    if (contentStr.length > MAX_MESSAGE_LENGTH) {
      return `Message too long. Maximum is ${MAX_MESSAGE_LENGTH} characters`;
    }
  }

  return null;
}

/**
 * Validates the messages array (UIMessage format).
 * Returns an error message string if invalid, null if valid.
 */
function validateMessagesArray(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return 'Messages must be an array';
  }
  if (messages.length === 0) {
    return 'Messages array cannot be empty';
  }
  if (messages.length > MAX_MESSAGES_PER_REQUEST) {
    return `Too many messages. Maximum is ${MAX_MESSAGES_PER_REQUEST}`;
  }

  for (const message of messages) {
    const error = validateMessage(message);
    if (error) {
      return error;
    }
  }

  return null;
}

function extractRequestId(req: Request): string {
  const incomingRequestId = req.headers.get('x-request-id')?.trim();
  if (incomingRequestId) return incomingRequestId.slice(0, 120);
  return randomUUID();
}

function sanitizeErrorCode(errorCode: string | undefined): string | null {
  if (!errorCode) return null;
  return /^[A-Z0-9_:-]{2,64}$/i.test(errorCode) ? errorCode : null;
}

function sanitizeRetryAfterSeconds(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const normalized = Math.ceil(value);
  if (normalized < 1) return 1;
  return Math.min(normalized, 3600);
}

/**
 * OPTIONS - CORS preflight handler
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...CORS_HEADERS,
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Build a standardized error response for chat streaming failures.
 */
function buildChatErrorResponse(
  error: unknown,
  userId: string,
  messageCount: number,
  requestId: string
) {
  Sentry.captureException(error, {
    tags: { feature: 'ai-chat' },
    extra: { userId, messageCount, requestId },
  });

  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred';

  return NextResponse.json(
    {
      error: 'Failed to process chat request',
      message:
        'Jovie hit a temporary issue while processing your message. Please try again.',
      errorCode:
        sanitizeErrorCode(
          error instanceof Error ? (error as { code?: string }).code : undefined
        ) ?? 'CHAT_STREAM_FAILED',
      debugMessage: message,
      requestId,
    },
    { status: 500, headers: { ...CORS_HEADERS, 'x-request-id': requestId } }
  );
}

export async function POST(req: Request) {
  const requestId = extractRequestId(req);

  // Auth check - ensure user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized', requestId },
      { status: 401, headers: { ...CORS_HEADERS, 'x-request-id': requestId } }
    );
  }

  // Fetch user plan for rate limiting and tool gating
  const billingInfo = await getUserBillingInfo();
  const userPlan = billingInfo.data?.plan ?? 'free';
  const planLimits = getEntitlements(userPlan);

  // Rate limiting - plan-aware daily quota + burst protection
  const rateLimitResult = await checkAiChatRateLimitForPlan(userId, userPlan);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: rateLimitResult.reason,
        errorCode: 'RATE_LIMITED',
        retryAfter: sanitizeRetryAfterSeconds(
          (rateLimitResult.reset.getTime() - Date.now()) / 1000
        ),
        requestId,
      },
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          ...createRateLimitHeaders(rateLimitResult),
          'x-request-id': requestId,
        },
      }
    );
  }

  // Parse and validate request body
  let body: {
    messages?: unknown;
    profileId?: unknown;
    artistContext?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', requestId },
      { status: 400, headers: { ...CORS_HEADERS, 'x-request-id': requestId } }
    );
  }

  const { messages, profileId } = body;

  // Validate that either profileId or artistContext is provided
  if (
    (!profileId || typeof profileId !== 'string') &&
    (!body.artistContext || typeof body.artistContext !== 'object')
  ) {
    return NextResponse.json(
      { error: 'Missing profileId or artistContext', requestId },
      { status: 400, headers: { ...CORS_HEADERS, 'x-request-id': requestId } }
    );
  }

  // Validate messages array and individual messages
  const messagesError = validateMessagesArray(messages);
  if (messagesError) {
    return NextResponse.json(
      { error: messagesError, requestId },
      { status: 400, headers: { ...CORS_HEADERS, 'x-request-id': requestId } }
    );
  }

  // After validation, we know messages is a valid UIMessage array
  const uiMessages = messages as UIMessage[];

  // Fetch artist context server-side (preferred) or fall back to client-provided
  const contextResult = await resolveArtistContext(
    profileId,
    body.artistContext,
    userId
  );
  if (contextResult.error) {
    return contextResult.error;
  }
  const artistContext = contextResult.context;

  const systemPrompt = buildSystemPrompt(artistContext, {
    aiCanUseTools: planLimits.booleans.aiCanUseTools,
    aiDailyMessageLimit: planLimits.limits.aiDailyMessageLimit,
  });

  try {
    // Convert UIMessages (from the client) to ModelMessages (for streamText)
    const modelMessages = await convertToModelMessages(uiMessages);

    // Build tools: always include profile edit, conditionally include canvas + release creation
    const resolvedProfileId =
      profileId && typeof profileId === 'string' ? profileId : null;

    // Gate AI tools behind paid plans — free users get chat-only
    const tools = planLimits.booleans.aiCanUseTools
      ? buildChatTools(artistContext, resolvedProfileId)
      : {};

    const result = streamText({
      model: gateway(CHAT_MODEL),
      system: systemPrompt,
      messages: modelMessages,
      tools,
      abortSignal: req.signal,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'jovie-chat',
      },
      onError: ({ error }) => {
        Sentry.captureException(error, {
          tags: { feature: 'ai-chat', errorType: 'streaming' },
          extra: {
            userId,
            messageCount: uiMessages.length,
            requestId,
          },
        });
      },
    });

    return result.toUIMessageStreamResponse({
      headers: {
        ...CORS_HEADERS,
        'x-request-id': requestId,
      },
    });
  } catch (error) {
    return buildChatErrorResponse(error, userId, uiMessages.length, requestId);
  }
}
