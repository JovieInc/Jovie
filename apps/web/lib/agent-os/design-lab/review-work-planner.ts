import {
  invalidateMarketingDecisionDependencies,
  marketingDecisionDigest,
  type MarketingDecisionDependency,
} from '@/data/marketing';
import type { MarketingImprovementLoopResult } from '@/data/marketing/improvement';
import {
  type MarketingRegistryEligibility,
  type MarketingReviewRegistryTarget,
  validateMarketingReviewRegistryTargets,
} from './review-work-registry';
import {
  CHANGE_STAGE_MAP,
  DESIGN_LAB_REVIEW_WORK_EVENT_TYPE,
  DESIGN_LAB_REVIEW_WORK_SCHEMA,
  type MarketingLegacyReviewFinding,
  type MarketingMaterialChange,
  type MarketingMaterialChangeKind,
  type MarketingReviewDecisionStatus,
  type MarketingReviewEvidenceRecord,
  type MarketingReviewExistingTask,
  type MarketingReviewWorkPlan,
  type MarketingReviewWorkStage,
  type MarketingReviewWorkTask,
  type PlanMarketingReviewWorkFromImprovementInput,
  type PlanMarketingReviewWorkInput,
  buildDispatchRequest,
  legacyAdvisories,
  marketingReviewWorkPlanDigest,
  normalizedPath,
  requireText,
  staleEvidenceIds,
  stageOrder,
  uniqueSorted,
} from './review-work-contracts';

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const ARTIFACT_SHA256 = /^[a-f0-9]{64}$/;

