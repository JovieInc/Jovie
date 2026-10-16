import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyGitHubFailure,
  commandWantsFileStdout,
  isGitHubInfrastructureFailure,
  NONE,
  PRIMARY,
  planRetry,
  retryAtFromHeaders,
  runWithGitHubRetry,
  SECONDARY,
  TRANSIENT,
} from '../github-rate-limit.mjs';

const NOW = 1_791_757_000_000;
const kind = failure => classifyGitHubFailure({ now: NOW, ...failure }).kind;

describe('classifyGitHubFailure', () => {
  it.each([
    // Live 2026-10-11 20:21Z wordings from PR Size Guard, Fork PR Gate and Source Validation.
    'GitHub API 403 for /repos/JovieInc/Jovie/compare/a...b: API rate limit exceeded for installation. If you reach out',
    'gh: API rate limit exceeded for installation. If you reach out to GitHub Support (HTTP 403)',
    'API rate limit already exceeded for installation ID 123.',
    'API rate limit already exceeded for site ID installation.',
    '::warning::github-quota-deferred: GitHub primary-rate-limit on attempt 3',
  ])('reads primary quota exhaustion: %s', message => {
    expect(kind({ message })).toBe(PRIMARY);
  });

  it('reads primary exhaustion from headers alone', () => {
    expect(
      kind({ status: 403, headers: { 'x-ratelimit-remaining': '0' } })
    ).toBe(PRIMARY);
  });

  it.each([
    [
      403,
      'You have exceeded a secondary rate limit. Please wait a few minutes',
    ],
    [403, 'You have triggered an abuse detection mechanism.'],
    [429, 'Too many requests'],
    [null, 'gh: Too many requests (HTTP 429)'],
  ])('reads secondary/abuse limits: %s %s', (status, message) => {
    expect(kind({ status, message })).toBe(SECONDARY);
  });

  it('treats a 403 carrying retry-after as a secondary limit', () => {
    expect(kind({ status: 403, headers: { 'retry-after': '60' } })).toBe(
      SECONDARY
    );
  });

  it.each([
    [502, ''],
    [null, 'gh: Server Error (HTTP 502)'],
    [null, 'GitHub API 503 for /repos/x/y/pulls/1: unavailable'],
    [null, "invalid character '<' looking for beginning of value"],
    [null, 'read: connection reset by peer'],
    [null, "We couldn't respond to your request in time."],
    [
      null,
      'GitHub API request failed for /x: The operation was aborted due to timeout',
    ],
  ])('reads transient server failures: %s %s', (status, message) => {
    expect(kind({ status, message })).toBe(TRANSIENT);
  });

  it.each([
    [403, 'Resource not accessible by integration'],
    [404, 'Not Found'],
    [422, 'Validation Failed'],
    [401, 'Bad credentials'],
    [null, 'PR #12 failed size merge-group policy'],
    [null, 'gh: Resource not accessible by integration (HTTP 403)'],
  ])('keeps real failures real: %s %s', (status, message) => {
    expect(kind({ status, message })).toBe(NONE);
    expect(classifyGitHubFailure({ status, message }).retryable).toBe(false);
  });

  it('exposes a text predicate for log readers', () => {
    expect(
      isGitHubInfrastructureFailure(
        'gh: API rate limit exceeded for installation.'
      )
    ).toBe(true);
    expect(isGitHubInfrastructureFailure('Error: 1600 lines > 1500 cap')).toBe(
      false
    );
  });
});

describe('retry timing', () => {
  it('waits until the quota reset or retry-after, whichever is later', () => {
    const resetSeconds = NOW / 1000 + 120;
    expect(
      retryAtFromHeaders(
        {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(resetSeconds),
        },
        NOW
      )
    ).toBe(resetSeconds * 1000 + 1000);
    expect(retryAtFromHeaders({ 'retry-after': '30' }, NOW)).toBe(NOW + 31_000);
    expect(
      retryAtFromHeaders({ 'x-ratelimit-remaining': '5' }, NOW)
    ).toBeNull();
  });

  it('plans a primary retry at the reset only inside the budget', () => {
    const classification = { kind: PRIMARY, retryAtMs: null };
    const quotaReset = { remaining: 0, resetMs: NOW + 60_000 };
    const plan = deadlineMs =>
      planRetry({
        classification,
        attempt: 1,
        attempts: 3,
        nowMs: NOW,
        deadlineMs,
        quotaReset,
      });
    expect(plan(NOW + 120_000)).toBe(61_000);
    expect(plan(NOW + 30_000)).toBeNull();
  });

  it('never retries real failures or past the attempt cap', () => {
    const base = { attempt: 1, attempts: 3, nowMs: NOW, deadlineMs: NOW + 1e9 };
    expect(
      planRetry({ ...base, classification: { kind: NONE, retryAtMs: null } })
    ).toBeNull();
    expect(
      planRetry({
        ...base,
        attempt: 3,
        classification: { kind: TRANSIENT, retryAtMs: null },
      })
    ).toBeNull();
  });
});

