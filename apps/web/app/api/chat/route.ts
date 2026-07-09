/**
 * AI Chat Route — POST /api/chat
 *
 * Entry point for the in-app artist chat. The request flow is:
 *
 *   1. Auth (Clerk via getOptionalAuth) + Sentry tagging (feature, plan_tier)
 *   2. Billing fetch (so 503/429 responses are still tagged by tier)
 *   3. Kill switches via Statsig — `ai_chat_disabled` (503) and
 *      `ai_chat_force_light` (route to cheaper model). Gate keys are const so
 *      a typo fails at compile time rather than silently defaulting to false.
 *   4. Plan-aware rate limiting (checkAiChatRateLimitForPlan) + 429 with
 *      Retry-After when over quota
 *   5. Body parse + UIMessage validation (length, role, parts shape)
 *   6. Deterministic intent routing (tryRouteViaIntent) — short-circuits the
 *      LLM for simple CRUD intents and emits a UIMessage SSE stream directly
 *   7. Resolve artist context (server-side fetch by profileId, with optional
 *      client-provided fallback for backwards compatibility)
 *   8. Build tools for the active plan (buildFreeChatTools always; paid plans
 *      add buildChatTools — bio/canvas/album-art/pitch/etc.)
 *   9. executeChatTurn(): the pure pipeline that runs the LLM with tools,
 *      streams UIMessage parts, and persists telemetry. Telemetry hooks bind
 *      Sentry from this layer so executeChatTurn stays provider-neutral
 *      (eval scripts pass a no-op).
 *
 * Auth: Clerk; unauthenticated requests get 401. CORS via
 * createAuthenticatedCorsHeaders so the chat client can be embedded on
 * trusted origins.
 *
 * Cancellation: req.signal forwarded to executeChatTurn; client disconnects
 * surface as 499 (and bypass Sentry capture).
 */

import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  tool,
  type UIMessageChunk,
} from 'ai';
import { and, count, sql as drizzleSql, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { tryHandleAnonymousOnboardingChat } from '@/app/api/chat/onboarding-handler';
import { buildArtistBioDraft } from '@/lib/ai/artist-bio-writer';
import { createImportBioFromUrlTool } from '@/lib/ai/tools/import-bio-from-url';
import { createProfileEditTool } from '@/lib/ai/tools/profile-edit';
import { createVoicePromoTool } from '@/lib/ai/tools/voice-promo';
import { getOptionalAuth } from '@/lib/auth/cached';
import { getSessionContext } from '@/lib/auth/session';
import { resolveChatAccountContext } from '@/lib/chat/account-context';
import { createAccountChatTools } from '@/lib/chat/account-tools';
import {
  buildAlbumArtUnavailableAssistantMessage,
  detectAlbumArtGenerationIntent,
  resolveAlbumArtCapability,
} from '@/lib/chat/album-art-capability';
import {
  extractLastUserImageUrl,
  extractLastUserText,
} from '@/lib/chat/message-text';
import { sanitizeAssistantResponse } from '@/lib/chat/prompt-disclosure-guard';
import {
  updateOwnedReleaseGeneratedPitches,
  updateOwnedReleaseMetadata,
} from '@/lib/chat/release-writes';
import { fetchReleasesForChat } from '@/lib/chat/releases';
import {
  extractUIMessageText,
  parseChatRequestBody,
} from '@/lib/chat/request-validation';
import {
  buildRetouchUnavailableAssistantMessage,
  detectRetouchIntent,
  resolveRetouchCapability,
} from '@/lib/chat/retouch-capability';
import { executeChatTurn, isClientDisconnect } from '@/lib/chat/run';
import { chatToolSchema } from '@/lib/chat/strict-schema';
import {
  canUsePaidChatTools,
  resolveChatTurnPlanLimits,
} from '@/lib/chat/tool-access';
import {
  decodeToolEvents,
  type PersistedToolEvent,
  preparePersistedToolEventsForTurnFinish,
  resolvePersistedToolEventsForDisplay,
} from '@/lib/chat/tool-events';
import { proposeMerchAction } from '@/lib/chat/tools/merch-propose';
import {
  createMerchAlternativeTool,
  createMerchGenerateTool,
  createMerchPreviewTool,
  createMerchSelectTool,
} from '@/lib/chat/tools/merch-tools';
import { createProposeVideoRecordingTool } from '@/lib/chat/tools/propose-video-recording';
import { createRetouchImageTool } from '@/lib/chat/tools/retouch-image';
import {
  type ChatTurnSource,
  markChatTurnStreaming,
  persistTerminalAssistantMessage,
  recordChatTurnModel,
  reserveChatTurn,
  TURN_IN_PROGRESS_ERROR_CODE,
} from '@/lib/chat/turns';
import {
  type ArtistContext,
  artistContextSchema,
  type ChatTelemetry,
  type ReleaseContext,
} from '@/lib/chat/types';
import { wrapToolSetFailSoft } from '@/lib/chat/wrap-tool-execute';
import { db } from '@/lib/db';
import { clickEvents, tips } from '@/lib/db/schema/analytics';
import { users } from '@/lib/db/schema/auth';
import { socialLinks } from '@/lib/db/schema/links';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { sqlAny } from '@/lib/db/sql-helpers';
import { upsertRelease } from '@/lib/discography/queries';
import { generateUniqueSlug } from '@/lib/discography/slug';
import { captureError } from '@/lib/error-tracking';
import { scheduleOnlineScoring } from '@/lib/eval/scorers/online';
import { checkGatesForUser, getAppFlagValue } from '@/lib/flags/server';
import { createAuthenticatedCorsHeaders } from '@/lib/http/headers';
import {
  classifyIntent,
  isDeterministicIntent,
  routeIntent,
} from '@/lib/intent-detection';
import { formatLyricsForAppleMusic } from '@/lib/lyrics/format-lyrics-for-apple-music';
import { formatMerchMoney } from '@/lib/merch/pricing';
import {
  createMerchGeneration,
  optimizeMerchCards,
  reorderMerchCards,
  selectMerchDesign,
  showArtistPayouts,
  showMerchSales,
  updateMerchCardDetails,
  updateMerchCardStatus,
} from '@/lib/merch/service';
import {
  albumArtGenerationBurstLimiter,
  albumArtGenerationLimiter,
  checkAiChatRateLimitForPlan,
  createRateLimitHeaders,
} from '@/lib/rate-limit';
import {
  buildAlbumArtBackgroundPrompt,
  generateAlbumArtBackgrounds,
  isXaiConfigured,
  XaiApiKeyMissingError,
} from '@/lib/services/album-art/provider-xai';
import { renderAlbumArtCandidate } from '@/lib/services/album-art/render';
import {
  uploadAlbumArtCandidate,
  uploadAlbumArtManifest,
} from '@/lib/services/album-art/storage';
import {
  ALBUM_ART_STYLES,
  getAlbumArtStyle,
} from '@/lib/services/album-art/styles';
import type {
  AlbumArtCandidate,
  AlbumArtStyleId,
  SuggestedReleaseTarget,
} from '@/lib/services/album-art/types';
import {
  buildCanvasMetadata,
  summarizeCanvasStatus,
} from '@/lib/services/canvas/service';
import { getInsightsSummary } from '@/lib/services/insights/lifecycle';
import {
  buildPitchInput,
  generatePitchDraft,
  PITCH_PLATFORMS,
  PITCH_TARGET_OPTIONS_TEXT,
  PITCH_TARGETS,
  resolvePitchDestination,
} from '@/lib/services/pitch';
import { isRetouchConfigured } from '@/lib/services/retouching/provider-gemini';
import { DSP_PLATFORMS } from '@/lib/services/social-links/types';
import { detectPlatform } from '@/lib/utils/platform-detection/detector';

export const dynamic = 'force-dynamic';

export const maxDuration = 60;

/**
 * How long to wait for Sentry to deliver buffered events before letting the
 * lambda suspend. Streaming responses freeze the function as soon as the last
 * chunk (or the error response) is sent, which silently drops undelivered
 * events — the reason GH #13300's day-long outage never reached Sentry.
 */
const SENTRY_FLUSH_TIMEOUT_MS = 2000;

/**
 * Statsig gate keys for the chat kill switch. Declared as const so typos fail
 * at compile time rather than silently defaulting to `false` (never firing).
 * Kept local to the chat route — once other routes need runtime kill switches
 * these should graduate into the typed APP_FLAG_* registry.
 */
const CHAT_KILL_SWITCH_GATES = {
  DISABLED: 'ai_chat_disabled',
  FORCE_LIGHT: 'ai_chat_force_light',
} as const;

/**
 * Fetches artist context server-side from the database.
 * Validates that the profile belongs to the authenticated user.
 */
async function fetchArtistContext(
  profileId: string,
  clerkUserId: string
): Promise<ArtistContext | null> {
  // Fetch profile with ownership check via user join
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

  // Fetch link counts and tipping stats in parallel
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
      .then(r => r[0]),
    db
      .select({
        totalReceived: drizzleSql<number>`COALESCE(SUM(${tips.amountCents}), 0)`,
        monthReceived: drizzleSql<number>`COALESCE(SUM(CASE WHEN ${tips.createdAt} >= ${startOfMonthISO}::timestamp THEN ${tips.amountCents} ELSE 0 END), 0)`,
        tipsSubmitted: drizzleSql<number>`COALESCE(COUNT(${tips.id}), 0)`,
      })
      .from(tips)
      .where(eq(tips.creatorProfileId, profileId))
      .then(r => r[0]),
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
      .then(r => r[0]),
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

/**
 * Find a release by title (exact match first, then partial).
 * Returns null if no match found.
 */
function findReleaseByTitle(
  releases: ReleaseContext[],
  title: string
): ReleaseContext | null {
  const lower = title.toLowerCase();
  return (
    releases.find(r => r.title.toLowerCase() === lower) ??
    releases.find(r => r.title.toLowerCase().includes(lower)) ??
    null
  );
}

function normalizeReleaseTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function toSuggestedReleaseTarget(
  release: ReleaseContext
): SuggestedReleaseTarget {
  return {
    id: release.id,
    title: release.title,
    releaseDate: release.releaseDate,
    artworkUrl: release.artworkUrl,
  };
}

function resolveAlbumArtReleaseTarget(
  releases: ReleaseContext[],
  input: { releaseId?: string; releaseTitle?: string }
):
  | { status: 'resolved'; release: ReleaseContext }
  | {
      status: 'needs_target';
      suggestedReleases: readonly SuggestedReleaseTarget[];
    } {
  if (input.releaseId) {
    const release = releases.find(item => item.id === input.releaseId);
    if (release) return { status: 'resolved', release };
  }

  if (!input.releaseTitle?.trim()) {
    return {
      status: 'needs_target',
      suggestedReleases: releases.slice(0, 8).map(toSuggestedReleaseTarget),
    };
  }

  const normalized = normalizeReleaseTitle(input.releaseTitle);
  const exact = releases.find(
    release => normalizeReleaseTitle(release.title) === normalized
  );
  if (exact) return { status: 'resolved', release: exact };

  const fuzzy = releases.filter(release => {
    const title = normalizeReleaseTitle(release.title);
    return title.includes(normalized) || normalized.includes(title);
  });

  if (fuzzy.length === 1) {
    return { status: 'resolved', release: fuzzy[0] };
  }

  return {
    status: 'needs_target',
    suggestedReleases: (fuzzy.length > 0 ? fuzzy : releases)
      .slice(0, 8)
      .map(toSuggestedReleaseTarget),
  };
}

/** Format available release titles for error messages. */
function formatAvailableReleases(releases: ReleaseContext[]): string {
  return releases
    .slice(0, 10)
    .map(r => r.title)
    .join(', ');
}

/**
 * Resolves artist context from profileId (server-side) or client-provided data.
 * Returns { context } on success or { error } with a NextResponse on failure.
 */
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

  // Backward compatibility: accept client-provided artistContext with validation
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

function normalizeChatTurnSource(value: unknown): ChatTurnSource {
  return value === 'quick_action' || value === 'slash_command'
    ? value
    : 'typed';
}

function normalizeToolIntent(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[a-z][a-z0-9_:-]{0,63}$/i.test(trimmed) ? trimmed : null;
}

/**
 * 👎 model-rotation step (JOV-3362 / #11461). Only a small non-negative
 * integer is accepted; the actual model is resolved server-side from the
 * vetted rotation chain, so the client can never name a model directly.
 */
function normalizeModelRotationStep(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 0;
  return Math.min(Math.max(value, 0), 8);
}

function normalizeClientId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[a-zA-Z0-9:_-]{8,160}$/.test(trimmed) ? trimmed : null;
}

function createAssistantTextStreamResponse(input: {
  readonly text: string;
  readonly requestId: string;
  readonly corsHeaders: Record<string, string>;
  readonly headers?: Record<string, string>;
  readonly metadata?: Record<string, unknown>;
}) {
  const messageId = randomUUID();
  const textId = randomUUID();
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({
        type: 'start',
        messageId,
        ...(input.metadata ? { messageMetadata: input.metadata } : {}),
      });
      writer.write({ type: 'start-step' });
      writer.write({ type: 'text-start', id: textId });
      writer.write({ type: 'text-delta', id: textId, delta: input.text });
      writer.write({ type: 'text-end', id: textId });
      writer.write({ type: 'finish-step' });
      writer.write({
        type: 'finish',
        finishReason: 'stop',
        ...(input.metadata ? { messageMetadata: input.metadata } : {}),
      });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      ...input.corsHeaders,
      ...input.headers,
      'x-request-id': input.requestId,
    },
  });
}

