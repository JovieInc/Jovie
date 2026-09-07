import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  ADMISSION_CONTRACT_VERSION,
  buildLiveQueueAdmissionReceipt,
  classifyCanonicalAdmissionProvenance,
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
const RECEIPT_AT = '2026-09-06T20:29:25Z';

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

function admissionStatus(overrides = {}) {
  return {
    context: 'jovie-queue-admission/v2',
    creator: { login: 'jovie-bot[bot]', type: 'Bot' },
    description: `checkpoint=verified;main=${BASE};pr=123`,
    id: 987,
    state: 'success',
    target_url: 'https://github.com/JovieInc/Jovie/actions/runs/123456789',
    updated_at: RECEIPT_AT,
    ...overrides,
  };
}

function admissionRun(overrides = {}) {
  return {
    conclusion: 'success',
    created_at: '2026-09-06T20:29:00Z',
    event: 'workflow_run',
    head_branch: 'main',
    head_repository: { full_name: 'JovieInc/Jovie' },
    head_sha: BASE,
    html_url: 'https://github.com/JovieInc/Jovie/actions/runs/123456789',
    id: 123456789,
    name: 'Merge Queue Auto-Enroll',
    path: '.github/workflows/merge-queue-autoenroll.yml',
    repository: { full_name: 'JovieInc/Jovie' },
    run_attempt: 1,
    status: 'completed',
    updated_at: '2026-09-06T20:29:30Z',
    ...overrides,
  };
}

function preservedLineage(checkpointMainSha, baseSha = BASE) {
  return {
    base_commit: { sha: checkpointMainSha },
    commits: [{ sha: baseSha }],
    merge_base_commit: { sha: checkpointMainSha },
    status: 'ahead',
  };
}

