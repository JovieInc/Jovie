import { createHash } from 'node:crypto';
import {
  type DecisionPredictionReceipt,
  DecisionPredictionReceiptSchema,
} from '@jovie/agent-transport-contracts';
import { z } from 'zod';
import { stableSerialize } from '@/lib/stable-serialize';
import type { SummerCardInput } from './summer-cards';

export const DECISION_RESEARCH_REQUEST_SCHEMA =
  'jovie.decision-research/request/v1' as const;
export const DECISION_RESEARCH_PACKET_SCHEMA =
  'jovie.decision-research/packet/v1' as const;
export const DECISION_RESEARCH_TRACE_SCHEMA =
  'jovie.decision-research/tool-trace/v1' as const;
export const DECISION_RESEARCH_POINTER_SCHEMA =
  'jovie.decision-research/latest/v1' as const;

const text = z.string().trim().min(1).max(600);
const nullableText = text.nullable();
const timestamp = z.iso.datetime({ offset: true });
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
const range = z
  .strictObject({
    lower: z.number().finite().nonnegative(),
    upper: z.number().finite().nonnegative(),
  })
  .refine(
    value => value.lower <= value.upper,
    'range lower must not exceed upper'
  );

const sourceReadSchema = z
  .strictObject({
    state: z.enum([
      'available',
      'immature',
      'stale',
      'unavailable',
      'unconfigured',
      'unknown',
      'zero',
    ]),
    succeeded: z.boolean(),
    value: z.number().finite().nullable(),
    eligiblePopulation: z.number().int().nonnegative().nullable(),
    denominator: z.number().int().nonnegative().nullable(),
    missingness: nullableText,
  })
  .superRefine((read, context) => {
    if (
      read.state === 'zero' &&
      (!read.succeeded || read.value !== 0 || read.denominator === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'zero requires a successful read, value 0, and a denominator',
      });
    }
    if (
      ['unavailable', 'unconfigured', 'unknown'].includes(read.state) &&
      read.succeeded
    ) {
      context.addIssue({
        code: 'custom',
        message: `${read.state} cannot claim a successful read`,
      });
    }
  });

const evidenceSourceSchema = z.strictObject({
  id: text,
  sourceType: z.enum([
    'execution-cost',
    'first-party-product',
    'payment',
    'public-web',
    'support',
  ]),
  authority: z.enum(['authoritative', 'first-party', 'secondary', 'unknown']),
  sourceRef: text,
  url: z
    .url({ protocol: /^https$/u })
    .max(2048)
    .nullable(),
  canonicalSourceId: text,
  copiedFromEvidenceId: nullableText,
  operation: z.literal('read-only'),
  queryVersion: text,
  observedAt: timestamp,
  retrievedAt: timestamp,
  freshnessTtlHours: z
    .number()
    .finite()
    .positive()
    .max(24 * 365),
  contentDigest: digest,
  summary: z.string().trim().min(1).max(1000),
  read: sourceReadSchema,
  dogfood: z.enum(['excluded', 'included', 'not-applicable']),
  dataClass: z.enum(['company-confidential', 'customer-sensitive', 'public']),
});

const claimSchema = z.strictObject({
  id: text,
  category: z.enum([
    'action-selection',
    'causal-hypothesis',
    'external-fact',
    'internal-observation',
  ]),
  inferenceLabel: z.enum(['inferred', 'observed', 'recommended']),
  statement: z.string().trim().min(1).max(1000),
  material: z.boolean(),
  supportingEvidenceIds: z.array(text).max(32),
  contradictingEvidenceIds: z.array(text).max(32),
});

const toolTraceSchema = z.strictObject({
  schema: z.literal(DECISION_RESEARCH_TRACE_SCHEMA),
  routeRole: z.enum(['candidate', 'incumbent']),
  routeId: text,
  provider: text,
  tool: text,
  access: z.enum([
    'authorized',
    'missing-access',
    'revoked',
    'unavailable',
    'unconfigured',
  ]),
  capabilityVerifiedAt: timestamp.nullable(),
  costVerifiedAt: timestamp.nullable(),
  privacyRetentionVerifiedAt: timestamp.nullable(),
  result: z.enum([
    'budget-exhausted',
    'complete',
    'not-evaluated',
    'partial',
    'timeout',
    'unavailable',
  ]),
  observedAt: timestamp,
  queryCount: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  latencyMs: z.number().finite().nonnegative(),
  costUsd: z.number().finite().nonnegative(),
  inputEvidenceIds: z.array(text).max(32),
  terminalReason: nullableText,
  resumeCondition: nullableText,
});

