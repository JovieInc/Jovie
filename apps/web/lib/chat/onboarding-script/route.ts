import 'server-only';
import type { UIMessage } from 'ai';
import type { OnboardingTurnState } from '@/lib/chat/tools/onboarding-tool-impls';
import {
  CONFIDENCE_THRESHOLD,
  classifyOnboardingText,
  type DecisionModel,
  type IntentClassification,
  isFaqIntent,
  refineWithDecisionModel,
} from './classifier';
import {
  decideFallbackTurn,
  type FallbackTurn,
  handleCardEventForConfirmation,
  resolveGuardedStep,
  type ServerArtistConfirmation,
} from './engine';
import {
  linesForStep,
  pickLine,
  renderLine,
  type ScriptLine,
  type ScriptStepId,
} from './script';
import {
  type OnboardingGuardedStep,
  parseWidgetEventFromMetadata,
} from './widget-events';

/**
 * Onboarding turn router (JOV-9627).
 *
 * Decides, per message, whether the reply is deterministic (the common case,
 * no model on the path) or needs the LLM. Order:
 *
 *  1. Widget events and artist picks: the rail owns them, always scripted.
 *  2. Free text: the system-1 classifier reads it. At or above the confidence
 *     threshold the reply is scripted (answer set or rail step).
 *  3. Below the threshold at an artist step: a scripted clarifying question.
 *     Only a second consecutive unclear message reaches the LLM; the
 *     clarifier and the picker are already on screen, so the visible step
 *     never waits on the model.
 *  4. Below the threshold at a later step: the LLM answers, as before. Those
 *     steps already show their widget, so nothing waits on the model.
 */

export type RoutedTurn =
  | {
      readonly kind: 'script';
      readonly turn: FallbackTurn;
      readonly classification: IntentClassification | null;
      readonly guardedStep: OnboardingGuardedStep;
    }
  | {
      readonly kind: 'llm';
      readonly classification: IntentClassification;
      readonly guardedStep: OnboardingGuardedStep;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textOf(message: UIMessage | null): string {
  if (!message) return '';
  return (message.parts ?? [])
    .map(part =>
      part.type === 'text' &&
      typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : ''
    )
    .join('');
}

function lastOfRole(
  messages: readonly UIMessage[],
  role: UIMessage['role']
): UIMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === role) return message;
  }
  return null;
}

/** The assistant message that precedes the latest user message. */
function previousAssistantText(messages: readonly UIMessage[]): string {
  let seenUser = false;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    if (!seenUser) {
      if (message.role === 'user') seenUser = true;
      continue;
    }
    if (message.role === 'assistant') return textOf(message);
  }
  return '';
}

export function isClarifierText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return linesForStep('clarify').some(line => trimmed.startsWith(line.text));
}

function scriptedLine(stepId: ScriptStepId, sessionId: string): ScriptLine {
  return pickLine(stepId, sessionId);
}

function pickerEvent(query: string) {
  return {
    toolName: 'searchSpotifyArtist',
    input: { query },
    output: {
      action: 'open_artist_picker',
      query: query || null,
      summary: 'Pick the matching Spotify artist.',
    },
  } as const;
}

/** Turn for a picker selection, built from the already-confirmed artist. */
export function turnFromArtistConfirmation(
  confirmation: ServerArtistConfirmation,
  state: OnboardingTurnState,
  uiMessages: readonly UIMessage[] = []
): FallbackTurn {
  const hasData = state.spotifyFollowers !== null;
  const line = scriptedLine(
    hasData ? 'confirm_artist' : 'confirm_artist_no_data',
    state.sessionId
  );
  const part = confirmation.historyMessage.parts[0] as unknown as
    | { input: Record<string, unknown>; output: Record<string, unknown> }
    | undefined;
  return {
    line,
    text: renderLine(line, {
      name: state.spotifyArtistName,
      followers: state.spotifyFollowers,
    }),
    // The line points at the handle card below, so the card ships in this
    // turn (same builder as the engine's confirmation path).
    toolEvents: part
      ? [
          {
            toolName: 'confirmSpotifyArtist',
            input: part.input,
            output: part.output,
          },
          handleCardEventForConfirmation(uiMessages, state.spotifyArtistName),
        ]
      : [],
    guardedStep: 'artist_select',
  };
}

