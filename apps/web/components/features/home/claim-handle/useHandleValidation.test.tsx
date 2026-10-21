import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchAvailability = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queries/fetch', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/queries/fetch')>()),
  fetchWithTimeout: fetchAvailability,
}));

import { useHandleValidation } from './useHandleValidation';

describe('homepage availability observations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchAvailability.mockReset();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('removes the previous handle answer immediately and ignores a late response', async () => {
    let finishOld!: (value: { available: boolean }) => void;
    fetchAvailability.mockReturnValueOnce(
      new Promise(resolve => {
        finishOld = resolve;
      })
    );
    fetchAvailability.mockResolvedValueOnce({ available: false });
    const { result, rerender } = renderHook(
      ({ handle }) => useHandleValidation(handle),
      {
        initialProps: { handle: 'late-observation-one' },
      }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(401);
    });
    rerender({ handle: 'late-observation-two' });
    expect(result.current.checkingAvail).toBe(true);
    expect(result.current.available).toBeNull();
    await act(async () => {
      finishOld({ available: true });
    });
    expect(result.current.available).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(401);
    });
    expect(result.current.available).toBe(false);
  });

  it('expires an unchanged availability observation instead of implying a reservation', async () => {
    fetchAvailability.mockResolvedValueOnce({ available: true });
    const { result } = renderHook(() =>
      useHandleValidation('expiring-observation')
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(401);
    });
    expect(result.current.available).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_001);
    });
    expect(result.current.available).toBeNull();
    expect(result.current.availError).toContain('expired');
    expect(fetchAvailability).toHaveBeenCalledTimes(1);
  });
});
