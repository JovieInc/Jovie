import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageChunk,
} from 'ai';
import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import { getToolUiConfig } from '@/lib/chat/tool-ui-registry';
import type { FallbackTurn } from './engine';

/**
 * Serialize a deterministic fallback turn (JOV-3806) as the UIMessage SSE
 * stream the onboarding client (`useChat`) expects — same shape the LLM
 * path streams, so the client renders scripted turns and LLM turns
 * identically (text + tool cards).
 */

export type FallbackReason = 'llm_error' | 'kill_switch' | 'injected';

export interface ScriptedFallbackResponseInput {
  readonly turn: FallbackTurn;
  readonly reason: FallbackReason;
  readonly headers: Record<string, string>;
}

interface EmittedToolCall {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly output: Record<string, unknown>;
}

function withToolCallIds(turn: FallbackTurn): readonly EmittedToolCall[] {
  return turn.toolEvents.map(event => ({
    toolCallId: randomUUID(),
    toolName: event.toolName,
    input: event.input,
    output: event.output,
  }));
}

/**
 * Convert the emitted tool calls into the persisted `tool_calls` shape
 * (schemaVersion 2) so claim-time state derivation treats fallback turns
 * exactly like LLM turns.
 */
export function toPersistedToolEvents(
  toolCalls: readonly EmittedToolCall[]
): PersistedToolEvent[] | undefined {
  if (toolCalls.length === 0) return undefined;
  return toolCalls.map(call => ({
    schemaVersion: 2,
    toolCallId: call.toolCallId,
    toolName: call.toolName,
    state: 'succeeded',
    input: call.input,
    output: call.output,
    summary:
      typeof call.output.summary === 'string' ? call.output.summary : undefined,
    uiHint: getToolUiConfig(call.toolName).uiHint,
  }));
}

export interface BuiltScriptedFallback {
  readonly response: Response;
  readonly persistedToolEvents: PersistedToolEvent[] | undefined;
}

export function buildScriptedFallbackResponse(
  input: ScriptedFallbackResponseInput
): BuiltScriptedFallback {
  const { turn, reason, headers } = input;
  const toolCalls = withToolCallIds(turn);
  const textId = randomUUID();

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'start-step' });
      writer.write({ type: 'text-start', id: textId });
      writer.write({ type: 'text-delta', id: textId, delta: turn.text });
      writer.write({ type: 'text-end', id: textId });
      for (const call of toolCalls) {
        writer.write({
          type: 'tool-input-available',
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: call.input,
        } as UIMessageChunk);
        writer.write({
          type: 'tool-output-available',
          toolCallId: call.toolCallId,
          output: call.output,
        } as UIMessageChunk);
      }
      writer.write({ type: 'finish-step' });
      writer.write({ type: 'finish', finishReason: 'stop' } as UIMessageChunk);
    },
  });

  const response = createUIMessageStreamResponse({
    stream,
    headers: {
      ...headers,
      'x-onboarding-fallback': turn.line.key,
      'x-fallback-reason': reason,
    },
  });

  return {
    response,
    persistedToolEvents: toPersistedToolEvents(toolCalls),
  };
}
