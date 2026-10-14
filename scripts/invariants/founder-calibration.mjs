#!/usr/bin/env node
/**
 * JOV-7199 / JOV-INV-034: certify the certification evaluator against
 * founder-labeled mobile artist-profile chat cases.
 *
 * The builder supplies candidate evidence only. This evaluator owns the
 * rubric, reads the protected corpus, refuses suppressed checks and
 * self-approval, and writes a source-bound `jovie.certification/v1` receipt.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FOUNDER_CALIBRATION_SCHEMA =
  'jovie.founder-calibration-receipt/v1';
export const FOUNDER_CALIBRATION_POLICY_SCHEMA =
  'jovie.founder-calibration-policy/v1';
export const MODEL_JUDGE_RESULTS_SCHEMA =
  'jovie.model-judge-calibration-results/v1';
export const CERTIFICATION_CONTRACT = 'jovie.certification/v1';
export const FOUNDER_CALIBRATION_INVARIANT = 'JOV-INV-034';
export const FOUNDER_CALIBRATION_CORPUS_PATH =
  'scripts/invariants/fixtures/founder-calibration-mobile-artist-chat.v1.json';
export const FOUNDER_CALIBRATION_POLICY_PATH =
  'scripts/invariants/founder-calibration-policy.json';
export const FOUNDER_CALIBRATION_RUBRIC_VERSION =
  'mobile-artist-profile-chat-rubric/2026-10-14.1';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FULL_SHA = /^[0-9a-f]{40}$/u;
const REQUIRED_FACT_GROUPS = [
  'answer',
  'composer',
  'deployment',
  'retry',
  'task',
];
const REQUIRED_SPLITS = ['adversarial', 'held_out', 'known_bad', 'known_good'];
const TERMINAL_TASK_STATES = new Set([
  'canceled',
  'completed',
  'failed',
  'failed_timeout',
]);

export const FOUNDER_CALIBRATION_RUBRIC = Object.freeze({
  version: FOUNDER_CALIBRATION_RUBRIC_VERSION,
  rules: Object.freeze([
    Object.freeze({
      id: 'composer-keyboard-viewport',
      reason: 'composer-keyboard-viewport-failure',
      releaseCheck: 'ci-fast:mobile-chat-viewport',
    }),
    Object.freeze({
      id: 'artist-answer-accuracy',
      reason: 'inaccurate-artist-answer',
      releaseCheck: 'ci-golden-eval-set:artist-grounding',
    }),
    Object.freeze({
      id: 'retry-idempotency',
      reason: 'duplicate-side-effect-after-retry',
      releaseCheck: 'ci-fast:chat-turn-idempotency',
    }),
    Object.freeze({
      id: 'task-terminal-state',
      reason: 'task-stuck-without-terminal-state',
      releaseCheck: 'ci-fast:mobile-chat-terminal-state',
    }),
    Object.freeze({
      id: 'deployment-provenance',
      reason: 'stale-or-wrong-deployment-evidence',
      releaseCheck: 'production-controller:verified-production-identity',
    }),
  ]),
  failClosed: Object.freeze({
    missingEvidence: Object.freeze({
      reason: 'required-evidence-missing',
      releaseCheck: 'ci-fast:founder-calibration-integrity',
    }),
    suppressedCheck: Object.freeze({
      reason: 'release-check-suppressed',
      releaseCheck: 'ci-fast:founder-calibration-integrity',
    }),
  }),
});

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function calibrationDigest(value) {
  return `sha256:${createHash('sha256').update(stable(value)).digest('hex')}`;
}

function policyDigest(policy) {
  const unsigned = structuredClone(policy);
  delete unsigned.policyDigest;
  return calibrationDigest(unsigned);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sameStrings(left, right) {
  return stable(uniqueSorted(left ?? [])) === stable(uniqueSorted(right ?? []));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(path, repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8'));
}

export function readFounderCalibrationCorpus(repoRoot = REPO_ROOT) {
  return readJson(FOUNDER_CALIBRATION_CORPUS_PATH, repoRoot);
}

export function readFounderCalibrationPolicy(repoRoot = REPO_ROOT) {
  return readJson(FOUNDER_CALIBRATION_POLICY_PATH, repoRoot);
}

function evaluateFacts(caseRecord) {
  const facts = isRecord(caseRecord?.facts) ? caseRecord.facts : {};
  const missing = REQUIRED_FACT_GROUPS.filter(group => !isRecord(facts[group]));
  if (missing.length > 0) {
    return {
      verdict: 'reject',
      reasons: [FOUNDER_CALIBRATION_RUBRIC.failClosed.missingEvidence.reason],
      releaseChecks: [
        FOUNDER_CALIBRATION_RUBRIC.failClosed.missingEvidence.releaseCheck,
      ],
    };
  }

  if ((caseRecord.suppressedReleaseChecks ?? []).length > 0) {
    return {
      verdict: 'reject',
      reasons: [FOUNDER_CALIBRATION_RUBRIC.failClosed.suppressedCheck.reason],
      releaseChecks: [
        FOUNDER_CALIBRATION_RUBRIC.failClosed.suppressedCheck.releaseCheck,
      ],
    };
  }

  const failures = [];
  const composer = facts.composer;
  if (
    composer.composerVisibleAboveKeyboard !== true ||
    composer.safeAreaApplied !== true ||
    composer.viewportAnchored !== true
  ) {
    failures.push(FOUNDER_CALIBRATION_RUBRIC.rules[0]);
  }

  const answer = facts.answer;
  if (answer.artistIdentityMatched !== true || answer.claimsGrounded !== true) {
    failures.push(FOUNDER_CALIBRATION_RUBRIC.rules[1]);
  }

  const retry = facts.retry;
  if (
    !Number.isInteger(retry.attempts) ||
    retry.attempts < 1 ||
    !Number.isInteger(retry.durableSideEffects) ||
    retry.durableSideEffects < 0 ||
    retry.durableSideEffects > 1
  ) {
    failures.push(FOUNDER_CALIBRATION_RUBRIC.rules[2]);
  }

  const task = facts.task;
  if (!TERMINAL_TASK_STATES.has(task.terminalState)) {
    failures.push(FOUNDER_CALIBRATION_RUBRIC.rules[3]);
  }

  const deployment = facts.deployment;
  if (
    deployment.evidenceFresh !== true ||
    !FULL_SHA.test(deployment.expectedSha ?? '') ||
    !FULL_SHA.test(deployment.observedSha ?? '') ||
    deployment.expectedSha !== deployment.observedSha
  ) {
    failures.push(FOUNDER_CALIBRATION_RUBRIC.rules[4]);
  }

  return {
    verdict: failures.length === 0 ? 'accept' : 'reject',
    reasons: uniqueSorted(failures.map(failure => failure.reason)),
    releaseChecks: uniqueSorted(failures.map(failure => failure.releaseCheck)),
  };
}

/** The verdict is derived only from observed facts, never from founder labels. */
export function evaluateFounderCalibrationCase(caseRecord) {
  const evaluation = evaluateFacts(caseRecord);
  const expectedVerdict = caseRecord?.founderVerdict;
  const expectedReasons = caseRecord?.expectedReasons ?? [];
  const expectedReleaseChecks = caseRecord?.expectedReleaseChecks ?? [];
  const mismatches = [];
  if (evaluation.verdict !== expectedVerdict) {
    mismatches.push(
      `verdict: expected ${String(expectedVerdict)}, got ${evaluation.verdict}`
    );
  }
  if (!sameStrings(evaluation.reasons, expectedReasons)) {
    mismatches.push(
      `reasons: expected ${uniqueSorted(expectedReasons).join(',') || '<none>'}, got ${evaluation.reasons.join(',') || '<none>'}`
    );
  }
  if (!sameStrings(evaluation.releaseChecks, expectedReleaseChecks)) {
    mismatches.push(
      `release-checks: expected ${uniqueSorted(expectedReleaseChecks).join(',') || '<none>'}, got ${evaluation.releaseChecks.join(',') || '<none>'}`
    );
  }
  return {
    caseId: caseRecord?.id ?? null,
    split: caseRecord?.split ?? null,
    founderVerdict: expectedVerdict ?? null,
    evaluatorVerdict: evaluation.verdict,
    reasons: evaluation.reasons,
    releaseChecks: evaluation.releaseChecks,
    truthStatus: mismatches.length === 0 ? 'passed' : 'failed',
    mismatches,
  };
}