function normalizeChanges(
  changes: readonly MarketingMaterialChange[]
): readonly MarketingMaterialChange[] {
  const ids = new Set<string>();
  return changes
    .map(change => {
      const id = requireText(change.id, 'material change id');
      if (ids.has(id)) throw new Error(`duplicate material change: ${id}`);
      ids.add(id);
      if (!Object.hasOwn(CHANGE_STAGE_MAP, change.kind)) {
        throw new Error(`unsupported material change kind: ${change.kind}`);
      }
      const paths = uniqueSorted(change.paths.map(normalizedPath));
      if (paths.length === 0) {
        throw new Error(`material change ${id} requires an actual path`);
      }
      return {
        id,
        kind: change.kind,
        paths,
        revision: requireText(change.revision, `revision for ${id}`),
        ...(change.dependencyIds
          ? { dependencyIds: uniqueSorted(change.dependencyIds) }
          : {}),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function validDigest(value: string, name: string): string {
  const normalized = requireText(value, name);
  if (!SHA256_DIGEST.test(normalized)) {
    throw new Error(`${name} must be a sha256 digest with its algorithm prefix`);
  }
  return normalized;
}

function validArtifactDigest(value: string): string {
  const normalized = requireText(value, 'artifact digest');
  if (!ARTIFACT_SHA256.test(normalized)) {
    throw new Error('artifact digest must be an exact 64-character sha256 value');
  }
  return normalized;
}

function finalizePlan(
  draft: Omit<MarketingReviewWorkPlan, 'workDigest'>
): MarketingReviewWorkPlan {
  const workDigest = marketingDecisionDigest(draft);
  const plan = { ...draft, workDigest };
  if (marketingReviewWorkPlanDigest(plan) !== workDigest) {
    throw new Error('marketing review work digest construction failed');
  }
  return plan;
}

function emptyPlan(input: {
  readonly reviewId: string;
  readonly contextDigest: string;
  readonly owner: string | null;
  readonly reusedTaskId?: string | null;
  readonly reason: MarketingReviewWorkPlan['status'];
  readonly affectedPaths: readonly string[];
  readonly affectedStages: readonly MarketingReviewWorkStage[];
  readonly invalidatedDependencyIds: readonly string[];
  readonly staleEvidenceIds: readonly string[];
  readonly legacyAdvisories: readonly MarketingLegacyReviewFinding[];
  readonly registryEligibility: readonly MarketingRegistryEligibility[];
}): MarketingReviewWorkPlan {
  return finalizePlan({
    schema: DESIGN_LAB_REVIEW_WORK_SCHEMA,
    reviewId: input.reviewId,
    contextDigest: input.contextDigest,
    owner: input.owner,
    reusedTaskId: input.reusedTaskId ?? null,
    status: input.reason,
    task: null,
    affectedPaths: input.affectedPaths,
    affectedStages: input.affectedStages,
    invalidatedDependencyIds: input.invalidatedDependencyIds,
    staleEvidenceIds: input.staleEvidenceIds,
    legacyAdvisories: input.legacyAdvisories,
    registryEligibility: input.registryEligibility,
    enqueue: {
      authority: 'existing-hermes-worker',
      eventType: DESIGN_LAB_REVIEW_WORK_EVENT_TYPE,
      admitted: false,
    },
    advisory: true,
    certified: false,
    autonomousDeployment: false,
  });
}

function normalizeOwner(owner: string | null): string | null {
  return owner?.trim() || null;
}

function taskFromInput(input: {
  readonly idempotencyKey: string;
  readonly taskId: string;
  readonly reviewId: string;
  readonly route: string;
  readonly pageId: string;
  readonly contextDigest: string;
  readonly sourceRevision: string;
  readonly artifactSha256: string;
  readonly owner: string | null;
  readonly changeIds: readonly string[];
  readonly changeKinds: readonly MarketingMaterialChangeKind[];
  readonly affectedPaths: readonly string[];
  readonly stages: readonly MarketingReviewWorkStage[];
  readonly staleDependencyIds: readonly string[];
  readonly staleEvidenceIds: readonly string[];
  readonly registryEligibility: readonly MarketingRegistryEligibility[];
  readonly reviewArtifactRef: string | null;
  readonly integratedRevalidationRequired: boolean;
}): MarketingReviewWorkTask {
  const base = {
    schema: DESIGN_LAB_REVIEW_WORK_SCHEMA,
    taskId: input.taskId,
    idempotencyKey: input.idempotencyKey,
    reviewId: input.reviewId,
    route: input.route,
    pageId: input.pageId,
    contextDigest: input.contextDigest,
    sourceRevision: input.sourceRevision,
    artifactSha256: input.artifactSha256,
    owner: input.owner,
    changeIds: input.changeIds,
    changeKinds: input.changeKinds,
    affectedPaths: input.affectedPaths,
    stages: input.stages,
    staleDependencyIds: input.staleDependencyIds,
    staleEvidenceIds: input.staleEvidenceIds,
    registryEligibility: input.registryEligibility,
    reviewArtifactRef: input.reviewArtifactRef,
    eventType: DESIGN_LAB_REVIEW_WORK_EVENT_TYPE,
    advisory: true as const,
    certified: false as const,
    selfCertification: 'forbidden' as const,
    autonomousDeployment: false as const,
    integratedRevalidationRequired: input.integratedRevalidationRequired,
    status: 'dispatchable' as const,
  };
  const task = {
    ...base,
    dispatchRequest: buildDispatchRequest({
      ...base,
      // The request source is bound to the stable idempotency key.
      idempotencyKey: input.idempotencyKey,
    }),
  };
  const taskDigest = marketingDecisionDigest(task);
  return { ...task, taskDigest };
}

/**
 * Plan affected review work from material changes. This function never
 * persists, enqueues, calls a model, or mutates an existing owner/task.
 */
export function planMarketingReviewWork(
  input: PlanMarketingReviewWorkInput
): MarketingReviewWorkPlan {
  const reviewId = requireText(input.reviewId, 'review id');
  const route = requireText(input.route, 'route');
  const pageId = requireText(input.pageId, 'page id');
  const sourceRevision = requireText(input.sourceRevision, 'source revision');
  const artifactSha256 = validArtifactDigest(input.artifactSha256);
  if (sourceRevision !== input.context.sourceRevision) {
    throw new Error('source revision must match the frozen decision context');
  }
  const changes = normalizeChanges(input.changes);
  const affectedPaths = uniqueSorted(changes.flatMap(change => change.paths));
  const directDependencyIds = changes.flatMap(
    change => change.dependencyIds ?? []
  );
  const derivedDependencyIds = input.dependencies
    ? invalidateMarketingDecisionDependencies({
        changedPaths: affectedPaths,
        dependencies: input.dependencies,
      })
    : [];
  const invalidatedDependencyIds = uniqueSorted([
    ...(input.invalidatedDependencyIds ?? []),
    ...directDependencyIds,
    ...derivedDependencyIds,
  ]);
  const staleEvidence = staleEvidenceIds(
    input.evidence ?? [],
    invalidatedDependencyIds
  );
  const legacy = legacyAdvisories(
    input.legacyFindings ?? [],
    affectedPaths,
    invalidatedDependencyIds
  );
  const registryEligibility = validateMarketingReviewRegistryTargets(
    input.registryTargets ?? []
  );
  const affectedStages = stageOrder(
    changes.flatMap(change => CHANGE_STAGE_MAP[change.kind])
  );
  if (input.decisionStatus === 'accepted' && changes.length > 0) {
    affectedStages.push('integrated-page', 'journey');
  }
  const orderedStages = stageOrder(affectedStages);
  const owner = normalizeOwner(input.owner);
  if (changes.length === 0) {
    return emptyPlan({
      reviewId,
      contextDigest: input.context.contextDigest,
      reason: 'advisory-only',
      affectedPaths: [],
      affectedStages: [],
      invalidatedDependencyIds,
      staleEvidenceIds: staleEvidence,
      legacyAdvisories: legacy,
      registryEligibility,
      owner,
    });
  }
  if (registryEligibility.some(item => item.blocking)) {
    return emptyPlan({
      reviewId,
      contextDigest: input.context.contextDigest,
      reason: 'blocked',
      affectedPaths,
      affectedStages: orderedStages,
      invalidatedDependencyIds,
      staleEvidenceIds: staleEvidence,
      legacyAdvisories: legacy,
      registryEligibility,
      owner,
    });
  }

  const candidateDigest = validDigest(input.candidateDigest, 'candidate digest');
  const changeIds = changes.map(change => change.id);
  const changeKinds = uniqueSorted(
    changes.map(change => change.kind)
  ) as MarketingMaterialChangeKind[];
  const reviewArtifactRef = input.reviewArtifactRef?.trim() || null;
  const idempotencyKey = marketingDecisionDigest({
    schema: DESIGN_LAB_REVIEW_WORK_SCHEMA,
    route,
    pageId,
    contextDigest: input.context.contextDigest,
    sourceRevision,
    artifactSha256,
    decisionStatus: input.decisionStatus,
    candidateDigest,
    changes,
    affectedPaths,
    stages: orderedStages,
    invalidatedDependencyIds,
    staleEvidenceIds: staleEvidence,
    registryEligibility,
    reviewArtifactRef,
  });
  const existing = input.existingTasks?.find(
    task => task.idempotencyKey === idempotencyKey
  );
  if (existing) {
    return emptyPlan({
      reviewId,
      contextDigest: input.context.contextDigest,
      reason: 'duplicate',
      affectedPaths,
      affectedStages: orderedStages,
      invalidatedDependencyIds,
      staleEvidenceIds: staleEvidence,
      legacyAdvisories: legacy,
      registryEligibility,
      owner: existing.owner,
      reusedTaskId: existing.taskId,
    });
  }

  const taskId = `marketing-review-${idempotencyKey.slice('sha256:'.length, 24)}`;
  const task = taskFromInput({
    idempotencyKey,
    taskId,
    reviewId,
    route,
    pageId,
    contextDigest: input.context.contextDigest,
    sourceRevision,
    artifactSha256,
    owner,
    changeIds,
    changeKinds,
    affectedPaths,
    stages: orderedStages,
    staleDependencyIds: invalidatedDependencyIds,
    staleEvidenceIds: staleEvidence,
    registryEligibility,
    reviewArtifactRef,
    integratedRevalidationRequired: input.decisionStatus === 'accepted',
  });
  return finalizePlan({
    schema: DESIGN_LAB_REVIEW_WORK_SCHEMA,
    reviewId,
    contextDigest: input.context.contextDigest,
    owner,
    reusedTaskId: null,
    status: 'dispatchable',
    task,
    affectedPaths,
    affectedStages: orderedStages,
    invalidatedDependencyIds,
    staleEvidenceIds: staleEvidence,
    legacyAdvisories: legacy,
    registryEligibility,
    enqueue: {
      authority: 'existing-hermes-worker',
      eventType: DESIGN_LAB_REVIEW_WORK_EVENT_TYPE,
      admitted: false,
    },
    advisory: true,
    certified: false,
    autonomousDeployment: false,
  });
}

export function planMarketingReviewWorkFromImprovement<TValue>(
  input: PlanMarketingReviewWorkFromImprovementInput<TValue>
): MarketingReviewWorkPlan {
  return planMarketingReviewWork({
    reviewId: input.reviewId,
    route: input.route,
    pageId: input.improvement.context.pageId,
    context: input.improvement.context,
    sourceRevision: input.improvement.context.sourceRevision,
    artifactSha256: input.artifactSha256,
    decisionStatus: input.improvement.status,
    candidateDigest: input.improvement.selectedCandidateDigest,
    changes: input.changes,
    dependencies: input.dependencies,
    invalidatedDependencyIds: input.improvement.invalidatedDependencyIds,
    evidence: input.evidence,
    legacyFindings: input.legacyFindings,
    registryTargets: input.registryTargets,
    existingTasks: input.existingTasks,
    owner: input.owner,
    reviewArtifactRef: input.reviewArtifactRef,
  });
}
