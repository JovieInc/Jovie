import 'server-only';
import { type ToolSet, tool, type UIMessage } from 'ai';
import { z } from 'zod';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';
import {
  type AccessDecision,
  evaluateAccessSignal,
} from '@/lib/chat/tools/onboarding-access-eval';
import {
  collapseInterviewSignals,
  type InterviewSignal,
  interviewSignalSchema,
} from '@/lib/chat/tools/onboarding-signals';
import {
  type CanonicalArtistMetrics,
  normalizeArtistMetrics,
} from '@/lib/onboarding/canonical-metrics';
import {
  type HandleAvailabilityResult,
  normalizeHandleCandidate,
  toHandleAvailabilityResult,
} from '@/lib/onboarding/handle-availability';
import { parseSocialLinkInput } from '@/lib/onboarding/social-link-parse';
import { buildSpotifyArtistUrl, getSpotifyArtist } from '@/lib/spotify';
import { logger } from '@/lib/utils/logger';

/**
 * Onboarding tool execute closures.
 *
 * These are server-side closures the LLM calls during the onboarding chat.
 * They return structured payloads the onboarding UI cards render.
 *
 * Implementation strategy by tool type:
 *
 *   Deterministic (real logic now):
 *     - recordInterviewSignal  → appends to in-memory signal accumulator
 *     - proposeNextStep        → runs evaluateAccessSignal against accumulator
 *
 *   Pass-throughs to existing APIs (real logic now):
 *     - searchSpotifyArtist    → emits a marker for client-side popout (the
 *                                client already calls /api/spotify/search via
 *                                WaitlistSpotifySearch's hook; the tool just
 *                                signals "show the picker, optionally pre-filled")
 *     - checkHandle            → ditto for /api/handle/check
 *
 *   UI-coordination markers:
 *     - confirmSpotifyArtist   → records the picked artist id on the
 *                                accumulator and fetches Spotify enrichment
 *     - proposeCheckout        → emits the route-handoff marker
 *
 *   Reused from authenticated chat:
 *     - proposeSocialLink      → same tool as in-app chat
 */

/**
 * Per-request state accumulator. The handler creates one instance per turn
 * and threads it through the tool closures so they can share state (e.g.
 * recordInterviewSignal writes; proposeNextStep reads).
 *
 * Keep this state request-local; durable onboarding session state is handled
 * outside the per-turn tool accumulator.
 */
export interface OnboardingTurnState {
  sessionId: string;
  /** Set when confirmSpotifyArtist is called. */
  spotifyArtistId: string | null;
  /** Set after confirmSpotifyArtist enrichment. */
  spotifyArtistName: string | null;
  spotifyImageUrl: string | null;
  spotifyGenres: string[];
  spotifyPopularity: number | null;
  /**
   * Canonical Spotify follower count. Always derived via
   * `normalizeArtistMetrics` — never dual-sourced against monthly listeners.
   */
  spotifyFollowers: number | null;
  /** Full metrics snapshot for UI surfaces that need source/updatedAt. */
  artistMetrics: CanonicalArtistMetrics | null;
  /** Append-only log of recordInterviewSignal calls within this turn. */
  signals: InterviewSignal[];
  /** Cumulative LLM turn count (1-indexed). Drives the proposeNextStep eval. */
  turnCount: number;
}

