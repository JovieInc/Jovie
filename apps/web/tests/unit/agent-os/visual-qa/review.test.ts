import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentRunArtifact } from '@/lib/agent-os/artifact';
import { getVisualQaRootDirectory } from '@/lib/agent-os/visual-qa/paths';
import {
  applyVisualQaReviewToAgentRunArtifact,
  getVisualQaReviewRun,
  listVisualQaReviewRuns,
  readVisualQaRunReview,
  reviewVisualQaSurface,
  VisualQaReviewError,
} from '@/lib/agent-os/visual-qa/review';

const runId = 'unit-review-demo';

function buildDiffSummary(overrides: Record<string, unknown> = {}) {
  return {
    runId,
    computedAt: '2026-07-06T00:00:00.000Z',
    passed: false,
    surfaces: [
      {
        surfaceId: 'shell-desktop-idle',
        title: 'Shell Desktop Idle',
        baselinePath: 'shell-desktop-idle/baseline-dark.png',
        afterPath: 'shell-desktop-idle/after-dark.png',
        overlayPath: `${runId}/shell-desktop-idle/diff-overlay.png`,
        rawDiffRatio: 0.12,
        weightedDriftScore: 0.09,
        threshold: 0.02,
        status: 'drift_detected',
        regionScores: [],
      },
    ],
    ...overrides,
  };
}

async function seedRun(): Promise<void> {
  const runDirectory = path.join(getVisualQaRootDirectory(), runId);
  await mkdir(runDirectory, { recursive: true });
  await writeFile(
    path.join(runDirectory, 'diff-summary.json'),
    `${JSON.stringify(buildDiffSummary(), null, 2)}\n`,
    'utf8'
  );
}

function buildArtifact(): AgentRunArtifact {
  return {
    id: 'run-visual-qa-1',
    source: 'ci',
    sourceRunId: null,
    kind: 'qa',
    status: 'review',
    title: 'Visual QA run',
    summary: 'Post-deploy visual QA diff run.',
    modelRoute: 'deterministic',
    allowedActions: ['read'],
    forbiddenActions: [],
    humanApprovalRequired: true,
    humanGate: {
      required: true,
      status: 'pending',
      reason: 'Visual drift requires review.',
      reviewer: null,
      reviewedAt: null,
    },
    linearIssueId: null,
    linearIssueUrl: null,
    pullRequestUrl: null,
    adminSurface: '/app/admin/ops',
    verificationGates: [],
    costEstimate: null,
    blockedReason: null,
    createdAt: '2026-07-06T00:00:00.000Z',
    updatedAt: '2026-07-06T00:00:00.000Z',
    metadata: {
      visualQaDiff: {
        runId,
        surfaces: [
          { surfaceId: 'shell-desktop-idle', status: 'drift_detected' },
        ],
      },
    },
  };
}

describe('visual-qa review store', () => {
  afterEach(async () => {
    await rm(path.join(getVisualQaRootDirectory(), runId), {
      recursive: true,
      force: true,
    });
  });

  it('lists runs with null review state before any decision', async () => {
    await seedRun();

    const runs = await listVisualQaReviewRuns();
    const run = runs.find(candidate => candidate.runId === runId);

    expect(run).toBeDefined();
    expect(run?.surfaces).toHaveLength(1);
    expect(run?.surfaces[0]?.review).toBeNull();
  });

  it('persists an accept decision and surfaces it on reads', async () => {
    await seedRun();

    const record = await reviewVisualQaSurface({
      runId,
      surfaceId: 'shell-desktop-idle',
      decision: 'accepted',
      notes: 'Intentional redesign.',
      reviewer: 'admin@jovie.test',
      followUpAction: null,
      dispatchId: null,
    });

    expect(record.decision).toBe('accepted');
    expect(record.notes).toBe('Intentional redesign.');
    expect(record.followUpAction).toBeNull();

    const run = await getVisualQaReviewRun(runId);
    expect(run?.surfaces[0]?.review?.decision).toBe('accepted');

    const reviewFile = await readVisualQaRunReview(runId);
    expect(reviewFile.reviews['shell-desktop-idle']?.reviewer).toBe(
      'admin@jovie.test'
    );
  });

  it('records follow-up routing on reject', async () => {
    await seedRun();

    const record = await reviewVisualQaSurface({
      runId,
      surfaceId: 'shell-desktop-idle',
      decision: 'rejected',
      notes: null,
      reviewer: 'admin@jovie.test',
      followUpAction: 'd2_review',
      dispatchId: 'dispatch-123',
    });

    expect(record.followUpAction).toBe('d2_review');
    expect(record.dispatchId).toBe('dispatch-123');
  });

  it('rejects double reviews of the same surface', async () => {
    await seedRun();

    await reviewVisualQaSurface({
      runId,
      surfaceId: 'shell-desktop-idle',
      decision: 'accepted',
      notes: null,
      reviewer: 'admin@jovie.test',
      followUpAction: null,
      dispatchId: null,
    });

    await expect(
      reviewVisualQaSurface({
        runId,
        surfaceId: 'shell-desktop-idle',
        decision: 'rejected',
        notes: null,
        reviewer: 'admin@jovie.test',
        followUpAction: 'd2_review',
        dispatchId: null,
      })
    ).rejects.toMatchObject({ code: 'already_reviewed' });
  });

  it('throws not_found for unknown runs and surfaces', async () => {
    await expect(
      reviewVisualQaSurface({
        runId: 'missing-run',
        surfaceId: 'shell-desktop-idle',
        decision: 'accepted',
        notes: null,
        reviewer: 'admin@jovie.test',
        followUpAction: null,
        dispatchId: null,
      })
    ).rejects.toBeInstanceOf(VisualQaReviewError);

    await seedRun();

    await expect(
      reviewVisualQaSurface({
        runId,
        surfaceId: 'missing-surface',
        decision: 'accepted',
        notes: null,
        reviewer: 'admin@jovie.test',
        followUpAction: null,
        dispatchId: null,
      })
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('resolves the artifact human gate once all drifted surfaces are reviewed', async () => {
    await seedRun();
    await reviewVisualQaSurface({
      runId,
      surfaceId: 'shell-desktop-idle',
      decision: 'rejected',
      notes: null,
      reviewer: 'admin@jovie.test',
      followUpAction: 'd2_review',
      dispatchId: null,
    });

    const reviewFile = await readVisualQaRunReview(runId);
    const updated = applyVisualQaReviewToAgentRunArtifact(
      buildArtifact(),
      reviewFile
    );

    expect(updated.humanGate.status).toBe('rejected');
    expect(updated.humanGate.reviewer).toBe('admin@jovie.test');
    expect(updated.metadata.visualQaReview).toMatchObject({ runId });
  });

  it('leaves the artifact untouched when the run id does not match', async () => {
    const artifact = buildArtifact();
    const updated = applyVisualQaReviewToAgentRunArtifact(artifact, {
      runId: 'some-other-run',
      reviews: {},
    });

    expect(updated).toEqual(artifact);
  });
});
