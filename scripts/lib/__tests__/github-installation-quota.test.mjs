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
import {
  isScorecardGraphqlTransient,
  MAX_SCORECARD_GRAPHQL_ATTEMPTS,
  MAX_SCORECARD_RESTARTS,
  parseGoDurationSeconds,
  planPoisonedScorecardRetry,
  planScorecardBuckets,
  planScorecardGraphqlRetry,
  runScorecardContainer,
  scorecardContainerEnv,
  scorecardDockerArgs,
  scorecardGraphqlBackoffSeconds,
  scorecardKillArgs,
  scorecardWaitFromLine,
  superviseScorecardRun,
  waitForScorecardBuckets,
} from '../scorecard-credential-guard.mjs';

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
    expect(security).toContain('scripts/lib/scorecard-credential-guard.mjs');
    expect(security).toContain(
      'ossf/scorecard-action@fa7117db83c52d787ae5a89f350999701505d78e'
    );
    expect(security).toContain(
      'ghcr.io/ossf/scorecard-action@sha256:1e1481c65fc2407d3fd6ab18a23c741eb4d1c0d9359ebafc4b3ab13aa61d8627'
    );
    expect(security).not.toContain('uses: ossf/scorecard-action');
    expect(security).toContain('timeout-minutes: 50');
    const scorecardJob = security.slice(
      security.indexOf('\n  scorecard:'),
      security.indexOf('\n  commit-signature-check:')
    );
    expect(scorecardJob).toContain(
      'scripts/lib/scorecard-credential-guard.mjs'
    );
    expect(scorecardJob).not.toContain('continue-on-error');
    expect(scorecardJob).not.toContain('ossf/scorecard-action@v');
  });
});

