/**
 * Map a Summer turn onto the existing UIMessage SSE used by /api/chat.
 */

import { randomUUID } from 'node:crypto';
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import {
  type SummerFailureHop,
  summerFailureText,
  summerRetryMode,
} from '@/lib/ovie/summer-failure';
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
      let hasVisibleContent = false;
      let textStarted = false;
      let failureState: (SummerTurnEvent & { type: 'state' }) | undefined;
      let terminalState: string | undefined;
      let lastNotice: { text: string; code: string } | undefined;
      writer.write({
        type: 'start',
        messageId,
        ...(Object.keys(metadata).length > 0
          ? { messageMetadata: metadata }
          : {}),
      });
      writer.write({ type: 'start-step' });
      const writeDelta = (delta: string) => {
        if (!textStarted) {
          textStarted = true;
          writer.write({ type: 'text-start', id: textId });
        }
        writer.write({ type: 'text-delta', id: textId, delta });
      };
      for await (const event of input.events) {
        if (event.type === 'text-delta' && event.text) {
          hasVisibleContent ||= event.text.trim().length > 0;
          writeDelta(event.text);
          continue;
        }
        if (event.type === 'notice') {
          lastNotice = { text: event.text, code: event.code };
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
          terminalState = event.state;
          if (
            [
              'unknown',
              'unavailable',
              'failure',
              'failed_tool',
              'disconnected',
              'unauthorized',
            ].includes(event.state)
          ) {
            failureState ??= event;
          }
          continue;
        }
        if (event.type === 'tool') {
          hasVisibleContent = true;
          metadata = { ...metadata, toolReceipt: event.receipt };
          writer.write({
            type: 'tool-input-available',
            toolCallId: event.receipt.receiptId,
            toolName: event.receipt.tool,
            input: {},
          });
          writer.write({
            type: 'tool-output-available',
            toolCallId: event.receipt.receiptId,
            output: {
              success: event.receipt.ok,
              summary: event.receipt.summary,
              receiptId: event.receipt.receiptId,
              ...(!event.receipt.ok ? { error: event.receipt.summary } : {}),
            },
          });
        }
      }
      if (textStarted) {
        writer.write({ type: 'text-end', id: textId });
      }
      if (failureState) {
        // Display-only status, not a Summer answer or a durable turn. Keep
        // admission, same-turn recovery and budget checkpoint semantics intact.
        const hop: SummerFailureHop =
          failureState.hop ??
          (failureState.state === 'failure' ||
          failureState.state === 'failed_tool'
            ? 'summer_turn_failed'
            : 'summer_unreachable');
        metadata = {
          ...metadata,
          summerFailure: { hop, retry: summerRetryMode(hop, terminalState) },
        };
        if (!hasVisibleContent) {
          // Surface a real stream error, not a fake assistant reply: the chat
          // client restores the composer text and offers Retry, and no
          // dead-end bubble is rendered or recorded as an answer.
          writer.write({ type: 'message-metadata', messageMetadata: metadata });
          // The error chunk ends the stream without onFinish, so carry the
          // hop + retry mode on a data part the client can read in onError.
          writer.write({
            type: 'data-summer-failure',
            data: { hop, retry: summerRetryMode(hop, terminalState) },
          });
          writer.write({
            type: 'error',
            errorText: lastNotice?.text ?? summerFailureText(hop),
          });
          return;
        }
      }
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
