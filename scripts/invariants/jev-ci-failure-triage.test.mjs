import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CI_TRIAGE_ABSTAIN,
  CI_TRIAGE_CONFIDENCE_FLOOR,
  CI_TRIAGE_CRITERIA,
  CI_TRIAGE_SCHEMA,
  curateLogTail,
  interpretCiTriage,
  prepareCiTriageRequest,
  runCiFailureTriage,
} from './jev-ci-failure-triage.mjs';
import { JEV_ROUTE } from './jev-gateway.mjs';

const input = {
  sourceSha: 'a'.repeat(40),
  artifactSha256: 'b'.repeat(64),
  workflow: 'Source Validation',
  event: 'pull_request',
  job: 'Source Validation',
  step: 'Run deterministic source contract',
  log: [
    '2026-10-12T10:00:00.0000000Z \u001b[31m[scripts-typecheck] FAIL\u001b[0m',
    "error TS2339: Property 'release' does not exist on type 'GitHubClient'.",
    '##[error]Process completed with exit code 1.',
  ].join('\n'),
};

const transportResult = (choice, p) => ({
  answers: {
    route: {
      type: 'choice',
      choice,
      probabilities: { [choice]: p, [CI_TRIAGE_ABSTAIN]: 1 - p },
    },
  },
  response: { modelId: JEV_ROUTE.model },
  usage: { inputTokens: 300, outputTokens: 4 },
  warnings: [],
});

const admitted = transport => {
  const request = prepareCiTriageRequest(input);
  return {
    approval: {
      fingerprint: request.fingerprint,
      dataApproved: true,
      fundingApproved: true,
      expiresAt: 2000,
      authorityRef: 'test-only',
      availableUsd: 1,
      maxUsd: 0.01,
      estimatedUpperBoundUsd: 0.001,
    },
    readCurrentFingerprint: () => request.fingerprint,
    now: () => 1000,
    transport,
  };
};

test('curation strips timestamps, ANSI codes, secrets and personal data', () => {
  const text = curateLogTail(
    '2026-10-12T10:00:00.1Z \u001b[31mfail\u001b[0m\n\nBearer abc.def\nghp_abcdefghijklmnopqrstuvwx\nops@example.com\n'
  );
  assert.equal(
    text,
    'fail\nBearer [redacted]\n[redacted-token]\n[redacted-email]'
  );
  assert.throws(() => curateLogTail(null), /log text required/);
});

test('curation keeps only the bounded tail of a long log', () => {
  const tail = curateLogTail(`${'x'.repeat(20000)}\nLAST LINE`);
  assert.ok(Buffer.byteLength(tail) <= 12000);
  assert.ok(tail.endsWith('LAST LINE'));
});

test('request is one frozen choice question with an abstain label', () => {
  const request = prepareCiTriageRequest(input);
  assert.equal(request.schema, CI_TRIAGE_SCHEMA);
  assert.equal(request.stage, 'ci-failure-triage');
  assert.deepEqual(
    Object.keys(request.questions.route.criteria),
    Object.keys(CI_TRIAGE_CRITERIA)
  );
  assert.match(
    request.state,
    /^WORKFLOW: Source Validation\nEVENT: pull_request/
  );
  assert.doesNotMatch(request.state, /\u001b|2026-10-12T/);
  assert.throws(() => prepareCiTriageRequest({ ...input, job: ' ' }));
  assert.throws(() => prepareCiTriageRequest({ ...input, log: '\n\n' }));
});

test('confident in-allowlist answers map to a suggested next rung', () => {
  const { detail } = interpretCiTriage(transportResult('ci_infra', 0.97));
  assert.equal(detail.decision.failureClass, 'ci_infra');
  assert.equal(detail.decision.suggestedNext, 'rerun-or-ci-owner');
  assert.equal(detail.decision.abstained, false);
  assert.equal(detail.shadow, true);
});

test('low confidence, missing probabilities and insufficient all abstain', () => {
  for (const result of [
    transportResult('code_defect', CI_TRIAGE_CONFIDENCE_FLOOR - 0.01),
    transportResult(CI_TRIAGE_ABSTAIN, 0.99),
    {
      answers: { route: { type: 'choice', choice: 'pr_metadata' } },
    },
  ]) {
    const { detail } = interpretCiTriage(result);
    assert.equal(detail.decision.failureClass, null);
    assert.equal(detail.decision.suggestedNext, 'existing-ladder');
    assert.equal(detail.decision.abstained, true);
  }
});

test('labels outside the allowlist are invalid', () => {
  assert.deepEqual(interpretCiTriage(transportResult('merge_it', 0.99)), {
    invalid: true,
  });
  assert.deepEqual(interpretCiTriage(null), { invalid: true });
});

test('admitted run returns an evaluated shadow receipt; no admission, no call', async () => {
  const receipt = await runCiFailureTriage(
    input,
    admitted(async () => transportResult('code_defect', 1))
  );
  assert.equal(receipt.status, 'evaluated');
  assert.equal(receipt.decision.failureClass, 'code_defect');
  assert.equal(receipt.decision.suggestedNext, 'model-repair');
  assert.equal(receipt.certified, false);

  let called = false;
  const denied = await runCiFailureTriage(input, {
    ...admitted(async () => {
      called = true;
      return transportResult('code_defect', 1);
    }),
    approval: null,
  });
  assert.notEqual(denied.status, 'evaluated');
  assert.equal(called, false);
});
