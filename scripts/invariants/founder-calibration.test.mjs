import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  buildModelJudgeCalibrationInputs,
  CERTIFICATION_CONTRACT,
  calibrationDigest,
  evaluateFounderCalibration,
  evaluateFounderCalibrationCase,
  FOUNDER_CALIBRATION_RUBRIC,
  MODEL_JUDGE_RESULTS_SCHEMA,
  readFounderCalibrationCorpus,
  readFounderCalibrationPolicy,
  validateFounderCalibrationPolicy,
  writeFounderCalibrationReceipt,
} from './founder-calibration.mjs';

const SHA = 'e'.repeat(40);
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function clone(value) {
  return structuredClone(value);
}

function resignPolicy(policy) {
  const unsigned = clone(policy);
  delete unsigned.policyDigest;
  policy.policyDigest = calibrationDigest(unsigned);
}

function agreeingJudgeResults(corpus) {
  return {
    schema: MODEL_JUDGE_RESULTS_SCHEMA,
    judge: { id: 'model-judge', revision: 'fixture-contract-v1' },
    results: corpus.cases.map(item => ({
      caseId: item.id,
      verdict: item.founderVerdict,
      reasons: item.expectedReasons,
      releaseChecks: item.expectedReleaseChecks,
    })),
  };
}

function certify(overrides = {}) {
  const corpus = overrides.corpus ?? readFounderCalibrationCorpus();
  return evaluateFounderCalibration({
    builderId: 'builder:symphony',
    corpus,
    evaluatedAt: '2026-10-14T08:00:00.000Z',
    evaluatorId: 'evaluator:summer',
    judgeResults: agreeingJudgeResults(corpus),
    policy: overrides.policy ?? readFounderCalibrationPolicy(),
    sourceSha: SHA,
    ...overrides,
  });
}

