import { describe, expect, it } from 'vitest';
import {
  extractPersistableToolCalls,
  hydratePersistedMessageParts,
} from '@/components/jovie/message-parts';

describe('message parts persistence', () => {
  it('preserves full tool invocation parts for persistence', () => {
    const toolCalls = extractPersistableToolCalls([
      { type: 'text', text: 'Hello' },
      {
        type: 'tool-invocation',
        toolInvocationId: 'tool-1',
        toolName: 'showTopInsights',
        state: 'result',
        result: { success: true, title: 'Top signals' },
        toolInvocation: {
          toolName: 'showTopInsights',
          state: 'result',
        },
      },
    ]);

    expect(toolCalls).toEqual([
      {
        type: 'tool-invocation',
        toolInvocationId: 'tool-1',
        toolName: 'showTopInsights',
        state: 'result',
        result: { success: true, title: 'Top signals' },
        toolInvocation: {
          toolName: 'showTopInsights',
          state: 'result',
        },
      },
    ]);
  });

  it('hydrates persisted legacy tool calls back into renderable tool invocation parts', () => {
    const parts = hydratePersistedMessageParts('Here is your summary.', [
      {
        type: 'tool-invocation',
        toolInvocation: {
          toolCallId: 'tool-legacy',
          toolName: 'showTopInsights',
          state: 'result',
          result: { success: true, title: 'Top signals' },
        },
      },
    ]);

    expect(parts).toHaveLength(2);
    expect(parts[1]).toMatchObject({
      type: 'tool-invocation',
      toolInvocationId: 'tool-legacy',
      toolName: 'showTopInsights',
      state: 'result',
    });
  });
});
