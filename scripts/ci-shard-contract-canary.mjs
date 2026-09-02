#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

const SCHEMA = 'jovie-company-ci-shard/v1';
const hash = value =>
  `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const identity = {
  repository: 'JovieInc/Jovie',
  headSha: 'a'.repeat(40),
  baseSha: 'b'.repeat(40),
  mergeGroupSha: 'c'.repeat(40),
  runId: '123',
  attempt: 1,
  selectorHash: hash('selector-v1'),
  inventoryHash: hash(['a.test.ts', 'b.test.ts']),
  policyVersion: hash('policy-v1'),
  adapterVersion: hash('jovie-canary-v1'),
  environmentHash: hash('ubuntu-24.04'),
};
const receipt = ({
  index = 1,
  total = 2,
  state = 'passed',
  planned = ['a.test.ts'],
  executed = planned,
  outcome = {},
  identityOverride = {},
} = {}) => ({
  schema: SCHEMA,
  identity: { ...identity, ...identityOverride },
  shard: { index, total },
  inventory: { planned, executed },
  outcome: { state, ...outcome },
});
const deterministic = () =>
  receipt({
    state: 'deterministic_failure',
    executed: [],
    outcome: {
      failureClass: 'test_assertion',
      fingerprint: 'test_assertion:a:expected-true',
      logsUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123',
      artifactUrl:
        'https://github.com/JovieInc/Jovie/actions/runs/123/artifacts/1',
    },
  });
const transient = () =>
  receipt({
    state: 'transient_failure',
    executed: [],
    outcome: {
      failureClass: 'provider_capacity',
      fingerprint: 'provider_capacity:hosted-runner',
      logsUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123',
      artifactUrl:
        'https://github.com/JovieInc/Jovie/actions/runs/123/artifacts/2',
    },
  });
const plan = [
  { id: '1/2', selected: true, tests: ['a.test.ts'] },
  { id: '2/2', selected: true, tests: ['b.test.ts'] },
];
const passedReceipts = () => [
  receipt(),
  receipt({ index: 2, planned: ['b.test.ts'] }),
];

const fixtures = {
  missing_receipt: () => ({
    operation: 'aggregate',
    payload: { identity, plan, receipts: [receipt()] },
    expect: { status: 'indeterminate', green: false, evidenceComplete: false },
  }),
  canceled_as_green: () => ({
    operation: 'aggregate',
    payload: {
      identity,
      plan,
      receipts: [
        receipt(),
        receipt({
          index: 2,
          state: 'canceled_by_deterministic',
          planned: ['b.test.ts'],
          executed: [],
          outcome: {
            triggerFingerprint: 'test_assertion:missing-evidence',
            cancellationReason: 'sibling requested cancellation',
          },
        }),
      ],
    },
    expect: { status: 'indeterminate', green: false },
  }),
  infrastructure_not_product_red: () => ({
    operation: 'aggregate',
    payload: { identity, plan, receipts: [transient(), passedReceipts()[1]] },
    expect: {
      status: 'transient_blocked',
      green: false,
      evidenceComplete: true,
    },
  }),
  nondeterministic_duration_excluded: () => ({
    operation: 'timing',
    payload: {
      identity,
      receipt: transient(),
      options: { cleanSamplesForFingerprint: 8 },
    },
    expect: { eligible: false, reason: 'non_clean_or_insufficient_history' },
  }),
  cancellation_before_evidence: () => ({
    operation: 'shadow',
    payload: {
      identity,
      receipt: receipt({
        state: 'deterministic_failure',
        executed: [],
        outcome: {
          failureClass: 'test_assertion',
          fingerprint: 'test_assertion:a:expected-true',
        },
      }),
    },
    expect: { wouldCancel: false, reason: 'invalid_evidence' },
  }),
  stale_receipt: () => ({
    operation: 'shadow',
    payload: {
      identity,
      receipt: receipt({
        state: 'deterministic_failure',
        executed: [],
        identityOverride: { headSha: 'd'.repeat(40) },
        outcome: {
          failureClass: 'test_assertion',
          fingerprint: 'test_assertion:a:stale-head',
          logsUrl: 'https://github.com/JovieInc/Jovie/actions/runs/123',
          artifactUrl:
            'https://github.com/JovieInc/Jovie/actions/runs/123/artifacts/3',
        },
      }),
    },
    expect: { wouldCancel: false, reason: 'invalid_evidence' },
  }),
  deterministic_early_stop: () => ({
    operation: 'shadow',
    payload: { identity, receipt: deterministic() },
    expect: {
      wouldCancel: true,
      boundedRetry: 0,
      retainDiagnosticSiblings: 0,
      reason: 'validated_deterministic_fingerprint',
    },
  }),
  bounded_infrastructure_retry: () => ({
    operation: 'shadow',
    payload: { identity, receipt: transient() },
    expect: { wouldCancel: false, boundedRetry: 1 },
  }),
  diagnostic_quorum: () => ({
    operation: 'shadow',
    payload: {
      identity,
      receipt: deterministic(),
      options: { mode: 'diagnostic_quorum', diagnosticQuorum: 2 },
    },
    expect: { wouldCancel: true, retainDiagnosticSiblings: 2 },
  }),
  exact_aggregation: () => ({
    operation: 'aggregate',
    payload: { identity, plan, receipts: passedReceipts() },
    expect: { status: 'green', green: true, evidenceComplete: true },
  }),
  typed_not_selected: () => ({
    operation: 'aggregate',
    payload: {
      identity,
      plan: [{ id: '1/1', selected: false, tests: [] }],
      receipts: [
        receipt({
          total: 1,
          state: 'not_selected',
          planned: [],
          executed: [],
          outcome: {
            selectionReason: 'typed selector receipt: outside unit lane',
          },
        }),
      ],
    },
    expect: { status: 'green', green: true, evidenceComplete: true },
  }),
};

const fixtureName = process.argv[2];
if (!Object.hasOwn(fixtures, fixtureName)) {
  throw new Error(
    `unknown fixture ${JSON.stringify(fixtureName)}; expected one of ${Object.keys(fixtures).join(', ')}`
  );
}
const fixture = fixtures[fixtureName]();
const outputs = {
  operation: fixture.operation,
  payload: JSON.stringify(fixture.payload),
  expect: JSON.stringify(fixture.expect),
};
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n'
  );
} else {
  console.log(JSON.stringify(outputs));
}
