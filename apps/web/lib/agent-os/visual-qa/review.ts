import type { Dirent } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  type AgentRunArtifact,
  parseAgentRunArtifact,
} from '@/lib/agent-os/artifact';
import type {
  VisualQaDiffRunSummary,
  VisualQaSurfaceDiffRecord,
} from '@/lib/agent-os/visual-qa/diff-artifacts';
import {
  assertValidVisualQaRunId,
  getVisualQaRootDirectory,
  resolveVisualQaRunRelativePath,
} from '@/lib/agent-os/visual-qa/paths';

export const VISUAL_QA_REVIEW_FILE_NAME = 'review.json';
export const VISUAL_QA_ARTIFACT_FILE_NAME = 'artifact.json';

export const VISUAL_QA_REVIEW_DECISIONS = ['accepted', 'rejected'] as const;
export type VisualQaReviewDecision =
  (typeof VISUAL_QA_REVIEW_DECISIONS)[number];

export const VISUAL_QA_FOLLOW_UP_ACTIONS = [
  'd2_review',
  'design_html_builder',
] as const;
export type VisualQaFollowUpAction =
  (typeof VISUAL_QA_FOLLOW_UP_ACTIONS)[number];

export const VisualQaSurfaceReviewRecordSchema = z.object({
  surfaceId: z.string().trim().min(1),
  decision: z.enum(VISUAL_QA_REVIEW_DECISIONS),
  reviewer: z.string().trim().min(1),
  reviewedAt: z.string().datetime(),
  notes: z.string().trim().min(1).nullable(),
  followUpAction: z.enum(VISUAL_QA_FOLLOW_UP_ACTIONS).nullable(),
  dispatchId: z.string().trim().min(1).nullable(),
});
export type VisualQaSurfaceReviewRecord = z.infer<
  typeof VisualQaSurfaceReviewRecordSchema
>;

export const VisualQaRunReviewFileSchema = z.object({
  runId: z.string().trim().min(1),
  reviews: z.record(z.string(), VisualQaSurfaceReviewRecordSchema),
});
export type VisualQaRunReviewFile = z.infer<typeof VisualQaRunReviewFileSchema>;

export interface VisualQaReviewSurface extends VisualQaSurfaceDiffRecord {
  readonly review: VisualQaSurfaceReviewRecord | null;
}

export interface VisualQaReviewRun {
  readonly runId: string;
  readonly computedAt: string;
  readonly passed: boolean;
  readonly surfaces: readonly VisualQaReviewSurface[];
}

export class VisualQaReviewError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'already_reviewed'
  ) {
    super(message);
    this.name = 'VisualQaReviewError';
  }
}

function isDiffRunSummary(value: unknown): value is VisualQaDiffRunSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as Partial<VisualQaDiffRunSummary>;
  return (
    typeof summary.runId === 'string' &&
    typeof summary.computedAt === 'string' &&
    typeof summary.passed === 'boolean' &&
    Array.isArray(summary.surfaces) &&
    summary.surfaces.every(
      surface =>
        surface !== null &&
        typeof surface === 'object' &&
        typeof surface.surfaceId === 'string' &&
        typeof surface.title === 'string' &&
        typeof surface.status === 'string'
    )
  );
}

function isFileMissingError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function readDiffRunSummary(
  runId: string
): Promise<VisualQaDiffRunSummary | null> {
  try {
    const raw = await readFile(
      resolveVisualQaRunRelativePath(runId, 'diff-summary.json'),
      'utf8'
    );
    const parsed = JSON.parse(raw) as unknown;
    if (!isDiffRunSummary(parsed) || parsed.runId !== runId) {
      return null;
    }
    return parsed;
  } catch (error) {
    if (isFileMissingError(error)) return null;
    throw error;
  }
}

export async function readVisualQaRunReview(
  runId: string
): Promise<VisualQaRunReviewFile> {
  const safeRunId = assertValidVisualQaRunId(runId);
  try {
    const raw = await readFile(
      resolveVisualQaRunRelativePath(safeRunId, VISUAL_QA_REVIEW_FILE_NAME),
      'utf8'
    );
    const parsed = VisualQaRunReviewFileSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.runId === safeRunId) {
      return parsed.data;
    }
  } catch (error) {
    if (!isFileMissingError(error)) throw error;
  }

  return { runId: safeRunId, reviews: {} };
}

async function writeVisualQaRunReview(
  review: VisualQaRunReviewFile
): Promise<void> {
  await writeFile(
    resolveVisualQaRunRelativePath(review.runId, VISUAL_QA_REVIEW_FILE_NAME),
    `${JSON.stringify(review, null, 2)}\n`,
    'utf8'
  );
}

export async function getVisualQaReviewRun(
  runId: string
): Promise<VisualQaReviewRun | null> {
  return toReviewRun(assertValidVisualQaRunId(runId));
}

async function toReviewRun(runId: string): Promise<VisualQaReviewRun | null> {
  const summary = await readDiffRunSummary(runId);
  if (!summary) return null;

  const reviewFile = await readVisualQaRunReview(runId);

  return {
    runId: summary.runId,
    computedAt: summary.computedAt,
    passed: summary.passed,
    surfaces: summary.surfaces.map(surface => ({
      ...surface,
      review: reviewFile.reviews[surface.surfaceId] ?? null,
    })),
  };
}

