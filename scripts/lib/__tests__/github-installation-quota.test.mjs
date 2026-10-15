import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  failureDisposition,
  INSTALLATION_TOKEN_LIFETIME_SECONDS,
  isInstallationQuota403,
  planScorecardRateLimitWait,
  runScorecardRateLimitWait,
  SCORECARD_TOKEN_MARGIN_SECONDS,
  softFailCommand,
} from '../github-installation-quota.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');

describe('installation 403 detection', () => {
  it.each([
    'API rate limit exceeded for installation',
    'API rate limit exceeded for installation ID 12345.',
    'API rate limit already exceeded for installation ID 123.',
    'gh: API rate limit already exceeded for site ID installation. (HTTP 403)',
    'GitHub HTTP 403 for repos/JovieInc/Jovie/pulls?state=open: API rate limit exceeded for installation.',
  ])('matches %s', message => {
    expect(isInstallationQuota403(message)).toBe(true);
    expect(isInstallationQuota403(message, 403)).toBe(true);
  });

  it.each([
    ['Resource not accessible by integration', 403],
    ['API rate limit exceeded for user ID 1', 403],
    [
      'You have exceeded a secondary rate limit. Please wait a few minutes.',
      403,
    ],
    ['API rate limit exceeded for installation', 500],
    ['API rate limit exceeded for installation (HTTP 401)', null],
    ['HTTP 404 Not Found', 404],
    ['', null],
  ])('rejects %s', (message, status) => {
    expect(isInstallationQuota403(message, status)).toBe(false);
  });

  it('soft-fails only the installation 403 and keeps every other error fatal', () => {
    const quota = failureDisposition('Actions Cache GC', {
      message: 'Command failed: gh api repos/JovieInc/Jovie/actions/caches',
      stderr: 'API rate limit exceeded for installation ID 4242. (HTTP 403)\n',
    });
    expect(quota.code).toBe(0);
    expect(quota.softFailed).toBe(true);
    expect(quota.log).toContain('installation-quota-403');
    expect(quota.log).toContain('Actions Cache GC');

    const permission = failureDisposition(
      'Linear Sync',
      new Error('Resource not accessible by integration')
    );
    expect(permission).toMatchObject({ code: 1, softFailed: false });
    expect(permission.log).not.toContain('installation-quota-403');

    const server = failureDisposition('Mutation Diff', 'HTTP 500');
    expect(server.code).toBe(1);
    expect(server.softFailed).toBe(false);
  });

  it('soft-fails a child only when its output is an installation 403', async () => {
    const logs = [];
    const skipped = await softFailCommand(['gh', 'api', 'repos/x'], {
      log: message => logs.push(message),
      run: async () => ({
        code: 1,
        stdout: '',
        stderr:
          'API rate limit already exceeded for site ID installation. (HTTP 403)\n',
      }),
    });
    expect(skipped).toBe(0);
    expect(logs.join('\n')).toContain('installation-quota-403');
    expect(logs.join('\n')).toContain('Mutation Diff');

    const fatal = await softFailCommand(['gh', 'api', 'repos/x'], {
      log: message => logs.push(message),
      run: async () => ({
        code: 2,
        stdout: '',
        stderr: 'Resource not accessible by integration\n',
      }),
    });
    expect(fatal).toBe(2);
  });
});

describe('scorecard rate-limit wait', () => {
  const nowSeconds = 1_700_000_000;

  it('proceeds while quota remains', () => {
    expect(
      planScorecardRateLimitWait({ nowSeconds, remaining: 12, resetEpoch: 0 })
    ).toMatchObject({ action: 'proceed', waitSeconds: 0 });
  });

  it('waits only while the reset is inside the token lifetime', () => {
    const resetEpoch = nowSeconds + 60;
    expect(
      planScorecardRateLimitWait({
        nowSeconds,
        remaining: 0,
        resetEpoch,
      })
    ).toEqual({ action: 'wait', waitSeconds: 61, message: '' });
  });

  it('fails clearly when the wait would outlast the token', () => {
    const lifeLeft =
      INSTALLATION_TOKEN_LIFETIME_SECONDS - SCORECARD_TOKEN_MARGIN_SECONDS;
    const plan = planScorecardRateLimitWait({
      nowSeconds,
      remaining: 0,
      resetEpoch: nowSeconds + lifeLeft + 10,
    });
    expect(plan.action).toBe('fail');
    expect(plan.message).toContain('401');
    expect(plan.message).toContain('token lifetime');
  });

  it('fails clearly when the reset instant is missing', () => {
    const plan = planScorecardRateLimitWait({
      nowSeconds,
      remaining: 0,
      resetEpoch: null,
    });
    expect(plan.action).toBe('fail');
    expect(plan.message).toContain('x-ratelimit-reset');
    expect(plan.message).toContain('401');
  });

  it('does not sleep into a 401 when the reset is past the token', async () => {
    const sleeps = [];
    const logs = [];
    const code = await runScorecardRateLimitWait({
      log: message => logs.push(message),
      now: () => nowSeconds * 1000,
      sleep: async ms => {
        sleeps.push(ms);
      },
      run: async () => ({
        code: 0,
        stdout: JSON.stringify({
          resources: {
            core: {
              remaining: 0,
              reset: nowSeconds + INSTALLATION_TOKEN_LIFETIME_SECONDS,
            },
          },
        }),
        stderr: '',
      }),
    });
    expect(code).toBe(1);
    expect(sleeps).toEqual([]);
    expect(logs.join('\n')).toContain('401');
  });
});

describe('workflow wiring', () => {
  it('keeps cache GC, linear sync, mutation diff, and scorecard on the quota contract', () => {
    const cacheGc = readFileSync(
      resolve(repoRoot, 'scripts/lib/actions-cache-gc.mjs'),
      'utf8'
    );
    const linear = readFileSync(
      resolve(repoRoot, 'scripts/lib/linear-sync-on-merge.mjs'),
      'utf8'
    );
    const mutation = readFileSync(
      resolve(repoRoot, '.github/workflows/mutation-diff.yml'),
      'utf8'
    );
    const security = readFileSync(
      resolve(repoRoot, '.github/workflows/security.yml'),
      'utf8'
    );
    expect(cacheGc).toContain("failureDisposition('Actions Cache GC'");
    expect(linear).toContain("failureDisposition('Linear Sync'");
    expect(mutation).toContain(
      'github-installation-quota.mjs soft-fail -- bash .github/scripts/mutation-diff-resolve-files.sh'
    );
    expect(security).toContain('scorecard-wait');
    expect(security).toContain('timeout-minutes: 50');
  });
});
