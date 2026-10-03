import 'server-only';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  type MarketingDecisionCandidate,
  type MarketingDecisionContextInput,
  type MarketingDecisionFinding,
  type MarketingDecisionIncumbent,
  type MarketingGenerationStage,
  type MarketingPreferenceDecision,
  type MarketingProtectedCheck,
  marketingDecisionCandidateDigest,
  marketingDecisionDigest,
  marketingDecisionIncumbentDigest,
} from '@/data/marketing';
import {
  freezeMarketingDecisionCandidate,
  freezeMarketingDecisionContext,
  freezeMarketingDecisionIncumbent,
  resolveMarketingEligibility,
  validateMarketingDecisionCandidates,
} from '@/data/marketing/decision';
import {
  type MarketingSemanticReviewLike,
  runMarketingPageImprovementLoop,
} from '@/data/marketing/improvement';
import {
  type MarketingSemanticReviewInput,
  type MarketingSemanticReviewOptions,
  type MarketingSemanticReviewResult,
  reviewMarketingSemantics,
} from '@/data/marketing/semanticReview';
import { resolveDesignLabArtifactRunDirectory } from './paths';
import { getDesignProposal } from './proposals';
import type { DesignProposal } from './types';

const SOURCE_SHA = /^[a-f0-9]{40}$/;
const ARTIFACT_SHA256 = /^[a-f0-9]{64}$/;
const REVIEW_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

export const DESIGN_LAB_DECISION_REVIEW_SCHEMA =
  'design-lab-decision-review/v1' as const;
export const DESIGN_LAB_DECISION_REVIEW_EVALUATOR_VERSION =
  'design-lab-decision-review-evaluator/v1' as const;

/** The proposal fields that a Design Lab decision is allowed to mutate. */
export interface DesignLabDecisionValue {
  readonly proposalText: string;
}

export interface DesignLabDecisionIncumbentInput {
  readonly id: string;
  readonly value: DesignLabDecisionValue;
  readonly dependencyIds?: readonly string[];
}

export interface PrepareDesignLabDecisionReviewParams {
  readonly dayBucket: string;
  /** Existing pending proposal ids are the bounded candidate set. */
  readonly proposalIds: readonly string[];
  readonly reviewId: string;
  readonly route: string;
  /** Exact source and rendered-artifact digests; callers must supply both. */
  readonly sourceSha: string;
  readonly artifactSha256: string;
  readonly context: MarketingDecisionContextInput;
  readonly stage: MarketingGenerationStage;
  readonly incumbent: DesignLabDecisionIncumbentInput;
  readonly preference: MarketingPreferenceDecision;
  /** Optional source-backed checks supplied by the owning caller. */
  readonly protectedChecks?: Readonly<
    Record<string, readonly MarketingProtectedCheck[]>
  >;
  /** Three exact semantic review requests per candidate. */
  readonly semanticInputs: Readonly<
    Record<
      string,
      readonly {
        readonly input: MarketingSemanticReviewInput;
        /** Binds the review request to the frozen candidate payload. */
        readonly candidateDigest: string;
        /** A separate transport admission/readback seam for this request. */
        readonly options?: MarketingSemanticReviewOptions;
      }[]
    >
  >;
  readonly learningRefs?: readonly string[];
  readonly createdAt?: string;
  /** Test/CLI fixture seam; default execution reads the existing proposal files. */
  readonly proposalRecords?: readonly DesignProposal[];
  /** Test seam; defaults to the existing Design Lab proposal reader. */
  readonly loadProposal?: (
    dayBucket: string,
    proposalId: string
  ) => Promise<DesignProposal | null>;
  /** Test seam; defaults to the existing Design Lab artifact tree. */
  readonly artifactRootDirectory?: string;
}

export interface DesignLabDecisionCandidateRecord {
  readonly proposalId: string;
  readonly candidate: MarketingDecisionCandidate<DesignLabDecisionValue>;
  readonly proposal: DesignProposal;
}

export interface DesignLabSemanticReviewRecord {
  readonly candidateId: string;
  readonly candidateDigest: string;
  readonly check: MarketingSemanticReviewInput['check'];
  readonly result: MarketingSemanticReviewResult;
}

