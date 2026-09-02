import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyRequiredCheckPage,
  runAdmissionFromEnv,
  validateMergeGroupAdmissionEvent,
  validateQueueRef,
  waitForMergeGroupAdmission,
} from '../merge-group-admission.mjs';

const HEAD = '2'.repeat(40);
const HEAD_REF = 'refs/heads/gh-readonly-queue/main/pr-123-deadbeef';

function event(overrides = {}) {
  return {
    action: 'checks_requested',
    repository: { full_name: 'JovieInc/Jovie' },
    merge_group: {
      base_ref: 'refs/heads/main',
      base_sha: '1'.repeat(40),
      head_commit: { id: HEAD },
      head_ref: HEAD_REF,
      head_sha: HEAD,
      ...overrides,
    },
  };
}

function queueRef(overrides = {}) {
  return {
    ref: HEAD_REF,
    object: { type: 'commit', sha: HEAD },
    ...overrides,
  };
}

function checkPage(name, status, conclusion = null, overrides = {}) {
  const checkRuns =
    status === 'missing'
      ? []
      : [
          {
            id: name === 'Fork PR Gate' ? 1 : 2,
            name,
            head_sha: HEAD,
            app: { slug: 'github-actions' },
            status,
            conclusion,
          },
        ];
  return {
    data: { total_count: checkRuns.length, check_runs: checkRuns },
    link: null,
    ...overrides,
  };
}

