import {
  evaluateHumanServiceRequest,
  type HumanServiceRequest,
  humanServiceCaseId,
  humanServiceOutcomeRequestSchema,
  humanServiceRequestSchema,
} from '@/lib/ovie/human-service-pilot';

export const HUMAN_SERVICE_FIXTURE_NOW = '2026-10-02T20:00:00.000Z';

export function humanServiceRequestFixture(
  overrides: Record<string, unknown> = {}
): HumanServiceRequest {
  return humanServiceRequestSchema.parse({
    kind: 'human-service-request',
    requestedAt: '2026-10-02T18:00:00.000Z',
    source: {
      tenantId: 'tenant_creator_1',
      threadId: 'conversation_1',
      requestId: 'message_1',
      revision: '1',
    },
    category: 'creator_supplied_asset',
    goal: 'Turn my supplied launch clip into a concise vertical cut.',
    requestedDeliverable: 'One reviewed 20 second vertical clip',
    sourceContext: 'Customer supplied the source clip in the Jovie thread.',
    knownFacts: ['Customer owns the source clip'],
    missingInputs: [],
    acceptanceRubric: ['Uses only the supplied clip'],
    confidentiality: 'confidential',
    rights: {
      status: 'confirmed',
      sourceRef: 'https://jov.ie/app/inbox/conversation_1',
    },
    brandPreferences: ['Clear and understated'],
    authority: {
      permittedTools: ['approved-video-editor'],
      permittedAccountRefs: [],
      permittedActions: [
        'edit_customer_supplied_asset',
        'return_artifact_in_customer_thread',
      ],
      permittedRecipientRefs: ['conversation_1'],
      outwardExecutionAuthorized: false,
    },
    proposedOwner: {
      id: 'tim',
      label: 'Tim',
      kind: 'tim',
      availabilityConfirmed: true,
      confidentialityConfirmed: true,
      permittedAccessConfirmed: true,
      assignmentAccepted: false,
    },
    deliveryExpectation: {
      dueAt: '2026-10-03T20:00:00.000Z',
      agreed: true,
    },
    budget: {
      humanMinutes: 60,
      qaMinutes: 15,
      paidCostUsd: 0,
      modelCostUsd: 2,
    },
    projectedUse: {
      humanMinutes: 45,
      qaMinutes: 10,
      paidCostUsd: 0,
      modelCostUsd: 1,
    },
    stopConditions: ['Stop before any public post or third-party send'],
    attachments: [
      {
        id: 'attachment_1',
        tenantId: 'tenant_creator_1',
        storageRef: 'private://creator-1/clip-1',
        sensitivity: 'standard',
        scanStatus: 'passed',
        rightsConfirmed: true,
      },
    ],
    evidence: ['https://jov.ie/app/inbox/conversation_1'],
    privacy: {
      taskScoped: true,
      containsSecrets: false,
      containsHiddenReasoning: false,
      capturesUnrelatedWindows: false,
    },
    pilot: {
      inviteConfirmed: true,
      acceptedRequestCount: 0,
      activeRequestCount: 0,
      timActiveRequestCount: 0,
      newVendorSpendAuthorized: false,
    },
    scopeReview: 'supported',
    duplicateCaseId: null,
    withdrawnAt: null,
    cancelledAt: null,
    accessValidUntil: '2026-10-04T20:00:00.000Z',
    evaluatedAt: HUMAN_SERVICE_FIXTURE_NOW,
    operatorDecision: { decision: 'pending' },
    ...overrides,
  });
}

export function humanServiceAcceptedReceiptFixture() {
  const pending = humanServiceRequestFixture();
  return evaluateHumanServiceRequest(
    humanServiceRequestFixture({
      source: { ...pending.source, revision: '2' },
      operatorDecision: {
        decision: 'accepted',
        decisionId: 'decision_1',
        decidedBy: 'tim',
        decidedAt: HUMAN_SERVICE_FIXTURE_NOW,
        ownerId: 'tim',
        reason: null,
      },
    })
  );
}

export function humanServiceOutcomeFixture(
  overrides: Record<string, unknown> = {}
) {
  const source = humanServiceRequestFixture().source;
  const acceptance = humanServiceAcceptedReceiptFixture();
  return humanServiceOutcomeRequestSchema.parse({
    kind: 'human-service-outcome',
    idempotencyKey: 'delivery_clip_1_v1',
    caseId: humanServiceCaseId(source),
    acceptanceReceiptId: acceptance.id,
    tenantId: source.tenantId,
    threadId: source.threadId,
    ownerId: 'tim',
    status: 'accepted_by_customer',
    artifact: {
      ref: 'https://store.jov.ie/private/clip-1-v1',
      revision: 'v1',
    },
    independentReview: {
      reviewerId: 'reviewer_1',
      rubricResult: 'passed',
      changes: ['Reduced the opening title duration'],
    },
    delivery: {
      customerThreadReceiptRef:
        'https://jov.ie/app/inbox/conversation_1#message_4',
      deliveredAt: '2026-10-03T18:00:00.000Z',
      deployed: false,
      liveDelivered: true,
      customerDisposition: 'accepted',
      businessOutcome: null,
    },
    effort: {
      humanMinutes: 42,
      qaMinutes: 9,
      paidCostUsd: 0,
      modelCostUsd: 0.75,
    },
    executionCapture: {
      inputRefs: ['private://creator-1/clip-1'],
      choices: [
        {
          choice: 'Use the second hook',
          rationale: 'It matched the stated launch goal.',
        },
      ],
      steps: [
        {
          action: 'Cut supplied clip',
          tool: 'approved-video-editor',
          artifactRevision: 'v1',
        },
      ],
      selectedParameters: { duration: '20s', aspectRatio: '9:16' },
      rejectedAlternatives: ['Public stock footage was outside scope'],
      exceptions: [],
      reviewerChanges: ['Reduced the opening title duration'],
      outcomeEvidence: ['https://jov.ie/app/inbox/conversation_1#message_5'],
      founderReviewReceiptRef: null,
      containsSecrets: false,
      containsHiddenReasoning: false,
      capturesUnrelatedWindows: false,
    },
    draftSop: {
      ref: 'https://jov.ie/private/playbooks/clip-cut-v1',
      status: 'draft',
      ownerId: 'tim',
      reviewerId: 'reviewer_1',
      reviewStatus: 'approved',
      prerequisites: ['Customer-supplied source with confirmed rights'],
      inputs: ['Source clip', 'goal', 'duration'],
      steps: ['Review source', 'cut draft', 'independent rubric review'],
      branchingRules: ['Stop if rights or access expire'],
      examples: ['20 second vertical launch clip'],
      rubric: ['Uses only approved material'],
      permittedTools: ['approved-video-editor'],
      stopRules: ['No public post without a new explicit approval'],
      provenance: ['https://jov.ie/app/inbox/conversation_1'],
      customerFactsRemoved: true,
      publicationAuthorized: false,
    },
    pilotLearning: {
      satisfaction: 'satisfied',
      correctionCount: 1,
      delayMinutes: 0,
      repeatDemand: 'unknown',
      economics: 'unknown',
      stepClassifications: [
        { step: 'Cut draft', classification: 'specialist' },
        { step: 'Check duration', classification: 'generic' },
      ],
    },
    recordedAt: '2026-10-03T19:00:00.000Z',
    ...overrides,
  });
}
