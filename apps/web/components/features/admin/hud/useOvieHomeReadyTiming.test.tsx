import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordOvieHomeReady = vi.hoisted(() => vi.fn());
vi.mock('@/lib/ovie/home/home-ready-timing', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/lib/ovie/home/home-ready-timing')
  >()),
  recordOvieHomeReady,
}));

import {
  resetOvieHomeReadyTimingForTests,
  useOvieHomeReadyTiming,
} from './useOvieHomeReadyTiming';

describe('useOvieHomeReadyTiming', () => {
  beforeEach(() => {
    recordOvieHomeReady.mockReset();
    resetOvieHomeReadyTimingForTests();
  });

  it('records once, when Home first becomes ready', () => {
    const { rerender } = renderHook(
      ({ ready }) => useOvieHomeReadyTiming(ready),
      { initialProps: { ready: false } }
    );
    expect(recordOvieHomeReady).not.toHaveBeenCalled();
    rerender({ ready: true });
    rerender({ ready: false });
    rerender({ ready: true });
    expect(recordOvieHomeReady).toHaveBeenCalledOnce();
    const [sample] = recordOvieHomeReady.mock.calls[0] ?? [];
    expect(sample).toMatchObject({ budgetMs: 2500 });
    expect(sample.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('measures a second mount in the same document from mount time', () => {
    renderHook(() => useOvieHomeReadyTiming(true)).unmount();
    renderHook(() => useOvieHomeReadyTiming(true));
    expect(recordOvieHomeReady).toHaveBeenCalledTimes(2);
    expect(recordOvieHomeReady.mock.calls[1]?.[0]).toMatchObject({
      navigation: 'soft',
    });
  });
});