describe('merge-group admission evidence', () => {
  it('requires an exact main queue event bound to the workflow head', () => {
    expect(
      validateMergeGroupAdmissionEvent(event(), {
        expectedHeadSha: HEAD,
        expectedRepository: 'JovieInc/Jovie',
      })
    ).toEqual({
      headRef: HEAD_REF,
      headSha: HEAD,
      prNumber: 123,
      repository: 'JovieInc/Jovie',
    });

    expect(() =>
      validateMergeGroupAdmissionEvent(event({ head_ref: 'refs/heads/main' }))
    ).toThrow(/does not expose a queue PR number/);
    expect(() =>
      validateMergeGroupAdmissionEvent(event(), {
        expectedHeadSha: '3'.repeat(40),
      })
    ).toThrow(/does not match GITHUB_SHA/);
  });

  it('requires the exact live queue ref and head SHA', () => {
    expect(() =>
      validateQueueRef(queueRef(), { headRef: HEAD_REF, headSha: HEAD })
    ).not.toThrow();
    expect(() =>
      validateQueueRef(
        queueRef({ object: { type: 'commit', sha: '3'.repeat(40) } }),
        { headRef: HEAD_REF, headSha: HEAD }
      )
    ).toThrow(/no longer at head_sha/);
  });

  it('classifies only one exact GitHub Actions check run', () => {
    expect(
      classifyRequiredCheckPage(
        checkPage('Fork PR Gate', 'completed', 'success'),
        {
          checkName: 'Fork PR Gate',
          headSha: HEAD,
        }
      )
    ).toEqual({ state: 'success', detail: 'success' });
    expect(
      classifyRequiredCheckPage(checkPage('Fork PR Gate', 'queued'), {
        checkName: 'Fork PR Gate',
        headSha: HEAD,
      })
    ).toEqual({ state: 'pending', detail: 'queued' });
    expect(
      classifyRequiredCheckPage(
        checkPage('Fork PR Gate', 'completed', 'failure'),
        { checkName: 'Fork PR Gate', headSha: HEAD }
      )
    ).toEqual({ state: 'terminal-failure', detail: 'failure' });
  });

  it('fails closed on incomplete, ambiguous, or malformed check pages', () => {
    const validRun = checkPage('Fork PR Gate', 'queued').data.check_runs[0];
    for (const page of [
      {
        data: { total_count: 2, check_runs: [validRun] },
        link: null,
      },
      {
        data: { total_count: 1, check_runs: [validRun] },
        link: '<https://api.github.test/check-runs?page=2>; rel="next"',
      },
      {
        data: { total_count: 2, check_runs: [validRun, validRun] },
        link: null,
      },
      checkPage('Fork PR Gate', 'queued', 'success'),
      checkPage('Fork PR Gate', 'unknown'),
    ]) {
      expect(() =>
        classifyRequiredCheckPage(page, {
          checkName: 'Fork PR Gate',
          headSha: HEAD,
        })
      ).toThrow();
    }
  });

  it('polls pending gates, rechecks the ref, then admits success', async () => {
    let round = 0;
    const loadQueueRef = vi.fn(async () => queueRef());
    const loadCheckRuns = vi.fn(async ({ checkName }) =>
      checkPage(
        checkName,
        round === 0 ? 'queued' : 'completed',
        round === 0 ? null : 'success'
      )
    );
    const statuses = [];

    await waitForMergeGroupAdmission({
      event: event(),
      loadCheckRuns,
      loadQueueRef,
      maxWaitMs: 10,
      now: () => round * 3,
      onStatus: message => statuses.push(message),
      pollIntervalMs: 3,
      sleep: async () => {
        round += 1;
      },
    });

    expect(loadQueueRef).toHaveBeenCalledTimes(3);
    expect(loadCheckRuns).toHaveBeenCalledTimes(4);
    expect(statuses).toHaveLength(2);
    expect(statuses.at(-1)).toMatch(/admission passed/);
  });

  it('stops immediately on a terminal gate failure', async () => {
    const loadQueueRef = vi.fn(async () => queueRef());
    const loadCheckRuns = vi.fn(async ({ checkName }) =>
      checkPage(
        checkName,
        'completed',
        checkName === 'Fork PR Gate' ? 'failure' : 'success'
      )
    );

    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadCheckRuns,
        loadQueueRef,
        maxWaitMs: 10,
        pollIntervalMs: 3,
      })
    ).rejects.toThrow(/Fork PR Gate completed with failure/);
    expect(loadQueueRef).toHaveBeenCalledTimes(1);
  });

  it('fails when the queue ref disappears and never polls checks', async () => {
    const loadCheckRuns = vi.fn();
    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadCheckRuns,
        loadQueueRef: async () => null,
        maxWaitMs: 10,
        pollIntervalMs: 3,
      })
    ).rejects.toThrow(/queue ref is missing/);
    expect(loadCheckRuns).not.toHaveBeenCalled();
  });

  it('rechecks the queue ref after both external gates pass', async () => {
    const loadQueueRef = vi
      .fn()
      .mockResolvedValueOnce(queueRef())
      .mockResolvedValueOnce(null);
    const loadCheckRuns = vi.fn(async ({ checkName }) =>
      checkPage(checkName, 'completed', 'success')
    );

    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadCheckRuns,
        loadQueueRef,
        maxWaitMs: 10,
        pollIntervalMs: 3,
      })
    ).rejects.toThrow(/queue ref is missing/);
    expect(loadQueueRef).toHaveBeenCalledTimes(2);
  });

  it('times out within the configured bound when checks never appear', async () => {
    let elapsed = 0;
    const loadQueueRef = vi.fn(async () => queueRef());
    const loadCheckRuns = vi.fn(async ({ checkName }) =>
      checkPage(checkName, 'missing')
    );

    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadCheckRuns,
        loadQueueRef,
        maxWaitMs: 6,
        now: () => elapsed,
        onStatus: () => {},
        pollIntervalMs: 3,
        sleep: async delayMs => {
          elapsed += delayMs;
        },
      })
    ).rejects.toThrow(/within 6ms/);
    expect(elapsed).toBe(6);
  });

  it('runs the GitHub adapter and serializes typed admission outputs', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'merge-group-admission-'));
    const eventPath = join(tempDir, 'event.json');
    const outputPath = join(tempDir, 'output.txt');
    const summaryPath = join(tempDir, 'summary.md');
    await writeFile(eventPath, JSON.stringify(event()), 'utf8');

    const fetchImpl = vi.fn(async url => {
      const requestUrl = new URL(url);
      if (requestUrl.pathname.includes('/git/ref/')) {
        return Response.json(queueRef());
      }
      const checkName = requestUrl.searchParams.get('check_name');
      return Response.json(checkPage(checkName, 'completed', 'success').data);
    });

    try {
      const admitted = await runAdmissionFromEnv(
        {
          GH_TOKEN: 'test-token',
          GITHUB_API_URL: 'https://api.github.test',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_OUTPUT: outputPath,
          GITHUB_REPOSITORY: 'JovieInc/Jovie',
          GITHUB_SHA: HEAD,
          GITHUB_STEP_SUMMARY: summaryPath,
        },
        { fetchImpl }
      );

      expect(admitted).toMatchObject({ headSha: HEAD, prNumber: 123 });
      expect(fetchImpl).toHaveBeenCalledTimes(4);
      expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
        'https://api.github.test/repos/JovieInc/Jovie/git/ref/heads/gh-readonly-queue/main/pr-123-deadbeef',
        `https://api.github.test/repos/JovieInc/Jovie/commits/${HEAD}/check-runs?check_name=Fork+PR+Gate&filter=latest&page=1&per_page=100`,
        `https://api.github.test/repos/JovieInc/Jovie/commits/${HEAD}/check-runs?check_name=PR+Size+Guard&filter=latest&page=1&per_page=100`,
        'https://api.github.test/repos/JovieInc/Jovie/git/ref/heads/gh-readonly-queue/main/pr-123-deadbeef',
      ]);
      for (const [, options] of fetchImpl.mock.calls) {
        expect(options).toMatchObject({
          cache: 'no-store',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer test-token',
            'Cache-Control': 'no-cache',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
      }
      await expect(readFile(outputPath, 'utf8')).resolves.toBe(
        'pr_number=123\n'
      );
      await expect(readFile(summaryPath, 'utf8')).resolves.toBe(
        [
          '### Merge-group exact-ref admission',
          '',
          '- PR: #123',
          `- Synthetic head: \`${HEAD}\``,
          '- Queue state: `EXACT_REF_ADMITTED`',
          '',
        ].join('\n')
      );
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it('fails closed when the GitHub adapter receives an HTTP error', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'merge-group-admission-'));
    const eventPath = join(tempDir, 'event.json');
    await writeFile(eventPath, JSON.stringify(event()), 'utf8');

    try {
      await expect(
        runAdmissionFromEnv(
          {
            GH_TOKEN: 'test-token',
            GITHUB_API_URL: 'https://api.github.test',
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_REPOSITORY: 'JovieInc/Jovie',
            GITHUB_SHA: HEAD,
          },
          {
            fetchImpl: async () =>
              Response.json({ message: 'forbidden' }, { status: 403 }),
          }
        )
      ).rejects.toThrow(/GitHub API 403/);
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});
