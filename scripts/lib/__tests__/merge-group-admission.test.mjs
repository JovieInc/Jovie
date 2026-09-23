import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  ADMISSION_CONTRACT_VERSION,
  buildLiveQueueAdmissionReceipt,
  classifyNativeQueueAdmissionEvent,
  classifyRequiredCheckPage,
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

function admissionTimeline(overrides = {}) {
  return {
    data: {
      repository: {
        pullRequest: {
          timelineItems: {
            nodes: [
              {
                __typename: 'AddedToMergeQueueEvent',
                actor: { __typename: 'Bot', login: 'jovie-bot' },
                createdAt: ADMITTED_AT,
                enqueuer: { login: 'jovie-bot[bot]' },
                id: 'MQAE_123',
                ...overrides,
              },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      },
    },
  };
}

function verifiedEvent() {
  return { id: 'MQAE_123', state: 'verified' };
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
  it('accepts a native GitHub user admission without an Auto-Enroll receipt', () => {
    expect(
      classifyNativeQueueAdmissionEvent(
        admissionTimeline({
          actor: { __typename: 'User', login: 'itstimwhite' },
          enqueuer: { login: 'itstimwhite' },
        })
      )
    ).toMatchObject({ state: 'verified' });
  });

  it('exposes the typed CLI contract without requiring runtime credentials', () => {
    expect(
      execFileSync(
        process.execPath,
        [ADMISSION_SCRIPT, '--print-contract-version'],
        { encoding: 'utf8' }
      ).trim()
    ).toBe(ADMISSION_CONTRACT_VERSION);
  });

  it('runs the GitHub adapter for a native user without custom receipt lookups', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'merge-admission-'));
    const eventPath = join(directory, 'event.json');
    const outputPath = join(directory, 'output.txt');
    await writeFile(eventPath, JSON.stringify(event()), 'utf8');
    const requests = [];
    const fetchImpl = vi.fn(async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith('/graphql')) {
        const body = JSON.parse(init.body);
        if (body.query.includes('MergeGroupAdmissionTimeline')) {
          return Response.json(
            admissionTimeline({
              actor: { __typename: 'User', login: 'itstimwhite' },
              enqueuer: { login: 'itstimwhite' },
            })
          );
        }
        return Response.json(liveQueuePayload([liveQueueNode()]));
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
      expect(requests).toHaveLength(8);
      expect(
        requests.filter(request => request.url.endsWith('/graphql'))
      ).toHaveLength(4);
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
  });

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

  it('accepts authenticated native User and Bot queue events', () => {
    for (const actor of [
      { __typename: 'User', login: 'itstimwhite' },
      { __typename: 'Bot', login: 'jovie-bot' },
    ]) {
      expect(
        classifyNativeQueueAdmissionEvent(
          admissionTimeline({
            actor,
            enqueuer: { login: actor.login },
          })
        )
      ).toMatchObject({
        admittedAt: '2026-09-06T20:29:15.000Z',
        actor: actor.login,
        enqueuer: actor.login,
        state: 'verified',
      });
    }
  });

  it('fails closed on incomplete or malformed admission timeline evidence', () => {
    for (const timeline of [
      null,
      { errors: [{ message: 'denied' }] },
      admissionTimeline({ actor: null }),
      admissionTimeline({ enqueuer: null }),
      admissionTimeline({ createdAt: 'not-a-date' }),
      admissionTimeline({ id: '' }),
      admissionTimeline({
        actor: { __typename: 'Organization', login: 'jovie' },
      }),
    ]) {
      expect(() => classifyNativeQueueAdmissionEvent(timeline)).toThrow();
    }
    const partial = admissionTimeline();
    partial.data.repository.pullRequest.timelineItems.pageInfo.hasNextPage = true;
    expect(() => classifyNativeQueueAdmissionEvent(partial)).toThrow(
      /incomplete/
    );
    const removed = admissionTimeline({
      __typename: 'RemovedFromMergeQueueEvent',
    });
    expect(classifyNativeQueueAdmissionEvent(removed)).toMatchObject({
      state: 'pending',
    });
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
      loadQueueEvent: verifiedEvent,
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
        loadQueueEvent: verifiedEvent,
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
      loadQueueEvent: verifiedEvent,
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
      loadQueueEvent: verifiedEvent,
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
      loadQueueEvent: verifiedEvent,
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

  it('rechecks the native queue event after external gates pass', async () => {
    const loadQueueEvent = vi
      .fn()
      .mockResolvedValueOnce(verifiedEvent())
      .mockResolvedValueOnce({ id: 'MQAE_changed', state: 'verified' });

    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadQueueEvent,
        loadCheckRuns: async ({ checkName }) =>
          checkPage(checkName, 'completed', 'success'),
        loadLiveQueueEntries: async () => [liveEntry()],
        loadQueueRef: async () => queueRef(),
        maxWaitMs: 10,
        pollIntervalMs: 3,
      })
    ).rejects.toThrow(/native queue event changed during admission/);
    expect(loadQueueEvent).toHaveBeenCalledTimes(2);
  });

  it('waits for the native Added event without an Auto-Enroll status', async () => {
    let elapsed = 0;
    const loadQueueEvent = vi
      .fn()
      .mockResolvedValueOnce({ state: 'pending', detail: 'event not visible' })
      .mockResolvedValue(verifiedEvent());
    const result = await waitForMergeGroupAdmission({
      event: event(),
      loadQueueEvent,
      loadCheckRuns: async ({ checkName }) =>
        checkPage(checkName, 'completed', 'success'),
      loadLiveQueueEntries: async () => [liveEntry()],
      loadQueueRef: async () => queueRef(),
      maxWaitMs: 10,
      now: () => elapsed,
      onStatus: () => {},
      pollIntervalMs: 3,
      sleep: async delayMs => {
        elapsed += delayMs;
      },
    });
    expect(result.receipt.admissionEvent.id).toBe('MQAE_123');
    expect(loadQueueEvent).toHaveBeenCalledTimes(3);
  });

  it('rejects a source head that changes during final queue reread', async () => {
    const loadLiveQueueEntries = vi
      .fn()
      .mockResolvedValueOnce([liveEntry()])
      .mockResolvedValueOnce([liveEntry({ sourceHeadSha: '5'.repeat(40) })]);
    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadQueueEvent: verifiedEvent,
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
      loadQueueEvent: verifiedEvent,
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
        loadQueueEvent: verifiedEvent,
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
});