describe('scorecard credential guard', () => {
  const nowSeconds = 1_700_000_000;
  const incidentWait = '31m15.797571954s';
  const incidentLine = `level=info msg="Rate limit exceeded. Waiting ${incidentWait} to retry..."`;

  function resources(remaining, reset = nowSeconds + 60) {
    return {
      core: { remaining, reset },
      graphql: { remaining, reset },
      search: { remaining, reset },
      code_search: { remaining, reset },
    };
  }

  it('parses the Scorecard wait log before the poisoned retry', () => {
    expect(parseGoDurationSeconds(incidentWait)).toBeCloseTo(1875.797571954, 6);
    expect(scorecardWaitFromLine(incidentLine)).toEqual({
      kind: 'wait',
      waitSeconds: parseGoDurationSeconds(incidentWait),
    });
    expect(
      scorecardWaitFromLine('Retry-After header set. Waiting 12s to retry...')
    ).toMatchObject({ kind: 'wait', waitSeconds: 12 });
    expect(
      scorecardWaitFromLine('Rate limit exceeded. Retrying...')
    ).toMatchObject({ kind: 'retry-started', waitSeconds: null });
    expect(parseGoDurationSeconds('500ms')).toBeCloseTo(0.5, 6);
    expect(parseGoDurationSeconds('-1s')).toBeNull();
  });

  it('waits the empty bucket and still proceeds on a last remaining point', () => {
    const open = resources(1);
    expect(planScorecardBuckets({ nowSeconds, resources: open })).toMatchObject(
      { action: 'proceed', waitSeconds: 0 }
    );

    const codeSearchReset = nowSeconds + 40;
    const plan = planScorecardBuckets({
      nowSeconds,
      resources: {
        ...resources(20),
        code_search: { remaining: 0, reset: codeSearchReset },
      },
    });
    expect(plan).toMatchObject({
      action: 'wait',
      bucket: 'code_search',
      waitSeconds: 41,
    });
  });

  it('fails closed when a bucket wait would outlast the token', () => {
    const plan = planScorecardBuckets({
      nowSeconds,
      resources: {
        ...resources(10),
        core: {
          remaining: 0,
          reset: nowSeconds + INSTALLATION_TOKEN_LIFETIME_SECONDS,
        },
      },
    });
    expect(plan.action).toBe('fail');
    expect(plan.bucket).toBe('core');
    expect(plan.message).toContain('401');
  });

  it('kills the rate-limit wait and restarts one fresh process', async () => {
    const waits = [];
    const removed = [];
    const attempts = [];
    const incidentSeconds = parseGoDurationSeconds(incidentWait);
    const code = await superviseScorecardRun({
      now: () => nowSeconds * 1000,
      startedAt: nowSeconds * 1000,
      sleep: async ms => {
        waits.push(ms);
      },
      removeResults: async () => {
        removed.push(true);
      },
      runAttempt: async attempt => {
        attempts.push(attempt);
        if (attempt === 1) {
          return {
            poisoned: true,
            killed: true,
            kind: 'wait',
            waitSeconds: incidentSeconds,
            code: 137,
          };
        }
        return { poisoned: false, code: 0 };
      },
    });
    const plan = planPoisonedScorecardRetry({
      nowSeconds,
      waitSeconds: incidentSeconds,
      elapsedSeconds: 0,
    });
    expect(code).toBe(0);
    expect(attempts).toEqual([1, 2]);
    expect(removed).toEqual([true]);
    expect(waits).toEqual([plan.waitSeconds * 1000]);
    expect(plan.action).toBe('wait');
  });

  it('does not restart when a second exhaustion wait would 401', async () => {
    const attempts = [];
    const waits = [];
    const logs = [];
    const incidentSeconds = parseGoDurationSeconds(incidentWait);
    const code = await superviseScorecardRun({
      now: () => nowSeconds * 1000,
      startedAt: nowSeconds * 1000,
      log: message => logs.push(message),
      sleep: async ms => {
        waits.push(ms);
      },
      runAttempt: async attempt => {
        attempts.push(attempt);
        return {
          poisoned: true,
          killed: true,
          kind: 'wait',
          waitSeconds: incidentSeconds,
          code: 137,
        };
      },
    });
    expect(code).toBe(1);
    expect(attempts.length).toBeLessThanOrEqual(MAX_SCORECARD_RESTARTS);
    expect(logs.join('\n')).toContain('401');
    expect(waits.length).toBe(attempts.length - 1);
  });

  it('fails visibly when the retry already started or the kill missed', async () => {
    const logs = [];
    const waits = [];
    const retryStarted = await superviseScorecardRun({
      now: () => nowSeconds * 1000,
      startedAt: nowSeconds * 1000,
      log: message => logs.push(message),
      sleep: async ms => {
        waits.push(ms);
      },
      runAttempt: async () => ({
        poisoned: true,
        killed: true,
        kind: 'retry-started',
        waitSeconds: null,
        code: 1,
      }),
    });
    expect(retryStarted).toBe(1);
    expect(waits).toEqual([]);
    expect(logs.join('\n')).toContain('second Authorization header');

    const missed = await superviseScorecardRun({
      now: () => nowSeconds * 1000,
      startedAt: nowSeconds * 1000,
      log: message => logs.push(message),
      sleep: async ms => {
        waits.push(ms);
      },
      runAttempt: async () => ({
        poisoned: true,
        killed: false,
        kind: 'wait',
        waitSeconds: 10,
        sawBadCredentials: true,
        code: 1,
      }),
    });
    expect(missed).toBe(1);
    expect(waits).toEqual([]);
    expect(logs.join('\n')).toContain('401');
  });

  it('holds the preflight on the empty code_search bucket, then runs', async () => {
    const sleeps = [];
    const reads = [];
    const code = await waitForScorecardBuckets({
      now: () => nowSeconds * 1000,
      startedAt: nowSeconds * 1000,
      sleep: async ms => {
        sleeps.push(ms);
      },
      run: async () => {
        reads.push(true);
        const remaining = reads.length === 1 ? 0 : 8;
        return {
          code: 0,
          stdout: JSON.stringify({
            resources: {
              ...resources(8),
              code_search: {
                remaining,
                reset: nowSeconds + 30,
              },
            },
          }),
          stderr: '',
        };
      },
    });
    expect(code).toBe(0);
    expect(reads).toHaveLength(2);
    expect(sleeps).toEqual([31_000]);
  });

  it('keeps the job token out of the docker argv', () => {
    const token = 'ghs_example_token_value';
    const env = {
      GH_TOKEN: token,
      GITHUB_WORKSPACE: '/runner/work/Jovie/Jovie',
      GITHUB_EVENT_PATH: '/runner/work/_temp/_github_workflow/event.json',
      GITHUB_RUN_ID: '38976277555',
      GITHUB_RUN_ATTEMPT: '1',
      PATH: '/usr/bin',
    };
    const home = '/tmp/scorecard-home';
    const args = scorecardDockerArgs({ env, attempt: 1, home });
    expect(args.join('\n')).not.toContain(token);
    expect(args).toContain(
      'ghcr.io/ossf/scorecard-action@sha256:1e1481c65fc2407d3fd6ab18a23c741eb4d1c0d9359ebafc4b3ab13aa61d8627'
    );
    expect(args).toContain('--rm');
    expect(args).toContain('-e');
    expect(args).toContain('INPUT_REPO_TOKEN');
    expect(args).toContain('INPUT_INTERNAL_DEFAULT_TOKEN');
    expect(scorecardKillArgs('jovie-scorecard-1').join(' ')).not.toContain(
      token
    );
    const container = scorecardContainerEnv(env, home);
    expect(container.INPUT_REPO_TOKEN).toBe(token);
    expect(container.INPUT_INTERNAL_DEFAULT_TOKEN).toBe(token);
    expect(container.INPUT_PUBLISH_RESULTS).toBe('false');
    expect(container.INPUT_RESULTS_FORMAT).toBe('sarif');
    const source = readFileSync(
      resolve(repoRoot, 'scripts/lib/scorecard-credential-guard.mjs'),
      'utf8'
    );
    expect(source).not.toContain('gh pr merge');
  });

  it('kills the container from the stderr wait line before the retry', async () => {
    const token = 'ghs_example_token_value';
    const kills = [];
    const incidentSeconds = parseGoDurationSeconds(incidentWait);
    const outcome = await runScorecardContainer({
      env: {
        GH_TOKEN: token,
        GITHUB_WORKSPACE: '/runner/work/Jovie/Jovie',
        GITHUB_EVENT_PATH: '/runner/work/_temp/_github_workflow/event.json',
        GITHUB_RUN_ID: '38976277555',
        RUNNER_TEMP: '/tmp/scorecard-guard-test',
        PATH: '/usr/bin',
      },
      attempt: 1,
      run: async command => {
        kills.push(command);
        return { code: 0, stdout: '', stderr: '' };
      },
      spawnChild: () => {
        /** @type {Map<string, Array<(...args: unknown[]) => void>>} */
        const listeners = new Map();
        const stream = () => {
          /** @type {Map<string, Array<(...args: unknown[]) => void>>} */
          const streamListeners = new Map();
          return {
            /**
             * @param {string} event
             * @param {(...args: unknown[]) => void} listener
             */
            on(event, listener) {
              const list = streamListeners.get(event) ?? [];
              list.push(listener);
              streamListeners.set(event, list);
            },
            /**
             * @param {string} event
             * @param {unknown[]} args
             */
            emit(event, ...args) {
              for (const listener of streamListeners.get(event) ?? []) {
                listener(...args);
              }
            },
          };
        };
        const stdout = stream();
        const stderr = stream();
        const child = {
          stdout,
          stderr,
          /**
           * @param {string} event
           * @param {(...args: unknown[]) => void} listener
           */
          on(event, listener) {
            const list = listeners.get(event) ?? [];
            list.push(listener);
            listeners.set(event, list);
          },
          /**
           * @param {string} event
           * @param {unknown[]} args
           */
          emit(event, ...args) {
            for (const listener of listeners.get(event) ?? []) {
              listener(...args);
            }
          },
        };
        setImmediate(() => {
          stderr.emit(
            'data',
            Buffer.from('Rate limit exceeded. Waiting 31m15.')
          );
          stderr.emit(
            'data',
            Buffer.from(`${incidentWait.slice('31m15.'.length)} to retry...\n`)
          );
          setImmediate(() => child.emit('close', 137));
        });
        return child;
      },
    });
    expect(outcome).toMatchObject({
      poisoned: true,
      killed: true,
      kind: 'wait',
    });
    expect(outcome.waitSeconds).toBeCloseTo(incidentSeconds, 6);
    expect(kills).toHaveLength(1);
    expect(kills[0].join(' ')).toContain('kill --signal KILL');
    expect(kills[0].join(' ')).not.toContain(token);
    expect(kills[0].join(' ')).toContain('jovie-scorecard-38976277555');
  });
});

