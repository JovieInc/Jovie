/**
 * Ovie door → current Summer transport (JOV-5212).
 *
 * OV chat must not generate as artist Jovie and must not self-identify as
 * Ovie. Eve persists/acks/routes only. Conversational authority is the
 * current Mac Summer. Missing or disabled transport fails closed with a
 * typed unavailable/unknown state. Never fall back to Jovie, Eve-as-speaker,
 * Ovie-as-persona, Zoe, OpenClaw, a mock, or a fresh empty persona.
 */

import { denyEveAction } from '@/lib/ovie/eve-authority';
import type { OvieReceipt } from '@/lib/ovie/ingest';
import {
  assertIsolatedToolAllowed,
  isSummerSafeTool,
  SUMMER_MEMORY_NAMESPACE,
} from '@/lib/ovie/isolation';
import type { OperatingStore } from '@/lib/ovie/mcp/store';
import {
  assertModelMustNotSelfIdentifyAsOvie,
  assertOvieDoorDoesNotUseArtistJovieGeneration,
  type OperationalTruthState,
  type OvieDoorGenerationKind,
  OvieProgramError,
} from '@/lib/ovie/program';
import {
  appendSummerTurn,
  CURRENT_SUMMER_IDENTITY,
  eveBindingFromReceipts,
  findTurnByClientId,
  loadCurrentSummerSession,
  openCurrentSummerSession,
  type SummerSessionIdentity,
  type SummerToolReceipt,
} from '@/lib/ovie/summer-session';

export const FORBIDDEN_SUMMER_FALLBACKS = [
  'jovie',
  'eve-as-speaker',
  'ovie-as-persona',
  'zoe',
  'openclaw',
  'mock',
  'empty-persona',
] as const;

export type ForbiddenSummerFallback =
  (typeof FORBIDDEN_SUMMER_FALLBACKS)[number];

export type SummerSpeaker = {
  readonly id: 'summer';
  readonly runtime: 'mac';
  speak(input: SummerSpeakInput): AsyncIterable<SummerSpeakEvent>;
};

export type SummerSpeakInput = {
  readonly userText: string;
  readonly conversationId: string;
  readonly clientTurnId: string;
  readonly history: readonly {
    readonly role: 'user' | 'assistant';
    readonly text: string;
  }[];
  readonly signal?: AbortSignal;
};

export type SummerSpeakEvent =
  | { readonly type: 'text-delta'; readonly text: string }
  | {
      readonly type: 'tool';
      readonly tool: string;
      readonly ok: boolean;
      readonly receiptId: string;
      readonly summary: string;
    }
  | {
      readonly type: 'error';
      readonly state: Extract<
        OperationalTruthState,
        'failure' | 'unavailable' | 'unknown'
      >;
    };

export type SummerTurnBinding = {
  readonly eveWorkId: string | null;
  readonly eveAcks: readonly string[];
  readonly summerSessionId: typeof CURRENT_SUMMER_IDENTITY.sessionId;
  readonly correlationId: string;
  readonly speaker: 'summer';
};

export type SummerTurnEvent =
  | { readonly type: 'binding'; readonly binding: SummerTurnBinding }
  | {
      readonly type: 'state';
      readonly state:
        | OperationalTruthState
        | 'streaming'
        | 'canceled'
        | 'failed_tool'
        | 'completed';
    }
  | { readonly type: 'text-delta'; readonly text: string }
  | { readonly type: 'tool'; readonly receipt: SummerToolReceipt };

export type OvieDoorGeneration =
  | { readonly kind: 'artist-jovie' }
  | {
      readonly kind: 'summer-transport';
      readonly state: OperationalTruthState;
      readonly speaker: 'summer';
      readonly session: SummerSessionIdentity | null;
      readonly text: string;
    };

let boundSpeaker: SummerSpeaker | null = null;
let transportEnabled = true;

export function isSummerTransportEnabled(): boolean {
  return transportEnabled;
}

