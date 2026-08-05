/**
 * Closed-loop marketing generation contracts.
 *
 * The pipeline separates product truth, narrative, copy, section design,
 * asset generation, and review so no stage approves or silently rewrites its
 * own work. Model selection is capability-based; model names never belong in
 * a page recipe or generation request.
 */

export const MARKETING_GENERATION_SPEC_VERSION = '1.0.0';

export const MARKETING_GENERATION_STAGES = [
  'truth',
  'narrative',
  'copy',
  'section-design',
  'asset-generation',
  'adversarial-review',
  'taste-admission',
] as const;

export type MarketingGenerationStage =
  (typeof MARKETING_GENERATION_STAGES)[number];

export const MARKETING_STAGE_ATTEMPT_LIMITS: Readonly<
  Record<MarketingGenerationStage, number>
> = {
  truth: 1,
  narrative: 3,
  copy: 3,
  'section-design': 3,
  'asset-generation': 3,
  'adversarial-review': 3,
  'taste-admission': 1,
};

export const MARKETING_CREATIVE_ROLES = [
  'truth-curator',
  'narrative-architect',
  'copy-compiler',
  'section-designer',
  'asset-generator',
  'adversarial-reviewer',
  'final-polisher',
] as const;

export type MarketingCreativeRole = (typeof MARKETING_CREATIVE_ROLES)[number];

export const MARKETING_MODEL_CAPABILITIES = [
  'structured-output',
  'long-context-planning',
  'narrative-sequencing',
  'editorial-compression',
  'truth-review',
  'visual-ui-reasoning',
  'reference-image-fidelity',
  'vision-review',
  'image-generation',
] as const;

export type MarketingModelCapability =
  (typeof MARKETING_MODEL_CAPABILITIES)[number];

export const MARKETING_ROLE_REQUIREMENTS: Readonly<
  Record<MarketingCreativeRole, readonly MarketingModelCapability[]>
> = {
  'truth-curator': ['structured-output', 'truth-review'],
  'narrative-architect': [
    'structured-output',
    'long-context-planning',
    'narrative-sequencing',
  ],
  'copy-compiler': ['structured-output', 'editorial-compression'],
  'section-designer': ['structured-output', 'visual-ui-reasoning'],
  'asset-generator': ['image-generation', 'reference-image-fidelity'],
  'adversarial-reviewer': [
    'truth-review',
    'visual-ui-reasoning',
    'vision-review',
  ],
  'final-polisher': ['editorial-compression', 'truth-review', 'vision-review'],
};

export interface MarketingModelCandidate {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly healthy: boolean;
  readonly capabilities: readonly MarketingModelCapability[];
  readonly roleScores?: Readonly<
    Partial<Record<MarketingCreativeRole, number>>
  >;
  readonly tasteAcceptanceRate?: number;
  /** Lower is cheaper. */
  readonly costRank: number;
  /** Lower is faster. */
  readonly latencyRank: number;
}

export function selectMarketingModelCandidate(input: {
  readonly role: MarketingCreativeRole;
  readonly candidates: readonly MarketingModelCandidate[];
  readonly excludedModelIds?: readonly string[];
}): MarketingModelCandidate | null {
  const required = MARKETING_ROLE_REQUIREMENTS[input.role];
  const excluded = new Set(input.excludedModelIds ?? []);

  return (
    input.candidates
      .filter(candidate => {
        const capabilities = new Set(candidate.capabilities);
        return (
          candidate.healthy &&
          !excluded.has(candidate.id) &&
          required.every(capability => capabilities.has(capability))
        );
      })
      .toSorted((a, b) => {
        const scoreDelta =
          (b.roleScores?.[input.role] ?? 0) - (a.roleScores?.[input.role] ?? 0);
        if (scoreDelta !== 0) return scoreDelta;

        const tasteDelta =
          (b.tasteAcceptanceRate ?? 0) - (a.tasteAcceptanceRate ?? 0);
        if (tasteDelta !== 0) return tasteDelta;

        if (a.costRank !== b.costRank) return a.costRank - b.costRank;
        if (a.latencyRank !== b.latencyRank) {
          return a.latencyRank - b.latencyRank;
        }
        return a.id.localeCompare(b.id);
      })[0] ?? null
  );
}

export interface MarketingNarrativeSectionPlan {
  readonly sectionInstanceId: string;
  readonly sectionId: string;
  readonly question: string;
  readonly sectionJob: string;
  readonly primaryResponsibility: string;
  readonly newInformation: string;
  readonly customerBelief: string;
  readonly evidenceRefs: readonly string[];
  readonly mustNotRepeat: readonly string[];
}

export interface MarketingNarrativePlan {
  readonly pageId: string;
  readonly sections: readonly MarketingNarrativeSectionPlan[];
}

export interface MarketingGenerationFinding {
  readonly code: string;
  readonly stage: MarketingGenerationStage;
  readonly sectionInstanceId?: string;
  readonly message: string;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase().replaceAll(/\s+/g, ' ');
}