export const decisionResearchRequestSchema = z
  .strictObject({
    schema: z.literal(DECISION_RESEARCH_REQUEST_SCHEMA),
    trackingKey: text,
    requestedAt: timestamp,
    tenantId: text,
    proofTier: z.enum(['fixture', 'runtime', 'source']),
    effectiveStrategy: z.strictObject({ ref: text, statement: text }),
    decision: z.strictObject({
      id: text,
      issueRef: text,
      title: z.string().trim().min(1).max(120),
      status: z.literal('pending'),
      alternatives: z
        .array(z.strictObject({ id: text, label: text }))
        .min(2)
        .max(12),
      incumbentActionId: text,
      reversibility: z.enum(['easy', 'hard', 'moderate']),
      consequence: z.enum(['high', 'low', 'medium']),
      materialUnknown: text,
      findingThatChangesAction: text,
      sourceScope: z.array(text).min(1).max(16),
      authorityRef: text,
      owner: text,
      reconsiderationEvent: text,
      cheapReversibleAction: z
        .strictObject({
          actionId: text,
          actionMinutesUpper: z.number().finite().nonnegative(),
          researchMinutesLower: z.number().finite().nonnegative(),
          moreInformative: z.boolean(),
        })
        .nullable(),
    }),
    evidence: z.array(evidenceSourceSchema).min(1).max(64),
    claims: z.array(claimSchema).min(1).max(64),
    traces: z.array(toolTraceSchema).length(2),
    budget: z.strictObject({
      searchUsd: range,
      inferenceUsd: range,
      delayMinutes: range,
      founderAttentionMinutes: range,
      displacedEligibleWork: text,
      maxQueries: z.number().int().nonnegative(),
      maxSources: z.number().int().nonnegative(),
      maxRetries: z.number().int().nonnegative(),
      maxLatencyMs: z.number().finite().nonnegative(),
      maxTotalUsd: z.number().finite().nonnegative().nullable(),
    }),
    valueOfInformation: z.strictObject({
      expectedDecisionImprovement: z.enum([
        'low',
        'material',
        'necessary',
        'none',
      ]),
      canChangeAction: z.boolean(),
      canCertifyNecessaryUncertainty: z.boolean(),
      evidenceThatCouldReverse: text,
      evidenceThatCouldStrengthen: text,
      boundsRationale: text,
      existingEvidenceSufficient: z.boolean(),
    }),
    privacy: z.strictObject({
      externalExport: z.enum(['authorized-private', 'none', 'public-only']),
      authorizationRef: nullableText,
    }),
    proposal: z.strictObject({
      recommendation: z.enum([
        'hold',
        'modify',
        'proceed',
        'reject',
        'unresolved',
      ]),
      selectedActionId: text,
      bestAlternativeActionId: text,
      strongestContradictionEvidenceId: nullableText,
      unknowns: z.array(text).max(16),
      stopRules: z.array(text).min(1).max(16),
      continueRules: z.array(text).max(16),
      nextOwner: text,
      forecast: z.strictObject({
        target: text,
        units: text,
        expected: text,
        horizonEndsAt: timestamp,
        confidence: z.enum(['high', 'low', 'medium', 'unknown']),
      }),
    }),
  })
  .superRefine((request, context) => {
    const actionIds = new Set(request.decision.alternatives.map(row => row.id));
    for (const [path, actionId] of [
      ['decision.incumbentActionId', request.decision.incumbentActionId],
      ['proposal.selectedActionId', request.proposal.selectedActionId],
      [
        'proposal.bestAlternativeActionId',
        request.proposal.bestAlternativeActionId,
      ],
    ]) {
      if (!actionIds.has(actionId)) {
        context.addIssue({
          code: 'custom',
          message: `${path} is not an alternative`,
        });
      }
    }
    if (
      request.decision.cheapReversibleAction &&
      !actionIds.has(request.decision.cheapReversibleAction.actionId)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'cheap action is not an alternative',
      });
    }
    if (
      new Set(request.traces.map(trace => trace.routeRole)).size !==
      request.traces.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'trace route roles must be unique',
      });
    }
    for (const trace of request.traces) {
      if (trace.access !== 'authorized' && !trace.resumeCondition) {
        context.addIssue({
          code: 'custom',
          message: 'unavailable route requires a resume condition',
        });
      }
    }
    if (containsSecret(request)) {
      context.addIssue({
        code: 'custom',
        message: 'request contains secret material',
      });
    }
  });

