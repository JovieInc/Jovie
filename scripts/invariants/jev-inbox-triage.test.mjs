import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JEV_ROUTE } from './jev-gateway.mjs';
import {
  buildInboxTriageState,
  classifyInboxEmail,
  decideInboxTriage,
  INBOX_CATEGORIES,
  INBOX_PRIORITIES,
  INBOX_TRIAGE_SCHEMA,
  INBOX_TRIAGE_STAGE,
  interpretInboxTriage,
  prepareInboxTriageRequest,
  UNCATEGORIZED_LABEL,
  validateInboxTriageThresholds,
} from './jev-inbox-triage.mjs';

const baseInput = {
  sourceSha: 'a'.repeat(40),
  artifactSha256: 'b'.repeat(64),
  scope: 'inbox-triage test',
  fromName: 'Talent Buyer',
  fromDomain: 'promoter.example',
  subject: 'Festival booking for April',
  bodyText: 'We would love to book you for our festival on April 18.',
  artistName: 'Eval Artist',
  artistGenres: ['indie'],
};

function approvalFor(request) {
  return {
    fingerprint: request.fingerprint,
    dataApproved: true,
    fundingApproved: true,
    expiresAt: 2000,
    authorityRef: 'test-only',
    availableUsd: 1,
    maxUsd: 0.01,
    estimatedUpperBoundUsd: 0.001,
  };
}

function transportResult(
  { category = 'booking', priority = 'high' } = {},
  extra = {}
) {
  return {
    answers: {
      category: {
        type: 'choice',
        choice: category,
        probabilities: { [category]: 0.8, [UNCATEGORIZED_LABEL]: 0.2 },
      },
      priority: {
        type: 'choice',
        choice: priority,
        probabilities: { [priority]: 0.8, [UNCATEGORIZED_LABEL]: 0.2 },
      },
    },
    response: { modelId: JEV_ROUTE.model, headers: { 'x-vercel-id': 'fx-1' } },
    usage: { inputTokens: 60, outputTokens: 8 },
    warnings: [],
    ...extra,
  };
}

test('request carries two bounded choice questions over the fixed enums', () => {
  const { request } = prepareInboxTriageRequest(baseInput);
  assert.equal(request.schema, INBOX_TRIAGE_SCHEMA);
  assert.equal(request.stage, INBOX_TRIAGE_STAGE);
  assert.deepEqual(
    Object.keys(request.questions.category.criteria).sort(),
    [...INBOX_CATEGORIES, UNCATEGORIZED_LABEL].sort()
  );
  assert.deepEqual(
    Object.keys(request.questions.priority.criteria).sort(),
    [...INBOX_PRIORITIES, UNCATEGORIZED_LABEL].sort()
  );
  assert.equal(request.questions.category.type, 'choice');
  assert.equal(request.questions.priority.type, 'choice');
  assert.ok(request.state.includes('<<<email'));
  assert.ok(request.state.includes('Festival booking for April'));
  const other = prepareInboxTriageRequest({
    ...baseInput,
    subject: 'Different subject',
  });
  assert.notEqual(other.request.fingerprint, request.fingerprint);
  assert.throws(() =>
    prepareInboxTriageRequest({ ...baseInput, subject: '', bodyText: '' })
  );
  assert.throws(() =>
    prepareInboxTriageRequest({ ...baseInput, sourceSha: 'main' })
  );
});

test('sender address never enters state and inline addresses are redacted', () => {
  const state = buildInboxTriageState({
    ...baseInput,
    fromName: 'Dana <dana>',
    fromDomain: 'promoter.example',
    subject: 'Reach me at artist@nowhere.test please',
    bodyText: 'Call me. My assistant is ops@nowhere.test. Booking for June.',
  });
  assert.ok(!state.includes('@nowhere.test'));
  assert.ok(state.includes('[email]'));
  const { request } = prepareInboxTriageRequest({
    ...baseInput,
    subject: 'Reach me at artist@nowhere.test please',
    bodyText: 'Call me. My assistant is ops@nowhere.test. Booking for June.',
  });
  assert.ok(!request.state.includes('@nowhere.test'));
});

