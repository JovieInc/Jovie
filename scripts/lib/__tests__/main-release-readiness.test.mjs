import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkMainQueueProvenance,
  describeProvenance,
  findExactQueueProof,
  hasExactSuccessfulMergeGroupProof,
  MAX_REST_HOLD_MS,
  PROVENANCE_JOB_TIMEOUT_MINUTES,
  planGitHubRestHold,
  resolveMainSha,
  restHoldBudgetMs,
} from '../../../.github/scripts/verify-main-release-readiness.mjs';

const SHA = 'a'.repeat(40);
const SUPERSEDING_SHA = 'b'.repeat(40);

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  };
}

function exactSuccessfulRun(id = 41) {
  return {
    id,
    event: 'merge_group',
    head_sha: SHA,
    status: 'completed',
    conclusion: 'success',
  };
}

describe('main release readiness', () => {
  it('accepts only an exact successful merge-group PR Ready proof', () => {
    const run = exactSuccessfulRun();
    const successJobs = new Map([
      [
        run.id,
        [{ name: 'PR Ready', status: 'completed', conclusion: 'success' }],
      ],
    ]);

    expect(
      hasExactSuccessfulMergeGroupProof({
        sha: SHA,
        runs: [run],
        jobsByRun: successJobs,
      })
    ).toBe(true);
    expect(
      hasExactSuccessfulMergeGroupProof({
        sha: SUPERSEDING_SHA,
        runs: [run],
        jobsByRun: successJobs,
      })
    ).toBe(false);
    expect(
      hasExactSuccessfulMergeGroupProof({
        sha: SHA,
        runs: [{ ...run, event: 'push' }],
        jobsByRun: successJobs,
      })
    ).toBe(false);
    expect(
      hasExactSuccessfulMergeGroupProof({
        sha: SHA,
        runs: [run],
        jobsByRun: new Map([
          [
            run.id,
            [{ name: 'PR Ready', status: 'completed', conclusion: 'failure' }],
          ],
        ]),
      })
    ).toBe(false);
  });

  it('resolves one exact successful queue proof without polling', async () => {
    const calls = [];
    const fetchImpl = async url => {
      calls.push(url);
      if (url.includes('/actions/workflows/ci.yml/runs?')) {
        return jsonResponse({ workflow_runs: [exactSuccessfulRun()] });
      }
      if (url.includes('/actions/runs/41/jobs?')) {
        return jsonResponse({
          jobs: [
            { name: 'PR Ready', status: 'completed', conclusion: 'success' },
          ],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await expect(
      findExactQueueProof({
        repository: 'JovieInc/Jovie',
        sha: SHA,
        token: 'token',
        apiUrl: 'https://api.github.test',
        fetchImpl,
      })
    ).resolves.toEqual({ proven: true, runId: 41 });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('event=merge_group');
    expect(calls[0]).toContain(`head_sha=${SHA}`);
    expect(calls[0]).toContain('status=completed');
  });

  it('marks the current main SHA queue-proven in one pass', async () => {
    const calls = [];
    const fetchImpl = async url => {
      calls.push(url);
      if (url.includes('/commits/main')) {
        throw new Error('main must be resolved with git, not REST');
      }
      if (url.includes('/actions/workflows/ci.yml/runs?')) {
        return jsonResponse({ workflow_runs: [exactSuccessfulRun()] });
      }
      if (url.includes('/actions/runs/41/jobs?')) {
        return jsonResponse({
          jobs: [
            { name: 'PR Ready', status: 'completed', conclusion: 'success' },
          ],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await expect(
      checkMainQueueProvenance({
        repository: 'JovieInc/Jovie',
        sha: SHA,
        token: 'token',
        apiUrl: 'https://api.github.test/',
        fetchImpl,
        resolveMain: async () => SHA,
      })
    ).resolves.toEqual({
      isCurrent: true,
      queueProven: true,
      proofRunId: 41,
      currentMainSha: SHA,
      disposition: 'proven',
    });
    expect(calls).toHaveLength(2);
    expect(calls.some(url => url.includes('/commits/main'))).toBe(false);
  });

  it('authorizes the fail-closed fallback only when current proof is absent', async () => {
    const calls = [];
    const fetchImpl = async url => {
      calls.push(url);
      if (url.includes('/commits/main')) {
        throw new Error('main must be resolved with git, not REST');
      }
      return jsonResponse({ workflow_runs: [] });
    };

    await expect(
      checkMainQueueProvenance({
        repository: 'JovieInc/Jovie',
        sha: SHA,
        token: 'token',
        fetchImpl,
        resolveMain: async () => SHA,
      })
    ).resolves.toEqual({
      isCurrent: true,
      queueProven: false,
      proofRunId: null,
      currentMainSha: SHA,
      disposition: 'unproven',
    });
    expect(calls).toHaveLength(1);
  });

  it('neutralizes a superseded SHA without querying workflow runs', async () => {
    const calls = [];
    const fetchImpl = async url => {
      calls.push(url);
      throw new Error(`Unexpected URL: ${url}`);
    };

    await expect(
      checkMainQueueProvenance({
        repository: 'JovieInc/Jovie',
        sha: SHA,
        token: 'token',
        fetchImpl,
        resolveMain: async () => SUPERSEDING_SHA,
      })
    ).resolves.toEqual({
      isCurrent: false,
      queueProven: false,
      proofRunId: null,
      currentMainSha: SUPERSEDING_SHA,
      disposition: 'superseded',
    });
    expect(calls).toHaveLength(0);
  });

  it('fails closed when git cannot resolve main', async () => {
    await expect(
      checkMainQueueProvenance({
        repository: 'JovieInc/Jovie',
        sha: SHA,
        token: 'token',
        fetchImpl: async () => {
          throw new Error('REST must not run when git resolve fails');
        },
        resolveMain: async () => {
          throw new Error(
            'Could not resolve refs/heads/main for JovieInc/Jovie via git ls-remote.'
          );
        },
      })
    ).rejects.toThrow(/git ls-remote/);
  });

  it('fails closed on a workflow proof API error', async () => {
    const fetchImpl = async url => {
      if (url.includes('/actions/workflows/ci.yml/runs?')) {
        return jsonResponse({}, { ok: false, status: 503 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    await expect(
      checkMainQueueProvenance({
        repository: 'JovieInc/Jovie',
        sha: SHA,
        token: 'token',
        fetchImpl,
        resolveMain: async () => SHA,
      })
    ).rejects.toThrow('HTTP 503');
  });

  it('resolves main by running resolve-main-sha.sh', async () => {
    const seen = [];
    await expect(
      resolveMainSha({
        repository: 'JovieInc/Jovie',
        token: 'token',
        spawnImpl: async (command, args) => {
          seen.push([command, ...args]);
          return { code: 0, stdout: `${SHA}\n`, stderr: '' };
        },
      })
    ).resolves.toBe(SHA);
    expect(seen[0][0]).toBe('bash');
    expect(seen[0][1]).toContain('resolve-main-sha.sh');
    expect(seen[0][2]).toBe('JovieInc/Jovie');

    await expect(
      resolveMainSha({
        repository: 'JovieInc/Jovie',
        token: 'token',
        spawnImpl: async () => ({
          code: 1,
          stdout: '',
          stderr:
            'Could not resolve refs/heads/main for JovieInc/Jovie via git ls-remote.',
        }),
      })
    ).rejects.toThrow(/git ls-remote/);
  });

  it('resolves main with git ls-remote and does not print a guessed SHA', () => {
    const root = mkdtempSync(join(tmpdir(), 'resolve-main-'));
    try {
      writeFileSync(
        join(root, 'git'),
        `#!/bin/sh
case "$*" in
  *ls-remote*) printf '%s\\n' "${SHA}" ;;
  *) echo "unexpected git" >&2; exit 2 ;;
esac
`
      );
      chmodSync(join(root, 'git'), 0o755);
      const script = new URL(
        '../../../.github/scripts/resolve-main-sha.sh',
        import.meta.url
      );
      const ok = spawnSync('bash', [script.pathname, 'JovieInc/Jovie'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${root}${delimiter}${process.env.PATH}`,
          GH_TOKEN: 'token',
          RESOLVE_MAIN_RETRY_SECONDS: '0',
        },
      });
      expect(ok.status, ok.stderr).toBe(0);
      expect(ok.stdout.trim()).toBe(SHA);

      writeFileSync(join(root, 'git'), '#!/bin/sh\nexit 1\n');
      chmodSync(join(root, 'git'), 0o755);
      writeFileSync(
        join(root, 'gh'),
        '#!/bin/sh\necho "unexpected REST" >&2\nexit 9\n'
      );
      chmodSync(join(root, 'gh'), 0o755);
      const failed = spawnSync('bash', [script.pathname, 'JovieInc/Jovie'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${root}${delimiter}${process.env.PATH}`,
          GH_TOKEN: 'token',
          RESOLVE_MAIN_RETRY_SECONDS: '0',
          RESOLVE_MAIN_BUDGET_SECONDS: '1',
        },
      });
      expect(failed.status).toBe(1);
      expect(failed.stdout.trim()).toBe('');
      expect(failed.stderr).toContain('git ls-remote');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('holds a proof read until x-ratelimit-reset and fails closed outside the budget', async () => {
    let now = 1_000_000;
    const sleeps = [];
    let calls = 0;
    const limited = {
      ok: false,
      status: 403,
      headers: {
        get(name) {
          if (name === 'x-ratelimit-remaining') return '0';
          if (name === 'x-ratelimit-reset') return '1002';
          return null;
        },
      },
      async text() {
        return '{"message":"API rate limit exceeded for installation"}';
      },
    };
    await expect(
      findExactQueueProof({
        repository: 'JovieInc/Jovie',
        sha: SHA,
        token: 'token',
        apiUrl: 'https://api.github.test',
        fetchImpl: async () => {
          calls += 1;
          if (calls === 1) return limited;
          return jsonResponse({ workflow_runs: [] });
        },
        now: () => now,
        sleep: async ms => {
          sleeps.push(ms);
          now += ms;
        },
        budgetMs: 10_000,
      })
    ).resolves.toEqual({ proven: false, runId: null });
    expect(sleeps).toEqual([3000]);
    expect(calls).toBe(2);

    const outside = findExactQueueProof({
      repository: 'JovieInc/Jovie',
      sha: SHA,
      token: 'token',
      apiUrl: 'https://api.github.test',
      fetchImpl: /** @type {any} */ (
        async () => ({
          ...limited,
          headers: {
            get(name) {
              if (name === 'x-ratelimit-remaining') return '0';
              if (name === 'x-ratelimit-reset') return '999999';
              return null;
            },
          },
        })
      ),
      now: () => 0,
      sleep: async () => {
        throw new Error('slept');
      },
      budgetMs: 1_000,
    });
    await expect(outside).rejects.toThrow(/HTTP 403/);
    await expect(outside).rejects.toThrow(/outside the rate-limit budget/);
  });

  it('records a visible jobs-list hold when the installation reset is outside the cap', async () => {
    const sleeps = [];
    const calls = [];
    const limited = {
      ok: false,
      status: 403,
      headers: {
        get(name) {
          if (name === 'x-ratelimit-remaining') return '0';
          if (name === 'x-ratelimit-reset') return '999999';
          return null;
        },
      },
      async text() {
        return '{"message":"API rate limit exceeded for installation ID 123"}';
      },
    };
    const fetchImpl = async url => {
      calls.push(url);
      if (url.includes('/actions/workflows/ci.yml/runs?')) {
        return jsonResponse({
          workflow_runs: [exactSuccessfulRun(38868487854)],
        });
      }
      if (url.includes('/actions/runs/38868487854/jobs?')) return limited;
      throw new Error(`Unexpected URL: ${url}`);
    };

    const result = await checkMainQueueProvenance({
      repository: 'JovieInc/Jovie',
      sha: SHA,
      token: 'token',
      apiUrl: 'https://api.github.test',
      fetchImpl,
      resolveMain: async () => SHA,
      now: () => 0,
      sleep: async () => {
        sleeps.push(1);
      },
      budgetMs: 1_000,
      jobTimeoutMs: 55 * 60 * 1000,
    });

    expect(result).toMatchObject({
      isCurrent: true,
      queueProven: false,
      proofRunId: null,
      currentMainSha: SHA,
      disposition: 'rate_limit_hold',
    });
    expect(result.detail).toContain(
      '/actions/runs/38868487854/jobs?filter=latest&per_page=100'
    );
    expect(result.detail).toContain('outside the rate-limit budget');
    expect(sleeps).toEqual([]);
    expect(calls.some(url => url.includes('/jobs?'))).toBe(true);
    const described = describeProvenance(result, SHA);
    expect(described.level).toBe('warning');
    expect(described.line).toContain('::warning::rate-limit-hold:');
    expect(described.line).toContain('queue_proven stays false');
    expect(described.line).toContain('not a pass');
    expect(described.line).not.toContain('queue_proven=true');
    expect(described.line).not.toContain('queueProven=true');
  });

  it('keeps a permission 403 and a missing reset fatal', async () => {
    const permission = checkMainQueueProvenance({
      repository: 'JovieInc/Jovie',
      sha: SHA,
      token: 'token',
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        headers: { get: () => null },
        async text() {
          return 'Resource not accessible by integration';
        },
      }),
      resolveMain: async () => SHA,
      now: () => 0,
      sleep: async () => {
        throw new Error('slept');
      },
    });
    await expect(permission).rejects.toThrow(/HTTP 403$/);

    const missingReset = checkMainQueueProvenance({
      repository: 'JovieInc/Jovie',
      sha: SHA,
      token: 'token',
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        headers: { get: () => null },
        async text() {
          return 'API rate limit exceeded for installation';
        },
      }),
      resolveMain: async () => SHA,
      now: () => 0,
      sleep: async () => {
        throw new Error('slept');
      },
    });
    await expect(missingReset).rejects.toThrow(/missing x-ratelimit-reset/);
  });

  it('caps the hold under the job timeout and the installation token', () => {
    expect(restHoldBudgetMs(90_000)).toBe(90_000);
    expect(restHoldBudgetMs(10 * 60 * 60 * 1000)).toBe(MAX_REST_HOLD_MS);
    expect(MAX_REST_HOLD_MS).toBe(50 * 60 * 1000);
    expect(MAX_REST_HOLD_MS).toBeLessThan(60 * 60 * 1000);
    expect(
      restHoldBudgetMs(MAX_REST_HOLD_MS, { jobTimeoutMs: 10 * 60 * 1000 })
    ).toBe(5 * 60 * 1000);
    expect(PROVENANCE_JOB_TIMEOUT_MINUTES).toBe(55);
    expect(PROVENANCE_JOB_TIMEOUT_MINUTES * 60 * 1000).toBeGreaterThan(
      MAX_REST_HOLD_MS
    );
    expect(PROVENANCE_JOB_TIMEOUT_MINUTES).toBeLessThan(60);

    const ci = readFileSync(
      new URL('../../../.github/workflows/ci.yml', import.meta.url),
      'utf8'
    );
    const start = ci.indexOf('  main-queue-provenance:');
    const end = ci.indexOf('  ci-unit-runner-route:');
    const job = ci.slice(start, end);
    expect(job).toContain('timeout-minutes: 55');
    expect(job).not.toContain('timeout-minutes: 3');
    expect(job).toContain('rate_limit_hold');
  });

  it('does not wait past the token cap even when the caller asks for longer', async () => {
    const sleeps = [];
    const now = 1_000_000;
    const resetSeconds = Math.floor((now + 70 * 60 * 1000) / 1000);
    await expect(
      checkMainQueueProvenance({
        repository: 'JovieInc/Jovie',
        sha: SHA,
        token: 'token',
        fetchImpl: async () => ({
          ok: false,
          status: 403,
          headers: {
            get(name) {
              if (name === 'x-ratelimit-remaining') return '0';
              if (name === 'x-ratelimit-reset') return String(resetSeconds);
              return null;
            },
          },
          async text() {
            return 'API rate limit exceeded for installation';
          },
        }),
        resolveMain: async () => SHA,
        now: () => now,
        sleep: async () => {
          sleeps.push(1);
        },
        budgetMs: 10 * 60 * 60 * 1000,
        jobTimeoutMs: 55 * 60 * 1000,
      })
    ).resolves.toMatchObject({
      queueProven: false,
      disposition: 'rate_limit_hold',
    });
    expect(sleeps).toEqual([]);
  });

  it('does not pass a rate-limit response that has no reset instant', () => {
    expect(
      planGitHubRestHold({
        status: 403,
        headers: { get: () => null },
        bodyText: 'API rate limit exceeded for installation',
        nowMs: 0,
        deadlineMs: 90_000,
      })
    ).toEqual({ action: 'fail', reason: 'missing x-ratelimit-reset' });
    expect(
      planGitHubRestHold({
        status: 403,
        headers: { get: () => null },
        bodyText: 'Resource not accessible by integration',
        nowMs: 0,
        deadlineMs: 90_000,
      })
    ).toEqual({ action: 'fail' });
  });

  it('holds a staging REST read until reset and does not pass one outside the cap', () => {
    const script = new URL(
      '../../../.github/scripts/gh-api-hold.sh',
      import.meta.url
    );
    const source = readFileSync(script, 'utf8');
    expect(source).toContain('GH_API_HOLD_BUDGET_SECONDS:-3000');
    expect(source).toContain('GH_API_HOLD_TOKEN_CAP_SECONDS:-3000');
    expect(source).not.toContain('GH_API_HOLD_BUDGET_SECONDS:-90');

    const runHold = (resetOffset, budget) => {
      const root = mkdtempSync(join(tmpdir(), 'gh-api-hold-'));
      try {
        const calls = join(root, 'calls');
        writeFileSync(calls, '0');
        const reset = Math.floor(Date.now() / 1000) + resetOffset;
        writeFileSync(
          join(root, 'gh'),
          `#!/bin/sh
n="$(cat "${calls}")"
n=$((n + 1))
printf '%s' "$n" > "${calls}"
case "$*" in
  *rate_limit*) printf '%s\\n' "${reset}"; exit 0 ;;
esac
if [ "$n" -eq 1 ]; then
  echo "API rate limit exceeded for installation" >&2
  exit 1
fi
printf '%s\\n' '{"jobs":[{"name":"PR Ready","conclusion":"success"}]}'
exit 0
`
        );
        chmodSync(join(root, 'gh'), 0o755);
        const env = {
          ...process.env,
          PATH: `${root}${delimiter}${process.env.PATH}`,
          GH_TOKEN: 'token',
        };
        if (budget != null) env.GH_API_HOLD_BUDGET_SECONDS = String(budget);
        else delete env.GH_API_HOLD_BUDGET_SECONDS;
        const result = spawnSync(
          'bash',
          [script.pathname, 'api', 'repos/JovieInc/Jovie/actions/runs/1/jobs'],
          { encoding: 'utf8', timeout: 10_000, env }
        );
        return {
          ...result,
          calls: Number(readFileSync(calls, 'utf8')),
        };
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    };

    const held = runHold(-5, 30);
    expect(held.status, held.stderr).toBe(0);
    expect(held.stdout).toContain('PR Ready');
    expect(held.stderr).toContain('Holding');
    expect(held.calls).toBeGreaterThan(1);

    const refused = runHold(100_000, null);
    expect(refused.status).not.toBe(0);
    expect(refused.stdout.trim()).toBe('');
    expect(refused.stderr).toContain('outside the');
    expect(refused.stderr).toContain('Not passing');
    expect(refused.calls).toBe(2);
  });
});
