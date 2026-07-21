import 'server-only';
import type { UIMessage } from 'ai';
import {
  type AccessDecision,
  evaluateAccessSignal,
} from '@/lib/chat/tools/onboarding-access-eval';
import type { AudienceBand } from '@/lib/chat/tools/onboarding-signals';
import { collapseInterviewSignals } from '@/lib/chat/tools/onboarding-signals';
import {
  buildConfirmSpotifyArtistOutput,
  type OnboardingTurnState,
} from '@/lib/chat/tools/onboarding-tool-impls';
import { loadScriptBank, pickFromBank } from './line-source';
import { renderLine, type ScriptLine, type ScriptStepId } from './script';
import {
  isIncompleteAdvanceMessage,
  ONBOARDING_WIDGET_EVENTS,
  type OnboardingGuardedStep,
  parseWidgetEventFromMetadata,
  WIDGET_COMPLETION_ACTIONS,
} from './widget-events';

/**
 * Deterministic onboarding fallback engine (JOV-3806).
 *
 * Stateless per-request: everything it needs is recovered from the inbound
 * UIMessage history (tool outputs persist across turns on the client and in
 * `chat_messages.tool_calls`). When the LLM is down, this walks the same
 * intake rail the LLM walks with explicit guards:
 * Role → ArtistSearch → ArtistSelect → Handle → Social → Contact →
 * Waitlist/Complete. Widget completions emit structured events; free-text
 * acks ("ok", "k") never complete waitlist/reservation.
 */

export interface FallbackToolEvent {
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly output: Record<string, unknown>;
}

export interface FallbackTurn {
  readonly line: ScriptLine;
  readonly text: string;
  readonly toolEvents: readonly FallbackToolEvent[];
  /** Resolved guarded step for this turn (audit / tests). */
  readonly guardedStep?: OnboardingGuardedStep;
}

interface LoosePart {
  readonly type?: string;
  readonly toolName?: string;
  readonly text?: string;
  readonly output?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function partsOf(message: UIMessage): readonly LoosePart[] {
  return (message.parts ?? []) as readonly LoosePart[];
}

/** Latest occurrence of a tool output with the given `action` marker. */
function findLatestToolOutput(
  messages: readonly UIMessage[],
  action: string
): Record<string, unknown> | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    for (const part of partsOf(message)) {
      if (isRecord(part.output) && part.output.action === action) {
        return part.output;
      }
    }
  }
  return null;
}

function lastUserMessage(messages: readonly UIMessage[]): UIMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'user') return message;
  }
  return null;
}

function messageText(message: UIMessage): string {
  return partsOf(message)
    .filter(part => part.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('');
}

function findWidgetEventInHistory(
  messages: readonly UIMessage[],
  eventType: string
): ReturnType<typeof parseWidgetEventFromMetadata> {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.role !== 'user') continue;
    const event = parseWidgetEventFromMetadata(message.metadata);
    if (event?.onboardingEvent === eventType) return event;
  }
  return null;
}

function hasHandleConfirmed(messages: readonly UIMessage[]): boolean {
  if (
    findLatestToolOutput(messages, WIDGET_COMPLETION_ACTIONS.HANDLE_CONFIRMED)
  ) {
    return true;
  }
  return Boolean(
    findWidgetEventInHistory(
      messages,
      ONBOARDING_WIDGET_EVENTS.HANDLE_CONFIRMED
    )
  );
}

