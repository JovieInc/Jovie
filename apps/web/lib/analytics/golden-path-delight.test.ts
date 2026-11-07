import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: { execute: vi.fn().mockRejectedValue(new Error('db down')) },
}));
vi.mock('@/lib/server-analytics', () => ({ trackServerEvent: vi.fn() }));

import {
  buildDelightReport,
  DELIGHT_METRICS,
  DELIGHT_MIN_SAMPLE,
} from './golden-path-delight';
import {
  buildSummerFunnelResponse,
  getDelightInput,
} from './signup-funnel.server';

const metric = (report: ReturnType<typeof buildDelightReport>, id: string) =>
  report.metrics.find(entry => entry.id === id);

describe('buildDelightReport', () => {
  it('judges time-to-wow against p50 and p95 targets', () => {
    const fast = buildDelightReport({
      timeToWowSeconds: { samples: 21, p50: 2.4, p95: 6 },
      wowReach: null,
      turnsBeforeWow: null,
    });
    expect(metric(fast, 'time_to_wow')?.status).toBe('on_target');
    const slow = buildDelightReport({
      timeToWowSeconds: { samples: 21, p50: 8, p95: 45 },
      wowReach: null,
      turnsBeforeWow: null,
    });
    expect(metric(slow, 'time_to_wow')?.status).toBe('off_target');
  });

  it('reads wow reach as a rate with a lower bound', () => {
    const report = buildDelightReport({
      timeToWowSeconds: null,
      wowReach: { started: 198, reached: 21 },
      turnsBeforeWow: { samples: 22, p50: 2, p95: 2 },
    });
    expect(metric(report, 'wow_reach')).toMatchObject({
      value: 0.1061,
      samples: 198,
      status: 'off_target',
    });
    expect(metric(report, 'turns_before_wow')?.status).toBe('on_target');
  });

  it('never reads a small sample or a missing producer as a result', () => {
    const report = buildDelightReport({
      timeToWowSeconds: { samples: DELIGHT_MIN_SAMPLE - 1, p50: 1, p95: 2 },
      wowReach: null,
      turnsBeforeWow: null,
    });
    expect(metric(report, 'time_to_wow')?.status).toBe('insufficient_sample');
    expect(report.uninstrumented).toEqual(
      DELIGHT_METRICS.filter(d => d.producer === null).map(d => d.id)
    );
    expect(report.uninstrumented).toContain('upgrade_to_first_use');
  });

  it('gives every metric a target with a prior-art basis', () => {
    for (const definition of DELIGHT_METRICS) {
      expect(definition.target.basis.length).toBeGreaterThan(10);
    }
  });
});

describe('Summer funnel delight', () => {
  it('carries the delight report when inputs are present', () => {
    const response = buildSummerFunnelResponse([], new Date(0), [], {
      timeToWowSeconds: null,
      wowReach: { started: 30, reached: 24 },
      turnsBeforeWow: null,
    });
    expect(response.delight?.contract).toBe('golden-path-delight/v1');
    expect(buildSummerFunnelResponse([], new Date(0)).delight).toBeUndefined();
  });

  it('returns empty inputs instead of throwing when the read fails', async () => {
    await expect(getDelightInput(new Date(0))).resolves.toEqual({
      timeToWowSeconds: null,
      wowReach: null,
      turnsBeforeWow: null,
    });
  });
});