describe('scorecard GraphQL transient retry', () => {
  const nowSeconds = 1_700_000_000;
  // Run 39813671687 / job on be44a038, and the same sentence on 7509def6.
  const incident =
    'scorecard had an error: internal error: ListCommits:error during graphqlHandler.setup: internal error: githubv4.Query: Something went wrong while executing your query on 2026-10-22T16:24:06Z. Please include `8C41:29D669:C5F97:283791:6ADA38A1` when reporting this issue.';

  it('classifies only the GraphQL fault and a nearby 5xx', () => {
    expect(isScorecardGraphqlTransient(incident)).toBe(true);
    expect(
      isScorecardGraphqlTransient(
        'scorecard had an error: githubv4.Query: non-200 OK status code: 502 Bad Gateway body: ""'
      )
    ).toBe(true);
    expect(
      isScorecardGraphqlTransient(
        'internal error: graphqlHandler.setup: HTTP 503 Service Unavailable'
      )
    ).toBe(true);
    expect(
      isScorecardGraphqlTransient(
        'githubv4.Query: GitHub API 500 for /graphql: 500 Internal Server Error'
      )
    ).toBe(true);
    expect(
      isScorecardGraphqlTransient(
        'scorecard had an error: 504 Gateway Timeout while executing the query'
      )
    ).toBe(true);

    expect(isScorecardGraphqlTransient('')).toBe(false);
    expect(
      isScorecardGraphqlTransient(
        'level=info msg="Rate limit exceeded. Waiting 31m15s to retry..."'
      )
    ).toBe(false);
    expect(
      isScorecardGraphqlTransient(
        'scorecard had an error: internal error: ListCommits: 401 Bad credentials'
      )
    ).toBe(false);
    expect(
      isScorecardGraphqlTransient(
        'scorecard had an error: internal error: probe CI-Tests failed'
      )
    ).toBe(false);
    expect(
      isScorecardGraphqlTransient('Resource not accessible by integration')
    ).toBe(false);
    expect(
      isScorecardGraphqlTransient('Something went wrong with the pinned image')
    ).toBe(false);
    expect(isScorecardGraphqlTransient('HTTP 404')).toBe(false);
    expect(isScorecardGraphqlTransient('HTTP 429')).toBe(false);
    expect(isScorecardGraphqlTransient('HTTP 502')).toBe(false);
    expect(
      isScorecardGraphqlTransient(
        'dial tcp 140.82.112.3:443: connect: connection refused'
      )
    ).toBe(false);
    expect(scorecardGraphqlBackoffSeconds(1)).toBe(15);
    expect(scorecardGraphqlBackoffSeconds(2)).toBe(30);
    expect(MAX_SCORECARD_GRAPHQL_ATTEMPTS).toBe(3);
  });

  it('retries the transient twice, then keeps a clean Scorecard result', async () => {
    const waits = [];
    const removed = [];
    const attempts = [];
    const code = await superviseScorecardRun({
      now: () => nowSeconds * 1000,
      startedAt: nowSeconds * 1000,
      sleep: async ms => {
        waits.push(ms);
      },
      removeResults: async () => {
        removed.push(true);
      },
      runAttempt: async attempt => {
        attempts.push(attempt);
        if (attempt < 3) return { poisoned: false, code: 1, output: incident };
        return { poisoned: false, code: 0, output: '' };
      },
    });
    const first = planScorecardGraphqlRetry({
      nowSeconds,
      elapsedSeconds: 0,
      backoffSeconds: 15,
    });
    const second = planScorecardGraphqlRetry({
      nowSeconds,
      elapsedSeconds: first.waitSeconds,
      backoffSeconds: 30,
    });
    expect(code).toBe(0);
    expect(attempts).toEqual([1, 2, 3]);
    expect(removed).toEqual([true, true]);
    expect(waits).toEqual([
      first.waitSeconds * 1000,
      second.waitSeconds * 1000,
    ]);
    expect(first.action).toBe('wait');
    expect(second.action).toBe('wait');
  });

  it('fails a non-GraphQL Scorecard error on the first exit', async () => {
    const waits = [];
    const attempts = [];
    const code = await superviseScorecardRun({
      now: () => nowSeconds * 1000,
      startedAt: nowSeconds * 1000,
      sleep: async ms => {
        waits.push(ms);
      },
      runAttempt: async attempt => {
        attempts.push(attempt);
        return {
          poisoned: false,
          code: 1,
          output:
            'scorecard had an error: internal error: probe CI-Tests failed',
        };
      },
    });
    expect(code).toBe(1);
    expect(attempts).toEqual([1]);
    expect(waits).toEqual([]);
  });

  it('stops after three GraphQL faults instead of skipping the scan', async () => {
    const logs = [];
    const attempts = [];
    const code = await superviseScorecardRun({
      now: () => nowSeconds * 1000,
      startedAt: nowSeconds * 1000,
      log: message => logs.push(message),
      sleep: async () => {},
      runAttempt: async attempt => {
        attempts.push(attempt);
        return { poisoned: false, code: 1, output: incident };
      },
    });
    expect(code).toBe(1);
    expect(attempts).toEqual([1, 2, 3]);
    expect(logs.join('\n')).toContain(
      `on all ${MAX_SCORECARD_GRAPHQL_ATTEMPTS} attempts`
    );
    expect(logs.join('\n')).not.toContain('continue-on-error');
  });

  it('refuses a GraphQL retry that would pass the token lifetime', async () => {
    const elapsed =
      INSTALLATION_TOKEN_LIFETIME_SECONDS - SCORECARD_TOKEN_MARGIN_SECONDS;
    const logs = [];
    const waits = [];
    const code = await superviseScorecardRun({
      now: () => nowSeconds * 1000,
      startedAt: (nowSeconds - elapsed) * 1000,
      log: message => logs.push(message),
      sleep: async ms => {
        waits.push(ms);
      },
      runAttempt: async () => ({ poisoned: false, code: 1, output: incident }),
    });
    const plan = planScorecardGraphqlRetry({
      nowSeconds,
      elapsedSeconds: elapsed,
      backoffSeconds: 15,
    });
    expect(plan.action).toBe('fail');
    expect(code).toBe(1);
    expect(waits).toEqual([]);
    expect(logs.join('\n')).toContain('token lifetime');
    expect(logs.join('\n')).toContain('401');
  });

  it('keeps the GraphQL fault in the container log for the classifier', async () => {
    const outcome = await runScorecardContainer({
      env: {
        GH_TOKEN: 'ghs_example_token_value',
        GITHUB_WORKSPACE: '/runner/work/Jovie/Jovie',
        GITHUB_EVENT_PATH: '/runner/work/_temp/_github_workflow/event.json',
        GITHUB_RUN_ID: '39813671687',
        RUNNER_TEMP: '/tmp/scorecard-guard-graphql',
        PATH: '/usr/bin',
      },
      attempt: 1,
      run: async () => ({ code: 0, stdout: '', stderr: '' }),
      spawnChild: () => {
        /** @type {Map<string, Array<(...args: unknown[]) => void>>} */
        const listeners = new Map();
        const stream = () => {
          /** @type {Map<string, Array<(...args: unknown[]) => void>>} */
          const streamListeners = new Map();
          return {
            /**
             * @param {string} event
             * @param {(...args: unknown[]) => void} listener
             */
            on(event, listener) {
              const list = streamListeners.get(event) ?? [];
              list.push(listener);
              streamListeners.set(event, list);
            },
            /**
             * @param {string} event
             * @param {unknown[]} args
             */
            emit(event, ...args) {
              for (const listener of streamListeners.get(event) ?? []) {
                listener(...args);
              }
            },
          };
        };
        const stderr = stream();
        const child = {
          stdout: stream(),
          stderr,
          /**
           * @param {string} event
           * @param {(...args: unknown[]) => void} listener
           */
          on(event, listener) {
            const list = listeners.get(event) ?? [];
            list.push(listener);
            listeners.set(event, list);
          },
          /**
           * @param {string} event
           * @param {unknown[]} args
           */
          emit(event, ...args) {
            for (const listener of listeners.get(event) ?? []) {
              listener(...args);
            }
          },
        };
        setImmediate(() => {
          stderr.emit('data', Buffer.from(`${incident}\n`));
          setImmediate(() => child.emit('close', 1));
        });
        return child;
      },
    });
    expect(outcome).toMatchObject({ poisoned: false, code: 1 });
    expect(isScorecardGraphqlTransient(outcome.output)).toBe(true);
    expect(outcome.output).not.toContain('ghs_example_token_value');
  });
});
