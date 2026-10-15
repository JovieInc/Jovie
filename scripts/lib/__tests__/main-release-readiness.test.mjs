import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import {
  checkMainQueueProvenance,
  findExactQueueProof,
  hasExactSuccessfulMergeGroupProof,
  planGitHubRestHold,
  resolveMainSha,
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
      fetchImpl: /** @type {any} */ (async () => ({
        ...limited,
        headers: {
          get(name) {
            if (name === 'x-ratelimit-remaining') return '0';
            if (name === 'x-ratelimit-reset') return '999999';
            return null;
          },
        },
      })),
      now: () => 0,
      sleep: async () => {
        throw new Error('slept');
      },
      budgetMs: 1_000,
    });
    await expect(outside).rejects.toThrow(/HTTP 403/);
    await expect(outside).rejects.toThrow(/outside the rate-limit budget/);
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
});
