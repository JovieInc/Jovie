import { describe, expect, it, vi } from 'vitest';
import {
  assertCurrentPullRequest,
  enforceCombinedTreePayload,
  evaluateForkMemberPolicy,
  evaluateSizeMemberPolicy,
  githubRequest,
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
  it('resolves every member from the exact synthetic first-parent chain', () => {
    const members = resolveMergeGroupMembers({
      event: event(),
      comparison: comparison([
        commit(FIRST, BASE, 101),
        commit(HEAD, FIRST, 102),
      ]),
    });

    expect(members).toEqual([
      {
        number: 101,
        syntheticHeadSha: FIRST,
      },
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
    ).toThrow(/repeats PR #101/);
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
          Array.from({ length: 11 }, () => commit(HEAD, BASE, 102))
        ),
      })
    ).toThrow(/exceeds trusted 5-member bound/);
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
});

describe('merge-group fork policy', () => {
  it('uses the bounded request path for fork member discovery and approval', async () => {
    const paths = [];
    const approvedFork = {
      number: 101,
      state: 'open',
      base: { ref: 'main' },
      head: { sha: SOURCE_101, ref: 'codex/repair', repo: { fork: true } },
      draft: false,
      changed_files: 1,
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
          deadlineMs: 1 + 45_000,
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
        if (path.includes('/files?'))
          return { data: [{ filename: 'scripts/repair.mjs' }], link: null };
        if (path.includes('/statuses?')) return { data: [], link: null };
        throw new Error(`unexpected request: ${path}`);
      },
    });

    expect(paths).toEqual([
      `/repos/JovieInc/Jovie/compare/${BASE}...${FIRST}`,
      '/repos/JovieInc/Jovie/pulls/101',
      '/repos/JovieInc/Jovie/pulls/101',
      '/repos/JovieInc/Jovie/pulls/101/files?per_page=100&page=1',
      '/repos/JovieInc/Jovie/pulls/101/reviews?per_page=100&page=1',
      `/repos/JovieInc/Jovie/commits/${SOURCE_101}/statuses?per_page=100&page=1`,
      '/repos/JovieInc/Jovie/pulls/101',
    ]);
  });

  async function integratedPolicy({
    labels = [],
    statuses = [],
    reviews = [review(1, 'APPROVED')],
    fork = false,
    mutateFinal = null,
    secondMember = false,
  } = {}) {
    const reads = new Map();
    const logs = [];
    await runPolicy({
      argv: ['--policy=fork'],
      env: { GH_TOKEN: 'test-token' },
      event: secondMember
        ? event()
        : event({ head_sha: FIRST, head_commit: { id: FIRST } }),
      now: () => 100,
      log: line => logs.push(line),
      async request(path, options) {
        expect(options.deadlineMs).toBe(45100);
        if (path.includes('/compare/'))
          return {
            data: comparison(
              secondMember
                ? [commit(FIRST, BASE, 101), commit(HEAD, FIRST, 102)]
                : [commit(FIRST, BASE, 101)]
            ),
          };
        const number = path.includes('/pulls/102') ? 102 : 101;
        const applies = !secondMember || number === 102;
        if (/\/pulls\/\d+$/.test(path)) {
          const count = (reads.get(number) ?? 0) + 1;
          reads.set(number, count);
          const pr = {
            number,
            state: 'open',
            draft: false,
            changed_files: 1,
            base: { ref: 'main' },
            head: { sha: SOURCE_101, ref: 'codex/repair', repo: { fork } },
            labels: applies ? labels.map(name => ({ name })) : [],
          };
          if (count === 3 && mutateFinal && applies) mutateFinal(pr);
          return { data: pr };
        }
        if (path.includes('/files?'))
          return { data: [{ filename: 'scripts/repair.mjs' }], link: null };
        if (path.includes('/reviews?'))
          return { data: applies ? reviews : [], link: null };
        if (path.includes('/statuses?')) return { data: statuses, link: null };
        throw new Error(`unexpected request: ${path}`);
      },
    });
    return logs;
  }

  it('revalidates holds on internal as well as fork members, including a later cohort member', async () => {
    for (const hold of [
      'hold',
      'gated',
      'incident',
      'queue-deferred',
      'needs-conflict-resolution',
    ]) {
      await expect(integratedPolicy({ labels: [hold] })).rejects.toThrow(
        /failed fork merge-group policy/
      );
    }
    await expect(
      integratedPolicy({ labels: ['hold'], secondMember: true })
    ).rejects.toThrow(/PR #102 failed/);
    await expect(
      integratedPolicy({
        mutateFinal: pr => {
          pr.labels = [{ name: 'hold' }];
        },
      })
    ).rejects.toThrow(/failed fork merge-group policy/);
  });

  it('rejects withdrawal to draft or closure during a stale completion revalidation', async () => {
    for (const withdraw of [
      pr => {
        pr.draft = true;
      },
      pr => {
        pr.state = 'closed';
      },
    ]) {
      await expect(integratedPolicy({ mutateFinal: withdraw })).rejects.toThrow(
        /failed fork merge-group policy/
      );
    }
  });

  it('blocks durable product and unmergeable tombstones despite source-green status', async () => {
    for (const context of [
      'jovie-queue-product-failure/v1',
      'jovie-native-unmergeable/v1',
    ]) {
      const statuses = [
        {
          context,
          state: 'success',
          description: context.includes('product')
            ? 'blocked:merge-group-product-failure'
            : 'ejected:UNMERGEABLE',
          creator: { login: 'jovie-bot[bot]', type: 'Bot' },
          target_url: 'https://github.com/JovieInc/Jovie/actions/runs/123',
        },
      ];
      await expect(integratedPolicy({ statuses })).rejects.toThrow(
        /failed fork merge-group policy/
      );
    }
  });

  it('allows recovery source with offline Symphony and unbound production while requiring current reviews', async () => {
    await expect(
      integratedPolicy({
        statuses: [
          { context: 'symphony-health', state: 'failure' },
          { context: 'production-binding', state: 'failure' },
        ],
      })
    ).resolves.toContain('Validated 1 merge-group member(s) for fork policy.');
    await expect(
      integratedPolicy({ reviews: [review(1, 'CHANGES_REQUESTED')] })
    ).rejects.toThrow(/failed fork merge-group policy/);
    await expect(
      integratedPolicy({
        fork: true,
        reviews: [review(1, 'APPROVED'), review(2, 'DISMISSED')],
      })
    ).rejects.toThrow(/failed fork merge-group policy/);
    await expect(
      integratedPolicy({
        reviews: [review(1, 'CHANGES_REQUESTED'), review(2, 'APPROVED')],
      })
    ).resolves.toContain('Validated 1 merge-group member(s) for fork policy.');
  });

  it('fails closed when evidence changes head or files are truncated during admission read', async () => {
    await expect(
      integratedPolicy({
        mutateFinal: pr => {
          pr.head.sha = 'e'.repeat(40);
        },
      })
    ).rejects.toThrow(/head changed/);
    await expect(
      integratedPolicy({
        mutateFinal: pr => {
          pr.changed_files = 2;
        },
      })
    ).rejects.toThrow(/failed fork merge-group policy/);
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
