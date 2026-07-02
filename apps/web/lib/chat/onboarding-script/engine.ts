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

/**
 * Deterministic onboarding fallback engine (JOV-3806).
 *
 * Stateless per-request: everything it needs is recovered from the inbound
 * UIMessage history (tool outputs persist across turns on the client and in
 * `chat_messages.tool_calls`). When the LLM is down, this walks the same
 * intake rail the LLM walks: greet → pick artist → confirm → handle →
 * access decision → checkout/waitlist. The words come from `script.ts`;
 * the access decision comes from the same `evaluateAccessSignal` the LLM
 * tool uses — the fallback never invents its own scoring.
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
  extraBand: AudienceBand | null
): AccessDecision {
  const recordedAt = new Date().toISOString();
  const signals = state.signals.map(signal => ({ ...signal, recordedAt }));
  if (extraBand) {
    signals.push({ audienceBand: extraBand, recordedAt });
  }
  return evaluateAccessSignal({
    signal: collapseInterviewSignals(signals),
    spotifyFollowers: state.spotifyFollowers,
    turnCount: state.turnCount,
  });
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
    return { line, text: renderLine(line, {}), toolEvents: events };
  }

  const latest = lastUserMessage(uiMessages);
  const parsedBand = latest ? parseAudienceBand(messageText(latest)) : null;
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

  const decision = decideAccess(state, parsedBand);
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
    return { line, text: renderLine(line, {}), toolEvents: events };
  }
  if (decision.kind === 'waitlist') {
    events.push(proposeNextStepEvent(decision));
    const line = pick('waitlist');
    return { line, text: renderLine(line, {}), toolEvents: events };
  }
  const line = pick('ask_audience');
  return { line, text: renderLine(line, {}), toolEvents: events };
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
    };
  }

  // No artist yet: greet on the very first turn, otherwise open the picker.
  if (!state.spotifyArtistId) {
    if (state.turnCount <= 1) {
      const line = pick('greet');
      return { line, text: renderLine(line, {}), toolEvents: [] };
    }
    const query = latest ? messageText(latest).slice(0, 50) : '';
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
    };
  }

  // Artist confirmed but handle not checked yet.
  if (!findLatestToolOutput(uiMessages, 'check_handle')) {
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
    };
  }

  // Access decision phase.
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
