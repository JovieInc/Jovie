import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type SummerCardInput, summerCardInputSchema } from './summer-cards';

export const HUMAN_SERVICE_PILOT_SCHEMA =
  'jovie.human-service-pilot/v1' as const;
export const HUMAN_SERVICE_OUTCOME_SCHEMA =
  'jovie.human-service-outcome/v1' as const;
export const HUMAN_SERVICE_CASE_BINDING_SCHEMA =
  'jovie.human-service-case-binding/v1' as const;

export const HUMAN_SERVICE_PILOT_POLICY = {
  inviteOnly: true,
  reviewAfterAcceptedRequests: 10,
  maximumActiveRequests: 3,
  maximumTimActiveRequests: 1,
  newVendorSpendAuthorized: false,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => text(max).nullable().default(null);
const httpsUrl = z.url({ protocol: /^https$/u }).max(2048);
const nonnegativeMoney = z.number().finite().nonnegative().max(1_000_000);
const boundedMinutes = z.number().int().nonnegative().max(525_600);
const boundedList = (maxItems: number, maxText: number) =>
  z.array(text(maxText)).max(maxItems);

export const humanServiceCaseStatusSchema = z.enum([
  'requested',
  'queued',
  'accepted',
  'assigned',
  'in_progress',
  'blocked',
  'delivered',
  'revision_requested',
  'accepted_by_customer',
  'declined',
  'withdrawn',
  'cancelled',
  'failed',
  'unresolved',
]);

export type HumanServiceCaseStatus = z.infer<
  typeof humanServiceCaseStatusSchema
>;

export const humanServiceRequestSchema = z
  .object({
    kind: z.literal('human-service-request'),
    requestedAt: z.string().datetime({ offset: true }),
    source: z
      .object({
        tenantId: text(200),
        threadId: text(200),
        requestId: text(200),
        revision: text(120),
      })
      .strict(),
    category: z.enum([
      'approved_source_research',
      'bounded_launch_follow_up',
      'creator_supplied_asset',
      'other_bounded',
    ]),
    goal: text(800),
    requestedDeliverable: text(800),
    sourceContext: text(1_500),
    knownFacts: boundedList(24, 500),
    missingInputs: boundedList(16, 500),
    acceptanceRubric: boundedList(16, 500).min(1),
    confidentiality: z.enum(['standard', 'confidential', 'restricted']),
    rights: z
      .object({
        status: z.enum(['confirmed', 'pending', 'denied']),
        sourceRef: httpsUrl.nullable(),
      })
      .strict(),
    brandPreferences: boundedList(16, 500),
    authority: z
      .object({
        permittedTools: boundedList(16, 120),
        permittedAccountRefs: boundedList(16, 200),
        permittedActions: z
          .array(
            z.enum([
              'research_approved_sources',
              'draft_deliverable',
              'edit_customer_supplied_asset',
              'request_clarification',
              'return_artifact_in_customer_thread',
            ])
          )
          .min(1)
          .max(16),
        permittedRecipientRefs: boundedList(16, 200),
        outwardExecutionAuthorized: z.literal(false),
      })
      .strict(),
    proposedOwner: z
      .object({
        id: text(120),
        label: text(120),
        kind: z.enum(['tim', 'specialist']),
        availabilityConfirmed: z.boolean(),
        confidentialityConfirmed: z.boolean(),
        permittedAccessConfirmed: z.boolean(),
        assignmentAccepted: z.boolean(),
      })
      .strict()
      .nullable(),
    deliveryExpectation: z
      .object({
        dueAt: z.string().datetime({ offset: true }),
        agreed: z.boolean(),
      })
      .strict(),
    budget: z
      .object({
        humanMinutes: boundedMinutes,
        qaMinutes: boundedMinutes,
        paidCostUsd: nonnegativeMoney,
        modelCostUsd: nonnegativeMoney,
      })
      .strict(),
    projectedUse: z
      .object({
        humanMinutes: boundedMinutes,
        qaMinutes: boundedMinutes,
        paidCostUsd: nonnegativeMoney,
        modelCostUsd: nonnegativeMoney,
      })
      .strict(),
    stopConditions: boundedList(16, 500).min(1),
    attachments: z
      .array(
        z
          .object({
            id: text(200),
            tenantId: text(200),
            storageRef: text(1_000),
            sensitivity: z.enum([
              'standard',
              'sensitive',
              'restricted',
              'unknown',
            ]),
            scanStatus: z.enum(['passed', 'pending', 'rejected']),
            rightsConfirmed: z.boolean(),
          })
          .strict()
      )
      .max(24),
    evidence: z.array(httpsUrl).max(16),
    privacy: z
      .object({
        taskScoped: z.literal(true),
        containsSecrets: z.literal(false),
        containsHiddenReasoning: z.literal(false),
        capturesUnrelatedWindows: z.literal(false),
      })
      .strict(),
    pilot: z
      .object({
        inviteConfirmed: z.boolean(),
        acceptedRequestCount: z.number().int().nonnegative(),
        activeRequestCount: z.number().int().nonnegative(),
        timActiveRequestCount: z.number().int().nonnegative(),
        newVendorSpendAuthorized: z.literal(false),
      })
      .strict(),
    scopeReview: z.enum(['supported', 'unsupported', 'unsafe', 'unlicensed']),
    duplicateCaseId: optionalText(200),
    withdrawnAt: z.string().datetime({ offset: true }).nullable(),
    cancelledAt: z.string().datetime({ offset: true }).nullable(),
    accessValidUntil: z.string().datetime({ offset: true }).nullable(),
    evaluatedAt: z.string().datetime({ offset: true }),
    operatorDecision: z.discriminatedUnion('decision', [
      z.object({ decision: z.literal('pending') }).strict(),
      z
        .object({
          decision: z.enum(['accepted', 'delegated', 'declined']),
          decisionId: text(200),
          decidedBy: text(200),
          decidedAt: z.string().datetime({ offset: true }),
          ownerId: text(120).nullable(),
          reason: optionalText(500),
        })
        .strict(),
    ]),
  })
  .strict();

export type HumanServiceRequest = z.infer<typeof humanServiceRequestSchema>;

export type HumanServiceDisposition =
  | 'join_existing'
  | 'queued'
  | 'blocked'
  | 'declined'
  | 'withdrawn'
  | 'cancelled'
  | 'needs_operator_decision'
  | 'accepted';

export type HumanServiceDispositionReason =
  | 'duplicate_request'
  | 'request_withdrawn'
  | 'request_cancelled'
  | 'invite_required'
  | 'pilot_review_required'
  | 'unsupported_scope'
  | 'unsafe_scope'
  | 'unlicensed_scope'
  | 'missing_inputs'
  | 'rights_unconfirmed'
  | 'tenant_scope_mismatch'
  | 'sensitive_attachment'
  | 'attachment_not_cleared'
  | 'attachment_rights_unconfirmed'
  | 'access_expired'
  | 'time_or_cost_overrun'
  | 'new_vendor_spend_not_authorized'
  | 'owner_missing'
  | 'owner_unavailable'
  | 'owner_requirements_unconfirmed'
  | 'pilot_capacity_reached'
  | 'tim_capacity_reached'
  | 'delivery_expectation_unagreed'
  | 'operator_packet_invalid'
  | 'operator_declined'
  | 'operator_owner_mismatch'
  | 'owner_acceptance_unconfirmed'
  | 'ready_for_operator_decision'
  | 'accepted_with_owner';

export interface HumanServicePilotReceipt {
  readonly schema: typeof HUMAN_SERVICE_PILOT_SCHEMA;
  readonly id: string;
  readonly caseId: string;
  readonly source: HumanServiceRequest['source'];
  readonly status: HumanServiceCaseStatus;
  readonly disposition: HumanServiceDisposition;
  readonly reason: HumanServiceDispositionReason;
  readonly ownerId: string | null;
  readonly authority: HumanServiceRequest['authority'];
  readonly budget: HumanServiceRequest['budget'];
  readonly operatorDecision: HumanServiceRequest['operatorDecision'];
  readonly operatorCard: SummerCardInput | null;
  readonly evaluatedAt: string;
}

export interface HumanServiceCaseBinding {
  readonly schema: typeof HUMAN_SERVICE_CASE_BINDING_SCHEMA;
  readonly id: string;
  readonly caseId: string;
  readonly tenantId: string;
  readonly threadId: string;
  readonly requestId: string;
}

function stableId(prefix: 'hs' | 'hsr' | 'hso', seed: string): string {
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 32);
  return `${prefix}_${digest}`;
}

