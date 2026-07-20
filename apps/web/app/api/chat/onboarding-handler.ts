import 'server-only';
import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import type { UIMessage } from 'ai';
import { and, desc, sql as drizzleSql, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  decideFallbackTurn,
  type FallbackTurn,
} from '@/lib/chat/onboarding-script/engine';
import {
  buildScriptedFallbackResponse,
  type FallbackReason,
} from '@/lib/chat/onboarding-script/respond';
import { STREAM_ERROR_LINE } from '@/lib/chat/onboarding-script/script';
import { sanitizeAssistantResponse } from '@/lib/chat/prompt-disclosure-guard';
import { executeChatTurn, isClientDisconnect } from '@/lib/chat/run';
import { sanitizeConversationTitle } from '@/lib/chat/title';
import {
  encodeToolEvents,
  type PersistedToolEvent,
} from '@/lib/chat/tool-events';
import {
  buildOnboardingTools,
  createOnboardingTurnState,
} from '@/lib/chat/tools/onboarding-tool-impls';
import type { ChatTelemetry } from '@/lib/chat/types';
import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@/lib/db/schema/chat';
import { getEntitlements } from '@/lib/entitlements/registry';
import { publicEnv } from '@/lib/env-public';
import { env, isSecureEnv } from '@/lib/env-server';
import { checkGateForUser } from '@/lib/flags/server';
import { createAuthenticatedCorsHeaders } from '@/lib/http/headers';
import {
  encodeSessionCookie,
  ONBOARDING_SESSION_COOKIE_NAME,
  verifySessionCookie,
} from '@/lib/onboarding/session';
import {
  checkAnonymousChatRateLimit,
  createRateLimitHeaders,
} from '@/lib/rate-limit';
import { isLocalDevelopmentAutomationHostname } from '@/lib/security/development-only';
import {
  isTurnstileConfigured,
  verifyTurnstileToken,
} from '@/lib/turnstile/verify';
import { extractClientIPFromRequest } from '@/lib/utils/ip-extraction';
import { logger } from '@/lib/utils/logger';

/** Existing Statsig kill switch for all `/api/chat` traffic. */
const CHAT_DISABLED_GATE = 'ai_chat_disabled';

/** Maximum onboarding messages we accept in a single request payload. */
const MAX_ONBOARDING_MESSAGES = 50;

/** Maximum text length per onboarding message. */
const MAX_ONBOARDING_MESSAGE_LENGTH = 4000;

/**
 * Anonymous onboarding chat handler (JOV-2132).
 *
 * Gate chain (in order):
 *  1. Statsig kill-switch `ai_chat_disabled` — return 503 if disabled.
 *  2. Resolve or mint a signed onboarding session cookie.
 *  3. Resolve client IP (via trusted proxy header helper) + ASN.
 *  4. Verify Cloudflare Turnstile token on the first message of a fresh
 *     session. Fail-closed when unconfigured in non-dev envs.
 *  5. Apply IP + ASN + session-lifetime rate limits.
 *  6. Validate the UIMessage payload (length caps).
 *  7. Dispatch `executeChatTurn` with `mode='onboarding'`, the onboarding
 *     tool palette, and the Stanley-style system prompt. Stream the
 *     UIMessage response back.
 *
 * Returns `null` when the request is not addressed to onboarding mode, so the
 * main `/api/chat` handler can fall through to the authenticated chat flow.
 */

// eslint-disable-next-line @jovie/chat-tool-schema-strict -- HTTP request DTO, not LLM tool input
const onboardingPayloadSchema = z.object({
  mode: z.literal('onboarding'),
  turnstileToken: z.string().max(2048).optional(),
  /**
   * UIMessage[] from the AI SDK client. Validated for shape elsewhere (message
   * role + parts structure); we only enforce length caps here.
   */
  messages: z.array(z.unknown()).max(MAX_ONBOARDING_MESSAGES).optional(),
});

interface PeekedBody {
  readonly raw: unknown;
  readonly mode?: string;
  readonly turnstileToken?: string;
}

/**
 * Peek the request body for `mode`. Cloned to leave the original body intact
 * for downstream handlers (Next's Request body is consumed once).
 */
