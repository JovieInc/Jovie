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

  it('uses the HTTP endpoint as the required liveness signal', () => {
    const now = new Date(generatedAt);
    const exec = (file, args) => {
      if (file === 'curl') return JSON.stringify({ status: 'ok' });
      if (file === 'pgrep') return '42 gbrain serve --http';
      if (args[0] === 'sources') {
        return JSON.stringify({
          sources: [
            {
              id: 'code',
              page_count: 1,
              last_sync_at: generatedAt,
            },
          ],
        });
      }
      return JSON.stringify({ status: 'ok', health_score: 0.95 });
    };
    const healthy = collectGBrainHealthSummary({ exec, now });
    expect(healthy.status).toBe('healthy');
    expect(healthy.checks.map(result => result.name)).toEqual([
      'http-health',
      'doctor',
      'source-freshness',
      'serve-processes',
    ]);

    const down = collectGBrainHealthSummary({
      exec: () => {
        throw new Error('gbrain unavailable');
      },
      now,
    });
    expect(down.status).toBe('down');
    expect(down.checks).toHaveLength(4);
    expect(down.checks.every(result => !result.ok && result.detail)).toBe(true);
  });

  it('keeps a healthy server healthy when the advisory CLI doctor is unavailable', () => {
    const exec = (file, args) => {
      if (file === 'curl') return JSON.stringify({ status: 'ok' });
      if (file === 'pgrep') return '42 gbrain serve --http';
      if (args[0] === 'doctor') throw new Error('114 migrations pending');
      return JSON.stringify({
        sources: [{ id: 'code', page_count: 1, last_sync_at: generatedAt }],
      });
    };

    const summary = collectGBrainHealthSummary({
      exec,
      now: new Date(generatedAt),
    });

    expect(summary.status).toBe('healthy');
    expect(summary.checks[1]).toMatchObject({
      name: 'doctor',
      ok: false,
      required: false,
    });
  });

  it('flags stale sources and duplicate serve processes', () => {
    const exec = (file, args) => {
      if (file === 'curl') return JSON.stringify({ status: 'ok' });
      if (file === 'pgrep') {
        return '42 gbrain serve --http\n43 gbrain serve --http';
      }
      if (args[0] === 'sources') {
        return JSON.stringify({
          sources: [
            {
              id: 'code',
              page_count: 1,
              last_sync_at: '2026-07-02T00:00:00.000Z',
            },
          ],
        });
      }
      return JSON.stringify({ status: 'ok' });
    };

    const summary = collectGBrainHealthSummary({
      exec,
      now: new Date(generatedAt),
    });

    expect(summary.status).toBe('degraded');
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'source-freshness',
          ok: false,
          detail: expect.stringContaining('max 24h'),
        }),
        expect.objectContaining({ name: 'serve-processes', ok: false }),
      ])
    );
  });

  it('writes a stable gbrain page and notifies ops', async () => {
    const learned = [];
    const notifications = [];
    const exec = (file, args) => {
      if (file === 'curl') return JSON.stringify({ status: 'ok' });
      if (file === 'pgrep') return '42 gbrain serve --http';
      if (args[0] === 'sources') {
        return JSON.stringify({
          sources: [{ id: 'code', page_count: 1, last_sync_at: generatedAt }],
        });
      }
      return JSON.stringify({ status: 'ok', health_score: 0.91 });
    };
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
