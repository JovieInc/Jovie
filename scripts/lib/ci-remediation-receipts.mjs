import {
  SONAR_CHECK_APP_SLUG,
  SONAR_CHECK_NAME,
} from './sonar-check-selection.mjs';
export const REMEDIATION_RECEIPT_SCHEMA = 'jovie-remediation-receipt/v1';
export const VISUAL_CONFIGURATION_FINGERPRINT =
  'ci-config:pr-visual-review-backends';
export const QUALITY_DEBT_ATTEMPT_BUDGET = 3;
const VISUAL_FORBIDDEN_ACTIONS =
  'invent_credentials|provision_credentials_without_authority|expose_credentials|rotate_credentials_without_authority|weaken_visual_review_signal'.split(
    '|'
  );
const QUALITY_FORBIDDEN_ACTIONS =
  'lower_quality_threshold|mark_quality_gate_non_blocking_by_mutation|generic_hold|bypass_required_ci'.split(
    '|'
  );
const BLOCKING_GATES =
  'correctness|security|migrations|required_runtime_proof'.split('|');
const ESCALATION_TRIGGERS =
  'recurrence_after_repair|attempt_budget_exhausted|delivery_risk_detected|product_or_safety_decision_required'.split(
    '|'
  );
function sourceReceipt({ repository, runId, runUrl, prNumber, headSha }) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(String(repository ?? '')))
    throw new Error('repository must be owner/name');
  if (!/^[0-9a-f]{40}$/i.test(String(headSha ?? '')))
    throw new Error('headSha must be a 40-character SHA');
  if (!Number.isInteger(prNumber) || prNumber <= 0)
    throw new Error('prNumber must be a positive integer');
  if (!/^\d+$/.test(String(runId ?? '')))
    throw new Error('runId must be numeric');
  return {
    repository,
    workflowRunId: String(runId),
    workflowRunUrl: runUrl,
    prNumber,
    headSha,
  };
}
export function buildVisualConfigurationIncident(input) {
  const errors = [...new Set(input.configurationErrors ?? [])].filter(error =>
    /^backend_unconfigured:/.test(String(error))
  );
  if (!errors.length)
    throw new Error(
      'visual configuration incident requires configuration errors'
    );
  return {
    schema: REMEDIATION_RECEIPT_SCHEMA,
    fingerprint: VISUAL_CONFIGURATION_FINGERPRINT,
    type: 'configuration_incident',
    status: 'owned_escalation_required',
    severity: 'immediate',
    source: sourceReceipt(input),
    signal: {
      system: 'pr-visual-review',
      configurationErrors: errors,
      productFindingsRemainAdvisory: true,
    },
    ownership: { owner: 'Gem', verifier: 'Summer', lane: 'ci-configuration' },
    authorization: {
      humanApprovalRequired: true,
      authority: 'authorized_repository_configuration_owner',
    },
    remediation: {
      mode: 'authorized_configuration_change',
      requiredAction:
        'An authorized repository configuration owner must restore every backend named in the configuration errors and re-run the exact PR head.',
      forbiddenActions: [...VISUAL_FORBIDDEN_ACTIONS],
    },
    escalation: {
      required: true,
      target: 'Summer',
      trigger: 'immediate_configuration_incident',
    },
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
}
export function qualityDebtFingerprint({ repository, prNumber }) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(String(repository ?? '')))
    throw new Error('repository must be owner/name');
  if (!Number.isInteger(prNumber) || prNumber <= 0)
    throw new Error('prNumber must be a positive integer');
  return `quality-debt:sonar:${repository}:pr-${prNumber}`;
}
function expectedSonarUrl(detailsUrl, prNumber) {
  try {
    const url = new URL(detailsUrl);
    return (
      url.origin === 'https://sonarcloud.io' &&
      url.searchParams.get('pullRequest') === String(prNumber)
    );
  } catch {
    return false;
  }
}
export function buildSonarQualityDebtReceipt(input) {
  if (
    input.checkName !== SONAR_CHECK_NAME ||
    input.checkConclusion !== 'failure' ||
    input.checkAppSlug !== SONAR_CHECK_APP_SLUG ||
    !expectedSonarUrl(input.detailsUrl, input.prNumber)
  )
    throw new Error('quality debt receipt requires a failing SonarCloud check');
  const { openAgentPrs, maxOpenAgentPrs, candidateRank } = input.capacity ?? {};
  if (
    !Number.isInteger(openAgentPrs) ||
    openAgentPrs < 0 ||
    !Number.isInteger(maxOpenAgentPrs) ||
    maxOpenAgentPrs <= 0 ||
    !Number.isInteger(candidateRank) ||
    candidateRank <= 0
  )
    throw new Error('quality debt receipt requires valid capacity evidence');
  const availableSlots = Math.max(0, maxOpenAgentPrs - openAgentPrs);
  const available = candidateRank <= availableSlots;
  return {
    schema: REMEDIATION_RECEIPT_SCHEMA,
    fingerprint: qualityDebtFingerprint(input),
    type: 'quality_debt',
    status: available
      ? 'owned_eligible_when_admitted'
      : 'owned_capacity_deferred',
    severity: 'low',
    source: sourceReceipt(input),
    signal: {
      system: 'sonarcloud',
      checkName: input.checkName,
      conclusion: input.checkConclusion,
      checkAppSlug: input.checkAppSlug,
      detailsUrl: input.detailsUrl,
      qualityThresholdPreserved: true,
    },
    delivery: {
      blocksSafeShipment: false,
      blockingGatesUnchanged: [...BLOCKING_GATES],
    },
    ownership: {
      owner: 'Symphony',
      verifier: 'Gem',
      lane: 'linear-intake-controller',
    },
    authorization: {
      humanApprovalRequired: false,
      authority: 'bounded_source_repair_policy',
    },
    capacity: {
      openAgentPrs,
      maxOpenAgentPrs,
      availableSlots,
      candidateRank,
      state: available ? 'available' : 'deferred',
      admissionAuthority: 'jovie-intake-controller',
    },
    remediation: {
      mode: 'bounded_exact_head_source_repair',
      priority: 'idle_capacity',
      attemptBudget: QUALITY_DEBT_ATTEMPT_BUDGET,
      targetHeadSha: input.headSha,
      requiredRevalidation:
        'SonarCloud Code Analysis on the repaired exact head',
      forbiddenActions: [...QUALITY_FORBIDDEN_ACTIONS],
    },
    escalation: {
      required: false,
      triggers: [...ESCALATION_TRIGGERS],
    },
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
}
