import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  jobSeconds,
  parseQuotaNotice,
  percentile,
  projectDrain,
  summarizeHeadroom,
  summarizeQuota,
} from '../api-quota-report.mjs';

describe('api quota report', () => {
  it('summarizes hourly headroom with the share of empty samples', () => {
    const hour = 1792551600; // hour aligned
    const sample = (bucket, remaining, offset) =>
      parseQuotaNotice(
        `bucket=${bucket} remaining=${remaining} limit=1000 used=1 reset=${hour + 3600 * (offset >= 3600 ? 2 : 1)} at=${hour + offset}`
      );
    expect(
      summarizeHeadroom([
        sample('github-token', 400, 0),
        sample('github-token', 0, 600),
        sample('github-token', 0, 1200),
        sample('github-token', 100, 3500),
        sample('github-token', 900, 3700),
        null,
      ])
    ).toEqual([
      {
        bucket: 'github-token',
        windowStart: new Date(hour * 1000).toISOString(),
        limit: 1000,
        samples: 4,
        minRemaining: 0,
        medianRemaining: 0,
        exhaustedSamples: 2,
        emptyShare: 0.5,
      },
      {
        bucket: 'github-token',
        windowStart: new Date((hour + 3600) * 1000).toISOString(),
        limit: 1000,
        samples: 1,
        minRemaining: 900,
        medianRemaining: 900,
        exhaustedSamples: 0,
        emptyShare: 0,
      },
    ]);
  });

  it('parses the enroll job quota notice for both buckets', () => {
    expect(
      parseQuotaNotice(
        'bucket=github-token remaining=0 limit=1000 used=1000 reset=1792555389 at=1792554000'
      )
    ).toEqual({
      bucket: 'github-token',
      remaining: 0,
      limit: 1000,
      used: 1000,
      reset: 1792555389,
      at: 1792554000,
    });
    expect(parseQuotaNotice('bucket=jovie-bot unavailable at=1')).toBeNull();
    expect(parseQuotaNotice(undefined)).toBeNull();
  });

  it('keeps the minimum remaining per bucket and 10-minute window', () => {
    const at = 1792554000; // 10-minute aligned
    const sample = (bucket, remaining, offset) =>
      parseQuotaNotice(
        `bucket=${bucket} remaining=${remaining} limit=5000 used=1 reset=1 at=${at + offset}`
      );
    expect(
      summarizeQuota([
        sample('github-token', 120, 0),
        sample('github-token', 0, 300),
        sample('jovie-bot', 4100, 30),
        sample('github-token', 900, 700),
        null,
      ])
    ).toEqual([
      {
        bucket: 'github-token',
        windowStart: at,
        minRemaining: 0,
        samples: 2,
        exhausted: 1,
      },
      {
        bucket: 'jovie-bot',
        windowStart: at,
        minRemaining: 4100,
        samples: 1,
        exhausted: 0,
      },
      {
        bucket: 'github-token',
        windowStart: at + 600,
        minRemaining: 900,
        samples: 1,
        exhausted: 0,
      },
    ]);
  });

  it('computes nearest-rank percentiles and job durations', () => {
    // 2026-10-21 sample: 23 healthy admissions plus the 166s and 1600s stalls.
    const seconds = [...Array(23).fill(8), 166, 1600];
    expect(percentile(seconds, 50)).toBe(8);
    expect(percentile(seconds, 95)).toBe(166);
    expect(percentile([], 50)).toBeNull();
    expect(
      jobSeconds({
        started_at: '2026-10-21T03:25:26Z',
        completed_at: '2026-10-21T03:52:06Z',
      })
    ).toBe(1600);
    expect(jobSeconds({ started_at: null, completed_at: null })).toBeNull();
  });

  it('samples quota in the enroll job without spending quota or failing it', () => {
    const workflow =
      /** @type {{ jobs: Record<string, { steps: Array<{ name?: string, run?: string, env?: Record<string, string>, 'continue-on-error'?: boolean }> }> }} */ (
        load(
          readFileSync(
            resolve(
              import.meta.dirname,
              '../../../.github/workflows/merge-queue-green-enroll.yml'
            ),
            'utf8'
          )
        )
      );
    const steps = workflow.jobs.enroll.steps;
    const sample = steps.find(step => step.name === 'Sample API quota');
    if (!sample?.run) throw new Error('enroll job is missing the quota sample');
    expect(sample['continue-on-error']).toBe(true);
    expect(sample.run).toContain('https://api.github.com/rate_limit');
    expect(sample.run).toContain('title=api-quota');
    expect(sample.env).toEqual({
      REPO_TOKEN: '${{ github.token }}',
      APP_TOKEN: '${{ steps.app-token.outputs.token }}',
    });
    const names = steps.map(step => step.name);
    expect(names.indexOf('Sample API quota')).toBeLessThan(
      names.indexOf('Enqueue green PRs')
    );
  });
});