function indexOfLatestToolAction(
  messages: readonly UIMessage[],
  action: string
): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    for (const part of partsOf(message)) {
      if (isRecord(part.output) && part.output.action === action) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Social is complete when the Attach Account widget fired, OR the visitor
 * sent a meaningful free-text reply after the social card was proposed
 * (explicit skip of social attach).
 */
function hasSocialAttached(messages: readonly UIMessage[]): boolean {
  if (
    findLatestToolOutput(messages, WIDGET_COMPLETION_ACTIONS.SOCIAL_ATTACHED)
  ) {
    return true;
  }
  if (
    findWidgetEventInHistory(messages, ONBOARDING_WIDGET_EVENTS.SOCIAL_ATTACHED)
  ) {
    return true;
  }

  const socialProposedAt = indexOfLatestToolAction(
    messages,
    'propose_social_link'
  );
  if (socialProposedAt < 0) return false;

  for (let i = socialProposedAt + 1; i < messages.length; i += 1) {
    const message = messages[i];
    if (!message || message.role !== 'user') continue;
    const event = parseWidgetEventFromMetadata(message.metadata);
    if (event?.onboardingEvent === ONBOARDING_WIDGET_EVENTS.SOCIAL_ATTACHED) {
      return true;
    }
    if (!event && !isIncompleteAdvanceMessage(messageText(message))) {
      return true;
    }
  }
  return false;
}

const SPOTIFY_ARTIST_URL_PATTERN = /open\.spotify\.com\/artist\/([A-Za-z0-9]+)/;

/**
 * Extract the picked Spotify artist id from the latest user message. The
 * artist picker attaches it as UIMessage metadata (`spotifyArtistId`); a raw
 * pasted Spotify artist URL also works.
 */
export function parseArtistSelection(message: UIMessage | null): string | null {
  if (!message) return null;
  const metadata = isRecord(message.metadata) ? message.metadata : null;
  if (typeof metadata?.spotifyArtistId === 'string') {
    return metadata.spotifyArtistId;
  }
  const match = SPOTIFY_ARTIST_URL_PATTERN.exec(messageText(message));
  return match?.[1] ?? null;
}

const AUDIENCE_BANDS: readonly {
  readonly max: number;
  readonly band: AudienceBand;
}[] = [
  { max: 500, band: 'under_500' },
  { max: 5_000, band: '500_to_5k' },
  { max: 50_000, band: '5k_to_50k' },
  { max: 500_000, band: '50k_to_500k' },
  { max: Number.POSITIVE_INFINITY, band: 'over_500k' },
];

/**
 * Best-effort audience-size parse from a free-text reply ("about 2k",
 * "12,000 monthly", "under 500"). Returns null when no number is present.
 */
export function parseAudienceBand(text: string): AudienceBand | null {
  const match = /(\d[\d,.]*)\s*(k|m|thousand|million)?/i.exec(text);
  if (!match?.[1]) return null;
  const base = Number.parseFloat(match[1].replaceAll(',', ''));
  if (!Number.isFinite(base)) return null;
  const unit = match[2]?.toLowerCase();
  const multiplier =
    unit === 'k' || unit === 'thousand'
      ? 1_000
      : unit === 'm' || unit === 'million'
        ? 1_000_000
        : 1;
  const count = base * multiplier;
  return AUDIENCE_BANDS.find(entry => count < entry.max)?.band ?? 'over_500k';
}

/** Slug a Spotify artist name into a handle candidate. */
export function handleFromArtistName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '')
    .slice(0, 30);
  return slug || 'artist';
}

/**
 * Resolve the current guarded step from conversation history + turn state.
 * Pure — used by the engine and unit tests.
 */
export function resolveGuardedStep(input: {
  readonly uiMessages: readonly UIMessage[];
  readonly state: OnboardingTurnState;
  readonly selectedArtistId?: string | null;
}): OnboardingGuardedStep {
  const { uiMessages, state, selectedArtistId = null } = input;

  if (
    findLatestToolOutput(uiMessages, 'propose_next_step') &&
    (() => {
      const decision = findLatestToolOutput(uiMessages, 'propose_next_step');
      const kind = isRecord(decision?.decision) ? decision.decision.kind : null;
      return kind === 'instant_access' || kind === 'waitlist';
    })()
  ) {
    return 'waitlist_or_complete';
  }

  if (!state.spotifyArtistId && !selectedArtistId) {
    if (
      findLatestToolOutput(uiMessages, 'open_artist_picker') ||
      state.turnCount > 1
    ) {
      return 'artist_search';
    }
    return 'role';
  }

  if (selectedArtistId && state.spotifyArtistId !== selectedArtistId) {
    return 'artist_select';
  }

  if (!hasHandleConfirmed(uiMessages)) {
    return 'handle';
  }

  if (!hasSocialAttached(uiMessages)) {
    return 'social';
  }

  return 'contact';
}

function proposeNextStepEvent(decision: AccessDecision): FallbackToolEvent {
  return {
    toolName: 'proposeNextStep',
    input: {},
    output: {
      action: 'propose_next_step',
      decision,
      summary: `Next step: ${decision.kind.replaceAll('_', ' ')}.`,
    },
  };
}

