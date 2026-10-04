import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  ADMISSION_CONTRACT_VERSION,
  buildLiveQueueAdmissionReceipt,
  classifyRequiredCheckPage,
  isTransientApiError,
  MERGE_GROUP_ADMISSION_WAIT_MS,
  MergeGroupAdmissionError,
  normalizeLiveQueueEntriesPage,
  parseQueueHeadPullRequestNumber,
  runAdmissionFromEnv,
  validateMergeGroupAdmissionEvent,
  validateQueueRef,
  waitForMergeGroupAdmission,
} from '../merge-group-admission.mjs';

const ADMISSION_SCRIPT = fileURLToPath(
  new URL('../merge-group-admission.mjs', import.meta.url)
);

const BASE = '1'.repeat(40);
const HEAD = '2'.repeat(40);
const HEAD_REF = 'refs/heads/gh-readonly-queue/main/pr-123-deadbeef';
const SOURCE_HEAD = '4'.repeat(40);
const ADMITTED_AT = '2026-09-06T20:29:15Z';

function event(overrides = {}) {
  return {
    action: 'checks_requested',
    repository: { full_name: 'JovieInc/Jovie' },
    merge_group: {
      base_ref: 'refs/heads/main',
      base_sha: BASE,
      head_commit: { id: HEAD },
      head_ref: HEAD_REF,
      head_sha: HEAD,
      ...overrides,
    },
  };
}

function liveEntry(overrides = {}) {
  return {
    id: 'MQE_123',
    enqueuedAt: ADMITTED_AT,
    enqueuer: { __typename: 'User', login: 'itstimwhite' },
    baseCommitOid: BASE,
    headCommitOid: HEAD,
    position: 1,
    prNumber: 123,
    sourceHeadSha: SOURCE_HEAD,
    state: 'AWAITING_CHECKS',
    ...overrides,
  };
}

function liveQueuePayload(nodes, pageInfo = {}) {
  return {
    data: {
      repository: {
        mergeQueue: {
          entries: {
            nodes,
            pageInfo: { endCursor: null, hasNextPage: false, ...pageInfo },
          },
        },
      },
    },
  };
}