/**
 * Tuning can see only explicitly tuning-eligible cases. Certification sees all
 * cases, including held-out/adversarial rows, but never leaks founder labels.
 */
export function buildModelJudgeCalibrationInputs(
  corpus,
  { purpose = 'certification' } = {}
) {
  if (!['certification', 'tuning'].includes(purpose)) {
    throw new Error(`unknown calibration purpose ${purpose}`);
  }
  return corpus.cases
    .filter(item => purpose === 'certification' || item.usedForTuning === true)
    .map(item => ({
      caseId: item.id,
      scenario: item.scenario,
      facts: structuredClone(item.facts),
      suppressedReleaseChecks: [...(item.suppressedReleaseChecks ?? [])],
    }));
}

function modelJudgeEvidence(caseRecord, judgeResult) {
  if (!judgeResult) {
    return {
      agreement: false,
      verdict: null,
      reasons: [],
      releaseChecks: [],
      mismatches: ['model judge result missing'],
    };
  }
  const reasons = uniqueSorted(judgeResult.reasons ?? []);
  const releaseChecks = uniqueSorted(judgeResult.releaseChecks ?? []);
  const mismatches = [];
  if (judgeResult.verdict !== caseRecord.founderVerdict) {
    mismatches.push(
      `judge-verdict: expected ${caseRecord.founderVerdict}, got ${String(judgeResult.verdict)}`
    );
  }
  if (!sameStrings(reasons, caseRecord.expectedReasons)) {
    mismatches.push('judge-reasons: founder reason mismatch');
  }
  if (!sameStrings(releaseChecks, caseRecord.expectedReleaseChecks)) {
    mismatches.push('judge-release-checks: expected check mismatch');
  }
  return {
    agreement: mismatches.length === 0,
    verdict: judgeResult.verdict ?? null,
    reasons,
    releaseChecks,
    mismatches,
  };
}

