import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
import { describe, expect, it } from 'vitest';
import { encodeToolEvents } from '@/lib/chat/tool-events';
import { createSummerAssistantStreamResponse } from './summer-stream';
import type { SummerTurnEvent } from './summer-transport';

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
  it.each([true, false])('renders a tool-only receipt with ok=%s', async ok => {
    const receipt = {
      tool: 'get_org_state' as const,
      ok,
      receiptId: 'safe-tool-receipt',
      summary: ok
        ? 'Organization state read.'
        : 'Organization state unavailable.',
    };
    const message = await readTurn([{ type: 'tool', receipt }]);
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
