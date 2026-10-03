import {
  type MarketingDecisionDependency,
  type MarketingFrozenDecisionContext,
  type MarketingGenerationStage,
  marketingDecisionDigest,
} from '@/data/marketing';
import type { MarketingImprovementLoopResult } from '@/data/marketing/improvement';
import type {
  HermesDispatchRequest,
  HermesDispatchResult,
} from '@/types/ai-ops';
import type {
  MarketingRegistryEligibility,
  MarketingReviewRegistryTarget,
} from './review-work-registry';

export const DESIGN_LAB_REVIEW_WORK_SCHEMA =
  'design-lab-review-work/v1' as const;
export const DESIGN_LAB_REVIEW_WORK_EVENT_TYPE = 'hermes_cli_worker' as const;
export const DESIGN_LAB_REVIEW_WORK_DISPATCH_SOURCE = 'hermes' as const;
export const DESIGN_LAB_REVIEW_WORK_KIND = 'investigation' as const;

export const MARKETING_MATERIAL_CHANGE_KINDS = [
  'copy',
  'claim',
  'feature',
  'token',
  'proof',
] as const;

export type MarketingMaterialChangeKind =
  (typeof MARKETING_MATERIAL_CHANGE_KINDS)[number];

export interface MarketingMaterialChange {
  readonly id: string;
  readonly kind: MarketingMaterialChangeKind;
  /** Actual source or rendered paths changed by the owning producer. */
  readonly paths: readonly string[];
  readonly revision: string;
  readonly dependencyIds?: readonly string[];
}

export interface MarketingLegacyReviewFinding {
  readonly id: string;
  readonly summary: string;
  readonly paths: readonly string[];
  readonly dependencyIds?: readonly string[];
}

export interface MarketingReviewEvidenceRecord {
  readonly id: string;
  readonly dependencyIds: readonly string[];
  readonly digest: string;
  readonly status: 'fresh' | 'stale' | 'advisory';
}

export type MarketingReviewWorkStage =
  | MarketingGenerationStage
  | 'integrated-page'
  | 'journey';

export type MarketingReviewWorkStatus =
  | 'dispatchable'
  | 'duplicate'
  | 'blocked'
  | 'advisory-only';

export type MarketingReviewDispatchRejection =
  | 'unauthorized-owner'
  | 'budget-exhausted'
  | 'stale-evidence'
  | 'duplicate'
  | 'legacy-only'
  | 'registry-ineligible'
  | 'autonomous-deployment-forbidden'
  | 'admission-unavailable'
  | 'worker-rejected';

export interface MarketingReviewExistingTask {
  readonly idempotencyKey: string;
  readonly taskId: string;
  readonly owner: string | null;
  readonly status: 'planned' | 'queued' | 'running' | 'done' | 'failed';
}

export interface MarketingReviewWorkTask {
  readonly schema: typeof DESIGN_LAB_REVIEW_WORK_SCHEMA;
  readonly taskDigest: string;
  readonly taskId: string;
  readonly idempotencyKey: string;
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
  readonly eventType: typeof DESIGN_LAB_REVIEW_WORK_EVENT_TYPE;
  readonly dispatchRequest: HermesDispatchRequest;
  readonly advisory: true;
  readonly certified: false;
  readonly selfCertification: 'forbidden';
  readonly autonomousDeployment: false;
  readonly integratedRevalidationRequired: boolean;
  readonly status: Exclude<MarketingReviewWorkStatus, 'advisory-only'>;
}

export interface MarketingReviewWorkPlan {
  readonly schema: typeof DESIGN_LAB_REVIEW_WORK_SCHEMA;
  readonly workDigest: string;
  readonly reviewId: string;
  readonly contextDigest: string;
  readonly owner: string | null;
  readonly reusedTaskId: string | null;
  readonly status: MarketingReviewWorkStatus;
  readonly task: MarketingReviewWorkTask | null;
  readonly affectedPaths: readonly string[];
  readonly affectedStages: readonly MarketingReviewWorkStage[];
  readonly invalidatedDependencyIds: readonly string[];
  readonly staleEvidenceIds: readonly string[];
  readonly legacyAdvisories: readonly MarketingLegacyReviewFinding[];
  readonly registryEligibility: readonly MarketingRegistryEligibility[];
  readonly enqueue: {
    readonly authority: 'existing-hermes-worker';
    readonly eventType: typeof DESIGN_LAB_REVIEW_WORK_EVENT_TYPE;
    readonly admitted: false;
  };
  readonly advisory: true;
  readonly certified: false;
  readonly autonomousDeployment: false;
}

export interface PlanMarketingReviewWorkInput {
  readonly reviewId: string;
  readonly route: string;
  readonly pageId: string;
  readonly context: MarketingFrozenDecisionContext;
  readonly sourceRevision: string;
  readonly artifactSha256: string;
  readonly decisionStatus: MarketingReviewDecisionStatus;
  readonly candidateDigest: string;
  readonly changes: readonly MarketingMaterialChange[];
  readonly dependencies?: readonly MarketingDecisionDependency[];
  readonly invalidatedDependencyIds?: readonly string[];
  readonly evidence?: readonly MarketingReviewEvidenceRecord[];
  readonly legacyFindings?: readonly MarketingLegacyReviewFinding[];
  readonly registryTargets?: readonly MarketingReviewRegistryTarget[];
  /** Existing task records are read by the owner; this planner never writes them. */
  readonly existingTasks?: readonly MarketingReviewExistingTask[];
  /** Existing owner is reused in preference to a newly supplied owner. */
  readonly owner: string | null;
  readonly reviewArtifactRef?: string;
}