async function peekOnboardingMode(req: Request): Promise<PeekedBody | null> {
  let raw: unknown;
  try {
    raw = await req.clone().json();
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  return {
    raw,
    mode: typeof obj.mode === 'string' ? obj.mode : undefined,
    turnstileToken:
      typeof obj.turnstileToken === 'string' ? obj.turnstileToken : undefined,
  };
}

function extractClientIp(req: Request): string {
  // Delegate to the canonical helper which validates the IP and uses the
  // trusted-proxy priority order (cf-connecting-ip → x-real-ip → x-forwarded-for).
  // The raw leftmost x-forwarded-for is client-controllable, so we never use it
  // directly for abuse-control inputs.
  return extractClientIPFromRequest(req) || 'unknown';
}

function extractAsn(req: Request): string | null {
  // Cloudflare exposes ip-asn; Vercel proxies sometimes do the same.
  return (
    req.headers.get('x-vercel-ip-asn')?.trim() ||
    req.headers.get('cf-ip-asn')?.trim() ||
    null
  );
}

function extractRequestHostname(req: Request): string | null {
  const rawHost = req.headers.get('host');
  const normalized = rawHost?.split(',')[0]?.trim();
  if (!normalized) {
    try {
      return new URL(req.url).hostname;
    } catch {
      return null;
    }
  }

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      return new URL(normalized).hostname;
    } catch {
      return null;
    }
  }

  return normalized.replace(/:\d+$/, '');
}

function isSecureTurnstileEnvironment(req: Request): boolean {
  const isSecureVercelDeployment =
    env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview';
  if (isSecureVercelDeployment) return true;

  const isLocalPublicSmoke =
    env.PUBLIC_NOAUTH_SMOKE === '1' &&
    isLocalDevelopmentAutomationHostname(extractRequestHostname(req));
  if (isLocalPublicSmoke) return false;

  return isSecureEnv();
}

function shouldBypassTurnstileForLocalRuntime(req: Request): boolean {
  if (isSecureTurnstileEnvironment(req)) return false;

  return (
    env.NODE_ENV === 'development' ||
    publicEnv.NEXT_PUBLIC_E2E_MODE === '1' ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    (env.PUBLIC_NOAUTH_SMOKE === '1' &&
      isLocalDevelopmentAutomationHostname(extractRequestHostname(req)))
  );
}

/**
 * Return a Response if this request should be handled as anonymous onboarding,
 * or `null` if the caller should fall through to the authenticated flow.
 */