function clarifyTurn(sessionId: string): FallbackTurn {
  const line = scriptedLine('clarify', sessionId);
  return {
    line,
    text: renderLine(line, {}),
    toolEvents: [pickerEvent('')],
    guardedStep: 'artist_search',
  };
}

function faqStepId(intent: IntentClassification['intent']): ScriptStepId {
  switch (intent) {
    case 'faq_price':
      return 'faq_price';
    case 'faq_time':
      return 'faq_time';
    case 'faq_ownership':
      return 'faq_ownership';
    case 'faq_spotify':
      return 'faq_spotify';
    default:
      return 'faq_what';
  }
}

function isArtistStep(step: OnboardingGuardedStep): boolean {
  return step === 'role' || step === 'artist_search';
}

export interface RouteInput {
  readonly uiMessages: readonly UIMessage[];
  /** State for this turn. Not mutated by routing. */
  readonly state: OnboardingTurnState;
  /** Set when the latest message is a fresh picker selection. */
  readonly artistConfirmation: ServerArtistConfirmation | null;
  readonly decisionModel?: DecisionModel | null;
}

export async function routeOnboardingTurn(
  input: RouteInput
): Promise<RoutedTurn> {
  const { uiMessages, state, artistConfirmation } = input;
  const latest = lastOfRole(uiMessages, 'user');
  const guardedStep = resolveGuardedStep({ uiMessages, state });

  // 1. The rail owns widget events and picker selections.
  if (artistConfirmation) {
    return {
      kind: 'script',
      turn: turnFromArtistConfirmation(artistConfirmation, state, uiMessages),
      classification: null,
      guardedStep: 'artist_select',
    };
  }
  const widgetEvent = latest
    ? parseWidgetEventFromMetadata(latest.metadata)
    : null;
  const metadata = latest && isRecord(latest.metadata) ? latest.metadata : null;
  if (widgetEvent || typeof metadata?.spotifyArtistId === 'string') {
    return {
      kind: 'script',
      turn: await decideFallbackTurn({ uiMessages, state }),
      classification: null,
      guardedStep,
    };
  }

  // 2. Free text through the system-1 classifier.
  const text = textOf(latest);
  const rules = classifyOnboardingText(text, guardedStep);
  const classification = await refineWithDecisionModel(
    rules,
    text,
    guardedStep,
    input.decisionModel ?? null
  );

  if (classification.confidence >= CONFIDENCE_THRESHOLD) {
    if (isFaqIntent(classification.intent)) {
      const line = scriptedLine(
        faqStepId(classification.intent),
        state.sessionId
      );
      // At an artist step the picker comes with the answer, so the visitor
      // can act on it. Later steps keep their widget; the answer stands alone.
      const toolEvents = isArtistStep(guardedStep) ? [pickerEvent('')] : [];
      return {
        kind: 'script',
        turn: {
          line,
          text: renderLine(line, {}),
          toolEvents,
          guardedStep,
        },
        classification,
        guardedStep,
      };
    }
    const openPickerQuery =
      classification.intent === 'artist_name' && isArtistStep(guardedStep)
        ? (classification.slot ?? undefined)
        : undefined;
    return {
      kind: 'script',
      turn: await decideFallbackTurn({ uiMessages, state, openPickerQuery }),
      classification,
      guardedStep,
    };
  }

  // 3. Below threshold at an artist step: clarify first, LLM only on repeat.
  if (isArtistStep(guardedStep)) {
    if (isClarifierText(previousAssistantText(uiMessages))) {
      return { kind: 'llm', classification, guardedStep };
    }
    return {
      kind: 'script',
      turn: clarifyTurn(state.sessionId),
      classification,
      guardedStep,
    };
  }

  // 4. Later step, no confident read: the model answers; widgets stay up.
  return { kind: 'llm', classification, guardedStep };
}