function writePersistedToolEventReplay(
  writer: { write: (chunk: UIMessageChunk) => void },
  event: PersistedToolEvent
) {
  writer.write({
    type: 'tool-input-available',
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    input: event.input ?? {},
    dynamic: true,
  });

  if (event.state === 'succeeded') {
    writer.write({
      type: 'tool-output-available',
      toolCallId: event.toolCallId,
      output: event.output ?? {},
      dynamic: true,
    });
    return;
  }

  if (event.state === 'failed') {
    writer.write({
      type: 'tool-output-error',
      toolCallId: event.toolCallId,
      errorText:
        event.errorMessage ?? event.summary ?? 'Tool execution failed.',
      dynamic: true,
    });
    return;
  }

  if (event.state === 'denied') {
    writer.write({
      type: 'tool-output-denied',
      toolCallId: event.toolCallId,
    });
    return;
  }

  if (event.state === 'needs-approval') {
    writer.write({
      type: 'tool-approval-request',
      approvalId: event.approval?.id ?? `${event.toolCallId}-approval`,
      toolCallId: event.toolCallId,
    });
  }
}

function createAssistantReplayStreamResponse(input: {
  readonly text: string;
  readonly toolCalls: unknown;
  readonly requestId: string;
  readonly corsHeaders: Record<string, string>;
  readonly headers?: Record<string, string>;
  readonly metadata?: Record<string, unknown>;
}) {
  const messageId = randomUUID();
  const textId = randomUUID();
  const decodedToolEvents = decodeToolEvents(input.toolCalls).events;
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({
        type: 'start',
        messageId,
        ...(input.metadata ? { messageMetadata: input.metadata } : {}),
      });
      writer.write({ type: 'start-step' });
      if (input.text.length > 0) {
        writer.write({ type: 'text-start', id: textId });
        writer.write({ type: 'text-delta', id: textId, delta: input.text });
        writer.write({ type: 'text-end', id: textId });
      }
      for (const event of decodedToolEvents) {
        writePersistedToolEventReplay(writer, event);
      }
      writer.write({ type: 'finish-step' });
      writer.write({
        type: 'finish',
        finishReason: 'stop',
        ...(input.metadata ? { messageMetadata: input.metadata } : {}),
      });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      ...input.corsHeaders,
      ...input.headers,
      'x-request-id': input.requestId,
    },
  });
}

function buildChatTurnMetadata(input: {
  readonly conversationId: string;
  readonly turnId: string;
  readonly requestId: string;
  readonly toolStepCapExhausted?: boolean;
  /** Resolved model id that produced the turn (feedback attribution). */
  readonly model?: string;
}) {
  return {
    conversationId: input.conversationId,
    turnId: input.turnId,
    requestId: input.requestId,
    ...(input.model ? { model: input.model } : {}),
    ...(input.toolStepCapExhausted
      ? { toolStepCapExhausted: true as const }
      : {}),
  };
}

/**
 * Creates the proposeAvatarUpload tool that signals the client to render
 * an inline photo upload widget in the chat conversation.
 */
function createAvatarUploadTool() {
  return tool({
    description:
      'Show a profile photo upload widget in the chat. Use this when the artist wants to change, update, or set their profile photo. Do not describe how to upload — just call this tool.',
    inputSchema: chatToolSchema({}),
    execute: async () => {
      return { success: true, action: 'avatar_upload' as const };
    },
  });
}

/**
 * Creates the proposeSocialLink tool that detects the platform from a URL
 * and returns a confirmation preview for the artist to accept or dismiss.
 */
function createSocialLinkTool() {
  return tool({
    description:
      'Propose adding a social link to the artist profile. Pass the full URL. The client will show a confirmation card with the detected platform. Use this when the artist asks to add a link or social profile URL.',
    inputSchema: chatToolSchema({
      url: z
        .string()
        .describe(
          'The full URL to add (e.g. https://instagram.com/myhandle). Construct the full URL from handles if needed.'
        ),
    }),
    execute: async ({ url }) => {
      const detected = detectPlatform(url);

      if (!detected.isValid) {
        return {
          success: false,
          error: detected.error ?? 'Invalid URL. Please provide a valid link.',
        };
      }

      return {
        success: true,
        platform: {
          id: detected.platform.id,
          name: detected.platform.name,
          icon: detected.platform.icon,
          color: detected.platform.color,
        },
        normalizedUrl: detected.normalizedUrl,
        originalUrl: detected.originalUrl,
        suggestedTitle: detected.suggestedTitle,
      };
    },
  });
}

/**
 * Creates the proposeSocialLinkRemoval tool that fetches the artist's
 * active social links and returns a confirmation card to remove one.
 */
function createSocialLinkRemovalTool(profileId: string | null) {
  return tool({
    description:
      'Propose removing a social link from the artist profile. Use this when the artist asks to remove or delete a link. Returns a confirmation card with link details. You must specify the platform name (e.g. "instagram", "spotify", "twitter") to identify which link to remove.',
    inputSchema: chatToolSchema({
      platform: z
        .string()
        .describe(
          'The platform name of the link to remove (e.g. "instagram", "spotify", "twitter", "tiktok"). Case-insensitive.'
        ),
    }),
    execute: async ({ platform }) => {
      if (!profileId) {
        return {
          success: false,
          error: 'Profile ID required to remove links',
        };
      }

      // Fetch active links for this profile
      const activeLinks = await db
        .select({
          id: socialLinks.id,
          platform: socialLinks.platform,
          url: socialLinks.url,
        })
        .from(socialLinks)
        .where(
          and(
            eq(socialLinks.creatorProfileId, profileId),
            eq(socialLinks.state, 'active')
          )
        );

      if (activeLinks.length === 0) {
        return {
          success: false,
          error: 'No social links found on your profile.',
        };
      }

      // Find a matching link by platform (case-insensitive)
      const normalizedPlatform = platform.toLowerCase();
      const matchingLink = activeLinks.find(
        l => l.platform.toLowerCase() === normalizedPlatform
      );

      if (!matchingLink) {
        const available = activeLinks.map(l => l.platform).join(', ');
        return {
          success: false,
          error: `No ${platform} link found. Available links: ${available}`,
        };
      }

      return {
        success: true,
        action: 'remove_link' as const,
        linkId: matchingLink.id,
        platform: matchingLink.platform,
        url: matchingLink.url,
      };
    },
  });
}

/**
 * Creates the checkCanvasStatus tool for querying release canvas status.
 * Fetches release data and reports which releases need canvas videos.
 */
function createCheckCanvasStatusTool(
  profileId: string | null,
  releases: ReleaseContext[]
) {
  return tool({
    description:
      "Check which of the artist's releases have Spotify Canvas videos set and which are missing them. Use this when the artist asks about canvas videos or wants to generate them.",
    inputSchema: chatToolSchema({
      includeAll: z
        .boolean()
        .optional()
        .describe(
          'If true, include all releases. If false (default), only show releases missing canvas.'
        ),
    }),
    execute: async ({ includeAll }) => {
      if (!profileId) {
        return {
          success: false,
          error: 'Profile ID required for release data',
        };
      }

      if (releases.length === 0) {
        return {
          success: true,
          summary: {
            total: 0,
            message:
              'No releases found. Connect your Spotify account and sync your releases first.',
          },
        };
      }

      const summary = summarizeCanvasStatus(
        releases.map(r => ({
          id: r.id,
          title: r.title,
          metadata: r.metadata,
          artworkUrl: r.artworkUrl,
        }))
      );

      const releaseList = includeAll
        ? releases.map(r => ({
            title: r.title,
            releaseType: r.releaseType,
            canvasStatus: r.canvasStatus,
            hasArtwork: Boolean(r.artworkUrl),
            spotifyPopularity: r.spotifyPopularity,
          }))
        : summary.releasesNeedingCanvas.map(r => ({
            title: r.title,
            hasArtwork: r.hasArtwork,
          }));

      return {
        success: true,
        summary: {
          total: summary.total,
          withCanvas: summary.withCanvas,
          withoutCanvas: summary.withoutCanvas,
        },
        releases: releaseList,
      };
    },
  });
}

