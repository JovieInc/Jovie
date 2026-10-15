import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  apiRetryDelay,
  assertCurrentPullRequest,
  clearCachedGitHubResponses,
  enforceCombinedTreePayload,
  evaluateForkMemberPolicy,
  evaluateHoldMemberPolicy,
  evaluateSizeMemberPolicy,
  githubRequest,
  HOLD_LABELS,
  localCheckoutFromEvidence,
  MAX_API_ATTEMPTS,
  MERGE_GROUP_JOB_BUDGET_MS,
  MergeGroupPolicyRateLimitError,
  parseTrackedRegularTree,
  readBoundedResponseText,
  resolveMergeGroupMembers,
  runPolicy,
} from '../merge-group-member-policy.mjs';
import { HYGIENE_LIMITS } from '../repo-hygiene-limits.mjs';

const BASE = '1'.repeat(40);
const FIRST = '2'.repeat(40);
const HEAD = '3'.repeat(40);
const SOURCE_101 = 'a'.repeat(40);
const TREE = '4'.repeat(40);

function treeEntry(mode, type, size, path, sha = 'f'.repeat(40)) {
  return {
    mode,
    path,
    sha,
    ...(size === undefined ? {} : { size }),
    type,
  };
}

function treePayload(entries, overrides = {}) {
  return { sha: TREE, tree: entries, truncated: false, ...overrides };
}

function event(overrides = {}) {
  return {
    action: 'checks_requested',
    repository: { full_name: 'JovieInc/Jovie' },
    merge_group: {
      base_ref: 'refs/heads/main',
      base_sha: BASE,
      head_ref: 'refs/heads/gh-readonly-queue/main/pr-102-base',
      head_sha: HEAD,
      head_commit: { id: HEAD },
      ...overrides,
    },
  };
}

function commit(sha, parent, number) {
  return {
    sha,
    parents: [{ sha: parent }],
    commit: {
      message: `fix(ci): queue member ${number} (#${number})`,
      committer: {
        name: 'GitHub',
        email: 'noreply@github.com',
      },
      verification: {
        verified: true,
        reason: 'valid',
      },
    },
  };
}

function comparison(commits) {
  return {
    status: 'ahead',
    ahead_by: commits.length,
    behind_by: 0,
    total_commits: commits.length,
    base_commit: { sha: BASE },
    merge_base_commit: { sha: BASE },
    commits,
  };
}

function forkPr(overrides = {}) {
  return {
    number: 101,
    head: { sha: SOURCE_101, repo: { fork: true } },
    ...overrides,
  };
}

function review(id, state, overrides = {}) {
  return {
    id,
    state,
    submitted_at: `2026-07-18T00:00:0${id}Z`,
    commit_id: SOURCE_101,
    author_association: 'MEMBER',
    user: { login: 'reviewer', type: 'User' },
    ...overrides,
  };
}

function sizedPr(labels) {
  return {
    number: 101,
    body: '',
    labels: labels.map(name => ({ name })),
    user: { login: 'contributor' },
    head: { ref: 'large-change' },
  };
}