function liveQueueNode(overrides = {}) {
  return {
    id: 'MQE_123',
    enqueuedAt: ADMITTED_AT,
    enqueuer: { __typename: 'User', login: 'itstimwhite' },
    baseCommit: { oid: BASE },
    headCommit: { oid: HEAD },
    position: 1,
    pullRequest: {
      baseRefName: 'main',
      headRefOid: SOURCE_HEAD,
      number: 123,
    },
    state: 'AWAITING_CHECKS',
    ...overrides,
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
  it('exposes the typed CLI contract without requiring runtime credentials', () => {
    expect(
      execFileSync(
        process.execPath,
        [ADMISSION_SCRIPT, '--print-contract-version'],
        { encoding: 'utf8' }
      ).trim()
    ).toBe(ADMISSION_CONTRACT_VERSION);
  });

  it.each(['User', 'Bot'])(
    'admits a current native %s entry without querying stale historical events',
    async actorType => {
      const directory = await mkdtemp(join(tmpdir(), 'merge-admission-'));
      const eventPath = join(directory, 'event.json');
      const outputPath = join(directory, 'output.txt');
      await writeFile(eventPath, JSON.stringify(event()), 'utf8');
      const requests = [];
      const fetchImpl = vi.fn(async (url, init) => {
        requests.push({ url, init });
        if (url.endsWith('/graphql')) {
          const body = JSON.parse(init.body);
          if (
            body.query.includes('timelineItems') ||
            body.query.includes('Timeline')
          ) {
            throw new Error(
              'stale or missing historical timeline must not be queried'
            );
          }
          return Response.json(
            liveQueuePayload([
              liveQueueNode({
                enqueuer: { __typename: actorType, login: 'native-writer' },
              }),
            ])
          );
        }
        if (url.includes('/git/ref/')) return Response.json(queueRef());
        const checkName = new URL(url).searchParams.get('check_name');
        if (!checkName) throw new Error(`unexpected request ${url}`);
        return Response.json(checkPage(checkName, 'completed', 'success').data);
      });
      const env = {
        GH_TOKEN: 'test-token',
        GITHUB_API_URL: 'https://api.github.test',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_OUTPUT: outputPath,
        GITHUB_REPOSITORY: 'JovieInc/Jovie',
        GITHUB_SHA: HEAD,
      };
      try {
        await expect(
          runAdmissionFromEnv(env, { fetchImpl })
        ).resolves.toMatchObject({
          admitted: true,
          pr: 123,
          syntheticSha: HEAD,
        });
        expect(requests).toHaveLength(6);
        expect(
          requests.filter(request => request.url.endsWith('/graphql'))
        ).toHaveLength(2);
        expect(
          requests.some(request =>
            /\/(statuses|compare|actions\/runs)\b/.test(request.url)
          )
        ).toBe(false);
        expect(
          requests.every(
            request =>
              request.url.startsWith('https://api.github.test/') &&
              request.init.headers.Authorization === 'Bearer test-token'
          )
        ).toBe(true);
        await expect(readFile(outputPath, 'utf8')).resolves.toContain(
          `admitted=true\nobsolete=false\npr_number=123\nsynthetic_head_sha=${HEAD}`
        );
        await expect(
          runAdmissionFromEnv(env, {
            fetchImpl: async () =>
              Response.json({ message: 'denied' }, { status: 403 }),
          })
        ).rejects.toThrow(/GitHub API 403/);
      } finally {
        await rm(directory, { force: true, recursive: true });
      }
    }
  );

  it('neutralizes a vanished queue ref end to end and stays fail-closed on other statuses', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'merge-admission-'));
    const eventPath = join(directory, 'event.json');
    const outputPath = join(directory, 'output.txt');
    await writeFile(eventPath, JSON.stringify(event()), 'utf8');
    const env = {
      GH_TOKEN: 'test-token',
      GITHUB_API_URL: 'https://api.github.test',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
      GITHUB_SHA: HEAD,
    };
    const adapterFetch = refResponse =>
      vi.fn(async (url, init) => {
        if (url.endsWith('/graphql')) {
          const body = JSON.parse(init.body);
          if (body.query.includes('MergeGroupAdmissionLiveQueue')) {
            return Response.json(liveQueuePayload([liveQueueNode()]));
          }
        }
        if (url.includes('/git/ref/')) return refResponse;
        throw new Error(`unexpected request ${url}`);
      });

    try {
      const receipt = await runAdmissionFromEnv(env, {
        fetchImpl: adapterFetch(
          Response.json({ message: 'Not Found' }, { status: 404 })
        ),
      });
      expect(receipt).toMatchObject({
        admitted: false,
        currentQueueState: 'VANISHED_QUEUE_REF',
        outcome: 'obsolete',
      });
      await expect(readFile(outputPath, 'utf8')).resolves.toContain(
        `admitted=false\nobsolete=true\npr_number=123\nsynthetic_head_sha=${HEAD}`
      );

      await expect(
        runAdmissionFromEnv(env, {
          fetchImpl: adapterFetch(
            Response.json({ message: 'boom' }, { status: 500 })
          ),
        })
      ).rejects.toThrow(/GitHub API 500/);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('requires an exact main queue event bound to the workflow head', () => {
    expect(
      validateMergeGroupAdmissionEvent(event(), {
        expectedHeadSha: HEAD,
        expectedRepository: 'JovieInc/Jovie',
      })
    ).toEqual({
      baseSha: BASE,
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
    expect(() =>
      parseQueueHeadPullRequestNumber(
        'refs/heads/gh-readonly-queue/main/not-a-pr'
      )
    ).toThrow(/does not expose a queue PR number/);
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

  it('normalizes complete live merge-queue pages and rejects partial inventory', () => {
    expect(
      normalizeLiveQueueEntriesPage(liveQueuePayload([liveQueueNode()])).entries
    ).toEqual([liveEntry()]);

    for (const payload of [
      { data: {} },
      { data: { repository: { mergeQueue: null } } },
      liveQueuePayload([liveQueueNode()], {
        endCursor: null,
        hasNextPage: true,
      }),
      liveQueuePayload([
        liveQueueNode({
          headCommit: null,
          state: 'AWAITING_CHECKS',
        }),
      ]),
      liveQueuePayload([
        liveQueueNode({ pullRequest: { baseRefName: 'other', number: 123 } }),
      ]),
      liveQueuePayload([liveQueueNode({ state: 'UNKNOWN' })]),
    ]) {
      expect(() => normalizeLiveQueueEntriesPage(payload)).toThrow();
    }
  });

  it.each(['QUEUED', 'AWAITING_CHECKS', 'MERGEABLE', 'UNMERGEABLE', 'LOCKED'])(
    'admits the exact live synthetic head while queue state is %s',
    state => {
      const evidence = validateMergeGroupAdmissionEvent(event());
      expect(
        buildLiveQueueAdmissionReceipt({
          entries: [liveEntry({ state })],
          evidence,
          runContext: { runAttempt: '2', runId: '123456789' },
        })
      ).toMatchObject({
        admitted: true,
        currentQueueState: state,
        outcome: 'admitted',
        pr: 123,
        replacementCombinedHead: null,
        runAttempt: '2',
        runId: '123456789',
        syntheticSha: HEAD,
      });
    }
  );

  it('marks an old synthetic head obsolete with replacement queue evidence', () => {
    const oldHead = '5'.repeat(40);
    const currentHead = '6'.repeat(40);
    const evidence = validateMergeGroupAdmissionEvent(
      event({
        head_commit: { id: oldHead },
        head_sha: oldHead,
      })
    );

    expect(
      buildLiveQueueAdmissionReceipt({
        entries: [liveEntry({ headCommitOid: currentHead })],
        evidence,
        runContext: { runId: '33452088142' },
      })
    ).toMatchObject({
      admitted: false,
      currentQueueState: 'AWAITING_CHECKS',
      obsoleteSyntheticSha: oldHead,
      outcome: 'obsolete',
      pr: 123,
      replacementCombinedHead: currentHead,
      runId: '33452088142',
      syntheticSha: oldHead,
    });
  });

  it('marks a synthetic head obsolete when the PR has fallen back to QUEUED', () => {
    const oldHead = '7'.repeat(40);
    const evidence = validateMergeGroupAdmissionEvent(
      event({
        head_commit: { id: oldHead },
        head_sha: oldHead,
      })
    );

    expect(
      buildLiveQueueAdmissionReceipt({
        entries: [
          liveEntry({
            headCommitOid: null,
            state: 'QUEUED',
          }),
        ],
        evidence,
      })
    ).toMatchObject({
      admitted: false,
      currentQueueState: 'QUEUED',
      obsoleteSyntheticSha: oldHead,
      outcome: 'obsolete',
      pr: 123,
      replacementCombinedHead: null,
      syntheticSha: oldHead,
    });
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
    const loadLiveQueueEntries = vi.fn(async () => [liveEntry()]);
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
      loadLiveQueueEntries,
      loadQueueRef,
      maxWaitMs: 10,
      now: () => round * 3,
      onStatus: message => statuses.push(message),
      pollIntervalMs: 3,
      sleep: async () => {
        round += 1;
      },
    });

    expect(loadLiveQueueEntries).toHaveBeenCalledTimes(3);
    expect(loadQueueRef).toHaveBeenCalledTimes(3);
    expect(loadCheckRuns).toHaveBeenCalledTimes(4);
    expect(statuses).toHaveLength(2);
    expect(statuses.at(-1)).toMatch(/admission passed/);
  });

  it('stops immediately on a terminal gate failure', async () => {
    const loadQueueRef = vi.fn(async () => queueRef());
    const loadLiveQueueEntries = vi.fn(async () => [liveEntry()]);
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
        loadLiveQueueEntries,
        loadQueueRef,
        maxWaitMs: 10,
        pollIntervalMs: 3,
      })
    ).rejects.toThrow(/Fork PR Gate completed with failure/);
    expect(loadLiveQueueEntries).toHaveBeenCalledTimes(1);
    expect(loadQueueRef).toHaveBeenCalledTimes(1);
  });

  it('neutralizes an obsolete head before polling queue refs or checks', async () => {
    const oldHead = '8'.repeat(40);
    const currentHead = '9'.repeat(40);
    const loadQueueRef = vi.fn();
    const loadCheckRuns = vi.fn();

    const result = await waitForMergeGroupAdmission({
      event: event({
        head_commit: { id: oldHead },
        head_sha: oldHead,
      }),
      loadCheckRuns,
      loadLiveQueueEntries: async () => [
        liveEntry({ headCommitOid: currentHead }),
      ],
      loadQueueRef,
      maxWaitMs: 10,
      pollIntervalMs: 3,
    });

    expect(result).toMatchObject({
      admitted: false,
      receipt: {
        currentQueueState: 'AWAITING_CHECKS',
        obsoleteSyntheticSha: oldHead,
        outcome: 'obsolete',
        pr: 123,
        replacementCombinedHead: currentHead,
      },
    });
    expect(loadQueueRef).not.toHaveBeenCalled();
    expect(loadCheckRuns).not.toHaveBeenCalled();
  });

  it('neutralizes a vanished queue ref before polling checks', async () => {
    const loadCheckRuns = vi.fn();
    const statuses = [];

    const result = await waitForMergeGroupAdmission({
      event: event(),
      loadCheckRuns,
      loadLiveQueueEntries: async () => [liveEntry()],
      loadQueueRef: async () => null,
      maxWaitMs: 10,
      onStatus: message => statuses.push(message),
      pollIntervalMs: 3,
    });

    expect(result).toMatchObject({
      admitted: false,
      receipt: {
        admitted: false,
        currentQueueState: 'VANISHED_QUEUE_REF',
        obsoleteSyntheticSha: HEAD,
        outcome: 'obsolete',
        pr: 123,
      },
    });
    expect(statuses.at(-1)).toMatch(/vanished queue ref/);
    expect(loadCheckRuns).not.toHaveBeenCalled();
  });

  it('neutralizes when the queue ref vanishes after both external gates pass', async () => {
    const loadQueueRef = vi
      .fn()
      .mockResolvedValueOnce(queueRef())
      .mockResolvedValueOnce(null);
    const loadLiveQueueEntries = vi.fn(async () => [liveEntry()]);
    const loadCheckRuns = vi.fn(async ({ checkName }) =>
      checkPage(checkName, 'completed', 'success')
    );

    const result = await waitForMergeGroupAdmission({
      event: event(),
      loadCheckRuns,
      loadLiveQueueEntries,
      loadQueueRef,
      maxWaitMs: 10,
      pollIntervalMs: 3,
    });

    expect(result).toMatchObject({
      admitted: false,
      receipt: {
        currentQueueState: 'VANISHED_QUEUE_REF',
        obsoleteSyntheticSha: HEAD,
        outcome: 'obsolete',
      },
    });
    expect(loadLiveQueueEntries).toHaveBeenCalledTimes(1);
    expect(loadQueueRef).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    'accepts the current same-content reenqueue across polls=%s',
    async pendingFirst => {
      let elapsed = 0;
      let reads = 0;
      const result = await waitForMergeGroupAdmission({
        event: event(),
        loadLiveQueueEntries: async () => [
          liveEntry(
            ++reads === 1
              ? {}
              : {
                  id: 'MQE_reenqueued',
                  enqueuedAt: '2026-09-23T22:17:52Z',
                  enqueuer: {
                    __typename: 'User',
                    login: 'another-native-writer',
                  },
                  position: 2,
                }
          ),
        ],
        loadQueueRef: async () => queueRef(),
        loadCheckRuns: async ({ checkName }) =>
          pendingFirst && elapsed === 0
            ? checkPage(checkName, 'queued')
            : checkPage(checkName, 'completed', 'success'),
        maxWaitMs: 10,
        pollIntervalMs: 3,
        now: () => elapsed,
        sleep: async ms => {
          elapsed += ms;
        },
        onStatus: () => {},
      });
      expect(result.admitted).toBe(true);
      expect(result.receipt.liveEntry.id).toBe('MQE_reenqueued');
      expect(result.receipt.liveEntry.sourceHeadSha).toBe(SOURCE_HEAD);
    }
  );

  it('rejects a source head that changes during final queue reread', async () => {
    const loadLiveQueueEntries = vi
      .fn()
      .mockResolvedValueOnce([liveEntry()])
      .mockResolvedValueOnce([liveEntry({ sourceHeadSha: '5'.repeat(40) })]);
    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadCheckRuns: async ({ checkName }) =>
          checkPage(checkName, 'completed', 'success'),
        loadLiveQueueEntries,
        loadQueueRef: async () => queueRef(),
        maxWaitMs: 10,
        pollIntervalMs: 3,
      })
    ).rejects.toThrow(/source head changed during admission/);
    expect(loadLiveQueueEntries).toHaveBeenCalledTimes(2);
  });

  it('rechecks live queue membership after external gates pass', async () => {
    const loadQueueRef = vi.fn(async () => queueRef());
    const loadLiveQueueEntries = vi
      .fn()
      .mockResolvedValueOnce([liveEntry()])
      .mockResolvedValueOnce([liveEntry({ headCommitOid: '9'.repeat(40) })]);
    const loadCheckRuns = vi.fn(async ({ checkName }) =>
      checkPage(checkName, 'completed', 'success')
    );

    const result = await waitForMergeGroupAdmission({
      event: event(),
      loadCheckRuns,
      loadLiveQueueEntries,
      loadQueueRef,
      maxWaitMs: 10,
      pollIntervalMs: 3,
    });

    expect(result).toMatchObject({
      admitted: false,
      receipt: {
        obsoleteSyntheticSha: HEAD,
        outcome: 'obsolete',
        replacementCombinedHead: '9'.repeat(40),
      },
    });
    expect(loadQueueRef).toHaveBeenCalledTimes(2);
    expect(loadLiveQueueEntries).toHaveBeenCalledTimes(2);
  });

  it('times out within the configured bound when checks never appear', async () => {
    let elapsed = 0;
    const loadQueueRef = vi.fn(async () => queueRef());
    const loadLiveQueueEntries = vi.fn(async () => [liveEntry()]);
    const loadCheckRuns = vi.fn(async ({ checkName }) =>
      checkPage(checkName, 'missing')
    );

    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadCheckRuns,
        loadLiveQueueEntries,
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

  // Regression: runs 35878871922 / 35930041899 failed with
  // "did not pass within 90000ms" while PR Size Guard was merely in_progress.
  it('keeps polling a required check that is still in_progress past 90s under the default budget', async () => {
    let elapsed = 0;
    const statuses = [];
    const result = await waitForMergeGroupAdmission({
      event: event(),
      loadCheckRuns: async ({ checkName }) =>
        checkName === 'PR Size Guard' && elapsed < 150_000
          ? checkPage(checkName, 'in_progress')
          : checkPage(checkName, 'completed', 'success'),
      loadLiveQueueEntries: async () => [liveEntry()],
      loadQueueRef: async () => queueRef(),
      now: () => elapsed,
      onStatus: message => statuses.push(message),
      sleep: async delayMs => {
        elapsed += delayMs;
      },
    });

    expect(result.admitted).toBe(true);
    expect(elapsed).toBeGreaterThan(90_000);
    expect(
      statuses.some(status => /PR Size Guard=in_progress/.test(status))
    ).toBe(true);
  });

  it('still fails fast when an in_progress check concludes with failure', async () => {
    let elapsed = 0;
    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadCheckRuns: async ({ checkName }) =>
          checkName === 'PR Size Guard'
            ? elapsed < 9
              ? checkPage(checkName, 'in_progress')
              : checkPage(checkName, 'completed', 'failure')
            : checkPage(checkName, 'completed', 'success'),
        loadLiveQueueEntries: async () => [liveEntry()],
        loadQueueRef: async () => queueRef(),
        maxWaitMs: 60,
        now: () => elapsed,
        onStatus: () => {},
        pollIntervalMs: 3,
        sleep: async delayMs => {
          elapsed += delayMs;
        },
      })
    ).rejects.toThrow(/PR Size Guard completed with failure/);
    expect(elapsed).toBe(9);
  });

  it('names the still-pending check when the deadline expires', async () => {
    let elapsed = 0;
    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadCheckRuns: async ({ checkName }) =>
          checkName === 'PR Size Guard'
            ? checkPage(checkName, 'in_progress')
            : checkPage(checkName, 'completed', 'success'),
        loadLiveQueueEntries: async () => [liveEntry()],
        loadQueueRef: async () => queueRef(),
        maxWaitMs: 6,
        now: () => elapsed,
        onStatus: () => {},
        pollIntervalMs: 3,
        sleep: async delayMs => {
          elapsed += delayMs;
        },
      })
    ).rejects.toThrow(
      /within 6ms \(still pending: Fork PR Gate=success, PR Size Guard=in_progress\)/
    );
  });

  // Regression: 2026-10-03 runs 37151507995 / 37154869758 failed valid groups
  // with "API rate limit already exceeded for site ID installation" (JOV-7744).
  it('waits out a rate-limited live queue read within the budget, then admits', async () => {
    let elapsed = 0;
    const statuses = [];
    const loadLiveQueueEntries = vi.fn(async () => {
      if (elapsed < 30) {
        throw new MergeGroupAdmissionError(
          'live merge queue GraphQL returned errors: API rate limit already exceeded for site ID installation.'
        );
      }
      return [liveEntry()];
    });
    const result = await waitForMergeGroupAdmission({
      event: event(),
      loadCheckRuns: async ({ checkName }) =>
        checkPage(checkName, 'completed', 'success'),
      loadLiveQueueEntries,
      loadQueueRef: async () => queueRef(),
      maxWaitMs: 60,
      now: () => elapsed,
      onStatus: message => statuses.push(message),
      pollIntervalMs: 15,
      sleep: async delayMs => {
        elapsed += delayMs;
      },
    });

    expect(result.admitted).toBe(true);
    expect(elapsed).toBe(30);
    expect(statuses.filter(s => /GitHub API unavailable/.test(s))).toHaveLength(
      2
    );
  });

  it('fails at the deadline when the quota never recovers', async () => {
    let elapsed = 0;
    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadCheckRuns: async ({ checkName }) =>
          checkPage(checkName, 'completed', 'success'),
        loadLiveQueueEntries: async () => [liveEntry()],
        loadQueueRef: async () => {
          throw new MergeGroupAdmissionError(
            'GitHub API 403 for /repos/x/git/ref/y: API rate limit exceeded for installation',
            { status: 403 }
          );
        },
        maxWaitMs: 6,
        now: () => elapsed,
        onStatus: () => {},
        pollIntervalMs: 3,
        sleep: async delayMs => {
          elapsed += delayMs;
        },
      })
    ).rejects.toThrow(/within 6ms \(still pending: GitHub API unavailable/);
  });

  it('treats only rate-limit, timeout and gateway signatures as retryable', () => {
    const graphqlLimit = new MergeGroupAdmissionError(
      'live merge queue GraphQL returned errors: API rate limit already exceeded for site ID installation.'
    );
    expect(isTransientApiError(graphqlLimit)).toBe(true);
    expect(
      isTransientApiError(
        new MergeGroupAdmissionError(
          'GitHub API 429 for /x: secondary rate limit',
          {
            status: 429,
          }
        )
      )
    ).toBe(true);
    expect(
      isTransientApiError(
        new MergeGroupAdmissionError(
          'GitHub API 403 for /x: Resource not accessible',
          {
            status: 403,
          }
        )
      )
    ).toBe(false);
    expect(
      isTransientApiError(
        new MergeGroupAdmissionError(
          'live merge queue GraphQL returned errors: Not found'
        )
      )
    ).toBe(false);
    expect(
      isTransientApiError(
        new MergeGroupAdmissionError(
          'PR Size Guard completed with rate limit failure'
        )
      )
    ).toBe(false);
    expect(isTransientApiError(new Error('API rate limit exceeded'))).toBe(
      false
    );
    // Run 37156957426 (2026-10-03 22:02Z) failed a valid group on a 10 s abort.
    expect(
      isTransientApiError(
        new MergeGroupAdmissionError(
          'GitHub API request failed for /graphql: The operation was aborted due to timeout'
        )
      )
    ).toBe(true);
    expect(
      isTransientApiError(
        new MergeGroupAdmissionError(
          'GitHub API 502 for /graphql: Bad Gateway',
          {
            status: 502,
          }
        )
      )
    ).toBe(true);
    expect(
      isTransientApiError(
        new MergeGroupAdmissionError(
          'GitHub API request failed for /graphql: getaddrinfo ENOTFOUND'
        )
      )
    ).toBe(false);
    expect(
      isTransientApiError(
        new MergeGroupAdmissionError('GitHub API 500 for /graphql: boom', {
          status: 500,
        })
      )
    ).toBe(false);
  });

  it('defaults to a multi-minute admission budget', () => {
    expect(MERGE_GROUP_ADMISSION_WAIT_MS).toBe(360_000);
  });
});

