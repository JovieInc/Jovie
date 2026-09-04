import {
  digestCanonicalJson,
  isRecord,
  requireIsoTimestamp,
  SAFE_GIT_SHA,
} from './receipt-trust.mjs';

export const PRODUCT_QUALITY_GOVERNOR_SCHEMA =
  'jovie.summer-product-quality-governor.receipt/v1';
export const PRODUCT_QUALITY_CAPABILITY_ID = 'SUMMER-COMM-016';
export const PRODUCT_QUALITY_TRUST_BLOCKER =
  'canonical producer resolver, latest invalidation view, landing decision, and Ovie projection are not integrated';
const VERIFICATION_EXECUTION_SCHEMA = 'jovie-verification-execution/v1';
const CERTIFICATION_SCHEMA = 'jovie.certification/v1';
const PUBLIC_ONBOARDING_FEATURE_ID = 'public-onboarding';
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/u;
const VERIFICATION_PHASES = Object.freeze([
  'Launch',
  'Doctor',
  'Drive',
  'Evidence',
  'Cleanup',
]);
const CERTIFICATION_EVIDENCE_KINDS = Object.freeze([
  'deterministic',
  'visual',
  'behavior',
  'a11y',
  'runtime',
]);

export const QUALITY_TRIGGER_KINDS = Object.freeze([
  'release',
  'user_visible_error',
  'regression_signal',
  'periodic_sample',
]);

export const QUALITY_EVIDENCE_CATEGORIES = Object.freeze([
  'pathCompletion',
  'contentProvenance',
  'responsiveness',
  'accessibility',
  'localization',
  'visualQuality',
  'recovery',
  'buildProvenance',
]);

export const PUBLIC_ONBOARDING_PILOT = Object.freeze({
  id: 'public-onboarding',
  route: '/start',
  fixture: 'public-onboarding-quality-loop/v1',
  owners: Object.freeze({
    summer: 'triage_classify_candidate_measure_invariant',
    eve: 'durable_event_and_bounded_periodic_trigger',
    symphony: 'capability_bounded_remediation_dispatch',
    ovie: 'ambiguous_or_taste_sensitive_founder_review',
  }),
  executionBudget: Object.freeze({
    maxPaths: 1,
    maxPeriodicSamplesPerDay: 1,
    maxSyntheticTurns: 1,
    maxRuntimeMs: 120_000,
    maxLlmVisualReviewsPerRun: 0,
  }),
  acceptanceBudget: Object.freeze({
    firstTurnResolvedMs: 45_000,
    lighthousePerformanceScore: 0.92,
    lighthouseAccessibilityScore: 0.9,
    firstContentfulPaintMs: 1200,
    largestContentfulPaintMs: 2200,
    totalBlockingTimeMs: 350,
    timeToInteractiveMs: 3500,
    cumulativeLayoutShift: 0.02,
    blockingAccessibilityViolations: 0,
    consoleErrors: 0,
    criticalRequestFailures: 0,
  }),
  composedContracts: Object.freeze({
    journey: 'apps/web/tests/journey-auditor/README.md#the-conversion-loop',
    verification: VERIFICATION_EXECUTION_SCHEMA,
    certification: CERTIFICATION_SCHEMA,
  }),
});

function addError(errors, condition, message) {
  if (condition) errors.push(message);
}

function requireRecord(value, field, errors) {
  if (!isRecord(value)) {
    errors.push(`${field} must be an object`);
    return null;
  }
  return value;
}