/**
 * Creates the suggestRelatedArtists tool.
 * Uses the artist's profile data to suggest related artists for pitching and ad targeting.
 */
function createSuggestRelatedArtistsTool(context: ArtistContext) {
  return tool({
    description:
      "Suggest related artists for playlist pitching, ad targeting, and collaboration based on the artist's genre, style, and popularity level. Returns advice on which artists to target.",
    inputSchema: chatToolSchema({
      purpose: z
        .enum(['playlist_pitching', 'ad_targeting', 'collaboration', 'all'])
        .describe('What the related artists will be used for'),
      count: z
        .number()
        .int()
        .min(3)
        .max(15)
        .optional()
        .describe('Number of suggestions to return (default 5)'),
    }),
    execute: async ({ purpose, count: suggestionCount }) => {
      // Provide the AI with structured context to generate recommendations
      return {
        success: true,
        artistContext: {
          name: context.displayName,
          genres: context.genres,
          spotifyFollowers: context.spotifyFollowers,
          spotifyPopularity: context.spotifyPopularity,
          purpose,
          requestedCount: suggestionCount ?? 5,
        },
        instructions:
          'Based on the artist context above, suggest related artists. Consider: genre alignment, similar popularity tier (aim slightly higher for pitching), audience overlap potential, and the specific purpose. For ad targeting, include both larger and smaller artists in the same niche. For playlist pitching, focus on artists who are on playlists the user would want to be on.',
      };
    },
  });
}

/**
 * Creates the generateCanvasPlan tool.
 * Helps the artist plan a canvas video generation from their album artwork.
 */
function createGenerateCanvasPlanTool(
  profileId: string | null,
  releases: ReleaseContext[]
) {
  return tool({
    description:
      'Generate a detailed plan for creating a Spotify Canvas video from album artwork. Includes artwork processing steps, animation style recommendations, and technical specs. Use this when an artist wants to create a canvas for a specific release.',
    inputSchema: chatToolSchema({
      releaseTitle: z
        .string()
        .describe('The title of the release to generate canvas for'),
      motionPreference: z
        .enum(['zoom', 'pan', 'particles', 'morph', 'ambient'])
        .optional()
        .describe(
          'Preferred animation style. Default: ambient (subtle motion with color shifts)'
        ),
    }),
    execute: async ({ releaseTitle, motionPreference }) => {
      if (!profileId) {
        return { success: false, error: 'Profile ID required' };
      }

      const release = findReleaseByTitle(releases, releaseTitle);

      if (!release) {
        return {
          success: false,
          error: `Release "${releaseTitle}" not found. Available releases: ${formatAvailableReleases(releases)}`,
        };
      }

      return buildCanvasPlan(release, motionPreference);
    },
  });
}

function createGenerateAlbumArtTool(params: {
  readonly profileId: string | null;
  readonly clerkUserId: string;
  readonly artistName: string;
  readonly canGenerateAlbumArt: boolean;
  readonly releases: ReleaseContext[];
}) {
  return tool({
    description:
      'Generate three album art options for a release. Use this when the artist asks to generate, create, or design album artwork or cover art. If no matching release exists, return a target-selection result so the client can ask whether to create a release or attach the art to an existing release.',
    inputSchema: chatToolSchema({
      releaseTitle: z
        .string()
        .max(200)
        .optional()
        .describe('Release title to generate album art for, if known.'),
      releaseId: z
        .string()
        .uuid()
        .optional()
        .describe(
          'Exact release ID when the request came from a release menu.'
        ),
      styleId: z
        .enum([
          'neo_pop_collage',
          'chrome_noir',
          'analog_dream',
          'minimal_icon',
        ])
        .optional()
        .describe('Visual style preset for the generated cover.'),
      prompt: z
        .string()
        .max(500)
        .optional()
        .describe('Optional extra visual direction from the artist.'),
      createRelease: z
        .boolean()
        .optional()
        .describe(
          'Set true when the artist wants to generate candidates for a new release that does not exist yet.'
        ),
    }),
    execute: async ({
      releaseTitle,
      releaseId,
      styleId,
      prompt,
      createRelease,
    }) => {
      if (!params.profileId) {
        return {
          success: false as const,
          retryable: false,
          errorCode: 'PROFILE_REQUIRED' as const,
          error: 'Profile ID required',
        };
      }
      if (!params.canGenerateAlbumArt) {
        return {
          success: false as const,
          retryable: false,
          errorCode: 'PLAN_UNAVAILABLE' as const,
          error: 'Album art generation requires a Pro plan.',
        };
      }

      if (!isXaiConfigured()) {
        return {
          success: false as const,
          retryable: false,
          errorCode: 'PROVIDER_UNAVAILABLE' as const,
          error: 'Album art generation is temporarily unavailable.',
        };
      }

      const target = resolveAlbumArtReleaseTarget(params.releases, {
        releaseId,
        releaseTitle,
      });

      if (target.status === 'needs_target' && !createRelease) {
        return {
          success: true as const,
          state: 'needs_release_target' as const,
          releaseTitle: releaseTitle ?? null,
          artistName: params.artistName,
          suggestedReleases: target.suggestedReleases,
        };
      }

      if (createRelease && !releaseTitle?.trim()) {
        return {
          success: true as const,
          state: 'needs_release_target' as const,
          releaseTitle: null,
          artistName: params.artistName,
          suggestedReleases:
            target.status === 'needs_target' ? target.suggestedReleases : [],
        };
      }

      const burstLimit = await albumArtGenerationBurstLimiter.limit(
        params.clerkUserId
      );
      if (!burstLimit.success) {
        return {
          success: false as const,
          retryable: true,
          errorCode: 'RATE_LIMITED' as const,
          error:
            burstLimit.reason ??
            'Album art generation limit reached. Please try again later.',
        };
      }

      const dailyLimit = await albumArtGenerationLimiter.limit(
        params.clerkUserId
      );
      if (!dailyLimit.success) {
        return {
          success: false as const,
          retryable: true,
          errorCode: 'RATE_LIMITED' as const,
          error:
            dailyLimit.reason ??
            'Album art generation limit reached. Please try again later.',
        };
      }

      try {
        const style = getAlbumArtStyle(styleId as AlbumArtStyleId | undefined);
        const generationId = randomUUID();
        const targetRelease =
          target.status === 'resolved'
            ? target.release
            : {
                id: null,
                title: releaseTitle?.trim() || 'Untitled Release',
                artworkUrl: null,
              };
        const providerPrompt = buildAlbumArtBackgroundPrompt({
          releaseTitle: targetRelease.title,
          artistName: params.artistName,
          style,
          prompt,
        });
        const generated = await generateAlbumArtBackgrounds({
          prompt: providerPrompt,
        });
        const now = new Date().toISOString();
        const candidates: AlbumArtCandidate[] = [];

        for (const [index, background] of generated.images.entries()) {
          const candidateId = randomUUID();
          const rendered = await renderAlbumArtCandidate({
            background,
            releaseTitle: targetRelease.title,
            artistName: params.artistName,
            style,
          });
          const urls = await uploadAlbumArtCandidate({
            profileId: params.profileId,
            generationId,
            candidateId,
            fullRes: rendered.fullRes,
            preview: rendered.preview,
          });

          candidates.push({
            id: candidateId,
            generationId,
            styleId: style.id,
            styleLabel: style.label,
            previewUrl: urls.previewUrl,
            fullResUrl: urls.fullResUrl,
            generatedAt: now,
            provider: 'xai',
            model: generated.model,
            releaseTitle: targetRelease.title,
            artistName: params.artistName,
            prompt: providerPrompt,
          });

          if (index >= 2) break;
        }

        await uploadAlbumArtManifest({
          generationId,
          profileId: params.profileId,
          releaseId: targetRelease.id,
          releaseTitle: targetRelease.title,
          artistName: params.artistName,
          provider: 'xai',
          model: generated.model,
          styleId: style.id,
          prompt: providerPrompt,
          candidates,
          createdAt: now,
        });

        return {
          success: true as const,
          state: 'generated' as const,
          generationId,
          releaseId: targetRelease.id,
          releaseTitle: targetRelease.title,
          artistName: params.artistName,
          hasExistingArtwork: Boolean(targetRelease.artworkUrl),
          candidates,
          styles: Object.values(ALBUM_ART_STYLES).map(item => ({
            id: item.id,
            label: item.label,
            description: item.description,
          })),
        };
      } catch (error) {
        if (error instanceof XaiApiKeyMissingError) {
          // Provider key may go missing between the early check and the call
          // (e.g. env reload). Treat as feature_disabled, do not capture.
          return {
            success: false as const,
            retryable: false,
            errorCode: 'PROVIDER_UNAVAILABLE' as const,
            error: 'Album art generation is temporarily unavailable.',
          };
        }
        Sentry.captureException(error, {
          tags: { feature: 'album-art-generation' },
          extra: { profileId: params.profileId, releaseId, releaseTitle },
        });
        return {
          success: false as const,
          retryable: true,
          errorCode: 'TOOL_EXECUTION_FAILED' as const,
          error: 'Unable to generate album art. Please try again.',
        };
      }
    },
  });
}

function _createMerchGenerationTool(params: {
  readonly profileId: string | null;
  readonly clerkUserId: string;
  readonly command: 'create_merch' | 'preview_merch_options';
  readonly conversationId?: string | null;
  readonly turnId?: string | null;
}) {
  return tool({
    description:
      'Generate exactly three premium merch design options for the current artist. Use for make merch, create a tee, create a hoodie, or make something that would sell.',
    inputSchema: chatToolSchema({
      prompt: z.string().max(500).optional(),
      itemType: z.string().max(80).optional(),
      makeLive: z.boolean().optional(),
    }),
    execute: async ({ prompt, itemType }) => {
      if (!params.profileId) {
        return { success: false as const, error: 'Profile ID required' };
      }

      const merchPrompt = [prompt, itemType ? `Item type: ${itemType}` : null]
        .filter(Boolean)
        .join('\n')
        .trim();

      const result = await createMerchGeneration({
        profileId: params.profileId,
        clerkUserId: params.clerkUserId,
        prompt: merchPrompt || 'Make premium merch for this artist.',
        command: params.command,
        conversationId: params.conversationId ?? null,
        turnId: params.turnId ?? null,
      });

      return {
        ...result,
        nextStep: 'Pick 1, 2, or 3. You can also tell me what to change.',
      };
    },
  });
}

