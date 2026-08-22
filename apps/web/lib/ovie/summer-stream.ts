/**
 * Map a Summer turn onto the existing UIMessage SSE used by /api/chat.
 */

import { randomUUID } from 'node:crypto';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import type { SummerTurnEvent } from '@/lib/ovie/summer-transport';

export async function createSummerAssistantStreamResponse(input: {
  readonly events: AsyncIterable<SummerTurnEvent>;
  readonly requestId: string;
  readonly corsHeaders: Record<string, string>;
  readonly headers?: Record<string, string>;
  readonly metadata?: Record<string, unknown>;
}): Promise<Response> {
  const messageId = randomUUID();
  const textId = randomUUID();
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({
        type: 'start',
        messageId,
        ...(input.metadata ? { messageMetadata: input.metadata } : {}),
      });
      writer.write({ type: 'start-step' });
      writer.write({ type: 'text-start', id: textId });
      for await (const event of input.events) {
        if (event.type === 'text-delta' && event.text) {
          writer.write({ type: 'text-delta', id: textId, delta: event.text });
        }
      }
      writer.write({ type: 'text-end', id: textId });
      writer.write({ type: 'finish-step' });
      writer.write({
        type: 'finish',
        finishReason: 'stop',
        ...(input.metadata ? { messageMetadata: input.metadata } : {}),
      });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      ...input.corsHeaders,
      ...input.headers,
      'x-request-id': input.requestId,
    },
  });
}
