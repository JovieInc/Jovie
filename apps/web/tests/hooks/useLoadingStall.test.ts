import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLoadingStall } from '@/hooks/useLoadingStall';

describe('useLoadingStall', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false initially when not loaded', () => {
    const { result } = renderHook(() => useLoadingStall(false));
    expect(result.current).toBe(false);
  });

  it('returns false when already loaded', () => {
    const { result } = renderHook(() => useLoadingStall(true));
    expect(result.current).toBe(false);
  });

  it('returns true after default timeout (4000ms) when not loaded', () => {
    const { result } = renderHook(() => useLoadingStall(false));

    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current).toBe(true);
  });

  it('returns true after custom timeout when not loaded', () => {
    const { result } = renderHook(() => useLoadingStall(false, 2000));

    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1999);
    });

    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current).toBe(true);
  });

  it('resets to false when isLoaded becomes true', () => {
    const { result, rerender } = renderHook(
      ({ isLoaded }) => useLoadingStall(isLoaded),
      { initialProps: { isLoaded: false } }
    );

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current).toBe(true);

    rerender({ isLoaded: true });

    expect(result.current).toBe(false);
  });

  it('clears timeout on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    const { unmount } = renderHook(() => useLoadingStall(false));

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