describe('merge-group member discovery', () => {
  it('resolves the singleton member from the exact synthetic first-parent chain', () => {
    const members = resolveMergeGroupMembers({
      event: event(),
      comparison: comparison([commit(HEAD, BASE, 102)]),
    });

    expect(members).toEqual([
      {
        number: 102,
        syntheticHeadSha: HEAD,
      },
    ]);
  });

  it('fails closed on unknown, truncated, or malformed member evidence', () => {
    const commits = [commit(HEAD, BASE, 102)];
    expect(() =>
      resolveMergeGroupMembers({
        event: event({ head_ref: 'refs/heads/main' }),
        comparison: comparison(commits),
      })
    ).toThrow(/head_ref is not a main merge-queue ref/);

    expect(() =>
      resolveMergeGroupMembers({
        event: event(),
        comparison: {
          ...comparison(commits),
          total_commits: 2,
        },
      })
    ).toThrow(/exact base\.\.head range/);

    expect(() =>
      resolveMergeGroupMembers({
        event: event(),
        comparison: comparison([
          {
            ...commits[0],
            parents: [{ sha: '9'.repeat(40) }],
          },
        ]),
      })
    ).toThrow(/not the expected first-parent link/);

    expect(() =>
      resolveMergeGroupMembers({
        event: event(),
        comparison: comparison([
          {
            ...commits[0],
            commit: {
              ...commits[0].commit,
              message: 'synthetic commit without an attributable trailer',
            },
          },
        ]),
      })
    ).toThrow(/no final \(#PR\) trailer/);

    expect(() =>
      resolveMergeGroupMembers({
        event: event(),
        comparison: comparison([
          commit(FIRST, BASE, 101),
          commit(HEAD, FIRST, 101),
        ]),
      })
    ).toThrow(/exceeds trusted 1-member bound/);
  });

  it('rejects commits without canonical GitHub generation evidence', () => {
    const valid = commit(HEAD, BASE, 102);

    for (const synthetic of [
      {
        ...valid,
        commit: {
          ...valid.commit,
          verification: { verified: false, reason: 'valid' },
        },
      },
      {
        ...valid,
        commit: {
          ...valid.commit,
          verification: { verified: true, reason: 'unknown_key' },
        },
      },
      {
        ...valid,
        commit: {
          ...valid.commit,
          committer: {
            name: 'Contributor',
            email: 'noreply@github.com',
          },
        },
      },
      {
        ...valid,
        commit: {
          ...valid.commit,
          committer: {
            name: 'GitHub',
            email: 'contributor@example.com',
          },
        },
      },
    ]) {
      expect(() =>
        resolveMergeGroupMembers({
          event: event(),
          comparison: comparison([synthetic]),
        })
      ).toThrow(/not verified GitHub-generated evidence/);
    }
  });

  it('caps unprivileged member discovery at the trusted ruleset bound', () => {
    expect(() =>
      resolveMergeGroupMembers({
        event: event(),
        comparison: comparison(
          Array.from({ length: 2 }, () => commit(HEAD, BASE, 102))
        ),
      })
    ).toThrow(/exceeds trusted 1-member bound/);
  });

  it('requires current open main-bound PR metadata after discovery', () => {
    const member = {
      number: 101,
      syntheticHeadSha: HEAD,
    };
    const current = {
      number: 101,
      state: 'open',
      base: { ref: 'main' },
      head: { sha: SOURCE_101, repo: { fork: false } },
      labels: [],
    };

    expect(() => assertCurrentPullRequest(member, current)).not.toThrow();
    expect(() =>
      assertCurrentPullRequest(member, {
        ...current,
        head: { ...current.head, sha: 'not-a-sha' },
      })
    ).toThrow(/changed or is malformed after group discovery/);
    expect(() =>
      assertCurrentPullRequest(member, { ...current, state: 'closed' })
    ).toThrow(/changed or is malformed after group discovery/);
  });
});

describe('merge-group combined-tree payload policy', () => {
  it('counts exact regular-file blob bytes and ignores symlinks and submodules', () => {
    expect(
      parseTrackedRegularTree(
        treePayload([
          treeEntry('040000', 'tree', undefined, 'scripts'),
          treeEntry('100644', 'blob', 7, 'README.md'),
          treeEntry('100755', 'blob', 11, 'scripts/check.sh'),
          treeEntry('120000', 'blob', 9, 'linked-doc'),
          treeEntry('160000', 'commit', undefined, 'vendor/example'),
        ])
      )
    ).toEqual({ bytes: 18, files: 2 });
  });

  it('fails closed on malformed, truncated, duplicate, or unsupported tree evidence', () => {
    expect(() => parseTrackedRegularTree(null)).toThrow(/missing, truncated/);
    expect(() =>
      parseTrackedRegularTree(treePayload([], { truncated: true }))
    ).toThrow(/missing.*truncated/);
    expect(() =>
      parseTrackedRegularTree(
        treePayload([
          treeEntry('100644', 'blob', 7, 'README.md'),
          treeEntry('100644', 'blob', 7, 'README.md'),
        ])
      )
    ).toThrow(/repeats tracked path/);
    expect(() =>
      parseTrackedRegularTree(
        treePayload([treeEntry('040000', 'blob', 7, 'directory')])
      )
    ).toThrow(/unsupported tracked mode/);
  });

  it('fetches and measures the exact synthetic head through bounded API evidence', async () => {
    const requests = [];
    const result = await enforceCombinedTreePayload({
      deadlineMs: Date.now() + 1_000,
      headSha: HEAD,
      maxTrackedBytes: 20,
      repository: 'JovieInc/Jovie',
      token: 'test-token',
      async request(path, options) {
        requests.push({ path, options });
        if (path.endsWith(`/git/commits/${HEAD}`)) {
          return { data: { sha: HEAD, tree: { sha: TREE } } };
        }
        return {
          data: treePayload([treeEntry('100644', 'blob', 20, 'payload.bin')]),
        };
      },
    });

    expect(result).toEqual({ bytes: 20, files: 1 });
    expect(requests.map(({ path }) => path)).toEqual([
      `/repos/JovieInc/Jovie/git/commits/${HEAD}`,
      `/repos/JovieInc/Jovie/git/trees/${TREE}?recursive=1`,
    ]);
    expect(
      requests.every(({ options }) => options.token === 'test-token')
    ).toBe(true);
  });

  it('fails closed when the exact commit or tree identity does not match', async () => {
    const options = {
      deadlineMs: Date.now() + 1_000,
      headSha: HEAD,
      repository: 'JovieInc/Jovie',
      token: 'test-token',
    };

    await expect(
      enforceCombinedTreePayload({
        ...options,
        async request() {
          return { data: { sha: FIRST, tree: { sha: TREE } } };
        },
      })
    ).rejects.toThrow(/commit evidence is missing or malformed/);

    await expect(
      enforceCombinedTreePayload({
        ...options,
        async request(path) {
          return path.endsWith(`/git/commits/${HEAD}`)
            ? { data: { sha: HEAD, tree: { sha: TREE } } }
            : { data: treePayload([], { sha: FIRST }) };
        },
      })
    ).rejects.toThrow(/tree does not match/);
  });

  it('fails closed before I/O when the aggregate deadline is missing or expired', async () => {
    const request = vi.fn();
    const options = {
      headSha: HEAD,
      repository: 'JovieInc/Jovie',
      request,
      token: 'test-token',
    };

    await expect(enforceCombinedTreePayload(options)).rejects.toThrow(
      /deadline is missing or expired/
    );
    await expect(
      enforceCombinedTreePayload({ ...options, deadlineMs: 99, now: () => 100 })
    ).rejects.toThrow(/deadline is missing or expired/);
    expect(request).not.toHaveBeenCalled();
  });

  it('retries GitHub quota and 5xx answers that fit the deadline, never real failures', async () => {
    // 2026-10-13 01:53-01:55Z: 19 PR Size Guard merge groups failed red on
    // "API rate limit exceeded for installation" from the shared GITHUB_TOKEN.
    const answers = [
      new Response('{"message":"You have exceeded a secondary rate limit"}', {
        status: 403,
        headers: { 'retry-after': '1' },
      }),
      new Response('{"message":"Server Error"}', { status: 502 }),
      new Response('{"ok":true}', { status: 200 }),
    ];
    const sleeps = [];
    let clock = 1_000;
    const result = await githubRequest('/repos/JovieInc/Jovie/pulls/1', {
      deadlineMs: 60_000,
      fetchImpl: async () => answers.shift(),
      now: () => clock,
      random: () => 0.5,
      sleep: async ms => {
        sleeps.push(ms);
        clock += ms;
      },
      token: 'test-token',
    });
    expect(result.data).toEqual({ ok: true });
    expect(sleeps).toEqual([2_000, 2_000]);

    const quota = (reset, body = 'API rate limit exceeded for installation') =>
      new Response(JSON.stringify({ message: body }), {
        status: 403,
        headers: {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(reset),
        },
      });
    // A primary reset past the deadline fails at once, with the classified text.
    await expect(
      githubRequest('/repos/JovieInc/Jovie/compare/a...b', {
        deadlineMs: 45_000,
        fetchImpl: async () => quota(3_600),
        now: () => 1_000,
        sleep: async () => expect.unreachable('no wait past the deadline'),
        token: 'test-token',
      })
    ).rejects.toThrow(
      /GitHub API 403 for \/repos\/JovieInc\/Jovie\/compare\/a\.\.\.b: API rate limit exceeded/
    );
    // Three attempts at most; a permission 403 is never retried.
    let calls = 0;
    await expect(
      githubRequest('/repos/JovieInc/Jovie/pulls/1', {
        deadlineMs: 60_000,
        fetchImpl: async () => {
          calls += 1;
          return new Response(
            '{"message":"Resource not accessible by integration"}',
            { status: 403 }
          );
        },
        now: () => 1_000,
        sleep: async () => expect.unreachable('permission answers are final'),
        token: 'test-token',
      })
    ).rejects.toThrow(/Resource not accessible/);
    expect(calls).toBe(1);
    expect(
      apiRetryDelay({
        status: 502,
        message: '',
        headers: null,
        attempt: 3,
        nowMs: 0,
        deadlineMs: 60_000,
      })
    ).toBe(4_000);
    expect(
      apiRetryDelay({
        status: 502,
        message: '',
        headers: null,
        attempt: MAX_API_ATTEMPTS,
        nowMs: 0,
        deadlineMs: 60_000,
      })
    ).toBeNull();
    expect(
      apiRetryDelay({
        status: 403,
        message: 'API rate limit exceeded for installation',
        headers: null,
        attempt: 1,
        nowMs: 0,
        deadlineMs: 60_000,
      })
    ).toBe(1_000);
    expect(
      apiRetryDelay({
        status: 429,
        message: '',
        headers: null,
        attempt: 2,
        nowMs: 0,
        deadlineMs: 60_000,
      })
    ).toBe(2_000);
  });

  it('bounds each authenticated API request and fails closed on transport errors', async () => {
    let signal;
    const response = await githubRequest('/repos/JovieInc/Jovie', {
      deadlineMs: 100,
      env: { GITHUB_API_URL: 'https://api.github.test' },
      fetchImpl: async (_url, options) => {
        signal = options.signal;
        return new Response('{"ok":true}', {
          headers: { 'content-type': 'application/json' },
          status: 200,
        });
      },
      now: () => 1,
      token: 'test-token',
    });

    expect(response.data).toEqual({ ok: true });
    expect(signal).toBeInstanceOf(AbortSignal);
    await expect(
      githubRequest('/repos/JovieInc/Jovie', {
        deadlineMs: 100,
        fetchImpl: async () => {
          throw new Error('network unavailable');
        },
        now: () => 1,
        token: 'test-token',
      })
    ).rejects.toThrow(/API request failed.*network unavailable/);

    const abortController = new AbortController();
    const aborting = expect(
      githubRequest('/repos/JovieInc/Jovie', {
        deadlineMs: 100,
        fetchImpl: async (_url, { signal }) =>
          new Promise((_, reject) => {
            const rejectAbort = () => reject(new Error('request aborted'));
            signal.addEventListener('abort', rejectAbort, { once: true });
            if (signal.aborted) rejectAbort();
          }),
        now: () => 1,
        timeoutSignal: () => abortController.signal,
        token: 'test-token',
      })
    ).rejects.toThrow(/API request failed.*request aborted/);
    abortController.abort();
    await aborting;
  });

  it('rejects oversized API evidence before reading the response body', async () => {
    const response = new Response('unused', {
      headers: { 'content-length': String(64 * 1024 * 1024 + 1) },
    });
    const getReader = vi.spyOn(response.body, 'getReader');
    await expect(
      githubRequest('/repos/JovieInc/Jovie', {
        deadlineMs: 100,
        fetchImpl: async () => response,
        now: () => 1,
        token: 'test-token',
      })
    ).rejects.toThrow(/response exceeded the bounded size/);
    expect(getReader).not.toHaveBeenCalled();
  });

  it('stops reading a chunked API response at the byte limit', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]));
          controller.enqueue(new Uint8Array([3, 4]));
          controller.close();
        },
      })
    );
    await expect(
      readBoundedResponseText(response, '/chunked-evidence', 3)
    ).rejects.toThrow(/response exceeded the bounded size/);
  });

  it('deliberately rejects an exact combined tree over the absolute budget', async () => {
    const overBudget = HYGIENE_LIMITS.maxTrackedBytes + 1;
    await expect(
      enforceCombinedTreePayload({
        deadlineMs: Date.now() + 1_000,
        headSha: HEAD,
        repository: 'JovieInc/Jovie',
        token: 'test-token',
        async request(path) {
          return path.endsWith(`/git/commits/${HEAD}`)
            ? { data: { sha: HEAD, tree: { sha: TREE } } }
            : {
                data: treePayload([
                  treeEntry('100644', 'blob', overBudget, 'payload.bin'),
                ]),
              };
        },
      })
    ).rejects.toThrow(
      `${overBudget} bytes of tracked regular files exceeds the ${HYGIENE_LIMITS.maxTrackedBytes}-byte combined-tree budget`
    );
  });

  it('warns on the merge_group run when the combined tree is above 95% of budget', async () => {
    const nearBudget = HYGIENE_LIMITS.maxTrackedBytes - 260;
    const logs = [];
    await runPolicy({
      argv: ['--policy=size'],
      env: { GH_TOKEN: 'test-token' },
      event: event({ head_sha: FIRST, head_commit: { id: FIRST } }),
      log: line => logs.push(line),
      now: () => 1,
      async request(path) {
        if (path.endsWith(`/git/commits/${FIRST}`)) {
          return { data: { sha: FIRST, tree: { sha: TREE } } };
        }
        if (path.includes('/git/trees/')) {
          return {
            data: treePayload([
              treeEntry('100644', 'blob', nearBudget, 'payload.bin'),
            ]),
          };
        }
        if (path.includes('/compare/')) {
          return { data: comparison([commit(FIRST, BASE, 101)]) };
        }
        if (path.endsWith('/pulls/101')) {
          return {
            data: {
              number: 101,
              state: 'open',
              base: { ref: 'main' },
              head: { sha: SOURCE_101, repo: { fork: false } },
              labels: [{ name: 'big-pr' }],
            },
          };
        }
        throw new Error(`unexpected request: ${path}`);
      },
    });
    expect(logs[0]).toMatch(/^::warning::Combined tree: .*0\.00 MB headroom/);
  });
});