export type DecisionResearchRequest = z.infer<
  typeof decisionResearchRequestSchema
>;
export type DecisionResearchTrace = z.infer<typeof toolTraceSchema>;

export const decisionResearchPointerSchema = z.strictObject({
  schema: z.literal(DECISION_RESEARCH_POINTER_SCHEMA),
  researchId: text,
  fingerprint: digest,
  version: z.number().int().positive(),
  packetKey: text,
});
export type DecisionResearchPointer = z.infer<
  typeof decisionResearchPointerSchema
>;

type EffectiveEvidence = DecisionResearchRequest['evidence'][number] & {
  readonly effectiveState: DecisionResearchRequest['evidence'][number]['read']['state'];
};

export interface DecisionResearchPacket {
  readonly schema: typeof DECISION_RESEARCH_PACKET_SCHEMA;
  readonly researchId: string;
  readonly packetId: string;
  readonly fingerprint: string;
  readonly version: number;
  readonly proofTier: DecisionResearchRequest['proofTier'];
  readonly decisionId: string;
  readonly recommendation: DecisionResearchRequest['proposal']['recommendation'];
  readonly selectedActionId: string;
  readonly bestAlternativeActionId: string;
  readonly researchMode:
    | 'existing-evidence-only'
    | 'external-bounded'
    | 'stopped';
  readonly stopReason: string;
  readonly blockers: readonly string[];
  readonly unknowns: readonly string[];
  readonly strongestContradictionEvidenceId: string | null;
  readonly evidence: readonly EffectiveEvidence[];
  readonly duplicateEvidence: readonly {
    readonly evidenceId: string;
    readonly originalEvidenceId: string;
  }[];
  readonly uniqueOriginalEvidenceCount: number;
  readonly traces: readonly DecisionResearchTrace[];
  readonly candidateEvaluation: 'matched-trace-ready' | 'not-evaluated';
  readonly stopRules: readonly string[];
  readonly continueRules: readonly string[];
  readonly authorityRef: string;
  readonly nextOwner: string;
  readonly reconsiderationEvent: string;
  readonly canonicalPrediction: DecisionPredictionReceipt;
  readonly ovieCard: SummerCardInput;
  readonly commissioning: {
    readonly status: 'commissioned' | 'pending';
    readonly reason: string;
    readonly rollback: string;
  };
}

const PROMPT_INJECTION =
  /(?:ignore|override|replace) (?:all |the )?(?:previous|system|developer) instructions|reveal (?:a |the )?(?:secret|token)|execute (?:this|the following)/iu;
const SECRET =
  /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|ghp|lin_api)_[A-Za-z0-9_-]{12,}|["']?(?:secret|token|password|apiKey)["']?\s*[=:]\s*["']?\S+)/iu;

function containsSecret(value: unknown): boolean {
  return SECRET.test(JSON.stringify(value));
}

