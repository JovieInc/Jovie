import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  collectSamples,
  jobSeconds,
  parseQuotaNotice,
  percentile,
  projectDrain,
  sampleQuota,
  summarizeHeadroom,
  summarizeQuota,
} from '../api-quota-report.mjs';

describe('api quota report', () => {
  it('collects both sources in every requested hour even when newest runs crowd out older hours', () => {
    const runs = new Map();
    const queries = [];
    const samples = collectSamples(['--hours', '3', '--max-samples', '6'], {
      now: () => 1800010800000,
      read: path => {
        queries.push(path);
        if (path.includes('/workflows/')) {
          const range = new URL(
            `https://api.github.com/${path}`
          ).searchParams.get('created');
          const [from, to] = range.split('..').map(value => Date.parse(value));
          expect(to - from).toBe(3600000);
          const id = runs.size + 1;
          runs.set(id, {
            at: from / 1000 + 1800,
            name: path.includes('pr-fleet-rules')
              ? 'PR Fleet Rules'
              : 'Enqueue green PRs',
          });
          return { workflow_runs: [{ id }] };
        }
        const id = Number(path.match(/\/(\d+)\//)[1]);
        const run = runs.get(id);
        if (path.includes('/jobs?'))
          return { jobs: [{ id, name: run.name, conclusion: 'success' }] };
        return [
          {
            title: 'api-quota',
            message: `bucket=github-token remaining=100 limit=1000 used=900 reset=${run.at + 1800} at=${run.at}`,
          },
        ];
      },
    });
    expect(queries.filter(path => path.includes('/workflows/'))).toHaveLength(
      6
    );
    const windows = summarizeHeadroom(samples);
    expect(windows).toHaveLength(3);
    expect(windows.map(row => row.samples)).toEqual([2, 2, 2]);
    expect(windows.map(row => row.minRemaining)).toEqual([100, 100, 100]);
  });

  it('runs the workflow sampler with one shared-client read and survives command and JSON failures', () => {
    const root = resolve(import.meta.dirname, '../../..');
    const workflow = load(
      readFileSync(
        resolve(root, '.github/workflows/pr-fleet-rules.yml'),
        'utf8'
      )
    );
    const step = workflow.jobs.fleet.steps.find(
      step => step.name === 'Sample API quota'
    );
    expect(step.if).toBe('always()');
    expect(step['continue-on-error']).toBeUndefined();
    const dir = mkdtempSync(resolve(tmpdir(), 'quota-workflow-'));
    try {
      const calls = resolve(dir, 'calls');
      writeFileSync(
        resolve(dir, 'gh'),
        `#!${process.execPath}
const fs = require('node:fs');
fs.appendFileSync(process.env.QUOTA_TEST_CALLS, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.env.QUOTA_TEST_MODE === 'error') { console.error('fixture sensitive diagnostic'); process.exit(1); }
if (process.env.QUOTA_TEST_MODE === 'malformed') { console.log('not JSON'); process.exit(0); }
console.log(JSON.stringify({resources: Object.fromEntries(['core','graphql','search'].map(resource => [resource, {remaining: 0, limit: 5000, used: 5000, reset: 1800003600}]))}));
`,
        { mode: 0o755 }
      );
      for (const mode of ['ok', 'error', 'malformed']) {
        writeFileSync(calls, '');
        const output = execFileSync('bash', ['-c', step.run], {
          cwd: root,
          encoding: 'utf8',
          timeout: 20000,
          env: {
            ...process.env,
            PATH: `${dir}:${resolve(process.execPath, '..')}:${process.env.PATH}`,
            LANES_STATE: resolve(dir, mode),
            GH_TOKEN: 'quota-fixture-token',
            QUOTA_TEST_CALLS: calls,
            QUOTA_TEST_MODE: mode,
          },
        });
        const requests = readFileSync(calls, 'utf8')
          .trim()
          .split('\n')
          .map(JSON.parse);
        expect(requests).toHaveLength(1);
        expect(requests[0].filter(arg => arg !== '--include')).toEqual([
          'api',
          'rate_limit',
        ]);
        if (mode === 'ok') {
          expect(
            output
              .trim()
              .split('\n')
              .map(parseQuotaNotice)
              .map(row => row.resource)
          ).toEqual(['core', 'graphql', 'search']);
        } else {
          expect(output.trim()).toBe(
            '::warning::API quota sample unavailable.'
          );
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('samples every resource from one response and handles unavailable telemetry', () => {
    const lines = [];
    let reads = 0;
    sampleQuota({
      read: () => {
        reads++;
        return {
          resources: Object.fromEntries(
            ['core', 'graphql', 'search'].map((resource, index) => [
              resource,
              {
                remaining: index,
                limit: 5000,
                used: 5000 - index,
                reset: 1800003600,
              },
            ])
          ),
        };
      },
      emit: line => lines.push(line),
      now: () => 1800000000000,
    });
    expect(reads).toBe(1);
    expect(lines.map(parseQuotaNotice)).toEqual(
      ['core', 'graphql', 'search'].map((resource, index) => ({
        bucket: 'github-token',
        resource,
        remaining: index,
        limit: 5000,
        used: 5000 - index,
        reset: 1800003600,
        at: 1800000000,
      }))
    );
    for (const read of [
      () => {
        throw new Error('sensitive diagnostic');
      },
      () => ({}),
      () => ({ resources: { core: { remaining: 'invalid' } } }),
    ]) {
      const warnings = [];
      expect(() =>
        sampleQuota({ read, emit: line => warnings.push(line) })
      ).not.toThrow();
      expect(warnings).toEqual(['::warning::API quota sample unavailable.']);
    }
  });

  it('keeps resources separate within the same provider reset window', () => {
    const samples = ['core', 'graphql', 'search'].map((resource, index) =>
      parseQuotaNotice(
        `bucket=github-token resource=${resource} remaining=${index} limit=5000 used=1 reset=1800003600 at=1800000000`
      )
    );
    expect(
      summarizeHeadroom(samples).map(({ bucket, minRemaining }) => ({
        bucket,
        minRemaining,
      }))
    ).toEqual([
      { bucket: 'github-token', minRemaining: 0 },
      { bucket: 'github-token:graphql', minRemaining: 1 },
      { bucket: 'github-token:search', minRemaining: 2 },
    ]);
    expect(summarizeQuota(samples).map(row => row.bucket)).toEqual([
      'github-token',
      'github-token:graphql',
      'github-token:search',
    ]);
    const drainSamples = ['core', 'graphql', 'search'].flatMap(
      (resource, resourceIndex) =>
        [0, 5, 10].map((minute, index) => ({
          bucket: 'github-token',
          resource,
          at: 1800000000 + minute * 60,
          reset: 1800003600,
          remaining: [
            [100, 95, 90],
            [60, 30, 0],
            [30, 30, 30],
          ][resourceIndex][index],
        }))
    );
    expect(
      projectDrain(drainSamples, 1800000600).map(row => row.bucket)
    ).toEqual(['github-token:graphql']);
  });

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
      resource: 'core',
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
