import { describe, expect, it } from 'vitest';
import {
  evaluateForkMemberPolicy,
  evaluateSizeMemberPolicy,
  resolveMergeGroupMembers,
} from '../merge-group-member-policy.mjs';

const BASE = '1'.repeat(40);
const FIRST = '2'.repeat(40);
const HEAD = '3'.repeat(40);
const SOURCE_101 = 'a'.repeat(40);
const SOURCE_102 = 'b'.repeat(40);

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
    commit: { message: `fix(ci): queue member ${number} (#${number})` },
  };
}

function entry(number, position, syntheticHead, sourceHead, base = BASE) {
  return {
    position,
    state: 'AWAITING_CHECKS',
    baseCommit: { oid: base },
    headCommit: { oid: syntheticHead },
    pullRequest: {
      number,
      baseRefName: 'main',
      headRefOid: sourceHead,
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

function queue(nodes) {
  return {
    configuration: {
      maximumEntriesToMerge: 10,
      mergeMethod: 'SQUASH',
      mergingStrategy: 'ALLGREEN',
    },
    entries: {
      totalCount: nodes.length,
      pageInfo: { hasNextPage: false },
      nodes,
    },
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
  it('cross-proves every member of a multi-entry group in queue order', () => {
    const members = resolveMergeGroupMembers({
      event: event(),
      comparison: comparison([
        commit(FIRST, BASE, 101),
        commit(HEAD, FIRST, 102),
      ]),
      queue: queue([
        entry(101, 4, FIRST, SOURCE_101),
        entry(102, 5, HEAD, SOURCE_102, FIRST),
        entry(103, 6, '4'.repeat(40), 'c'.repeat(40), HEAD),
      ]),
    });

    expect(members).toEqual([
      {
        number: 101,
        position: 4,
        queueState: 'AWAITING_CHECKS',
        syntheticHeadSha: FIRST,
        sourceHeadSha: SOURCE_101,
      },
      {
        number: 102,
        position: 5,
        queueState: 'AWAITING_CHECKS',
        syntheticHeadSha: HEAD,
        sourceHeadSha: SOURCE_102,
      },
    ]);
  });

  it('fails closed on unknown, truncated, or malformed member evidence', () => {
    const commits = [commit(HEAD, BASE, 102)];
    const validQueue = queue([entry(102, 1, HEAD, SOURCE_102)]);

    expect(() =>
      resolveMergeGroupMembers({
        event: event({ head_ref: 'refs/heads/main' }),
        comparison: comparison(commits),
        queue: validQueue,
      })
    ).toThrow(/head_ref is not a main merge-queue ref/);

    expect(() =>
      resolveMergeGroupMembers({
        event: event(),
        comparison: comparison(commits),
        queue: queue([]),
      })
    ).toThrow(/absent from the live merge queue/);

    expect(() =>
      resolveMergeGroupMembers({
        event: event(),
        comparison: comparison(commits),
        queue: {
          ...validQueue,
          entries: {
            ...validQueue.entries,
            pageInfo: { hasNextPage: true },
          },
        },
      })
    ).toThrow(/incomplete or malformed/);

    expect(() =>
      resolveMergeGroupMembers({
        event: event(),
        comparison: comparison([
          {
            ...commits[0],
            commit: {
              message: 'synthetic commit without an attributable trailer',
            },
          },
        ]),
        queue: validQueue,
      })
    ).toThrow(/no final \(#PR\) trailer/);

    expect(() =>
      resolveMergeGroupMembers({
        event: event(),
        comparison: comparison([
          commit(FIRST, BASE, 101),
          commit(HEAD, FIRST, 102),
        ]),
        queue: queue([
          entry(101, 4, FIRST, SOURCE_101),
          entry(102, 6, HEAD, SOURCE_102),
        ]),
      })
    ).toThrow(/out of merge queue order/);

    expect(() =>
      resolveMergeGroupMembers({
        event: event(),
        comparison: comparison([
          commit(FIRST, BASE, 101),
          commit(HEAD, FIRST, 102),
        ]),
        queue: queue([
          entry(101, 4, FIRST, SOURCE_101),
          // A later queue entry is based on the previous synthetic head, not
          // the original merge-group base.
          entry(102, 5, HEAD, SOURCE_102),
        ]),
      })
    ).toThrow(/does not match the synthetic chain/);
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