export async function tryHandleAnonymousOnboardingChat(
  req: Request,
  requestId: string
): Promise<Response | null> {
  const peeked = await peekOnboardingMode(req);
  if (!peeked || peeked.mode !== 'onboarding') return null;

  const corsHeaders = createAuthenticatedCorsHeaders(
    req.headers.get('origin'),
    'POST, OPTIONS'
  );

  // Validate the onboarding-shaped envelope (other fields validated in PR 2).
  const parsed = onboardingPayloadSchema.safeParse(peeked.raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid onboarding chat request',
        errorCode: 'INVALID_ONBOARDING_PAYLOAD',
        requestId,
      },
      { status: 400, headers: { ...corsHeaders, 'x-request-id': requestId } }
    );
  }

  Sentry.setTag('chat_mode', 'onboarding');
  Sentry.setTag('chat_anonymous', 'true');

  // --- Statsig kill switch (ai_chat_disabled) ---
  // Anonymous onboarding is a live route, not a default-off rollout. Reuse the
  // existing chat kill switch so unconfigured Statsig cannot disable /start.
  // Anonymous → pass `null` userId; Statsig falls back to public conditions.
  // The switch no longer 503s onboarding: it skips the LLM dispatch and the
  // deterministic script (JOV-3806) carries the conversation instead. Abuse
  // controls (Turnstile, rate limits) below still run in full.
  const shouldBypassTurnstile = shouldBypassTurnstileForLocalRuntime(req);
  const chatDisabled = shouldBypassTurnstile
    ? false
    : await checkGateForUser(null, CHAT_DISABLED_GATE, false);

  // --- Session cookie: read existing or mint a new one ---
  const incomingCookieHeader = req.headers.get('cookie') || '';
  const cookieMap = parseCookieHeader(incomingCookieHeader);
  const existingSessionId = verifySessionCookie(
    cookieMap.get(ONBOARDING_SESSION_COOKIE_NAME)
  );

  let sessionId: string;
  let mintedSessionCookie: string | null = null;
  if (existingSessionId) {
    sessionId = existingSessionId;
  } else {
    sessionId = randomUUID();
    // Sign the new sessionId. encodeSessionCookie throws if SESSION_SECRET is
    // missing/short — surface that as a 503 (not 500) so observability can tell
    // an ops-config gap from a true crash.
    try {
      mintedSessionCookie = encodeSessionCookie(sessionId);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { context: 'onboarding_handler_mint_cookie' },
      });
      return NextResponse.json(
        {
          error: 'Onboarding chat is temporarily unavailable',
          errorCode: 'SESSION_SECRET_NOT_CONFIGURED',
          requestId,
        },
        {
          status: 503,
          headers: { ...corsHeaders, 'x-request-id': requestId },
        }
      );
    }
  }

  const ip = extractClientIp(req);
  const asn = extractAsn(req);

  // --- Turnstile gate: required for the first message of a fresh session ---
  if (!existingSessionId) {
    if (!shouldBypassTurnstile && !isTurnstileConfigured()) {
      // Fail-closed in production/preview: if Turnstile keys aren't configured
      // we must NOT silently let bot traffic through. A missing secret is an
      // ops gap, not a feature flag — surface as 503 so it pages and gets
      // fixed instead of opening the LLM spend to unauthenticated bots. Local
      // dev is the one exemption above: contributors shouldn't need Cloudflare
      // creds or a live challenge iframe to run the dev server locally.
      Sentry.captureMessage(
        'Turnstile not configured in non-dev env — onboarding chat returning 503',
        { level: 'error' }
      );
      return NextResponse.json(
        {
          error: 'Onboarding chat is temporarily unavailable',
          errorCode: 'TURNSTILE_NOT_CONFIGURED',
          requestId,
        },
        {
          status: 503,
          headers: { ...corsHeaders, 'x-request-id': requestId },
        }
      );
    }

    if (!shouldBypassTurnstile) {
      const verify = await verifyTurnstileToken(parsed.data.turnstileToken, ip);
      if (!verify.success) {
        return NextResponse.json(
          {
            error: 'Bot challenge failed',
            errorCode: 'TURNSTILE_REQUIRED',
            reason: verify.reason,
            requestId,
          },
          {
            status: 403,
            headers: {
              ...corsHeaders,
              'x-request-id': requestId,
            },
          }
        );
      }
    }
  }

  // --- Rate limits: IP + ASN + session ---
  // E2E exemption (same triple-guard shape as the OTP rule in
  // lib/auth/rate-limit-rules.ts): these limiters are requireRedis and FAIL
  // CLOSED (success:false) when Redis is absent, and their IP key collapses to
  // loopback in CI where one shared Upstash bucket is raced by external
  // dev/agent runs — deterministic test traffic would 429 nondeterministically
  // either way, so the guard skips the check entirely. Never on production.
  const skipAnonymousChatRateLimit =
    env.E2E_TEST_MODE === '1' && env.VERCEL_ENV !== 'production';
  if (!skipAnonymousChatRateLimit) {
    const rate = await checkAnonymousChatRateLimit({ ip, sessionId, asn });
    if (!rate.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: rate.reason,
          errorCode: 'RATE_LIMITED',
          requestId,
        },
        {
          status: 429,
          headers: {
            ...corsHeaders,
            ...createRateLimitHeaders(rate),
            'x-request-id': requestId,
          },
        }
      );
    }
  }

  // --- Validate and shape the UIMessage payload ---
  const rawMessages = (parsed.data.messages ?? []) as unknown[];
  const messagesError = validateOnboardingMessages(rawMessages);
  if (messagesError) {
    return NextResponse.json(
      {
        error: messagesError,
        errorCode: 'INVALID_MESSAGES',
        requestId,
      },
      { status: 400, headers: { ...corsHeaders, 'x-request-id': requestId } }
    );
  }
  const uiMessages = rawMessages as UIMessage[];
  const latestUserMessage = getLatestUserMessage(uiMessages);
  if (!latestUserMessage) {
    return NextResponse.json(
      {
        error: 'messages array must include a user message',
        errorCode: 'INVALID_MESSAGES',
        requestId,
      },
      { status: 400, headers: { ...corsHeaders, 'x-request-id': requestId } }
    );
  }
  const turnCount = uiMessages.filter(m => m.role === 'user').length;

  let conversationId: string;
  try {
    conversationId = await reserveAnonymousOnboardingConversation({
      sessionId,
      latestUserMessage,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { context: 'onboarding_handler_persistence' },
      extra: { sessionId: sessionId.slice(0, 8), requestId, turnCount },
    });
    return NextResponse.json(
      {
        error: 'Onboarding chat is temporarily unavailable',
        errorCode: 'ONBOARDING_CHAT_PERSISTENCE_FAILED',
        requestId,
      },
      {
        status: 503,
        headers: { ...corsHeaders, 'x-request-id': requestId },
      }
    );
  }

  // --- Build the per-turn state accumulator and the onboarding tool palette ---
  const onboardingState = createOnboardingTurnState({
    sessionId,
    turnCount,
    messages: uiMessages,
  });
  const tools = buildOnboardingTools(onboardingState);

  // --- Telemetry hooks (mirror authenticated chat) ---
  const telemetry: ChatTelemetry = {
    setTags: tags => {
      try {
        Sentry.setTags(tags);
      } catch {}
    },
    setExtra: (key, value) => {
      try {
        Sentry.setExtra(key, value);
      } catch {}
    },
    addBreadcrumb: breadcrumb => {
      try {
        Sentry.addBreadcrumb({
          category: breadcrumb.category,
          message: breadcrumb.message,
          level: breadcrumb.level,
          data: breadcrumb.data,
        });
      } catch {}
    },
    captureException: (error, context) => {
      try {
        Sentry.captureException(error, context);
      } catch {}
    },
  };

  // --- Dispatch the LLM turn ---
  // Anonymous: no userId, no creator profile, no artist context. The free-tier
  // entitlements are passed so the planLimits flags (aiCanUseTools, etc.) line
  // up with what the LLM expects. forceLightModel keeps onboarding on Haiku
  // until we have signal a real artist is on the other end — flipped via
  // confirmSpotifyArtist + recordInterviewSignal in a follow-up commit.
  const freeTierLimits = getEntitlements('free');

  const responseHeaders: Record<string, string> = {
    ...corsHeaders,
    'x-request-id': requestId,
    'x-chat-mode': 'onboarding',
  };
  if (mintedSessionCookie) {
    responseHeaders['set-cookie'] =
      buildSessionCookieHeader(mintedSessionCookie);
  }

  // Deterministic scripted fallback (JOV-3806): serves the onboarding rail
  // without the LLM. Fresh state derivation — the LLM turn may have partially
  // mutated `onboardingState` before failing.
  const serveScriptedFallback = async (
    reason: FallbackReason
  ): Promise<Response> => {
    const fallbackState = createOnboardingTurnState({
      sessionId,
      turnCount,
      messages: uiMessages,
    });
    const turn: FallbackTurn = await decideFallbackTurn({
      uiMessages,
      state: fallbackState,
    });
    const built = buildScriptedFallbackResponse({
      turn,
      reason,
      headers: responseHeaders,
    });
    await persistAnonymousAssistantRecord({
      conversationId,
      latestUserClientMessageId: latestUserMessage.clientMessageId,
      content: turn.text,
      toolCalls: built.persistedToolEvents,
      assistantSource: 'script',
      scriptLineKey: turn.line.key,
    });
    Sentry.addBreadcrumb({
      category: 'onboarding-chat',
      message: 'scripted_fallback_dispatch',
      level: 'warning',
      data: { reason, lineKey: turn.line.key, turnCount },
    });
    return built.response;
  };

  const forcedFallbackReason: FallbackReason | null = chatDisabled
    ? 'kill_switch'
    : isLlmFailureInjected(req)
      ? 'injected'
      : null;

  try {
    if (forcedFallbackReason) {
      return await serveScriptedFallback(forcedFallbackReason);
    }

    const turn = await executeChatTurn({
      uiMessages,
      artistContext: null,
      releases: [],
      resolvedProfileId: null,
      resolvedConversationId: conversationId,
      userId: null,
      userPlan: 'free',
      planLimits: freeTierLimits,
      insightsEnabled: false,
      // Haiku-forced for anonymous traffic. PR follow-up: allow Sonnet once
      // confirmSpotifyArtist has resolved a verified or 1k+-follower artist.
      forceLightModel: true,
      tools,
      signal: req.signal,
      requestId,
      telemetry,
      mode: 'onboarding',
    });

    Sentry.addBreadcrumb({
      category: 'onboarding-chat',
      message: 'anonymous_dispatch',
      level: 'info',
      data: {
        sessionMinted: !existingSessionId,
        asnPresent: Boolean(asn),
        turnCount,
        selectedModel: turn.selectedModel,
        toolCount: turn.toolNames.length,
      },
    });

    return turn.streamResult.toUIMessageStreamResponse({
      headers: responseHeaders,
      onFinish: async ({ responseMessage }) => {
        await persistAnonymousAssistantMessage({
          conversationId,
          latestUserClientMessageId: latestUserMessage.clientMessageId,
          responseMessage,
        });
      },
      // Mid-stream failures cannot swap the Response for the scripted
      // fallback; the lint-clean script line is the recovery copy instead.
      onError: () => STREAM_ERROR_LINE.text,
    });
  } catch (error) {
    if (isClientDisconnect(error, req.signal)) {
      return new NextResponse(null, {
        status: 499,
        headers: { ...corsHeaders, 'x-request-id': requestId },
      });
    }
    // The LLM failure still pages — the fallback masks the user impact, not
    // the incident. The logger line keeps the failure visible in local dev,
    // where Sentry is a no-op and the fallback would otherwise hide it.
    logger.error(
      '[onboarding-chat] LLM turn failed; serving scripted fallback',
      { error, requestId, turnCount }
    );
    Sentry.captureException(error, {
      tags: { feature: 'ai-chat', chat_mode: 'onboarding' },
      extra: { sessionId: sessionId.slice(0, 8), requestId, turnCount },
    });
    try {
      return await serveScriptedFallback('llm_error');
    } catch (fallbackError) {
      Sentry.captureException(fallbackError, {
        tags: {
          feature: 'ai-chat',
          chat_mode: 'onboarding',
          context: 'scripted_fallback_failed',
        },
        extra: { sessionId: sessionId.slice(0, 8), requestId, turnCount },
      });
      return NextResponse.json(
        {
          error: 'Onboarding chat failed',
          errorCode: 'INTERNAL_ERROR',
          requestId,
        },
        {
          status: 500,
          headers: { ...corsHeaders, 'x-request-id': requestId },
        }
      );
    }
  }
}

