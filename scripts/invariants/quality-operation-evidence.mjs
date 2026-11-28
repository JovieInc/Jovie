// Part of JOV-INV-027, not a capability registry or an execution framework.
// Evidence references are resolved by the existing independent evidence owner.
// This evaluator cannot promote delivery gates or certify product behavior.
import {
  isRecord,
  SAFE_GIT_SHA,
} from '../summer-commissioning/receipt-trust.mjs';

const hasText = value => typeof value === 'string' && value.trim().length > 0;

/** Existing measurement validation, kept unchanged when extracted. */
export function validateObserved(contract, dimension, observed, errors) {
  const label = `${contract?.id || '<unknown>'}.${dimension}`;
  for (const field of [
    'value',
    'percentile',
    'window',
    'sampleSize',
    'confidence',
  ]) {
    if (observed?.[field] === undefined) {
      errors.push(`${label}: observed missing ${field}`);
    }
  }
  if (typeof observed?.sampleSize !== 'number' || observed.sampleSize < 0) {
    errors.push(`${label}: observed.sampleSize must be a non-negative number`);
  }
  if (observed?.value === null && observed?.sampleSize !== 0) {
    errors.push(
      `${label}: an unmeasured value requires sampleSize 0 (uncalibrated seed)`
    );
  }
  if (typeof observed?.value === 'number' && observed?.sampleSize === 0) {
    errors.push(`${label}: a measured value requires a non-zero sampleSize`);
  }
}

function proofLevel(reference, expected, resolveEvidence, findings, evidence) {
  if (!hasText(reference) || typeof resolveEvidence !== 'function') return 0;
  let proof;
  try {
    proof = resolveEvidence(reference, expected);
  } catch {
    findings.push(`${expected.operationId}: evidence reader unavailable`);
    return 0;
  }
  if (
    !isRecord(proof) ||
    proof.reference !== reference ||
    proof.outcome !== 'passed' ||
    Object.entries(expected).some(([key, value]) => proof[key] !== value)
  )
    return 0;
  if (proof.kind === 'source') {
    evidence.push({ ...expected, reference, kind: proof.kind });
    return 1;
  }
  if (
    proof.kind === 'runtime' &&
    hasText(proof.environment) &&
    hasText(proof.deploymentId)
  ) {
    evidence.push({
      ...expected,
      reference,
      kind: proof.kind,
      environment: proof.environment,
      deploymentId: proof.deploymentId,
    });
    return 2;
  }
  return 0;
}

function completeRuntimeContext(requirements, evidence) {
  const contexts = new Map();
  for (const proof of evidence) {
    if (proof.kind !== 'runtime') continue;
    const key = JSON.stringify([proof.environment, proof.deploymentId]);
    const context = contexts.get(key) ?? {
      environment: proof.environment,
      deploymentId: proof.deploymentId,
      requirements: new Set(),
    };
    context.requirements.add(proof.requirement);
    contexts.set(key, context);
  }
  for (const context of contexts.values()) {
    if (
      [...requirements].every(required => context.requirements.has(required))
    ) {
      return {
        environment: context.environment,
        deploymentId: context.deploymentId,
      };
    }
  }
  return null;
}