export type MarketingReviewDecisionStatus =
  | 'accepted'
  | 'incumbent-retained'
  | 'unresolved';

export interface PlanMarketingReviewWorkFromImprovementInput<TValue> {
  readonly reviewId: string;
  readonly route: string;
  readonly artifactSha256: string;
  readonly improvement: Pick<
    MarketingImprovementLoopResult<TValue>,
    | 'context'
    | 'status'
    | 'selectedCandidateDigest'
    | 'invalidatedDependencyIds'
  >;
  readonly changes: readonly MarketingMaterialChange[];
  readonly dependencies?: readonly MarketingDecisionDependency[];
  readonly evidence?: readonly MarketingReviewEvidenceRecord[];
  readonly legacyFindings?: readonly MarketingLegacyReviewFinding[];
  readonly registryTargets?: readonly MarketingReviewRegistryTarget[];
  readonly existingTasks?: readonly MarketingReviewExistingTask[];
  readonly owner: string | null;
  readonly reviewArtifactRef?: string;
}

export interface AdmitMarketingReviewWorkInput {
  readonly plan: MarketingReviewWorkPlan;
  readonly owner: string;
  readonly currentContextDigest: string;
  readonly currentSourceRevision: string;
  readonly currentArtifactSha256: string;
  /** One remaining attempt is required for every affected stage. */
  readonly remainingStageBudgets: Readonly<
    Partial<Record<MarketingReviewWorkStage, number>>
  >;
  /** One global worker admission consumes one total attempt. */
  readonly remainingTotalBudget: number;
  readonly allowAutonomousDeployment?: boolean;
}

export type AdmitMarketingReviewWorkResult =
  | {
      readonly admitted: true;
      readonly dispatched: true;
      readonly idempotencyKey: string;
      readonly taskId: string;
      readonly dispatch: HermesDispatchResult;
    }
  | {
      readonly admitted: false;
      readonly dispatched: false;
      readonly reason: MarketingReviewDispatchRejection;
      readonly idempotencyKey: string | null;
    };

export interface MarketingReviewReservationRequest {
  readonly idempotencyKey: string;
  readonly taskId: string;
  readonly taskDigest: string;
  readonly workDigest: string;
  readonly owner: string;
}

export type MarketingReviewReservationResult =
  | { readonly status: 'reserved' }
  | { readonly status: 'duplicate'; readonly existingTaskId?: string }
  | { readonly status: 'unavailable' };

/**
 * The owner is the persistence boundary for admission. A reservation must be
 * atomic and durable in that owner before a Hermes event is sent. The worker
 * dependency is injectable so preparation and tests never dispatch by default.
 */
export interface MarketingReviewDispatchDependencies {
  readonly reserveDispatch?: (
    request: MarketingReviewReservationRequest
  ) => Promise<MarketingReviewReservationResult>;
  readonly dispatchHermesWorker?: (
    request: HermesDispatchRequest
  ) => Promise<HermesDispatchResult>;
}

export const STAGE_ORDER: readonly MarketingReviewWorkStage[] = [
  'truth',
  'narrative',
  'copy',
  'section-design',
  'asset-generation',
  'adversarial-review',
  'taste-admission',
  'integrated-page',
  'journey',
];

export const CHANGE_STAGE_MAP: Readonly<
  Record<MarketingMaterialChangeKind, readonly MarketingGenerationStage[]>
> = {
  copy: ['copy', 'adversarial-review'],
  claim: ['truth', 'narrative', 'copy', 'adversarial-review'],
  feature: [
    'truth',
    'narrative',
    'copy',
    'section-design',
    'adversarial-review',
  ],
  token: ['section-design', 'asset-generation', 'adversarial-review'],
  proof: ['truth', 'copy', 'section-design', 'adversarial-review'],
};

export function requireText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

export function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right)
  );
}

export function normalizedPath(value: string): string {
  return value.trim().replace(/^\$\./, '');
}

export function stageOrder(
  stages: readonly MarketingReviewWorkStage[]
): MarketingReviewWorkStage[] {
  const selected = new Set(stages);
  return STAGE_ORDER.filter(stage => selected.has(stage));
}

export function pathsIntersect(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return left.some(leftPath =>
    right.some(
      rightPath =>
        leftPath === '*' ||
        rightPath === '*' ||
        leftPath === rightPath ||
        leftPath.startsWith(`${rightPath}.`) ||
        rightPath.startsWith(`${leftPath}.`)
    )
  );
}

export function dependencyIntersection(
  left: readonly string[],
  right: readonly string[]
): boolean {
  const rightSet = new Set(right);
  return left.some(value => rightSet.has(value));
}

