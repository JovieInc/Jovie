import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
import { describe, expect, it } from 'vitest';
import { encodeToolEvents } from '@/lib/chat/tool-events';
import { MemoryOperatingStore } from './mcp/store';
import {
  appendSummerTurn,
  CURRENT_SUMMER_SESSION_ID,
  loadCurrentSummerSession,
} from './summer-session';
import { createSummerAssistantStreamResponse } from './summer-stream';
import { runOvieSummerTurn, type SummerTurnEvent } from './summer-transport';

async function readTurn(
  events: SummerTurnEvent[]
): Promise<{ message: UIMessage; errorText?: string }> {
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
  let errorText: string | undefined;
  try {
    for await (const next of readUIMessageStream({
      stream,
      onError: error => {
        errorText = error instanceof Error ? error.message : String(error);
      },
      terminateOnError: true,
    })) {
      message = next;
    }
  } catch (error) {
    errorText ??= error instanceof Error ? error.message : String(error);
  }
  expect(message).toBeDefined();
  return { message: message!, errorText };
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
      const { message, errorText } = await readTurn(events);
      // A textless failure is a real stream error, not a fake assistant
      // reply, so the client restores the composer and offers Retry.
      expect(errorText).toMatch(/Summer/);
      expect(errorText).toMatch(/unavailable|unknown|failed|failure/);
      expect(message.parts.filter(part => part.type === 'text')).toEqual([]);
      expect(message.metadata).toMatchObject({
        summerState: state === 'failure' ? 'failure' : 'unavailable',
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

  it('uses the pending recovery notice as the retryable error message', async () => {
    const notice = 'Summer is still reconciling this turn. Retry in a moment.';
    const { message, errorText } = await readTurn([
      { type: 'notice', text: notice, code: 'summer_turn_pending' },
      { type: 'state', state: 'unknown' },
      { type: 'state', state: 'unavailable' },
    ]);
    // The notice becomes the error text, not an assistant bubble, so no
    // dead-end "do not resend" content is rendered or persisted as an answer.
    expect(errorText).toBe(notice);
    expect(message.parts.filter(part => part.type === 'text')).toEqual([]);
  });

  it('re-speaks a persisted empty failed turn on same-id retry so it can reconcile', async () => {
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
          yield { type: 'text-delta', text: 'Recovered answer.' };
        },
      },
    })) {
      events.push(event);
    }
    const { message, errorText } = await readTurn(events);
    expect(errorText).toBeUndefined();
    expect(message.parts.filter(part => part.type === 'text')).toEqual([
      expect.objectContaining({ text: 'Recovered answer.' }),
    ]);
    expect(calls).toBe(1);
    // The retried turn replaces the recorded dead-end failure.
    const session = await loadCurrentSummerSession(store);
    expect(session?.turns).toHaveLength(1);
    expect(session?.turns[0]).toMatchObject({
      clientTurnId: 'persisted-failure',
      state: 'completed',
      assistantText: 'Recovered answer.',
    });
  });

  it('does not hide an unknown outcome behind whitespace or overwrite its binding', async () => {
    const { message, errorText } = await readTurn([
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
    expect(errorText).toEqual(
      expect.stringContaining('Summer connection status: unknown.')
    );
    expect(message.parts.filter(part => part.type === 'text')).toEqual([
      expect.objectContaining({ text: '  ' }),
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
      const { message, errorText } = await readTurn([{ type: 'state', state }]);
      expect(errorText).toBeUndefined();
      expect(message.parts.filter(part => part.type === 'text')).toEqual([]);
    }
  );

  it('surfaces a blocked tool status as a retryable error when there is no renderable receipt', async () => {
    const { message, errorText } = await readTurn([
      { type: 'state', state: 'failed_tool' },
    ]);
    expect(errorText).toEqual(
      expect.stringContaining('Summer connection status: failed_tool.')
    );
    expect(message.parts.filter(part => part.type === 'text')).toEqual([]);
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
    const { message, errorText } = await readTurn([
      { type: 'tool', receipt },
      { type: 'state', state: ok ? 'completed' : 'failed_tool' },
    ]);
    expect(errorText).toBeUndefined();
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
    expect(message.parts.filter(part => part.type === 'text')).toEqual([]);
  });

  it('preserves Summer text alongside exactly one tool receipt', async () => {
    const { message } = await readTurn([
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
