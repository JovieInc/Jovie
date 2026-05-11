import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReleaseAwareNow } from '@/hooks/useReleaseAwareNow';

describe('useReleaseAwareNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial Date at mount when releaseDate is null', () => {
    const { result } = renderHook(() => useReleaseAwareNow(null));
    expect(result.current.toISOString()).toBe('2026-05-11T00:00:00.000Z');
  });

  it('does not schedule a re-render when releaseDate is already in the past', () => {
    const past = new Date('2026-05-10T00:00:00Z');
    const { result } = renderHook(() => useReleaseAwareNow(past));
    const initial = result.current;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(initial);
  });

  it('re-renders with a fresh Date when the release boundary passes', () => {
    const future = new Date('2026-05-11T00:00:30Z'); // 30s in the future
    const { result } = renderHook(() => useReleaseAwareNow(future));
    const initial = result.current;
    expect(initial.toISOString()).toBe('2026-05-11T00:00:00.000Z');

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    // After the boundary, the hook scheduled a fresh new Date()
    expect(result.current).not.toBe(initial);
    expect(result.current.getTime()).toBeGreaterThanOrEqual(future.getTime());
  });

  it('treats string releaseDate the same as a Date', () => {
    const future = '2026-05-11T00:00:30Z';
    const { result } = renderHook(() => useReleaseAwareNow(future));
    const initial = result.current;

    act(() => {
      vi.advanceTimersByTime(31_000);
    });

    expect(result.current).not.toBe(initial);
  });

  it('ignores invalid date strings', () => {
    const { result } = renderHook(() => useReleaseAwareNow('not-a-date'));
    const initial = result.current;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(initial);
  });
});