function _createSelectMerchDesignTool(params: {
  readonly profileId: string | null;
  readonly clerkUserId: string;
}) {
  return tool({
    description:
      'Select a merch option from a previous generation and create a Jovie merch card. Publish only when the artist asks to make it live.',
    inputSchema: z
      .object({
        generationId: z.string().uuid(),
        optionNumber: z.number().int().min(1).max(3).optional(),
        optionId: z.string().uuid().optional(),
        makeLive: z.boolean().optional(),
      })
      .refine(data => data.optionNumber !== undefined || data.optionId, {
        message: 'Provide either optionNumber or optionId.',
        path: ['optionNumber'],
      }),
    execute: async ({ generationId, optionNumber, optionId, makeLive }) => {
      if (!params.profileId) {
        return { success: false as const, error: 'Profile ID required' };
      }

      return selectMerchDesign({
        generationId,
        clerkUserId: params.clerkUserId,
        optionId,
        optionNumber,
        publish: makeLive === true,
      });
    },
  });
}

function getMerchCardUpdateStatus(
  action: 'pause' | 'unpause' | 'archive'
): 'paused' | 'archived' | 'live' {
  if (action === 'pause') {
    return 'paused';
  }

  if (action === 'archive') {
    return 'archived';
  }

  return 'live';
}

function createMerchStatusTool(params: {
  readonly action: 'publish' | 'pause' | 'unpause' | 'archive';
  readonly profileId: string | null;
  readonly clerkUserId: string;
}) {
  return tool({
    description:
      'Change a merch card status. Use publish for live, pause for kill temporarily, unpause to bring back, and archive for delete/remove. Publish, unpause, and archive require user confirmation — they return a confirmation card and do not write immediately.',
    inputSchema: chatToolSchema({
      merchCardId: z.string().uuid(),
    }),
    execute: async ({ merchCardId }) => {
      if (!params.profileId) {
        return { success: false as const, error: 'Profile ID required' };
      }

      if (
        params.action === 'publish' ||
        params.action === 'unpause' ||
        params.action === 'archive'
      ) {
        return proposeMerchAction({
          action: params.action,
          merchCardId,
          profileId: params.profileId,
        });
      }

      const status = getMerchCardUpdateStatus(params.action);
      const card = await updateMerchCardStatus({
        cardId: merchCardId,
        profileId: params.profileId,
        clerkUserId: params.clerkUserId,
        status,
      });
      return {
        success: true as const,
        merchCardId: card.id,
        status: card.status,
        title: card.title,
      };
    },
  });
}

function createMerchUpdateTool(params: {
  readonly profileId: string | null;
  readonly clerkUserId: string;
}) {
  return tool({
    description:
      'Update a merch card name, description, image URL, or retail price. If asked to make it live, run the merch safety guard before publishing.',
    inputSchema: chatToolSchema({
      merchCardId: z.string().uuid(),
      title: z.string().min(1).max(120).optional(),
      description: z.string().min(1).max(500).optional(),
      primaryImageUrl: z.string().url().optional(),
      retailPriceCents: z.number().int().min(100).max(50_000).optional(),
      makeLive: z.boolean().optional(),
    }),
    execute: async input => {
      if (!params.profileId) {
        return { success: false as const, error: 'Profile ID required' };
      }

      const card = await updateMerchCardDetails({
        cardId: input.merchCardId,
        profileId: params.profileId,
        clerkUserId: params.clerkUserId,
        title: input.title,
        description: input.description,
        primaryImageUrl: input.primaryImageUrl,
        retailPriceCents: input.retailPriceCents,
        makeLive: false,
      });

      const result = {
        success: true as const,
        merchCardId: card.id,
        status: card.status,
        title: card.title,
        retailPrice: formatMerchMoney(card.retailPriceCents),
      };

      if (input.makeLive === true) {
        const publishProposal = await proposeMerchAction({
          action: 'publish',
          merchCardId: card.id,
          profileId: params.profileId,
        });
        return { ...result, publishProposal };
      }

      return result;
    },
  });
}

function createMerchSalesTool(profileId: string | null) {
  return tool({
    description: 'Show merch revenue and purchase counts for this artist.',
    inputSchema: chatToolSchema({}),
    execute: async () => {
      if (!profileId) {
        return { success: false as const, error: 'Profile ID required' };
      }
      const summary = await showMerchSales(profileId);
      return {
        success: true as const,
        grossRevenue: formatMerchMoney(summary.grossRevenueCents),
        purchases: summary.purchases,
        liveCards: summary.liveCards,
      };
    },
  });
}

function createMerchPayoutsTool(profileId: string | null) {
  return tool({
    description:
      'Show manual merch payout liability for this artist. MVP payouts are not automatic.',
    inputSchema: chatToolSchema({}),
    execute: async () => {
      if (!profileId) {
        return { success: false as const, error: 'Profile ID required' };
      }
      const summary = await showArtistPayouts(profileId);
      return {
        success: true as const,
        accrued: formatMerchMoney(summary.accruedCents),
        readyToPay: formatMerchMoney(summary.readyCents),
        paidManually: formatMerchMoney(summary.paidCents),
        payoutMode: 'manual ledger, no automatic Stripe Connect payout in MVP',
      };
    },
  });
}

function buildCanvasPlan(
  release: ReleaseContext,
  motionPreference = 'ambient'
) {
  const motion = motionPreference;
  const hasArtwork = Boolean(release.artworkUrl);

  return {
    success: true,
    plan: {
      release: {
        title: release.title,
        type: release.releaseType,
        hasArtwork,
        artworkUrl: release.artworkUrl,
        currentCanvasStatus: release.canvasStatus,
      },
      steps: [
        {
          step: 1,
          action: 'Process Artwork',
          description: hasArtwork
            ? 'AI removes text/logos from album art and upscales to 1080x1920 (9:16 portrait)'
            : 'No artwork available — upload album art first, then we can generate a canvas',
          status: hasArtwork ? 'ready' : 'blocked',
        },
        {
          step: 2,
          action: 'Generate Video',
          description: `Create a ${motion} animation loop (3-8 seconds) from the processed artwork`,
          status: hasArtwork ? 'ready' : 'blocked',
        },
        {
          step: 3,
          action: 'Encode & Download',
          description:
            'Encode to H.264 MP4 at 30fps, ready for upload to Spotify for Artists',
          status: hasArtwork ? 'ready' : 'blocked',
        },
        {
          step: 4,
          action: 'Upload to Spotify',
          description:
            'Download the video and upload it via Spotify for Artists → Music → Select track → Canvas',
          status: 'manual',
        },
      ],
      motionStyle: motion,
      specs: {
        resolution: '1080x1920',
        aspectRatio: '9:16',
        duration: '3-8 seconds (loops)',
        format: 'MP4 (H.264)',
        fps: 30,
      },
    },
  };
}

/**
 * Creates the createPromoStrategy tool.
 * Generates a promotional strategy including social ads, TikTok, and canvas.
 */
function createPromoStrategyTool(
  context: ArtistContext,
  profileId: string | null,
  releases: ReleaseContext[]
) {
  return tool({
    description:
      'Create a comprehensive promotion strategy for a release, including social media video ads, TikTok strategy, Spotify Canvas, and ad targeting recommendations. Use this when an artist asks for help promoting their music.',
    inputSchema: chatToolSchema({
      releaseTitle: z
        .string()
        .optional()
        .describe(
          'Specific release to promote. If not provided, uses the latest release.'
        ),
      budget: z
        .enum(['free', 'low', 'medium', 'high'])
        .optional()
        .describe(
          'Budget level: free (organic only), low ($50-200), medium ($200-1000), high ($1000+)'
        ),
      platforms: z
        .array(
          z.enum(['tiktok', 'instagram', 'youtube', 'spotify', 'hulu', 'meta'])
        )
        .optional()
        .describe('Target platforms for the promotion'),
    }),
    execute: async ({ releaseTitle, budget, platforms }) => {
      const targetRelease = profileId
        ? releaseTitle
          ? findReleaseByTitle(releases, releaseTitle)
          : (releases[0] ?? null)
        : null;

      return {
        success: true,
        context: {
          artist: {
            name: context.displayName,
            genres: context.genres,
            followers: context.spotifyFollowers,
            popularity: context.spotifyPopularity,
          },
          release: targetRelease
            ? {
                title: targetRelease.title,
                type: targetRelease.releaseType,
                hasArtwork: Boolean(targetRelease.artworkUrl),
                canvasStatus: targetRelease.canvasStatus,
                popularity: targetRelease.spotifyPopularity,
              }
            : null,
          budget: budget ?? 'low',
          platforms: platforms ?? ['tiktok', 'instagram', 'spotify'],
        },
        instructions:
          'Create a specific, actionable promo strategy. Include: (1) Spotify Canvas plan if not set, (2) Social video ad concepts using album art + 30s song clip + promo text + QR code to Jovie, (3) TikTok sound strategy with best clip selection advice, (4) Related artist targeting for ads, (5) Timeline with specific daily/weekly actions. Be concrete — no vague advice.',
      };
    },
  });
}

function createShowTopInsightsTool(profileId: string | null) {
  return tool({
    description:
      'Show the artist their top audience, release, track, and monetization signals as structured insight cards. Use this when they ask what is working, what to focus on, or how their audience and releases are performing.',
    inputSchema: chatToolSchema({}),
    execute: async () => {
      if (!profileId) {
        return {
          success: false,
          title: 'Top signals',
          totalActive: 0,
          insights: [],
        };
      }

      const summary = await getInsightsSummary(profileId);
      return {
        success: true,
        title: 'Top signals',
        totalActive: summary.totalActive,
        insights: summary.insights,
      };
    },
  });
}

/**
 * Creates the markCanvasUploaded tool.
 * Lets artists self-report that they've uploaded a canvas to Spotify for Artists.
 * Since Spotify has no public API for canvas status, this is the only reliable way to track it.
 */
