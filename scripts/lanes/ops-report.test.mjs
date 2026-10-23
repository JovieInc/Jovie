import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JEV_ROUTE } from '../invariants/jev-gateway.mjs';
import {
  prepareWritingQualityRequest,
  WRITING_QUALITY_SCHEMA,
} from '../invariants/jev-writing-quality.mjs';
import {
  buildOpsReport,
  deliverOpsReport,
  MAX_EVIDENCE_AGE_MS,
  NOT_APPLICABLE,
  OPS_REPORT_REVIEW_SCHEMA,
  OPS_REPORT_SCHEMA,
  PROOF_TIERS,
  prepareOpsReportDelivery,
  UNKNOWN,
  verifyOpsReportDelivery,
} from './ops-report.mjs';

const NOW = Date.parse('2026-10-12T08:00:00.000Z');
const OBSERVED_AT = '2026-10-12T07:59:30.000Z';

const tier = (status = UNKNOWN, receipt = UNKNOWN) => ({
  status,
  observedAt: OBSERVED_AT,
  source: 'synthetic doctor fixture',
  receipt,
});

const baseInput = (overrides = {}) => ({
  domain: 'company',
  producer: 'Symphony',
  currentOwner: 'symphony-lanes-doctor',
  observedState: 'provider capacity is idle while qualified work exists',
  blocker: '0 of 3 workers are active',
  rootCause: null,
  nextAction: 'dispatch provider workers and verify a fenced receipt',
  evidence: {
    observedAt: OBSERVED_AT,
    source: 'scripts/lanes/doctor.py',
  },
  sourceSha: 'a'.repeat(40),
  proofTiers: {
    source: tier('PROVEN', 'a'.repeat(40)),
    tests: tier(),
    ciQueue: tier(),
    merge: tier(),
    deployment: tier(),
    authenticatedRuntime: tier(),
    recurrence: tier(NOT_APPLICABLE, NOT_APPLICABLE),
  },
  destination: {
    adapter: 'linear-issue',
    target: 'Symphony doctor: provider-idle:codex (gem)',
  },
  ...overrides,
});

const cleanReceipt = (input, extra = {}) => ({
  schema: WRITING_QUALITY_SCHEMA,
  status: 'evaluated',
  requestFingerprint: prepareWritingQualityRequest(input).fingerprint,
  findings: [],
  unreviewed: [],
  resolvedModel: JEV_ROUTE.model,
  completedAt: NOW,
  ...extra,
});

test('inventory-owned company report keeps all proof tiers distinct', () => {
  const report = buildOpsReport(baseInput(), { now: () => NOW });
  assert.equal(report.schema, OPS_REPORT_SCHEMA);
  assert.equal(report.domain, 'company');
  assert.equal(report.repository, 'JovieInc/Jovie');
  assert.equal(report.surfaceOwner, 'Summer');
  assert.equal(report.currentOwner, 'symphony-lanes-doctor');
  assert.deepEqual(Object.keys(report.proofTiers), PROOF_TIERS);
  assert.equal(report.proofTiers.tests.status, UNKNOWN);
  assert.equal(report.proofTiers.ciQueue.status, UNKNOWN);
  assert.equal(report.proofTiers.merge.status, UNKNOWN);
  assert.equal(report.proofTiers.deployment.status, UNKNOWN);
  assert.equal(report.proofTiers.authenticatedRuntime.status, UNKNOWN);
});

test('consumer-domain or alternate notifier input is rejected', () => {
  assert.throws(
    () => buildOpsReport(baseInput({ domain: 'consumer' })),
    /company domain/
  );
  assert.throws(
    () =>
      buildOpsReport(
        baseInput({ destination: { adapter: 'new-webhook', target: 'x' } })
      ),
    /existing Linear issue adapter/
  );
});

test('clean semantic review binds exact message and existing destination', async () => {
  const prepared = await prepareOpsReportDelivery(baseInput(), {
    now: () => NOW,
    review: async input => cleanReceipt(input),
  });
  assert.equal(prepared.decision, 'observed');
  assert.equal(prepared.review.schema, OPS_REPORT_REVIEW_SCHEMA);
  assert.equal(prepared.review.bindings.resolvedModel, JEV_ROUTE.model);
  assert.equal(
    prepared.review.bindings.destination.target,
    baseInput().destination.target
  );
  assert.equal(prepared.review.revisionCount, 0);
  assert.equal(
    verifyOpsReportDelivery(prepared, baseInput(), { now: () => NOW }),
    true
  );
});

