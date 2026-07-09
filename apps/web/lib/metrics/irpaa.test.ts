import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('server-only', () => ({}));

import { getIRPAA, getRolling30DayIRPAA } from './irpaa';
import {
  FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN,
  REVENUE_LIFT_WEIGHTS_VERSION,
  STREAMING_VALUE_WEIGHT_CENTS_PER_DSP_CLICK,
} from './revenue-lift-weights';

function mockAggregateRow(row: Record<string, number>) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([row]),
    }),
  });
}

const window = {
  start: new Date('2026-06-01T00:00:00.000Z'),
  end: new Date('2026-07-01T00:00:00.000Z'),
};

describe('getIRPAA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes IRPAA as total dollarized lift divided by active artists', async () => {
    mockAggregateRow({
      activeArtists: 4,
      runCount: 10,
      gmvDeltaCents: 10_000,
      dspClickDelta: 200,
      newFansDelta: 8,
    });

    const result = await getIRPAA(window);

    const expectedLift =
      10_000 +
      200 * STREAMING_VALUE_WEIGHT_CENTS_PER_DSP_CLICK +
      8 * FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN;

    expect(result.activeArtists).toBe(4);
    expect(result.runCount).toBe(10);
    expect(result.totals).toEqual({
      gmvDeltaCents: 10_000,
      dspClickDelta: 200,
      newFansDelta: 8,
    });
    expect(result.totalRevenueLiftCents).toBe(expectedLift);
    expect(result.irpaaCents).toBe(Math.round(expectedLift / 4));
    expect(result.window).toEqual(window);
  });

  it('returns zero IRPAA when there are no active artists', async () => {
    mockAggregateRow({
      activeArtists: 0,
      runCount: 0,
      gmvDeltaCents: 0,
      dspClickDelta: 0,
      newFansDelta: 0,
    });

    const result = await getIRPAA(window);

    expect(result.activeArtists).toBe(0);
    expect(result.totalRevenueLiftCents).toBe(0);
    expect(result.irpaaCents).toBe(0);
  });

  it('labels every result with the weights snapshot (assumptions travel with the number)', async () => {
    mockAggregateRow({
      activeArtists: 1,
      runCount: 1,
      gmvDeltaCents: 500,
      dspClickDelta: 10,
      newFansDelta: 1,
    });

    const result = await getIRPAA(window);

    expect(result.weights.version).toBe(REVENUE_LIFT_WEIGHTS_VERSION);
    expect(result.weights.streamingValueWeightCentsPerDspClick).toBe(
      STREAMING_VALUE_WEIGHT_CENTS_PER_DSP_CLICK
    );
    expect(result.weights.fanCaptureLtvWeightCentsPerFan).toBe(
      FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN
    );
    expect(result.weights).toHaveProperty('lastValidatedAt');
  });

  it('rolling 30-day helper queries a trailing 30-day window', async () => {
    mockAggregateRow({
      activeArtists: 2,
      runCount: 3,
      gmvDeltaCents: 1_000,
      dspClickDelta: 0,
      newFansDelta: 0,
    });

    const now = new Date('2026-07-04T00:00:00.000Z');
    const result = await getRolling30DayIRPAA(now);

    expect(result.window.end).toEqual(now);
    expect(result.window.start).toEqual(
      new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    );
    expect(result.irpaaCents).toBe(500);
  });
});