export function humanServiceCaseId(
  source: HumanServiceRequest['source']
): string {
  return stableId(
    'hs',
    JSON.stringify([source.tenantId, source.threadId, source.requestId])
  );
}

export function buildHumanServiceCaseBinding(
  source: HumanServiceRequest['source']
): HumanServiceCaseBinding {
  const caseId = humanServiceCaseId(source);
  return {
    schema: HUMAN_SERVICE_CASE_BINDING_SCHEMA,
    id: caseId,
    caseId,
    tenantId: source.tenantId,
    threadId: source.threadId,
    requestId: source.requestId,
  };
}

function decisionCard(
  request: HumanServiceRequest,
  caseId: string
): SummerCardInput | null {
  const owner = request.proposedOwner;
  if (!owner) return null;
  const card = summerCardInputSchema.safeParse({
    idempotencyKey: caseId,
    kind: 'decision',
    product: 'jov',
    title: `Accept human request: ${request.requestedDeliverable.slice(0, 90)}`,
    body: [
      `Goal: ${request.goal}`,
      `Deliverable: ${request.requestedDeliverable}`,
      `Source context: ${request.sourceContext}`,
      `Known facts: ${request.knownFacts.join(' | ') || 'None recorded'}`,
      `Acceptance rubric: ${request.acceptanceRubric.join(' | ')}`,
      `Confidentiality: ${request.confidentiality}; rights: ${request.rights.status}`,
      `Brand preferences: ${request.brandPreferences.join(' | ') || 'None recorded'}`,
      `Permitted tools: ${request.authority.permittedTools.join(', ') || 'None'}`,
      `Permitted actions: ${request.authority.permittedActions.join(', ')}`,
      `Permitted accounts: ${request.authority.permittedAccountRefs.join(', ') || 'None'}`,
      `Permitted recipients: ${request.authority.permittedRecipientRefs.join(', ') || 'None'}`,
      `Proposed owner: ${owner.label} (${owner.kind})`,
      `Delivery expectation: ${request.deliveryExpectation.dueAt}`,
      `Budget: ${request.budget.humanMinutes} human min; ${request.budget.qaMinutes} QA min; $${request.budget.paidCostUsd} paid; $${request.budget.modelCostUsd} model`,
      `Stop conditions: ${request.stopConditions.join(' | ')}`,
      `Customer thread: ${request.source.threadId}; case: ${caseId}`,
    ].join('\n\n'),
    recommendation: `Accept only for ${owner.label}, the stated rubric, authority, budget, and delivery expectation.`,
    defaultIfSilent: 'Keep queued and not accepted.',
    recipient: 'Tim',
    evidence: [...new Set(request.evidence)],
  });
  return card.success ? card.data : null;
}