/**
 * E2E-only LLM failure injection. Fails closed: the header is inert unless
 * the server was started with `CHAT_LLM_FAILURE_INJECTION=1`, and production
 * deploys ignore it unconditionally.
 */
function isLlmFailureInjected(req: Request): boolean {
  return (
    env.CHAT_LLM_FAILURE_INJECTION === '1' &&
    env.VERCEL_ENV !== 'production' &&
    req.headers.get('x-jovie-e2e-llm-failure') === '1'
  );
}

interface LatestUserMessage {
  readonly clientMessageId: string;
  readonly text: string;
}

function getLatestUserMessage(
  messages: readonly UIMessage[]
): LatestUserMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') continue;
    return {
      clientMessageId: message.id || `user:${index}`,
      text: extractUIMessageText(message.parts),
    };
  }
  return null;
}

function extractUIMessageText(parts: UIMessage['parts']): string {
  return (parts ?? [])
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part.type === 'text' && typeof part.text === 'string'
    )
    .map(part => part.text)
    .join('');
}

async function reserveAnonymousOnboardingConversation({
  sessionId,
  latestUserMessage,
}: {
  readonly sessionId: string;
  readonly latestUserMessage: LatestUserMessage;
}): Promise<string> {
  const now = new Date();
  const [existingConversation] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.sessionId, sessionId),
        isNull(chatConversations.userId),
        isNull(chatConversations.creatorProfileId)
      )
    )
    .orderBy(desc(chatConversations.updatedAt))
    .limit(1);

  const conversationId =
    existingConversation?.id ??
    (
      await db
        .insert(chatConversations)
        .values({
          sessionId,
          title: sanitizeConversationTitle(latestUserMessage.text, 50),
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: chatConversations.id })
    )[0]?.id;

  if (!conversationId) {
    throw new Error('Failed to reserve anonymous onboarding conversation');
  }

  await db
    .insert(chatMessages)
    .values({
      conversationId,
      clientMessageId: latestUserMessage.clientMessageId,
      role: 'user',
      content: latestUserMessage.text,
      createdAt: now,
    })
    .onConflictDoNothing({
      target: [chatMessages.conversationId, chatMessages.clientMessageId],
      where: drizzleSql`${chatMessages.clientMessageId} IS NOT NULL`,
    });

  await db
    .update(chatConversations)
    .set({ updatedAt: now })
    .where(eq(chatConversations.id, conversationId));

  return conversationId;
}