test('stale evidence routes to review without asking Jev', async () => {
  let reviewed = false;
  const input = baseInput({
    evidence: {
      observedAt: '2026-10-12T07:00:00.000Z',
      source: 'scripts/lanes/doctor.py',
    },
  });
  const prepared = await prepareOpsReportDelivery(input, {
    now: () => NOW,
    review: async () => {
      reviewed = true;
      return {};
    },
  });
  assert.equal(reviewed, false);
  assert.equal(prepared.decision, 'review-queue');
  assert.match(prepared.message, /stale-evidence/);
});

test('fake production claim cannot pass without deployment proof', async () => {
  const prepared = await prepareOpsReportDelivery(
    baseInput({ observedState: 'production is live and healthy' }),
    { now: () => NOW, review: async input => cleanReceipt(input) }
  );
  assert.equal(prepared.decision, 'review-queue');
  assert.match(prepared.message, /unsupported-production-claim/);
  assert.doesNotMatch(prepared.message, /production is live/);
});

test('contradictory proof tiers cannot become a success report', async () => {
  const input = baseInput({
    proofTiers: {
      ...baseInput().proofTiers,
      merge: tier('FAILED', 'merge-failed'),
      deployment: tier('PROVEN', 'deploy-claimed'),
    },
  });
  const prepared = await prepareOpsReportDelivery(input, {
    now: () => NOW,
    review: async semanticInput => cleanReceipt(semanticInput),
  });
  assert.equal(prepared.decision, 'review-queue');
  assert.match(prepared.message, /deployment-without-merge-proof/);
});

test('missing evidence stays UNKNOWN and never counts as semantic pass', async () => {
  let reviewed = false;
  const input = baseInput({ evidence: { observedAt: null, source: null } });
  const prepared = await prepareOpsReportDelivery(input, {
    now: () => NOW,
    review: async () => {
      reviewed = true;
      return {};
    },
  });
  assert.equal(reviewed, false);
  assert.equal(prepared.decision, 'review-queue');
  assert.match(prepared.message, /Evidence observed: UNKNOWN/);
  assert.match(prepared.message, /Evidence source: UNKNOWN/);
});

test('unknown owner survives semantic review and final message editing', async () => {
  const input = baseInput({ currentOwner: null });
  const prepared = await prepareOpsReportDelivery(input, {
    now: () => NOW,
    review: async semanticInput => cleanReceipt(semanticInput),
  });
  assert.equal(prepared.decision, 'observed');
  assert.match(prepared.message, /Current owner: UNKNOWN/);
});

test('one targeted revision is re-reviewed and cannot alter UNKNOWN facts', async () => {
  let reviewCount = 0;
  let revisionCount = 0;
  const input = baseInput({ currentOwner: null });
  const prepared = await prepareOpsReportDelivery(input, {
    now: () => NOW,
    review: async semanticInput => {
      reviewCount += 1;
      return reviewCount === 1
        ? cleanReceipt(semanticInput, {
            findings: [{ axis: 'voice-fit', passageId: 'p1' }],
          })
        : cleanReceipt(semanticInput);
    },
    revise: async ({ candidate }) => {
      revisionCount += 1;
      return `Root cause is disk pressure.\n\n${candidate}`;
    },
  });
  assert.equal(revisionCount, 1);
  assert.equal(
    reviewCount,
    1,
    'factual drift is rejected before a second model call'
  );
  assert.equal(prepared.decision, 'approved-template');
  assert.equal(prepared.review.reviewStatus, 'revision-fidelity-failed');
  assert.match(prepared.message, /Current owner: UNKNOWN/);
});

test('a faithful revision gets exactly one revision and one final recheck', async () => {
  let reviewCount = 0;
  let revisionCount = 0;
  const prepared = await prepareOpsReportDelivery(baseInput(), {
    now: () => NOW,
    review: async semanticInput => {
      reviewCount += 1;
      return reviewCount === 1
        ? cleanReceipt(semanticInput, {
            findings: [{ axis: 'voice-fit', passageId: 'p1' }],
          })
        : cleanReceipt(semanticInput);
    },
    revise: async ({ candidate }) => {
      revisionCount += 1;
      return `Action required.\n\n${candidate}`;
    },
  });
  assert.equal(revisionCount, 1);
  assert.equal(reviewCount, 2);
  assert.equal(prepared.review.revisionCount, 1);
  assert.equal(prepared.decision, 'observed');
});

test('unavailable review uses the approved factual template', async () => {
  for (const status of [
    'timeout',
    'stale',
    'cancelled',
    'not-admitted',
    'quota-exhausted',
    'invalid-response',
  ]) {
    const prepared = await prepareOpsReportDelivery(baseInput(), {
      now: () => NOW,
      review: async () => ({ status }),
    });
    assert.equal(prepared.decision, 'approved-template');
    assert.equal(prepared.review.reviewStatus, status);
    assert.equal(prepared.review.bindings.resolvedModel, NOT_APPLICABLE);
    assert.match(prepared.message, /Root cause: UNKNOWN/);
  }
});

