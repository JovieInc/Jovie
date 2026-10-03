import { describe, expect, it, vi } from 'vitest';
import {
  freezeMarketingDecisionContext,
  marketingDecisionContextDigest,
} from '@/data/marketing';
import {
  admitAndDispatchMarketingReviewWork,
  type MarketingReviewWorkPlan,
  planMarketingReviewWork,
} from '@/lib/agent-os/design-lab/decision-review-work';
import { validateMarketingReviewRegistryTarget } from '@/lib/agent-os/design-lab/review-work-registry';

vi.mock('server-only', () => ({}));

const contextInput = {
  decisionId: 'profile-copy-review',
  pageId: 'profile-page',
  audience: 'independent artists',
  offer: 'a public artist profile',
  conversionObjective: 'start a profile setup',
  claimRevision: 'claims-v1',
  recipeRevision: 'recipes-v1',
  rubricRevision: 'rubric-v1',
  sourceRevision: 'source-v1',
  allowedMutationScope: ['copy.hero.headline'],
  dependencyGraph: {
    'evidence.copy': ['copy.hero.headline'],
    'evidence.page': ['evidence.copy'],
  },
} as const;

const context = freezeMarketingDecisionContext({
  ...contextInput,
  contextDigest: marketingDecisionContextDigest(contextInput),
});

const candidateDigest = `sha256:${'c'.repeat(64)}`;
const artifactSha256 = 'a'.repeat(64);

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    reviewId: 'review-profile-copy',
    route: '/artist-profiles',
    pageId: context.pageId,
    context,
    sourceRevision: context.sourceRevision,
    artifactSha256,
    decisionStatus: 'accepted' as const,
    candidateDigest,
    owner: 'symphony',
    changes: [
      {
        id: 'copy-change-1',
        kind: 'copy' as const,
        paths: ['copy.hero.headline'],
        revision: 'copy-v2',
        dependencyIds: ['evidence.copy'],
      },
    ],
    dependencies: [
      {
        id: 'evidence.copy',
        paths: ['copy.hero.headline'],
      },
      {
        id: 'evidence.page',
        paths: ['page.rendered'],
        dependsOn: ['evidence.copy'],
      },
    ],
    invalidatedDependencyIds: [],
    evidence: [
      {
        id: 'semantic-copy',
        dependencyIds: ['evidence.copy'],
        digest: 'semantic-v1',
        status: 'fresh' as const,
      },
      {
        id: 'legacy-page',
        dependencyIds: ['legacy-page'],
        digest: 'legacy-v1',
        status: 'advisory' as const,
      },
    ],
    legacyFindings: [
      {
        id: 'legacy-untouched',
        summary: 'Old footer spacing is still advisory.',
        paths: ['footer.spacing'],
        dependencyIds: ['legacy-page'],
      },
      {
        id: 'legacy-affected',
        summary: 'Old hero claim needs the changed copy review.',
        paths: ['copy.hero.headline'],
        dependencyIds: ['evidence.copy'],
      },
    ],
    registryTargets: [
      {
        candidateId: 'candidate-a',
        registryId: 'section.hero',
        stage: 'section-design' as const,
        variantId: 'centered-none',
        providedInputs: ['headline', 'subhead', 'primaryCta'],
      },
    ],
    ...overrides,
  };
}

function admissionInput(plan: MarketingReviewWorkPlan) {
  return {
    plan,
    owner: 'symphony',
    currentContextDigest: context.contextDigest,
    currentSourceRevision: context.sourceRevision,
    currentArtifactSha256: artifactSha256,
    remainingStageBudget: plan.task?.stages.length ?? 0,
    remainingTotalBudget: 1,
  };
}

