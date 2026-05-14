import 'server-only';
import { type ToolSet, tool } from 'ai';
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

/**
 * Onboarding tool execute closures (JOV-2132 PR 2).
 *
 * These are server-side closures the LLM calls during the onboarding chat.
 * They return structured payloads the UI cards (landing in PR 3) will render.
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
 *   UI-coordination markers (real implementations land in PR 3):
 *     - confirmSpotifyArtist   → records the picked artist id on the
 *                                accumulator; PR 3 will fetch full enrichment
 *     - proposeCheckout        → emits the route-handoff marker; PR 4 swaps
 *                                in the Stripe-Embedded experiment
 *
 *   Reused from authenticated chat:
 *     - proposeSocialLink      → same tool as in-app chat
 */

/**
 * Per-request state accumulator. The handler creates one instance per turn
 * and threads it through the tool closures so they can share state (e.g.
 * recordInterviewSignal writes; proposeNextStep reads).
 *
 * Persistence (chat_messages + chat_conversations.metadata) lands in a
 * follow-up commit so the handler diff stays focused on the dispatch path.
 */
export interface OnboardingTurnState {
  sessionId: string;
  /** Set when confirmSpotifyArtist is called. */
  spotifyArtistId: string | null;
  /** Set after confirmSpotifyArtist enrichment (PR 3 will populate). */
  spotifyVerified: boolean;
  spotifyFollowers: number | null;
  /** Append-only log of recordInterviewSignal calls within this turn. */
  signals: InterviewSignal[];
  /** Cumulative LLM turn count (1-indexed). Drives the proposeNextStep eval. */
  turnCount: number;
}

export function createOnboardingTurnState(input: {
  sessionId: string;
  turnCount: number;
}): OnboardingTurnState {
  return {
    sessionId: input.sessionId,
    spotifyArtistId: null,
    spotifyVerified: false,
    spotifyFollowers: null,
    signals: [],
    turnCount: input.turnCount,
  };
}

export interface NextStepCardPayload {
  readonly action: 'propose_next_step';
  readonly decision: AccessDecision;
}

export interface CheckoutCardPayload {
  readonly action: 'propose_checkout';
  readonly plan: 'free' | 'pro' | 'max' | null;
  /** Route to send the visitor to. PR 4 may swap in Embedded Checkout. */
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
        };
      },
    }),

    confirmSpotifyArtist: tool({
      description: TOOL_SCHEMAS.confirmSpotifyArtist.description,
      inputSchema: TOOL_SCHEMAS.confirmSpotifyArtist.inputSchema,
      execute: async ({ spotifyArtistId }) => {
        state.spotifyArtistId = spotifyArtistId;
        // PR 3 will fetch full enrichment server-side here (avatar, followers,
        // latest release, verified flag, genres) and persist it onto the
        // conversation. For now we mark the pick; the LLM proceeds knowing the
        // artist has been identified, and proposeNextStep will see whatever
        // signal accumulates by the time it fires.
        return {
          action: 'spotify_artist_confirmed' as const,
          spotifyArtistId,
        };
      },
    }),

    checkHandle: tool({
      description: TOOL_SCHEMAS.checkHandle.description,
      inputSchema: TOOL_SCHEMAS.checkHandle.inputSchema,
      execute: async ({ handle }) => {
        // Client-side rendering hits /api/handle/check directly so the gate
        // surfaces the same constant-time response budget regardless of who
        // asks. The tool just emits the marker + the proposed handle.
        return {
          action: 'check_handle' as const,
          handle: handle.toLowerCase(),
        };
      },
    }),

    proposeSocialLink: tool({
      description: TOOL_SCHEMAS.proposeSocialLink.description,
      inputSchema: TOOL_SCHEMAS.proposeSocialLink.inputSchema,
      execute: async ({ url }) => {
        // PR 3 will wire this through the same SocialLink confirmation card
        // the authenticated chat uses (detectPlatform + preview). For PR 2 we
        // just emit the URL — the LLM treats this as "I've offered to attach
        // this link" and the UI will render the card.
        return {
          action: 'propose_social_link' as const,
          url,
        };
      },
    }),

    recordInterviewSignal: tool({
      description: TOOL_SCHEMAS.recordInterviewSignal.description,
      inputSchema: TOOL_SCHEMAS.recordInterviewSignal.inputSchema,
      execute: async (signal: z.infer<typeof interviewSignalSchema>) => {
        state.signals.push(signal);
        // Persistence to chat_conversations.metadata.interviewSignals lands
        // in the follow-up commit. The accumulator above is sufficient to
        // feed proposeNextStep within the same turn.
        return {
          action: 'signal_recorded' as const,
          signalCount: state.signals.length,
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
          spotifyVerified: state.spotifyVerified,
          turnCount: state.turnCount,
        });
        const payload: NextStepCardPayload = {
          action: 'propose_next_step',
          decision,
        };
        return payload;
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
        return payload;
      },
    }),
  } satisfies ToolSet;

  return tools;
}
