import { describe, expect, it } from 'vitest';

import {
  buildGBrainHealthSummary,
  collectGBrainHealthSummary,
  runGBrainHealthSummary,
} from '../../hermes/jobs/gbrain-health-summary.ts';

const generatedAt = '2026-07-04T10:00:00.000Z';
const check = (name, ok, detail = 'ok') => ({
  name,
  ok,
  detail,
  durationMs: 1,
});

describe('gbrain health summary', () => {
  it('classifies probe results', () => {
    expect(
      buildGBrainHealthSummary({
        generatedAt,
        checks: [check('doctor', true)],
      }).status
    ).toBe('healthy');
    expect(
      buildGBrainHealthSummary({
        generatedAt,
        checks: [check('doctor', true), check('search', false, 'timeout')],
      }).status
    ).toBe('degraded');
    expect(buildGBrainHealthSummary({ generatedAt, checks: [] }).status).toBe(
      'down'
    );
  });

  it('handles healthy JSON, empty search, and command failures', () => {
    const now = new Date(generatedAt);
    const exec = (_file, args) =>
      args[0] === 'doctor'
        ? JSON.stringify({ status: 'ok', health_score: 0.95 })
        : '';
    const healthy = collectGBrainHealthSummary({ exec, now });
    expect(healthy.status).toBe('degraded');
    expect(healthy.checks[1].detail).toBe('empty output');

    const down = collectGBrainHealthSummary({
      exec: () => {
        throw new Error('gbrain unavailable');
      },
      now,
    });
    expect(down.status).toBe('down');
    expect(down.checks).toHaveLength(2);
    expect(down.checks.every(result => !result.ok && result.detail)).toBe(true);
  });

  it('writes a stable gbrain page and notifies ops', async () => {
    const learned = [];
    const notifications = [];
    const exec = (_file, args) =>
      args[0] === 'doctor'
        ? JSON.stringify({ status: 'ok', health_score: 0.91 })
        : 'smoke result';
    const run = await runGBrainHealthSummary({
      exec,
      learn: args => {
        learned.push(args);
        return true;
      },
      notifyOps: async text => {
        notifications.push(text);
      },
      now: new Date(generatedAt),
    });
    expect(run.gbrainOk).toBe(true);
    expect(learned[0]).toEqual(
      expect.objectContaining({ slug: 'ops/gbrain-health/latest' })
    );
    expect(notifications[0]).toContain('GBrain health summary: healthy');
  });
});
