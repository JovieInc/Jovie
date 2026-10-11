import { renderHook } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectChatRailContextTargetsInput } from '../chat-context-rail';
import { useChatRailContextTargets } from './useChatRailContextTargets';

describe('useChatRailContextTargets', () => {
  it('publishes only meaningful changes while streaming and resets when switching conversations', () => {
    const publish = vi.fn();
    const first: ProjectChatRailContextTargetsInput = {
      conversationKey: 'one',
      messages: [
        {
          id: 'a',
          streamRevision: 0,
          parts: [{ type: 'text', text: '@release:one[One]' }],
        },
      ],
      profile: { id: 'profile', label: 'Artist' },
    };
    const { result, rerender } = renderHook(
      (input: ProjectChatRailContextTargetsInput) => {
        const targets = useChatRailContextTargets(input);
        useEffect(() => publish(targets), [targets]);
        return targets;
      },
      { initialProps: first, wrapper: StrictMode }
    );
    const initial = result.current;
    publish.mockClear();

    rerender({ ...first, profile: { id: 'profile', label: 'Artist' } });
    rerender({
      ...first,
      messages: [
        {
          id: 'a',
          streamRevision: 1,
          parts: [{ type: 'text', text: '@release:one[One] Streaming prose' }],
        },
      ],
    });
    expect(result.current).toBe(initial);
    expect(publish).not.toHaveBeenCalled();

    rerender({
      ...first,
      messages: [
        {
          id: 'a',
          streamRevision: 2,
          parts: [{ type: 'text', text: '@release:one[Renamed]' }],
        },
      ],
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(result.current[0].label).toBe('Renamed');

    rerender({ ...first, conversationKey: 'two', messages: [] });
    expect(result.current).toEqual([]);
    expect(publish).toHaveBeenCalledTimes(2);

    rerender({
      conversationKey: null,
      messages: [
        {
          id: 'a',
          streamRevision: 0,
          parts: [{ type: 'text', text: '@track:new[New]' }],
        },
      ],
    });
    expect(result.current).toEqual([
      expect.objectContaining({ kind: 'track', id: 'new' }),
    ]);
    expect(publish).toHaveBeenCalledTimes(3);
  });
});
