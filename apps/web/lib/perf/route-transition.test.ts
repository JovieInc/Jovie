import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
  },
}));

import { track } from '@/lib/analytics';
import {
  __resetRouteTransitionStateForTests,
  completeRouteTransition,
  markRouteTransitionIntent,
  toRouteId,
} from '@/lib/perf/route-transition';

async function flushDoubleRaf() {
  // completeRouteTransition schedules work via two nested rAF calls.
  await new Promise(resolve => requestAnimationFrame(resolve));
  await new Promise(resolve => requestAnimationFrame(resolve));
}

describe('route-transition', () => {
  beforeEach(() => {
    __resetRouteTransitionStateForTests();
    vi.clearAllMocks();
    performance.clearMarks();
    performance.clearMeasures();
  });

  afterEach(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });

  describe('toRouteId', () => {
    it('keeps static segments as-is', () => {
      expect(toRouteId('/app/dashboard/releases')).toBe(
        '/app/dashboard/releases'
      );
    });

    it('redacts numeric id segments', () => {
      expect(toRouteId('/app/library/12345')).toBe('/app/library/:id');
    });

    it('redacts UUID segments', () => {
      expect(
        toRouteId('/app/releases/550e8400-e29b-41d4-a716-446655440000')
      ).toBe('/app/releases/:id');
    });

    it('redacts long opaque tokens that contain a digit', () => {
      expect(toRouteId('/app/chat/cjld2cyuq0000t3rmniod1foy')).toBe(
        '/app/chat/:id'
      );
    });

    it('does not redact ordinary route words', () => {
      expect(toRouteId('/app/dashboard/notifications')).toBe(
        '/app/dashboard/notifications'
      );
    });

    it('normalizes the root path', () => {
      expect(toRouteId('/')).toBe('/');
      expect(toRouteId('')).toBe('/');
    });
  });

  describe('markRouteTransitionIntent + completeRouteTransition', () => {
    it('reports a route_transition measure when the pathname changes', async () => {
      markRouteTransitionIntent('/app/dashboard/releases');
      completeRouteTransition('/app/dashboard/audience');

      await flushDoubleRaf();

      expect(track).toHaveBeenCalledWith(
        'route_transition',
        expect.objectContaining({
          fromRoute: '/app/dashboard/releases',
          toRoute: '/app/dashboard/audience',
          durationMs: expect.any(Number),
        })
      );
    });

    it('redacts dynamic segments in the reported payload', async () => {
      markRouteTransitionIntent('/app/library/12345');
      completeRouteTransition('/app/library/67890');

      await flushDoubleRaf();

      // Same route id after redaction (:id -> :id) means no real route
      // change occurred, so nothing should be reported.
      expect(track).not.toHaveBeenCalled();
    });

    it('does not report when there is no pending intent', async () => {
      completeRouteTransition('/app/dashboard/releases');
      await flushDoubleRaf();

      expect(track).not.toHaveBeenCalled();
    });

    it('does not report a same-route transition (e.g. hash-only nav)', async () => {
      markRouteTransitionIntent('/app/dashboard/releases');
      completeRouteTransition('/app/dashboard/releases');

      await flushDoubleRaf();

      expect(track).not.toHaveBeenCalled();
    });

    it('clears the pending transition after completing so a stale intent is not reused', async () => {
      markRouteTransitionIntent('/app/dashboard/releases');
      completeRouteTransition('/app/dashboard/audience');
      await flushDoubleRaf();

      vi.mocked(track).mockClear();

      // No new markRouteTransitionIntent call — completing again should be a no-op.
      completeRouteTransition('/app/dashboard/library');
      await flushDoubleRaf();

      expect(track).not.toHaveBeenCalled();
    });
  });
});