const QUOTA_RESPONSE_NOW = Date.parse('2026-10-03T12:00:00Z');
const INSTALLATION_QUOTA =
  'API rate limit already exceeded for site ID installation.';
const STRUCTURED_QUOTA = { type: 'RATE_LIMITED', message: 'quota exhausted' };
const resetHeaders = (delayMs, skewMs = 0) => ({
  date: new Date(QUOTA_RESPONSE_NOW + skewMs).toUTCString(),
  'x-ratelimit-remaining': '0',
  'x-ratelimit-reset': String((QUOTA_RESPONSE_NOW + skewMs + delayMs) / 1_000),
});
const graphqlQuotaResponse = (headers = {}, errors = [STRUCTURED_QUOTA]) =>
  Response.json({ ...liveQueuePayload([null]), errors }, { headers });
const completeProofKinds = [
  'graphql',
  'ref',
  'Fork PR Gate',
  'PR Size Guard',
  'ref',
  'graphql',
];

async function withQuotaResponses(respond, verify) {
  const directory = await mkdtemp(
    join(tmpdir(), 'merge-admission-http-quota-')
  );
  const eventPath = join(directory, 'event.json');
  const outputPath = join(directory, 'output.txt');
  await writeFile(eventPath, JSON.stringify(event()), 'utf8');
  const state = { elapsed: 0, requests: [], sleeps: [] };
  const fetchTasks = [];
  const expectedFetchErrors = new Set();
  state.output = () => readFile(outputPath, 'utf8');
  state.noOutput = () =>
    expect(state.output()).rejects.toMatchObject({ code: 'ENOENT' });
  const env = {
    GH_TOKEN: 'test-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: outputPath,
    GITHUB_REPOSITORY: 'JovieInc/Jovie',
    GITHUB_SHA: HEAD,
  };
  state.run = () =>
    runAdmissionFromEnv(env, {
      now: () => QUOTA_RESPONSE_NOW + state.elapsed,
      onStatus: () => {},
      sleep: async delayMs => {
        await state.noOutput();
        state.sleeps.push(delayMs);
        state.elapsed += delayMs;
      },
      fetchImpl: (url, init) => {
        const task = (async () => {
          const kind = url.endsWith('/graphql')
            ? 'graphql'
            : url.includes('/git/ref/')
              ? 'ref'
              : new URL(url).searchParams.get('check_name');
          const request = {
            kind,
            at: state.elapsed,
            cursor:
              kind === 'graphql'
                ? JSON.parse(init.body).variables.cursor
                : null,
          };
          // Record before asynchronous file reads to preserve concurrent call order.
          state.requests.push(request);
          await state.noOutput();
          const response = await respond(request, state);
          if (response instanceof Error) {
            expectedFetchErrors.add(response);
            throw response;
          }
          if (response) return response;
          if (kind === 'graphql')
            return Response.json(liveQueuePayload([liveQueueNode()]));
          if (kind === 'ref') return Response.json(queueRef());
          expect(['Fork PR Gate', 'PR Size Guard']).toContain(kind);
          return Response.json(checkPage(kind, 'completed', 'success').data);
        })();
        fetchTasks.push(task);
        return task;
      },
    });
  let verificationError;
  let verificationFailed = false;
  try {
    await verify(state);
  } catch (error) {
    verificationFailed = true;
    verificationError = error;
  }
  const settled = await Promise.allSettled(fetchTasks);
  let cleanupError;
  try {
    await rm(directory, { force: true, recursive: true });
  } catch (error) {
    cleanupError = error;
  }
  if (verificationFailed) throw verificationError;
  const rejected = settled.find(
    result =>
      result.status === 'rejected' && !expectedFetchErrors.has(result.reason)
  );
  if (rejected) throw rejected.reason;
  if (cleanupError) throw cleanupError;
}