describe('merge-group fork policy', () => {
  it('uses the bounded request path for fork member discovery and approval', async () => {
    const paths = [];
    const approvedFork = {
      number: 101,
      state: 'open',
      base: { ref: 'main' },
      head: { sha: SOURCE_101, repo: { fork: true } },
      labels: [],
    };

    await runPolicy({
      argv: ['--policy=fork'],
      env: { GH_TOKEN: 'test-token' },
      event: event({ head_sha: FIRST, head_commit: { id: FIRST } }),
      log: () => {},
      now: () => 1,
      async request(path, options) {
        paths.push(path);
        expect(options).toMatchObject({
          deadlineMs: 1 + MERGE_GROUP_JOB_BUDGET_MS,
          token: 'test-token',
        });
        if (path.includes('/compare/')) {
          return { data: comparison([commit(FIRST, BASE, 101)]) };
        }
        if (path.endsWith('/pulls/101')) return { data: approvedFork };
        if (path.includes('/pulls/101/reviews?')) {
          return {
            data: [review(1, 'APPROVED')],
            link: null,
          };
        }
        throw new Error(`unexpected request: ${path}`);
      },
    });

    expect(paths).toEqual([
      `/repos/JovieInc/Jovie/compare/${BASE}...${FIRST}`,
      '/repos/JovieInc/Jovie/pulls/101',
      '/repos/JovieInc/Jovie/pulls/101/reviews?per_page=100&page=1',
    ]);
  });

  it('rejects a dismissed or revoked latest approval on the current head', () => {
    expect(
      evaluateForkMemberPolicy({
        pr: forkPr(),
        reviews: [review(1, 'DISMISSED')],
      })
    ).toMatchObject({ passed: false });

    expect(
      evaluateForkMemberPolicy({
        pr: forkPr(),
        reviews: [review(1, 'APPROVED'), review(2, 'CHANGES_REQUESTED')],
      })
    ).toMatchObject({ passed: false });

    expect(
      evaluateForkMemberPolicy({
        pr: forkPr(),
        reviews: [review(1, 'APPROVED', { commit_id: '9'.repeat(40) })],
      })
    ).toMatchObject({ passed: false });
  });

  it('accepts only a collaborator approval that is latest and on current head', () => {
    expect(
      evaluateForkMemberPolicy({
        pr: forkPr(),
        reviews: [review(1, 'CHANGES_REQUESTED'), review(2, 'APPROVED')],
      })
    ).toMatchObject({ passed: true, policy: 'fork-approved' });
  });
});