function decideAccess(
  state: OnboardingTurnState,
  extraBand: AudienceBand | null,
  options?: { readonly forceTurnCap?: boolean }
): AccessDecision {
  const recordedAt = new Date().toISOString();
  const signals = state.signals.map(signal => ({ ...signal, recordedAt }));
  if (extraBand) {
    signals.push({ audienceBand: extraBand, recordedAt });
  }
  // Incomplete acks must not force waitlist via turn cap — freeze turnCount
  // under the force threshold unless we have real signal this turn.
  const turnCount =
    options?.forceTurnCap === false
      ? Math.min(state.turnCount, 2)
      : state.turnCount;
  return evaluateAccessSignal({
    signal: collapseInterviewSignals(signals),
    spotifyFollowers: state.spotifyFollowers,
    turnCount,
  });
}

function handleConfirmedEventFromLatest(
  latest: UIMessage | null
): { handle: string } | null {
  if (!latest) return null;
  const event = parseWidgetEventFromMetadata(latest.metadata);
  if (event?.onboardingEvent !== ONBOARDING_WIDGET_EVENTS.HANDLE_CONFIRMED) {
    return null;
  }
  if (typeof event.handle === 'string' && event.handle.length > 0) {
    return { handle: event.handle };
  }
  return { handle: '' };
}

function socialAttachedEventFromLatest(
  latest: UIMessage | null
): { url: string } | null {
  if (!latest) return null;
  const event = parseWidgetEventFromMetadata(latest.metadata);
  if (event?.onboardingEvent !== ONBOARDING_WIDGET_EVENTS.SOCIAL_ATTACHED) {
    return null;
  }
  return { url: event.url ?? '' };
}

function decisionTurn(
  input: Readonly<{
    uiMessages: readonly UIMessage[];
    state: OnboardingTurnState;
  }>,
  existingDecisionKind: string | null,
  pick: (stepId: ScriptStepId) => ScriptLine
): FallbackTurn {
  const { uiMessages, state } = input;

  // Terminal decision already made — point back at the card.
  if (existingDecisionKind && existingDecisionKind !== 'needs_more_info') {
    const events: FallbackToolEvent[] = [];
    if (
      existingDecisionKind === 'instant_access' &&
      !findLatestToolOutput(uiMessages, 'propose_checkout')
    ) {
      events.push({
        toolName: 'proposeCheckout',
        input: {},
        output: {
          action: 'propose_checkout',
          plan: null,
          handoffUrl: '/onboarding/checkout',
          summary: 'Checkout handoff ready.',
        },
      });
    }
    const line = pick('done');
    return {
      line,
      text: renderLine(line, {}),
      toolEvents: events,
      guardedStep: 'waitlist_or_complete',
    };
  }

  const latest = lastUserMessage(uiMessages);
  const latestText = latest ? messageText(latest) : '';
  const latestEvent = latest
    ? parseWidgetEventFromMetadata(latest.metadata)
    : null;
  const incomplete = !latestEvent && isIncompleteAdvanceMessage(latestText);

  // Incomplete free-text never advances to waitlist/success.
  if (incomplete) {
    const line = pick('ask_audience');
    return {
      line,
      text: renderLine(line, {}),
      toolEvents: [],
      guardedStep: 'contact',
    };
  }

  const parsedBand = parseAudienceBand(latestText);
  const events: FallbackToolEvent[] = [];
  if (parsedBand) {
    events.push({
      toolName: 'recordInterviewSignal',
      input: { audienceBand: parsedBand },
      output: {
        action: 'signal_recorded',
        signal: { audienceBand: parsedBand },
        signalCount: state.signals.length + 1,
        summary: 'Signal noted.',
      },
    });
  }

  // Only apply turn-cap force when we have a real (non-ack) reply.
  const decision = decideAccess(state, parsedBand, {
    forceTurnCap: Boolean(parsedBand) || latestText.trim().length >= 8,
  });
  if (decision.kind === 'instant_access') {
    events.push(proposeNextStepEvent(decision));
    events.push({
      toolName: 'proposeCheckout',
      input: {},
      output: {
        action: 'propose_checkout',
        plan: null,
        handoffUrl: '/onboarding/checkout',
        summary: 'Checkout handoff ready.',
      },
    });
    const line = pick('instant_access');
    return {
      line,
      text: renderLine(line, {}),
      toolEvents: events,
      guardedStep: 'waitlist_or_complete',
    };
  }
  if (decision.kind === 'waitlist') {
    events.push(proposeNextStepEvent(decision));
    const line = pick('waitlist');
    // Success / email language is owned by the client card once email exists.
    return {
      line,
      text: renderLine(line, {}),
      toolEvents: events,
      guardedStep: 'waitlist_or_complete',
    };
  }
  const line = pick('ask_audience');
  return {
    line,
    text: renderLine(line, {}),
    toolEvents: events,
    guardedStep: 'contact',
  };
}

