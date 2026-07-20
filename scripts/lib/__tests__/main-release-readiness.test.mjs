import { describe, expect, it } from 'vitest';
import {
  checkMainQueueProvenance,
  findExactQueueProof,
  hasExactSuccessfulMergeGroupProof,
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
      if (url.endsWith('/commits/main')) return jsonResponse({ sha: SHA });
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
      })
    ).resolves.toEqual({
      isCurrent: true,
      queueProven: true,
      proofRunId: 41,
      currentMainSha: SHA,
    });
    expect(calls).toHaveLength(3);
  });

  it('authorizes the fail-closed fallback only when current proof is absent', async () => {
    const calls = [];
    const fetchImpl = async url => {
      calls.push(url);
      if (url.endsWith('/commits/main')) return jsonResponse({ sha: SHA });
      return jsonResponse({ workflow_runs: [] });
    };

    await expect(
      checkMainQueueProvenance({
        repository: 'JovieInc/Jovie',
        sha: SHA,
        token: 'token',
        fetchImpl,
      })
    ).resolves.toEqual({
      isCurrent: true,
      queueProven: false,
      proofRunId: null,
      currentMainSha: SHA,
    });
    expect(calls).toHaveLength(2);
  });

  it('neutralizes a superseded SHA without querying workflow runs', async () => {
    const calls = [];
    const fetchImpl = async url => {
      calls.push(url);
      return jsonResponse({ sha: SUPERSEDING_SHA });
    };

    await expect(
      checkMainQueueProvenance({
        repository: 'JovieInc/Jovie',
        sha: SHA,
        token: 'token',
        fetchImpl,
      })
    ).resolves.toEqual({
      isCurrent: false,
      queueProven: false,
      proofRunId: null,
      currentMainSha: SUPERSEDING_SHA,
    });
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['main HEAD', url => url.endsWith('/commits/main')],
    ['workflow proof', url => url.includes('/actions/workflows/ci.yml/runs?')],
  ])('fails closed on a %s API error', async (_label, shouldFail) => {
    const fetchImpl = async url => {
      if (shouldFail(url)) return jsonResponse({}, { ok: false, status: 503 });
      return jsonResponse({ sha: SHA });
    };

    await expect(
      checkMainQueueProvenance({
        repository: 'JovieInc/Jovie',
        sha: SHA,
        token: 'token',
        fetchImpl,
      })
    ).rejects.toThrow('HTTP 503');
  });
});