describe('merge-group size policy', () => {
  const oversizedFiles = [
    { filename: 'apps/web/large.ts', additions: 801, deletions: 0 },
  ];

  it('recomputes the current policy and fails when a bypass label was removed', () => {
    expect(
      evaluateSizeMemberPolicy({
        pr: sizedPr(['big-pr']),
        files: [],
        maxLines: 800,
        maxFiles: 40,
      })
    ).toMatchObject({ passed: true, policy: 'big-pr' });

    expect(
      evaluateSizeMemberPolicy({
        pr: sizedPr([]),
        files: oversizedFiles,
        maxLines: 800,
        maxFiles: 40,
      })
    ).toMatchObject({ passed: false, policy: 'standard' });
  });
});

describe('merge-group hold labels (JOV-6843)', () => {
  const heldPr = labels => ({
    number: 101,
    state: 'open',
    base: { ref: 'main' },
    head: { sha: SOURCE_101, repo: { fork: false } },
    labels: labels.map(name => ({ name })),
  });

  it('fails a member that carries any hold label, case-insensitively', () => {
    expect(evaluateHoldMemberPolicy(heldPr(['ci', 'Do-Not-Merge']))).toEqual({
      passed: false,
      policy: 'hold',
      reason: 'carries the Do-Not-Merge label',
    });
    expect(evaluateHoldMemberPolicy(heldPr(['ci', 'big-pr']))).toBeNull();
    for (const label of HOLD_LABELS) {
      expect(evaluateHoldMemberPolicy(heldPr([label]))).not.toBeNull();
    }
  });

  it('rejects a held member even when its fork policy passes', async () => {
    const logs = [];
    await expect(
      runPolicy({
        argv: ['--policy=fork'],
        env: { GH_TOKEN: 'test-token' },
        event: event({ head_sha: FIRST, head_commit: { id: FIRST } }),
        log: line => logs.push(line),
        now: () => 1,
        async request(path) {
          if (path.includes('/compare/')) {
            return { data: comparison([commit(FIRST, BASE, 101)]) };
          }
          if (path.endsWith('/pulls/101')) return { data: heldPr(['hold']) };
          throw new Error(`unexpected request: ${path}`);
        },
      })
    ).rejects.toThrow('PR #101 failed fork merge-group policy');
    expect(logs).toContain('PR #101: FAIL — carries the hold label');
  });
});

