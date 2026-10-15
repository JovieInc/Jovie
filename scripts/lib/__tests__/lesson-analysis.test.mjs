import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { sealWorkOrder } from '../../../packages/agent-transport-contracts/work-order.ts';
import { runLessonAnalysis } from '../lesson-analysis.mjs';

const NOW = Date.parse('2026-10-15T18:00:00Z');
const AT = new Date(NOW).toISOString();
const REV = 'a'.repeat(40);
const REF = 'record://learning/';
const BINDING = {
  tenantId: 'company',
  productId: 'jovie',
  cohortId: 'shipping',
};
const hash = value =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const claim = (statement, refs = ['signal']) => ({
  statement,
  evidenceRefs: refs.map(value => REF + value),
});

function fixture() {
  const order = sealWorkOrder({
    schema: 'jovie.work-order/v1',
    orderId: 'lesson-8420',
    revision: 1,
    idempotencyKey: 'learning-8420',
    gate: { objectiveRef: 'JOV-2967', gateId: 'analysis' },
    state: 'open',
    title: 'Analyze the release incident',
    outcome: 'Explain the failed release',
    successPredicate: {
      id: 'supported',
      statement: 'Independent supported findings',
      verifier: 'review',
    },
    requiredCapabilities: ['reasoning'],
    riskTier: 'high',
    authorityClass: 'automation',
    scope: { target: 'release', entityRefs: [] },
    evidence: [],
    permittedActions: ['reasoning'],
    forbiddenActions: ['code-change'],
    budget: {
      deadline: new Date(NOW + 60_000).toISOString(),
      maxAttempts: 2,
      maxSpendUsd: 2,
      maxConcurrency: 1,
      founderMinutes: 0,
    },
    stopConditions: ['No independent evidence'],
    escalation: {
      owner: 'summer',
      action: 'Reconcile the existing analysis order',
    },
    expectedArtifact: {
      kind: 'decision-record',
      description: 'Evidence-linked findings',
    },
    founderAsk: null,
    replyTo: { kind: 'linear-comment', ref: 'JOV-8420' },
    createdAt: AT,
    createdBy: 'triage-owner',
  });
  const evidence = (name, kind = 'observation') => ({
    ref: REF + name,
    binding: BINDING,
    revision: REV,
    observedAt: AT,
    access: 'development',
    kind,
    summary: `Sanitized ${name} evidence`,
    causalVerification: null,
  });
  const request = {
    work: { id: 'release', revision: REV },
    binding: BINDING,
    admission: {
      orderDigest: order.digest,
      policyVersion: 'admission-v3',
      receiptRef: REF + 'admission',
    },
    lessonClass: 'shipping-control-plane',
    workClass: 'payload-bound-release',
    evidence: [
      evidence('signal', 'signal'),
      evidence('failed'),
      evidence('success'),
      {
        ...evidence('causal', 'causal-verification'),
        causalVerification: {
          causeKey: 'stale-payload',
          failedAttemptId: 'a1',
          successfulAttemptId: 'a2',
          verifierId: 'runtime-probe-owner',
          evidenceRef: REF + 'success',
        },
      },
    ],
    attempts: [
      {
        id: 'a1',
        parentId: null,
        method: 'cached-payload',
        outcome: 'failed',
        verified: true,
        evidenceRefs: [REF + 'failed'],
      },
      {
        id: 'a2',
        parentId: 'a1',
        method: 'fresh-payload',
        outcome: 'succeeded',
        verified: true,
        evidenceRefs: [REF + 'success'],
      },
    ],
    limits: {
      maxInferenceCalls: 2,
      maxToolCalls: 0,
      maxInputChars: 20_000,
      maxOutputChars: 10_000,
    },
  };
  const finding = {
    rootCause: {
      status: 'supported',
      causeKey: 'stale-payload',
      ...claim('Stale payload caused failure', ['causal']),
    },
    symptoms: [claim('Release failed', ['failed'])],
    differences: [
      {
        failedAttemptId: 'a1',
        successfulAttemptId: 'a2',
        ...claim('Fresh payload succeeded', ['failed', 'success']),
      },
    ],
    workClass: request.workClass,
    applicability: {
      ...BINDING,
      predicate: 'Payload-bound releases only',
      ...claim('Limited to this work class'),
    },
    earliestSignal: {
      ref: REF + 'signal',
      ...claim('Payload identity first disagreed'),
    },
    interventions: [
      {
        id: 'preflight',
        estimatedCostUsd: 0,
        ...claim('Compare payload identity'),
      },
      {
        id: 'retry',
        estimatedCostUsd: 1,
        ...claim('Retry with fresh payload', ['success']),
      },
    ],
    cheapestInterventionId: 'preflight',
    expectedSavings: claim('Avoid repeated releases'),
    generalizationRisk: claim('Does not imply every cached release is invalid'),
    disposition: 'target',
    target: 'test',
  };
  const route = (id, provider, cost, caps = ['reasoning', 'frontier']) => ({
    id,
    tuple: {
      provider,
      model: `${provider}/reasoner`,
      endpoint: `${provider}-endpoint`,
      cli: 'reasoning-owner',
      harness: 'reason-lane',
      configVersion: 'config-v7',
      tools: [],
      reviewPlan: 'adversarial',
    },
    estimatedTokenCost: cost,
    reviewCost: 0,
    failureRiskCost: 0,
    certifiedSuccessProbability: 1,
    expectedRetries: 0,
    capabilityMatch: caps,
    maxRiskTier: 'critical',
  });
  const calls = [];
  const environment = {
    now: () => NOW,
    routesVersion: 'certified-routes-v9',
    routes: [
      route('cheap', 'small', 0, ['reasoning']),
      route('author', 'family-a', 1),
      route('reviewer', 'family-b', 2),
    ],
    certify: row => ({
      schema: 'jovie.certification/v1',
      routeId: row.id,
      tupleDigest: hash(row.tuple),
      status: 'certified',
      capabilities: row.capabilityMatch,
      maxRiskTier: row.maxRiskTier,
      policyVersion: 'capability-policy-v5',
      evidenceRef: REF + `certificate-${row.id}`,
      validUntil: new Date(NOW + 100_000).toISOString(),
    }),
    dispatch: async call => {
      calls.push(call);
      const output =
        call.role === 'author'
          ? structuredClone(finding)
          : {
              proposalDigest: call.packet.proposalDigest,
              verdict: 'agree',
              ...claim(
                'Independent causal evidence supports the bounded target',
                ['causal']
              ),
            };
      return {
        output,
        resolvedTuple: structuredClone(call.route.selectedRoute.tuple),
        usage: {
          inferenceCalls: 1,
          toolCalls: 0,
          inferenceCostUsd: 0.25,
          toolCostUsd: 0,
        },
        result: {
          schema: 'jovie.work-result/v1',
          orderId: call.order.orderId,
          orderRevision: call.order.revision,
          orderDigest: call.order.digest,
          actor: {
            class: 'reasoning-lane',
            runtime: 'reason-lane',
            provider: call.route.selectedRoute.tuple.provider,
            model: call.route.selectedRoute.tuple.model,
            ref: REF + 'resolution',
          },
          phase: 'terminal',
          disposition: 'accepted',
          terminalState: 'succeeded',
          actionsTaken: ['reasoned without tools'],
          artifacts: [{ kind: 'decision-record', ref: REF + call.role }],
          outcome: {
            predicateId: call.order.successPredicate.id,
            status: 'met',
            evidenceRefs: [REF + call.role],
          },
          certification: { status: 'uncertified', invalidatedBy: [] },
          failures: [],
          unknowns: [],
          cost: {
            attempts: 1,
            wallSeconds: 0.1,
            spendUsd: 0.25,
            founderMinutes: 0,
          },
          next: null,
          transportRef: `linear:${call.order.orderId}`,
          dispatchedAt: AT,
          observedAt: AT,
          source: { adapter: 'reasoning-owner', receiptRef: REF + call.role },
        },
      };
    },
  };
  return { order, request, finding, environment, calls };
}