function receipt(
  request: HumanServiceRequest,
  caseId: string,
  disposition: HumanServiceDisposition,
  status: HumanServiceCaseStatus,
  reason: HumanServiceDispositionReason,
  operatorCard: SummerCardInput | null = null
): HumanServicePilotReceipt {
  return {
    schema: HUMAN_SERVICE_PILOT_SCHEMA,
    id: stableId(
      'hsr',
      JSON.stringify([
        humanServiceCaseId(request.source),
        request.source.revision,
        request.operatorDecision.decision === 'pending'
          ? 'pending'
          : request.operatorDecision.decisionId,
      ])
    ),
    caseId,
    source: request.source,
    status,
    disposition,
    reason,
    ownerId: request.proposedOwner?.id ?? null,
    authority: request.authority,
    budget: request.budget,
    operatorDecision: request.operatorDecision,
    operatorCard,
    evaluatedAt: request.evaluatedAt,
  };
}

/**
 * Admission only. This function records no acceptance and executes no action.
 * Raw goal, context, and attachment contents never expand the structured
 * authority snapshot.
 */
export function evaluateHumanServiceRequest(
  request: HumanServiceRequest
): HumanServicePilotReceipt {
  const caseId = humanServiceCaseId(request.source);
  const stop = (
    disposition: HumanServiceDisposition,
    status: HumanServiceCaseStatus,
    reason: HumanServiceDispositionReason,
    operatorCard: SummerCardInput | null = null,
    targetCaseId = caseId
  ) =>
    receipt(request, targetCaseId, disposition, status, reason, operatorCard);

  if (request.duplicateCaseId) {
    return stop(
      'join_existing',
      'requested',
      'duplicate_request',
      null,
      request.duplicateCaseId
    );
  }
  if (request.withdrawnAt) {
    return stop('withdrawn', 'withdrawn', 'request_withdrawn');
  }
  if (request.cancelledAt) {
    return stop('cancelled', 'cancelled', 'request_cancelled');
  }
  if (!request.pilot.inviteConfirmed) {
    return stop('declined', 'declined', 'invite_required');
  }
  if (request.scopeReview !== 'supported') {
    return stop('declined', 'declined', `${request.scopeReview}_scope`);
  }
  if (
    request.pilot.acceptedRequestCount >=
    HUMAN_SERVICE_PILOT_POLICY.reviewAfterAcceptedRequests
  ) {
    return stop('queued', 'queued', 'pilot_review_required');
  }
  if (request.missingInputs.length > 0) {
    return stop('blocked', 'blocked', 'missing_inputs');
  }
  if (request.rights.status !== 'confirmed') {
    return stop('blocked', 'blocked', 'rights_unconfirmed');
  }
  if (
    request.attachments.some(item => item.tenantId !== request.source.tenantId)
  ) {
    return stop('blocked', 'blocked', 'tenant_scope_mismatch');
  }
  if (request.attachments.some(item => item.sensitivity !== 'standard')) {
    return stop('blocked', 'blocked', 'sensitive_attachment');
  }
  if (request.attachments.some(item => item.scanStatus !== 'passed')) {
    return stop('blocked', 'blocked', 'attachment_not_cleared');
  }
  if (request.attachments.some(item => !item.rightsConfirmed)) {
    return stop('blocked', 'blocked', 'attachment_rights_unconfirmed');
  }
  if (
    request.accessValidUntil &&
    Date.parse(request.accessValidUntil) <= Date.parse(request.evaluatedAt)
  ) {
    return stop('blocked', 'blocked', 'access_expired');
  }
  if (
    request.projectedUse.humanMinutes > request.budget.humanMinutes ||
    request.projectedUse.qaMinutes > request.budget.qaMinutes ||
    request.projectedUse.paidCostUsd > request.budget.paidCostUsd ||
    request.projectedUse.modelCostUsd > request.budget.modelCostUsd
  ) {
    return stop('blocked', 'blocked', 'time_or_cost_overrun');
  }
  if (request.projectedUse.paidCostUsd > 0) {
    return stop('blocked', 'blocked', 'new_vendor_spend_not_authorized');
  }
  if (request.operatorDecision.decision === 'declined') {
    return stop('declined', 'declined', 'operator_declined');
  }
  const owner = request.proposedOwner;
  if (!owner) {
    return stop('queued', 'queued', 'owner_missing');
  }
  if (!owner.availabilityConfirmed) {
    return stop('queued', 'queued', 'owner_unavailable');
  }
  if (!owner.confidentialityConfirmed || !owner.permittedAccessConfirmed) {
    return stop('blocked', 'blocked', 'owner_requirements_unconfirmed');
  }
  if (
    request.pilot.activeRequestCount >=
    HUMAN_SERVICE_PILOT_POLICY.maximumActiveRequests
  ) {
    return stop('queued', 'queued', 'pilot_capacity_reached');
  }
  if (
    owner.kind === 'tim' &&
    request.pilot.timActiveRequestCount >=
      HUMAN_SERVICE_PILOT_POLICY.maximumTimActiveRequests
  ) {
    return stop('queued', 'queued', 'tim_capacity_reached');
  }
  if (!request.deliveryExpectation.agreed) {
    return stop('blocked', 'blocked', 'delivery_expectation_unagreed');
  }
  if (request.operatorDecision.decision === 'pending') {
    const operatorCard = decisionCard(request, caseId);
    return stop(
      operatorCard ? 'needs_operator_decision' : 'blocked',
      operatorCard ? 'requested' : 'blocked',
      operatorCard ? 'ready_for_operator_decision' : 'operator_packet_invalid',
      operatorCard
    );
  }
  const decisionMatchesOwner =
    request.operatorDecision.ownerId === owner.id &&
    ((owner.kind === 'tim' &&
      request.operatorDecision.decision === 'accepted') ||
      (owner.kind === 'specialist' &&
        request.operatorDecision.decision === 'delegated'));
  if (!decisionMatchesOwner) {
    return stop('blocked', 'blocked', 'operator_owner_mismatch');
  }
  if (owner.kind === 'specialist' && !owner.assignmentAccepted) {
    return stop('queued', 'queued', 'owner_acceptance_unconfirmed');
  }
  return stop('accepted', 'accepted', 'accepted_with_owner');
}