type OnboardingToolPart = UIMessage['parts'][number] & {
  readonly toolName?: string;
  readonly input?: unknown;
  readonly output?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getToolName(part: OnboardingToolPart): string | null {
  if (typeof part.toolName === 'string') return part.toolName;
  return typeof part.type === 'string' && part.type.startsWith('tool-')
    ? part.type.slice('tool-'.length)
    : null;
}

function getToolParts(message: UIMessage): readonly OnboardingToolPart[] {
  return (message.parts ?? []).filter((part): part is OnboardingToolPart => {
    const toolName = getToolName(part as OnboardingToolPart);
    return Boolean(toolName);
  });
}

function restoreArtistFromOutput(
  state: OnboardingTurnState,
  output: Record<string, unknown>
): void {
  if (output.action !== 'spotify_artist_confirmed') return;
  const artist = isRecord(output.artist) ? output.artist : null;
  state.spotifyArtistId =
    typeof output.spotifyArtistId === 'string'
      ? output.spotifyArtistId
      : typeof artist?.id === 'string'
        ? artist.id
        : state.spotifyArtistId;
  state.spotifyArtistName =
    typeof artist?.name === 'string' ? artist.name : state.spotifyArtistName;
  state.spotifyImageUrl =
    typeof artist?.imageUrl === 'string'
      ? artist.imageUrl
      : state.spotifyImageUrl;

  // Prefer embedded metrics snapshot; fall back to loose artist fields.
  // Always go through normalizeArtistMetrics so followers ≠ monthly listeners.
  const metricsRecord = isRecord(output.metrics)
    ? output.metrics
    : isRecord(artist?.metrics)
      ? artist.metrics
      : null;
  const preservedSource =
    metricsRecord && typeof metricsRecord.source === 'string'
      ? (metricsRecord.source as CanonicalArtistMetrics['source'])
      : 'tool_output';
  const metrics = normalizeArtistMetrics(
    metricsRecord ?? {
      followers: artist?.followers,
      spotifyFollowers: artist?.spotifyFollowers,
      monthlyListeners: artist?.monthlyListeners,
      monthly_listeners: artist?.monthly_listeners,
    },
    {
      source: preservedSource,
      updatedAt:
        metricsRecord && typeof metricsRecord.updatedAt === 'string'
          ? metricsRecord.updatedAt
          : undefined,
    }
  );
  state.artistMetrics = metrics;
  state.spotifyFollowers = metrics.spotifyFollowers;

  state.spotifyPopularity =
    typeof artist?.popularity === 'number' && Number.isFinite(artist.popularity)
      ? artist.popularity
      : state.spotifyPopularity;
  state.spotifyGenres = Array.isArray(artist?.genres)
    ? artist.genres.filter(
        (genre): genre is string =>
          typeof genre === 'string' && genre.trim().length > 0
      )
    : state.spotifyGenres;
}

function restoreInterviewSignal(
  state: OnboardingTurnState,
  part: OnboardingToolPart
): void {
  if (getToolName(part) !== 'recordInterviewSignal') return;
  const output = isRecord(part.output) ? part.output : null;
  const rawSignal = output?.signal ?? part.input;
  const parsed = interviewSignalSchema.safeParse(rawSignal);
  if (parsed.success) {
    state.signals.push(parsed.data);
  }
}

export function createOnboardingTurnState(input: {
  sessionId: string;
  turnCount: number;
  messages?: readonly UIMessage[];
}): OnboardingTurnState {
  const state: OnboardingTurnState = {
    sessionId: input.sessionId,
    spotifyArtistId: null,
    spotifyArtistName: null,
    spotifyImageUrl: null,
    spotifyGenres: [],
    spotifyPopularity: null,
    spotifyFollowers: null,
    artistMetrics: null,
    signals: [],
    turnCount: input.turnCount,
  };

  if (input.messages) {
    deriveOnboardingTurnStateFromMessages(state, input.messages);
  }

  return state;
}

export function deriveOnboardingTurnStateFromMessages(
  state: OnboardingTurnState,
  messages: readonly UIMessage[]
): OnboardingTurnState {
  for (const message of messages) {
    for (const part of getToolParts(message)) {
      if (isRecord(part.output)) {
        restoreArtistFromOutput(state, part.output);
      }
      restoreInterviewSignal(state, part);
    }
  }

  return state;
}

export interface NextStepCardPayload {
  readonly action: 'propose_next_step';
  readonly decision: AccessDecision;
}

export interface ConfirmSpotifyArtistOutput {
  readonly action: 'spotify_artist_confirmed';
  readonly spotifyArtistId: string;
  readonly artist: {
    readonly id: string;
    readonly name: string;
    readonly url: string;
    readonly imageUrl: string | null;
    /** @deprecated Prefer metrics.spotifyFollowers — kept for rehydration. */
    readonly followers: number | null;
    readonly popularity: number | null;
    readonly genres: readonly string[];
    readonly metrics: CanonicalArtistMetrics;
  } | null;
  /** Top-level metrics mirror for consumers that do not unwrap artist. */
  readonly metrics: CanonicalArtistMetrics | null;
  readonly summary: string;
}

export interface CheckHandleOutput {
  readonly action: 'check_handle';
  readonly handle: string;
  readonly availability: HandleAvailabilityResult;
  readonly summary: string;
}

export interface ProposeSocialLinkOutput {
  readonly action: 'propose_social_link';
  readonly url: string | null;
  readonly parseOk: boolean;
  readonly reason?: string;
  readonly platform?: string;
  readonly summary: string;
}

/**
 * Shared confirm-artist implementation: record the pick on the turn state,
 * fetch Spotify enrichment (best-effort), and return the card payload.
 * Called by both the LLM tool below and the deterministic fallback engine
 * (`lib/chat/onboarding-script/engine.ts`) so the two paths cannot drift.
 */
export async function buildConfirmSpotifyArtistOutput(
  spotifyArtistId: string,
  state: OnboardingTurnState
): Promise<ConfirmSpotifyArtistOutput> {
  state.spotifyArtistId = spotifyArtistId;
  state.spotifyArtistName = null;
  state.spotifyImageUrl = null;
  state.spotifyGenres = [];
  state.spotifyPopularity = null;
  state.spotifyFollowers = null;
  state.artistMetrics = null;
  let artist: Awaited<ReturnType<typeof getSpotifyArtist>> = null;

  try {
    artist = await getSpotifyArtist(spotifyArtistId);
  } catch (error) {
    logger.warn('Onboarding Spotify artist enrichment failed', {
      error,
      spotifyArtistId,
    });
  }

  if (artist) {
    const metrics = normalizeArtistMetrics(
      {
        followersObject: artist.followers,
        followers: artist.followers?.total,
      },
      { source: 'spotify_api' }
    );
    state.spotifyArtistName = artist.name;
    state.spotifyImageUrl = artist.images?.[0]?.url ?? null;
    state.spotifyGenres = artist.genres ?? [];
    state.spotifyPopularity = artist.popularity ?? null;
    state.artistMetrics = metrics;
    state.spotifyFollowers = metrics.spotifyFollowers;

    return {
      action: 'spotify_artist_confirmed' as const,
      spotifyArtistId,
      artist: {
        id: artist.id,
        name: artist.name,
        url: buildSpotifyArtistUrl(artist.id),
        imageUrl: artist.images?.[0]?.url ?? null,
        followers: metrics.spotifyFollowers,
        popularity: artist.popularity ?? null,
        genres: artist.genres?.slice(0, 3) ?? [],
        metrics,
      },
      metrics,
      summary: `${artist.name} matched on Spotify.`,
    };
  }

  return {
    action: 'spotify_artist_confirmed' as const,
    spotifyArtistId,
    artist: null,
    metrics: null,
    summary: 'Spotify artist selected.',
  };
}

export interface CheckoutCardPayload {
  readonly action: 'propose_checkout';
  readonly plan: 'free' | 'pro' | 'max' | null;
  /** Route to send the visitor to after chat onboarding. */
  readonly handoffUrl: string;
}

/**
 * Build the onboarding tool palette wired to a per-turn state accumulator.
 * Pass the result as the `tools` argument to `executeChatTurn`.
 */
export function buildOnboardingTools(state: OnboardingTurnState): ToolSet {
  const tools = {
    searchSpotifyArtist: tool({
      description: TOOL_SCHEMAS.searchSpotifyArtist.description,
      inputSchema: TOOL_SCHEMAS.searchSpotifyArtist.inputSchema,
      execute: async ({ query }) => {
        // The client renders the popout picker (reusing WaitlistSpotifySearch);
        // the actual /api/spotify/search call happens client-side via the
        // existing useArtistSearchQuery hook. The tool result is the trigger
        // marker the UI listens for.
        return {
          action: 'open_artist_picker' as const,
          query: query ?? null,
          summary: 'Pick the matching Spotify artist.',
        };
      },
    }),

    confirmSpotifyArtist: tool({
      description: TOOL_SCHEMAS.confirmSpotifyArtist.description,
      inputSchema: TOOL_SCHEMAS.confirmSpotifyArtist.inputSchema,
      execute: async ({ spotifyArtistId }) =>
        buildConfirmSpotifyArtistOutput(spotifyArtistId, state),
    }),

    checkHandle: tool({
      description: TOOL_SCHEMAS.checkHandle.description,
      inputSchema: TOOL_SCHEMAS.checkHandle.inputSchema,
      execute: async ({ handle }) => {
        // Client-side rendering hits /api/handle/check for the live boolean.
        // Emit the canonical availability shell (requested handle only — never
        // a silent numbered swap). UI fills available via the shared helper.
        const normalized = normalizeHandleCandidate(handle);
        const availability = toHandleAvailabilityResult({
          handle: normalized,
          checking: true,
        });
        const payload: CheckHandleOutput = {
          action: 'check_handle',
          handle: normalized,
          availability,
          summary: `Checking @${normalized}.`,
        };
        return payload;
      },
    }),

    proposeSocialLink: tool({
      description: TOOL_SCHEMAS.proposeSocialLink.description,
      inputSchema: TOOL_SCHEMAS.proposeSocialLink.inputSchema,
      execute: async ({ url }) => {
        // Reject incomplete parses (e.g. bare instagram.com) so the rail and
        // artifacts never attach a host without an account path.
        const parsed = parseSocialLinkInput(url);
        if (!parsed.ok) {
          const payload: ProposeSocialLinkOutput = {
            action: 'propose_social_link',
            url: null,
            parseOk: false,
            reason: parsed.reason,
            platform: parsed.platform,
            summary: 'Link needs a full profile URL with account path.',
          };
          return payload;
        }
        const payload: ProposeSocialLinkOutput = {
          action: 'propose_social_link',
          url: parsed.url,
          parseOk: true,
          platform: parsed.platform,
          summary: 'Social link ready to review.',
        };
        return payload;
      },
    }),

    recordInterviewSignal: tool({
      description: TOOL_SCHEMAS.recordInterviewSignal.description,
      inputSchema: TOOL_SCHEMAS.recordInterviewSignal.inputSchema,
      execute: async (signal: z.infer<typeof interviewSignalSchema>) => {
        state.signals.push(signal);
        const recordedAt = new Date().toISOString();
        // Keep this silent in the UI; the accumulator feeds proposeNextStep
        // within the same turn.
        return {
          action: 'signal_recorded' as const,
          signal,
          recordedAt,
          signalCount: state.signals.length,
          summary: 'Signal noted.',
        };
      },
    }),

    proposeNextStep: tool({
      description: TOOL_SCHEMAS.proposeNextStep.description,
      inputSchema: TOOL_SCHEMAS.proposeNextStep.inputSchema,
      execute: async () => {
        const decision = evaluateAccessSignal({
          signal: collapseInterviewSignals(
            state.signals.map(s => ({
              ...s,
              recordedAt: new Date().toISOString(),
            }))
          ),
          spotifyFollowers: state.spotifyFollowers,
          metrics: state.artistMetrics,
          turnCount: state.turnCount,
        });
        const payload: NextStepCardPayload = {
          action: 'propose_next_step',
          decision,
        };
        return {
          ...payload,
          summary: `Next step: ${decision.kind.replaceAll('_', ' ')}.`,
        };
      },
    }),

    proposeCheckout: tool({
      description: TOOL_SCHEMAS.proposeCheckout.description,
      inputSchema: TOOL_SCHEMAS.proposeCheckout.inputSchema,
      execute: async ({ plan }) => {
        const handoffUrl = plan
          ? `/onboarding/checkout?plan=${encodeURIComponent(plan)}`
          : '/onboarding/checkout';
        const payload: CheckoutCardPayload = {
          action: 'propose_checkout',
          plan: plan ?? null,
          handoffUrl,
        };
        return { ...payload, summary: 'Checkout handoff ready.' };
      },
    }),
  } satisfies ToolSet;

  return tools;
}