function createMarkCanvasUploadedTool(
  profileId: string | null,
  releases: ReleaseContext[]
) {
  return tool({
    description:
      "Mark a release as having a Spotify Canvas video uploaded. Use this when the artist confirms they've already set a canvas for a track/release in Spotify for Artists, or when they tell you a canvas is already uploaded.",
    inputSchema: chatToolSchema({
      releaseTitle: z
        .string()
        .describe('The title of the release that has a canvas uploaded'),
    }),
    execute: async ({ releaseTitle }) => {
      if (!profileId) {
        return { success: false, error: 'Profile ID required' };
      }

      const release = findReleaseByTitle(releases, releaseTitle);

      if (!release) {
        return {
          success: false,
          error: `Release "${releaseTitle}" not found. Available releases: ${formatAvailableReleases(releases)}`,
        };
      }

      const updated = await updateOwnedReleaseMetadata({
        releaseId: release.id,
        creatorProfileId: profileId,
        metadata: {
          ...release.metadata,
          ...buildCanvasMetadata('uploaded'),
        },
      });

      if (!updated) {
        return {
          success: false,
          error: 'Release not found or unauthorized',
        };
      }

      return {
        success: true,
        release: {
          title: release.title,
          previousStatus: release.canvasStatus,
          newStatus: 'uploaded',
        },
        message: `Marked "${release.title}" as having a Spotify Canvas uploaded.`,
      };
    },
  });
}

/**
 * Creates the createRelease tool for the AI to add new releases to the artist's discography.
 * This tool directly creates the release in the database and returns the result.
 */