const executionCaptureSchema = z
  .object({
    inputRefs: boundedList(32, 1_000),
    choices: z
      .array(z.object({ choice: text(500), rationale: text(1_000) }).strict())
      .max(32),
    steps: z
      .array(
        z
          .object({
            action: text(500),
            tool: optionalText(120),
            artifactRevision: optionalText(200),
          })
          .strict()
      )
      .max(64),
    selectedParameters: z.record(z.string(), z.string()),
    rejectedAlternatives: boundedList(32, 1_000),
    exceptions: boundedList(32, 1_000),
    reviewerChanges: boundedList(32, 1_000),
    outcomeEvidence: z.array(httpsUrl).max(16),
    founderReviewReceiptRef: optionalText(1_000),
    containsSecrets: z.literal(false),
    containsHiddenReasoning: z.literal(false),
    capturesUnrelatedWindows: z.literal(false),
  })
  .strict();

const draftSopSchema = z
  .object({
    ref: httpsUrl,
    status: z.literal('draft'),
    ownerId: text(120),
    reviewerId: text(120),
    reviewStatus: z.literal('approved'),
    prerequisites: boundedList(24, 500),
    inputs: boundedList(24, 500),
    steps: boundedList(64, 1_000).min(1),
    branchingRules: boundedList(32, 1_000),
    examples: boundedList(16, 1_000),
    rubric: boundedList(24, 500).min(1),
    permittedTools: boundedList(16, 120),
    stopRules: boundedList(24, 500).min(1),
    provenance: z.array(httpsUrl).max(16),
    customerFactsRemoved: z.literal(true),
    publicationAuthorized: z.literal(false),
  })
  .strict();