describe('runWithGitHubRetry', () => {
  const harness = outcomes => {
    const calls = [];
    const sleeps = [];
    let clock = NOW;
    return {
      calls,
      sleeps,
      options: {
        log: () => {},
        now: () => clock,
        run: async command => {
          calls.push(command);
          return outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
        },
        sleep: async ms => {
          sleeps.push(ms);
          clock += ms;
        },
      },
    };
  };
  const quota = {
    code: 1,
    stdout: '',
    stderr: 'gh: API rate limit exceeded for installation. (HTTP 403)',
  };
  const ok = { code: 0, stdout: '{"ok":true}', stderr: '' };

  it('sleeps through the reset and returns the successful read', async () => {
    const { calls, sleeps, options } = harness([quota, ok]);
    const result = await runWithGitHubRetry(['gh', 'api', 'x'], {
      ...options,
      maxWaitMs: 600_000,
      readReset: resource => {
        expect(resource).toBe('core');
        return { remaining: 0, resetMs: NOW + 90_000 };
      },
    });
    expect(result).toMatchObject({ code: 0, deferred: false });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([91_000]);
  });

  it('defers a quota failure past the budget without retrying', async () => {
    const { calls, options } = harness([quota]);
    const result = await runWithGitHubRetry(['gh', 'api', 'graphql'], {
      ...options,
      maxWaitMs: 60_000,
      readReset: resource => {
        expect(resource).toBe('graphql');
        return { remaining: 0, resetMs: NOW + 3_000_000 };
      },
    });
    expect(result).toMatchObject({ code: 1, deferred: true, kind: PRIMARY });
    expect(calls).toHaveLength(1);
  });

  it('returns a real failure at once and undeferred', async () => {
    const { calls, options } = harness([
      { code: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' },
    ]);
    const result = await runWithGitHubRetry(['gh', 'api', 'x'], {
      ...options,
      maxWaitMs: 600_000,
    });
    expect(result).toMatchObject({ code: 1, deferred: false, kind: NONE });
    expect(calls).toHaveLength(1);
  });

  it('gives gh a file for artifact zip bodies', async () => {
    expect(
      commandWantsFileStdout([
        'gh',
        'api',
        'repos/JovieInc/Jovie/actions/artifacts/1/zip',
      ])
    ).toBe(true);
    expect(
      commandWantsFileStdout([
        'gh',
        'api',
        'repos/JovieInc/Jovie/compare/a...b',
      ])
    ).toBe(false);
    const dir = mkdtempSync(join(tmpdir(), 'gh-zip-'));
    const bin = join(dir, 'gh.mjs');
    writeFileSync(
      bin,
      [
        'import { fstatSync } from "node:fs";',
        'const fifo = (fstatSync(1).mode & 0o170000) === 0o010000;',
        'if (fifo || process.env.GH_FORCE_TTY) {',
        '  process.stderr.write("refusing to output binary content (application/zip)\\n");',
        '  process.exit(1);',
        '}',
        'process.stdout.write(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x7a]));',
        '',
      ].join('\n')
    );
    chmodSync(bin, 0o755);
    const result = await runWithGitHubRetry(
      [process.execPath, bin, 'api', 'repos/o/r/actions/artifacts/9/zip'],
      {
        attempts: 1,
        maxWaitMs: 0,
        log: () => {},
        env: { ...process.env, GH_FORCE_TTY: '1' },
      }
    );
    expect(result.code).toBe(0);
    expect(Buffer.from(result.stdout)).toEqual(
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x7a])
    );
  });

  it('backs off transient 5xx up to the attempt cap', async () => {
    const { calls, sleeps, options } = harness([
      { code: 1, stdout: '', stderr: 'gh: Server Error (HTTP 502)' },
    ]);
    const result = await runWithGitHubRetry(['gh', 'api', 'x'], {
      ...options,
      attempts: 3,
      maxWaitMs: 600_000,
    });
    expect(result).toMatchObject({ deferred: true, kind: TRANSIENT });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([2_000, 4_000]);
  });
});
