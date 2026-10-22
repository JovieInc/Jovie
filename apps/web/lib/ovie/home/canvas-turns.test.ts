import { describe, expect, it } from 'vitest';
import { SUMMER_OPS_CARD_SCHEMA } from '@/lib/ovie/ops-card';
import {
  buildCanvasTurns,
  type CanvasMessage,
  partitionCanvasCards,
} from './canvas-turns';

function card(kind: 'shipping' | 'revenue', title: string) {
  return {
    schema: SUMMER_OPS_CARD_SCHEMA,
    kind,
    title,
    state: 'fresh',
    observedAt: '2026-10-20T18:00:00.000Z',
    facts: [{ label: 'Merged today', value: '12' }],
  };
}

function toolPart(id: string, output: unknown, state = 'output-available') {
  return {
    type: 'tool-summerOpsData',
    toolCallId: id,
    state,
    input: {},
    output,
  };
}

const user = (id: string, text: string): CanvasMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});
const assistant = (id: string, parts: unknown[]): CanvasMessage => ({
  id,
  role: 'assistant',
  parts,
});

describe('buildCanvasTurns', () => {
  it('pairs each prompt with its reply text and validated cards', () => {
    const turns = buildCanvasTurns(
      [
        user('u1', 'How is shipping?'),
        assistant('a1', [
          { type: 'text', text: 'Twelve merges today.' },
          toolPart('t1', { card: card('shipping', 'Shipping') }),
          toolPart('t2', { card: { schema: 'not-a-card' } }),
        ]),
        user('u2', 'And revenue?'),
        assistant('a2', [toolPart('t3', { card: card('revenue', 'MRR') })]),
      ],
      false
    );

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({
      id: 'u1',
      prompt: 'How is shipping?',
      reply: 'Twelve merges today.',
      pending: false,
    });
    expect(turns[0]?.cards.map(item => item.title)).toEqual(['Shipping']);
    expect(turns[1]?.cards.map(item => item.kind)).toEqual(['revenue']);
  });

  it('marks the last turn pending while streaming or awaiting a reply', () => {
    expect(
      buildCanvasTurns([user('u1', 'Status?')], false).at(-1)?.pending
    ).toBe(true);
    expect(
      buildCanvasTurns(
        [
          user('u1', 'Status?'),
          assistant('a1', [{ type: 'text', text: 'Wo' }]),
        ],
        true
      ).at(-1)
    ).toMatchObject({ pending: true, reply: 'Wo' });
  });

  it('ignores cards from unfinished tool calls and returns nothing for no messages', () => {
    const [turn] = buildCanvasTurns(
      [
        user('u1', 'Status?'),
        assistant('a1', [
          toolPart(
            't1',
            { card: card('shipping', 'Shipping') },
            'input-available'
          ),
        ]),
      ],
      false
    );
    expect(turn?.cards).toEqual([]);
    expect(buildCanvasTurns([], false)).toEqual([]);
  });
});

describe('partitionCanvasCards', () => {
  it('routes shipping kinds to the in-flight section and the rest to the answer', () => {
    const [turn] = buildCanvasTurns(
      [
        user('u1', 'Everything'),
        assistant('a1', [
          toolPart('t1', { card: card('shipping', 'Shipping') }),
          toolPart('t2', { card: card('revenue', 'MRR') }),
        ]),
      ],
      false
    );
    const parts = partitionCanvasCards(turn?.cards ?? []);
    expect(parts.inFlight.map(item => item.title)).toEqual(['Shipping']);
    expect(parts.answer.map(item => item.title)).toEqual(['MRR']);
  });
});
