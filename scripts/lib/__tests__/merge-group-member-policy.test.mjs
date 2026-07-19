import { describe, expect, it } from 'vitest';
import {
  assertCurrentPullRequest,
  evaluateForkMemberPolicy,
  evaluateSizeMemberPolicy,
  resolveMergeGroupMembers,
} from '../merge-group-member-policy.mjs';

const BASE = '1'.repeat(40);
const FIRST = '2'.repeat(40);
const HEAD = '3'.repeat(40);
const SOURCE_101 = 'a'.repeat(40);

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
    ).toThrow(/exceeds trusted 10-member bound/);
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

describe('merge-group fork policy', () => {
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