describe('founder calibration (JOV-7199 / JOV-INV-034)', () => {
  it('validates the versioned protected corpus, rubric, checks, and digests', () => {
    const corpus = readFounderCalibrationCorpus();
    const policy = readFounderCalibrationPolicy();

    assert.deepEqual(validateFounderCalibrationPolicy({ corpus, policy }), []);
    assert.equal(policy.corpusDigest, calibrationDigest(corpus));
    assert.equal(
      policy.rubricDigest,
      calibrationDigest(FOUNDER_CALIBRATION_RUBRIC)
    );
  });

  it('accepts known-good cases and rejects known-bad cases for the exact reason and release check', () => {
    const corpus = readFounderCalibrationCorpus();
    const knownGood = corpus.cases.filter(item => item.split === 'known_good');
    const knownBad = corpus.cases.filter(item => item.split === 'known_bad');

    assert.ok(knownGood.length >= 2);
    assert.ok(knownBad.length >= 5);
    for (const item of knownGood) {
      const result = evaluateFounderCalibrationCase(item);
      assert.equal(result.truthStatus, 'passed', item.id);
      assert.equal(result.evaluatorVerdict, 'accept', item.id);
      assert.deepEqual(result.reasons, [], item.id);
      assert.deepEqual(result.releaseChecks, [], item.id);
    }
    for (const item of knownBad) {
      const result = evaluateFounderCalibrationCase(item);
      assert.equal(result.truthStatus, 'passed', item.id);
      assert.equal(result.evaluatorVerdict, 'reject', item.id);
      assert.deepEqual(result.reasons, item.expectedReasons, item.id);
      assert.deepEqual(
        result.releaseChecks,
        item.expectedReleaseChecks,
        item.id
      );
    }
  });

  it('runs adversarial and held-out cases in certification but never exposes them to tuning', () => {
    const corpus = readFounderCalibrationCorpus();
    const tuning = buildModelJudgeCalibrationInputs(corpus, {
      purpose: 'tuning',
    });
    const certification = buildModelJudgeCalibrationInputs(corpus);
    const protectedIds = corpus.cases
      .filter(item => ['adversarial', 'held_out'].includes(item.split))
      .map(item => item.id);

    assert.ok(protectedIds.length >= 6);
    assert.equal(certification.length, corpus.cases.length);
    assert.deepEqual(
      tuning.map(item => item.caseId),
      corpus.cases.filter(item => item.usedForTuning).map(item => item.id)
    );
    for (const id of protectedIds) {
      assert.ok(!tuning.some(item => item.caseId === id));
      assert.ok(certification.some(item => item.caseId === id));
    }
    for (const input of certification) {
      assert.ok(!('founderVerdict' in input));
      assert.ok(!('expectedReasons' in input));
      assert.ok(!('expectedReleaseChecks' in input));
    }
  });

  it('writes exact source-bound receipts into jovie.certification/v1', () => {
    const receipt = certify();
    const directory = mkdtempSync(join(tmpdir(), 'founder-calibration-'));
    directories.push(directory);
    const path = writeFounderCalibrationReceipt(
      join(directory, 'receipt.json'),
      receipt
    );
    const stored = JSON.parse(readFileSync(path, 'utf8'));

    assert.equal(stored.contract, CERTIFICATION_CONTRACT);
    assert.equal(stored.result, 'passed');
    assert.equal(stored.promotion.allowed, true);
    assert.equal(stored.source.ref, SHA);
    assert.equal(stored.source.sha, SHA);
    assert.equal(stored.source.expectedSha, SHA);
    assert.match(stored.receiptDigest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(stored.canonicalReferences[0].tier, 'canonical_references');
    assert.equal(stored.invariantEvaluation.length, stored.cases.length);
    assert.ok(
      stored.invariantEvaluation.every(
        item =>
          item.tier === 'invariant_evaluation' &&
          item.status === 'passed' &&
          item.sourceSha === SHA
      )
    );
    assert.equal(stored.testsCoverage[0].tier, 'tests_coverage');
    assert.equal(stored.testsCoverage[0].status, 'passed');
    assert.deepEqual(stored.visualProof, []);
    assert.deepEqual(stored.requiredVariants, []);
    assert.deepEqual(stored.itemMedia, []);
  });

  it('rejects a lenient judge and a judge that names the wrong reason or release check', () => {
    const corpus = readFounderCalibrationCorpus();
    const lenient = agreeingJudgeResults(corpus);
    const badViewport = lenient.results.find(item => item.caseId === 'apc-003');
    badViewport.verdict = 'accept';
    badViewport.reasons = [];
    badViewport.releaseChecks = [];

    const lenientReceipt = certify({ corpus, judgeResults: lenient });
    assert.equal(lenientReceipt.result, 'rejected');
    assert.equal(lenientReceipt.promotion.allowed, false);
    assert.ok(
      lenientReceipt.promotion.blockedBy.some(item =>
        item.includes('apc-003:judge-verdict')
      )
    );

    const wrongReason = agreeingJudgeResults(corpus);
    const inaccurate = wrongReason.results.find(
      item => item.caseId === 'apc-004'
    );
    inaccurate.reasons = ['composer-keyboard-viewport-failure'];
    inaccurate.releaseChecks = ['ci-fast:mobile-chat-viewport'];
    const wrongReasonReceipt = certify({ corpus, judgeResults: wrongReason });
    assert.equal(wrongReasonReceipt.result, 'rejected');
    assert.ok(
      wrongReasonReceipt.promotion.blockedBy.some(item =>
        item.includes('judge-reasons')
      )
    );
    assert.ok(
      wrongReasonReceipt.promotion.blockedBy.some(item =>
        item.includes('judge-release-checks')
      )
    );
  });

  it('treats judge agreement as evidence, never self-proving truth', () => {
    const receipt = certify({ evaluatorId: 'builder:symphony' });
    assert.equal(receipt.judgeEvidence.agreementCases, receipt.cases.length);
    assert.equal(receipt.judgeEvidence.authoritativeTruth, false);
    assert.ok(receipt.cases.every(item => item.judge.agreement));
    assert.equal(receipt.result, 'rejected');
    assert.equal(receipt.promotion.allowed, false);
    assert.ok(receipt.promotion.blockedBy.includes('authority-self-approval'));
  });

  it('rejects missing evidence, suppressed checks, and builder self-approval', () => {
    const corpus = readFounderCalibrationCorpus();
    const missing = evaluateFounderCalibrationCase(
      corpus.cases.find(item => item.id === 'apc-009')
    );
    const suppressed = evaluateFounderCalibrationCase(
      corpus.cases.find(item => item.id === 'apc-010')
    );
    assert.deepEqual(missing.reasons, ['required-evidence-missing']);
    assert.deepEqual(suppressed.reasons, ['release-check-suppressed']);

    const receipt = certify({ evaluatorId: 'builder:symphony' });
    assert.equal(receipt.authority.separated, false);
    assert.equal(receipt.result, 'rejected');
    assert.ok(receipt.promotion.blockedBy.includes('authority-self-approval'));
  });

  it('invalidates silent corpus, rubric, policy, and detector-baseline changes', () => {
    const corpus = clone(readFounderCalibrationCorpus());
    const policy = clone(readFounderCalibrationPolicy());
    corpus.cases[0].founderVerdict = 'reject';
    assert.ok(
      validateFounderCalibrationPolicy({ corpus, policy }).includes(
        'corpus digest mismatch'
      )
    );

    const changedRubricPolicy = clone(policy);
    changedRubricPolicy.rubricDigest = `sha256:${'0'.repeat(64)}`;
    resignPolicy(changedRubricPolicy);
    assert.ok(
      validateFounderCalibrationPolicy({
        corpus: readFounderCalibrationCorpus(),
        policy: changedRubricPolicy,
      }).includes('rubric digest mismatch')
    );

    const changedDetector = clone(policy);
    changedDetector.releaseChecks[0].detectorNeedle = 'silently replaced';
    resignPolicy(changedDetector);
    assert.ok(
      validateFounderCalibrationPolicy({
        corpus: readFounderCalibrationCorpus(),
        policy: changedDetector,
      }).some(item => item.includes('detector binding is missing'))
    );
  });
});
