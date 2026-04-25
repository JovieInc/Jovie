import { randomUUID } from 'node:crypto';
import { gateway } from '@ai-sdk/gateway';
import * as Sentry from '@sentry/nextjs';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from 'ai';
import { and, count, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOptionalAuth } from '@/lib/auth/cached';
import { selectKnowledgeContext } from '@/lib/chat/knowledge/router';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { buildChatTools, buildFreeChatTools } from '@/lib/chat/tools/builders';
import { fetchReleasesForChat } from '@/lib/chat/tools/shared';
import { CHAT_MODEL, CHAT_MODEL_LIGHT } from '@/lib/constants/ai-models';
import { db } from '@/lib/db';
import { clickEvents, tips } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { sqlAny } from '@/lib/db/sql-helpers';
import { getEntitlements } from '@/lib/entitlements/registry';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';
import { FEATURE_FLAGS } from '@/lib/feature-flags/shared';
import { checkGateForUser } from '@/lib/flags/server';
import { createAuthenticatedCorsHeaders } from '@/lib/http/headers';
import {
  classifyIntent,
  isDeterministicIntent,
  routeIntent,
} from '@/lib/intent-detection';
import {
  checkAiChatRateLimitForPlan,
  createRateLimitHeaders,
} from '@/lib/rate-limit';
import { DSP_PLATFORMS } from '@/lib/services/social-links/types';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync/billing-info';

export const dynamic = 'force-dynamic';

export const maxDuration = 60;

const MAX_MESSAGE_LENGTH = 4000;
const MAX_MESSAGES_PER_REQUEST = 50;

const CHAT_KILL_SWITCH_GATES = {
  DISABLED: 'ai_chat_disabled',
  FORCE_LIGHT: 'ai_chat_force_light',
} as const;

const artistContextSchema = z.object({
  displayName: z.string().max(100),
  username: z.string().max(50),
  bio: z.string().max(500).nullable(),
  genres: z.array(z.string().max(50)).max(10),
  spotifyFollowers: z.number().int().nonnegative().nullable(),
  spotifyPopularity: z.number().int().min(0).max(100).nullable(),
  spotifyUrl: z.string().url().nullable().optional(),
  appleMusicUrl: z.string().url().nullable().optional(),
  profileViews: z.number().int().nonnegative(),
  hasSocialLinks: z.boolean(),
  hasMusicLinks: z.boolean(),
  tippingStats: z.object({
    tipClicks: z.number().int().nonnegative(),
    tipsSubmitted: z.number().int().nonnegative(),
    totalReceivedCents: z.number().int().nonnegative(),
    monthReceivedCents: z.number().int().nonnegative(),
  }),
});

type ArtistContext = z.infer<typeof artistContextSchema>;

async function fetchArtistContext(
  profileId: string,
  clerkUserId: string
): Promise<ArtistContext | null> {
  const [result] = await db
    .select({
      displayName: creatorProfiles.displayName,
      username: creatorProfiles.username,
      bio: creatorProfiles.bio,
      genres: creatorProfiles.genres,
      spotifyFollowers: creatorProfiles.spotifyFollowers,
      spotifyPopularity: creatorProfiles.spotifyPopularity,
      spotifyUrl: creatorProfiles.spotifyUrl,
      appleMusicUrl: creatorProfiles.appleMusicUrl,
      profileViews: creatorProfiles.profileViews,
      userClerkId: users.clerkId,
    })
    .from(creatorProfiles)
    .leftJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.id, profileId))
    .limit(1);

  if (result?.userClerkId !== clerkUserId) {
    return null;
  }

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const startOfMonthISO = startOfMonth.toISOString();

  const [linkCounts, tipTotals, clickStats] = await Promise.all([
    db
      .select({
        totalActive: count(),
        musicActive: drizzleSql<number>`count(*) filter (where ${socialLinks.platformType} = 'dsp' OR ${socialLinks.platform} = ${sqlAny(DSP_PLATFORMS)})`,
      })
      .from(socialLinks)
      .where(
        and(
          eq(socialLinks.creatorProfileId, profileId),
          eq(socialLinks.state, 'active')
        )
      )
      .then(rows => rows[0]),
    db
      .select({
        totalReceived: drizzleSql<number>`COALESCE(SUM(${tips.amountCents}), 0)`,
        monthReceived: drizzleSql<number>`COALESCE(SUM(CASE WHEN ${tips.createdAt} >= ${startOfMonthISO}::timestamp THEN ${tips.amountCents} ELSE 0 END), 0)`,
        tipsSubmitted: drizzleSql<number>`COALESCE(COUNT(${tips.id}), 0)`,
      })
      .from(tips)
      .where(eq(tips.creatorProfileId, profileId))
      .then(rows => rows[0]),
    db
      .select({
        total: drizzleSql<number>`count(*)`,
      })
      .from(clickEvents)
      .where(
        and(
          eq(clickEvents.creatorProfileId, profileId),
          eq(clickEvents.linkType, 'tip')
        )
      )
      .then(rows => rows[0]),
  ]);

  return {
    displayName: result.displayName ?? result.username,
    username: result.username,
    bio: result.bio,
    genres: result.genres ?? [],
    spotifyFollowers: result.spotifyFollowers,
    spotifyPopularity: result.spotifyPopularity,
    spotifyUrl: result.spotifyUrl,
    appleMusicUrl: result.appleMusicUrl,
    profileViews: result.profileViews ?? 0,
    hasSocialLinks: Number(linkCounts?.totalActive ?? 0) > 0,
    hasMusicLinks: Number(linkCounts?.musicActive ?? 0) > 0,
    tippingStats: {
      tipClicks: Number(clickStats?.total ?? 0),
      tipsSubmitted: Number(tipTotals?.tipsSubmitted ?? 0),
      totalReceivedCents: Number(tipTotals?.totalReceived ?? 0),
      monthReceivedCents: Number(tipTotals?.monthReceived ?? 0),
    },
  };
}

