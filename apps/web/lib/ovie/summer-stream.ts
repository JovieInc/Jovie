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
      let metadata: Record<string, unknown> = { ...input.metadata };
      writer.write({
        type: 'start',
        messageId,
        ...(Object.keys(metadata).length > 0
          ? { messageMetadata: metadata }
          : {}),
      });
      writer.write({ type: 'start-step' });
      writer.write({ type: 'text-start', id: textId });
      for await (const event of input.events) {
        if (event.type === 'text-delta' && event.text) {
          writer.write({ type: 'text-delta', id: textId, delta: event.text });
          continue;
        }
        if (event.type === 'binding') {
          metadata = {
            ...metadata,
            eveWorkId: event.binding.eveWorkId,
            summerSession: event.binding.summerSessionId,
            correlationId: event.binding.correlationId,
            summerSpeaker: event.binding.speaker,
          };
          continue;
        }
        if (event.type === 'state') {
          metadata = { ...metadata, summerState: event.state };
          continue;
        }
        if (event.type === 'tool') {
          metadata = { ...metadata, toolReceipt: event.receipt };
        }
      }
      writer.write({ type: 'text-end', id: textId });
      writer.write({ type: 'finish-step' });
      writer.write({
        type: 'finish',
        finishReason: 'stop',
        messageMetadata: metadata,
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