test('empty email content never reaches the evaluator', async () => {
  let calls = 0;
  const options = {
    transport: async () => {
      calls += 1;
      return transportResult();
    },
  };
  for (const input of [
    { ...baseInput, subject: '', bodyText: '' },
    { ...baseInput, subject: '   ', bodyText: null },
    { ...baseInput, subject: null, bodyText: '   ' },
    { ...baseInput, sourceSha: 'not-a-sha' },
  ]) {
    const receipt = await classifyInboxEmail(
      /** @type {any} */ (input),
      options
    );
    assert.equal(receipt.status, 'skipped');
    assert.equal(receipt.evaluatorCalls, 0);
    assert.equal(receipt.decision.category, null);
    assert.equal(receipt.decision.abstained, true);
  }
  assert.equal(calls, 0);
});

test('labels outside the enums invalidate instead of producing unroutable output', async () => {
  const { request } = prepareInboxTriageRequest(baseInput);
  const options = {
    approval: approvalFor(request),
    readCurrentFingerprint: () => request.fingerprint,
    now: () => 1000,
  };
  for (const result of [
    transportResult({ category: 'made-up' }),
    transportResult({ priority: 'critical' }),
    { ...transportResult(), warnings: [{}] },
    { ...transportResult(), response: { modelId: 'other/model' } },
    {
      answers: {
        category: { type: 'boolean', choice: 'booking' },
        priority: { type: 'choice', choice: 'high' },
      },
      response: { modelId: JEV_ROUTE.model },
      warnings: [],
    },
    null,
  ]) {
    const receipt = await classifyInboxEmail(baseInput, {
      ...options,
      transport: async () => result,
    });
    assert.equal(receipt.status, 'invalid-response');
    assert.equal(receipt.certified, false);
    assert.equal(receipt.decision, undefined);
  }
});

test('evaluated decisions carry concentration and never certification', async () => {
  const { request } = prepareInboxTriageRequest(baseInput);
  const receipt = await classifyInboxEmail(baseInput, {
    approval: approvalFor(request),
    readCurrentFingerprint: () => request.fingerprint,
    now: () => 1000,
    transport: async () => transportResult(),
  });
  assert.equal(receipt.status, 'evaluated');
  assert.equal(receipt.schema, INBOX_TRIAGE_SCHEMA);
  assert.equal(receipt.evaluatorCalls, 1);
  assert.equal(receipt.decision.category, 'booking');
  assert.equal(receipt.decision.priority, 'high');
  assert.equal(receipt.decision.abstained, false);
  assert.equal(receipt.decision.categoryConcentration, 0.8);
  assert.equal(receipt.certified, false);
  assert.equal(receipt.humanCertified, false);
  assert.equal(receipt.billedCostUsd, null);

  const abstain = await classifyInboxEmail(baseInput, {
    approval: approvalFor(request),
    readCurrentFingerprint: () => request.fingerprint,
    now: () => 1000,
    transport: async () =>
      transportResult({
        category: UNCATEGORIZED_LABEL,
        priority: UNCATEGORIZED_LABEL,
      }),
  });
  assert.equal(abstain.decision.abstained, true);
  assert.equal(abstain.decision.category, null);
  assert.equal(abstain.decision.priority, null);
});

test('interpreter treats malformed probability payloads as unavailable', () => {
  const result = transportResult(
    { category: 'press', priority: 'low' },
    {
      answers: {
        category: {
          type: 'choice',
          choice: 'press',
          probabilities: 'nope',
        },
        priority: {
          type: 'choice',
          choice: 'low',
          probabilities: { low: 'high' },
        },
      },
    }
  );
  const read = interpretInboxTriage(result);
  assert.equal(read.invalid, undefined);
  assert.equal(read.detail.decision.categoryConcentration, null);
  assert.equal(read.detail.decision.priorityConcentration, null);
  assert.equal(read.detail.decision.category, 'press');
  assert.equal(read.detail.decision.priority, 'low');
});