function createReleaseTool(resolvedProfileId: string) {
  const createReleaseSchema = chatToolSchema({
    title: z.string().min(1).max(200).describe('The title of the release'),
    releaseType: z
      .enum([
        'single',
        'ep',
        'album',
        'compilation',
        'live',
        'mixtape',
        'other',
      ])
      .describe('The type of release'),
    releaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .optional()
      .describe(
        'Release date in ISO 8601 format (YYYY-MM-DD). Use the date the music was or will be released.'
      ),
    label: z.string().max(200).optional().describe('Record label name, if any'),
    upc: z
      .string()
      .max(20)
      .optional()
      .describe('UPC/EAN barcode for the release, if known'),
  });

  return tool({
    description:
      "Create a new release in the artist's discography. Use this when the artist wants to add a release that isn't synced from Spotify — for example, a new single, EP, or album they want to set up smart links for. Ask for the title and release type at minimum before calling this tool.",
    inputSchema: createReleaseSchema,
    execute: async ({ title, releaseType, releaseDate, label, upc }) => {
      try {
        // Validate date if provided
        let parsedDate: Date | null = null;
        if (releaseDate) {
          parsedDate = new Date(releaseDate);
          if (Number.isNaN(parsedDate.getTime())) {
            return {
              success: false,
              error: 'Invalid date. Please use YYYY-MM-DD format.',
            };
          }
        }

        const slug = await generateUniqueSlug(
          resolvedProfileId,
          title,
          'release'
        );

        const release = await upsertRelease({
          creatorProfileId: resolvedProfileId,
          title,
          slug,
          releaseType,
          releaseDate: parsedDate,
          label: label ?? null,
          upc: upc ?? null,
          sourceType: 'manual',
        });

        return {
          success: true,
          release: {
            id: release.id,
            title: release.title,
            slug: release.slug,
            releaseType: release.releaseType,
            releaseDate: release.releaseDate?.toISOString() ?? null,
            label: release.label,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to create release';
        return { success: false, error: message };
      }
    },
  });
}

/**
 * Creates the writeWorldClassBio tool.
 * Produces an AllMusic-style draft using profile + DSP context.
 */
function createWorldClassBioTool(
  context: ArtistContext,
  profileId: string | null,
  releases: ReleaseContext[]
) {
  return tool({
    description:
      'Write a world-class artist bio in an editorial style suitable for Spotify, Apple Music, and press use. Uses real artist context from profile + DSP metadata.',
    inputSchema: chatToolSchema({
      goal: z
        .enum(['spotify', 'apple_music', 'press_kit', 'general'])
        .optional()
        .describe('Primary usage context for the bio draft'),
      tone: z
        .enum(['cinematic', 'intimate', 'confident', 'elevated'])
        .optional()
        .describe('Preferred writing tone while maintaining factual rigor'),
      maxWords: z
        .number()
        .int()
        .min(80)
        .max(350)
        .optional()
        .describe('Maximum words for the returned draft (default 180)'),
    }),
    execute: async ({ goal, tone, maxWords }) => {
      const wordLimit = maxWords ?? 180;
      const draftPackage = buildArtistBioDraft({
        artistName: context.displayName,
        existingBio: context.bio,
        genres: context.genres,
        spotifyFollowers: context.spotifyFollowers,
        spotifyPopularity: context.spotifyPopularity,
        spotifyUrl: context.spotifyUrl ?? null,
        appleMusicUrl: context.appleMusicUrl ?? null,
        profileViews: context.profileViews,
        releaseCount: releases.length,
        notableReleases: releases.slice(0, 3).map(release => release.title),
      });

      const trimmedDraft =
        draftPackage.draft.split(/\s+/).length > wordLimit
          ? `${draftPackage.draft.split(/\s+/).slice(0, wordLimit).join(' ')}…`
          : draftPackage.draft;

      return {
        success: true,
        usageGoal: goal ?? 'general',
        tone: tone ?? 'elevated',
        maxWords: wordLimit,
        draft: trimmedDraft,
        facts: draftPackage.facts,
        voiceDirectives: draftPackage.voiceDirectives,
        releaseContext: releases.slice(0, 5).map(release => ({
          title: release.title,
          releaseType: release.releaseType,
          releaseDate: release.releaseDate,
          spotifyPopularity: release.spotifyPopularity,
        })),
      };
    },
  });
}

/**
 * Creates the formatLyrics tool.
 * Applies deterministic Apple Music formatting rules to raw lyrics text.
 */
function createLyricsFormatTool() {
  return tool({
    description:
      'Format lyrics to Apple Music guidelines. Applies deterministic rules: removes section labels like [Verse]/[Chorus], straightens curly quotes, normalizes punctuation, collapses blank lines, and trims whitespace. Use when an artist asks to clean up or format lyrics.',
    inputSchema: chatToolSchema({
      lyrics: z
        .string()
        .min(1)
        .max(10000)
        .describe('Raw lyrics text to format for Apple Music'),
    }),
    execute: async ({ lyrics }) => {
      const originalLineCount = lyrics.split('\n').length;
      const { formatted, changesSummary } = formatLyricsForAppleMusic(lyrics);
      const formattedLineCount = formatted.split('\n').length;

      return {
        success: true,
        formatted,
        changesSummary,
        originalLineCount,
        formattedLineCount,
      };
    },
  });
}

/**
 * OPTIONS - CORS preflight handler
 */
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

/**
 * Creates the submitFeedback tool that saves user feedback to the database
 * and notifies the team via Slack.
 */
function createSubmitFeedbackTool(clerkUserId: string) {
  return tool({
    description:
      'Submit product feedback from the artist. Use this when the artist wants to share feedback, report a bug, or request a feature. Collect their feedback message first, then call this tool with the full text.',
    inputSchema: chatToolSchema({
      message: z
        .string()
        .min(5)
        .max(2000)
        .describe('The feedback message from the artist'),
    }),
    execute: async ({ message }) => {
      const { submitChatFeedback } = await import('@/lib/chat/submit-feedback');

      return submitChatFeedback({
        clerkUserId,
        message,
      });
    },
  });
}

/**
 * Creates the generateReleasePitch tool for chat-first release pitching.
 * Saves the latest generated draft to the release's generatedPitches field.
 */
function createGenerateReleasePitchTool(
  resolvedProfileId: string,
  identity: { clerkUserId: string; conversationId: string | null },
  releases: ReleaseContext[]
) {
  return tool({
    description: `Generate one copy-paste-ready release pitch for a specific destination. Use for playlist, radio, Sirius XM, install, playback/music supervisor, editorial post, record label, or collaborator pitching. Ask the artist where they want to pitch it before calling this tool unless a task or user message clearly maps to one of these destinations: ${PITCH_TARGET_OPTIONS_TEXT}. Ask which release they want to pitch if unclear. If the artist provides custom guidance, pass it via instructions.`,
    inputSchema: chatToolSchema({
      releaseTitle: z
        .string()
        .max(200)
        .optional()
        .describe('The title of the release to generate a pitch for'),
      releaseId: z
        .string()
        .uuid()
        .optional()
        .describe('The release ID to generate a pitch for'),
      target: z
        .enum(PITCH_TARGETS)
        .optional()
        .describe(
          `Where the artist wants to pitch the release: ${PITCH_TARGET_OPTIONS_TEXT}`
        ),
      platform: z
        .enum(PITCH_PLATFORMS)
        .optional()
        .describe('Optional platform or buyer context, such as Spotify'),
      taskTitle: z
        .string()
        .max(200)
        .optional()
        .describe('Release task title to infer the pitch destination from'),
      taskCategory: z
        .string()
        .max(100)
        .optional()
        .describe('Release task category to infer the pitch destination from'),
      instructions: z
        .string()
        .max(700)
        .optional()
        .describe(
          'Optional instructions to guide pitch generation, e.g. "mention my Nashville show" or "make it less formal"'
        ),
    }),
    execute: async ({
      releaseTitle,
      releaseId,
      target,
      platform,
      taskTitle,
      taskCategory,
      instructions,
    }) => {
      try {
        if (releases.length === 0) {
          return {
            success: false as const,
            error: "You don't have any releases yet. Add a release first.",
          };
        }

        const release =
          releaseId !== undefined
            ? releases.find(candidate => candidate.id === releaseId)
            : releaseTitle !== undefined
              ? findReleaseByTitle(releases, releaseTitle)
              : null;

        if (!release) {
          return {
            success: false as const,
            error: releaseTitle
              ? `Release "${releaseTitle}" not found. Available releases: ${formatAvailableReleases(releases)}`
              : `Which release should I pitch? Available releases: ${formatAvailableReleases(releases)}`,
          };
        }

        const destination = resolvePitchDestination({
          target,
          platform,
          taskTitle,
          taskCategory,
          instructions,
        });

        if (!destination) {
          return {
            success: false as const,
            needsTarget: true as const,
            error: `Where do you want to pitch it? Choose: ${PITCH_TARGET_OPTIONS_TEXT}.`,
            targetOptions: PITCH_TARGETS,
          };
        }

        const pitchInput = await buildPitchInput(resolvedProfileId, release.id);

        const result = await generatePitchDraft({
          input: pitchInput,
          destination,
          instructions,
          identity: {
            userId: identity.clerkUserId,
            sessionId: identity.conversationId,
          },
        });

        const updated = await updateOwnedReleaseGeneratedPitches({
          releaseId: release.id,
          creatorProfileId: resolvedProfileId,
          generatedPitches: result.pitch,
        });

        if (!updated) {
          return {
            success: false as const,
            error: 'Release not found or unauthorized',
          };
        }

        return {
          success: true as const,
          releaseTitle: release.title,
          destinationLabel: destination.label,
          target: destination.target,
          pitch: result.pitch,
          copyText: result.pitch.subjectLine
            ? `Subject: ${result.pitch.subjectLine}\n\n${result.pitch.body}`
            : result.pitch.body,
        };
      } catch (error) {
        Sentry.captureException(error, {
          tags: { feature: 'chat-pitch-generation' },
          extra: { releaseTitle, releaseId, profileId: resolvedProfileId },
        });

        return {
          success: false as const,
          error: 'Failed to generate pitches. Please try again.',
        };
      }
    },
  });
}

/**
 * Build tools available on ALL plans (including Free).
 * These are basic profile management tools that don't require a paid plan.
 */
function buildFreeChatTools(
  resolvedProfileId: string | null,
  clerkUserId: string,
  accountContext: Awaited<ReturnType<typeof resolveChatAccountContext>>
) {
  return {
    ...createAccountChatTools(accountContext),
    proposeAvatarUpload: createAvatarUploadTool(),
    proposeSocialLink: createSocialLinkTool(),
    proposeSocialLinkRemoval: createSocialLinkRemovalTool(resolvedProfileId),
    submitFeedback: createSubmitFeedbackTool(clerkUserId),
  };
}

/**
 * Build the tool set for paid-plan chat sessions.
 */
function buildChatTools(
  artistContext: ArtistContext,
  resolvedProfileId: string | null,
  releases: ReleaseContext[],
  insightsEnabled: boolean,
  clerkUserId: string,
  canGenerateAlbumArt: boolean,
  albumArtEnabled: boolean,
  canAccessMerchCreation: boolean,
  canAccessAiRetouching: boolean,
  teleprompterRecordingEnabled: boolean,
  userEntitlements: Awaited<
    ReturnType<
      typeof import('@/lib/entitlements/server').getCurrentUserEntitlements
    >
  >,
  reservedTurn?: {
    readonly conversationId: string;
    readonly turnId: string;
  } | null,
  retouchContext?: {
    readonly sourceImageUrl: string | null;
    readonly conversationId: string | null;
  }
) {
  return {
    ...(insightsEnabled
      ? { showTopInsights: createShowTopInsightsTool(resolvedProfileId) }
      : {}),
    proposeProfileEdit: createProfileEditTool(artistContext),
    importBioFromUrl: createImportBioFromUrlTool({ userId: clerkUserId }),
    checkCanvasStatus: createCheckCanvasStatusTool(resolvedProfileId, releases),
    suggestRelatedArtists: createSuggestRelatedArtistsTool(artistContext),
    writeWorldClassBio: createWorldClassBioTool(
      artistContext,
      resolvedProfileId,
      releases
    ),
    generateCanvasPlan: createGenerateCanvasPlanTool(
      resolvedProfileId,
      releases
    ),
    ...(albumArtEnabled && canGenerateAlbumArt
      ? {
          generateAlbumArt: createGenerateAlbumArtTool({
            profileId: resolvedProfileId,
            clerkUserId,
            artistName: artistContext.displayName,
            canGenerateAlbumArt,
            releases,
          }),
        }
      : {}),
    ...(canAccessAiRetouching
      ? {
          retouchImage: createRetouchImageTool({
            profileId: resolvedProfileId,
            entitlements: userEntitlements,
            clerkUserId,
            sourceImageUrl: retouchContext?.sourceImageUrl ?? null,
            conversationId: retouchContext?.conversationId ?? null,
          }),
        }
      : {}),
    createPromoStrategy: createPromoStrategyTool(
      artistContext,
      resolvedProfileId,
      releases
    ),
    // gh-9808 HOT ZONE: voice promo audio generation from cloned voice (premium, 11Labs)
    // "clone my voice" / "voice promo" / "radio drop" intent loads via system prompt
    voicePromo: createVoicePromoTool({
      profileId: resolvedProfileId ?? '',
      artistName: artistContext.displayName,
    }),
    markCanvasUploaded: createMarkCanvasUploadedTool(
      resolvedProfileId,
      releases
    ),
    formatLyrics: createLyricsFormatTool(),
    ...(resolvedProfileId
      ? {
          createRelease: createReleaseTool(resolvedProfileId),
          generateReleasePitch: createGenerateReleasePitchTool(
            resolvedProfileId,
            {
              clerkUserId,
              conversationId: reservedTurn?.conversationId ?? null,
            },
            releases
          ),
        }
      : {}),
    ...(canAccessMerchCreation
      ? {
          createMerch: createMerchGenerateTool({
            profileId: resolvedProfileId,
            clerkUserId,
            conversationId: reservedTurn?.conversationId ?? null,
            turnId: reservedTurn?.turnId ?? null,
          }),
          previewMerchOptions: createMerchPreviewTool({
            profileId: resolvedProfileId,
            clerkUserId,
            conversationId: reservedTurn?.conversationId ?? null,
            turnId: reservedTurn?.turnId ?? null,
          }),
          selectMerchDesign: createMerchSelectTool({
            profileId: resolvedProfileId,
            clerkUserId,
          }),
          createMerchAlternativeItem: createMerchAlternativeTool({
            profileId: resolvedProfileId,
            clerkUserId,
            conversationId: reservedTurn?.conversationId ?? null,
            turnId: reservedTurn?.turnId ?? null,
          }),
          updateMerchCard: createMerchUpdateTool({
            profileId: resolvedProfileId,
            clerkUserId,
          }),
          publishMerchCard: createMerchStatusTool({
            action: 'publish',
            profileId: resolvedProfileId,
            clerkUserId,
          }),
          pauseMerchCard: createMerchStatusTool({
            action: 'pause',
            profileId: resolvedProfileId,
            clerkUserId,
          }),
          unpauseMerchCard: createMerchStatusTool({
            action: 'unpause',
            profileId: resolvedProfileId,
            clerkUserId,
          }),
          deleteOrArchiveMerchCard: createMerchStatusTool({
            action: 'archive',
            profileId: resolvedProfileId,
            clerkUserId,
          }),
          reorderMerchCards: tool({
            description:
              'Record the desired order for merch cards. Use only when the artist gives explicit card IDs.',
            inputSchema: chatToolSchema({
              merchCardIds: z.array(z.string().uuid()).min(1).max(12),
            }),
            execute: async ({ merchCardIds }) => {
              if (!resolvedProfileId) {
                return {
                  success: false as const,
                  error: 'Profile ID required',
                };
              }

              const result = await reorderMerchCards({
                profileId: resolvedProfileId,
                merchCardIds,
              });
              return {
                success: true as const,
                merchCardIds: result.merchCardIds,
                updated: result.updated,
              };
            },
          }),
          optimizeMerchCards: tool({
            description:
              'Optimize merch card ranking using current conversion, revenue, margin, and recency signals.',
            inputSchema: chatToolSchema({}),
            execute: async () => {
              if (!resolvedProfileId) {
                return {
                  success: false as const,
                  error: 'Profile ID required',
                };
              }

              const result = await optimizeMerchCards(resolvedProfileId);
              return {
                success: true as const,
                optimized: result.optimized,
              };
            },
          }),
          showMerchSales: createMerchSalesTool(resolvedProfileId),
          showArtistPayouts: createMerchPayoutsTool(resolvedProfileId),
        }
      : {}),
    ...(teleprompterRecordingEnabled
      ? {
          proposeVideoRecording: createProposeVideoRecordingTool({
            clerkUserId,
          }),
        }
      : {}),
  };
}

function toNullableString(value: unknown): string | null {
  return value && typeof value === 'string' ? value : null;
}

async function fetchOptionalReleases(
  profileId: string | null
): Promise<ReleaseContext[]> {
  if (!profileId) {
    return [];
  }

  try {
    return await fetchReleasesForChat(profileId);
  } catch {
    return [];
  }
}

/**
 * Build a standardized error response for chat streaming failures.
 *
 * Uses `captureError` (canonical wrapper) instead of raw
 * `Sentry.captureException`: it logs the real exception to stdout so the
 * failure is findable in Vercel logs by the on-screen reference id
 * (`requestId`) even when the Sentry event is dropped, and it guards on SDK
 * initialization. `Sentry.flush` afterwards guarantees the event leaves the
 * lambda before the 500 response suspends it (GH #13300: a full day of
 * CHAT_STREAM_FAILED produced zero Sentry events).
 */
async function buildChatErrorResponse(
  error: unknown,
  userId: string,
  messageCount: number,
  requestId: string,
  profileId: string | null,
  conversationId: string | null,
  corsHeaders: Record<string, string>
) {
  await captureError('Chat stream failed', error, {
    feature: 'ai-chat',
    mode: 'route-catch',
    userId,
    messageCount,
    requestId,
    profileId,
    conversationId,
  });
  await Sentry.flush(SENTRY_FLUSH_TIMEOUT_MS).catch(() => null);

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
  userText: string,
  profileId: unknown,
  userId: string,
  corsHeaders: Record<string, string>,
  requestId: string,
  reservedTurn?: { conversationId: string; turnId: string } | null
): Promise<Response | null> {
  if (!userText) return null;

  const intent = classifyIntent(userText);
  if (!isDeterministicIntent(intent)) return null;

  const resolvedProfileId = toNullableString(profileId);
  const result = await routeIntent(intent, {
    clerkUserId: userId,
    profileId: resolvedProfileId,
  });
  if (!result) return null;

  // The chat client (AI SDK useChat) expects a UIMessage SSE stream, not plain
  // JSON. Emit the deterministic reply as a text-only assistant message so the
  // success/error confirmation renders in the thread.
  const replyText =
    typeof result.message === 'string' && result.message.length > 0
      ? result.message
      : result.success
        ? 'Done.'
        : 'Something went wrong. Please try again.';

  if (reservedTurn) {
    await persistTerminalAssistantMessage({
      conversationId: reservedTurn.conversationId,
      turnId: reservedTurn.turnId,
      status: result.success ? 'completed' : 'failed_model_error',
      content: replyText,
      errorCode: result.success ? null : 'DETERMINISTIC_INTENT_FAILED',
      errorMessage: result.success ? null : replyText,
    });
  }

  const textId = randomUUID();
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({
        type: 'start',
        ...(reservedTurn
          ? {
              messageMetadata: buildChatTurnMetadata({
                conversationId: reservedTurn.conversationId,
                turnId: reservedTurn.turnId,
                requestId,
              }),
            }
          : {}),
      });
      writer.write({ type: 'start-step' });
      writer.write({ type: 'text-start', id: textId });
      writer.write({ type: 'text-delta', id: textId, delta: replyText });
      writer.write({ type: 'text-end', id: textId });
      writer.write({ type: 'finish-step' });
      writer.write({
        type: 'finish',
        finishReason: 'stop',
        ...(reservedTurn
          ? {
              messageMetadata: buildChatTurnMetadata({
                conversationId: reservedTurn.conversationId,
                turnId: reservedTurn.turnId,
                requestId,
              }),
            }
          : {}),
      });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      ...corsHeaders,
      'x-request-id': requestId,
      'x-intent-routed': 'true',
      'x-intent-category': intent.category,
      ...(reservedTurn
        ? {
            'x-conversation-id': reservedTurn.conversationId,
            'x-chat-turn-id': reservedTurn.turnId,
          }
        : {}),
    },
  });
}

