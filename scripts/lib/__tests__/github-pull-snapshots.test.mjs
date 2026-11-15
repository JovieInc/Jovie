import { describe, expect, it } from 'vitest';
import { listMergedLinkedPulls } from '../validation-sync.mjs';
import { REPO } from './fixtures/validation-world.mjs';

// JOV-12717: out-of-window pulls (attachments older than the 10-page closed
// snapshot) are answered by ONE aliased GraphQL batch on the separately
// metered budget instead of one shared-bucket REST GET each, with the REST
// path kept as the fallback when the batch cannot run.
describe('GraphQL batched pull reads (JOV-12717)', () => {
  it('answers out-of-window pulls with one GraphQL batch and no REST reads', async () => {
    let graphql = 0;
    let rest = 0;
    const github = async path => {
      rest += /\/pulls\/\d+$/.test(path) ? 1 : 0;
      throw new Error(`REST read must not happen for ${path}`);
    };
    github.graphql = async query => {
      graphql += 1;
      expect(query).toContain('pullRequest(number: 18293)');
      expect(query).toContain('pullRequest(number: 25500)');
      return {
        repository: {
          p0: {
            number: 18293,
            state: 'MERGED',
            mergedAt: '2026-11-01T00:00:00Z',
            mergeCommitSha: 'a'.repeat(40),
            title: 'fix(JOV-2)',
            body: 'closes JOV-2',
            base: { ref: 'main' },
          },
          p1: {
            number: 25500,
            state: 'OPEN',
            mergedAt: null,
            mergeCommitSha: null,
            title: 'wip',
            body: '',
            base: { ref: 'main' },
          },
        },
      };
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
    expect(graphql).toBe(1);
    expect(rest).toBe(0);
  });

  it('falls back to the per-pull REST path when the GraphQL batch fails', async () => {
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
    github.graphql = async () => {
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
});