describe('combined size + fork merge-group producer (JOV-7744)', () => {
  const internalPr = labels => ({
    number: 101,
    state: 'open',
    base: { ref: 'main' },
    head: { sha: SOURCE_101, repo: { fork: false } },
    labels: labels.map(name => ({ name })),
  });
  const unapprovedFork = {
    ...internalPr(['big-pr']),
    head: { sha: SOURCE_101, repo: { fork: true } },
  };

  function combinedRun({
    pr,
    treeBytes = 10,
    reviews = [],
    rangeFiles = undefined,
  }) {
    const paths = [];
    const outputs = [];
    const logs = [];
    const run = runPolicy({
      argv: ['--policy=size', '--also=fork'],
      env: { GH_TOKEN: 'test-token' },
      event: event({ head_sha: FIRST, head_commit: { id: FIRST } }),
      log: line => logs.push(line),
      now: () => 1,
      writeOutput: line => outputs.push(line),
      async request(path) {
        paths.push(path);
        if (path.includes('/compare/')) {
          if (!rangeFiles) {
            return { data: comparison([commit(FIRST, BASE, 101)]) };
          }
          const head = commit(FIRST, BASE, 101);
          head.commit.tree = { sha: TREE };
          return { data: { ...comparison([head]), files: rangeFiles } };
        }
        if (path.endsWith('/pulls/101')) return { data: pr };
        if (path.includes('/pulls/101/files?')) {
          return {
            data: [{ filename: 'a.ts', additions: 1, deletions: 0 }],
            link: null,
          };
        }
        if (path.includes('/pulls/101/reviews?')) {
          return { data: reviews, link: null };
        }
        if (path.endsWith(`/git/commits/${FIRST}`)) {
          return { data: { sha: FIRST, tree: { sha: TREE } } };
        }
        if (path.includes('/git/trees/')) {
          return {
            data: treePayload([
              treeEntry('100644', 'blob', treeBytes, 'payload.bin'),
            ]),
          };
        }
        throw new Error(`unexpected request: ${path}`);
      },
    });
    return { run, paths, outputs, logs };
  }

  it('reads the comparison and each member once for both policies', async () => {
    const { run, paths, outputs } = combinedRun({ pr: internalPr(['big-pr']) });
    await run;
    expect(paths).toEqual([
      `/repos/JovieInc/Jovie/compare/${BASE}...${FIRST}`,
      '/repos/JovieInc/Jovie/pulls/101',
      `/repos/JovieInc/Jovie/git/commits/${FIRST}`,
      `/repos/JovieInc/Jovie/git/trees/${TREE}?recursive=1`,
    ]);
    expect(outputs).toEqual(['fork_verdict=pass']);
  });

  it("takes a one-member group's files and tree from the compare read (3 calls, not 5)", async () => {
    // 2026-10-13 storm: ~5 GITHUB_TOKEN calls per group rebuild drained the
    // repo's 1,000/h bucket. The compare read already carries both answers.
    const files = [{ filename: 'apps/web/a.ts', additions: 900, deletions: 0 }];
    const { run, paths, logs } = combinedRun({
      pr: internalPr([]),
      rangeFiles: files,
    });
    await expect(run).rejects.toThrow('PR #101 failed size merge-group policy');
    expect(paths).toEqual([
      `/repos/JovieInc/Jovie/compare/${BASE}...${FIRST}`,
      '/repos/JovieInc/Jovie/pulls/101',
      `/repos/JovieInc/Jovie/git/trees/${TREE}?recursive=1`,
    ]);
    expect(logs.some(line => line.startsWith('PR #101: FAIL'))).toBe(true);

    const capped = combinedRun({
      pr: internalPr([]),
      rangeFiles: Array.from({ length: 300 }, (_, index) => ({
        filename: `f${index}.ts`,
        additions: 0,
        deletions: 0,
      })),
    });
    await capped.run;
    expect(capped.paths).toContain(
      '/repos/JovieInc/Jovie/pulls/101/files?per_page=100&page=1'
    );
  });

  it('hands off a failing fork verdict while the size policy still passes', async () => {
    const { run, outputs, logs } = combinedRun({ pr: unapprovedFork });
    await run;
    expect(outputs).toEqual(['fork_verdict=fail']);
    expect(
      logs.some(line => line.startsWith('fork policy PR #101: FAIL'))
    ).toBe(true);
    expect(logs).toContain(
      'Validated 1 merge-group member(s) for size policy.'
    );
  });

  it('fails both verdicts for a held member', async () => {
    const { run, outputs } = combinedRun({
      pr: internalPr(['big-pr', 'hold']),
    });
    await expect(run).rejects.toThrow('PR #101 failed size merge-group policy');
    expect(outputs).toEqual(['fork_verdict=fail']);
  });

  it('publishes the fork verdict before an over-budget tree fails the size gate', async () => {
    const { run, outputs } = combinedRun({
      pr: internalPr(['big-pr']),
      treeBytes: HYGIENE_LIMITS.maxTrackedBytes + 1,
    });
    await expect(run).rejects.toThrow('combined-tree budget');
    expect(outputs).toEqual(['fork_verdict=pass']);
  });

  it('refuses an --also hand-off it cannot publish or that names the wrong policy', async () => {
    await expect(
      runPolicy({
        argv: ['--policy=size', '--also=fork'],
        env: { GH_TOKEN: 'test-token' },
        event: event(),
        request: async () => {
          throw new Error('must not reach the API');
        },
      })
    ).rejects.toThrow('GITHUB_OUTPUT is required');
    for (const argv of [
      ['--policy=fork', '--also=size'],
      ['--policy=size', '--also=size'],
      ['--policy=size', '--also='],
    ]) {
      await expect(
        runPolicy({ argv, env: { GH_TOKEN: 'test-token' }, event: event() })
      ).rejects.toThrow('expected --also=fork only with --policy=size');
    }
  });
});