describe('bounded marketing review work integration', () => {
  it('derives only affected stages, invalidates transitive evidence, and adds integrated revalidation after acceptance', () => {
    const plan = planMarketingReviewWork(validInput());

    expect(plan.status).toBe('dispatchable');
    expect(plan.affectedStages).toEqual([
      'copy',
      'adversarial-review',
      'integrated-page',
      'journey',
    ]);
    expect(plan.invalidatedDependencyIds).toEqual([
      'evidence.copy',
      'evidence.page',
    ]);
    expect(plan.staleEvidenceIds).toEqual(['semantic-copy']);
    expect(plan.legacyAdvisories.map(finding => finding.id)).toEqual([
      'legacy-untouched',
    ]);
    expect(plan.task).toMatchObject({
      owner: 'symphony',
      advisory: true,
      certified: false,
      selfCertification: 'forbidden',
      autonomousDeployment: false,
      integratedRevalidationRequired: true,
      eventType: 'hermes_cli_worker',
    });
    expect(plan.task?.dispatchRequest.kind).toBe('investigation');
    expect(plan.task?.dispatchRequest.prompt.length).toBeLessThanOrEqual(4000);
  });

  it('keeps incumbent-retained work local to affected review stages', () => {
    const plan = planMarketingReviewWork(
      validInput({
        decisionStatus: 'incumbent-retained',
        changes: [
          {
            id: 'token-change-1',
            kind: 'token' as const,
            paths: ['tokens.accent'],
            revision: 'tokens-v2',
          },
        ],
        dependencies: [],
        evidence: [],
        legacyFindings: [],
        registryTargets: [],
      })
    );

    expect(plan.affectedStages).toEqual([
      'section-design',
      'asset-generation',
      'adversarial-review',
    ]);
    expect(plan.task?.integratedRevalidationRequired).toBe(false);
  });

  it('preserves untouched legacy findings as advisory-only when there is no material change', () => {
    const plan = planMarketingReviewWork(
      validInput({
        changes: [],
        dependencies: [],
        invalidatedDependencyIds: [],
      })
    );

    expect(plan.status).toBe('advisory-only');
    expect(plan.task).toBeNull();
    expect(plan.legacyAdvisories.map(finding => finding.id)).toEqual([
      'legacy-untouched',
      'legacy-affected',
    ]);
  });

  it('reuses the existing owner and suppresses an identical dispatch', () => {
    const first = planMarketingReviewWork(validInput());
    const repeated = planMarketingReviewWork(
      validInput({
        owner: 'a-different-owner',
        existingTasks: [
          {
            idempotencyKey: first.task!.idempotencyKey,
            taskId: first.task!.taskId,
            owner: 'symphony',
            status: 'queued' as const,
          },
        ],
      })
    );

    expect(repeated.status).toBe('duplicate');
    expect(repeated.task).toBeNull();
    expect(repeated.owner).toBe('symphony');
    expect(repeated.reusedTaskId).toBe(first.task?.taskId);
  });

  it('blocks unknown registry identity before model work while retaining explicit omit and none-fits choices', () => {
    const blocked = planMarketingReviewWork(
      validInput({
        registryTargets: [
          {
            registryId: 'section.does-not-exist',
            stage: 'section-design' as const,
            variantId: 'unknown',
          },
        ],
      })
    );
    expect(blocked.status).toBe('blocked');
    expect(blocked.task).toBeNull();
    expect(blocked.registryEligibility[0]).toMatchObject({
      status: 'ineligible',
      code: 'registry-entry-missing',
      blocking: true,
    });

    const omitted = validateMarketingReviewRegistryTarget({
      registryId: 'section.hero',
      stage: 'section-design',
      variantId: 'centered-video',
      allowOmit: true,
    });
    expect(omitted).toMatchObject({ status: 'omitted', blocking: false });

    const noneFits = validateMarketingReviewRegistryTarget({
      registryId: 'section.does-not-exist',
      stage: 'section-design',
      allowNone: true,
    });
    expect(noneFits).toMatchObject({ status: 'none-fits', blocking: false });
  });

  it('calls the existing worker only after explicit owner, freshness, and budget admission', async () => {
    const plan = planMarketingReviewWork(validInput());
    const dispatch = vi.fn().mockResolvedValue({
      dispatchId: 'dispatch-1',
      branchName: 'codex/hermes-marketing-review',
      eventType: 'hermes_cli_worker' as const,
      dryRun: false,
    });

    const admitted = await admitAndDispatchMarketingReviewWork(
      admissionInput(plan),
      { dispatchHermesWorker: dispatch }
    );
    expect(admitted).toMatchObject({
      admitted: true,
      dispatched: true,
      taskId: plan.task?.taskId,
    });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(plan.task?.dispatchRequest);

    const unauthorized = await admitAndDispatchMarketingReviewWork(
      { ...admissionInput(plan), owner: 'other-owner' },
      { dispatchHermesWorker: dispatch }
    );
    const stale = await admitAndDispatchMarketingReviewWork(
      { ...admissionInput(plan), currentArtifactSha256: 'b'.repeat(64) },
      { dispatchHermesWorker: dispatch }
    );
    const overBudget = await admitAndDispatchMarketingReviewWork(
      { ...admissionInput(plan), remainingStageBudget: 0 },
      { dispatchHermesWorker: dispatch }
    );
    expect(unauthorized).toMatchObject({
      admitted: false,
      reason: 'unauthorized-owner',
    });
    expect(stale).toMatchObject({ admitted: false, reason: 'stale-evidence' });
    expect(overBudget).toMatchObject({
      admitted: false,
      reason: 'budget-exhausted',
    });
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('does not enqueue duplicate, legacy-only, or blocked work', async () => {
    const dispatch = vi.fn();
    const first = planMarketingReviewWork(validInput());
    const duplicate = planMarketingReviewWork(
      validInput({
        existingTasks: [
          {
            idempotencyKey: first.task!.idempotencyKey,
            taskId: first.task!.taskId,
            owner: 'symphony',
            status: 'running' as const,
          },
        ],
      })
    );
    const legacyOnly = planMarketingReviewWork(
      validInput({
        changes: [],
        dependencies: [],
        invalidatedDependencyIds: [],
      })
    );
    const blocked = planMarketingReviewWork(
      validInput({
        registryTargets: [
          {
            registryId: 'section.missing',
            stage: 'section-design' as const,
          },
        ],
      })
    );

    await admitAndDispatchMarketingReviewWork(admissionInput(duplicate), {
      dispatchHermesWorker: dispatch,
    });
    await admitAndDispatchMarketingReviewWork(admissionInput(legacyOnly), {
      dispatchHermesWorker: dispatch,
    });
    await admitAndDispatchMarketingReviewWork(admissionInput(blocked), {
      dispatchHermesWorker: dispatch,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