describe('HTTP quota scheduling and structured GraphQL errors', () => {
  it.each([
    [403, 'ref'],
    [429, 'PR Size Guard'],
  ])(
    'honors REST %s Retry-After and repeats every proof after %s',
    async (status, limitedKind) => {
      await withQuotaResponses(
        (request, state) => {
          if (request.kind === limitedKind && state.sleeps.length === 0) {
            return Response.json(
              { message: 'API rate limit exceeded' },
              {
                status,
                headers: { 'retry-after': '120' },
              }
            );
          }
        },
        async state => {
          await expect(state.run()).resolves.toMatchObject({ admitted: true });
          expect(state.sleeps).toEqual([121_000]);
          const fresh = state.requests.filter(request => request.at > 0);
          expect(fresh.map(request => request.kind)).toEqual(
            completeProofKinds
          );
          expect(fresh.every(request => request.at >= 121_000)).toBe(true);
          await expect(state.output()).resolves.toContain(
            'admitted=true\nobsolete=false'
          );
        }
      );
    }
  );

  it.each([
    [STRUCTURED_QUOTA, -60_000, '60', 91_000],
    [{ message: INSTALLATION_QUOTA }, 60_000, null, 121_000],
    [
      { message: 'API rate limit already exceeded for installation ID 12345.' },
      0,
      null,
      121_000,
    ],
  ])(
    'restarts complete pages for GraphQL quota %j',
    async (error, skew, seconds, waitMs) => {
      let pages = 0;
      await withQuotaResponses(
        request => {
          if (request.kind !== 'graphql') return;
          pages += 1;
          if (pages === 1) {
            return Response.json(
              liveQueuePayload([liveQueueNode()], {
                hasNextPage: true,
                endCursor: 'old-page-2',
              })
            );
          }
          if (pages === 2) {
            return graphqlQuotaResponse(
              {
                ...resetHeaders(90_000, skew),
                'retry-after':
                  seconds ??
                  new Date(QUOTA_RESPONSE_NOW + skew + 120_000).toUTCString(),
              },
              [error]
            );
          }
          return Response.json(
            liveQueuePayload([liveQueueNode({ id: 'MQE_fresh' })])
          );
        },
        async state => {
          await expect(state.run()).resolves.toMatchObject({
            admitted: true,
            liveEntry: { id: 'MQE_fresh' },
          });
          expect(state.sleeps).toEqual([waitMs]);
          expect(
            state.requests
              .filter(request => request.kind === 'graphql')
              .map(request => request.cursor)
          ).toEqual([null, 'old-page-2', null, null]);
          expect(state.requests.slice(2).map(request => request.kind)).toEqual(
            completeProofKinds
          );
          expect(state.requests[2].at).toBe(waitMs);
        }
      );
    }
  );

  it.each([
    [
      'mixed',
      [
        { type: 'FORBIDDEN', message: 'denied' },
        { type: 'RATE_LIMITED', message: INSTALLATION_QUOTA },
      ],
    ],
    [
      'reversed mixed',
      [
        { type: 'RATE_LIMITED', message: INSTALLATION_QUOTA },
        { message: 'not found' },
      ],
    ],
    ...['FORBIDDEN', null, {}, ''].map(type => [
      `explicit type ${JSON.stringify(type)}`,
      [{ type, message: INSTALLATION_QUOTA }],
    ]),
  ])(
    'fails immediately on %s despite valid quota headers',
    async (_, errors) => {
      for (const status of [200, 403, 429, 502, 503, 504]) {
        await withQuotaResponses(
          () =>
            Response.json(
              {
                ...liveQueuePayload([liveQueueNode()]),
                errors,
              },
              { status, headers: { 'retry-after': '120' } }
            ),
          async state => {
            await expect(state.run()).rejects.toThrow();
            expect(state.requests).toHaveLength(1);
            expect(state.sleeps).toEqual([]);
            await state.noOutput();
          }
        );
      }
    }
  );

  it.each([401, 500])(
    'keeps HTTP %s nonretryable despite quota text',
    async status => {
      await withQuotaResponses(
        () =>
          Response.json(
            {
              message: INSTALLATION_QUOTA,
              errors: [STRUCTURED_QUOTA],
            },
            { status, headers: { 'retry-after': '120' } }
          ),
        async state => {
          await expect(state.run()).rejects.toThrow(`GitHub API ${status}`);
          expect(state.requests).toHaveLength(1);
          expect(state.sleeps).toEqual([]);
          await state.noOutput();
        }
      );
    }
  );

  it.each([
    ['malformed retry', { 'retry-after': '120seconds' }],
    ['negative retry', { 'retry-after': '-1' }],
    ['overflow retry', { 'retry-after': '999999999999999999999999' }],
    [
      'invalid reset with valid retry',
      {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': 'invalid',
        'retry-after': '120',
      },
    ],
    [
      'invalid remaining',
      { ...resetHeaders(120_000), 'x-ratelimit-remaining': '0x' },
    ],
    ['invalid response date', { 'retry-after': '120', date: 'invalid' }],
    ['reset beyond budget', resetHeaders(400_000)],
    ['insufficient request allowance', { 'retry-after': '350' }],
  ])('does not retry early for %s', async (_, headers) => {
    await withQuotaResponses(
      () => graphqlQuotaResponse(headers),
      async state => {
        await expect(state.run()).rejects.toThrow(
          /quota|rate.limit|deadline|reset/i
        );
        expect(state.requests).toHaveLength(1);
        expect(state.sleeps).toEqual([]);
        await state.noOutput();
      }
    );
  });

  it.each([{}, { 'retry-after': '2' }])(
    'uses only current headers while retaining the 15s floor: %j',
    async headers => {
      await withQuotaResponses(
        (_, state) => {
          if (state.requests.length === 1)
            return graphqlQuotaResponse(resetHeaders(120_000));
          if (state.requests.length === 2) return graphqlQuotaResponse(headers);
        },
        async state => {
          await expect(state.run()).resolves.toMatchObject({ admitted: true });
          expect(state.sleeps).toEqual([121_000, 15_000]);
          expect(state.requests[2].at).toBe(136_000);
        }
      );
    }
  );

  it('keeps all retries inside the original absolute deadline', async () => {
    await withQuotaResponses(
      (_, state) =>
        graphqlQuotaResponse({
          'retry-after': state.requests.length === 1 ? '339' : '20',
        }),
      async state => {
        await expect(state.run()).rejects.toThrow(
          /quota|rate.limit|deadline|reset/i
        );
        expect(state.requests).toHaveLength(2);
        expect(state.requests[1].at).toBe(340_000);
        expect(state.sleeps).toEqual([340_000]);
        await state.noOutput();
      }
    );
  });

  it('retains 15s no-header retries and healthy polling without a new wait cap', async () => {
    await withQuotaResponses(
      (request, state) => {
        if (request.kind === 'graphql' && state.sleeps.length < 3) {
          return graphqlQuotaResponse({}, [{ message: INSTALLATION_QUOTA }]);
        }
        if (request.kind === 'PR Size Guard' && state.sleeps.length === 3) {
          return Response.json(checkPage(request.kind, 'in_progress').data);
        }
      },
      async state => {
        await expect(state.run()).resolves.toMatchObject({ admitted: true });
        expect(state.sleeps).toEqual([15_000, 15_000, 15_000, 15_000]);
        expect(
          state.requests
            .filter(request => request.kind === 'graphql')
            .map(request => request.at)
        ).toEqual([0, 15_000, 30_000, 45_000, 60_000, 60_000]);
      }
    );
  });

  it.each(['success', 'failing gate', 'changed source'])(
    'invalidates pre-wait final proof: %s',
    async outcome => {
      let pages = 0;
      await withQuotaResponses(
        (request, state) => {
          if (request.kind === 'graphql') {
            pages += 1;
            if (pages === 2)
              return graphqlQuotaResponse({ 'retry-after': '20' });
            if (state.sleeps.length) {
              return Response.json(
                liveQueuePayload([
                  liveQueueNode({
                    id: 'MQE_reenqueued',
                    enqueuer: {
                      __typename: 'Bot',
                      login: 'another-native-writer',
                    },
                    pullRequest: {
                      baseRefName: 'main',
                      number: 123,
                      headRefOid:
                        outcome === 'changed source'
                          ? '5'.repeat(40)
                          : SOURCE_HEAD,
                    },
                  }),
                ])
              );
            }
          }
          if (
            request.kind === 'Fork PR Gate' &&
            state.sleeps.length &&
            outcome === 'failing gate'
          ) {
            return Response.json(
              checkPage(request.kind, 'completed', 'failure').data
            );
          }
        },
        async state => {
          if (outcome === 'success') {
            await expect(state.run()).resolves.toMatchObject({
              admitted: true,
              liveEntry: { id: 'MQE_reenqueued' },
            });
          } else {
            await expect(state.run()).rejects.toThrow(
              outcome === 'failing gate'
                ? /Fork PR Gate completed with failure/
                : /source head changed/
            );
            await state.noOutput();
          }
          expect(state.sleeps).toEqual([21_000]);
          if (outcome === 'changed source') expect(pages).toBe(3);
          if (outcome !== 'changed source') {
            expect(
              state.requests
                .filter(request => request.at > 0)
                .map(request => request.kind)
            ).toEqual(
              outcome === 'success'
                ? completeProofKinds
                : completeProofKinds.slice(0, 4)
            );
          }
        }
      );
    }
  );
});