export function validateFounderCalibrationPolicy({
  corpus = readFounderCalibrationCorpus(),
  policy = readFounderCalibrationPolicy(),
  repoRoot = REPO_ROOT,
} = {}) {
  const errors = [];
  if (policy?.schema !== FOUNDER_CALIBRATION_POLICY_SCHEMA)
    errors.push(`policy schema must be ${FOUNDER_CALIBRATION_POLICY_SCHEMA}`);
  if (policy?.invariant !== FOUNDER_CALIBRATION_INVARIANT)
    errors.push(`policy invariant must be ${FOUNDER_CALIBRATION_INVARIANT}`);
  if (policy?.certificationContract !== CERTIFICATION_CONTRACT)
    errors.push(`certification contract must be ${CERTIFICATION_CONTRACT}`);
  if (policy?.corpusPath !== FOUNDER_CALIBRATION_CORPUS_PATH)
    errors.push('corpus path mismatch');
  if (policy?.corpusVersion !== corpus?.version)
    errors.push('corpus version mismatch');
  if (policy?.corpusDigest !== calibrationDigest(corpus))
    errors.push('corpus digest mismatch');
  if (policy?.rubricVersion !== FOUNDER_CALIBRATION_RUBRIC_VERSION)
    errors.push('rubric version mismatch');
  if (policy?.rubricDigest !== calibrationDigest(FOUNDER_CALIBRATION_RUBRIC))
    errors.push('rubric digest mismatch');
  if (policy?.policyDigest !== policyDigest(policy))
    errors.push('policy digest mismatch');
  if (
    policy?.authority?.builder !== 'candidate-evidence-only' ||
    policy?.authority?.evaluator !== 'independent-evaluator' ||
    policy?.authority?.label !== 'Founder' ||
    policy?.authority?.selfApproval !== 'forbidden'
  ) {
    errors.push('builder/evaluator/founder authority boundary mismatch');
  }
  if (
    policy?.heldOut?.usedForTuning !== false ||
    policy?.heldOut?.requiredInCertification !== true
  ) {
    errors.push(
      'held-out authority must exclude tuning and require certification'
    );
  }

  if (corpus?.schema !== 'jovie.founder-calibration-corpus/v1')
    errors.push('invalid corpus schema');
  if (corpus?.labelAuthority?.role !== 'Founder')
    errors.push('corpus label authority must be Founder');
  if (!Array.isArray(corpus?.cases) || corpus.cases.length === 0) {
    errors.push('calibration corpus must contain cases');
    return errors;
  }
  const ids = corpus.cases.map(item => item.id);
  if (stable(ids) !== stable([...ids].sort((a, b) => a.localeCompare(b))))
    errors.push('calibration cases must be sorted by id');
  if (new Set(ids).size !== ids.length)
    errors.push('calibration case ids must be unique');
  for (const split of REQUIRED_SPLITS) {
    if (!corpus.cases.some(item => item.split === split))
      errors.push(`calibration split missing: ${split}`);
  }
  const checkIds = (policy?.releaseChecks ?? []).map(item => item.id);
  if (
    stable(checkIds) !==
    stable([...checkIds].sort((a, b) => a.localeCompare(b)))
  ) {
    errors.push('release checks must be sorted by id');
  }
  const checksById = new Map(
    (policy?.releaseChecks ?? []).map(item => [item.id, item])
  );
  for (const check of policy?.releaseChecks ?? []) {
    const path = resolve(repoRoot, check.detector ?? '');
    if (!check.id || !check.gate || !check.consumer || !existsSync(path)) {
      errors.push(`invalid release check ${String(check.id)}`);
      continue;
    }
    if (
      typeof check.detectorNeedle !== 'string' ||
      !readFileSync(path, 'utf8').includes(check.detectorNeedle)
    ) {
      errors.push(`release check ${check.id} detector binding is missing`);
    }
  }

  const observedReasons = new Set();
  for (const caseRecord of corpus.cases) {
    if (!REQUIRED_SPLITS.includes(caseRecord.split))
      errors.push(`${caseRecord.id}: unknown split`);
    if (
      ['adversarial', 'held_out'].includes(caseRecord.split) &&
      caseRecord.usedForTuning !== false
    ) {
      errors.push(`${caseRecord.id}: protected split cannot tune the judge`);
    }
    if (!['accept', 'reject'].includes(caseRecord.founderVerdict))
      errors.push(`${caseRecord.id}: invalid founder verdict`);
    if ('judgeResult' in caseRecord || 'modelJudge' in caseRecord)
      errors.push(
        `${caseRecord.id}: judge output cannot live in the label corpus`
      );
    const evaluation = evaluateFounderCalibrationCase(caseRecord);
    if (evaluation.truthStatus !== 'passed')
      errors.push(`${caseRecord.id}: ${evaluation.mismatches.join('; ')}`);
    for (const reason of evaluation.reasons) observedReasons.add(reason);
    for (const releaseCheck of caseRecord.expectedReleaseChecks ?? []) {
      if (!checksById.has(releaseCheck))
        errors.push(`${caseRecord.id}: unknown release check ${releaseCheck}`);
    }
  }
  for (const reason of FOUNDER_CALIBRATION_RUBRIC.rules.map(
    rule => rule.reason
  )) {
    if (!observedReasons.has(reason))
      errors.push(
        `required founder-rejected failure is not represented: ${reason}`
      );
  }
  return errors;
}