/**
 * Decide the scripted assistant turn for the current conversation state.
 * Async only because artist confirmation fetches Spotify enrichment
 * (best-effort — a Spotify outage degrades to the no-data line, it never
 * throws).
 */
export async function decideFallbackTurn(
  input: Readonly<{
    uiMessages: readonly UIMessage[];
    state: OnboardingTurnState;
  }>
): Promise<FallbackTurn> {
  const { uiMessages, state } = input;
  const sessionId = state.sessionId;
  // Seeds merged with nightly-promoted lines (DB failure degrades to seeds).
  const bank = await loadScriptBank();
  const pick = (stepId: ScriptStepId): ScriptLine =>
    pickFromBank(bank, stepId, sessionId);
  const latest = lastUserMessage(uiMessages);
  const selectedArtistId = parseArtistSelection(latest);
  const latestEvent = latest
    ? parseWidgetEventFromMetadata(latest.metadata)
    : null;

  // "None of these" — re-open artist search without treating as selection.
  if (
    latestEvent?.onboardingEvent ===
    ONBOARDING_WIDGET_EVENTS.ARTIST_NONE_OF_THESE
  ) {
    const query = '';
    const line = pick('get_artist');
    return {
      line,
      text: renderLine(line, {}),
      toolEvents: [
        {
          toolName: 'searchSpotifyArtist',
          input: { query },
          output: {
            action: 'open_artist_picker',
            query: null,
            summary: 'Pick the matching Spotify artist.',
          },
        },
      ],
      guardedStep: 'artist_search',
    };
  }

  // The visitor just picked an artist — confirm it (Spotify enrichment).
  if (selectedArtistId && state.spotifyArtistId !== selectedArtistId) {
    const output = await buildConfirmSpotifyArtistOutput(
      selectedArtistId,
      state
    );
    const hasData = state.spotifyFollowers !== null;
    const line = hasData
      ? pick('confirm_artist')
      : pick('confirm_artist_no_data');
    return {
      line,
      text: renderLine(line, {
        name: state.spotifyArtistName,
        followers: state.spotifyFollowers,
      }),
      toolEvents: [
        {
          toolName: 'confirmSpotifyArtist',
          input: { spotifyArtistId: selectedArtistId },
          output: output as unknown as Record<string, unknown>,
        },
      ],
      guardedStep: 'artist_select',
    };
  }

  // No artist yet: greet on the very first turn, otherwise open the picker.
  if (!state.spotifyArtistId) {
    if (state.turnCount <= 1) {
      const line = pick('greet');
      return {
        line,
        text: renderLine(line, {}),
        toolEvents: [],
        guardedStep: 'role',
      };
    }
    // Prefill from prior user message; skip incomplete acks.
    const rawQuery = latest ? messageText(latest).slice(0, 50) : '';
    const query = isIncompleteAdvanceMessage(rawQuery) ? '' : rawQuery;
    const line = pick('get_artist');
    return {
      line,
      text: renderLine(line, {}),
      toolEvents: [
        {
          toolName: 'searchSpotifyArtist',
          input: { query },
          output: {
            action: 'open_artist_picker',
            query: query || null,
            summary: 'Pick the matching Spotify artist.',
          },
        },
      ],
      guardedStep: 'artist_search',
    };
  }

  // Artist confirmed but handle widget not shown yet (neither check nor confirm).
  const existingHandleCheck =
    findLatestToolOutput(uiMessages, 'check_handle') ??
    findLatestToolOutput(
      uiMessages,
      WIDGET_COMPLETION_ACTIONS.HANDLE_CONFIRMED
    );
  if (!existingHandleCheck) {
    const handle = handleFromArtistName(state.spotifyArtistName ?? '');
    const line = pick('handle');
    return {
      line,
      text: renderLine(line, { handle }),
      toolEvents: [
        {
          toolName: 'checkHandle',
          input: { handle },
          output: {
            action: 'check_handle',
            handle,
            summary: `Checking @${handle}.`,
          },
        },
      ],
      guardedStep: 'handle',
    };
  }

  // Handle shown but not confirmed via widget event — stay on handle.
  // Free-text "ok" / "k" does not advance.
  if (!hasHandleConfirmed(uiMessages)) {
    const confirmedNow = handleConfirmedEventFromLatest(latest);
    if (confirmedNow) {
      const handle =
        confirmedNow.handle ||
        (typeof existingHandleCheck.handle === 'string'
          ? String(existingHandleCheck.handle)
          : handleFromArtistName(state.spotifyArtistName ?? ''));
      // Emit handle_confirmed completion + advance to social.
      const line = pick('ask_audience');
      return {
        line,
        text: renderLine(line, {}),
        toolEvents: [
          {
            toolName: 'checkHandle',
            input: { handle },
            output: {
              action: WIDGET_COMPLETION_ACTIONS.HANDLE_CONFIRMED,
              handle,
              summary: `Handle @${handle} confirmed.`,
            },
          },
          {
            toolName: 'proposeSocialLink',
            input: { url: '' },
            output: {
              action: 'propose_social_link',
              url: null,
              summary: 'Attach a public social account.',
            },
          },
        ],
        guardedStep: 'social',
      };
    }
    // Re-surface handle step; do not decide access.
    const handle =
      typeof existingHandleCheck.handle === 'string'
        ? existingHandleCheck.handle
        : handleFromArtistName(state.spotifyArtistName ?? '');
    const line = pick('handle');
    return {
      line,
      text: renderLine(line, { handle }),
      toolEvents: [],
      guardedStep: 'handle',
    };
  }

  // Social step: require Attach Account event (or meaningful free-text skip).
  // hasSocialAttached is false until one of those happens.
  if (!hasSocialAttached(uiMessages)) {
    const attachedNow = socialAttachedEventFromLatest(latest);
    if (attachedNow) {
      const url = attachedNow.url;
      const line = pick('ask_audience');
      return {
        line,
        text: renderLine(line, {}),
        toolEvents: [
          {
            toolName: 'proposeSocialLink',
            input: { url },
            output: {
              action: WIDGET_COMPLETION_ACTIONS.SOCIAL_ATTACHED,
              url: url || null,
              summary: url ? `Attached ${url}.` : 'Social account attached.',
            },
          },
        ],
        guardedStep: 'contact',
      };
    }

    if (!findLatestToolOutput(uiMessages, 'propose_social_link')) {
      const line = pick('ask_audience');
      return {
        line,
        text: renderLine(line, {}),
        toolEvents: [
          {
            toolName: 'proposeSocialLink',
            input: { url: '' },
            output: {
              action: 'propose_social_link',
              url: null,
              summary: 'Attach a public social account.',
            },
          },
        ],
        guardedStep: 'social',
      };
    }

    // Social proposed; incomplete ack stays put.
    const latestText = latest ? messageText(latest) : '';
    if (!latestEvent && isIncompleteAdvanceMessage(latestText)) {
      const line = pick('ask_audience');
      return {
        line,
        text: renderLine(line, {}),
        toolEvents: [],
        guardedStep: 'social',
      };
    }

    // Meaningful free-text after social card: skip social → contact/access.
    // Fall through to decisionTurn; hasSocialAttached will be true next turn
    // because this user message sits after propose_social_link.
  }

  // Access decision phase (contact → waitlist/complete).
  const existingDecision = findLatestToolOutput(
    uiMessages,
    'propose_next_step'
  );
  const existingDecisionKind = isRecord(existingDecision?.decision)
    ? typeof existingDecision.decision.kind === 'string'
      ? existingDecision.decision.kind
      : null
    : null;
  return decisionTurn(input, existingDecisionKind, pick);
}