async function persistAnonymousAssistantMessage({
  conversationId,
  latestUserClientMessageId,
  responseMessage,
}: {
  readonly conversationId: string;
  readonly latestUserClientMessageId: string;
  readonly responseMessage: UIMessage;
}): Promise<void> {
  const assistantText = sanitizeAssistantResponse(
    extractUIMessageText(responseMessage.parts)
  ).text;
  await persistAnonymousAssistantRecord({
    conversationId,
    latestUserClientMessageId,
    content: assistantText,
    toolCalls: encodeToolEvents(responseMessage.parts),
    assistantSource: 'llm',
    scriptLineKey: null,
  });
}

async function persistAnonymousAssistantRecord({
  conversationId,
  latestUserClientMessageId,
  content,
  toolCalls,
  assistantSource,
  scriptLineKey,
}: {
  readonly conversationId: string;
  readonly latestUserClientMessageId: string;
  readonly content: string;
  readonly toolCalls: PersistedToolEvent[] | undefined;
  /** Attribution for the nightly script-tuning job (JOV-3806). */
  readonly assistantSource: 'llm' | 'script';
  readonly scriptLineKey: string | null;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(chatMessages)
    .values({
      conversationId,
      clientMessageId: `assistant:${latestUserClientMessageId}`,
      role: 'assistant',
      content:
        content ||
        (toolCalls && toolCalls.length > 0
          ? ''
          : 'Done. What would you like to do next?'),
      toolCalls,
      assistantSource,
      scriptLineKey,
      createdAt: now,
    })
    .onConflictDoNothing({
      target: [chatMessages.conversationId, chatMessages.clientMessageId],
      where: drizzleSql`${chatMessages.clientMessageId} IS NOT NULL`,
    });

  await db
    .update(chatConversations)
    .set({ updatedAt: now })
    .where(eq(chatConversations.id, conversationId));

  Sentry.addBreadcrumb({
    category: 'onboarding-chat',
    message: 'anonymous_assistant_persisted',
    level: 'info',
    data: { conversationId: conversationId.slice(0, 8) },
  });
}

/**
 * Build the wire `set-cookie` header value for the onboarding session cookie.
 * Used when `executeChatTurn`'s streaming response prevents us from using the
 * `NextResponse.cookies.set` helper.
 */
function buildSessionCookieHeader(value: string): string {
  const parts = [
    `${ONBOARDING_SESSION_COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 7}`,
  ];
  if (isSecureEnv()) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Lightweight shape check for the UIMessage payload. We deliberately don't
 * pull in the full `validateMessagesArray` from `/api/chat/route.ts` to keep
 * this handler import-light — onboarding mode has stricter caps anyway.
 *
 * Split into shape-and-parts helpers so SonarCloud's cognitive-complexity
 * budget (15) is satisfied at each layer.
 */
function validateOnboardingMessages(messages: unknown[]): string | null {
  if (messages.length === 0) {
    return 'messages array must be non-empty';
  }
  for (let i = 0; i < messages.length; i++) {
    const shapeError = validateMessageShape(messages[i], i);
    if (shapeError) return shapeError;
    // shape check guarantees parts is an array
    const parts = (messages[i] as { parts: unknown[] }).parts;
    const partsError = validateTextPartLengths(parts, i);
    if (partsError) return partsError;
  }
  return null;
}

function validateMessageShape(msg: unknown, index: number): string | null {
  if (!msg || typeof msg !== 'object') {
    return `messages[${index}] must be an object`;
  }
  const m = msg as { role?: unknown; parts?: unknown };
  if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'system') {
    return `messages[${index}].role must be user/assistant/system`;
  }
  if (!Array.isArray(m.parts)) {
    return `messages[${index}].parts must be an array`;
  }
  return null;
}

function validateTextPartLengths(
  parts: unknown[],
  messageIndex: number
): string | null {
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    if ((part as { type?: unknown }).type !== 'text') continue;
    const text = (part as { text?: unknown }).text;
    if (
      typeof text === 'string' &&
      text.length > MAX_ONBOARDING_MESSAGE_LENGTH
    ) {
      return `messages[${messageIndex}] text part exceeds ${MAX_ONBOARDING_MESSAGE_LENGTH} chars`;
    }
  }
  return null;
}

function parseCookieHeader(header: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!name) continue;
    // decodeURIComponent throws on malformed `%` escapes (e.g. `%zz`). The
    // Cookie header is attacker-controlled, so wrap defensively: skip the bad
    // cookie rather than crashing the whole handler.
    try {
      map.set(name, decodeURIComponent(value));
    } catch {
      // Skip malformed cookie value; do not let it crash the handler.
    }
  }
  return map;
}
