import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  jobSeconds,
  parseQuotaNotice,
  percentile,
  summarizeQuota,
} from '../api-quota-report.mjs';

describe('api quota report', () => {
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