export const humanServiceOutcomeRequestSchema = z
  .object({
    kind: z.literal('human-service-outcome'),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u),
    caseId: z.string().regex(/^hs_[0-9a-f]{32}$/u),
    acceptanceReceiptId: z.string().regex(/^hsr_[0-9a-f]{32}$/u),
    tenantId: text(200),
    threadId: text(200),
    ownerId: text(120),
    status: z.enum([
      'delivered',
      'revision_requested',
      'accepted_by_customer',
      'failed',
      'unresolved',
    ]),
    artifact: z.object({ ref: httpsUrl, revision: text(200) }).strict(),
    independentReview: z
      .object({
        reviewerId: text(120),
        rubricResult: z.enum(['passed', 'failed']),
        changes: boundedList(24, 1_000),
      })
      .strict(),
    delivery: z
      .object({
        customerThreadReceiptRef: httpsUrl,
        deliveredAt: z.string().datetime({ offset: true }),
        deployed: z.boolean(),
        liveDelivered: z.boolean(),
        customerDisposition: z.enum([
          'pending',
          'accepted',
          'revision_requested',
          'rejected',
        ]),
        businessOutcome: z
          .object({
            metric: text(200),
            observation: text(500),
            observedAt: z.string().datetime({ offset: true }),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    effort: z
      .object({
        humanMinutes: boundedMinutes,
        qaMinutes: boundedMinutes,
        paidCostUsd: nonnegativeMoney,
        modelCostUsd: nonnegativeMoney,
      })
      .strict(),
    executionCapture: executionCaptureSchema,
    draftSop: draftSopSchema,
    pilotLearning: z
      .object({
        satisfaction: z.enum(['unknown', 'satisfied', 'dissatisfied']),
        correctionCount: z.number().int().nonnegative().max(1_000),
        delayMinutes: boundedMinutes,
        repeatDemand: z.enum(['unknown', 'none', 'observed']),
        economics: z.enum(['unknown', 'economic', 'not_economic']),
        stepClassifications: z
          .array(
            z
              .object({
                step: text(500),
                classification: z.enum([
                  'generic',
                  'tenant_specific',
                  'specialist',
                  'not_economic_to_automate',
                ]),
              })
              .strict()
          )
          .max(64),
      })
      .strict(),
    recordedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.status === 'accepted_by_customer') !==
      (value.delivery.customerDisposition === 'accepted')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['delivery', 'customerDisposition'],
        message: 'customer acceptance requires an accepted disposition',
      });
    }
    if (
      (value.status === 'revision_requested') !==
      (value.delivery.customerDisposition === 'revision_requested')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['delivery', 'customerDisposition'],
        message: 'revision state requires a revision-requested disposition',
      });
    }
  });