function assessOperation(contract, operation, policy, resolveEvidence, seen) {
  const findings = [];
  const operationId = operation?.operationId;
  const label = `${contract.id}.${operationId || '<unknown>'}`;
  const classes = Array.isArray(operation?.classes) ? operation.classes : [];
  const requirements = new Set();
  if (!hasText(operationId)) findings.push(`${label}: operationId is required`);
  if (!hasText(operation?.surface) || operation.surface !== contract.surface) {
    findings.push(`${label}: surface must match the QualityContract`);
  }
  if (!SAFE_GIT_SHA.test(operation?.sourceRevision ?? '')) {
    findings.push(`${label}: exact sourceRevision is required`);
  }
  if (classes.length === 0)
    findings.push(`${label}: operation classes are required`);
  for (const kind of classes) {
    const required = Object.hasOwn(policy.requirementsByClass, kind)
      ? policy.requirementsByClass[kind]
      : null;
    if (
      !Array.isArray(required) ||
      required.length === 0 ||
      !required.every(hasText)
    ) {
      findings.push(`${label}: unknown operation class ${kind}`);
    } else for (const requirement of required) requirements.add(requirement);
  }
  if (
    classes.includes('external-effect') &&
    !classes.includes('durable-write')
  ) {
    findings.push(
      `${label}: external-effect also requires durable-write evidence`
    );
  }
  const identity = `${operation?.surface}:${operationId}`;
  if (seen.has(identity)) findings.push(`${label}: duplicate operation`);
  seen.add(identity);
  const structurallyValid = findings.length === 0;
  const missing = [];
  const evidence = [];
  let level = 2;
  for (const requirement of requirements) {
    const references = operation?.evidence?.[requirement];
    const expected = {
      contractId: contract.id,
      contractVersion: contract.version,
      operationId,
      surface: operation.surface,
      sourceRevision: operation.sourceRevision,
      requirement,
    };
    const verified = Array.isArray(references)
      ? references.reduce(
          (best, reference) =>
            Math.max(
              best,
              proofLevel(
                reference,
                expected,
                resolveEvidence,
                findings,
                evidence
              )
            ),
          0
        )
      : 0;
    if (verified === 0) missing.push(requirement);
    level = Math.min(level, verified);
  }
  if (missing.length)
    findings.push(
      `${label}: missing verified evidence for ${missing.join(', ')}`
    );
  let runtimeContext = null;
  if (structurallyValid && level === 2) {
    runtimeContext = completeRuntimeContext(requirements, evidence);
    if (!runtimeContext) {
      level = 1;
      findings.push(
        `${label}: runtime evidence must cover all requirements in one environment and deployment`
      );
    }
  }
  return {
    contractId: contract.id,
    operationId: operationId ?? null,
    surface: operation?.surface ?? null,
    sourceRevision: operation?.sourceRevision ?? null,
    requirements: [...requirements],
    evidenceLevel: structurallyValid
      ? ['unknown', 'source-proven', 'runtime-verified'][level]
      : 'unknown',
    runtimeContext,
    missing,
    evidence,
    findings,
  };
}

/**
 * Inspect optional QualityContract.operationEvidence; absence means unassessed.
 * resolveEvidence is a synchronous trusted-owner adapter, never contract data.
 * It returns independently checked source/runtime outcomes bound to `expected`.
 * Caller owns evidence authenticity, freshness and deployment/source matching.
 * Runtime qualification requires every requirement in one environment/deployment.
 * The default reads no network and cannot verify a reference by its presence.
 * @param {*} contractRegistry
 * @param {*} policy
 * @param {{ resolveEvidence?: (reference: string, expected: Record<string, unknown>) => unknown }} [options]
 */
export function evaluateOperationEvidence(
  contractRegistry,
  policy,
  { resolveEvidence } = {}
) {
  const contracts = Array.isArray(contractRegistry?.contracts)
    ? contractRegistry.contracts
    : [];
  const report = {
    mode: 'shadow',
    inventoryComplete: false,
    certifiesProduct: false,
    registeredContracts: contracts.length,
    unassessedContracts: [],
    operations: [],
    findings: [],
  };
  const policyValid =
    policy?.mode === 'shadow' && isRecord(policy?.requirementsByClass);
  if (!policyValid)
    report.findings.push(
      'operation evidence policy unavailable or not in shadow'
    );
  for (const contract of contracts) {
    const operations = contract?.operationEvidence;
    if (!policyValid || !Array.isArray(operations) || operations.length === 0) {
      report.unassessedContracts.push(contract?.id ?? '<unknown>');
      if (operations !== undefined && !Array.isArray(operations)) {
        report.findings.push(
          `${contract?.id}: operationEvidence must be an array`
        );
      }
      continue;
    }
    const seen = new Set();
    for (const operation of operations) {
      const assessed = assessOperation(
        contract,
        operation,
        policy,
        resolveEvidence,
        seen
      );
      report.operations.push(assessed);
      report.findings.push(...assessed.findings);
    }
  }
  return report;
}
