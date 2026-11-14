import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  JovieChat,
  useHeldUntilMounted,
} from '@/app/app/(shell)/chat/DeferredJovieChat';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

let releaseChunk: () => void = () => {};
const chunkReady = new Promise<void>(resolve => {
  releaseChunk = resolve;
});

/** The query each stub chat saw when it mounted, as JovieChat's auto-submit does. */
const queriesAtMount: (string | undefined)[] = [];

vi.mock('@/components/jovie/JovieChat', async () => {
  const { useEffect, useState } = await import('react');
  await chunkReady;
  return {
    JovieChat: ({ initialQuery }: { initialQuery?: string }) => {
      const [atMount] = useState(initialQuery);
      useEffect(() => {
        queriesAtMount.push(atMount);
      }, [atMount]);
      return <p data-testid='stub-chat'>Chat</p>;
    },
  };
});

describe('DeferredJovieChat', () => {
  it('shows an accessible skeleton, then mounts with the query the page already cleared', async () => {
    const { container, rerender } = render(
      <JovieChat initialQuery='find my fans' />
    );
    expect(screen.getByTestId('chat-loading')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expectNoA11yViolations(container);

    rerender(<JovieChat initialQuery={undefined} />);
    await act(async () => {
      releaseChunk();
      await chunkReady;
    });

    await screen.findByTestId('stub-chat');
    expect(queriesAtMount).toEqual(['find my fans']);
    await expectNoA11yViolations(container);
  });
});

describe('useHeldUntilMounted', () => {
  it('keeps the first query after the page clears it, until the chat mounts', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string | null }) => useHeldUntilMounted(value),
      { initialProps: { value: 'find my fans' as string | null } }
    );
    expect(result.current[0]).toBe('find my fans');

    rerender({ value: null });
    expect(result.current[0]).toBe('find my fans');

    act(() => result.current[1]());
    rerender({ value: null });
    expect(result.current[0]).toBeNull();
  });

  it('passes values straight through once mounted', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string | null }) => useHeldUntilMounted(value),
      { initialProps: { value: null as string | null } }
    );
    act(() => result.current[1]());
    rerender({ value: 'later' });
    expect(result.current[0]).toBe('later');
  });
});
