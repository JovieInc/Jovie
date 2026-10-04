/**
 * Machine-readable closure contract for production-escaped defects.
 * Invariant consumer: JOV-INV-041.
 *
 * Evidence lives on the originating Linear issue so product repair and the
 * detector repair cannot drift into unrelated completion records. The same
 * evaluator is consumed by the merge closer, the explicit Linear transition
 * CLI, and the existing quality-gap scan.
 */

export const ESCAPED_DEFECT_CLOSURE_SCHEMA = 'jovie.escaped-defect-closure/v1';
export const ESCAPED_DEFECT_LABEL = 'escaped-defect';
export const MAX_AUTOMATIC_REMEDIATION_ATTEMPTS = 3;
export const LEARNING_COMPILER_ISSUES = Object.freeze(['JOV-2967', 'JOV-7084']);

export const DETECTION_GAP_CLASSES = Object.freeze([
  'missing-signal',
  'stale-signal',
  'missing-join',
  'bad-classification',
  'missing-invariant',
  'missing-remediator',
  'remediator-failed',
  'false-green',
  'founder-only-surface',
  'coverage-gap',
]);

const CLOSURE_MARKER =
  /<!--\s*escaped-defect-closure:v1\s*\n([\s\S]*?)\n\s*-->/g;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value, minimum = 1) {
  return typeof value === 'string' && value.trim().length >= minimum;
}

function hasEvidenceRef(value) {
  if (!hasText(value, 8)) return false;
  const normalized = value.trim().toLowerCase();
  return !['todo', 'tbd', 'none', 'n/a', 'not applicable', 'pending'].includes(
    normalized
  );
}