function requireText(value, field, errors) {
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${field} must be a non-empty string`);
    return null;
  }
  return value;
}

function requireFinite(value, field, errors) {
  if (!Number.isFinite(value)) {
    errors.push(`${field} must be a finite number`);
    return null;
  }
  return value;
}

function timestamp(value, field, errors) {
  try {
    requireIsoTimestamp(value, field);
    return Date.parse(value);
  } catch {
    errors.push(`${field} must be a canonical UTC ISO timestamp`);
    return Number.NaN;
  }
}

function requirePassingEvidence(value, field, errors) {
  const evidence = requireRecord(value, field, errors);
  if (!evidence) return null;
  addError(
    errors,
    evidence.status !== 'passed',
    `${field}.status must be passed`
  );
  requireText(evidence.ref, `${field}.ref`, errors);
  return evidence;
}

function resolveTrustedReceipt(ref, kind, trustedReceipts, errors) {
  requireText(ref, `${kind}ReceiptRef`, errors);
  const entry = trustedReceipts?.[kind]?.[ref];
  const authority =
    kind === 'verification' ? 'pstack-verifier' : 'governed-certification';
  if (
    !isRecord(entry) ||
    entry.authority !== authority ||
    entry.immutable !== true ||
    entry.producerAttestation !== 'verified' ||
    !isRecord(entry.receipt) ||
    entry.digest !== digestCanonicalJson(entry.receipt)
  ) {
    errors.push(`${kind} receipt must resolve from its trusted producer store`);
    return null;
  }
  if (
    kind === 'certification' &&
    (!isRecord(entry.canonicalEvaluation) ||
      entry.canonicalEvaluation.digest !== entry.receipt.digest ||
      entry.canonicalEvaluation.state !== entry.receipt.state)
  ) {
    errors.push(
      'certification receipt must match the canonical evaluator result'
    );
    return null;
  }
  return entry;
}

function validateBase(receipt, errors, now) {
  addError(
    errors,
    receipt.schema !== PRODUCT_QUALITY_GOVERNOR_SCHEMA,
    `schema must be ${PRODUCT_QUALITY_GOVERNOR_SCHEMA}`
  );
  addError(
    errors,
    receipt.capabilityId !== PRODUCT_QUALITY_CAPABILITY_ID,
    `capabilityId must be ${PRODUCT_QUALITY_CAPABILITY_ID}`
  );
  addError(
    errors,
    receipt.pilotId !== PUBLIC_ONBOARDING_PILOT.id,
    `pilotId must be ${PUBLIC_ONBOARDING_PILOT.id}`
  );
  addError(
    errors,
    !SAFE_GIT_SHA.test(receipt.sourceVersion ?? ''),
    'sourceVersion must be an exact git SHA'
  );
  addError(
    errors,
    !SHA256.test(receipt.sourceTreeDigest ?? ''),
    'sourceTreeDigest must be an exact SHA-256 digest'
  );
  addError(
    errors,
    !SHA256.test(receipt.verificationPacketDigest ?? ''),
    'verificationPacketDigest must be an exact SHA-256 digest'
  );
  requireText(receipt.environmentVersion, 'environmentVersion', errors);
  const startedAt = timestamp(receipt.startedAt, 'startedAt', errors);
  const completedAt = timestamp(receipt.completedAt, 'completedAt', errors);
  addError(
    errors,
    Number.isFinite(startedAt) &&
      Number.isFinite(completedAt) &&
      completedAt < startedAt,
    'completedAt must not precede startedAt'
  );
  addError(
    errors,
    startedAt > now || completedAt > now,
    'receipt is future-dated'
  );
  addError(
    errors,
    Number.isFinite(startedAt) &&
      Number.isFinite(completedAt) &&
      completedAt - startedAt >
        PUBLIC_ONBOARDING_PILOT.executionBudget.maxRuntimeMs,
    'receipt exceeds the bounded pilot runtime'
  );
}

function validateTrigger(receipt, errors) {
  const trigger = requireRecord(receipt.trigger, 'trigger', errors);
  if (!trigger) return;
  addError(
    errors,
    !QUALITY_TRIGGER_KINDS.includes(trigger.kind),
    'trigger.kind is not allowed'
  );
  if (trigger.kind === 'periodic_sample') {
    addError(
      errors,
      trigger.periodicSamplesToday !== 1,
      'periodic sampling must be bounded to one path sample per day'
    );
    addError(
      errors,
      trigger.eventRef !== null,
      'periodic sampling must not invent an event reference'
    );
  } else {
    requireText(trigger.eventRef, 'trigger.eventRef', errors);
  }
}

function validatePrivacyAndCost(receipt, errors) {
  const privacy = requireRecord(receipt.privacy, 'privacy', errors);
  if (privacy) {
    const required = {
      syntheticOrDisposableFixture: true,
      productionWrites: false,
      personalConversationDataRetained: false,
      credentialRead: false,
      externalMessages: false,
      arbitraryUserContentCaptured: false,
    };
    for (const [field, expected] of Object.entries(required)) {
      addError(
        errors,
        privacy[field] !== expected,
        `privacy.${field} must be ${expected}`
      );
    }
  }

  const scope = requireRecord(receipt.scope, 'scope', errors);
  if (scope) {
    addError(
      errors,
      !Array.isArray(scope.paths) ||
        scope.paths.length !== 1 ||
        scope.paths[0] !== PUBLIC_ONBOARDING_PILOT.route,
      'scope.paths must contain only /start'
    );
    addError(errors, scope.maxPaths !== 1, 'scope.maxPaths must be 1');
  }

  const cost = requireRecord(receipt.cost, 'cost', errors);
  if (!cost) return;
  const budget = PUBLIC_ONBOARDING_PILOT.executionBudget;
  for (const [field, maximum] of [
    ['syntheticTurns', budget.maxSyntheticTurns],
    ['runtimeMs', budget.maxRuntimeMs],
    ['llmVisualReviews', budget.maxLlmVisualReviewsPerRun],
  ]) {
    const value = requireFinite(cost[field], `cost.${field}`, errors);
    addError(
      errors,
      value !== null && (value < 0 || value > maximum),
      `cost.${field} exceeds the bounded pilot budget`
    );
  }
}

function validateAcceptanceEvidence(receipt, errors) {
  const evidence = requireRecord(receipt.evidence, 'evidence', errors);
  if (!evidence) return;
  for (const category of QUALITY_EVIDENCE_CATEGORIES) {
    requirePassingEvidence(evidence[category], `evidence.${category}`, errors);
  }
  const budget = PUBLIC_ONBOARDING_PILOT.acceptanceBudget;
  const path = evidence.pathCompletion;
  if (isRecord(path)) {
    addError(
      errors,
      path.completed !== true,
      'public onboarding path must complete'
    );
    addError(
      errors,
      !Number.isFinite(path.firstTurnResolvedMs) ||
        path.firstTurnResolvedMs > budget.firstTurnResolvedMs,
      'first onboarding turn exceeds its response budget'
    );
  }
  const content = evidence.contentProvenance;
  if (isRecord(content)) {
    addError(
      errors,
      content.claimsSourceBound !== true || content.unverifiedClaims !== 0,
      'content must be truthful and source-bound'
    );
  }
  const responsiveness = evidence.responsiveness;
  if (isRecord(responsiveness)) {
    const minimums = [['performanceScore', budget.lighthousePerformanceScore]];
    const maximums = [
      ['firstContentfulPaintMs', budget.firstContentfulPaintMs],
      ['largestContentfulPaintMs', budget.largestContentfulPaintMs],
      ['totalBlockingTimeMs', budget.totalBlockingTimeMs],
      ['timeToInteractiveMs', budget.timeToInteractiveMs],
      ['cumulativeLayoutShift', budget.cumulativeLayoutShift],
    ];
    for (const [field, minimum] of minimums) {
      addError(
        errors,
        !Number.isFinite(responsiveness[field]) ||
          responsiveness[field] < minimum,
        `responsiveness.${field} is below budget`
      );
    }
    for (const [field, maximum] of maximums) {
      addError(
        errors,
        !Number.isFinite(responsiveness[field]) ||
          responsiveness[field] > maximum,
        `responsiveness.${field} exceeds budget`
      );
    }
    for (const viewport of ['mobile-320', 'mobile-390', 'desktop-1440']) {
      addError(
        errors,
        !Array.isArray(responsiveness.viewportResults) ||
          !responsiveness.viewportResults.some(
            result =>
              isRecord(result) &&
              result.viewport === viewport &&
              result.path === PUBLIC_ONBOARDING_PILOT.route &&
              result.status === 'passed'
          ),
        `responsiveness requires a passing ${viewport} /start result`
      );
    }
  }
  const accessibility = evidence.accessibility;
  if (isRecord(accessibility)) {
    addError(
      errors,
      !Number.isFinite(accessibility.score) ||
        accessibility.score < budget.lighthouseAccessibilityScore,
      'accessibility score is below budget'
    );
    addError(
      errors,
      accessibility.blockingViolations !==
        budget.blockingAccessibilityViolations,
      'blocking accessibility violations exceed budget'
    );
    for (const check of [
      'lighthouse',
      'keyboard',
      'focus',
      'name-role',
      'responsive-a11y',
    ]) {
      addError(
        errors,
        !Array.isArray(accessibility.checks) ||
          !accessibility.checks.some(
            result =>
              isRecord(result) &&
              result.check === check &&
              result.status === 'passed'
          ),
        `accessibility requires a passing ${check} check`
      );
    }
  }
  const localization = evidence.localization;
  if (isRecord(localization)) {
    addError(
      errors,
      !Array.isArray(localization.locales) ||
        !localization.locales.includes('en-US') ||
        localization.overflowFailures !== 0,
      'localization requires an overflow-safe en-US baseline'
    );
  }
  const visual = evidence.visualQuality;
  if (isRecord(visual)) {
    addError(
      errors,
      visual.snapshotComparison !== 'passed',
      'visual snapshot comparison must pass'
    );
    addError(
      errors,
      visual.modelTasteUsed !== false,
      'machine certification must not substitute model taste'
    );
    addError(
      errors,
      !SHA256.test(visual.baselineDigest ?? '') ||
        visual.path !== PUBLIC_ONBOARDING_PILOT.route ||
        visual.locale !== 'en-US' ||
        !['mobile-320', 'mobile-390', 'desktop-1440'].includes(visual.viewport),
      'visual proof must bind a baseline, /start, locale, and pilot viewport'
    );
  }
  const recovery = evidence.recovery;
  if (isRecord(recovery)) {
    addError(
      errors,
      recovery.composerRecovered !== true,
      'composer must recover'
    );
    addError(
      errors,
      recovery.consoleErrors !== budget.consoleErrors,
      'console errors exceed budget'
    );
    addError(
      errors,
      recovery.criticalRequestFailures !== budget.criticalRequestFailures,
      'critical request failures exceed budget'
    );
  }
  const provenance = evidence.buildProvenance;
  if (isRecord(provenance)) {
    addError(
      errors,
      provenance.sourceVersion !== receipt.sourceVersion ||
        provenance.environmentVersion !== receipt.environmentVersion,
      'build provenance must bind the exact source and environment versions'
    );
  }
}

function validateVerificationReceipt(receipt, execution, errors, now) {
  const proof = requireRecord(execution, 'verificationReceipt', errors);
  if (!proof) return;
  addError(
    errors,
    proof.schema !== VERIFICATION_EXECUTION_SCHEMA,
    `verificationReceipt.schema must be ${VERIFICATION_EXECUTION_SCHEMA}`
  );
  addError(errors, proof.outcome !== 'passed', 'verification must pass');
  addError(
    errors,
    proof.featureId !== PUBLIC_ONBOARDING_FEATURE_ID,
    'verification must execute the public-onboarding feature'
  );
  addError(
    errors,
    proof.packetDigest !== receipt.verificationPacketDigest,
    'verification packet digest must match the selected packet'
  );
  addError(
    errors,
    proof.sourceSha !== receipt.sourceVersion ||
      proof.sourceTreeDigest !== receipt.sourceTreeDigest,
    'verification must bind the exact source SHA and tree digest'
  );
  const startedAt = timestamp(
    proof.startedAt,
    'verificationReceipt.startedAt',
    errors
  );
  const completedAt = timestamp(
    proof.completedAt,
    'verificationReceipt.completedAt',
    errors
  );
  addError(
    errors,
    startedAt < Date.parse(receipt.startedAt) ||
      completedAt < startedAt ||
      completedAt > Date.parse(receipt.completedAt) ||
      completedAt > now,
    'verification timestamps must fall inside the current governor run'
  );
  for (const phase of VERIFICATION_PHASES) {
    addError(
      errors,
      !Array.isArray(proof.phases) ||
        proof.phases.filter(
          item =>
            isRecord(item) && item.name === phase && item.status === 'passed'
        ).length !== 1,
      `verification phase ${phase} must pass exactly once`
    );
  }
  const artifacts = requireRecord(
    proof.artifacts,
    'verificationReceipt.artifacts',
    errors
  );
  for (const name of ['screenshot', 'trace', 'journey']) {
    requireText(
      artifacts?.[name],
      `verificationReceipt.artifacts.${name}`,
      errors
    );
  }
  addError(
    errors,
    !isRecord(proof.blastRadius) ||
      !Array.isArray(proof.blastRadius.route) ||
      proof.blastRadius.route.length !== 1 ||
      proof.blastRadius.route[0] !== PUBLIC_ONBOARDING_PILOT.route ||
      !Array.isArray(proof.blastRadius.writes) ||
      proof.blastRadius.writes.some(
        write => write !== 'output/verification only'
      ),
    'verification blast radius must be /start with output-only writes'
  );
  requireText(proof.safetyClaim, 'verificationReceipt.safetyClaim', errors);
}

function validateCertificationReceipt(
  receipt,
  certification,
  verification,
  invariantSuiteVersion,
  errors,
  now
) {
  const proof = requireRecord(certification, 'certificationReceipt', errors);
  if (!proof) return;
  addError(
    errors,
    proof.contract !== CERTIFICATION_SCHEMA,
    `certificationReceipt.contract must be ${CERTIFICATION_SCHEMA}`
  );
  addError(
    errors,
    !SHA256.test(proof.digest ?? ''),
    'certification digest is invalid'
  );
  addError(
    errors,
    proof.state !== 'certified',
    'certification must be current and certified'
  );
  addError(
    errors,
    !Array.isArray(proof.blockers) ||
      proof.blockers.length !== 0 ||
      !Array.isArray(proof.invalidations) ||
      proof.invalidations.length !== 0,
    'certification must have no blockers or invalidations'
  );
  addError(
    errors,
    !isRecord(proof.subject) ||
      proof.subject.id !== PUBLIC_ONBOARDING_FEATURE_ID ||
      proof.subject.kind !== 'task' ||
      proof.subject.sourceSha !== receipt.sourceVersion ||
      !Array.isArray(proof.subject.paths) ||
      proof.subject.paths.length !== 1 ||
      proof.subject.paths[0] !== PUBLIC_ONBOARDING_PILOT.route,
    'certification subject must bind the exact /start source'
  );
  addError(
    errors,
    proof.invariantSuiteVersion !== invariantSuiteVersion,
    'certification must bind the governor invariant suite'
  );
  addError(
    errors,
    !isRecord(proof.environment) ||
      proof.environment.version !== receipt.environmentVersion,
    'certification environment must match the exact runtime'
  );
  const assessedAt = timestamp(
    proof.assessedAt,
    'certificationReceipt.assessedAt',
    errors
  );
  const validUntil = timestamp(
    proof.validUntil,
    'certificationReceipt.validUntil',
    errors
  );
  addError(
    errors,
    assessedAt < Date.parse(verification?.completedAt) ||
      assessedAt > Date.parse(receipt.completedAt) ||
      assessedAt > now ||
      validUntil <= now,
    'certification must be current and assessed after exact-build verification'
  );
  for (const kind of CERTIFICATION_EVIDENCE_KINDS) {
    const matches = Array.isArray(proof.evidence)
      ? proof.evidence.filter(item => isRecord(item) && item.kind === kind)
      : [];
    addError(
      errors,
      matches.length !== 1,
      `certification requires exactly one ${kind} evidence item`
    );
    const item = matches[0];
    if (!item) continue;
    addError(
      errors,
      item.status !== 'passed' ||
        item.deterministic !== true ||
        item.sourceSha !== receipt.sourceVersion ||
        item.subjectVersion !== proof.subject?.version ||
        item.invariantSuiteVersion !== invariantSuiteVersion ||
        item.environmentVersion !== receipt.environmentVersion ||
        timestamp(
          item.collectedAt,
          `certification evidence ${kind} collectedAt`,
          errors
        ) > now ||
        timestamp(
          item.validUntil,
          `certification evidence ${kind} validUntil`,
          errors
        ) <= now ||
        !Array.isArray(item.artifacts) ||
        item.artifacts.length === 0,
      `certification ${kind} evidence is stale or not cross-bound`
    );
  }
}

function validateCertifiedClaims(
  receipt,
  verificationEntry,
  certificationEntry,
  errors
) {
  const artifacts = certificationEntry?.receipt?.artifacts;
  if (!Array.isArray(artifacts)) {
    errors.push('certification artifacts must be an array');
    return;
  }
  const claims = [
    ...QUALITY_EVIDENCE_CATEGORIES.map(category => [
      `evidence.${category}`,
      receipt.evidence?.[category],
    ]),
    ['classification', receipt.classification],
    ['candidate', receipt.candidate],
    ['dispatch', receipt.dispatch],
    ['outcome', receipt.outcome],
    ['invariant', receipt.invariant],
  ];
  const refs = [];
  for (const [field, claim] of claims) {
    if (!isRecord(claim)) continue;
    const ref = requireText(claim.ref, `${field}.ref`, errors);
    if (!ref) continue;
    refs.push(ref);
    const digest = `sha256:${digestCanonicalJson(claim)}`;
    addError(
      errors,
      !artifacts.some(
        artifact =>
          isRecord(artifact) &&
          artifact.ref === ref &&
          artifact.digest === digest
      ),
      `${field} must be digest-bound to trusted certification evidence`
    );
  }
  addError(
    errors,
    refs.length !== new Set(refs).size,
    'quality claim references must be distinct'
  );
  addError(
    errors,
    !artifacts.some(
      artifact =>
        isRecord(artifact) &&
        artifact.ref === receipt.verificationReceiptRef &&
        artifact.digest === `sha256:${verificationEntry?.digest}`
    ),
    'trusted verification receipt must be bound into certification evidence'
  );
}

function validateClosedLoop(receipt, errors, now, trustedReceipts) {
  const classification = requirePassingEvidence(
    receipt.classification,
    'classification',
    errors
  );
  if (classification) {
    addError(
      errors,
      classification.freshReproduction !== true,
      'classification requires a fresh reproduction'
    );
    addError(
      errors,
      classification.screenshotDisposition !== 'reproduced_defect',
      'the founder screenshot remains a lead until the defect is reproduced'
    );
    const observedAt = timestamp(
      classification.observedAt,
      'classification.observedAt',
      errors
    );
    addError(
      errors,
      observedAt < Date.parse(receipt.startedAt) ||
        observedAt > Date.parse(receipt.completedAt) ||
        observedAt > now,
      'classification must be freshly observed during this run'
    );
    requireText(
      classification.defectClass,
      'classification.defectClass',
      errors
    );
  }

  const candidate = requirePassingEvidence(
    receipt.candidate,
    'candidate',
    errors
  );
  const dispatch = requireRecord(receipt.dispatch, 'dispatch', errors);
  const founderReview = requireRecord(
    receipt.founderReview,
    'founderReview',
    errors
  );
  const riskClass = candidate?.riskClass;
  if (candidate) {
    addError(
      errors,
      candidate.path !== PUBLIC_ONBOARDING_PILOT.route,
      'candidate.path must stay bounded to /start'
    );
    addError(
      errors,
      candidate.defectClass !== classification?.defectClass,
      'candidate.defectClass must match the reproduced classification'
    );
    requireText(candidate.changeBoundary, 'candidate.changeBoundary', errors);
    requireText(
      candidate.measurementMetric,
      'candidate.measurementMetric',
      errors
    );
    addError(
      errors,
      !['increase', 'decrease'].includes(candidate.measurementDirection),
      'candidate.measurementDirection must be increase or decrease'
    );
  }
  addError(
    errors,
    !['machine_eligible', 'taste_sensitive', 'hard_boundary'].includes(
      riskClass
    ),
    'candidate.riskClass is invalid'
  );

  if (riskClass === 'machine_eligible') {
    addError(
      errors,
      dispatch?.requested !== true ||
        dispatch.capability !== 'product-quality-remediation' ||
        dispatch.capabilityBounded !== true,
      'machine-eligible repair requires a capability-bounded Symphony dispatch request'
    );
    requireText(dispatch?.ref, 'dispatch.ref', errors);
    addError(
      errors,
      dispatch?.candidateRef !== candidate?.ref,
      'Symphony dispatch must bind the exact remediation candidate'
    );
    addError(
      errors,
      founderReview?.required !== false,
      'machine-certifiable repair must not require founder taste review'
    );
  } else if (riskClass === 'taste_sensitive') {
    addError(
      errors,
      dispatch?.requested !== false,
      'taste-sensitive work must not dispatch automatically'
    );
    addError(
      errors,
      founderReview?.required !== true,
      'taste-sensitive work must route to Ovie founder review'
    );
    requireText(
      founderReview?.projectionRef,
      'founderReview.projectionRef',
      errors
    );
  } else if (riskClass === 'hard_boundary') {
    addError(
      errors,
      dispatch?.requested !== false,
      'hard-boundary work must not dispatch automatically'
    );
    requireText(candidate?.blockedReason, 'candidate.blockedReason', errors);
  }

  if (riskClass !== 'machine_eligible') return riskClass;

  const verificationEntry = resolveTrustedReceipt(
    receipt.verificationReceiptRef,
    'verification',
    trustedReceipts,
    errors
  );
  const certificationEntry = resolveTrustedReceipt(
    receipt.certificationReceiptRef,
    'certification',
    trustedReceipts,
    errors
  );

  const outcome = requirePassingEvidence(receipt.outcome, 'outcome', errors);
  if (outcome) {
    const before = requireFinite(outcome.before, 'outcome.before', errors);
    const after = requireFinite(outcome.after, 'outcome.after', errors);
    const improved =
      before !== null &&
      after !== null &&
      (candidate?.measurementDirection === 'decrease'
        ? after < before
        : candidate?.measurementDirection === 'increase' && after > before);
    addError(errors, !improved, 'post-change outcome must measurably improve');
    requireText(outcome.metric, 'outcome.metric', errors);
    addError(
      errors,
      outcome.metric !== candidate?.measurementMetric,
      'post-change outcome must measure the candidate metric'
    );
  }
  const invariant = requirePassingEvidence(
    receipt.invariant,
    'invariant',
    errors
  );
  if (invariant) {
    const suiteVersion = requireText(
      invariant.suiteVersion,
      'invariant.suiteVersion',
      errors
    );
    const selectorRef = requireText(
      invariant.selectorRef,
      'invariant.selectorRef',
      errors
    );
    const proofs = [
      ['independentReview', 'passed'],
      ['deliberateRed', 'failed_as_expected'],
      ['corrected', 'passed'],
      ['neighbor', 'passed'],
    ];
    const refs = [];
    for (const [field, expectedStatus] of proofs) {
      const proof = requireRecord(
        invariant[field],
        `invariant.${field}`,
        errors
      );
      if (!proof) continue;
      addError(
        errors,
        proof.status !== expectedStatus ||
          proof.suiteVersion !== suiteVersion ||
          proof.defectClass !== candidate?.defectClass,
        `invariant.${field} must bind the same suite and defect class`
      );
      const ref = requireText(proof.ref, `invariant.${field}.ref`, errors);
      if (ref) refs.push(ref);
      if (field !== 'independentReview') {
        addError(
          errors,
          proof.selectorRef !== selectorRef ||
            proof.sourceVersion !== receipt.sourceVersion,
          `invariant.${field} must bind the same selector and source`
        );
      }
    }
    addError(
      errors,
      refs.length !== new Set(refs).size,
      'invariant proof references must be distinct'
    );
    addError(
      errors,
      invariant.deliberateRed?.rejected !== true ||
        typeof invariant.deliberateRed?.expectedFailureCode !== 'string',
      'deliberate red must record the expected rejection'
    );
    addError(
      errors,
      invariant.neighbor?.path !== PUBLIC_ONBOARDING_PILOT.route ||
        !['mobile-320', 'mobile-390', 'desktop-1440'].includes(
          invariant.neighbor?.boundary
        ),
      'neighbor proof must preserve /start at an adversarial viewport boundary'
    );
    validateVerificationReceipt(
      receipt,
      verificationEntry?.receipt,
      errors,
      now
    );
    validateCertificationReceipt(
      receipt,
      certificationEntry?.receipt,
      verificationEntry?.receipt,
      suiteVersion,
      errors,
      now
    );
    validateCertifiedClaims(
      receipt,
      verificationEntry,
      certificationEntry,
      errors
    );
  }
  return riskClass;
}

/**
 * @param {Record<string, any>} receipt
 * @param {{now?: number, trustedReceipts?: Record<string, Record<string, unknown>>}} [options]
 */
export function evaluateProductQualityReceipt(
  receipt,
  { now = Date.now(), trustedReceipts } = {}
) {
  if (!isRecord(receipt)) {
    return {
      outcome: 'failed',
      owner: 'Summer',
      blockers: ['receipt must be an object'],
    };
  }
  const blockers = [];
  validateBase(receipt, blockers, now);
  validateTrigger(receipt, blockers);
  validatePrivacyAndCost(receipt, blockers);
  validateAcceptanceEvidence(receipt, blockers);
  const riskClass = validateClosedLoop(receipt, blockers, now, trustedReceipts);
  if (blockers.length > 0) {
    return { outcome: 'failed', owner: 'Summer', blockers };
  }
  if (riskClass === 'taste_sensitive') {
    return {
      outcome: 'blocked',
      owner: 'Ovie',
      blockers: [PRODUCT_QUALITY_TRUST_BLOCKER],
    };
  }
  if (riskClass === 'hard_boundary') {
    return {
      outcome: 'blocked',
      owner: 'Summer',
      blockers: [receipt.candidate.blockedReason],
    };
  }
  return {
    outcome: 'blocked',
    owner: 'Summer',
    blockers: [PRODUCT_QUALITY_TRUST_BLOCKER],
  };
}