async function resolveArtistContext(
  profileId: unknown,
  artistContextInput: unknown,
  userId: string,
  corsHeaders: Record<string, string>
): Promise<
  | { context: ArtistContext; error?: never }
  | { context?: never; error: NextResponse }
> {
  if (profileId && typeof profileId === 'string') {
    const context = await fetchArtistContext(profileId, userId);
    if (!context) {
      return {
        error: NextResponse.json(
          { error: 'Profile not found or unauthorized' },
          { status: 404, headers: corsHeaders }
        ),
      };
    }
    return { context };
  }

  const parseResult = artistContextSchema.safeParse(artistContextInput);
  if (!parseResult.success) {
    return {
      error: NextResponse.json(
        {
          error: 'Invalid artistContext format',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400, headers: corsHeaders }
      ),
    };
  }

  return { context: parseResult.data };
}

function extractUIMessageText(
  parts: Array<{ type: string; text?: string }>
): string {
  return parts
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part.type === 'text' && typeof part.text === 'string'
    )
    .map(part => part.text)
    .join('');
}

function validateMessage(message: unknown): string | null {
  if (typeof message !== 'object' || message === null || !('role' in message)) {
    return 'Invalid message format';
  }

  const candidate = message as Record<string, unknown>;

  if (candidate.role !== 'user' && candidate.role !== 'assistant') {
    return 'Invalid message role';
  }

  if (!('parts' in candidate) || !Array.isArray(candidate.parts)) {
    return 'Invalid message format';
  }

  if (candidate.role === 'user') {
    const content = extractUIMessageText(
      candidate.parts as Array<{ type: string; text?: string }>
    );
    if (content.length > MAX_MESSAGE_LENGTH) {
      return `Message too long. Maximum is ${MAX_MESSAGE_LENGTH} characters`;
    }
  }

  return null;
}

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

function safeSetSentryContext(callback: () => void): void {
  try {
    callback();
  } catch {
    // Observability must never break the chat request path.
  }
}

function toNullableString(value: unknown): string | null {
  return value && typeof value === 'string' ? value : null;
}

async function fetchOptionalReleases(profileId: string | null) {
  if (!profileId) {
    return [];
  }

  try {
    return await fetchReleasesForChat(profileId);
  } catch {
    return [];
  }
}

const SIMPLE_INTENT_PATTERNS = [
  /^(?:change|update|set|edit|make)\s+(?:my\s+)?(?:display\s*name|name|bio)\s+(?:to|:)/i,
  /^(?:add|connect|link)\s+(?:my\s+)?(?:instagram|twitter|x|tiktok|youtube|spotify|soundcloud|bandcamp|facebook|link|url|website)/i,
  /^(?:upload|change|update|set)\s+(?:my\s+)?(?:photo|avatar|picture|profile\s*pic|pfp)/i,
  /^(?:format|clean\s*up|fix)\s+(?:my\s+)?lyrics/i,
  /^check\s+(?:my\s+)?canvas/i,
  /^mark\s+\S+(?:\s+\S+)*\s+as\s+(?:uploaded|done|set)/i,
] as const;

