import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
import { describe, expect, it } from 'vitest';
import { encodeToolEvents } from '@/lib/chat/tool-events';
import { MemoryOperatingStore } from './mcp/store';
import { summerFailureText } from './summer-failure';
import {
  appendSummerTurn,
  CURRENT_SUMMER_SESSION_ID,
  loadCurrentSummerSession,
} from './summer-session';
import { createSummerAssistantStreamResponse } from './summer-stream';
import { runOvieSummerTurn, type SummerTurnEvent } from './summer-transport';

async function readTurn(events: SummerTurnEvent[]): Promise<UIMessage> {
  const response = await createSummerAssistantStreamResponse({
    events: (async function* () {
      yield* events;
    })(),
    requestId: 'tool-only-stream',
    corsHeaders: {},
  });
  const chunks: UIMessageChunk[] = (await response.text())
    .split('\n')
    .filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map(line => JSON.parse(line.slice(6)));
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  let message: UIMessage | undefined;
  for await (const next of readUIMessageStream({
    stream,
    terminateOnError: true,
  })) {
    message = next;
  }
  expect(message).toBeDefined();
  return message!;
}

describe('Summer UI message stream', () => {
  it.each(['unknown', 'unavailable', 'failure'] as const)(
    'makes a textless Summer %s outcome visible without changing persistence',
    async state => {
      const store = new MemoryOperatingStore();
      const events: SummerTurnEvent[] = [];
      for await (const event of runOvieSummerTurn({
        store,
        receipts: [],
        userText: 'Existing failed turn fixture',
        clientTurnId: `textless-${state}`,
        speaker: {
          id: 'summer',
          runtime: 'eve',
          async *speak() {
            yield { type: 'error', state };
          },
        },
      })) {
        events.push(event);
      }
      const message = await readTurn(events);
      const text = message.parts
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('');
      const hop =
        state === 'failure' ? 'summer_turn_failed' : 'summer_unreachable';
      expect(text).toBe(summerFailureText(hop));
      expect(message.metadata).toMatchObject({
        summerState: state === 'failure' ? 'failure' : 'unavailable',
        // A recorded failure replays on its id; an unrecorded one is re-read.
        summerFailure: {
          hop,
          retry: state === 'failure' ? 'new-turn' : 'same-turn',
        },
      });
      // A display diagnostic is not a Summer answer or a new durable receipt.
      const session = await loadCurrentSummerSession(store);
      if (state === 'failure') {
        expect(session?.turns).toHaveLength(1);
        expect(session?.turns[0]).toMatchObject({
          state: 'failure',
          assistantText: '',
        });
      } else {
        expect(session?.turns).toHaveLength(0);
      }
    }
  );

  it('preserves pending recovery notices without adding a second diagnostic', async () => {
    const notice = 'Summer is still reconciling this turn. Do not resend.';
    const message = await readTurn([
      { type: 'text-delta', text: notice },
      { type: 'state', state: 'unknown' },
      { type: 'state', state: 'unavailable' },
    ]);
    expect(message.parts.filter(part => part.type === 'text')).toEqual([
      expect.objectContaining({ text: notice }),
    ]);
    expect(message.metadata).toMatchObject({
      summerFailure: { hop: 'summer_unreachable', retry: 'same-turn' },
    });
  });

  it('names a pending result hop and keeps Retry on the same unrecorded turn', async () => {
    const store = new MemoryOperatingStore();
    const events: SummerTurnEvent[] = [];
    for await (const event of runOvieSummerTurn({
      store,
      receipts: [],
      userText: 'What shipped today?',
      clientTurnId: 'pending-turn',
      speaker: {
        id: 'summer',
        runtime: 'eve',
        async *speak() {
          yield {
            type: 'notice',
            text: 'Summer is still reconciling this turn.',
            code: 'summer_turn_pending',
          };
          yield {
            type: 'error',
            state: 'unknown',
            hop: 'summer_result_pending',
          };
        },
      },
    })) {
      events.push(event);
    }
    const message = await readTurn(events);
    expect(message.parts.filter(part => part.type === 'text')).toEqual([
      expect.objectContaining({
        text: summerFailureText('summer_result_pending'),
      }),
    ]);
    expect(message.metadata).toMatchObject({
      summerFailure: { hop: 'summer_result_pending', retry: 'same-turn' },
    });
    expect((await loadCurrentSummerSession(store))?.turns ?? []).toHaveLength(
      0
    );
  });

  it('discloses a persisted empty failed turn on same-id recovery without speaking again', async () => {
    const store = new MemoryOperatingStore();
    await appendSummerTurn(store, {
      clientTurnId: 'persisted-failure',
      userText: 'Existing failed turn fixture',
      assistantText: '',
      eveWorkId: null,
      eveAcks: [],
      correlationId: 'eve-none:persisted-failure',
      state: 'failure',
      toolReceipt: null,
      createdAt: '2026-09-20T15:50:00.000Z',
    });
    const before = await loadCurrentSummerSession(store);
    let calls = 0;
    const events: SummerTurnEvent[] = [];
    for await (const event of runOvieSummerTurn({
      store,
      receipts: [],
      userText: 'Existing failed turn fixture',
      clientTurnId: 'persisted-failure',
      speaker: {
        id: 'summer',
        runtime: 'eve',
        async *speak() {
          calls += 1;
          yield { type: 'text-delta', text: 'Must not be requested.' };
        },
      },
    })) {
      events.push(event);
    }
    const message = await readTurn(events);
    expect(message.parts.filter(part => part.type === 'text')).toEqual([
      expect.objectContaining({
        text: summerFailureText('summer_turn_failed'),
      }),
    ]);
    expect(message.metadata).toMatchObject({ summerState: 'failure' });
    expect(calls).toBe(0);
    expect(await loadCurrentSummerSession(store)).toEqual(before);
  });

  it('does not hide an unknown outcome behind whitespace or overwrite its binding', async () => {
    const message = await readTurn([
      {
        type: 'binding',
        binding: {
          eveWorkId: 'work-fixture',
          eveAcks: [],
          summerSessionId: CURRENT_SUMMER_SESSION_ID,
          correlationId: 'work-fixture:turn-fixture',
          speaker: 'summer',
        },
      },
      { type: 'text-delta', text: '  ' },
      { type: 'text-delta', text: '' },
      { type: 'state', state: 'unknown' },
      { type: 'state', state: 'unavailable' },
    ]);
    expect(message.parts.filter(part => part.type === 'text')).toEqual([
      expect.objectContaining({
        text: expect.stringContaining(summerFailureText('summer_unreachable')),
      }),
    ]);
    expect(message.metadata).toMatchObject({
      eveWorkId: 'work-fixture',
      summerSession: CURRENT_SUMMER_SESSION_ID,
      correlationId: 'work-fixture:turn-fixture',
      summerSpeaker: 'summer',
      summerState: 'unavailable',
    });
  });

  it.each(['canceled', 'completed'] as const)(
    'does not fabricate an unavailable notice for a %s turn',
    async state => {
      const message = await readTurn([{ type: 'state', state }]);
      expect(message.parts.filter(part => part.type === 'text')).toEqual([
        expect.objectContaining({ text: '' }),
      ]);
    }
  );

  it('shows a blocked tool status when there is no renderable tool receipt', async () => {
    const message = await readTurn([{ type: 'state', state: 'failed_tool' }]);
    expect(message.parts.filter(part => part.type === 'text')).toEqual([
      expect.objectContaining({
        text: summerFailureText('summer_turn_failed'),
      }),
    ]);
  });

  it.each([true, false])('renders a tool-only receipt with ok=%s', async ok => {
    const receipt = {
      tool: 'get_org_state' as const,
      ok,
      receiptId: 'safe-tool-receipt',
      summary: ok
        ? 'Organization state read.'
        : 'Organization state unavailable.',
    };
    const message = await readTurn([
      { type: 'tool', receipt },
      { type: 'state', state: ok ? 'completed' : 'failed_tool' },
    ]);
    // ChatMessage uses this same adapter to select its renderable tool parts.
    expect(encodeToolEvents(message.parts)).toEqual([
      expect.objectContaining({
        toolCallId: receipt.receiptId,
        toolName: receipt.tool,
        state: ok ? 'succeeded' : 'failed',
        summary: receipt.summary,
      }),
    ]);
    expect(message.metadata).toMatchObject({ toolReceipt: receipt });
    expect(message.parts.filter(part => part.type === 'text')).toEqual([
      expect.objectContaining({ text: '' }),
    ]);
  });

  it('preserves Summer text alongside exactly one tool receipt', async () => {
    const message = await readTurn([
      { type: 'text-delta', text: 'Summer response.' },
      {
        type: 'tool',
        receipt: {
          tool: 'get_org_state',
          ok: true,
          receiptId: 'receipt-with-text',
          summary: 'Organization state read.',
        },
      },
    ]);
    expect(message.parts.filter(part => part.type === 'text')).toEqual([
      expect.objectContaining({ text: 'Summer response.' }),
    ]);
    expect(encodeToolEvents(message.parts)).toHaveLength(1);
  });
});