test('timeout, cancellation and admission failures stay fail-closed', async () => {
  const { request } = prepareInboxTriageRequest(baseInput);
  const options = {
    approval: approvalFor(request),
    readCurrentFingerprint: () => request.fingerprint,
    now: () => 1000,
  };
  let calls = 0;
  const unadmitted = await classifyInboxEmail(baseInput, {
    ...options,
    approval: null,
    transport: async () => {
      calls += 1;
      return transportResult();
    },
  });
  assert.equal(unadmitted.status, 'not-admitted');
  assert.equal(calls, 0);
  const pre = new AbortController();
  pre.abort();
  assert.equal(
    (await classifyInboxEmail(baseInput, { ...options, signal: pre.signal }))
      .status,
    'cancelled'
  );
  assert.equal(
    (
      await classifyInboxEmail(baseInput, {
        ...options,
        timeoutMs: 5,
        transport: () => new Promise(() => {}),
      })
    ).status,
    'timeout'
  );
  assert.equal(
    (
      await classifyInboxEmail(baseInput, {
        ...options,
        transport: async () => {
          throw new Error('Bearer raw-provider-error');
        },
      })
    ).status,
    'provider-error'
  );
  assert.ok(
    !JSON.stringify(
      await classifyInboxEmail(baseInput, {
        ...options,
        transport: async () => {
          throw new Error('raw-secret-marker');
        },
      })
    ).includes('raw-secret-marker')
  );
  for (const receipt of [
    unadmitted,
    { status: 'timeout' },
    { status: 'skipped', decision: {} },
  ]) {
    const action = decideInboxTriage(
      receipt,
      validateInboxTriageThresholds({ suggest: 0.55, review: 0.35 })
    );
    assert.equal(action.action, 'abstain');
    assert.equal(action.category, null);
  }
});

test('concentration thresholds reject legacy cutoffs and gate actions', () => {
  for (const bad of [
    null,
    {},
    { suggest: 0.7, review: 0.3 },
    { suggest: 0.9, review: 0.6 },
    { suggest: 0.5, review: 0.7 },
    { suggest: 0.4, review: 0.4 },
    { suggest: 1.2, review: 0.2 },
    { suggest: '0.8', review: 0.3 },
  ]) {
    assert.throws(() =>
      validateInboxTriageThresholds(/** @type {any} */ (bad))
    );
  }
  const thresholds = validateInboxTriageThresholds({
    suggest: 0.55,
    review: 0.35,
  });
  const evaluated = decision =>
    Object.freeze({
      status: 'evaluated',
      decision: Object.freeze({ abstained: false, ...decision }),
    });
  assert.equal(
    decideInboxTriage(
      evaluated({
        category: 'booking',
        categoryConcentration: 0.9,
        priority: 'high',
      }),
      thresholds
    ).action,
    'suggest'
  );
  assert.equal(
    decideInboxTriage(
      evaluated({
        category: 'booking',
        categoryConcentration: 0.4,
        priority: 'high',
      }),
      thresholds
    ).action,
    'review'
  );
  assert.equal(
    decideInboxTriage(
      evaluated({
        category: 'booking',
        categoryConcentration: 0.1,
        priority: 'high',
      }),
      thresholds
    ).action,
    'abstain'
  );
  assert.equal(
    decideInboxTriage(
      evaluated({
        category: 'booking',
        categoryConcentration: null,
        priority: 'high',
      }),
      thresholds
    ).action,
    'review'
  );
  assert.equal(
    decideInboxTriage(
      evaluated({
        category: null,
        priority: null,
        abstained: true,
        categoryConcentration: null,
      }),
      thresholds
    ).action,
    'abstain'
  );
  for (const receipt of [
    null,
    { status: 'timeout' },
    { status: 'skipped', decision: {} },
  ]) {
    assert.equal(decideInboxTriage(receipt, thresholds).action, 'abstain');
  }
});
