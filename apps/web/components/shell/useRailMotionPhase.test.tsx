import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRailMotionPhase } from './useRailMotionPhase';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));
afterEach(() => vi.useRealTimers());

describe('native sidebar phase timing', () => {
  it('settles collapse at 160ms and expansion at 220ms, canceling stale timers', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ open }) => useRailMotionPhase(open, open ? 220 : 160),
      { initialProps: { open: true } }
    );
    rerender({ open: false });
    expect(result.current).toBe('closing');
    act(() => vi.advanceTimersByTime(159));
    expect(result.current).toBe('closing');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('closed');
    rerender({ open: true });
    act(() => vi.advanceTimersByTime(219));
    expect(result.current).toBe('opening');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('open');
    rerender({ open: false });
    act(() => vi.advanceTimersByTime(80));
    rerender({ open: true });
    act(() => vi.advanceTimersByTime(80));
    expect(result.current).toBe('opening');
    act(() => vi.advanceTimersByTime(140));
    expect(result.current).toBe('open');
  });
});