export function disableSummerTransport(): void {
  transportEnabled = false;
}

export function enableSummerTransport(): void {
  transportEnabled = true;
}

export function getBoundSummerSpeaker(): SummerSpeaker | null {
  return boundSpeaker;
}

export function unbindCurrentSummerSpeaker(): void {
  boundSpeaker = null;
}

export function resetSummerTransportRuntime(): void {
  boundSpeaker = null;
  transportEnabled = true;
}

export function assertNotForbiddenFallback(label: string): void {
  const normalized = label.trim().toLowerCase();
  for (const fallback of FORBIDDEN_SUMMER_FALLBACKS) {
    if (normalized === fallback || normalized.includes(fallback)) {
      throw new OvieProgramError(
        'ovie-forbidden-fallback',
        `Ovie door cannot fall back to ${fallback}`
      );
    }
  }
}

export function bindCurrentSummerSpeaker(
  speaker: SummerSpeaker
): SummerSpeaker {
  if (speaker.id !== 'summer' || speaker.runtime !== 'mac') {
    throw new OvieProgramError(
      'ovie-forbidden-fallback',
      'Ovie door only binds the current Mac Summer'
    );
  }
  assertNotForbiddenFallback(speaker.id);
  boundSpeaker = speaker;
  return speaker;
}

export function buildSummerUnavailableTransportText(
  receipts: readonly OvieReceipt[],
  state: Extract<
    OperationalTruthState,
    'unavailable' | 'unknown' | 'disconnected' | 'unauthorized' | 'failure'
  > = 'unavailable'
): string {
  const ackLines = receipts.map(receipt => receipt.ack).filter(Boolean);
  const intake =
    ackLines.length > 0
      ? `Eve intake/ack: ${ackLines.join('; ')}.`
      : 'Eve intake/ack completed with no dump items.';
  const text = [
    intake,
    `Conversation with the current Summer is ${state} on this door.`,
    'Ovie is the door, not the speaker. Eve does not answer. State is explicit; no Jovie, Eve, Ovie persona, Zoe, OpenClaw, or mock fallback.',
  ].join(' ');
  assertModelMustNotSelfIdentifyAsOvie(text);
  return text;
}

export type ResolveOvieDoorGenerationOptions = {
  readonly speaker?: SummerSpeaker | null;
  readonly enabled?: boolean;
};

export function resolveOvieDoorGeneration(
  chatMode: 'ov' | null | undefined,
  receipts: readonly OvieReceipt[] = [],
  options: ResolveOvieDoorGenerationOptions = {}
): OvieDoorGeneration {
  if (chatMode !== 'ov') {
    const generation: OvieDoorGeneration = { kind: 'artist-jovie' };
    assertOvieDoorDoesNotUseArtistJovieGeneration(chatMode, generation.kind);
    return generation;
  }

  const enabled = options.enabled ?? transportEnabled;
  const speaker =
    options.speaker === undefined ? boundSpeaker : options.speaker;
  if (!enabled || !speaker) {
    const state = 'unavailable' as const;
    const generation: OvieDoorGeneration = {
      kind: 'summer-transport',
      state,
      speaker: 'summer',
      session: null,
      text: buildSummerUnavailableTransportText(receipts, state),
    };
    assertOvieDoorDoesNotUseArtistJovieGeneration(chatMode, generation.kind);
    return generation;
  }

  assertNotForbiddenFallback(speaker.id);
  const generation: OvieDoorGeneration = {
    kind: 'summer-transport',
    state: 'fresh',
    speaker: 'summer',
    session: CURRENT_SUMMER_IDENTITY,
    text: '',
  };
  assertOvieDoorDoesNotUseArtistJovieGeneration(chatMode, generation.kind);
  return generation;
}

export function ovieDoorGenerationKind(
  generation: OvieDoorGeneration
): OvieDoorGenerationKind {
  return generation.kind;
}

