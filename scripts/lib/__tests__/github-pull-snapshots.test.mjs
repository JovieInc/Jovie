import { describe, expect, it } from 'vitest';
import { listMergedLinkedPulls } from '../validation-sync.mjs';
import { REPO } from './fixtures/validation-world.mjs';

// JOV-12717: out-of-window pulls (attachments older than the closed-pull
// snapshot) are answered by ONE aliased GraphQL batch through the shared
// api-client instead of one shared-bucket REST GET each, with the REST path
// kept as the fallback when the batch cannot run.
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
    expect(merged[0].mergeSha).toBe('a'.repeat(40));
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