export interface DesignLabDecisionReviewReadyArtifact {
  readonly schema: typeof DESIGN_LAB_DECISION_REVIEW_SCHEMA;
  readonly reviewId: string;
  readonly createdAt: string;
  readonly dayBucket: string;
  readonly route: string;
  readonly sourceSha: string;
  readonly artifactSha256: string;
  readonly context: unknown;
  readonly incumbent: unknown;
  readonly candidates: readonly unknown[];
  readonly candidateFindings: readonly MarketingDecisionFinding[];
  readonly semanticReviews: readonly DesignLabSemanticReviewRecord[];
  readonly selection: unknown;
  readonly attempts: readonly unknown[];
  readonly outcomes: unknown;
  readonly decisionStatus: 'accepted' | 'incumbent-retained' | 'unresolved';
  readonly learningRefs: readonly string[];
  /** Canonical request evidence used for idempotent review-run reuse. */
  readonly inputManifestDigest: string;
  /** This packet is a review handoff, never a certification or rollout. */
  readonly advisory: true;
  readonly certified: false;
  readonly dispatchTriggered: false;
  readonly generationTriggered: false;
  readonly published: false;
  readonly artifactDigest: string;
}

const ReviewReadyArtifactSchema = z
  .object({
    schema: z.literal(DESIGN_LAB_DECISION_REVIEW_SCHEMA),
    reviewId: z.string().trim().regex(REVIEW_ID),
    createdAt: z.string().datetime(),
    dayBucket: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    route: z.string().trim().min(1),
    sourceSha: z.string().regex(SOURCE_SHA),
    artifactSha256: z.string().regex(ARTIFACT_SHA256),
    context: z.unknown(),
    incumbent: z.unknown(),
    candidates: z.array(z.unknown()),
    candidateFindings: z.array(z.unknown()),
    semanticReviews: z.array(z.unknown()),
    selection: z.unknown(),
    attempts: z.array(z.unknown()),
    outcomes: z.unknown(),
    decisionStatus: z.enum(['accepted', 'incumbent-retained', 'unresolved']),
    learningRefs: z.array(z.string().trim().min(1)),
    inputManifestDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    advisory: z.literal(true),
    certified: z.literal(false),
    dispatchTriggered: z.literal(false),
    generationTriggered: z.literal(false),
    published: z.literal(false),
    artifactDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function normalizeRequiredText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function jsonReady<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function artifactDigest(artifact: unknown): string {
  return marketingDecisionDigest(jsonReady(artifact));
}

function inputManifestDigest(params: {
  readonly dayBucket: string;
  readonly route: string;
  readonly sourceSha: string;
  readonly artifactSha256: string;
  readonly stage: MarketingGenerationStage;
  readonly context: unknown;
  readonly incumbent: unknown;
  readonly candidates: readonly unknown[];
  readonly preference: unknown;
  readonly protectedChecks: unknown;
  readonly learningRefs: readonly string[];
  readonly semanticInputs: Readonly<
    Record<
      string,
      readonly {
        readonly input: MarketingSemanticReviewInput;
        readonly candidateDigest: string;
      }[]
    >
  >;
}): string {
  return marketingDecisionDigest(
    jsonReady({
      evaluatorVersion: DESIGN_LAB_DECISION_REVIEW_EVALUATOR_VERSION,
      dayBucket: params.dayBucket,
      route: params.route,
      sourceSha: params.sourceSha,
      artifactSha256: params.artifactSha256,
      stage: params.stage,
      context: params.context,
      incumbent: params.incumbent,
      candidates: params.candidates,
      preference: params.preference,
      protectedChecks: params.protectedChecks,
      learningRefs: params.learningRefs,
      semanticInputs: Object.fromEntries(
        Object.entries(params.semanticInputs)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([candidateId, bindings]) => [
            candidateId,
            bindings.map(binding => ({
              candidateDigest: binding.candidateDigest,
              input: binding.input,
            })),
          ])
      ),
    })
  );
}

function artifactRunDirectory(
  reviewId: string,
  artifactRootDirectory?: string
): string {
  const normalizedId = normalizeRequiredText(reviewId, 'review id');
  if (!REVIEW_ID.test(normalizedId)) {
    throw new Error(`Invalid design review id: ${reviewId}`);
  }
  if (!artifactRootDirectory) {
    return resolveDesignLabArtifactRunDirectory(normalizedId);
  }
  return path.join(artifactRootDirectory, normalizedId);
}

function proposalValue(proposal: DesignProposal): DesignLabDecisionValue {
  return { proposalText: proposal.proposalText };
}

function changedProposalPaths(
  incumbent: DesignLabDecisionValue,
  candidate: DesignLabDecisionValue
): readonly string[] {
  return incumbent.proposalText === candidate.proposalText
    ? []
    : ['proposalText'];
}

function ensureSemanticInputBinding(
  binding: {
    readonly input: MarketingSemanticReviewInput;
    readonly candidateDigest: string;
  },
  candidate: MarketingDecisionCandidate<DesignLabDecisionValue>,
  params: PrepareDesignLabDecisionReviewParams
): void {
  const input = binding.input;
  if (binding.candidateDigest !== candidate.digest) {
    throw new Error(
      `Semantic review candidate digest does not match ${candidate.id}.`
    );
  }
  if (
    input.route !== params.route ||
    input.pageId !== params.context.pageId ||
    input.audience !== params.context.audience ||
    input.objective !== params.context.conversionObjective ||
    input.sourceSha !== params.sourceSha ||
    input.artifactSha256 !== params.artifactSha256
  ) {
    throw new Error(
      'Semantic review evidence must match the exact Design Lab route, context, source, and artifact.'
    );
  }
  if (
    (input.currentSourceSha !== undefined &&
      input.currentSourceSha !== params.sourceSha) ||
    (input.currentArtifactSha256 !== undefined &&
      input.currentArtifactSha256 !== params.artifactSha256)
  ) {
    throw new Error(
      'Semantic review current evidence does not match the exact Design Lab source or artifact.'
    );
  }

  const candidateText = candidate.value.proposalText;
  const contentBound =
    input.check === 'claim-support'
      ? input.claim.id === candidate.id &&
        input.claim.statement === candidateText &&
        (input.claim.renderedText === undefined ||
          input.claim.renderedText === candidateText)
      : input.check === 'section-overlap'
        ? input.sections.some(
            section =>
              section.id === candidate.id &&
              (section.renderedText === candidateText ||
                section.responsibility === candidateText)
          )
        : input.cta.id === candidate.id &&
          (input.cta.renderedLabel ?? input.cta.label) === candidateText;
  if (!contentBound) {
    throw new Error(
      `Semantic review content is not bound to candidate ${candidate.id}.`
    );
  }
}

function semanticReviewStatus(
  result: MarketingSemanticReviewResult
): MarketingSemanticReviewLike['status'] {
  if (result.status === 'evaluated') return result.verdict;
  if (
    result.reasonCode === 'reviewer-unavailable' ||
    result.reasonCode === 'invalid-response'
  ) {
    return 'unavailable';
  }
  return 'insufficient';
}

function mapSemanticReview(
  candidate: MarketingDecisionCandidate<DesignLabDecisionValue>,
  binding: {
    readonly input: MarketingSemanticReviewInput;
    readonly candidateDigest: string;
  },
  result: MarketingSemanticReviewResult
): {
  readonly record: DesignLabSemanticReviewRecord;
  readonly review: MarketingSemanticReviewLike;
} {
  const evidenceRefs = [
    result.evidenceFingerprint,
    result.requestFingerprint,
  ].filter((value): value is string => Boolean(value));
  const fingerprint = result.requestFingerprint ?? result.evidenceFingerprint;
  if (!fingerprint || evidenceRefs.length === 0) {
    throw new Error(
      `Semantic review ${candidate.id}/${binding.input.check} returned no exact evidence fingerprint.`
    );
  }
  const findings = result.findings.map(finding => finding.message);
  return {
    record: {
      candidateId: candidate.id,
      candidateDigest: binding.candidateDigest,
      check: binding.input.check,
      result,
    },
    review: {
      checkId: binding.input.check,
      status: semanticReviewStatus(result),
      findings: findings.length > 0 ? findings : [result.reason],
      evidenceRefs,
      fingerprint,
      advisory: true,
      certified: false,
    },
  };
}

async function writeReviewReadyArtifact(
  artifact: DesignLabDecisionReviewReadyArtifact,
  artifactRootDirectory?: string
): Promise<string> {
  const runDirectory = artifactRunDirectory(
    artifact.reviewId,
    artifactRootDirectory
  );
  const filePath = path.join(runDirectory, 'review-ready.json');
  await fs.mkdir(runDirectory, { recursive: true });
  try {
    const handle = await fs.open(filePath, 'wx');
    try {
      await handle.writeFile(`${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    } finally {
      await handle.close();
    }
    return filePath;
  } catch (error) {
    const isExistingFile =
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'EEXIST';
    if (!isExistingFile) throw error;
    const existing = await fs.readFile(filePath, 'utf8');
    const parsed = ReviewReadyArtifactSchema.parse(JSON.parse(existing));
    if (parsed.artifactDigest !== artifact.artifactDigest) {
      throw new Error(
        `Design review artifact ${artifact.reviewId} already exists with different evidence.`
      );
    }
    return filePath;
  }
}

export async function readDesignLabDecisionReviewArtifact(
  reviewId: string,
  options: { readonly artifactRootDirectory?: string } = {}
): Promise<DesignLabDecisionReviewReadyArtifact | null> {
  const filePath = path.join(
    artifactRunDirectory(reviewId, options.artifactRootDirectory),
    'review-ready.json'
  );
  try {
    const parsed = ReviewReadyArtifactSchema.parse(
      JSON.parse(await fs.readFile(filePath, 'utf8'))
    );
    const { artifactDigest: storedDigest, ...payload } = parsed;
    if (artifactDigest(payload) !== storedDigest) {
      throw new Error(
        `Design review artifact ${reviewId} failed its evidence digest check.`
      );
    }
    return parsed as unknown as DesignLabDecisionReviewReadyArtifact;
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
}

export async function prepareDesignLabDecisionReview(
  params: PrepareDesignLabDecisionReviewParams
): Promise<{
  readonly artifact: DesignLabDecisionReviewReadyArtifact;
  readonly artifactPath: string;
  readonly proposals: readonly DesignProposal[];
}> {
  if (!SOURCE_SHA.test(params.sourceSha)) {
    throw new Error('sourceSha must be an exact 40-character source digest.');
  }
  if (!ARTIFACT_SHA256.test(params.artifactSha256)) {
    throw new Error(
      'artifactSha256 must be an exact 64-character rendered-artifact digest.'
    );
  }
  const proposalIds = [...new Set(params.proposalIds.map(id => id.trim()))];
  if (proposalIds.length < 2 || proposalIds.length > 4) {
    throw new Error('A Design Lab decision requires 2-4 proposal candidates.');
  }
  const records = new Map(
    (params.proposalRecords ?? []).map(proposal => [proposal.id, proposal])
  );
  const loadProposal =
    params.loadProposal ??
    (params.proposalRecords
      ? async (_dayBucket: string, proposalId: string) =>
          records.get(proposalId) ?? null
      : getDesignProposal);
  const proposals = await Promise.all(
    proposalIds.map(async proposalId => {
      const proposal = await loadProposal(params.dayBucket, proposalId);
      if (!proposal)
        throw new Error(`Design proposal not found: ${proposalId}`);
      return proposal;
    })
  );
  if (proposals.some(proposal => proposal.status !== 'pending')) {
    throw new Error(
      'Only pending Design Lab proposals can enter a new decision.'
    );
  }
  const surfaceIds = new Set(proposals.map(proposal => proposal.surfaceId));
  if (surfaceIds.size !== 1 || !surfaceIds.has(params.context.pageId)) {
    throw new Error(
      'Decision proposals must target one surface matching the frozen page context.'
    );
  }

  const context = freezeMarketingDecisionContext(params.context);
  const incumbentValue = jsonReady(params.incumbent.value);
  const incumbentDependencies = [...(params.incumbent.dependencyIds ?? [])].map(
    value => normalizeRequiredText(value, 'incumbent dependency')
  );
  const incumbentInput = {
    id: normalizeRequiredText(params.incumbent.id, 'incumbent id'),
    sourceRevision: context.sourceRevision,
    value: incumbentValue,
    dependencyIds:
      incumbentDependencies.length > 0
        ? incumbentDependencies
        : ['design-lab:incumbent'],
  } satisfies Omit<
    MarketingDecisionIncumbent<DesignLabDecisionValue>,
    'digest'
  >;
  const incumbent = freezeMarketingDecisionIncumbent({
    ...incumbentInput,
    digest: marketingDecisionIncumbentDigest(incumbentInput),
  });

  const candidates = proposals.map(proposal => {
    const value = proposalValue(proposal);
    const dependencyIds = [`design-proposal:${proposal.id}`];
    const changedPaths = changedProposalPaths(incumbent.value, value);
    const candidateInput = {
      id: proposal.id,
      value,
      changedPaths,
      dependencyIds,
    } satisfies Omit<
      MarketingDecisionCandidate<DesignLabDecisionValue>,
      'digest'
    >;
    return {
      proposalId: proposal.id,
      proposal,
      candidate: freezeMarketingDecisionCandidate({
        ...candidateInput,
        digest: marketingDecisionCandidateDigest(candidateInput),
      }),
    } satisfies DesignLabDecisionCandidateRecord;
  });

  const candidateFindings = validateMarketingDecisionCandidates({
    context,
    incumbent,
    candidates: candidates.map(record => record.candidate),
  });
  const protectedChecks = params.protectedChecks ?? {};
  const semanticChecks = new Set([
    'claim-support',
    'section-overlap',
    'cta-expectation',
  ]);
  const unknownCheckCandidate = Object.keys(protectedChecks).find(
    candidateId =>
      !candidates.some(record => record.candidate.id === candidateId)
  );
  if (unknownCheckCandidate) {
    throw new Error(
      `Protected checks supplied for unknown candidate ${unknownCheckCandidate}.`
    );
  }
  const unknownSemanticInputCandidate = Object.keys(params.semanticInputs).find(
    candidateId =>
      !candidates.some(record => record.candidate.id === candidateId)
  );
  if (unknownSemanticInputCandidate) {
    throw new Error(
      `Semantic inputs supplied for unknown candidate ${unknownSemanticInputCandidate}.`
    );
  }
  for (const [candidateId, checks] of Object.entries(protectedChecks)) {
    if (checks.some(check => semanticChecks.has(check.dimension))) {
      throw new Error(
        `Protected checks for ${candidateId} must leave semantic dimensions to the exact semantic review inputs.`
      );
    }
  }
  const semanticBindings = new Map<
    string,
    readonly {
      readonly input: MarketingSemanticReviewInput;
      readonly candidateDigest: string;
      readonly options?: MarketingSemanticReviewOptions;
    }[]
  >();
  if (candidateFindings.length === 0) {
    for (const record of candidates) {
      const bindings = params.semanticInputs[record.candidate.id];
      if (!bindings || bindings.length !== semanticChecks.size) {
        throw new Error(
          `Candidate ${record.candidate.id} requires one exact semantic review for each protected semantic check.`
        );
      }
      const seenChecks = new Set<string>();
      for (const binding of bindings) {
        if (
          seenChecks.has(binding.input.check) ||
          !semanticChecks.has(binding.input.check)
        ) {
          throw new Error(
            `Candidate ${record.candidate.id} has duplicate or unsupported semantic checks.`
          );
        }
        seenChecks.add(binding.input.check);
        ensureSemanticInputBinding(binding, record.candidate, params);
      }
      if (seenChecks.size !== semanticChecks.size) {
        throw new Error(
          `Candidate ${record.candidate.id} is missing a protected semantic check.`
        );
      }
      semanticBindings.set(record.candidate.id, bindings);
    }
  }

  const manifestBindings = Object.fromEntries(
    candidates.map(record => [
      record.candidate.id,
      (params.semanticInputs[record.candidate.id] ?? []).map(binding => ({
        candidateDigest: binding.candidateDigest,
        input: binding.input,
      })),
    ])
  );
  const learningRefs = [...(params.learningRefs ?? [])].map(value =>
    normalizeRequiredText(value, 'learning reference')
  );
  const requestInputManifestDigest = inputManifestDigest({
    dayBucket: params.dayBucket,
    route: normalizeRequiredText(params.route, 'route'),
    sourceSha: params.sourceSha,
    artifactSha256: params.artifactSha256,
    stage: params.stage,
    context,
    incumbent,
    candidates,
    preference: params.preference,
    protectedChecks,
    learningRefs,
    semanticInputs: manifestBindings,
  });
  const existingArtifact = await readDesignLabDecisionReviewArtifact(
    params.reviewId,
    { artifactRootDirectory: params.artifactRootDirectory }
  );
  if (existingArtifact) {
    if (existingArtifact.inputManifestDigest !== requestInputManifestDigest) {
      throw new Error(
        `Design review artifact ${params.reviewId} already exists with different input evidence.`
      );
    }
    return {
      artifact: existingArtifact,
      artifactPath: path.join(
        artifactRunDirectory(params.reviewId, params.artifactRootDirectory),
        'review-ready.json'
      ),
      proposals,
    };
  }

  const semanticRecords: DesignLabSemanticReviewRecord[] = [];
  const improvement = await runMarketingPageImprovementLoop({
    context,
    stage: params.stage,
    incumbent,
    stageAttemptLimit: 1,
    totalAttemptLimit: 1,
    generateCandidates: () => candidates.map(record => record.candidate),
    evaluateEligibility: async ({ candidate }) => {
      const candidateFindingsForCandidate = candidateFindings.filter(
        finding =>
          finding.candidateId === undefined ||
          finding.candidateId === candidate.id
      );
      const integrityCheck: MarketingProtectedCheck = {
        dimension: 'candidate-integrity',
        verdict: candidateFindingsForCandidate.length > 0 ? 'fail' : 'pass',
        evidenceRefs: [candidate.id],
        finding:
          candidateFindingsForCandidate[0]?.message ??
          'Candidate digest and declared mutation paths are bound.',
      };
      const checks = [...(protectedChecks[candidate.id] ?? []), integrityCheck];
      return resolveMarketingEligibility({
        checks,
        candidateId: candidate.id,
        requiredDimensions: ['candidate-integrity'],
      });
    },
    reviewSemantic: async ({ candidate }) => {
      const bindings = semanticBindings.get(candidate.id) ?? [];
      const reviews: MarketingSemanticReviewLike[] = [];
      for (const binding of bindings) {
        const result = await reviewMarketingSemantics(
          binding.input,
          binding.options ?? {}
        );
        const mapped = mapSemanticReview(candidate, binding, result);
        semanticRecords.push(mapped.record);
        reviews.push(mapped.review);
      }
      return reviews;
    },
    choosePreference: () => params.preference,
  });
  const selection = improvement.attempts.at(-1)?.selection ?? null;
  const createdAt = params.createdAt ?? new Date().toISOString();
  const baseArtifact = {
    schema: DESIGN_LAB_DECISION_REVIEW_SCHEMA,
    reviewId: normalizeRequiredText(params.reviewId, 'review id'),
    createdAt,
    dayBucket: params.dayBucket,
    route: normalizeRequiredText(params.route, 'route'),
    sourceSha: params.sourceSha,
    artifactSha256: params.artifactSha256,
    context,
    incumbent: improvement.initialIncumbent,
    candidates,
    candidateFindings,
    semanticReviews: semanticRecords,
    selection,
    attempts: improvement.attempts,
    outcomes: improvement.outcomes,
    decisionStatus: improvement.status,
    learningRefs,
    inputManifestDigest: requestInputManifestDigest,
    advisory: true as const,
    certified: false as const,
    dispatchTriggered: false as const,
    generationTriggered: false as const,
    published: false as const,
  } satisfies Omit<DesignLabDecisionReviewReadyArtifact, 'artifactDigest'>;
  const artifact = {
    ...baseArtifact,
    artifactDigest: artifactDigest(baseArtifact),
  } satisfies DesignLabDecisionReviewReadyArtifact;
  const artifactPath = await writeReviewReadyArtifact(
    artifact,
    params.artifactRootDirectory
  );
  return { artifact, artifactPath, proposals };
}

export {
  ReviewReadyArtifactSchema as DesignLabDecisionReviewReadyArtifactSchema,
};