/**
 * @param {object} [options]
 * @param {string} [options.builderId]
 * @param {any} [options.corpus]
 * @param {string} [options.evaluatedAt]
 * @param {string} [options.evaluatorId]
 * @param {any} [options.judgeResults]
 * @param {any} [options.policy]
 * @param {string} [options.sourceSha]
 */
export function evaluateFounderCalibration({
  builderId,
  corpus = readFounderCalibrationCorpus(),
  evaluatedAt = new Date().toISOString(),
  evaluatorId,
  judgeResults,
  policy = readFounderCalibrationPolicy(),
  sourceSha,
} = {}) {
  const policyErrors = validateFounderCalibrationPolicy({ corpus, policy });
  if (policyErrors.length > 0) {
    throw new Error(
      `founder calibration policy invalid: ${policyErrors.join('; ')}`
    );
  }
  if (!FULL_SHA.test(sourceSha ?? ''))
    throw new Error('sourceSha must be 40 hex');
  if (!builderId?.trim() || !evaluatorId?.trim())
    throw new Error('builderId and evaluatorId are required');
  if (judgeResults?.schema !== MODEL_JUDGE_RESULTS_SCHEMA)
    throw new Error(
      `judge results schema must be ${MODEL_JUDGE_RESULTS_SCHEMA}`
    );
  if (!judgeResults?.judge?.id || !judgeResults?.judge?.revision)
    throw new Error('judge id and revision are required');

  const authoritySeparated = builderId !== evaluatorId;
  const judgeByCase = new Map(
    (judgeResults.results ?? []).map(result => [result.caseId, result])
  );
  const cases = corpus.cases.map(caseRecord => {
    const truth = evaluateFounderCalibrationCase(caseRecord);
    const judge = modelJudgeEvidence(
      caseRecord,
      judgeByCase.get(caseRecord.id)
    );
    const calibrationStatus =
      truth.truthStatus === 'passed' && judge.agreement ? 'passed' : 'failed';
    return { ...truth, judge, calibrationStatus };
  });

  const blockers = [];
  if (!authoritySeparated) blockers.push('authority-self-approval');
  for (const item of cases) {
    if (item.calibrationStatus !== 'passed') {
      blockers.push(
        ...item.mismatches.map(reason => `${item.caseId}:${reason}`),
        ...item.judge.mismatches.map(reason => `${item.caseId}:${reason}`)
      );
    }
  }
  const passed = blockers.length === 0;
  const corpusDigest = calibrationDigest(corpus);
  const rubricDigest = calibrationDigest(FOUNDER_CALIBRATION_RUBRIC);
  const receipt = {
    schema: FOUNDER_CALIBRATION_SCHEMA,
    contract: CERTIFICATION_CONTRACT,
    subject: corpus.subject,
    source: {
      repository: 'JovieInc/Jovie',
      ref: sourceSha,
      sha: sourceSha,
      expectedSha: sourceSha,
      paths: [policy.corpusPath, FOUNDER_CALIBRATION_POLICY_PATH],
      digest: corpusDigest,
    },
    canonicalReferences: [
      {
        id: 'founder-calibration:tim-labels',
        tier: 'canonical_references',
        status: 'passed',
        sourceSha,
        ref: corpus.labelAuthority.ref,
        digest: corpusDigest,
        summary: `${corpus.cases.length} cases labeled by ${corpus.labelAuthority.actor}`,
      },
    ],
    evaluatedAt,
    calibration: {
      policyVersion: policy.version,
      policyDigest: policy.policyDigest,
      corpusVersion: corpus.version,
      corpusDigest,
      rubricVersion: FOUNDER_CALIBRATION_RUBRIC_VERSION,
      rubricDigest,
      heldOutCaseIds: corpus.cases
        .filter(item => item.split === 'held_out')
        .map(item => item.id),
    },
    authority: {
      builderId,
      evaluatorId,
      labelAuthority: corpus.labelAuthority,
      separated: authoritySeparated,
    },
    judgeEvidence: {
      id: judgeResults.judge.id,
      revision: judgeResults.judge.revision,
      digest: calibrationDigest(judgeResults),
      agreementCases: cases.filter(item => item.judge.agreement).length,
      totalCases: cases.length,
      authoritativeTruth: false,
    },
    cases,
    invariantEvaluation: cases.map(item => ({
      id: `founder-calibration:${item.caseId}`,
      tier: 'invariant_evaluation',
      status: item.calibrationStatus,
      sourceSha,
      ref: `${policy.corpusPath}#${item.caseId}`,
      digest: calibrationDigest(item),
      summary: `${item.evaluatorVerdict} for ${item.reasons.join(',') || 'no rejection reason'}; release checks ${item.releaseChecks.join(',') || 'none'}`,
    })),
    testsCoverage: [
      {
        id: 'founder-calibration:model-judge-agreement',
        tier: 'tests_coverage',
        status: passed ? 'passed' : 'failed',
        sourceSha,
        ref: `${FOUNDER_CALIBRATION_POLICY_PATH}#releaseChecks`,
        digest: calibrationDigest(judgeResults),
        summary: `${cases.filter(item => item.judge.agreement).length}/${cases.length} cases agree with founder labels, reasons, and release checks`,
      },
    ],
    visualProof: [],
    requiredVariants: [],
    itemMedia: [],
    result: passed ? 'passed' : 'rejected',
    promotion: {
      allowed: passed,
      gate: policy.certificationGate,
      consumer: policy.certificationConsumer,
      blockedBy: uniqueSorted(blockers),
    },
  };
  return { ...receipt, receiptDigest: calibrationDigest(receipt) };
}

export function writeFounderCalibrationReceipt(path, receipt) {
  const output = resolve(path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: 'wx',
  });
  return output;
}

function option(args, name) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a value`);
  return value;
}

function runCli(args) {
  if (args[0] !== 'certify') throw new Error('expected certify');
  const receipt = evaluateFounderCalibration({
    sourceSha: option(args, '--source-sha'),
    builderId: option(args, '--builder-id'),
    evaluatorId: option(args, '--evaluator-id'),
    judgeResults: JSON.parse(
      readFileSync(resolve(option(args, '--judge-results')), 'utf8')
    ),
  });
  const output = writeFounderCalibrationReceipt(option(args, '--out'), receipt);
  process.stdout.write(
    `${JSON.stringify({ output, result: receipt.result, receiptDigest: receipt.receiptDigest })}\n`
  );
  if (receipt.result !== 'passed') process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'founder calibration failed'}\n`
    );
    process.exitCode = 2;
  }
}
