import { describe, expect, it } from 'vitest';
import { githubClient, listMergedLinkedPulls } from '../validation-sync.mjs';
import { REPO } from './fixtures/validation-world.mjs';

// JOV-12768 / JOV-12717: pullRequestField nests every batch alias as
// `repository { pullRequest } }`; batchPulls must unwrap it, or the binding
// checks read `batchedPull.state` off the wrapper and silently drop MERGED
// pulls. These tests prove the unwrap against the api-client's real wrapped
// response shape, plus the caller logic with mocked batchPulls.
const SELECTION =
  'number state mergedAt mergeCommitSha title body base { ref }';
const wrappedGraphQL = pullRequests => ({
  data: Object.fromEntries(
    Object.entries(pullRequests).map(([key, pullRequest], index) => [
      `k${index}`,
      { pullRequest },
    ])
  ),
});

describe('batchPulls unwraps the api-client response (JOV-12768)', () => {
  it('returns flat pull entries, not the repository wrapper', async () => {
    let posts = 0;
    const fetchMock = async (url, init) => {
      if (String(url).endsWith('/graphql')) {
        posts += 1;
        expect(init.method).toBe('POST');
        expect(String(init.body)).toContain(
          'pullRequest(number: 18293) { number state mergedAt mergeCommitSha title body base { ref } }'
        );
        return {
          ok: true,
          status: 200,
          json: async () =>
            wrappedGraphQL({
              18293: {
                number: 18293,
                state: 'MERGED',
                mergedAt: '2026-11-01T00:00:00Z',
                mergeCommitSha: 'a'.repeat(40),
                title: 'fix(JOV-2)',
                body: 'closes JOV-2',
                base: { ref: 'main' },
              },
            }),
          headers: new Map(),
        };
      }
      throw new Error(`unexpected REST call ${url}`);
    };
    const out = await githubClient(fetchMock, 'tok').batchPulls(
      REPO,
      [18293],
      SELECTION
    );
    expect(posts).toBe(1);
    expect(out.get(18293)).toEqual({
      number: 18293,
      state: 'MERGED',
      mergedAt: '2026-11-01T00:00:00Z',
      mergeCommitSha: 'a'.repeat(40),
      title: 'fix(JOV-2)',
      body: 'closes JOV-2',
      base: { ref: 'main' },
    });
    expect(Object.hasOwn(out.get(18293) ?? {}, 'pullRequest')).toBe(false);
  });

  it('keeps a MERGED pull bound end-to-end (not dropped) and skips OPEN', async () => {
    const fetchMock = async (url, init) => {
      if (String(url).endsWith('/graphql')) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            wrappedGraphQL({
              18293: {
                number: 18293,
                state: 'MERGED',
                mergedAt: '2026-11-01T00:00:00Z',
                mergeCommitSha: 'a'.repeat(40),
                title: 'fix(JOV-2)',
                body: 'closes JOV-2',
                base: { ref: 'main' },
              },
              25500: {
                number: 25500,
                state: 'OPEN',
                mergedAt: null,
                mergeCommitSha: null,
                title: 'wip',
                body: '',
                base: { ref: 'main' },
              },
            }),
          headers: new Map(),
        };
      }
      // A REST per-pull read here would mean the batch answer was ignored.
      throw new Error(`REST read must not happen for ${url}`);
    };
    const merged = await listMergedLinkedPulls({
      github: githubClient(fetchMock, 'tok'),
      repository: REPO,
      identifier: 'JOV-2',
      attachmentUrls: [
        `https://github.com/${REPO}/pull/18293`,
        `https://github.com/${REPO}/pull/25500`,
      ],
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].number).toBe(18293);
    expect(merged[0].mergeSha).toBe('a'.repeat(40));
  });

  it('maps a null alias (missing PR, no errors) to null so the caller falls back to REST', async () => {
    const fetchMock = async url => {
      if (String(url).endsWith('/graphql')) {
        return {
          ok: true,
          status: 200,
          json: async () => wrappedGraphQL({ 18293: null }),
          headers: new Map(),
        };
      }
      throw new Error(`unexpected call ${url}`);
    };
    const out = await githubClient(fetchMock, 'tok').batchPulls(
      REPO,
      [18293],
      SELECTION
    );
    expect(out.get(18293)).toBeNull();
  });
});