export type HumanServiceOutcomeRequest = z.infer<
  typeof humanServiceOutcomeRequestSchema
>;

export function buildHumanServiceOutcomeReceipt(
  input: HumanServiceOutcomeRequest
) {
  return {
    schema: HUMAN_SERVICE_OUTCOME_SCHEMA,
    id: stableId('hso', `${input.caseId}:${input.idempotencyKey}`),
    ...input,
  };
}

export function humanServiceOutcomeMatchesRequest(
  binding: unknown,
  outcome: Pick<HumanServiceOutcomeRequest, 'caseId' | 'tenantId' | 'threadId'>
): binding is HumanServiceCaseBinding {
  if (typeof binding !== 'object' || binding === null) return false;
  const candidate = binding as Partial<HumanServiceCaseBinding>;
  return (
    candidate.schema === HUMAN_SERVICE_CASE_BINDING_SCHEMA &&
    candidate.caseId === outcome.caseId &&
    candidate.tenantId === outcome.tenantId &&
    candidate.threadId === outcome.threadId
  );
}

export function humanServiceOutcomeMatchesAcceptance(
  request: unknown,
  outcome: HumanServiceOutcomeRequest
): request is HumanServicePilotReceipt {
  if (typeof request !== 'object' || request === null) return false;
  const candidate = request as Partial<HumanServicePilotReceipt>;
  return (
    candidate.schema === HUMAN_SERVICE_PILOT_SCHEMA &&
    candidate.id === outcome.acceptanceReceiptId &&
    candidate.caseId === outcome.caseId &&
    candidate.source?.tenantId === outcome.tenantId &&
    candidate.source?.threadId === outcome.threadId &&
    candidate.status === 'accepted' &&
    candidate.ownerId === outcome.ownerId &&
    candidate.budget !== undefined &&
    outcome.effort.humanMinutes <= candidate.budget.humanMinutes &&
    outcome.effort.qaMinutes <= candidate.budget.qaMinutes &&
    outcome.effort.paidCostUsd <= candidate.budget.paidCostUsd &&
    outcome.effort.modelCostUsd <= candidate.budget.modelCostUsd
  );
}
