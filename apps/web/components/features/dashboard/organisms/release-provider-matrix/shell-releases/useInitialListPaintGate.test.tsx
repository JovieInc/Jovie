import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INITIAL_LIST_PAINT_BUDGET_MS,
  useInitialListPaintGate,
} from './useInitialListPaintGate';

type Input = Parameters<typeof useInitialListPaintGate>[0];

const loading: Input = {
  shouldResolve: true,
  isLoading: true,
  failureCount: 0,
};

describe('useInitialListPaintGate', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds the first paint while eligibility loads, then releases it once settled', () => {
    const { result, rerender } = renderHook(
      (input: Input) => useInitialListPaintGate(input),
      { initialProps: loading }
    );
    expect(result.current).toBe(true);

    rerender({ ...loading, isLoading: false });
    expect(result.current).toBe(false);
  });

  it('never holds the list past the paint budget, even while the read still loads', () => {
    const { result } = renderHook(() => useInitialListPaintGate(loading));
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(INITIAL_LIST_PAINT_BUDGET_MS);
    });
    expect(result.current).toBe(false);
  });

  it('releases the list on the first failed attempt instead of waiting out retries', () => {
    const { result, rerender } = renderHook(
      (input: Input) => useInitialListPaintGate(input),
      { initialProps: loading }
    );
    rerender({ ...loading, failureCount: 1 });
    expect(result.current).toBe(false);
  });

  it('does not hold again once the list has painted', () => {
    const { result, rerender } = renderHook(
      (input: Input) => useInitialListPaintGate(input),
      { initialProps: { ...loading, shouldResolve: false } }
    );
    expect(result.current).toBe(false);

    rerender(loading);
    expect(result.current).toBe(false);
  });
});