export async function POST(req: Request) {
  const requestId = extractRequestId(req);
  const corsHeaders = createAuthenticatedCorsHeaders(
    req.headers.get('origin'),
    'POST, OPTIONS'
  );

  // Tag every Sentry event captured during this request as chat-surface. The
  // error path already tags `feature: 'ai-chat'`, but breadcrumbs, performance
  // events, and any intermediate captureException elsewhere in the handler
  // would otherwise go untagged. One call here covers all of them.
  // `request_id` is stored as extra (not tag) — it is unique per request and
  // would blow out Sentry's tag cardinality budget.
  safeSetSentryContext(() => {
    Sentry.setTag('feature', 'ai-chat');
    Sentry.setExtra('request_id', requestId);
  });

  // Anonymous onboarding mode (JOV-2132): clones the request to peek for
  // `mode: 'onboarding'`. If present, runs cookie/turnstile/rate-limit gates
  // and returns a response (501 stub in PR 1; LLM dispatch in PR 2). Returns
  // null for normal authenticated traffic, falling through to the flow below.
  const onboardingResponse = await tryHandleAnonymousOnboardingChat(
    req,
    requestId
  );
  if (onboardingResponse) return onboardingResponse;

  // Auth check - ensure user is authenticated
  const { userId } = await getOptionalAuth();
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized', requestId },
      { status: 401, headers: { ...corsHeaders, 'x-request-id': requestId } }
    );
  }

  // Resolve account context once and use it for plan tags, rate limits,
  // prompt context, and tool gates. This avoids stale request/body plan paths
  // disagreeing with the canonical entitlement resolver.
  const accountContext = await resolveChatAccountContext({ userId });
  const userPlan = accountContext.plan;
  const planLimits = resolveChatTurnPlanLimits(accountContext);
  const currentUserEntitlements = accountContext.userEntitlements;
  const insightsEnabled = currentUserEntitlements.isPro;
  safeSetSentryContext(() => {
    Sentry.setTag('plan_tier', userPlan);
    Sentry.setTag('billing_verification', accountContext.billingVerification);
  });

  // Kill switch: Statsig-backed, no deploy required. When a provider incident
  // happens, flip `ai_chat_disabled` to 503 all chat traffic with a friendly
  // message, or `ai_chat_force_light` to force-route to the cheaper/faster
  // light model without a code change. Defaults (both false) = normal behavior.
  // Keys are const-declared so a typo fails at compile time rather than
  // silently falling back to the default.
  const [chatDisabled, forceLightModel] = await checkGatesForUser(userId, [
    { key: CHAT_KILL_SWITCH_GATES.DISABLED, defaultValue: false },
    { key: CHAT_KILL_SWITCH_GATES.FORCE_LIGHT, defaultValue: false },
  ]);
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
  const parsedRequest = await parseChatRequestBody(req, {
    corsHeaders,
    requestId,
  });
  if (!parsedRequest.ok) {
    return parsedRequest.response;
  }

  const { body, uiMessages } = parsedRequest;
  const { profileId, conversationId } = body;

  // Validate that either profileId or artistContext is provided
  if (
    !toNullableString(profileId) &&
    (!body.artistContext || typeof body.artistContext !== 'object')
  ) {
    return NextResponse.json(
      { error: 'Missing profileId or artistContext', requestId },
      { status: 400, headers: { ...corsHeaders, 'x-request-id': requestId } }
    );
  }
  const userText = extractLastUserText(uiMessages);
  const clientTurnId = normalizeClientId(body.clientTurnId);
  const clientMessageId = normalizeClientId(body.clientMessageId);
  const source = normalizeChatTurnSource(body.source);
  const toolIntent = normalizeToolIntent(body.toolIntent);
  const modelRotationStep = normalizeModelRotationStep(body.modelRotationStep);
  const resolvedProfileId = toNullableString(profileId);
  const resolvedConversationId = toNullableString(conversationId);
  const albumArtFeatureEnabled = await getAppFlagValue('ALBUM_ART_GENERATION', {
    userId,
  });
  const teleprompterRecordingEnabled = await getAppFlagValue(
    'TELEPROMPTER_RECORDING',
    { userId }
  );
  const albumArtCapability = resolveAlbumArtCapability({
    featureEnabled: albumArtFeatureEnabled,
    providerConfigured: isXaiConfigured(),
    entitlements: currentUserEntitlements,
  });
  const retouchCapability = resolveRetouchCapability({
    entitlements: currentUserEntitlements,
    provisioned: isRetouchConfigured(),
  });

  let reservedTurn: {
    conversationId: string;
    turnId: string;
  } | null = null;

  if (clientTurnId) {
    if (!resolvedProfileId) {
      return NextResponse.json(
        {
          error: 'profileId is required when clientTurnId is provided',
          requestId,
        },
        { status: 400, headers: { ...corsHeaders, 'x-request-id': requestId } }
      );
    }

    const sessionContext = await getSessionContext({
      clerkUserId: userId,
      requireProfile: true,
    });

    if (
      !sessionContext.profile ||
      sessionContext.profile.id !== resolvedProfileId
    ) {
      return NextResponse.json(
        { error: 'Profile not found or unauthorized', requestId },
        { status: 404, headers: { ...corsHeaders, 'x-request-id': requestId } }
      );
    }

    const reservation = await reserveChatTurn({
      conversationId: resolvedConversationId,
      clientTurnId,
      clientMessageId,
      source,
      toolIntent,
      userMessage: userText || '(image attachment)',
      userId: sessionContext.user.id,
      creatorProfileId: resolvedProfileId,
    });

    if (reservation.outcome === 'duplicate_in_progress') {
      return NextResponse.json(
        {
          error: TURN_IN_PROGRESS_ERROR_CODE,
          message: 'This chat action is still in progress.',
          errorCode: TURN_IN_PROGRESS_ERROR_CODE,
          requestId,
          conversationId: reservation.conversationId,
          turnId: reservation.turn.id,
        },
        {
          status: 409,
          headers: {
            ...corsHeaders,
            'x-request-id': requestId,
            'x-conversation-id': reservation.conversationId,
            'x-chat-turn-id': reservation.turn.id,
          },
        }
      );
    }

    if (reservation.outcome === 'duplicate_completed') {
      const assistantMessage = [...reservation.messages]
        .reverse()
        .find(message => message.role === 'assistant');
      const assistantToolCalls = assistantMessage?.toolCalls;
      const resolvedToolCalls = resolvePersistedToolEventsForDisplay(
        decodeToolEvents(assistantToolCalls).events,
        {
          messageCreatedAt: assistantMessage?.createdAt,
          turnStatus: reservation.turn.status,
        }
      );
      const hasPersistedToolState = resolvedToolCalls.length > 0;
      const replayText =
        assistantMessage?.content ||
        (hasPersistedToolState
          ? ''
          : 'This chat action already finished. Please send a new message if you need anything else.');
      return createAssistantReplayStreamResponse({
        text: replayText,
        toolCalls:
          resolvedToolCalls.length > 0 ? resolvedToolCalls : assistantToolCalls,
        requestId,
        corsHeaders,
        headers: {
          'x-chat-replay': 'true',
          'x-conversation-id': reservation.conversationId,
          'x-chat-turn-id': reservation.turn.id,
        },
        metadata: buildChatTurnMetadata({
          conversationId: reservation.conversationId,
          turnId: reservation.turn.id,
          requestId,
        }),
      });
    }

    reservedTurn = {
      conversationId: reservation.conversationId,
      turnId: reservation.turn.id,
    };

    if (
      albumArtCapability.availability !== 'available' &&
      detectAlbumArtGenerationIntent({ text: userText, toolIntent })
    ) {
      const replyText =
        buildAlbumArtUnavailableAssistantMessage(albumArtCapability);
      await persistTerminalAssistantMessage({
        conversationId: reservation.conversationId,
        turnId: reservation.turn.id,
        status: 'failed_tool_unavailable',
        content: replyText,
        errorCode: albumArtCapability.reasonCode ?? 'TOOL_UNAVAILABLE',
        errorMessage: albumArtCapability.reason,
      });

      return createAssistantTextStreamResponse({
        text: replyText,
        requestId,
        corsHeaders,
        headers: {
          'x-chat-preflight': 'album-art-unavailable',
          'x-conversation-id': reservation.conversationId,
          'x-chat-turn-id': reservation.turn.id,
        },
        metadata: buildChatTurnMetadata({
          conversationId: reservation.conversationId,
          turnId: reservation.turn.id,
          requestId,
        }),
      });
    }

    if (
      retouchCapability.availability !== 'available' &&
      detectRetouchIntent({ text: userText, toolIntent })
    ) {
      const replyText =
        buildRetouchUnavailableAssistantMessage(retouchCapability);
      await persistTerminalAssistantMessage({
        conversationId: reservation.conversationId,
        turnId: reservation.turn.id,
        status: 'failed_tool_unavailable',
        content: replyText,
        errorCode: retouchCapability.reasonCode ?? 'TOOL_UNAVAILABLE',
        errorMessage: retouchCapability.reason,
      });

      return createAssistantTextStreamResponse({
        text: replyText,
        requestId,
        corsHeaders,
        headers: {
          'x-chat-preflight': 'retouch-unavailable',
          'x-conversation-id': reservation.conversationId,
          'x-chat-turn-id': reservation.turn.id,
        },
        metadata: buildChatTurnMetadata({
          conversationId: reservation.conversationId,
          turnId: reservation.turn.id,
          requestId,
        }),
      });
    }
  }

  // Rate limiting - plan-aware daily quota + burst protection. For clients
  // that send clientTurnId, reservation/replay happens before quota charging.
  const rateLimitResult = await checkAiChatRateLimitForPlan(userId, userPlan);
  if (!rateLimitResult.success) {
    const rateLimitMessage =
      accountContext.billingVerification === 'unavailable'
        ? 'Jovie could not verify your billing status right now, so chat usage is temporarily limited. Please retry in a few minutes or open billing settings.'
        : (rateLimitResult.reason ??
          'You have reached your chat limit. Please try again later.');

    if (reservedTurn) {
      await persistTerminalAssistantMessage({
        conversationId: reservedTurn.conversationId,
        turnId: reservedTurn.turnId,
        status: 'failed_model_error',
        content: rateLimitMessage,
        errorCode: 'RATE_LIMITED',
        errorMessage: rateLimitResult.reason,
      });

      return createAssistantTextStreamResponse({
        text: rateLimitMessage,
        requestId,
        corsHeaders,
        headers: {
          ...createRateLimitHeaders(rateLimitResult),
          'x-chat-terminal-failure': 'rate-limited',
          'x-conversation-id': reservedTurn.conversationId,
          'x-chat-turn-id': reservedTurn.turnId,
        },
        metadata: buildChatTurnMetadata({
          conversationId: reservedTurn.conversationId,
          turnId: reservedTurn.turnId,
          requestId,
        }),
      });
    }

    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: rateLimitMessage,
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

  // --- Deterministic intent routing (skip AI for simple CRUD) ---
  const intentResponse = await tryRouteViaIntent(
    userText,
    profileId,
    userId,
    corsHeaders,
    requestId,
    reservedTurn
  );
  if (intentResponse) return intentResponse;

  // Fetch artist context server-side (preferred) or fall back to client-provided
  const contextResult = await resolveArtistContext(
    profileId,
    body.artistContext,
    userId,
    corsHeaders
  );
  if (contextResult.error) {
    if (reservedTurn) {
      const replyText =
        'Jovie could not load your artist context for this request. Please refresh and try again.';
      await persistTerminalAssistantMessage({
        conversationId: reservedTurn.conversationId,
        turnId: reservedTurn.turnId,
        status: 'failed_model_error',
        content: replyText,
        errorCode: 'ARTIST_CONTEXT_UNAVAILABLE',
        errorMessage: `Artist context lookup failed with ${contextResult.error.status}`,
      });

      return createAssistantTextStreamResponse({
        text: replyText,
        requestId,
        corsHeaders,
        headers: {
          'x-chat-terminal-failure': 'artist-context-unavailable',
          'x-conversation-id': reservedTurn.conversationId,
          'x-chat-turn-id': reservedTurn.turnId,
        },
        metadata: buildChatTurnMetadata({
          conversationId: reservedTurn.conversationId,
          turnId: reservedTurn.turnId,
          requestId,
        }),
      });
    }

    return contextResult.error;
  }
  const artistContext = contextResult.context;

  const releases = await fetchOptionalReleases(resolvedProfileId);
  const dispatchConversationId =
    reservedTurn?.conversationId ?? resolvedConversationId;

  try {
    const albumArtEnabled = albumArtFeatureEnabled;
    // Free tools (avatar upload, social links, link removal, feedback) available on ALL plans
    const freeTools = buildFreeChatTools(
      resolvedProfileId,
      userId,
      accountContext
    );
    // Advanced tools gated behind paid plans
    const tools = canUsePaidChatTools(accountContext)
      ? {
          ...freeTools,
          ...buildChatTools(
            artistContext,
            resolvedProfileId,
            releases,
            insightsEnabled,
            userId,
            albumArtCapability.availability === 'available',
            albumArtEnabled,
            planLimits.booleans.canAccessMerchCreation,
            planLimits.booleans.canAccessAiRetouching,
            teleprompterRecordingEnabled,
            currentUserEntitlements,
            reservedTurn,
            {
              sourceImageUrl: extractLastUserImageUrl(uiMessages),
              conversationId:
                reservedTurn?.conversationId ?? resolvedConversationId,
            }
          ),
        }
      : freeTools;

    // Telemetry hooks bind Sentry into `executeChatTurn` without coupling
    // the pure pipeline to Sentry. Eval scripts pass a no-op telemetry.
    const telemetry: ChatTelemetry = {
      setTags: tags => safeSetSentryContext(() => Sentry.setTags(tags)),
      setExtra: (key, value) =>
        safeSetSentryContext(() => Sentry.setExtra(key, value)),
      addBreadcrumb: breadcrumb =>
        safeSetSentryContext(() =>
          Sentry.addBreadcrumb({
            category: breadcrumb.category,
            message: breadcrumb.message,
            level: breadcrumb.level,
            data: breadcrumb.data,
          })
        ),
      // Mid-stream failures (`streamText.onError` in `executeChatTurn`) are
      // the path that stamps CHAT_STREAM_FAILED on the turn while the HTTP
      // response is already 200 — the lambda suspends right after the stream
      // closes, so capture through `captureError` (stdout log keyed by the
      // on-screen requestId + SDK-guarded Sentry send) and flush before
      // yielding (GH #13300).
      captureException: async (error, context) => {
        await captureError('Chat stream failed', error, {
          feature: 'ai-chat',
          mode: 'stream',
          requestId,
          userId,
          ...(context?.tags ?? {}),
          ...(context?.extra ?? {}),
        });
        await Sentry.flush(SENTRY_FLUSH_TIMEOUT_MS).catch(() => null);
      },
    };
    let streamFailurePersisted = false;
    const persistStreamFailure = async (error: unknown) => {
      if (!reservedTurn || streamFailurePersisted) {
        return;
      }

      streamFailurePersisted = true;
      const message =
        error instanceof Error ? error.message : 'The assistant stream failed.';
      await persistTerminalAssistantMessage({
        conversationId: reservedTurn.conversationId,
        turnId: reservedTurn.turnId,
        status: 'failed_model_error',
        content:
          'Jovie hit a temporary issue while processing your message. Please retry or send a simpler next step.',
        errorCode: 'CHAT_STREAM_FAILED',
        errorMessage: message,
      });
    };

    if (reservedTurn) {
      await markChatTurnStreaming(reservedTurn.turnId);
    }

    const turn = await executeChatTurn({
      uiMessages,
      artistContext,
      releases,
      resolvedProfileId,
      resolvedConversationId: dispatchConversationId,
      userId,
      userPlan,
      planLimits,
      accountContext,
      insightsEnabled,
      forceLightModel,
      modelRotationStep,
      lastUserText: userText,
      tools: wrapToolSetFailSoft(tools),
      signal: req.signal,
      requestId,
      telemetry,
      onStreamError: persistStreamFailure,
    });

    // Record the producing model on the turn row (fire-and-forget) so 👍/👎
    // feedback votes can attribute this output to a model server-side, even
    // when the vote arrives after a page reload (JOV #11460).
    if (reservedTurn) {
      recordChatTurnModel(reservedTurn.turnId, turn.selectedModel).catch(
        error => {
          Sentry.addBreadcrumb({
            category: 'ai-chat',
            message: 'chat_turn_model_record_failed',
            level: 'warning',
            data: {
              turnId: reservedTurn.turnId,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      );
    }

    return turn.streamResult.toUIMessageStreamResponse({
      headers: {
        ...corsHeaders,
        'x-request-id': requestId,
        ...(reservedTurn
          ? {
              'x-conversation-id': reservedTurn.conversationId,
              'x-chat-turn-id': reservedTurn.turnId,
            }
          : {}),
      },
      messageMetadata: () =>
        reservedTurn
          ? buildChatTurnMetadata({
              conversationId: reservedTurn.conversationId,
              turnId: reservedTurn.turnId,
              requestId,
              model: turn.selectedModel,
              toolStepCapExhausted: turn.turnSignals.toolStepCapExhausted,
            })
          : undefined,
      onFinish: async ({ responseMessage, isAborted }) => {
        if (!reservedTurn || streamFailurePersisted) return;

        const assistantText = sanitizeAssistantResponse(
          extractUIMessageText(
            responseMessage.parts as Array<{ type: string; text?: string }>
          )
        ).text;
        const toolCalls = preparePersistedToolEventsForTurnFinish({
          parts: responseMessage.parts,
          isAborted,
        });
        await persistTerminalAssistantMessage({
          conversationId: reservedTurn.conversationId,
          turnId: reservedTurn.turnId,
          status: isAborted ? 'canceled' : 'completed',
          content: isAborted
            ? 'This response was canceled before Jovie could finish. Retry when you are ready.'
            : assistantText ||
              (toolCalls && toolCalls.length > 0
                ? ''
                : 'Done. What would you like to do next?'),
          toolCalls,
          ...(isAborted
            ? {
                errorCode: 'CLIENT_DISCONNECTED',
                errorMessage: 'Client disconnected',
              }
            : {}),
        });

        if (!isAborted && assistantText.trim().length > 0) {
          scheduleOnlineScoring({
            traceId: requestId,
            caseName: `prod:${requestId}`,
            userPrompt: userText,
            assistantResponse: assistantText,
            plan: userPlan,
          });
        }
      },
      onError: () => {
        return 'Jovie hit a temporary issue while processing your message. Please retry or send a simpler next step.';
      },
    });
  } catch (error) {
    if (isClientDisconnect(error, req.signal)) {
      if (reservedTurn) {
        await persistTerminalAssistantMessage({
          conversationId: reservedTurn.conversationId,
          turnId: reservedTurn.turnId,
          status: 'canceled',
          content:
            'This response was canceled before Jovie could finish. Retry when you are ready.',
          errorCode: 'CLIENT_DISCONNECTED',
          errorMessage: 'Client disconnected',
        }).catch(() => null);
      }
      return new NextResponse(
        JSON.stringify({ error: 'Client disconnected', requestId }),
        {
          status: 499,
          headers: { ...corsHeaders, 'x-request-id': requestId },
        }
      );
    }

    if (reservedTurn) {
      const message =
        error instanceof Error ? error.message : 'Failed to process chat turn';
      await persistTerminalAssistantMessage({
        conversationId: reservedTurn.conversationId,
        turnId: reservedTurn.turnId,
        status: 'failed_model_error',
        content:
          'Jovie hit a temporary issue while processing your message. Please retry or send a simpler next step.',
        errorCode: 'CHAT_STREAM_FAILED',
        errorMessage: message,
      }).catch(() => null);
    }

    return buildChatErrorResponse(
      error,
      userId,
      uiMessages.length,
      requestId,
      resolvedProfileId,
      dispatchConversationId,
      corsHeaders
    );
  }
}