function findDuplicateNarrativeValues(
  sections: readonly MarketingNarrativeSectionPlan[],
  select: (section: MarketingNarrativeSectionPlan) => string,
  code: string,
  label: string
): MarketingGenerationFinding[] {
  const seen = new Map<string, string>();
  const findings: MarketingGenerationFinding[] = [];

  for (const section of sections) {
    const value = normalized(select(section));
    const firstSectionId = seen.get(value);
    if (firstSectionId) {
      findings.push({
        code,
        stage: 'narrative',
        sectionInstanceId: section.sectionInstanceId,
        message: `${label} repeats ${firstSectionId}. Every section must advance a different story beat.`,
      });
    } else if (value) {
      seen.set(value, section.sectionInstanceId);
    }
  }

  return findings;
}

export function auditMarketingNarrativePlan(
  plan: MarketingNarrativePlan
): readonly MarketingGenerationFinding[] {
  const findings: MarketingGenerationFinding[] = [];
  const instanceIds = new Set<string>();

  for (const section of plan.sections) {
    if (instanceIds.has(section.sectionInstanceId)) {
      findings.push({
        code: 'duplicate-section-instance',
        stage: 'narrative',
        sectionInstanceId: section.sectionInstanceId,
        message: 'Section instance IDs must be unique and occurrence-aware.',
      });
    }
    instanceIds.add(section.sectionInstanceId);

    for (const [field, value] of [
      ['question', section.question],
      ['section job', section.sectionJob],
      ['primary responsibility', section.primaryResponsibility],
      ['new information', section.newInformation],
      ['customer belief', section.customerBelief],
    ] as const) {
      if (!value.trim()) {
        findings.push({
          code: 'incomplete-narrative-section',
          stage: 'narrative',
          sectionInstanceId: section.sectionInstanceId,
          message: `The ${field} is required.`,
        });
      }
    }

    if (section.evidenceRefs.length === 0) {
      findings.push({
        code: 'missing-narrative-evidence',
        stage: 'narrative',
        sectionInstanceId: section.sectionInstanceId,
        message:
          'Every section needs a distinct evidence object before copy or design.',
      });
    }
  }

  findings.push(
    ...findDuplicateNarrativeValues(
      plan.sections,
      section => section.question,
      'duplicate-section-question',
      'The section question'
    ),
    ...findDuplicateNarrativeValues(
      plan.sections,
      section => section.primaryResponsibility,
      'duplicate-primary-responsibility',
      'The primary responsibility'
    ),
    ...findDuplicateNarrativeValues(
      plan.sections,
      section => section.customerBelief,
      'duplicate-customer-belief',
      'The customer belief'
    )
  );

  return findings;
}

export const MARKETING_TASTE_GATE_IDS = [
  'truth',
  'narrative-non-overlap',
  'copy-meaning',
  'copy-panel',
  'design-system',
  'product-truth',
  'asset-consent',
  'responsive-accessibility',
  'visual-review',
  'digest-integrity',
] as const;

export type MarketingTasteGateId = (typeof MARKETING_TASTE_GATE_IDS)[number];

export interface MarketingGateReceipt {
  readonly gateId: MarketingTasteGateId;
  readonly verdict: 'pass' | 'fail';
  readonly executionId: string;
  readonly candidateDigest: string;
  readonly reviewerModelId?: string;
  readonly findings: readonly string[];
}

export function auditMarketingTasteAdmission(input: {
  readonly candidateDigest: string;
  readonly generatorModelId: string;
  readonly receipts: readonly MarketingGateReceipt[];
}): readonly MarketingGenerationFinding[] {
  const findings: MarketingGenerationFinding[] = [];

  for (const gateId of MARKETING_TASTE_GATE_IDS) {
    const receipts = input.receipts.filter(
      receipt => receipt.gateId === gateId
    );
    if (receipts.length !== 1) {
      findings.push({
        code:
          receipts.length === 0 ? 'missing-taste-gate' : 'duplicate-taste-gate',
        stage: 'taste-admission',
        message: `${gateId} requires exactly one receipt.`,
      });
      continue;
    }

    const [receipt] = receipts;
    if (!receipt) continue;
    if (receipt.verdict !== 'pass') {
      findings.push({
        code: 'failed-taste-gate',
        stage: 'taste-admission',
        message: `${gateId} failed: ${receipt.findings.join(' ')}`,
      });
    }
    if (!receipt.executionId.trim()) {
      findings.push({
        code: 'missing-gate-execution',
        stage: 'taste-admission',
        message: `${gateId} is missing an execution receipt.`,
      });
    }
    if (receipt.candidateDigest !== input.candidateDigest) {
      findings.push({
        code: 'stale-gate-receipt',
        stage: 'taste-admission',
        message: `${gateId} reviewed a different candidate digest.`,
      });
    }
  }

  const visualReview = input.receipts.find(
    receipt => receipt.gateId === 'visual-review'
  );
  if (
    visualReview?.reviewerModelId &&
    visualReview.reviewerModelId === input.generatorModelId
  ) {
    findings.push({
      code: 'self-reviewed-visual',
      stage: 'taste-admission',
      message: 'The asset generator cannot be its own visual reviewer.',
    });
  }

  return findings;
}