test('missing resolved model and partial semantic answers fall back', async () => {
  for (const extra of [
    { resolvedModel: undefined },
    { findings: undefined },
    { unreviewed: undefined },
    { unreviewed: [{ reason: 'missing-answer' }] },
    { unreviewed: [{ reason: 'low-confidence' }] },
  ]) {
    const prepared = await prepareOpsReportDelivery(baseInput(), {
      now: () => NOW,
      review: async input => cleanReceipt(input, extra),
    });
    assert.equal(prepared.decision, 'approved-template');
  }
});

test('changed evidence, destination, or exact text invalidates the review', async () => {
  const prepared = await prepareOpsReportDelivery(baseInput(), {
    now: () => NOW,
    review: async input => cleanReceipt(input),
  });
  assert.throws(
    () =>
      verifyOpsReportDelivery(
        prepared,
        baseInput({
          evidence: {
            observedAt: '2026-10-12T07:59:31.000Z',
            source: 'scripts/lanes/doctor.py',
          },
        }),
        { now: () => NOW }
      ),
    /invalidated/
  );
  assert.throws(
    () =>
      verifyOpsReportDelivery(
        prepared,
        baseInput({
          destination: { adapter: 'linear-issue', target: 'different issue' },
        }),
        { now: () => NOW }
      ),
    /invalidated/
  );
  assert.throws(
    () =>
      verifyOpsReportDelivery(
        { ...prepared, message: `${prepared.message}\nlate edit` },
        baseInput(),
        { now: () => NOW }
      ),
    /invalidated/
  );
});

test('existing send seam suppresses duplicate notification', async () => {
  const prepared = await prepareOpsReportDelivery(baseInput(), {
    now: () => NOW,
    review: async input => cleanReceipt(input),
  });
  const sent = [];
  const dedupe = new Set();
  const send = async (message, destination) =>
    sent.push({ message, destination });
  assert.equal(
    (
      await deliverOpsReport(prepared, baseInput(), {
        send,
        dedupe,
        now: () => NOW,
      })
    ).outcome,
    'sent-to-existing-adapter'
  );
  assert.equal(
    (
      await deliverOpsReport(prepared, baseInput(), {
        send,
        dedupe,
        now: () => NOW,
      })
    ).outcome,
    'suppressed-duplicate'
  );
  assert.equal(sent.length, 1);
});

for (const outcome of ['observed', 'approved-template']) {
  test(`${outcome} expires before the existing send adapter is called`, async () => {
    const input = baseInput();
    const prepared = await prepareOpsReportDelivery(input, {
      now: () => NOW,
      review: async value =>
        outcome === 'observed' ? cleanReceipt(value) : { status: 'timeout' },
    });
    assert.equal(prepared.decision, outcome);
    const expiredAt = Date.parse(OBSERVED_AT) + MAX_EVIDENCE_AGE_MS + 1;
    assert.deepEqual(
      buildOpsReport(input, { now: () => expiredAt }).deterministicIssues,
      ['stale-evidence']
    );
    const sent = [];
    const dedupe = new Set();
    await assert.rejects(
      deliverOpsReport(prepared, input, {
        now: () => expiredAt,
        dedupe,
        send: async message => sent.push(message),
      }),
      /invalidated/
    );
    assert.equal(sent.length, 0);
    assert.equal(dedupe.size, 0);
  });
}

test('factual delivery remains valid through the exact evidence-age boundary', async () => {
  const input = baseInput();
  const prepared = await prepareOpsReportDelivery(input, {
    now: () => NOW,
    review: async value => cleanReceipt(value),
  });
  assert.equal(
    verifyOpsReportDelivery(prepared, input, {
      now: () => Date.parse(OBSERVED_AT) + MAX_EVIDENCE_AGE_MS,
    }),
    true
  );
});

test('the deliberately degraded stale-evidence queue notice remains deliverable', async () => {
  const input = baseInput();
  const expiredAt = Date.parse(OBSERVED_AT) + MAX_EVIDENCE_AGE_MS + 1;
  const prepared = await prepareOpsReportDelivery(input, {
    now: () => expiredAt,
    review: async () => {
      throw new Error('blocked evidence must not call Jev');
    },
  });
  assert.equal(prepared.decision, 'review-queue');
  assert.match(
    prepared.message,
    /needs review before the reported state can be trusted/
  );
  assert.match(prepared.message, /stale-evidence/);
  const sent = [];
  const result = await deliverOpsReport(prepared, input, {
    now: () => expiredAt + MAX_EVIDENCE_AGE_MS,
    send: async message => sent.push(message),
  });
  assert.equal(result.outcome, 'sent-to-existing-adapter');
  assert.deepEqual(sent, [prepared.message]);
});

