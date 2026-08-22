import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/hud/shipping-state/route';
import { OPERATIONAL_TRUTH_STATES } from '@/lib/ovie/program';
import {
  applyShippingStateRead,
  bindShippingStateSourceForTests,
  countViewFromMeasurement,
  createShippingMachine,
  expireShippingStateIfNeeded,
  matchesShippingIdentity,
  parseShippingStateProjection,
  readShippingStateSource,
  resetShippingStateSource,
  SHIPPING_STATE_FRESHNESS_BUDGET_MS,
  SHIPPING_STATE_SCHEMA,
  summarizeFreshnessSamples,
} from '@/lib/ovie/shipping-state';

const T0 = Date.parse('2026-08-22T12:00:00.000Z');
const mockAuthorizeHud = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/hud', () => ({ authorizeHud: mockAuthorizeHud }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

function projection(overrides: Record<string, unknown> = {}) {
  return {
    schema: SHIPPING_STATE_SCHEMA,
    projectionId: 'proj-1',
    sequence: 4,
    source: { identity: 'gem-ubuntu', revision: 'rev-4' },
    entity: { id: 'jovie-main' },
    sourceTime: '2026-08-22T12:00:00.000Z',
    freshnessDeadlineAt: '2026-08-22T12:00:08.000Z',
    completeness: 'complete',
    correlation: { eventId: 'corr-4' },
    counts: { queued: { value: 2, measurement: 'measured' } },
    pipeline: { productionVerified: { value: 0, measurement: 'measured' } },
    ...overrides,
  };
}

describe('ovie.shipping-state.v1', () => {
  afterEach(() => resetShippingStateSource());

  it('covers truth enums, zeros, sequence, clock, match, budget, and the read API', async () => {
    const parsed = parseShippingStateProjection(projection());
    expect(parsed.ok).toBe(true);
    expect(countViewFromMeasurement(0, 'not_measured').value).toBeNull();
    const apply = (
      read: Parameters<typeof applyShippingStateRead>[1],
      prev = createShippingMachine()
    ) => applyShippingStateRead(prev, read, T0);
    const healthy = apply({ kind: 'projection', payload: projection() });
    const disconnected = apply({ kind: 'disconnected' }, healthy);
    expect({
      fresh: healthy.view.truth,
      stale: apply({
        kind: 'projection',
        payload: projection({
          freshnessDeadlineAt: '2026-08-22T11:59:00.000Z',
        }),
      }).view.truth,
      disconnected: disconnected.view.truth,
      unavailable: apply({ kind: 'unavailable', reason: 'u' }).view.truth,
      unauthorized: apply({ kind: 'unauthorized' }, healthy).view.truth,
      degraded: apply({
        kind: 'projection',
        payload: projection({ completeness: 'partial' }),
      }).view.truth,
      unknown: apply(
        { kind: 'projection', payload: { schema: 'nope' } },
        healthy
      ).view.truth,
      failure: apply({ kind: 'error', reason: 'x' }, healthy).view.truth,
      recovery: apply(
        {
          kind: 'projection',
          payload: projection({ sequence: 5, projectionId: 'p5' }),
        },
        disconnected
      ).view.truth,
    }).toEqual(
      Object.fromEntries(OPERATIONAL_TRUTH_STATES.map(state => [state, state]))
    );
    expect(disconnected.view.queued.value).toBe(2);
    expect(
      apply(
        { kind: 'projection', payload: projection({ sequence: 3 }) },
        healthy
      ).view.flags.has('replay')
    ).toBe(true);
    expect(
      expireShippingStateIfNeeded(healthy, T0 + 20_000).view.sourceTime
    ).toBe('2026-08-22T12:00:00.000Z');
    expect(
      matchesShippingIdentity(healthy.view, {
        correlationId: 'corr-4',
        entityId: 'jovie-main',
        revision: 'rev-4',
      })
    ).toBe(true);
    expect(
      summarizeFreshnessSamples([1200, 4000, 8800]).p95
    ).toBeLessThanOrEqual(SHIPPING_STATE_FRESHNESS_BUDGET_MS);
    bindShippingStateSourceForTests({
      identity: 'test-ubuntu',
      read: async () => ({ kind: 'disconnected' }),
    });
    expect((await readShippingStateSource()).kind).toBe('disconnected');
    mockAuthorizeHud.mockResolvedValueOnce({
      ok: false,
      reason: 'unauthorized',
    });
    expect(
      (await GET(new NextRequest('http://localhost/api/hud/shipping-state')))
        .status
    ).toBe(401);
    mockAuthorizeHud.mockResolvedValueOnce({ ok: true, mode: 'kiosk' });
    const ok = await GET(
      new NextRequest(
        'http://localhost/api/hud/shipping-state?path=/etc/passwd'
      )
    );
    expect(ok.status).toBe(200);
  });
});