describe('GraphQL batched pull reads (JOV-12717)', () => {
  it('answers out-of-window pulls with one batch and no REST reads', async () => {
    let rest = 0;
    let batches = 0;
    const github = async path => {
      rest += /\/pulls\/\d+$/.test(path) ? 1 : 0;
      throw new Error(`REST read must not happen for ${path}`);
    };
    github.batchPulls = async (repository, numbers, selection) => {
      batches += 1;
      expect(repository).toBe(REPO);
      expect(numbers).toEqual([25500, 18293]);
      expect(selection).toContain('mergeCommitSha');
      return new Map([
        [
          18293,
          {
            state: 'MERGED',
            mergedAt: '2026-11-01T00:00:00Z',
            mergeCommitSha: 'a'.repeat(40),
            title: 'fix(JOV-2)',
            body: 'closes JOV-2',
            baseRef: 'main',
          },
        ],
        [
          25500,
          {
            state: 'OPEN',
            mergedAt: '',
            mergeCommitSha: '',
            title: 'wip',
            body: '',
            baseRef: 'main',
          },
        ],
      ]);
    };
    const merged = await listMergedLinkedPulls({
      github,
      repository: REPO,
      identifier: 'JOV-2',
      attachmentUrls: [
        `https://github.com/${REPO}/pull/18293`,
        `https://github.com/${REPO}/pull/25500`,
      ],
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].number).toBe(18293);
    expect(batches).toBe(1);
    expect(rest).toBe(0);
  });

  it('falls back to the per-pull REST path when the batch fails', async () => {
    const github = async () => ({
      body: {
        number: 18293,
        merged_at: '2026-11-01T00:00:00Z',
        merge_commit_sha: 'b'.repeat(40),
        title: 'fix(JOV-3)',
        body: 'closes JOV-3',
        html_url: `https://github.com/${REPO}/pull/18293`,
        base: { ref: 'main' },
        head: { ref: 'x' },
      },
      link: '',
    });
    github.batchPulls = async () => {
      throw new Error('GitHub GraphQL 403: rate limit');
    };
    const merged = await listMergedLinkedPulls({
      github,
      repository: REPO,
      identifier: 'JOV-3',
      attachmentUrls: [`https://github.com/${REPO}/pull/18293`],
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].mergeSha).toBe('b'.repeat(40));
  });

  it('never batches numbers the snapshot or open scan already answer', async () => {
    let batches = 0;
    const restBody = {
      number: 18293,
      merged_at: '2026-11-01T00:00:00Z',
      merge_commit_sha: 'c'.repeat(40),
      title: 'fix(JOV-4)',
      body: 'closes JOV-4',
      html_url: `https://github.com/${REPO}/pull/18293`,
      base: { ref: 'main' },
      head: { ref: 'x' },
    };
    const github = async path => {
      if (/\/pulls\/18293$/.test(path)) return { body: restBody, link: '' };
      throw new Error(`unexpected REST read ${path}`);
    };
    github.batchPulls = async () => {
      batches += 1;
      throw new Error('batch must not run');
    };
    const merged = await listMergedLinkedPulls({
      github,
      repository: REPO,
      identifier: 'JOV-4',
      attachmentUrls: [
        `https://github.com/${REPO}/pull/18293`,
        `https://github.com/${REPO}/pull/25500`,
      ],
      closedPulls: new Map([[18293, { number: 18293, merged: true }]]),
      openPullNumbers: new Set([25500]),
    });
    expect(merged).toHaveLength(1);
    expect(batches).toBe(0);
  });
});
