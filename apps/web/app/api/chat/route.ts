import { gateway } from '@ai-sdk/gateway';
import { auth } from '@clerk/nextjs/server';
import * as Sentry from '@sentry/nextjs';
import { convertToModelMessages, streamText, type UIMessage } from 'ai';
import { NextResponse } from 'next/server';
import { CHAT_MODEL } from '@/lib/constants/ai-models';
import { CORS_HEADERS } from '@/lib/http/headers';
import {
  checkAiChatRateLimitForPlan,
  createRateLimitHeaders,
} from '@/lib/rate-limit';
import { getPlanLimits } from '@/lib/stripe/config';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync/billing-info';
import { resolveArtistContext } from './_lib/context';
import { buildSystemPrompt } from './_lib/system-prompt';
import { buildChatTools } from './_lib/tools';
import { validateMessagesArray } from './_lib/validation';

export const maxDuration = 30;

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

export async function POST(req: Request) {
  // Auth check - ensure user is authenticated
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  // Fetch user plan for rate limiting and tool gating
  const billingInfo = await getUserBillingInfo();
  const userPlan = billingInfo.data?.plan ?? 'free';
  const planLimits = getPlanLimits(userPlan);

  // Rate limiting - plan-aware daily quota + burst protection
  const rateLimitResult = await checkAiChatRateLimitForPlan(userId, userPlan);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: rateLimitResult.reason,
        retryAfter: Math.ceil(
          (rateLimitResult.reset.getTime() - Date.now()) / 1000
        ),
      },
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          ...createRateLimitHeaders(rateLimitResult),
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
      { error: 'Invalid JSON body' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { messages, profileId } = body;

  // Validate that either profileId or artistContext is provided
  if (
    (!profileId || typeof profileId !== 'string') &&
    (!body.artistContext || typeof body.artistContext !== 'object')
  ) {
    return NextResponse.json(
      { error: 'Missing profileId or artistContext' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Validate messages array and individual messages
  const messagesError = validateMessagesArray(messages);
  if (messagesError) {
    return NextResponse.json(
      { error: messagesError },
      { status: 400, headers: CORS_HEADERS }
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
    aiCanUseTools: planLimits.aiCanUseTools,
    aiDailyMessageLimit: planLimits.aiDailyMessageLimit,
  });

  try {
    // Convert UIMessages (from the client) to ModelMessages (for streamText)
    const modelMessages = await convertToModelMessages(uiMessages);

    // Build tools via extracted module
    const resolvedProfileId =
      profileId && typeof profileId === 'string' ? profileId : null;

    const tools = buildChatTools({
      artistContext,
      profileId: resolvedProfileId,
      userId,
      aiCanUseTools: planLimits.aiCanUseTools,
    });

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
          },
        });
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { feature: 'ai-chat' },
      extra: {
        userId,
        messageCount: uiMessages.length,
      },
    });

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred';

    return NextResponse.json(
      { error: 'Failed to process chat request', message },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
