/**
 * Merge-receipt and Refs-line coverage for the Linear validation lifecycle
 * writer (JOV-13063): once the native GitHub -> Linear sync is disabled, a
 * merged pull request must still prove it reached its issue via the
 * `merge-sync-receipt/v1` comment, and `Refs JOV-` bodies must resolve.
 * Split out of linear-sync-on-merge.test.mjs to stay inside that file's
 * size-500 ceiling.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractMergeIssueRef,
  syncLinearIssueOnMerge,
} from '../linear-sync-on-merge.mjs';
import {
  hasMergeReceipt,
  mergeReceiptBody,
  readMergeEventPayload,
} from '../merge-receipt.mjs';
import {
  createWorld,
  HARNESS_MANIFEST,
  intercept,
  NO_UI_MATRIX,
} from './fixtures/validation-world.mjs';

const BASE_ENV = {
  LINEAR_API_KEY: 'lin_test',
  GITHUB_TOKEN: 'gh_test',
  GITHUB_REPOSITORY: 'JovieInc/Jovie',
  PR_NUMBER: '101',
  HEAD_REF: 'feature/no-ticket',
};
const MERGE_SHA = 'eb6a0a68c92750dca7cd378732abf71c24c5558e';

function writeEventPayload(dir, payload) {
  const path = join(dir, 'event.json');
  writeFileSync(path, JSON.stringify(payload));
  return path;
}

describe('extractMergeIssueRef Refs-line and title keys (JOV-13063)', () => {
  it('reads a Refs JOV-N line when markers and the branch are silent', () => {
    expect(
      extractMergeIssueRef({
        body: 'summary\n\nRefs JOV-123\n',
        headRef: 'feature/x',
      })
    ).toEqual({ identifier: 'JOV-123', issueId: 'JOV-123' });
  });

  it('reads a JOV key from the title when no marker, branch or Refs line exists', () => {
    expect(
      extractMergeIssueRef({
        body: 'no links here',
        headRef: 'feature/x',
        title: 'feat: add thing (JOV-9)',
      })
    ).toEqual({ identifier: 'JOV-9', issueId: 'JOV-9' });
  });

  it('keeps markers above the Refs line and the branch above Refs', () => {
    expect(
      extractMergeIssueRef({
        body: '<!-- linear-issue-identifier:JOV-1 -->\nRefs JOV-2',
        headRef: 'codex/jov-3-fix',
      }).identifier
    ).toBe('JOV-1');
    expect(
      extractMergeIssueRef({ body: 'Refs JOV-2', headRef: 'codex/jov-3-fix' })
        .identifier
    ).toBe('JOV-3');
  });

  it('treats a present-but-empty Refs JOV- template as explicitly unlinked', () => {
    expect(
      extractMergeIssueRef({
        body: 'summary\n\nRefs JOV-\n',
        title: 'feat: add thing (JOV-9)',
      }).identifier
    ).toBe('');
  });

  it('falls through to the title only when no Refs line exists at all', () => {
    expect(
      extractMergeIssueRef({
        body: 'summary',
        title: 'fix: broken thing (JOV-77)',
      }).identifier
    ).toBe('JOV-77');
  });

  it('gives non-JOV keys nothing yet (LYB/SYM stay outside this writer)', () => {
    expect(
      extractMergeIssueRef({
        body: 'Refs LYB-5',
        headRef: 'fix/lyb-5',
        title: 'fix: (LYB-5)',
      }).identifier
    ).toBe('');
  });

  it('fails visibly when the Linear receipt write cannot land (no silent drop)', async () => {
    const { fetchImpl } = createWorld();
    const failing = intercept(fetchImpl, (_url, body) =>
      body?.query?.includes('mutation AddLifecycleComment')
        ? {
            ok: false,
            status: 502,
            headers: { get: () => null },
            json: async () => ({}),
          }
        : null
    );
    const dir = mkdtempSync(join(tmpdir(), 'merge-receipt-down-'));
    try {
      const eventPath = writeEventPayload(dir, {
        number: 101,
        pull_request: {
          number: 101,
          title: 'feat: profiles (JOV-1)',
          merge_commit_sha: MERGE_SHA,
        },
      });
      await expect(
        syncLinearIssueOnMerge({
          env: {
            ...BASE_ENV,
            PR_BODY: '<!-- linear-issue-identifier:JOV-1 -->',
            GITHUB_EVENT_PATH: eventPath,
          },
          fetchImpl: failing,
          harnessManifest: HARNESS_MANIFEST,
          assuranceMatrix: NO_UI_MATRIX,
          verifyMarker: () => true,
          sleep: async () => {},
          log: () => {},
        })
      ).rejects.toThrow(/Lifecycle evaluation failed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('merge receipt (JOV-13063)', () => {
  it('carries the PR number and the 40-char merge SHA', () => {
    const body = mergeReceiptBody(18275, MERGE_SHA);
    expect(body).toContain(
      'merge-sync-receipt/v1 pr=18275 sha=eb6a0a68c92750dca7cd378732abf71c24c5558e'
    );
    expect(hasMergeReceipt([body], 18275, MERGE_SHA)).toBe(true);
    expect(hasMergeReceipt([body], 18275, 'a'.repeat(40))).toBe(false);
    expect(hasMergeReceipt([], 18275, MERGE_SHA)).toBe(false);
  });

  it('parses the closed-PR event payload defensively', () => {
    const dir = mkdtempSync(join(tmpdir(), 'merge-receipt-payload-'));
    try {
      const path = writeEventPayload(dir, {
        number: 101,
        pull_request: {
          number: 101,
          title: 'feat: thing (JOV-1)',
          merge_commit_sha: MERGE_SHA,
        },
      });
      expect(readMergeEventPayload(path)).toEqual({
        number: 101,
        title: 'feat: thing (JOV-1)',
        sha: MERGE_SHA,
      });
      writeFileSync(path, '{broken');
      expect(readMergeEventPayload(path)).toBe(null);
      expect(readMergeEventPayload(undefined)).toBe(null);
      writeFileSync(
        path,
        JSON.stringify({
          number: 101,
          pull_request: { number: 101, title: 't', merge_commit_sha: 'nope' },
        })
      );
      expect(readMergeEventPayload(path)?.sha).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes the receipt with PR and SHA after a merge event, and a replay writes no second comment', async () => {
    const { world, fetchImpl } = createWorld();
    const dir = mkdtempSync(join(tmpdir(), 'merge-receipt-event-'));
    try {
      const eventPath = writeEventPayload(dir, {
        number: 101,
        pull_request: {
          number: 101,
          title: 'feat: profiles (JOV-1)',
          merge_commit_sha: MERGE_SHA,
        },
      });
      const env = {
        ...BASE_ENV,
        PR_BODY: '<!-- linear-issue-identifier:JOV-1 -->',
        GITHUB_EVENT_PATH: eventPath,
      };
      const run = () =>
        syncLinearIssueOnMerge({
          env,
          fetchImpl,
          harnessManifest: HARNESS_MANIFEST,
          assuranceMatrix: NO_UI_MATRIX,
          verifyMarker: () => true,
          log: () => {},
        });
      await run();
      expect(
        world.comments.filter(comment =>
          comment.includes('merge-sync-receipt/v1 pr=101')
        )
      ).toHaveLength(1);
      const first = world.comments.find(comment =>
        comment.includes('merge-sync-receipt/v1 pr=101')
      );
      expect(first).toContain(MERGE_SHA);
      const after = world.comments.length;
      await run();
      expect(world.comments).toHaveLength(after);
      // The receipt rides on the same Linear addComment port: the transition
      // above still moved the issue exactly as before the receipt existed.
      expect(world.updates).toEqual(['JOV-1:Done']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not write a receipt without a usable closed-PR payload', async () => {
    const { world, fetchImpl } = createWorld();
    await syncLinearIssueOnMerge({
      env: {
        ...BASE_ENV,
        PR_BODY: '<!-- linear-issue-identifier:JOV-1 -->',
      },
      fetchImpl,
      harnessManifest: HARNESS_MANIFEST,
      assuranceMatrix: NO_UI_MATRIX,
      verifyMarker: () => true,
      log: () => {},
    });
    expect(
      world.comments.every(
        comment => !comment.includes('merge-sync-receipt/v1')
      )
    ).toBe(true);
  });

  it('keeps the receipt file readable when the event path does not exist', () => {
    expect(
      readMergeEventPayload(join(tmpdir(), 'missing-event-payload.json'))
    ).toBe(null);
    expect(existsSync(join(tmpdir(), 'missing-event-payload.json'))).toBe(
      false
    );
  });
});
