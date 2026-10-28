/**
 * Living-canvas turns for Ovie Home (founder decision 2026-10-20, Q3).
 *
 * Each composer turn becomes one canvas state: the prompt, the reply text,
 * and the structured `summer.ops-card.v1` cards its tools returned. Cards are
 * schema-validated data, never free-form HTML; anything that fails validation
 * is dropped here and still visible in the transcript.
 */

import type { UIMessage } from 'ai';
import { encodeToolEvents } from '@/lib/chat/tool-events';
import { opsCardFromToolOutput, type SummerOpsCard } from '@/lib/ovie/ops-card';

export interface CanvasMessage {
  readonly id: string;
  readonly role: string;
  readonly parts: readonly unknown[];
}

export interface CanvasTurn {
  readonly id: string;
  readonly prompt: string;
  readonly reply: string;
  readonly cards: readonly SummerOpsCard[];
  /** The reply has not finished; its slot stays reserved. */
  readonly pending: boolean;
}

/** Kinds that update the in-flight section in place instead of the answer. */
export const IN_FLIGHT_CARD_KINDS: ReadonlySet<SummerOpsCard['kind']> = new Set(
  ['shipping', 'merge-queue']
);

function textOf(parts: readonly unknown[]): string {
  return parts
    .map(part =>
      part &&
      typeof part === 'object' &&
      (part as { type?: unknown }).type === 'text' &&
      typeof (part as { text?: unknown }).text === 'string'
        ? (part as { text: string }).text
        : ''
    )
    .join('')
    .trim();
}

function cardsOf(parts: readonly unknown[]): SummerOpsCard[] {
  const events =
    encodeToolEvents(parts as ReadonlyArray<UIMessage['parts'][number]>) ?? [];
  return events.flatMap(event => {
    if (event.state !== 'succeeded') return [];
    const card = opsCardFromToolOutput(event.output);
    return card ? [card] : [];
  });
}

/**
 * Pair each user prompt with the assistant reply that follows it. The last
 * turn is pending while the chat is streaming or has no reply yet.
 */
export function buildCanvasTurns(
  messages: readonly CanvasMessage[],
  isStreaming: boolean
): readonly CanvasTurn[] {
  const turns: CanvasTurn[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message || message.role !== 'user') continue;
    const next = messages[index + 1];
    const reply = next?.role === 'assistant' ? next : null;
    turns.push({
      id: message.id,
      prompt: textOf(message.parts),
      reply: reply ? textOf(reply.parts) : '',
      cards: reply ? cardsOf(reply.parts) : [],
      pending: false,
    });
  }
  const last = turns.at(-1);
  if (last) {
    const lastMessage = messages.at(-1);
    const awaitingReply = lastMessage?.role === 'user';
    if (isStreaming || awaitingReply) {
      turns[turns.length - 1] = { ...last, pending: true };
    }
  }
  return turns;
}

/** Split a turn's cards into in-place in-flight updates and answer cards. */
export function partitionCanvasCards(cards: readonly SummerOpsCard[]): {
  readonly inFlight: readonly SummerOpsCard[];
  readonly answer: readonly SummerOpsCard[];
} {
  return {
    inFlight: cards.filter(card => IN_FLIGHT_CARD_KINDS.has(card.kind)),
    answer: cards.filter(card => !IN_FLIGHT_CARD_KINDS.has(card.kind)),
  };
}