function sha256(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableSerialize(value)).digest('hex')}`;
}

export function decisionResearchId(
  request: Pick<DecisionResearchRequest, 'decision' | 'trackingKey'>
): string {
  return `dr_${sha256([request.trackingKey, request.decision.id]).slice(7, 39)}`;
}

export function decisionResearchLatestKey(researchId: string): string {
  return `decision-research-latest:${researchId}`;
}

export function decisionResearchPacketKey(packetId: string): string {
  return `decision-research-packet:${packetId}`;
}

function effectiveEvidence(
  request: DecisionResearchRequest
): readonly EffectiveEvidence[] {
  const at = Date.parse(request.requestedAt);
  return request.evidence.map(row => {
    const expiresAt =
      Date.parse(row.observedAt) + row.freshnessTtlHours * 60 * 60 * 1000;
    const effectiveState =
      ['available', 'immature', 'zero'].includes(row.read.state) &&
      at > expiresAt
        ? 'stale'
        : row.read.state;
    return { ...row, effectiveState };
  });
}

function deduplicateEvidence(evidence: readonly EffectiveEvidence[]) {
  const originals = new Map<string, string>();
  const duplicates: { evidenceId: string; originalEvidenceId: string }[] = [];
  for (const row of evidence) {
    const first = originals.get(row.canonicalSourceId);
    if (first)
      duplicates.push({ evidenceId: row.id, originalEvidenceId: first });
    else originals.set(row.canonicalSourceId, row.id);
  }
  return { duplicates, uniqueCount: originals.size };
}

function isTraceVerified(trace: DecisionResearchTrace): boolean {
  return Boolean(
    trace.access === 'authorized' &&
      trace.capabilityVerifiedAt &&
      trace.costVerifiedAt &&
      trace.privacyRetentionVerifiedAt
  );
}

function canonicalFreshness(evidence: readonly EffectiveEvidence[]) {
  if (evidence.some(row => row.effectiveState === 'stale')) return 'stale';
  if (
    evidence.some(row =>
      ['unavailable', 'unconfigured', 'unknown'].includes(row.effectiveState)
    )
  ) {
    return 'unknown';
  }
  return 'fresh';
}

function buildCanonicalPrediction(input: {
  readonly request: DecisionResearchRequest;
  readonly packetId: string;
  readonly fingerprint: string;
  readonly evidence: readonly EffectiveEvidence[];
}): DecisionPredictionReceipt {
  const { request } = input;
  return DecisionPredictionReceiptSchema.parse({
    schema: 'jovie.prediction-outcome/prediction/v1',
    predictionId: `pred-${input.packetId}`,
    identity: {
      decisionId: request.decision.id,
      taskRunId: null,
      experimentId: null,
      variantId: request.proposal.selectedActionId,
      tenantId: request.tenantId,
      scopeId: 'summer-decision-research',
      entityId: request.decision.id,
    },
    links: {
      issueRef: request.decision.issueRef,
      commitRef: null,
      deploymentRef: null,
      certificationRef: null,
    },
    decisionAt: request.requestedAt,
    predictedAt: request.requestedAt,
    temporalClass: 'prospective',
    input: {
      snapshotRef: `decision-research/${input.packetId}`,
      snapshotDigest: input.fingerprint.slice('sha256:'.length),
      capturedAt: request.requestedAt,
      freshness: canonicalFreshness(input.evidence),
      provenanceRefs: input.evidence.map(row => row.sourceRef),
    },
    target: {
      stage: 'customer',
      name: request.proposal.forecast.target,
      units: request.proposal.forecast.units,
      horizonEndsAt: request.proposal.forecast.horizonEndsAt,
      baseline: null,
    },
    action: {
      eligibleActionsRef: `${request.decision.issueRef}#alternatives`,
      selectedAction: request.proposal.selectedActionId,
      selectionMethod: 'deterministic',
      selectionProbability: null,
    },
    prediction: {
      expected: request.proposal.forecast.expected,
      lower: null,
      upper: null,
      confidence: request.proposal.forecast.confidence,
    },
    versions: {
      model: null,
      provider: null,
      prompt: null,
      policy: DECISION_RESEARCH_PACKET_SCHEMA,
      codeRevision: null,
      executionTupleRef: input.packetId,
    },
    disclosure: {
      providerData: 'withheld',
      consent: 'not-required',
      consentRef: null,
      consentValidUntil: null,
    },
    management: { productBetContractRef: 'linear:JOV-6473' },
  });
}

function buildOvieCard(input: {
  readonly request: DecisionResearchRequest;
  readonly researchId: string;
  readonly version: number;
  readonly recommendation: DecisionResearchPacket['recommendation'];
  readonly mode: DecisionResearchPacket['researchMode'];
  readonly stopReason: string;
  readonly blockers: readonly string[];
  readonly evidence: readonly EffectiveEvidence[];
}): SummerCardInput {
  const { request } = input;
  const urls = [
    ...new Set(
      input.evidence.flatMap(row => (row.url === null ? [] : [row.url]))
    ),
  ].slice(0, 16);
  const contradiction =
    request.proposal.strongestContradictionEvidenceId ?? 'none recorded';
  const body = [
    `Decision: ${request.decision.id}`,
    `Research: ${input.mode}; stop: ${input.stopReason}`,
    `Material unknown: ${request.decision.materialUnknown}`,
    `Finding that changes action: ${request.decision.findingThatChangesAction}`,
    `Strongest contradiction: ${contradiction}`,
    `Unknowns: ${request.proposal.unknowns.join('; ') || 'none'}`,
    `Blockers: ${input.blockers.join('; ') || 'none'}`,
    `Next owner/event: ${request.proposal.nextOwner} — ${request.decision.reconsiderationEvent}`,
  ].join('\n');
  return {
    idempotencyKey: `${input.researchId}-v${input.version}`,
    kind: 'decision',
    product: 'company',
    title: request.decision.title,
    body,
    recommendation: `${input.recommendation}: ${request.proposal.selectedActionId}; best alternative ${request.proposal.bestAlternativeActionId}`,
    defaultIfSilent: 'Hold; do not broaden research or customer exposure.',
    recipient: request.proposal.nextOwner,
    amountUsd: null,
    preflightReceiptId: null,
    evidence: urls,
  };
}