function correlationIdFor(
  receipts: readonly OvieReceipt[],
  clientTurnId: string | null
): string {
  const { eveWorkId } = eveBindingFromReceipts(receipts);
  return [eveWorkId ?? 'eve-none', clientTurnId ?? 'turn-none'].join(':');
}

export async function* runOvieSummerTurn(input: {
  readonly receipts: readonly OvieReceipt[];
  readonly userText: string;
  readonly speaker: SummerSpeaker;
  readonly store: OperatingStore;
  readonly signal?: AbortSignal;
  readonly clientTurnId?: string | null;
}): AsyncGenerator<SummerTurnEvent> {
  if (input.speaker.id !== 'summer') {
    denyEveAction('summer-answer');
  }
  const session = await openCurrentSummerSession(input.store);
  const replay = findTurnByClientId(session, input.clientTurnId);
  const binding: SummerTurnBinding = {
    ...eveBindingFromReceipts(input.receipts),
    summerSessionId: session.identity.sessionId,
    correlationId: correlationIdFor(input.receipts, input.clientTurnId ?? null),
    speaker: 'summer',
  };
  yield { type: 'binding', binding };

  if (replay) {
    yield { type: 'state', state: 'recovery' };
    if (replay.assistantText) {
      yield { type: 'text-delta', text: replay.assistantText };
    }
    if (replay.toolReceipt) {
      yield { type: 'tool', receipt: replay.toolReceipt };
    }
    yield {
      type: 'state',
      state: replay.state === 'failed_tool' ? 'failed_tool' : 'completed',
    };
    return;
  }

  yield { type: 'state', state: 'streaming' };
  let assistantText = '';
  let toolReceipt: SummerToolReceipt | null = null;
  let terminal: 'completed' | 'canceled' | 'failed_tool' | 'failure' =
    'completed';

  try {
    for await (const event of input.speaker.speak({
      userText: input.userText,
      conversationId: session.identity.sessionId,
      clientTurnId: input.clientTurnId ?? binding.correlationId,
      history: session.turns.flatMap(turn => [
        { role: 'user' as const, text: turn.userText },
        { role: 'assistant' as const, text: turn.assistantText },
      ]),
      signal: input.signal,
    })) {
      if (input.signal?.aborted) {
        terminal = 'canceled';
        break;
      }
      if (event.type === 'text-delta') {
        assistantText += event.text;
        yield { type: 'text-delta', text: event.text };
        continue;
      }
      if (event.type === 'tool') {
        if (!isSummerSafeTool(event.tool)) {
          try {
            assertIsolatedToolAllowed(SUMMER_MEMORY_NAMESPACE, event.tool);
          } catch {
            terminal = 'failed_tool';
            break;
          }
          terminal = 'failed_tool';
          break;
        }
        toolReceipt = {
          tool: event.tool,
          ok: event.ok,
          receiptId: event.receiptId,
          summary: event.summary,
        };
        yield { type: 'tool', receipt: toolReceipt };
        if (!event.ok) terminal = 'failed_tool';
        continue;
      }
      terminal = 'failure';
      yield { type: 'state', state: event.state };
      break;
    }
  } catch {
    terminal = 'failure';
  }

  if (input.signal?.aborted) terminal = 'canceled';
  assertModelMustNotSelfIdentifyAsOvie(assistantText);

  await appendSummerTurn(input.store, {
    clientTurnId: input.clientTurnId ?? null,
    userText: input.userText,
    assistantText,
    eveWorkId: binding.eveWorkId,
    eveAcks: binding.eveAcks,
    correlationId: binding.correlationId,
    state: terminal,
    toolReceipt,
    createdAt: new Date().toISOString(),
  });

  yield {
    type: 'state',
    state: terminal === 'failure' ? 'failure' : terminal,
  };
}

export async function relaunchCurrentSummerSession(store: OperatingStore) {
  const session = await loadCurrentSummerSession(store);
  if (!session) {
    return openCurrentSummerSession(store);
  }
  return session;
}