function canUseLightModel(
  messages: UIMessage[],
  aiCanUseTools: boolean
): boolean {
  if (!aiCanUseTools) return true;
  if (messages.length > 6) return false;

  const lastUserMessage = [...messages]
    .reverse()
    .find(message => message.role === 'user');
  if (!lastUserMessage) return false;

  const text = lastUserMessage.parts
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part.type === 'text' && typeof part.text === 'string'
    )
    .map(part => part.text)
    .join('')
    .trim();

  return (
    text.length < 200 &&
    SIMPLE_INTENT_PATTERNS.some(pattern => pattern.test(text))
  );
}

function isClientDisconnect(
  error: unknown,
  signal: AbortSignal | undefined
): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return (code === 'EPIPE' || code === 'ECONNRESET') && !!signal?.aborted;
}

function buildChatErrorResponse(
  error: unknown,
  userId: string,
  messageCount: number,
  requestId: string,
  profileId: string | null,
  conversationId: string | null,
  corsHeaders: Record<string, string>
) {
  Sentry.captureException(error, {
    tags: { feature: 'ai-chat' },
    extra: { userId, messageCount, requestId, profileId, conversationId },
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
    { status: 500, headers: { ...corsHeaders, 'x-request-id': requestId } }
  );
}

async function tryRouteViaIntent(
  uiMessages: UIMessage[],
  profileId: unknown,
  userId: string,
  corsHeaders: Record<string, string>,
  requestId: string
): Promise<Response | null> {
  const lastUserMessage = [...uiMessages]
    .reverse()
    .find(message => message.role === 'user');
  if (!lastUserMessage) return null;

  const userText = lastUserMessage.parts
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part.type === 'text' && typeof part.text === 'string'
    )
    .map(part => part.text)
    .join('')
    .trim();

  const intent = classifyIntent(userText);
  if (!isDeterministicIntent(intent)) return null;

  const resolvedProfileId = toNullableString(profileId);
  const result = await routeIntent(intent, {
    clerkUserId: userId,
    profileId: resolvedProfileId,
  });
  if (!result) return null;

  const replyText =
    typeof result.message === 'string' && result.message.length > 0
      ? result.message
      : result.success
        ? 'Done.'
        : 'Something went wrong. Please try again.';

  const textId = randomUUID();
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'start-step' });
      writer.write({ type: 'text-start', id: textId });
      writer.write({ type: 'text-delta', id: textId, delta: replyText });
      writer.write({ type: 'text-end', id: textId });
      writer.write({ type: 'finish-step' });
      writer.write({ type: 'finish' });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      ...corsHeaders,
      'x-request-id': requestId,
      'x-intent-routed': 'true',
      'x-intent-category': intent.category,
    },
  });
}

