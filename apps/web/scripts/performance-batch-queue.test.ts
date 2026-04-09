import { describe, expect, it } from 'vitest';
import {
  getPerfBatchById,
  getPerfBatchManifest,
} from './performance-batch-manifest';
import {
  buildDefaultPerfQueueState,
  claimNextPerfBatch,
  retryBlockedPerfBatch,
  transitionPerfBatch,
} from './performance-batch-queue';

describe('performance batch queue', () => {
  it('boots with the first batch ready and the rest queued', () => {
    const state = buildDefaultPerfQueueState(
      new Date('2026-04-07T12:00:00.000Z')
    );

    expect(state.batches[0]?.batchId).toBe('B0-tooling-trust');
    expect(state.batches[0]?.status).toBe('ready');
    expect(
      state.batches.slice(1).every(batch => batch.status === 'queued')
    ).toBe(true);
  });

  it('claims the next ready batch using the manifest branch name', () => {
    const state = buildDefaultPerfQueueState(
      new Date('2026-04-07T12:00:00.000Z')
    );
    const claimed = claimNextPerfBatch(state);

    expect(claimed.currentBatchId).toBe('B0-tooling-trust');
    expect(claimed.batches[0]?.status).toBe('fixing');
    expect(claimed.batches[0]?.attempt).toBe(1);
    expect(claimed.batches[0]?.branch).toBe(
      getPerfBatchById('B0-tooling-trust')?.branchName
    );
  });

  it('advances the next queued batch when a batch is merged', () => {
    const manifest = getPerfBatchManifest();
    const claimed = claimNextPerfBatch(
      buildDefaultPerfQueueState(new Date('2026-04-07T12:00:00.000Z'))
    );
    const readyForQa = transitionPerfBatch(
      claimed,
      'B0-tooling-trust',
      'ready-for-qa'
    );
    const merged = transitionPerfBatch(
      readyForQa,
      'B0-tooling-trust',
      'merged'
    );

    expect(merged.completedIssueIds).toEqual(
      expect.arrayContaining(manifest[0]?.issueIds ?? [])
    );
    expect(merged.batches[1]?.batchId).toBe('B1-public-profile');
    expect(merged.batches[1]?.status).toBe('ready');
  });

  it('allows a single flaky-harness retry after a batch is blocked', () => {
    const claimed = claimNextPerfBatch(
      buildDefaultPerfQueueState(new Date('2026-04-07T12:00:00.000Z'))
    );
    const blocked = transitionPerfBatch(
      claimed,
      'B0-tooling-trust',
      'blocked',
      {
        blockKind: 'flaky-harness',
        reason: 'retryable selector flake',
      }
    );
    const retried = retryBlockedPerfBatch(blocked, 'B0-tooling-trust');

    expect(retried.batches[0]?.status).toBe('ready');
    expect(retried.batches[0]?.attempt).toBe(1);
    expect(retried.currentBatchId).toBeNull();
  });
});