it('keeps mixed GraphQL responses terminal through normalization', () => {
  let captured;
  try {
    normalizeLiveQueueEntriesPage({
      errors: [
        { type: 'FORBIDDEN', message: 'Resource not accessible' },
        { type: 'RATE_LIMITED', message: 'API rate limit exceeded' },
      ],
    });
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeInstanceOf(MergeGroupAdmissionError);
  expect(isTransientApiError(captured)).toBe(false);
});

it.each(['RATE_LIMITED', {}, null, 0, false])(
  'rejects malformed GraphQL errors %j even beside valid queue data',
  async errors => {
    for (const status of [200, 403, 429, 502, 503, 504]) {
      await withQuotaResponses(
        () =>
          Response.json(
            {
              ...liveQueuePayload([liveQueueNode()]),
              errors,
              message: 'API rate limit exceeded',
            },
            { status, headers: { 'retry-after': '120' } }
          ),
        async state => {
          await expect(state.run()).rejects.toThrow(/errors must be an array/);
          expect(state.requests).toHaveLength(1);
          expect(state.sleeps).toEqual([]);
          await state.noOutput();
        }
      );
    }
  }
);

it('retains empty GraphQL errors beside valid queue data', async () => {
  await withQuotaResponses(
    request => {
      if (request.kind === 'graphql') {
        return Response.json({
          ...liveQueuePayload([liveQueueNode()]),
          errors: [],
        });
      }
    },
    async state => {
      await expect(state.run()).resolves.toMatchObject({ admitted: true });
      expect(state.sleeps).toEqual([]);
    }
  );
});

const transientFailure = status =>
  status === 'timeout'
    ? new Error('The operation was aborted due to timeout')
    : Response.json({ message: 'GitHub gateway unavailable' }, { status });

describe('retained transient recovery with fresh admission proof', () => {
  it.each([
    ['timeout', 'graphql'],
    [502, 'ref'],
    [503, 'Fork PR Gate'],
    [504, 'graphql'],
  ])('restarts every proof after %s from %s', async (status, failedKind) => {
    let failed = false;
    await withQuotaResponses(
      request => {
        if (!failed && request.kind === failedKind) {
          failed = true;
          return transientFailure(status);
        }
      },
      async state => {
        await expect(state.run()).resolves.toMatchObject({ admitted: true });
        expect(state.sleeps).toEqual([15_000]);
        expect(
          state.requests
            .filter(request => request.at > 0)
            .map(request => request.kind)
        ).toEqual(completeProofKinds);
        await expect(state.output()).resolves.toContain(
          'admitted=true\nobsolete=false'
        );
      }
    );
  });

  it.each(['timeout', 502, 503, 504])(
    'rejects a changed source after final-read %s',
    async status => {
      let pages = 0;
      await withQuotaResponses(
        request => {
          if (request.kind !== 'graphql') return;
          pages += 1;
          if (pages === 2) return transientFailure(status);
          if (pages > 2) {
            return Response.json(
              liveQueuePayload([
                liveQueueNode({
                  pullRequest: {
                    baseRefName: 'main',
                    number: 123,
                    headRefOid: '5'.repeat(40),
                  },
                }),
              ])
            );
          }
        },
        async state => {
          await expect(state.run()).rejects.toThrow(/source head changed/);
          expect(state.sleeps).toEqual([15_000]);
          expect(pages).toBe(3);
          expect(
            state.requests
              .filter(request => request.at > 0)
              .map(request => request.kind)
          ).toEqual(['graphql']);
          await state.noOutput();
        }
      );
    }
  );
});

it.each([502, 503, 504])(
  'honors structured GraphQL quota cooldown inside gateway %s',
  async status => {
    await withQuotaResponses(
      (_, state) => {
        if (state.requests.length === 1) {
          return Response.json(
            {
              ...liveQueuePayload([liveQueueNode()]),
              errors: [STRUCTURED_QUOTA],
              message: 'GitHub gateway unavailable',
            },
            { status, headers: { 'retry-after': '120' } }
          );
        }
      },
      async state => {
        await expect(state.run()).resolves.toMatchObject({ admitted: true });
        expect(state.sleeps).toEqual([121_000]);
        expect(state.requests.slice(1).map(request => request.kind)).toEqual(
          completeProofKinds
        );
        expect(
          state.requests.slice(1).every(request => request.at >= 121_000)
        ).toBe(true);
        await expect(state.output()).resolves.toContain(
          'admitted=true\nobsolete=false'
        );
      }
    );
  }
);