export async function listVisualQaReviewRuns(
  limit = 6
): Promise<readonly VisualQaReviewRun[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(getVisualQaRootDirectory(), {
      withFileTypes: true,
    });
  } catch (error) {
    if (isFileMissingError(error)) return [];
    throw error;
  }

  const runs: VisualQaReviewRun[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    let run: VisualQaReviewRun | null = null;
    try {
      run = await toReviewRun(entry.name);
    } catch {
      // Skip runs with unreadable/invalid ids or corrupt summaries.
      continue;
    }
    if (run) runs.push(run);
  }

  const sortedRuns = runs.toSorted(
    (a, b) =>
      new Date(b.computedAt).getTime() - new Date(a.computedAt).getTime()
  );
  return sortedRuns.slice(0, limit);
}

export async function reviewVisualQaSurface(params: {
  readonly runId: string;
  readonly surfaceId: string;
  readonly decision: VisualQaReviewDecision;
  readonly notes: string | null;
  readonly reviewer: string;
  readonly followUpAction: VisualQaFollowUpAction | null;
  readonly dispatchId: string | null;
}): Promise<VisualQaSurfaceReviewRecord> {
  const summary = await readDiffRunSummary(params.runId);
  if (!summary) {
    throw new VisualQaReviewError('Visual QA run not found.', 'not_found');
  }

  const surfaceExists = summary.surfaces.some(
    candidate => candidate.surfaceId === params.surfaceId
  );
  if (!surfaceExists) {
    throw new VisualQaReviewError('Visual QA surface not found.', 'not_found');
  }

  const reviewFile = await readVisualQaRunReview(params.runId);
  if (reviewFile.reviews[params.surfaceId]) {
    throw new VisualQaReviewError(
      'Visual QA surface has already been reviewed.',
      'already_reviewed'
    );
  }

  const record: VisualQaSurfaceReviewRecord = {
    surfaceId: params.surfaceId,
    decision: params.decision,
    reviewer: params.reviewer,
    reviewedAt: new Date().toISOString(),
    notes: params.notes?.trim() ? params.notes.trim() : null,
    followUpAction:
      params.decision === 'rejected' ? params.followUpAction : null,
    dispatchId: params.dispatchId,
  };

  await writeVisualQaRunReview({
    runId: reviewFile.runId,
    reviews: { ...reviewFile.reviews, [params.surfaceId]: record },
  });

  return record;
}

/**
 * Applies the run's current review decisions to the AgentRunArtifact
 * persisted at agentos/runs/visual-qa/<runId>/artifact.json (written by the
 * capture harness when artifact persistence is enabled). Returns false when
 * no artifact file exists for the run.
 */
export async function applyVisualQaReviewToRunArtifactFile(
  runId: string
): Promise<boolean> {
  const safeRunId = assertValidVisualQaRunId(runId);
  const artifactPath = resolveVisualQaRunRelativePath(
    safeRunId,
    VISUAL_QA_ARTIFACT_FILE_NAME
  );

  let raw: string;
  try {
    raw = await readFile(artifactPath, 'utf8');
  } catch (error) {
    if (isFileMissingError(error)) return false;
    throw error;
  }

  const artifact = parseAgentRunArtifact(JSON.parse(raw));
  const reviewFile = await readVisualQaRunReview(safeRunId);
  const updated = applyVisualQaReviewToAgentRunArtifact(artifact, reviewFile);

  await writeFile(
    artifactPath,
    `${JSON.stringify(updated, null, 2)}\n`,
    'utf8'
  );
  return true;
}

/**
 * Stamps a run's review decisions onto an AgentRunArtifact whose
 * metadata.visualQaDiff matches the reviewed run: records per-surface
 * decisions under metadata.visualQaReview and resolves the human gate to
 * approved/rejected once every drifted surface has a decision.
 */
export function applyVisualQaReviewToAgentRunArtifact(
  artifact: AgentRunArtifact,
  reviewFile: VisualQaRunReviewFile
): AgentRunArtifact {
  const visualQaDiff = artifact.metadata?.visualQaDiff as
    | {
        runId?: unknown;
        surfaces?: readonly { surfaceId?: unknown; status?: unknown }[];
      }
    | undefined;

  if (!visualQaDiff || visualQaDiff.runId !== reviewFile.runId) {
    return artifact;
  }

  const driftedSurfaceIds = (visualQaDiff.surfaces ?? [])
    .filter(surface => surface.status === 'drift_detected')
    .map(surface => surface.surfaceId)
    .filter((surfaceId): surfaceId is string => typeof surfaceId === 'string');

  const decisions = driftedSurfaceIds
    .map(surfaceId => reviewFile.reviews[surfaceId])
    .filter(
      (record): record is VisualQaSurfaceReviewRecord => record !== undefined
    );
  const allReviewed =
    driftedSurfaceIds.length > 0 &&
    decisions.length === driftedSurfaceIds.length;
  const anyRejected = decisions.some(record => record.decision === 'rejected');
  const latestReviewedAt = decisions.reduce<string | undefined>(
    (latest, record) =>
      latest === undefined || record.reviewedAt > latest
        ? record.reviewedAt
        : latest,
    undefined
  );

  const shouldResolveHumanGate = allReviewed && artifact.humanGate.required;

  return parseAgentRunArtifact({
    ...artifact,
    metadata: {
      ...artifact.metadata,
      visualQaReview: {
        runId: reviewFile.runId,
        reviews: reviewFile.reviews,
      },
    },
    humanGate: shouldResolveHumanGate
      ? {
          ...artifact.humanGate,
          status: anyRejected ? 'rejected' : 'approved',
          reviewer: decisions[0]?.reviewer ?? artifact.humanGate.reviewer,
          reviewedAt: latestReviewedAt ?? artifact.humanGate.reviewedAt,
        }
      : artifact.humanGate,
  });
}