describe('merge-group API outages do not eject a valid group', () => {
  const pull = '/repos/JovieInc/Jovie/pulls/21846';

  it('retries transient 5xx with bounded exponential backoff and jitter', async () => {
    const statuses = [502, 503, 200];
    const sleeps = [];
    let clock = 0;
    const result = await githubRequest(pull, {
      deadlineMs: 60_000,
      fetchImpl: async () =>
        new Response(statuses[0] === 200 ? '{"ok":true}' : 'gateway', {
          status: statuses.shift(),
        }),
      now: () => clock,
      random: () => 0,
      sleep: async ms => {
        sleeps.push(ms);
        clock += ms;
      },
      token: 'test-token',
    });

    expect(result.data).toEqual({ ok: true });
    expect(sleeps).toEqual([800, 1_600]);
    expect(
      apiRetryDelay({
        status: 502,
        message: '',
        headers: null,
        attempt: 1,
        nowMs: 0,
        deadlineMs: 60_000,
        random: () => 1,
      })
    ).toBe(1_200);
  });

  it('retries a dropped connection before failing the group', async () => {
    let calls = 0;
    let clock = 0;
    const result = await githubRequest(pull, {
      deadlineMs: 30_000,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) throw new Error('socket hang up');
        return new Response('{"ok":true}', { status: 200 });
      },
      now: () => clock,
      random: () => 0.5,
      sleep: async ms => {
        clock += ms;
      },
      token: 'test-token',
    });

    expect(calls).toBe(2);
    expect(result.data).toEqual({ ok: true });
  });

  it('holds a rate-limit 403 until x-ratelimit-reset, and a 429 until retry-after', async () => {
    let calls = 0;
    let clock = 1_000;
    const sleeps = [];
    const result = await githubRequest(pull, {
      deadlineMs: MERGE_GROUP_JOB_BUDGET_MS,
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(
            JSON.stringify({
              message: 'API rate limit exceeded for installation',
            }),
            {
              status: 403,
              headers: {
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': '30',
              },
            }
          );
        }
        return new Response('{"ok":true}', { status: 200 });
      },
      now: () => clock,
      sleep: async ms => {
        sleeps.push(ms);
        clock += ms;
      },
      token: 'test-token',
    });

    expect(sleeps).toEqual([30_000]);
    expect(result.data).toEqual({ ok: true });

    clock = 5_000;
    const limited = await githubRequest('/repos/JovieInc/Jovie/rate_limit', {
      deadlineMs: 20_000,
      fetchImpl: async () =>
        new Response('{"message":"secondary rate limit"}', {
          status: 429,
          headers: { 'retry-after': '2' },
        }),
      now: () => clock,
      sleep: async ms => {
        clock += ms;
      },
      token: 'test-token',
    }).catch(error => error);

    expect(limited).toBeInstanceOf(Error);
    expect(clock).toBeGreaterThan(5_000);
  });

  it('does not retry a real 404 or a size-policy violation', async () => {
    let calls = 0;
    await expect(
      githubRequest(pull, {
        deadlineMs: 60_000,
        fetchImpl: async () => {
          calls += 1;
          return new Response('{"message":"Not Found"}', { status: 404 });
        },
        now: () => 1_000,
        sleep: async () => {
          throw new Error('404 is final');
        },
        token: 'test-token',
      })
    ).rejects.toThrow(/GitHub API 404/);
    expect(calls).toBe(1);

    const paths = [];
    const oversized = [
      { filename: 'apps/web/a.ts', additions: 2_000, deletions: 0 },
    ];
    await expect(
      runPolicy({
        argv: ['--policy=size'],
        env: { GH_TOKEN: 'test-token', MAX_LINES: '800', MAX_FILES: '40' },
        event: event({ head_sha: FIRST, head_commit: { id: FIRST } }),
        log: () => {},
        now: () => 1,
        readLocal: async () =>
          localCheckoutFromEvidence(
            {
              baseSha: BASE,
              headSha: FIRST,
              parentSha: BASE,
              treeSha: TREE,
              subject: 'fix(ci): queue member 101 (#101)',
              committerName: 'GitHub',
              committerEmail: 'noreply@github.com',
              files: oversized,
            },
            BASE,
            FIRST
          ),
        async request(path) {
          paths.push(path);
          if (path.endsWith('/pulls/101')) {
            return {
              data: {
                number: 101,
                state: 'open',
                base: { ref: 'main' },
                head: { sha: SOURCE_101, repo: { fork: false } },
                labels: [],
                user: { login: 'contributor' },
                body: '',
              },
            };
          }
          if (path.includes('/git/trees/')) {
            return {
              data: treePayload([treeEntry('100644', 'blob', 10, 'a.ts')]),
            };
          }
          throw new Error(`unexpected request: ${path}`);
        },
      })
    ).rejects.toThrow('PR #101 failed size merge-group policy');
    expect(paths.some(path => path.includes('/compare/'))).toBe(false);
    expect(paths.some(path => path.includes('/files'))).toBe(false);
  });

  it('caches a successful GitHub read per head SHA', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mg-policy-cache-'));
    const scope = 'b'.repeat(40);
    let calls = 0;
    const options = {
      cacheDir: dir,
      cacheScope: scope,
      deadlineMs: 10_000,
      fetchImpl: async () => {
        calls += 1;
        return new Response('{"cached":true}', { status: 200 });
      },
      now: () => 1,
      token: 'test-token',
    };
    try {
      clearCachedGitHubResponses();
      const first = await githubRequest(pull, options);
      clearCachedGitHubResponses();
      const second = await githubRequest(pull, options);
      const other = await githubRequest(pull, {
        ...options,
        cacheScope: 'c'.repeat(40),
      });
      expect(first.data).toEqual({ cached: true });
      expect(second.data).toEqual({ cached: true });
      expect(other.data).toEqual({ cached: true });
      expect(calls).toBe(2);
    } finally {
      clearCachedGitHubResponses();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps the size cap when a pull read is rate-limited and defers fork metadata', async () => {
    const logs = [];
    const outputs = [];
    const paths = [];
    const local = localCheckoutFromEvidence(
      {
        baseSha: BASE,
        headSha: FIRST,
        parentSha: BASE,
        treeSha: TREE,
        subject: 'fix(ci): queue member 101 (#101)',
        committerName: 'GitHub',
        committerEmail: 'noreply@github.com',
        files: [{ filename: 'a.ts', additions: 3, deletions: 1 }],
        tracked: { bytes: 20, files: 2 },
      },
      BASE,
      FIRST
    );
    await runPolicy({
      argv: ['--policy=size', '--also=fork'],
      env: { GH_TOKEN: 'test-token', MAX_LINES: '800', MAX_FILES: '40' },
      event: event({ head_sha: FIRST, head_commit: { id: FIRST } }),
      log: line => logs.push(line),
      now: () => 1,
      readLocal: async () => local,
      writeOutput: line => outputs.push(line),
      request(path) {
        paths.push(path);
        throw new MergeGroupPolicyRateLimitError(
          `GitHub API 403 for ${path}: API rate limit exceeded for installation`
        );
      },
    });
    expect(paths).toEqual(['/repos/JovieInc/Jovie/pulls/101']);
    expect(outputs).toEqual(['fork_verdict=pass']);
    expect(logs.some(line => line.includes('within standard size cap'))).toBe(
      true
    );
    expect(logs.some(line => line.includes('20 tracked regular-file'))).toBe(
      true
    );
    expect(logs.some(line => line.includes('/git/trees/'))).toBe(false);

    await expect(
      runPolicy({
        argv: ['--policy=size'],
        env: { GH_TOKEN: 'test-token', MAX_LINES: '800', MAX_FILES: '40' },
        event: event({ head_sha: FIRST, head_commit: { id: FIRST } }),
        log: () => {},
        now: () => 1,
        readLocal: async () =>
          localCheckoutFromEvidence(
            {
              baseSha: BASE,
              headSha: FIRST,
              parentSha: BASE,
              treeSha: TREE,
              subject: 'fix(ci): queue member 101 (#101)',
              committerName: 'GitHub',
              committerEmail: 'noreply@github.com',
              files: [{ filename: 'a.ts', additions: 2_000, deletions: 0 }],
              tracked: { bytes: 20, files: 1 },
            },
            BASE,
            FIRST
          ),
        request() {
          throw new MergeGroupPolicyRateLimitError(
            'GitHub API 403 for /repos/JovieInc/Jovie/pulls/101: API rate limit exceeded for installation'
          );
        },
      })
    ).rejects.toThrow('PR #101 failed size merge-group policy');
  });

  it('does not pass a rate limit when the diff or the tree byte count is missing', async () => {
    const unread = [];
    await expect(
      runPolicy({
        argv: ['--policy=size', '--also=fork'],
        env: { GH_TOKEN: 'test-token' },
        event: event({ head_sha: FIRST, head_commit: { id: FIRST } }),
        log: () => {},
        now: () => 1,
        readLocal: async () => null,
        writeOutput: line => unread.push(line),
        request(path) {
          throw new MergeGroupPolicyRateLimitError(
            `GitHub API 403 for ${path}: API rate limit exceeded for installation`
          );
        },
      })
    ).rejects.toBeInstanceOf(MergeGroupPolicyRateLimitError);
    expect(unread).toEqual([]);

    const noFiles = localCheckoutFromEvidence(
      {
        baseSha: BASE,
        headSha: FIRST,
        parentSha: BASE,
        treeSha: TREE,
        subject: 'fix(ci): queue member 101 (#101)',
        committerName: 'GitHub',
        committerEmail: 'noreply@github.com',
        files: null,
        tracked: { bytes: 20, files: 1 },
      },
      BASE,
      FIRST
    );
    const missingDiff = [];
    await expect(
      runPolicy({
        argv: ['--policy=size', '--also=fork'],
        env: { GH_TOKEN: 'test-token' },
        event: event({ head_sha: FIRST, head_commit: { id: FIRST } }),
        log: () => {},
        now: () => 1,
        readLocal: async () => noFiles,
        writeOutput: line => missingDiff.push(line),
        request() {
          throw new MergeGroupPolicyRateLimitError(
            'GitHub API 403 for /repos/JovieInc/Jovie/pulls/101: API rate limit exceeded for installation'
          );
        },
      })
    ).rejects.toBeInstanceOf(MergeGroupPolicyRateLimitError);
    expect(missingDiff).toEqual([]);

    const noTree = [];
    await expect(
      runPolicy({
        argv: ['--policy=size', '--also=fork'],
        env: { GH_TOKEN: 'test-token', MAX_LINES: '800', MAX_FILES: '40' },
        event: event({ head_sha: FIRST, head_commit: { id: FIRST } }),
        log: () => {},
        now: () => 1,
        readLocal: async () =>
          localCheckoutFromEvidence(
            {
              baseSha: BASE,
              headSha: FIRST,
              parentSha: BASE,
              treeSha: TREE,
              subject: 'fix(ci): queue member 101 (#101)',
              committerName: 'GitHub',
              committerEmail: 'noreply@github.com',
              files: [{ filename: 'a.ts', additions: 1, deletions: 0 }],
            },
            BASE,
            FIRST
          ),
        writeOutput: line => noTree.push(line),
        request(path) {
          if (path.endsWith('/pulls/101')) {
            return {
              data: {
                number: 101,
                state: 'open',
                base: { ref: 'main' },
                head: { sha: SOURCE_101, repo: { fork: false } },
                labels: [],
                user: { login: 'contributor' },
                body: '',
              },
            };
          }
          throw new MergeGroupPolicyRateLimitError(
            `GitHub API 403 for ${path}: API rate limit exceeded for installation`
          );
        },
      })
    ).rejects.toBeInstanceOf(MergeGroupPolicyRateLimitError);
    expect(noTree).toEqual(['fork_verdict=pass']);
  });
});