export function compileDecisionResearch(
  input: DecisionResearchRequest,
  previous: DecisionResearchPointer | null = null
): DecisionResearchPacket {
  const request = decisionResearchRequestSchema.parse(input);
  const evidence = effectiveEvidence(request);
  const byId = new Map(evidence.map(row => [row.id, row]));
  const blockers = new Set<string>();
  let hasContradiction = false;

  for (const claim of request.claims.filter(row => row.material)) {
    const labelMatches =
      (['external-fact', 'internal-observation'].includes(claim.category) &&
        claim.inferenceLabel === 'observed') ||
      (claim.category === 'causal-hypothesis' &&
        claim.inferenceLabel === 'inferred') ||
      (claim.category === 'action-selection' &&
        claim.inferenceLabel === 'recommended');
    if (!labelMatches) blockers.add('claim-inference-label-mismatch');
    if (claim.supportingEvidenceIds.length === 0)
      blockers.add('unsupported-material-claim');
    for (const evidenceId of [
      ...claim.supportingEvidenceIds,
      ...claim.contradictingEvidenceIds,
    ]) {
      const source = byId.get(evidenceId);
      if (!source) {
        blockers.add('unsupported-citation');
        continue;
      }
      if (PROMPT_INJECTION.test(source.summary))
        blockers.add('prompt-injection-rejected');
      if (source.effectiveState === 'stale') blockers.add('stale-evidence');
      if (source.effectiveState === 'immature')
        blockers.add('immature-evidence');
      if (
        ['unavailable', 'unconfigured', 'unknown'].includes(
          source.effectiveState
        )
      ) {
        blockers.add(`evidence-${source.effectiveState}`);
      }
      if (
        claim.category === 'internal-observation' &&
        source.dogfood === 'included'
      ) {
        blockers.add('synthetic-dogfood-contamination');
      }
    }
    if (claim.contradictingEvidenceIds.length > 0) hasContradiction = true;
  }
  if (hasContradiction && !request.proposal.strongestContradictionEvidenceId) {
    blockers.add('strongest-contradiction-missing');
  }
  if (
    request.proposal.strongestContradictionEvidenceId &&
    !byId.has(request.proposal.strongestContradictionEvidenceId)
  ) {
    blockers.add('unsupported-contradiction-citation');
  }

  const cheap = request.decision.cheapReversibleAction;
  const cheapActionWins = Boolean(
    cheap?.moreInformative &&
      cheap.actionMinutesUpper <= cheap.researchMinutesLower &&
      request.decision.reversibility === 'easy'
  );
  const cannotChange =
    !request.valueOfInformation.canChangeAction &&
    !request.valueOfInformation.canCertifyNecessaryUncertainty;
  const existingOnly =
    request.valueOfInformation.existingEvidenceSufficient ||
    cheapActionWins ||
    cannotChange;

  let stopReason = request.valueOfInformation.existingEvidenceSufficient
    ? 'sufficient-decision-evidence'
    : cheapActionWins
      ? 'cheap-reversible-action-is-more-informative'
      : cannotChange
        ? 'research-cannot-change-or-certify-the-decision'
        : 'bounded-external-research-complete';
  let mode: DecisionResearchPacket['researchMode'] = existingOnly
    ? 'existing-evidence-only'
    : 'external-bounded';

  if (!existingOnly) {
    const incumbent = request.traces.find(row => row.routeRole === 'incumbent');
    if (!incumbent || incumbent.result !== 'complete') {
      blockers.add(
        incumbent?.result === 'budget-exhausted'
          ? 'research-budget-exhausted'
          : incumbent?.result === 'timeout'
            ? 'research-timeout'
            : incumbent?.result === 'partial'
              ? 'research-partial'
              : 'incumbent-route-unavailable'
      );
      stopReason = incumbent?.terminalReason ?? 'incumbent route unavailable';
      mode = 'stopped';
    }
  }

  for (const trace of request.traces) {
    if (trace.result === 'complete' && !isTraceVerified(trace))
      blockers.add('research-route-verification-missing');
    if (
      trace.queryCount > request.budget.maxQueries ||
      trace.sourceCount > request.budget.maxSources ||
      trace.retryCount > request.budget.maxRetries ||
      trace.latencyMs > request.budget.maxLatencyMs ||
      (request.budget.maxTotalUsd === null
        ? trace.costUsd > 0
        : trace.costUsd > request.budget.maxTotalUsd)
    ) {
      blockers.add('research-budget-exhausted');
      stopReason = 'research budget, time, retry, or source limit exhausted';
      mode = 'stopped';
    }
    if (trace.result === 'complete') {
      for (const evidenceId of trace.inputEvidenceIds) {
        const source = byId.get(evidenceId);
        if (!source) {
          blockers.add('unsupported-export-evidence');
          continue;
        }
        if (
          source.dataClass !== 'public' &&
          (request.privacy.externalExport !== 'authorized-private' ||
            !request.privacy.authorizationRef)
        ) {
          blockers.add('sensitive-external-export-blocked');
        }
      }
    }
  }

  const candidate = request.traces.find(row => row.routeRole === 'candidate');
  const candidateEvaluation =
    candidate?.result === 'complete'
      ? 'matched-trace-ready'
      : ('not-evaluated' as const);
  const criticalBlockers = [...blockers];
  const recommendation =
    criticalBlockers.length > 0
      ? 'unresolved'
      : request.proposal.recommendation;
  if (criticalBlockers.length > 0) mode = 'stopped';

  const researchId = decisionResearchId(request);
  const fingerprintInput = {
    ...request,
    requestedAt: undefined,
    evidence: evidence.map(row => ({
      ...row,
      effectiveState: row.effectiveState,
    })),
  };
  const fingerprint = sha256(fingerprintInput);
  const replayed = Boolean(
    previous?.researchId === researchId && previous.fingerprint === fingerprint
  );
  const version = replayed
    ? previous!.version
    : previous?.researchId === researchId
      ? previous.version + 1
      : 1;
  const packetId = `${researchId}-v${version}`;
  const canonicalPrediction = buildCanonicalPrediction({
    request,
    packetId,
    fingerprint,
    evidence,
  });
  const { duplicates, uniqueCount } = deduplicateEvidence(evidence);
  const ovieCard = buildOvieCard({
    request,
    researchId,
    version,
    recommendation,
    mode,
    stopReason,
    blockers: criticalBlockers,
    evidence,
  });
  const commissioned =
    request.proofTier === 'runtime' && criticalBlockers.length === 0;

  return {
    schema: DECISION_RESEARCH_PACKET_SCHEMA,
    researchId,
    packetId,
    fingerprint,
    version,
    proofTier: request.proofTier,
    decisionId: request.decision.id,
    recommendation,
    selectedActionId: request.proposal.selectedActionId,
    bestAlternativeActionId: request.proposal.bestAlternativeActionId,
    researchMode: mode,
    stopReason,
    blockers: criticalBlockers.sort(),
    unknowns: request.proposal.unknowns,
    strongestContradictionEvidenceId:
      request.proposal.strongestContradictionEvidenceId,
    evidence,
    duplicateEvidence: duplicates,
    uniqueOriginalEvidenceCount: uniqueCount,
    traces: request.traces,
    candidateEvaluation,
    stopRules: request.proposal.stopRules,
    continueRules: request.proposal.continueRules,
    authorityRef: request.decision.authorityRef,
    nextOwner: request.proposal.nextOwner,
    reconsiderationEvent: request.decision.reconsiderationEvent,
    canonicalPrediction,
    ovieCard,
    commissioning: {
      status: commissioned ? 'commissioned' : 'pending',
      reason: commissioned
        ? 'Authenticated runtime packet is source-bound and passed all deterministic gates.'
        : request.proofTier === 'runtime'
          ? `Runtime packet is blocked: ${criticalBlockers.join(', ')}`
          : `${request.proofTier} proof cannot commission live decision research.`,
      rollback:
        'Retain the incumbent route and packet history; disable only this research adapter.',
    },
  };
}

export function pointerForDecisionResearch(
  packet: DecisionResearchPacket
): DecisionResearchPointer {
  return {
    schema: DECISION_RESEARCH_POINTER_SCHEMA,
    researchId: packet.researchId,
    fingerprint: packet.fingerprint,
    version: packet.version,
    packetKey: decisionResearchPacketKey(packet.packetId),
  };
}
