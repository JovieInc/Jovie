import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHeldUntilMounted } from '@/app/app/(shell)/chat/DeferredJovieChat';

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