export function staleEvidenceIds(
  evidence: readonly MarketingReviewEvidenceRecord[],
  invalidatedDependencyIds: readonly string[]
): string[] {
  return evidence
    .filter(
      record =>
        record.status === 'stale' ||
        dependencyIntersection(record.dependencyIds, invalidatedDependencyIds)
    )
    .map(record => record.id)
    .sort((left, right) => left.localeCompare(right));
}

export function legacyAdvisories(
  findings: readonly MarketingLegacyReviewFinding[],
  affectedPaths: readonly string[],
  invalidatedDependencyIds: readonly string[]
): readonly MarketingLegacyReviewFinding[] {
  return findings
    .filter(
      finding =>
        !pathsIntersect(finding.paths.map(normalizedPath), affectedPaths) &&
        !dependencyIntersection(
          finding.dependencyIds ?? [],
          invalidatedDependencyIds
        )
    )
    .map(finding => ({
      ...finding,
      paths: uniqueSorted(finding.paths.map(normalizedPath)),
      dependencyIds: uniqueSorted(finding.dependencyIds ?? []),
    }));
}

export function workerPrompt(input: {
  readonly reviewId: string;
  readonly route: string;
  readonly pageId: string;
  readonly stages: readonly MarketingReviewWorkStage[];
  readonly changeKinds: readonly MarketingMaterialChangeKind[];
  readonly affectedPaths: readonly string[];
  readonly staleDependencyIds: readonly string[];
  readonly staleEvidenceIds: readonly string[];
  readonly reviewArtifactRef: string | null;
}): string {
  const prompt = [
    'Prepare the bounded marketing review work item using the existing page-review contract.',
    `Review ID: ${input.reviewId}`,
    `Route: ${input.route}`,
    `Page ID: ${input.pageId}`,
    `Affected stages: ${input.stages.join(', ')}`,
    `Material change kinds: ${input.changeKinds.join(', ')}`,
    `Affected paths: ${input.affectedPaths.join(', ')}`,
    `Stale dependencies: ${input.staleDependencyIds.join(', ') || 'none'}`,
    `Stale evidence: ${input.staleEvidenceIds.join(', ') || 'none'}`,
    input.reviewArtifactRef
      ? `Review artifact: ${input.reviewArtifactRef}`
      : 'Review artifact: caller did not provide one.',
    'Revalidate the assembled page and journey when requested. Return advisory evidence only; do not certify, publish, deploy, or alter the rubric.',
  ].join('\n');
  return prompt.length <= 4000 ? prompt : `${prompt.slice(0, 3999).trimEnd()}…`;
}

export function buildDispatchRequest(task: {
  readonly idempotencyKey: string;
  readonly reviewId: string;
  readonly route: string;
  readonly pageId: string;
  readonly stages: readonly MarketingReviewWorkStage[];
  readonly changeKinds: readonly MarketingMaterialChangeKind[];
  readonly affectedPaths: readonly string[];
  readonly staleDependencyIds: readonly string[];
  readonly staleEvidenceIds: readonly string[];
  readonly reviewArtifactRef: string | null;
  readonly owner: string | null;
}): HermesDispatchRequest {
  return {
    source: DESIGN_LAB_REVIEW_WORK_DISPATCH_SOURCE,
    sourceId: `marketing-review:${task.idempotencyKey}`,
    sourceUrl: null,
    kind: DESIGN_LAB_REVIEW_WORK_KIND,
    runtime: 'codex-cli',
    priority: 70,
    skills: ['autoplan'],
    allowedPaths: [
      'apps/web/data/marketing',
      'apps/web/lib/agent-os/design-lab',
      'apps/web/components',
      'apps/web/styles',
      'agentos',
    ],
    verification: ['pnpm --filter @jovie/web run typecheck -- --pretty false'],
    dryRun: false,
    prompt: workerPrompt({
      reviewId: task.reviewId,
      route: task.route,
      pageId: task.pageId,
      stages: task.stages,
      changeKinds: task.changeKinds,
      affectedPaths: task.affectedPaths,
      staleDependencyIds: task.staleDependencyIds,
      staleEvidenceIds: task.staleEvidenceIds,
      reviewArtifactRef: task.reviewArtifactRef,
    }),
    owner: task.owner,
  };
}

function withoutDigest<T extends { readonly taskDigest?: string }>(
  task: T
): Omit<T, 'taskDigest'> {
  const { taskDigest: _taskDigest, ...payload } = task;
  return payload;
}

export function marketingReviewTaskDigest(
  task: MarketingReviewWorkTask
): string {
  return marketingDecisionDigest(withoutDigest(task));
}

function withoutWorkDigest(
  plan: MarketingReviewWorkPlan
): Omit<MarketingReviewWorkPlan, 'workDigest'> {
  const { workDigest: _workDigest, ...payload } = plan;
  return payload;
}

export function marketingReviewWorkPlanDigest(
  plan: MarketingReviewWorkPlan
): string {
  return marketingDecisionDigest(withoutWorkDigest(plan));
}

export function expectedDispatchRequest(
  task: MarketingReviewWorkTask
): HermesDispatchRequest {
  return buildDispatchRequest(task);
}