function validTimestamp(value) {
  if (!hasText(value) || !ISO_TIMESTAMP.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now() + 60_000;
}

function validHttpsUrl(value) {
  if (!hasText(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizedLabels(issue) {
  const labels = Array.isArray(issue?.labels)
    ? issue.labels
    : Array.isArray(issue?.labels?.nodes)
      ? issue.labels.nodes
      : [];
  return labels
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean)
    .map(label => String(label).trim().toLowerCase());
}

export function isEscapedDefect(issue) {
  return normalizedLabels(issue).includes(ESCAPED_DEFECT_LABEL);
}

/**
 * Read the latest closure marker from an issue description and its comments.
 * A malformed latest marker is authoritative and fails closed instead of
 * falling back to stale earlier evidence.
 */
export function extractEscapedDefectClosureEvidence(issue) {
  const comments = Array.isArray(issue?.comments)
    ? issue.comments
    : Array.isArray(issue?.comments?.nodes)
      ? issue.comments.nodes
      : [];
  const corpus = [
    String(issue?.description ?? ''),
    ...comments.map(comment =>
      typeof comment === 'string' ? comment : String(comment?.body ?? '')
    ),
  ].join('\n');
  const markers = [...corpus.matchAll(CLOSURE_MARKER)];
  const latest = markers.at(-1)?.[1];
  if (!latest) {
    return {
      evidence: null,
      error: 'missing escaped-defect-closure:v1 evidence marker',
    };
  }
  try {
    const evidence = JSON.parse(latest);
    if (!isRecord(evidence)) {
      return {
        evidence: null,
        error: 'closure evidence must be a JSON object',
      };
    }
    return { evidence, error: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      evidence: null,
      error: `closure evidence is invalid JSON: ${message}`,
    };
  }
}

export function validateEscapedDefectClosureEvidence(
  evidence,
  { issueIdentifier = '', expectedDeploymentSha = '' } = {}
) {
  const errors = [];
  if (!isRecord(evidence)) {
    return ['closure evidence must be a JSON object'];
  }
  if (evidence.schema !== ESCAPED_DEFECT_CLOSURE_SCHEMA) {
    errors.push(`schema must be ${ESCAPED_DEFECT_CLOSURE_SCHEMA}`);
  }
  const originatingIssue = String(
    evidence.originatingIssue ?? ''
  ).toUpperCase();
  if (!/^JOV-\d+$/.test(originatingIssue)) {
    errors.push('originatingIssue must be a JOV issue identifier');
  } else if (
    issueIdentifier &&
    originatingIssue !== String(issueIdentifier).toUpperCase()
  ) {
    errors.push(
      `originatingIssue must match ${String(issueIdentifier).toUpperCase()}`
    );
  }

  const reproduction = isRecord(evidence.reproduction)
    ? evidence.reproduction
    : {};
  if (!hasEvidenceRef(reproduction.evidenceRef)) {
    errors.push('reproduction.evidenceRef is required');
  }

  const repair = isRecord(evidence.productRepair) ? evidence.productRepair : {};
  if (!hasEvidenceRef(repair.fixRef)) {
    errors.push('productRepair.fixRef is required');
  }
  if (!hasEvidenceRef(repair.journeyRetestRef)) {
    errors.push('productRepair.journeyRetestRef is required');
  }
  const deployedBuild = isRecord(repair.deployedBuild)
    ? repair.deployedBuild
    : {};
  const deployedSha = String(deployedBuild.sha ?? '');
  if (!FULL_SHA.test(deployedSha)) {
    errors.push('productRepair.deployedBuild.sha must be a full commit SHA');
  } else if (
    expectedDeploymentSha &&
    deployedSha.toLowerCase() !== String(expectedDeploymentSha).toLowerCase()
  ) {
    errors.push(
      `productRepair.deployedBuild.sha must match ${expectedDeploymentSha}`
    );
  }
  if (!validHttpsUrl(deployedBuild.url)) {
    errors.push('productRepair.deployedBuild.url must be an HTTPS URL');
  }
  if (!hasEvidenceRef(deployedBuild.deploymentId)) {
    errors.push('productRepair.deployedBuild.deploymentId is required');
  }
  if (!hasEvidenceRef(deployedBuild.evidenceRef)) {
    errors.push('productRepair.deployedBuild.evidenceRef is required');
  }
  if (!validTimestamp(deployedBuild.verifiedAt)) {
    errors.push(
      'productRepair.deployedBuild.verifiedAt must be a non-future ISO timestamp'
    );
  }

  const detection = isRecord(evidence.detection) ? evidence.detection : {};
  if (
    /^JOV-\d+$/.test(originatingIssue) &&
    String(detection.originatingIssue ?? '').toUpperCase() !== originatingIssue
  ) {
    errors.push('detection.originatingIssue must link the originating defect');
  }
  if (!hasText(detection.gapAnalysis, 20)) {
    errors.push(
      'detection.gapAnalysis must explain why certification or dogfood missed the defect'
    );
  }
  const learningCompiler = isRecord(detection.learningCompiler)
    ? detection.learningCompiler
    : {};
  if (!LEARNING_COMPILER_ISSUES.includes(learningCompiler.issue)) {
    errors.push(
      `detection.learningCompiler.issue must be one of ${LEARNING_COMPILER_ISSUES.join(', ')}`
    );
  }
  if (!hasEvidenceRef(learningCompiler.outputRef)) {
    errors.push('detection.learningCompiler.outputRef is required');
  }
  const nonApplicability = isRecord(detection.nonApplicability)
    ? detection.nonApplicability
    : null;
  if (nonApplicability) {
    if (!hasText(nonApplicability.justification, 20)) {
      errors.push(
        'detection.nonApplicability.justification must be explicit and specific'
      );
    }
    if (!hasEvidenceRef(nonApplicability.evidenceRef)) {
      errors.push('detection.nonApplicability.evidenceRef is required');
    }
    if (!hasText(nonApplicability.approvedBy, 2)) {
      errors.push('detection.nonApplicability.approvedBy is required');
    }
    const independentVerification = isRecord(
      nonApplicability.independentVerification
    )
      ? nonApplicability.independentVerification
      : {};
    if (!hasText(independentVerification.verifiedBy, 2)) {
      errors.push(
        'detection.nonApplicability.independentVerification.verifiedBy is required'
      );
    } else if (
      hasText(nonApplicability.approvedBy, 2) &&
      independentVerification.verifiedBy.trim().toLowerCase() ===
        nonApplicability.approvedBy.trim().toLowerCase()
    ) {
      errors.push(
        'detection.nonApplicability independent verifier must differ from approvedBy'
      );
    }
    if (!hasEvidenceRef(independentVerification.evidenceRef)) {
      errors.push(
        'detection.nonApplicability.independentVerification.evidenceRef is required'
      );
    }
    if (!validTimestamp(independentVerification.verifiedAt)) {
      errors.push(
        'detection.nonApplicability.independentVerification.verifiedAt must be a non-future ISO timestamp'
      );
    }
  } else {
    if (!DETECTION_GAP_CLASSES.includes(detection.gapClass)) {
      errors.push(
        `detection.gapClass must be one of ${DETECTION_GAP_CLASSES.join(', ')}`
      );
    }
    if (!hasEvidenceRef(detection.detectorRef)) {
      errors.push('detection.detectorRef is required');
    }
    if (!hasText(detection.coveredClass, 10)) {
      errors.push(
        'detection.coveredClass must name the generalized defect class or covered surfaces'
      );
    }
    if (!hasEvidenceRef(detection.deliberateRedRef)) {
      errors.push(
        'detection.deliberateRedRef must replay the historical failure and prove it is rejected'
      );
    }
    const verification = isRecord(detection.verification)
      ? detection.verification
      : {};
    if (verification.status !== 'live-verified') {
      errors.push('detection.verification.status must be live-verified');
    }
    if (!hasEvidenceRef(verification.evidenceRef)) {
      errors.push('detection.verification.evidenceRef is required');
    }
    if (!validTimestamp(verification.verifiedAt)) {
      errors.push(
        'detection.verification.verifiedAt must be a non-future ISO timestamp'
      );
    }
  }

  const remediation = isRecord(evidence.remediation)
    ? evidence.remediation
    : {};
  if (!['not-automatic', 'automatic'].includes(remediation.mode)) {
    errors.push('remediation.mode must be not-automatic or automatic');
  }
  if (remediation.mode === 'automatic') {
    const budget = isRecord(remediation.budget) ? remediation.budget : {};
    if (
      !Number.isInteger(budget.maxAttempts) ||
      budget.maxAttempts < 1 ||
      budget.maxAttempts > MAX_AUTOMATIC_REMEDIATION_ATTEMPTS
    ) {
      errors.push(
        `remediation.budget.maxAttempts must be an integer from 1 to ${MAX_AUTOMATIC_REMEDIATION_ATTEMPTS}`
      );
    }
    if (!Number.isFinite(budget.wallClockMs) || budget.wallClockMs <= 0) {
      errors.push('remediation.budget.wallClockMs must be finite and positive');
    }
    if (!Number.isFinite(budget.maxSpendUsd) || budget.maxSpendUsd < 0) {
      errors.push(
        'remediation.budget.maxSpendUsd must be finite and non-negative'
      );
    }
    const exhaustion = isRecord(remediation.exhaustion)
      ? remediation.exhaustion
      : {};
    if (exhaustion.state !== 'blocked') {
      errors.push('remediation.exhaustion.state must be blocked');
    }
    if (!hasText(exhaustion.reason, 8)) {
      errors.push('remediation.exhaustion.reason is required');
    }
    if (!hasText(exhaustion.owner, 2)) {
      errors.push('remediation.exhaustion.owner is required');
    }
    if (!hasEvidenceRef(exhaustion.evidenceRef)) {
      errors.push('remediation.exhaustion.evidenceRef is required');
    }
    if (!hasText(exhaustion.nextAction, 8)) {
      errors.push('remediation.exhaustion.nextAction is required');
    }
  }
  return errors;
}

export function evaluateEscapedDefectClosure(
  issue,
  { expectedDeploymentSha = '' } = {}
) {
  if (!isEscapedDefect(issue)) {
    return { applicable: false, ok: true, errors: [], evidence: null };
  }
  const extracted = extractEscapedDefectClosureEvidence(issue);
  if (extracted.error) {
    return {
      applicable: true,
      ok: false,
      errors: [extracted.error],
      evidence: null,
    };
  }
  const errors = validateEscapedDefectClosureEvidence(extracted.evidence, {
    issueIdentifier: issue?.identifier,
    expectedDeploymentSha,
  });
  return {
    applicable: true,
    ok: errors.length === 0,
    errors,
    evidence: extracted.evidence,
  };
}