describe('projectDrain', () => {
  const hour = 1_800_000_000 - (1_800_000_000 % 3600);
  const sample = (minute, remaining, bucket = 'github-token') => ({
    at: hour + minute * 60,
    bucket,
    remaining,
    limit: 5000,
  });

  it('alerts when the bucket is projected empty before the window resets', () => {
    const alerts = projectDrain(
      [sample(0, 5000), sample(5, 4000), sample(10, 3000)],
      hour + 10 * 60
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      bucket: 'github-token',
      remaining: 3000,
      ratePerMinute: 200,
    });
    // 3000 left at 200/min is empty 15 min from now, 35 min before the reset.
    expect(alerts[0].minutesEarly).toBe(35);
  });

  it('stays quiet when the bucket outlasts the window, is flat, or has too little data', () => {
    expect(
      projectDrain(
        [sample(0, 5000), sample(5, 4900), sample(10, 4800)],
        hour + 600
      )
    ).toEqual([]);
    expect(
      projectDrain(
        [sample(0, 3000), sample(5, 3000), sample(10, 3000)],
        hour + 600
      )
    ).toEqual([]);
    expect(
      projectDrain([sample(0, 5000), sample(10, 100)], hour + 600)
    ).toEqual([]);
    expect(
      projectDrain(
        [sample(0, 5000), sample(0.5, 4000), sample(1, 3000)],
        hour + 60
      )
    ).toEqual([]);
  });

  it('ignores samples from earlier windows and judges each bucket on its own', () => {
    const alerts = projectDrain(
      [
        { at: hour - 60, bucket: 'github-token', remaining: 1, limit: 5000 },
        sample(0, 5000, 'jovie-bot'),
        sample(5, 4990, 'jovie-bot'),
        sample(10, 4980, 'jovie-bot'),
        sample(0, 5000),
        sample(5, 2500),
        sample(10, 0),
      ],
      hour + 600
    );
    expect(alerts.map(alert => alert.bucket)).toEqual(['github-token']);
  });
});

describe('quota windows follow the reset epoch, not the clock hour', () => {
  // The installation's windows run :23 to :23 (reset 03:23:23 on 2026-10-26).
  const reset = 1_800_000_000 - (1_800_000_000 % 3600) + 23 * 60 + 23;
  const sample = (secondsBeforeReset, remaining, bucket = 'github-token') => ({
    at: reset - secondsBeforeReset,
    bucket,
    remaining,
    limit: 5000,
    used: 5000 - remaining,
    reset,
  });

  it('summarizeHeadroom groups by reset so a :23 window is not split at the hour', () => {
    const rows = summarizeHeadroom([
      sample(3000, 4800),
      sample(2000, 3000), // after the top of the hour, same window
      sample(100, 250),
      { ...sample(100, 4900), reset: reset + 3600, at: reset + 3500 }, // next window
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ samples: 3, minRemaining: 250 });
    expect(new Date(rows[0].windowStart).getTime() / 1000).toBe(reset - 3600);
  });

  it('projectDrain uses the newest sample reset as the window end', () => {
    // 1800 left falling 1000 per 5 min => empty in 9 min; reset is 20 min away.
    const alerts = projectDrain(
      [
        sample(1800, 4800),
        sample(1500, 3800),
        sample(1200, 2800),
        sample(900, 1800),
      ],
      reset - 900
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].resetAt).toBe(new Date(reset * 1000).toISOString());
    expect(alerts[0].minutesEarly).toBe(6);
  });

  it('projectDrain ignores samples from the previous window and a window that already reset', () => {
    const old = { ...sample(0, 10), reset: reset - 3600, at: reset - 3700 };
    expect(
      projectDrain(
        [old, sample(600, 4000), sample(400, 3990), sample(200, 3980)],
        reset - 100
      )
    ).toEqual([]);
    expect(
      projectDrain(
        [sample(600, 100), sample(400, 50), sample(200, 0)],
        reset + 10
      )
    ).toEqual([]);
  });
});