export async function OPTIONS(req: Request) {
  const corsHeaders = createAuthenticatedCorsHeaders(
    req.headers.get('origin'),
    'POST, OPTIONS'
  );

  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders,
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(req: Request) {
  const requestId = extractRequestId(req);
  const corsHeaders = createAuthenticatedCorsHeaders(
    req.headers.get('origin'),
    'POST, OPTIONS'
  );

  safeSetSentryContext(() => {
    Sentry.setTag('feature', 'ai-chat');
    Sentry.setExtra('request_id', requestId);
  });

  const { userId } = await getOptionalAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized', requestId },
      { status: 401, headers: { ...corsHeaders, 'x-request-id': requestId } }
    );
  }

  const billingInfo = await getUserBillingInfo();
  const userPlan = billingInfo.data?.plan ?? 'free';
  safeSetSentryContext(() => {
    Sentry.setTag('plan_tier', userPlan);
  });

  const chatDisabled = await checkGateForUser(
    userId,
    CHAT_KILL_SWITCH_GATES.DISABLED,
    false
  );
  if (chatDisabled) {
    return NextResponse.json(
      {
        error: 'Chat is temporarily unavailable',
        message:
          'Jovie chat is paused while we address an upstream issue. Please try again in a few minutes.',
        errorCode: 'CHAT_DISABLED',
        requestId,
      },
      { status: 503, headers: { ...corsHeaders, 'x-request-id': requestId } }
    );
  }

  const forceLightModel = await checkGateForUser(
    userId,
    CHAT_KILL_SWITCH_GATES.FORCE_LIGHT,
    false
  );
  const planLimits = getEntitlements(userPlan);
  const currentUserEntitlements = await getCurrentUserEntitlements().catch(
    () => null
  );
  const insightsEnabled = currentUserEntitlements?.isPro ?? false;

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
          ...corsHeaders,
          ...createRateLimitHeaders(rateLimitResult),
          'x-request-id': requestId,
        },
      }
    );
  }

  let body: {
    messages?: unknown;
    profileId?: unknown;
    conversationId?: unknown;
    artistContext?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', requestId },
      { status: 400, headers: { ...corsHeaders, 'x-request-id': requestId } }
    );
  }

  const { messages, profileId, conversationId } = body;

  if (
    !toNullableString(profileId) &&
    (!body.artistContext || typeof body.artistContext !== 'object')
  ) {
    return NextResponse.json(
      { error: 'Missing profileId or artistContext', requestId },
      { status: 400, headers: { ...corsHeaders, 'x-request-id': requestId } }
    );
  }

  const messagesError = validateMessagesArray(messages);
  if (messagesError) {
    return NextResponse.json(
      { error: messagesError, requestId },
      { status: 400, headers: { ...corsHeaders, 'x-request-id': requestId } }
    );
  }

  const uiMessages = messages as UIMessage[];

  const intentResponse = await tryRouteViaIntent(
    uiMessages,
    profileId,
    userId,
    corsHeaders,
    requestId
  );
  if (intentResponse) return intentResponse;

  const contextResult = await resolveArtistContext(
    profileId,
    body.artistContext,
    userId,
    corsHeaders
  );
  if (contextResult.error) {
    return contextResult.error;
  }
  const artistContext = contextResult.context;

  const resolvedProfileId = toNullableString(profileId);
  const resolvedConversationId = toNullableString(conversationId);
  const releases = await fetchOptionalReleases(resolvedProfileId);

  const recentUserText = [...uiMessages]
    .reverse()
    .filter(message => message.role === 'user')
    .slice(0, 3)
    .flatMap(message =>
      (message.parts ?? [])
        .filter(
          (part): part is { type: 'text'; text: string } =>
            part.type === 'text' && typeof part.text === 'string'
        )
        .map(part => part.text)
    )
    .join(' ');
  const knowledgeContext = selectKnowledgeContext(recentUserText);

  const systemPrompt = buildSystemPrompt(artistContext, releases, {
    aiCanUseTools: planLimits.booleans.aiCanUseTools,
    aiDailyMessageLimit: planLimits.limits.aiDailyMessageLimit,
    insightsEnabled,
    knowledgeContext: knowledgeContext || undefined,
  });

  try {
    const modelMessages = await convertToModelMessages(uiMessages);
    const albumArtEnabled = FEATURE_FLAGS.ALBUM_ART_GENERATION;

    const freeTools = buildFreeChatTools(resolvedProfileId, userId);
    const tools = planLimits.booleans.aiCanUseTools
      ? {
          ...freeTools,
          ...buildChatTools(
            artistContext,
            resolvedProfileId,
            insightsEnabled,
            userId,
            currentUserEntitlements?.canGenerateAlbumArt ?? false,
            albumArtEnabled
          ),
        }
      : freeTools;

    const shouldUseLightModel =
      forceLightModel ||
      canUseLightModel(uiMessages, planLimits.booleans.aiCanUseTools);
    const selectedModel = shouldUseLightModel ? CHAT_MODEL_LIGHT : CHAT_MODEL;

    safeSetSentryContext(() => {
      Sentry.setTags({
        chat_model: selectedModel,
        chat_force_light: String(forceLightModel),
        chat_has_tools: String(planLimits.booleans.aiCanUseTools),
      });
    });
    if (resolvedConversationId) {
      safeSetSentryContext(() => {
        Sentry.setExtra(
          'chat_conversation_id',
          resolvedConversationId.slice(0, 120)
        );
      });
    }

    const result = streamText({
      model: gateway(selectedModel),
      system: systemPrompt,
      messages: modelMessages,
      tools,
      abortSignal: req.signal,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: 'jovie-chat',
        metadata: { model: selectedModel, plan: userPlan },
      },
      onError: ({ error }) => {
        if (isClientDisconnect(error, req.signal)) return;

        Sentry.captureException(error, {
          tags: { feature: 'ai-chat', errorType: 'streaming' },
          extra: {
            userId,
            messageCount: uiMessages.length,
            requestId,
            profileId: resolvedProfileId,
            conversationId: resolvedConversationId,
          },
        });
      },
    });

    return result.toUIMessageStreamResponse({
      headers: {
        ...corsHeaders,
        'x-request-id': requestId,
      },
    });
  } catch (error) {
    if (isClientDisconnect(error, req.signal)) {
      return new NextResponse(
        JSON.stringify({ error: 'Client disconnected', requestId }),
        {
          status: 499,
          headers: { ...corsHeaders, 'x-request-id': requestId },
        }
      );
    }

    return buildChatErrorResponse(
      error,
      userId,
      uiMessages.length,
      requestId,
      resolvedProfileId,
      resolvedConversationId,
      corsHeaders
    );
  }
}