async function run(f) {
  return runLessonAnalysis(f.order, f.request, f.environment);
}

describe('admitted bounded lesson analysis', () => {
  it('reconstructs attempts, dispatches canonical orders, and records exact certified independent routes', async () => {
    const f = fixture();
    const result = await run(f);
    assert.equal(result.disposition, 'target');
    assert.deepEqual(result.attemptGraph.attempts, f.request.attempts);
    assert.deepEqual(result.finding, f.finding);
    assert.deepEqual(
      result.resolutions.map(row => row.receipt.selectedRoute.id),
      ['author', 'reviewer']
    );
    assert.deepEqual(
      result.resolutions.map(row => row.certification.policyVersion),
      ['capability-policy-v5', 'capability-policy-v5']
    );
    assert.equal(
      result.resolutions[0].receipt.provenance.routesVersion,
      'certified-routes-v9'
    );
    assert.ok(result.resolutions[0].receipt.provenance.routerVersion);
    assert.equal(result.policies.independence, 'generator-family-exclusion/v1');
    assert.equal(result.admission.receiptRef, f.request.admission.receiptRef);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[0].intake.labels[0], 'reasoning-job');
    assert.match(f.calls[0].intake.description, /summer.reasoning-job\/v1/);
    assert.equal(f.calls[0].order.budget.maxAttempts, 1);
    assert.equal(f.calls[0].order.budget.maxSpendUsd, 1);
    assert.deepEqual(f.calls[0].route.selectedRoute.tuple.tools, []);
    assert.deepEqual(f.calls[1].limits, {
      maxInferenceCalls: 1,
      maxToolCalls: 0,
      maxSpendUsd: 1.75,
      maxOutputChars: 10_000,
      deadline: f.order.budget.deadline,
    });
    assert.equal(result.expense.inferenceCostUsd, 0.5);
    assert.equal(result.expense.implementation, 'excluded');
    assert.equal(result.next, null);
  });

  for (const lessonClass of [
    'shipping-control-plane',
    'revenue-control-plane',
    'founder-rescue-invariant',
    'routing-admission-certification',
    'repeated-escaped-defect',
    'broad',
    'ambiguous',
  ]) {
    it(`requires frontier author and challenger for ${lessonClass} even at low declared risk`, async () => {
      const f = fixture();
      f.order = sealWorkOrder({
        ...f.order,
        digest: undefined,
        riskTier: 'low',
      });
      f.request.admission.orderDigest = f.order.digest;
      f.request.lessonClass = lessonClass;
      f.environment.routes = f.environment.routes.filter(
        row => row.id !== 'reviewer'
      );
      const result = await run(f);
      assert.equal(result.reason, 'qualified-route-unavailable');
      assert.equal(result.disposition, 'held');
      assert.equal(f.calls.length, 0);
      assert.equal(result.next.owner, 'summer');
    });
  }

  it('allows a narrow local class to use the existing cheaper capability route', async () => {
    const f = fixture();
    f.order = sealWorkOrder({ ...f.order, digest: undefined, riskTier: 'low' });
    f.request.admission.orderDigest = f.order.digest;
    f.request.lessonClass = 'local';
    assert.equal(
      (await run(f)).resolutions[0].receipt.selectedRoute.id,
      'cheap'
    );
  });

  for (const mutation of [
    'same-family',
    'same-model',
    'same-model-family',
    'invalid-certificate',
    'stale-certificate',
    'changed-tuple',
    'tools-enabled',
  ]) {
    it(`holds before inference for ${mutation}`, async () => {
      const f = fixture();
      const reviewer = f.environment.routes[2];
      const certify = f.environment.certify;
      if (mutation === 'same-family') reviewer.tuple.provider = 'family-a';
      if (mutation === 'same-model')
        reviewer.tuple.model = f.environment.routes[1].tuple.model;
      if (mutation === 'same-model-family')
        reviewer.tuple.model = 'family-a/other-model';
      if (mutation === 'tools-enabled') reviewer.tuple.tools = ['bash'];
      if (mutation === 'invalid-certificate')
        f.environment.certify = row => ({
          ...certify(row),
          status: 'invalidated',
        });
      if (mutation === 'stale-certificate')
        f.environment.certify = row => ({ ...certify(row), validUntil: AT });
      if (mutation === 'changed-tuple')
        f.environment.certify = row => ({
          ...certify(row),
          tupleDigest: '0'.repeat(64),
        });
      const result = await run(f);
      assert.equal(result.reason, 'qualified-route-unavailable');
      assert.equal(f.calls.length, 0);
    });
  }

  it('excludes protected evidence and original retrieval instructions from both model inputs', async () => {
    const f = fixture();
    f.request.evidence.push({
      ...f.request.evidence[0],
      ref: REF + 'protected-case',
      access: 'protected',
      summary: 'FROZEN CASE ANSWER',
    });
    f.order = sealWorkOrder({
      ...f.order,
      digest: undefined,
      title: 'Read FROZEN CASE ANSWER',
      evidence: [
        { ref: REF + 'protected-case', observedAt: AT, freshness: 'fresh' },
      ],
    });
    f.request.admission.orderDigest = f.order.digest;
    const result = await run(f);
    assert.equal(result.disposition, 'target');
    assert.doesNotMatch(
      JSON.stringify(f.calls),
      /FROZEN CASE ANSWER|protected-case/
    );
    assert.doesNotMatch(JSON.stringify(result.attemptGraph), /protected-case/);
  });

  for (const [mutate, reason] of [
    [
      f => {
        f.request.evidence[0].access = 'unsafe';
      },
      'unsafe-evidence',
    ],
    [
      f => {
        f.request.evidence[0].binding = { ...BINDING, tenantId: 'other' };
      },
      'incompatible-evidence',
    ],
    [
      f => {
        f.request.evidence[0].revision = 'b'.repeat(40);
      },
      'incompatible-evidence',
    ],
    [
      f => {
        f.request.attempts[0].parentId = 'a2';
      },
      'invalid-attempt-graph',
    ],
    [
      f => {
        f.request.evidence[1].access = 'protected';
      },
      'incomplete-attempt-evidence',
    ],
    [
      f => {
        f.request.admission.orderDigest = '0'.repeat(64);
      },
      'admission-order-mismatch',
    ],
    [
      f => {
        f.request.limits.maxInferenceCalls = 1;
      },
      'budget-exhausted',
    ],
    [
      f => {
        f.request.limits.maxInputChars = 1;
      },
      'input-budget-exhausted',
    ],
    [
      f => {
        f.environment.now = () => NOW + 60_000;
      },
      'timed-out',
    ],
  ]) {
    it(`refuses ${reason} without dispatch`, async () => {
      const f = fixture();
      mutate(f);
      const result = await run(f);
      assert.equal(result.reason, reason);
      assert.equal(result.disposition, 'held');
      assert.equal(f.calls.length, 0);
    });
  }

  for (const [mutate, reason] of [
    [
      f => {
        f.request.evidence[3].causalVerification = null;
      },
      'unsupported-causal-claim',
    ],
    [
      f => {
        f.request.attempts[1].verified = false;
      },
      'unsupported-attempt-difference',
    ],
    [
      f => {
        f.finding.rootCause.evidenceRefs = [REF + 'invented'];
      },
      'unsupported-evidence-reference',
    ],
    [
      f => {
        f.finding.applicability.tenantId = 'other';
      },
      'overbroad-work-class',
    ],
    [
      f => {
        f.finding.earliestSignal.ref = REF + 'failed';
      },
      'unsupported-earliest-signal',
    ],
    [
      f => {
        f.finding.cheapestInterventionId = 'retry';
      },
      'unsupported-cheapest-intervention',
    ],
    [
      f => {
        f.request.evidence[3].causalVerification.verifierId = 'author';
      },
      'unsupported-causal-claim',
    ],
  ]) {
    it(`rejects ${reason} before spending on challenge`, async () => {
      const f = fixture();
      mutate(f);
      const result = await run(f);
      assert.equal(result.reason, reason);
      assert.equal(result.finding, null);
      assert.equal(f.calls.length, 1);
      assert.equal(result.expense.inferenceCostUsd, 0.25);
      assert.equal(result.expense.status, 'known');
    });
  }

  it('permits an independently reviewed no-change result when causality is unknown', async () => {
    const f = fixture();
    f.finding.rootCause = {
      status: 'unknown',
      reason: 'One success is insufficient causal evidence',
    };
    f.finding.disposition = 'no-change';
    f.finding.target = null;
    const result = await run(f);
    assert.equal(result.disposition, 'no-change');
    assert.equal(result.finding.rootCause.status, 'unknown');
    assert.equal(f.calls.length, 2);
  });

  for (const fault of [
    'disagreement',
    'insufficient-review',
    'wrong-proposal',
    'tool-use',
    'extra-inference',
    'overspend',
    'wrong-route',
    'wrong-tuple',
    'wrong-order',
    'provider-error',
    'budget-exhausted',
    'timed-out',
    'output-limit',
  ]) {
    it(`holds ${fault} with an accountable owner and no retry`, async () => {
      const f = fixture();
      const dispatch = f.environment.dispatch;
      f.environment.dispatch = async call => {
        const reply = await dispatch(call);
        if (fault === 'provider-error')
          throw new Error('protected provider diagnostics');
        if (fault === 'tool-use') reply.usage.toolCalls = 1;
        if (fault === 'extra-inference') reply.usage.inferenceCalls = 3;
        if (fault === 'overspend')
          reply.usage.inferenceCostUsd = reply.result.cost.spendUsd = 10;
        if (fault === 'wrong-route') reply.result.actor.model = 'other';
        if (fault === 'wrong-tuple')
          reply.resolvedTuple.configVersion = 'other';
        if (fault === 'wrong-order') reply.result.orderRevision = 2;
        if (['budget-exhausted', 'timed-out'].includes(fault)) {
          reply.result.terminalState =
            fault === 'timed-out' ? 'timed_out' : 'budget_exhausted';
          reply.result.outcome.status = 'unknown';
        }
        if (fault === 'output-limit') reply.output.extra = 'x'.repeat(11_000);
        if (call.role === 'challenger') {
          if (fault === 'disagreement') reply.output.verdict = 'disagree';
          if (fault === 'insufficient-review')
            reply.output.verdict = 'insufficient-evidence';
          if (fault === 'wrong-proposal')
            reply.output.proposalDigest = '0'.repeat(64);
        }
        return reply;
      };
      const result = await run(f);
      assert.equal(result.disposition, 'held');
      assert.equal(result.next.owner, 'summer');
      assert.ok(f.calls.length <= 2);
      assert.equal(result.finding, null);
      assert.doesNotMatch(
        JSON.stringify(result),
        /protected provider diagnostics/
      );
    });
  }

  it('aborts a hanging owner on deadline and returns unknown expense for reconciliation', async () => {
    const f = fixture();
    const now = Date.now();
    f.order = sealWorkOrder({
      ...f.order,
      digest: undefined,
      budget: {
        ...f.order.budget,
        deadline: new Date(now + 100).toISOString(),
      },
    });
    f.request.admission.orderDigest = f.order.digest;
    f.environment.now = Date.now;
    f.environment.certify = row => ({
      schema: 'jovie.certification/v1',
      routeId: row.id,
      tupleDigest: hash(row.tuple),
      status: 'certified',
      capabilities: row.capabilityMatch,
      maxRiskTier: row.maxRiskTier,
      policyVersion: 'capability-v5',
      evidenceRef: REF + 'cert',
      validUntil: new Date(now + 10_000).toISOString(),
    });
    let aborted = false;
    f.environment.dispatch = call =>
      new Promise(() => {
        call.signal.addEventListener('abort', () => {
          aborted = true;
        });
      });
    const result = await run(f);
    assert.equal(result.reason, 'timed-out');
    assert.equal(result.expense.inferenceCalls, 1);
    assert.equal(result.expense.status, 'unknown');
    assert.equal(aborted, true);
  });
});