function verifiedProvenance() {
  return { checkpoint: 'verified', state: 'verified' };
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

  it('runs the paginated GitHub adapter and writes exact action outputs', async () => {
    const checkpointMainSha = '9'.repeat(40);
    const directory = await mkdtemp(join(tmpdir(), 'merge-admission-'));
    const eventPath = join(directory, 'event.json');
    const outputPath = join(directory, 'output.txt');
    const summaryPath = join(directory, 'summary.md');
    await writeFile(eventPath, JSON.stringify(event()), 'utf8');
    const requests = [];
    const fetchImpl = vi.fn(async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith('/graphql')) {
        const body = JSON.parse(init.body);
        if (body.query.includes('MergeGroupAdmissionTimeline')) {
          return Response.json(admissionTimeline());
        }
        const cursor = body.variables.cursor;
        return Response.json(
          cursor
            ? liveQueuePayload([liveQueueNode()])
            : liveQueuePayload([], {
                endCursor: 'page-2',
                hasNextPage: true,
              })
        );
      }
      if (url.includes('/git/ref/')) return Response.json(queueRef());
      if (url.includes('/statuses?')) {
        return Response.json([
          admissionStatus({
            description: `checkpoint=verified;main=${checkpointMainSha};pr=123`,
          }),
        ]);
      }
      if (url.includes('/actions/runs/123456789')) {
        return Response.json(
          admissionRun({
            conclusion: 'success',
            head_sha: checkpointMainSha,
            status: 'completed',
          })
        );
      }
      if (url.includes('/compare/')) {
        return Response.json(preservedLineage(checkpointMainSha));
      }
      const checkName = new URL(url).searchParams.get('check_name');
      return Response.json(checkPage(checkName, 'completed', 'success').data);
    });
    const env = {
      GH_TOKEN: 'test-token',
      GITHUB_API_URL: 'https://api.github.test',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      GITHUB_REPOSITORY: 'JovieInc/Jovie',
      GITHUB_RUN_ATTEMPT: '2',
      GITHUB_RUN_ID: '123456789',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_SHA: HEAD,
      GITHUB_STEP_SUMMARY: summaryPath,
    };

    try {
      await expect(
        runAdmissionFromEnv(env, { fetchImpl })
      ).resolves.toMatchObject({ admitted: true, pr: 123, syntheticSha: HEAD });
      expect(
        requests.filter(request => request.url.endsWith('/graphql'))
      ).toHaveLength(6);
      expect(
        requests.filter(request => request.url.includes('/compare/'))
      ).toHaveLength(2);
      expect(
        requests.every(request =>
          request.url.startsWith('https://api.github.test/')
        )
      ).toBe(true);
      for (const { init } of requests) {
        expect(init).toMatchObject({
          cache: 'no-store',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer test-token',
            'Cache-Control': 'no-cache',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });
      }
      await expect(readFile(outputPath, 'utf8')).resolves.toContain(
        `admitted=true\nobsolete=false\npr_number=123\nsynthetic_head_sha=${HEAD}`
      );
      await expect(readFile(summaryPath, 'utf8')).resolves.toContain(
        'Merge-group live queue admission'
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

  it.each([
    'verified',
    'controller-repair',
    'deploy-hold',
  ])('requires canonical Jovie Bot admission with an exact %s checkpoint receipt', checkpoint => {
    expect(
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        runPayload: admissionRun(),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [
            admissionStatus({
              description: `checkpoint=${checkpoint};main=${BASE};pr=123`,
            }),
          ],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toEqual({
      admittedAt: '2026-09-06T20:29:15.000Z',
      checkpoint,
      checkpointMainSha: BASE,
      receiptAt: '2026-09-06T20:29:25.000Z',
      state: 'verified',
    });
  });

  it('preserves a v2 canonical cohort when its checkpoint main is an ancestor of the merge-group base', () => {
    const checkpointMainSha = '9'.repeat(40);
    expect(
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        lineagePayload: preservedLineage(checkpointMainSha),
        runPayload: admissionRun({
          conclusion: 'success',
          head_sha: checkpointMainSha,
          status: 'completed',
        }),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [
            admissionStatus({
              description: `checkpoint=verified;main=${checkpointMainSha};pr=123`,
            }),
          ],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toMatchObject({
      checkpoint: 'verified',
      checkpointMainSha,
      state: 'verified',
    });
  });

  it('accepts an exact producer that is still processing later admissions', () => {
    const checkpointMainSha = '9'.repeat(40);
    expect(
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        lineagePayload: preservedLineage(checkpointMainSha),
        runPayload: admissionRun({
          conclusion: null,
          head_sha: checkpointMainSha,
          status: 'in_progress',
        }),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [
            admissionStatus({
              description: `checkpoint=verified;main=${checkpointMainSha};pr=123`,
            }),
          ],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toMatchObject({
      checkpoint: 'verified',
      checkpointMainSha,
      state: 'verified',
    });
  });

  it('accepts a pull-request producer whose event head differs from the independently attested main checkpoint', () => {
    const checkpointMainSha = '9'.repeat(40);
    expect(
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        lineagePayload: preservedLineage(checkpointMainSha),
        runPayload: admissionRun({
          event: 'pull_request',
          head_branch: 'feature/admission-trigger',
          head_sha: SOURCE_HEAD,
        }),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [
            admissionStatus({
              description: `checkpoint=verified;main=${checkpointMainSha};pr=123`,
            }),
          ],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toMatchObject({
      checkpoint: 'verified',
      checkpointMainSha,
      state: 'verified',
    });
  });

  it('preserves an earlier per-PR receipt when later cohort work makes the producer fail', () => {
    const checkpointMainSha = '9'.repeat(40);
    expect(
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        lineagePayload: preservedLineage(checkpointMainSha),
        runPayload: admissionRun({
          conclusion: 'failure',
          head_sha: checkpointMainSha,
        }),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [
            admissionStatus({
              description: `checkpoint=verified;main=${checkpointMainSha};pr=123`,
            }),
          ],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toMatchObject({
      checkpoint: 'verified',
      checkpointMainSha,
      state: 'verified',
    });
  });

  it('waits for a canonical admission producer that has not started', () => {
    const checkpointMainSha = '9'.repeat(40);
    expect(
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        lineagePayload: preservedLineage(checkpointMainSha),
        runPayload: admissionRun({
          conclusion: null,
          head_sha: checkpointMainSha,
          status: 'queued',
        }),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [
            admissionStatus({
              description: `checkpoint=verified;main=${checkpointMainSha};pr=123`,
            }),
          ],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toEqual({
      detail: 'canonical admission producer has not started',
      state: 'pending',
    });
  });

  it.each([
    [
      'producer created after admission',
      {
        status: 'completed',
        conclusion: 'success',
        created_at: '2026-09-06T20:29:16Z',
      },
    ],
    [
      'producer run updated before creation',
      {
        status: 'completed',
        conclusion: 'success',
        updated_at: '2026-09-06T20:28:59Z',
      },
    ],
    [
      'in-progress producer with a terminal conclusion',
      { status: 'in_progress', conclusion: 'failure' },
    ],
    [
      'completed producer without a terminal conclusion',
      { status: 'completed', conclusion: null },
    ],
  ])('rejects a preserved v2 receipt from a %s', (_label, runOverrides) => {
    const checkpointMainSha = '9'.repeat(40);
    expect(() =>
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        lineagePayload: preservedLineage(checkpointMainSha),
        runPayload: admissionRun({
          head_sha: checkpointMainSha,
          ...runOverrides,
        }),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [
            admissionStatus({
              description: `checkpoint=verified;main=${checkpointMainSha};pr=123`,
            }),
          ],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toThrow(/identity is inconsistent/);
  });

  it('rejects a completed producer run whose receipt was written after completion', () => {
    const checkpointMainSha = '9'.repeat(40);
    expect(() =>
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        lineagePayload: preservedLineage(checkpointMainSha),
        runPayload: admissionRun({
          head_sha: checkpointMainSha,
          updated_at: '2026-09-06T20:29:24Z',
        }),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [
            admissionStatus({
              description: `checkpoint=verified;main=${checkpointMainSha};pr=123`,
            }),
          ],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toThrow(/identity is inconsistent/);
  });

  it.each([
    'behind',
    'diverged',
  ])('rejects a %s preserved checkpoint lineage', status => {
    const checkpointMainSha = '9'.repeat(40);
    expect(() =>
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        lineagePayload: {
          ...preservedLineage(checkpointMainSha),
          status,
        },
        runPayload: admissionRun({
          conclusion: 'success',
          head_sha: checkpointMainSha,
          status: 'completed',
        }),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [
            admissionStatus({
              description: `checkpoint=verified;main=${checkpointMainSha};pr=123`,
            }),
          ],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toThrow(/not an ancestor/);
  });

  it('does not upgrade the observed pre-v2 receipt into canonical admission evidence', () => {
    expect(
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: '1b2eb7dc9d5e659622b43f34fd58222daa7d961e',
          prNumber: 17415,
          repository: 'JovieInc/Jovie',
        },
        runPayload: null,
        sourceHeadSha: 'cfe57a252fe1d58480b63c0e98ca98e81d5872ed',
        statusPayload: {
          link: null,
          sha: 'cfe57a252fe1d58480b63c0e98ca98e81d5872ed',
          statuses: [
            {
              context: 'jovie-queue-reentry/v1',
              creator: { login: 'jovie-bot[bot]', type: 'Bot' },
              description: 'Native queue admission recorded at exact head',
              id: 53643701168,
              state: 'success',
              target_url:
                'https://github.com/JovieInc/Jovie/actions/runs/34070242354',
              updated_at: '2026-09-07T00:38:06Z',
            },
          ],
        },
        timelinePayload: admissionTimeline({
          createdAt: '2026-09-07T00:38:04Z',
          id: 'MQAE_PR_17415',
        }),
      })
    ).toEqual({ detail: 'admission receipt not visible', state: 'pending' });
  });

  it('rejects the observed Cursor direct-admission actor even with a valid receipt', () => {
    expect(() =>
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        runPayload: admissionRun(),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [admissionStatus()],
        },
        timelinePayload: admissionTimeline({
          actor: { __typename: 'Bot', login: 'cursor' },
          createdAt: '2026-09-06T20:29:15Z',
          enqueuer: { login: 'cursor[bot]' },
          id: 'MQAE_PR_17402',
        }),
      })
    ).toThrow(/admission actor is not jovie-bot\[bot\]/);
  });

  it.each([
    ['before the latest admission', '2026-09-06T20:29:14Z'],
    ['more than five minutes after admission', '2026-09-06T20:34:16Z'],
  ])('rejects a receipt written %s', (_label, updatedAt) => {
    expect(() =>
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        runPayload: admissionRun(),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [admissionStatus({ updated_at: updatedAt })],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toThrow(/not bound to the admission time/);
  });

  it('fails closed on an untrusted or cross-PR receipt and waits for a missing receipt', () => {
    const input = {
      evidence: {
        baseSha: BASE,
        prNumber: 123,
        repository: 'JovieInc/Jovie',
      },
      runPayload: admissionRun(),
      sourceHeadSha: SOURCE_HEAD,
      timelinePayload: admissionTimeline(),
    };
    expect(
      classifyCanonicalAdmissionProvenance({
        ...input,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [
            admissionStatus({
              creator: { login: 'cursor[bot]', type: 'Bot' },
            }),
          ],
        },
      })
    ).toEqual({ detail: 'admission receipt not visible', state: 'pending' });
    expect(() =>
      classifyCanonicalAdmissionProvenance({
        ...input,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [
            admissionStatus({
              description: `checkpoint=verified;main=${BASE};pr=17404`,
            }),
          ],
        },
      })
    ).toThrow(/not bound to the merge-group PR/);
    expect(() =>
      classifyCanonicalAdmissionProvenance({
        ...input,
        runPayload: admissionRun({ head_sha: '9'.repeat(40) }),
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [
            admissionStatus({
              description: `checkpoint=verified;main=${'9'.repeat(40)};pr=123`,
            }),
          ],
        },
      })
    ).toThrow(
      /producer run identity|checkpoint main|not an ancestor of merge-group base/
    );
    expect(
      classifyCanonicalAdmissionProvenance({
        ...input,
        statusPayload: { link: null, sha: SOURCE_HEAD, statuses: [] },
      })
    ).toEqual({ detail: 'admission receipt not visible', state: 'pending' });
  });

  it('fails closed on partial histories and retains an older malformed receipt', () => {
    const input = {
      evidence: {
        baseSha: BASE,
        prNumber: 123,
        repository: 'JovieInc/Jovie',
      },
      runPayload: admissionRun(),
      sourceHeadSha: SOURCE_HEAD,
    };
    expect(() =>
      classifyCanonicalAdmissionProvenance({
        ...input,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [admissionStatus()],
        },
        timelinePayload: {
          ...admissionTimeline(),
          errors: [{ message: 'partial timeline' }],
        },
      })
    ).toThrow(/timeline evidence is incomplete/);
    expect(() =>
      classifyCanonicalAdmissionProvenance({
        ...input,
        statusPayload: {
          link: '<https://api.github.test/statuses?page=2>; rel="next"',
          sha: SOURCE_HEAD,
          statuses: [admissionStatus()],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toThrow(/receipt listing is incomplete/);
    expect(
      classifyCanonicalAdmissionProvenance({
        ...input,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [
            admissionStatus(),
            admissionStatus({ id: 986, updated_at: 'not-a-date' }),
          ],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toMatchObject({ state: 'verified' });
  });

  it('rejects a receipt that points at any workflow except canonical Auto-Enroll', () => {
    const input = {
      evidence: {
        baseSha: BASE,
        prNumber: 123,
        repository: 'JovieInc/Jovie',
      },
      sourceHeadSha: SOURCE_HEAD,
      statusPayload: {
        link: null,
        sha: SOURCE_HEAD,
        statuses: [admissionStatus()],
      },
      timelinePayload: admissionTimeline(),
    };
    expect(() =>
      classifyCanonicalAdmissionProvenance({
        ...input,
        runPayload: admissionRun({ path: '.github/workflows/ci.yml' }),
      })
    ).toThrow(/malformed or untrusted/);
    expect(() =>
      classifyCanonicalAdmissionProvenance({
        ...input,
        runPayload: admissionRun({ id: 987654321 }),
      })
    ).toThrow(/malformed or untrusted/);
  });

  it.each([
    ['unsupported producer event', { event: 'schedule' }],
    [
      'pull-request run with a malformed immutable head',
      {
        event: 'pull_request',
        head_sha: 'not-a-sha',
      },
    ],
    [
      'main-scoped run from a non-main branch',
      {
        event: 'workflow_dispatch',
        head_branch: 'feature/not-main',
        head_sha: '8'.repeat(40),
      },
    ],
  ])('rejects a receipt from %s', (_label, runOverrides) => {
    expect(() =>
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        runPayload: admissionRun(runOverrides),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [admissionStatus()],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toThrow(/not bound to its admission scope/);
  });

  it('preserves a cohort receipt when a pull-request producer was triggered by another exact head', () => {
    const producerHead = '8'.repeat(40);
    expect(
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        runPayload: admissionRun({
          event: 'pull_request',
          head_branch: 'feature/cohort-trigger',
          head_sha: producerHead,
        }),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [admissionStatus()],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toMatchObject({ state: 'verified' });
  });

  it('preserves a main-scoped producer when main advances before policy evaluation', () => {
    expect(
      classifyCanonicalAdmissionProvenance({
        evidence: {
          baseSha: BASE,
          prNumber: 123,
          repository: 'JovieInc/Jovie',
        },
        runPayload: admissionRun({
          event: 'workflow_run',
          head_branch: 'main',
          head_sha: '8'.repeat(40),
        }),
        sourceHeadSha: SOURCE_HEAD,
        statusPayload: {
          link: null,
          sha: SOURCE_HEAD,
          statuses: [admissionStatus()],
        },
        timelinePayload: admissionTimeline(),
      })
    ).toMatchObject({ checkpointMainSha: BASE, state: 'verified' });
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

  it.each([
    'QUEUED',
    'AWAITING_CHECKS',
    'MERGEABLE',
    'UNMERGEABLE',
    'LOCKED',
  ])('admits the exact live synthetic head while queue state is %s', state => {
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
  });

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
      loadAdmissionProvenance: verifiedProvenance,
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
        loadAdmissionProvenance: verifiedProvenance,
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
      loadAdmissionProvenance: verifiedProvenance,
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

  it('fails when the queue ref disappears and never polls checks', async () => {
    const loadCheckRuns = vi.fn();
    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadAdmissionProvenance: verifiedProvenance,
        loadCheckRuns,
        loadLiveQueueEntries: async () => [liveEntry()],
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
    const loadLiveQueueEntries = vi.fn(async () => [liveEntry()]);
    const loadCheckRuns = vi.fn(async ({ checkName }) =>
      checkPage(checkName, 'completed', 'success')
    );

    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadAdmissionProvenance: verifiedProvenance,
        loadCheckRuns,
        loadLiveQueueEntries,
        loadQueueRef,
        maxWaitMs: 10,
        pollIntervalMs: 3,
      })
    ).rejects.toThrow(/queue ref is missing/);
    expect(loadLiveQueueEntries).toHaveBeenCalledTimes(1);
    expect(loadQueueRef).toHaveBeenCalledTimes(2);
  });

  it('rechecks canonical admission provenance after external gates pass', async () => {
    const loadAdmissionProvenance = vi
      .fn()
      .mockResolvedValueOnce(verifiedProvenance())
      .mockRejectedValueOnce(new Error('latest admission actor changed'));

    await expect(
      waitForMergeGroupAdmission({
        event: event(),
        loadAdmissionProvenance,
        loadCheckRuns: async ({ checkName }) =>
          checkPage(checkName, 'completed', 'success'),
        loadLiveQueueEntries: async () => [liveEntry()],
        loadQueueRef: async () => queueRef(),
        maxWaitMs: 10,
        pollIntervalMs: 3,
      })
    ).rejects.toThrow(/latest admission actor changed/);
    expect(loadAdmissionProvenance).toHaveBeenCalledTimes(2);
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
      loadAdmissionProvenance: verifiedProvenance,
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
        loadAdmissionProvenance: verifiedProvenance,
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
