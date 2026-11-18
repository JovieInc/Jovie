import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAVIGATION_DROP_OFF_MS } from '@/lib/tracking/navigation-telemetry';
import { usePendingNavigation } from './use-pending-navigation';

describe('usePendingNavigation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds one pending destination until the URL commits after the minimum window', () => {
    const { result, rerender } = renderHook(
      ({ href }) => usePendingNavigation(href),
      { initialProps: { href: '/app' } }
    );
    act(() => result.current.beginPendingNavigation('audience'));
    expect(result.current.pendingNavigation?.itemId).toBe('audience');

    // A second click replaces, never stacks, the acknowledgment.
    act(() => result.current.beginPendingNavigation('library'));
    expect(result.current.pendingNavigation?.itemId).toBe('library');

    rerender({ href: '/app/library' });
    expect(result.current.pendingNavigation?.itemId).toBe('library');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.pendingNavigation).toBeNull();
  });

  it('recovers on the drop-off window when no URL ever commits', () => {
    const { result } = renderHook(() => usePendingNavigation('/app'));
    act(() => result.current.beginPendingNavigation('audience'));
    act(() => {
      vi.advanceTimersByTime(NAVIGATION_DROP_OFF_MS);
    });
    expect(result.current.pendingNavigation).toBeNull();
  });

  it('cancels only its own item and clears when connectivity drops', () => {
    const { result } = renderHook(() => usePendingNavigation('/app'));
    act(() => result.current.beginPendingNavigation('audience'));
    act(() => result.current.cancelPendingNavigation('library'));
    expect(result.current.pendingNavigation?.itemId).toBe('audience');
    act(() => {
      globalThis.dispatchEvent(new Event('offline'));
    });
    expect(result.current.pendingNavigation).toBeNull();
  });
});