test('changing a factual review to review-queue cannot bypass evidence expiry', async () => {
  const input = baseInput();
  const expiredAt = Date.parse(OBSERVED_AT) + MAX_EVIDENCE_AGE_MS + 1;
  for (const review of [
    async value => cleanReceipt(value),
    async () => ({ status: 'timeout' }),
  ]) {
    const prepared = await prepareOpsReportDelivery(input, {
      now: () => NOW,
      review,
    });
    assert.notEqual(prepared.decision, 'review-queue');
    assert.equal(prepared.review.bindings.outcome, prepared.decision);
    assert.throws(
      () =>
        verifyOpsReportDelivery(
          {
            ...prepared,
            decision: 'review-queue',
            review: { ...prepared.review, outcome: 'review-queue' },
          },
          input,
          { now: () => expiredAt }
        ),
      /invalidated/
    );
  }
});

test('fresh evidence must be prepared again after the previous factual report expires', async () => {
  const expiredAt = Date.parse(OBSERVED_AT) + MAX_EVIDENCE_AGE_MS + 1;
  const input = baseInput();
  const old = await prepareOpsReportDelivery(input, {
    now: () => NOW,
    review: async value => cleanReceipt(value),
  });
  const freshInput = baseInput({
    evidence: {
      ...input.evidence,
      observedAt: new Date(expiredAt).toISOString(),
    },
  });
  assert.throws(
    () => verifyOpsReportDelivery(old, freshInput, { now: () => expiredAt }),
    /invalidated/
  );
  const fresh = await prepareOpsReportDelivery(freshInput, {
    now: () => expiredAt,
    review: async value => cleanReceipt(value, { completedAt: expiredAt }),
  });
  const sent = [];
  assert.equal(
    (
      await deliverOpsReport(fresh, freshInput, {
        now: () => expiredAt,
        send: async message => sent.push(message),
      })
    ).outcome,
    'sent-to-existing-adapter'
  );
  assert.equal(sent.length, 1);
});

test('a backwards delivery clock cannot turn future evidence into a factual report', async () => {
  const input = baseInput();
  const prepared = await prepareOpsReportDelivery(input, {
    now: () => NOW,
    review: async value => cleanReceipt(value),
  });
  const backwards = Date.parse(OBSERVED_AT) - 60_001;
  assert.deepEqual(
    buildOpsReport(input, { now: () => backwards }).deterministicIssues,
    ['future-evidence']
  );
  assert.throws(
    () => verifyOpsReportDelivery(prepared, input, { now: () => backwards }),
    /invalidated/
  );
});

test('delivery rejects changed adapter arguments, expired evidence and late reviews', async () => {
  const prepared = await prepareOpsReportDelivery(baseInput(), {
    now: () => NOW,
    review: async input => cleanReceipt(input),
  });
  for (const changed of [
    { ...prepared, destination: { adapter: 'linear-issue', target: 'other' } },
    { ...prepared, audience: 'another audience' },
    { ...prepared, review: { ...prepared.review, reviewedAt: 'invalid' } },
    { ...prepared, review: { ...prepared.review, mode: 'enforcement' } },
  ]) {
    await assert.rejects(
      deliverOpsReport(changed, baseInput(), {
        now: () => NOW,
        send: () => assert.fail('sender must not run'),
      }),
      /invalidated/
    );
  }
  assert.throws(
    () =>
      verifyOpsReportDelivery(prepared, baseInput(), {
        now: () => NOW + 300_001,
      }),
    /invalidated/
  );
  for (const extra of [
    { requestFingerprint: 'old request' },
    { resolvedModel: 'unapproved-model' },
    { completedAt: NOW + 1 },
    { schema: 'unknown' },
  ]) {
    const result = await prepareOpsReportDelivery(baseInput(), {
      now: () => NOW,
      review: async input => cleanReceipt(input, extra),
    });
    assert.equal(result.decision, 'approved-template');
    assert.match(result.message, /Writing review: unreviewed/);
    const staleDefect = await prepareOpsReportDelivery(baseInput(), {
      now: () => NOW,
      review: async input =>
        cleanReceipt(input, {
          findings: [{ passageId: 'p1', axis: 'voice-fit', severity: 'warn' }],
          ...extra,
        }),
      revise: () =>
        assert.fail('invalid review must not request a paid revision'),
    });
    assert.equal(staleDefect.decision, 'approved-template');
  }
});

test('cancelled delivery never invokes the existing adapter', async () => {
  const prepared = await prepareOpsReportDelivery(baseInput(), {
    now: () => NOW,
    review: async input => cleanReceipt(input),
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    deliverOpsReport(prepared, baseInput(), {
      now: () => NOW,
      signal: controller.signal,
      send: () => assert.fail('cancelled report reached sender'),
    }),
    /abort/i
  );
});
