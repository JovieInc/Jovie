import { describe, expect, it } from 'vitest';
import {
  extractPersistableToolCalls,
  hydratePersistedMessageParts,
} from '@/components/jovie/message-parts';

describe('message parts persistence', () => {
  it('encodes SDK 6 tool parts into persisted tool events', () => {
    const toolCalls = extractPersistableToolCalls([
      { type: 'text', text: 'Hello' },
      {
        type: 'dynamic-tool',
        toolName: 'showTopInsights',
        toolCallId: 'tool-1',
        state: 'output-available',
        input: { artistId: 'artist-1' },
        output: { success: true, title: 'Top Signals' },
      },
    ]);

    expect(toolCalls).toEqual([
      {
        schemaVersion: 2,
        toolCallId: 'tool-1',
        toolName: 'showTopInsights',
        state: 'succeeded',
        input: { artistId: 'artist-1' },
        output: { success: true, title: 'Top Signals' },
        summary: 'Top Signals',
        uiHint: 'artifact',
      },
    ]);
  });

  it('maps output success false to a failed persisted event', () => {
    const toolCalls = extractPersistableToolCalls([
      {
        type: 'dynamic-tool',
        toolName: 'generateReleasePitch',
        toolCallId: 'tool-2',
        state: 'output-available',
        input: { releaseId: 'release-1' },
        output: { success: false, error: 'Pitch provider unavailable' },
      },
    ]);

    expect(toolCalls).toEqual([
      expect.objectContaining({
        toolCallId: 'tool-2',
        toolName: 'generateReleasePitch',
        state: 'failed',
        errorMessage: undefined,
        summary: 'Pitch provider unavailable',
      }),
    ]);
  });

  it('hydrates persisted v2 tool events into renderable SDK 6 parts', () => {
    const parts = hydratePersistedMessageParts('', [
      {
        schemaVersion: 2,
        toolCallId: 'tool-v2',
        toolName: 'showTopInsights',
        state: 'succeeded',
        output: { success: true, title: 'Top Signals' },
        summary: 'Top Signals',
        uiHint: 'artifact',
      },
    ]);

    expect(parts).toEqual([
      {
        type: 'dynamic-tool',
        toolName: 'showTopInsights',
        toolCallId: 'tool-v2',
        state: 'output-available',
        input: {},
        output: { success: true, title: 'Top Signals' },
      },
    ]);
  });

  it('hydrates legacy tool invocation records through the compatibility bridge', () => {
    const parts = hydratePersistedMessageParts('Here is your summary.', [
      {
        type: 'tool-invocation',
        toolInvocation: {
          toolCallId: 'tool-legacy',
          toolName: 'showTopInsights',
          state: 'result',
          result: { success: true, title: 'Top Signals' },
        },
      },
    ]);

    expect(parts).toHaveLength(2);
    expect(parts[1]).toEqual({
      type: 'dynamic-tool',
      toolName: 'showTopInsights',
      toolCallId: 'tool-legacy',
      state: 'output-available',
      input: {},
      output: { success: true, title: 'Top Signals' },
    });
  });

  it('hydrates failed legacy tool results as output errors', () => {
    const parts = hydratePersistedMessageParts('', [
      {
        type: 'tool-invocation',
        toolInvocation: {
          toolCallId: 'tool-legacy-failed',
          toolName: 'generateReleasePitch',
          state: 'result',
          result: { success: false, error: 'Pitch provider unavailable' },
        },
      },
    ]);

    expect(parts).toEqual([
      {
        type: 'dynamic-tool',
        toolName: 'generateReleasePitch',
        toolCallId: 'tool-legacy-failed',
        state: 'output-error',
        input: undefined,
        errorText: 'Pitch provider unavailable',
      },
    ]);
  });
});
