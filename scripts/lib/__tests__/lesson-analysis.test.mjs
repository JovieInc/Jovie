import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { sealWorkOrder } from '../../../packages/agent-transport-contracts/work-order.ts';
import { validateInvariantRegistry } from '../../invariants/registry.mjs';
import { canonical } from '../canonical-json.mjs';
import { LESSON_METHOD_SURFACE } from '../learned-method-selection.mjs';
import { runLessonAnalysis } from '../lesson-analysis.mjs';
import { compileLesson } from '../lesson-compilation.mjs';
import { validateLearningReceipt } from '../rolling-ci-learning.mjs';

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
  createHash('sha256').update(canonical(value)).digest('hex');
const claim = (statement, refs = ['signal']) => ({
  statement,
  evidenceRefs: refs.map(value => REF + value),
});

/** @typedef {{status: 'supported', causeKey: string, statement: string, evidenceRefs: string[]} | {status: 'unknown', reason: string}} RootCause */

/** @param {RootCause} [rootCause] */
function fixture(
  rootCause = {
    status: 'supported',
    causeKey: 'stale-payload',
    ...claim('Stale payload caused failure', ['causal']),
  }
) {
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
    rootCause,
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
      // Transport output is untrusted and deliberately corrupted by failure cases.
      /** @type {Record<string, unknown>} */
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
  it('uses canonical tuple bindings regardless of receipt key order', async () => {
    const f = fixture();
    const certify = f.environment.certify;
    f.environment.certify = row => ({
      ...certify(row),
      tupleDigest: hash(
        Object.fromEntries(Object.entries(row.tuple).reverse())
      ),
    });
    assert.equal((await run(f)).disposition, 'target');
  });
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

  for (const [
    mutate,
    reason,
  ] of /** @type {Array<[(f: ReturnType<typeof fixture>) => void, string]>} */ ([
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
  ])) {
    it(`refuses ${reason} without dispatch`, async () => {
      const f = fixture();
      mutate(f);
      const result = await run(f);
      assert.equal(result.reason, reason);
      assert.equal(result.disposition, 'held');
      assert.equal(f.calls.length, 0);
    });
  }

  for (const [
    mutate,
    reason,
  ] of /** @type {Array<[(f: ReturnType<typeof fixture>) => void, string]>} */ ([
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
        assert.ok(f.finding.rootCause.status === 'supported');
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
  ])) {
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
    const f = fixture({
      status: 'unknown',
      reason: 'One success is insufficient causal evidence',
    });
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

// Real Git revisions and the production invariant validator back replay.
// Method outcomes are observed, never inferred from the selected route.
const replayRoot = mkdtempSync(join(tmpdir(), 'jovie-method-consumption-'));
after(() => rmSync(replayRoot, { recursive: true, force: true }));
const replayGit = args =>
  execFileSync('git', ['-C', replayRoot, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const putReplay = (path, value) => {
  mkdirSync(join(replayRoot, path, '..'), { recursive: true });
  writeFileSync(
    join(replayRoot, path),
    typeof value === 'string' ? value : JSON.stringify(value)
  );
};
const methodInvariant = {
  id: 'JOV-INV-999',
  title: 'fixture method',
  statement: 'unique fixture policy identity',
  scope: { products: ['Jovie'], surfaces: ['scripts'] },
  authority: { owner: 'Ops', approvedBy: 'Founder' },
  effective: { date: '2026-10-15', version: 1 },
  precedence: 1,
  policy: { key: 'fixture.only', value: true },
  lifecycle: { state: 'adopted' },
  enforcementConsumers: [{ name: 'method', path: 'methods.json' }],
  evidence: {
    tests: [{ name: 'valid control', path: 'method.test.mjs' }],
    deliberateRed: [{ name: 'deliberate red', path: 'method.test.mjs' }],
  },
};
const validPolicy = {
  schema: 'jovie-invariant-registry/v1',
  invariants: [methodInvariant],
};
const invalidPolicy = {
  ...validPolicy,
  invariants: [methodInvariant, methodInvariant],
};
putReplay(
  'canon/invariants.jsonl',
  JSON.stringify({ schema: validPolicy.schema }) +
    '\n' +
    JSON.stringify(methodInvariant) +
    '\n'
);
putReplay('method.test.mjs', '// valid control; deliberate red');
putReplay('methods.json', { preferred: 'method-1', policy: invalidPolicy });
putReplay('origin.json', { valid: false });
putReplay('control.json', { valid: true });
replayGit(['init', '-q']);
replayGit(['config', 'user.name', 'Method replay']);
replayGit(['config', 'user.email', 'replay@example.invalid']);
replayGit(['add', '.']);
replayGit(['commit', '-qm', 'fixture origin']);
const methodOrigin = replayGit(['rev-parse', 'HEAD']);
putReplay('methods.json', { preferred: 'method-7', policy: validPolicy });
replayGit(['add', '.']);
replayGit(['commit', '-qm', 'fixture candidate']);
const methodHead = replayGit(['rev-parse', 'HEAD']);
const methodSource = readFileSync(join(replayRoot, 'methods.json'), 'utf8');

const validatePolicy = policy =>
  validateInvariantRegistry(policy, { repoRoot: replayRoot });
const methods = [
  rows => rows,
  rows => [...rows].reverse(),
  rows => [...rows].sort((a, b) => a.title.localeCompare(b.title)),
  rows => rows.map(row => ({ ...row, title: row.title.trim() })),
  rows => rows.map(row => ({ ...row, precedence: 1 })),
  rows => JSON.parse(JSON.stringify(rows)),
  rows =>
    rows.filter((row, i) => rows.findIndex(other => other.id === row.id) === i),
];
const executeMethod = (id, valid = false) => {
  const policy = valid ? validPolicy : invalidPolicy;
  const index = Number(id.replace('method-', '')) - 1;
  return validatePolicy({
    ...policy,
    invariants: methods[index](policy.invariants),
  });
};

async function learnedFixture() {
  const f = fixture();
  f.request.work.revision = methodOrigin;
  f.request.evidence.forEach(row => {
    row.revision = methodOrigin;
  });
  const observed = Array.from({ length: 7 }, (_, i) => {
    const method = `method-${i + 1}`;
    const result = executeMethod(method);
    return {
      id: `a${i + 1}`,
      parentId: i === 0 ? null : `a${i}`,
      method,
      outcome: result.ok ? 'succeeded' : 'failed',
      verified: true,
      evidenceRefs: [REF + (result.ok ? 'success' : 'failed')],
    };
  });
  f.request.attempts = observed;
  const causal = f.request.evidence.find(
    row => row.kind === 'causal-verification'
  );
  causal.causalVerification.successfulAttemptId = 'a7';
  f.finding.differences[0].successfulAttemptId = 'a7';
  f.finding.target = 'skill';
  // Run the real analysis and challenger; do not handwrite that receipt.
  const analyzed = await run(f);
  assert.equal(analyzed.disposition, 'target');
  const analysis = {
    ...analyzed,
    owner: 'Ops',
    lessonClass: 'local',
    affectedScope: [LESSON_METHOD_SURFACE],
    expectedSaving: {
      amount: 6,
      unit: 'failures',
      evidenceRef: REF + 'signal',
    },
  };
  const request = {
    analysisRef: REF + 'reviewed-analysis',
    candidateRevision: methodHead,
    artifact: { id: 'existing-method', version: hash(methodSource) },
    applicability: {
      ...BINDING,
      workClass: f.request.workClass,
      surfaces: [LESSON_METHOD_SURFACE],
    },
    rollback: {
      revision: methodOrigin,
      reason: 'restore incumbent routing policy',
    },
    revalidation: {
      at: '2099-01-01T00:00:00Z',
      trigger: 'source, certification or rollout changes',
    },
    expectedSaving: {
      amount: 6,
      unit: 'failures',
      evidenceRef: REF + 'signal',
    },
    replayRef: REF + 'method-replay',
    outcome: 'compiled',
    learningReceipt: {
      schema: 'jovie-rolling-ci-learning/v1',
      identity: {
        repository: 'JovieInc/Jovie',
        pr: 1,
        head: methodHead,
        check: 'method-replay',
        fingerprint: 'method-order',
      },
      failureKind: 'product',
      rootCauseClass: 'stale-payload',
      currentHeadReproduction: {
        reproduced: true,
        head: methodHead,
        evidence: REF + 'method-replay',
      },
      minimalRepair: 'prefer the independently verified method',
      equivalentSurfaceSweep: {
        surfaces: [LESSON_METHOD_SURFACE],
        outcome: 'bounded replay with valid controls',
      },
      deliberateRedRegression: {
        fixture: REF + 'method-replay',
        failsBeforeRepair: true,
        passesAfterRepair: true,
      },
      guardrailDecision: {
        warranted: true,
        reason: 'existing method boundary',
        delivery: 'same-pr',
      },
      exactHeadGreen: true,
    },
  };
  const replayCase = (
    id,
    role,
    valid = false,
    surface = LESSON_METHOD_SURFACE
  ) => ({
    id,
    role,
    revision: methodOrigin,
    path: valid ? 'control.json' : 'origin.json',
    surface,
    access: 'development',
    ...BINDING,
    workClass: f.request.workClass,
  });
  const suite = {
    access: 'development',
    producerId: 'independent-registry-harness',
    analysisRef: request.analysisRef,
    originRevision: methodOrigin,
    candidateRevision: methodHead,
    artifactVersion: request.artifact.version,
    cases: [
      replayCase('origin', 'origin'),
      replayCase('valid', 'control', true),
      replayCase('boundary', 'control', true, 'scripts/unaffected.mjs'),
    ],
  };
  const replayResults = [];
  const compiler = {
    repoRoot: replayRoot,
    targets: [
      {
        id: 'existing-method',
        path: 'methods.json',
        kind: 'routing-policy',
        method: 'method-7',
        owner: 'Ops',
        estimatedCostUsd: 0,
        replayVersion: 'production-invariant-registry/v1',
        applies: () => true,
        replay({ originSource, candidateSource, fixtureSource }) {
          const valid = JSON.parse(fixtureSource).valid;
          const before = executeMethod(
            JSON.parse(originSource).preferred,
            valid
          );
          const after = executeMethod(
            JSON.parse(candidateSource).preferred,
            valid
          );
          const result = {
            origin: before.ok ? 'pass' : 'fail',
            candidate: after.ok ? (valid ? 'pass' : 'prevented') : 'fail',
            causeKey: 'stale-payload',
          };
          replayResults.push(result);
          return result;
        },
      },
    ],
    loadAnalysis: async () => analysis,
    loadReplay: async () => suite,
    authorize: async subject => ({
      ...subject,
      ok: true,
      actorId: 'existing-promotion-owner',
      policyVersion: 'existing-release-policy/v1',
    }),
  };
  const compiled = await compileLesson(request, compiler);
  assert.equal(compiled.disposition, 'compiled', compiled.reason);
  assert.equal(validateLearningReceipt(compiled.receipt).ok, true);
  // Seven real transports; the existing router still picks the challenger.
  const prototype = f.environment.routes[1];
  f.environment.routes = observed.map((attempt, i) => ({
    ...prototype,
    id: attempt.method,
    estimatedTokenCost: i + 1,
    tuple: {
      ...prototype.tuple,
      provider: `family-${i + 1}`,
      model: `family-${i + 1}/reasoner`,
    },
  }));
  const artifact = {
    ...compiled.receipt.compilation.artifact,
    source: methodSource,
    revision: methodHead,
    routesVersion: f.environment.routesVersion,
    tupleDigest: hash(f.environment.routes[6].tuple),
    status: 'active',
    selectionAllowed: true,
    releaseControlRef: 'record://existing-release-controls',
    requiredActions: ['reasoning'],
  };
  let records = [{ receipt: compiled.receipt }];
  f.environment.learning = {
    lookup: async () => records,
    loadAnalysis: async () => analysis,
    currentArtifact: async () => artifact,
  };
  f.request.work.revision = methodHead;
  f.request.evidence.forEach(row => {
    row.revision = methodHead;
  });
  f.calls.length = 0;
  const dispatch = f.environment.dispatch;
  const executions = [];
  f.environment.dispatch = async call => {
    const id = call.route.selectedRoute.id;
    executions.push({ id, result: executeMethod(id) });
    return dispatch(call);
  };
  return {
    f,
    analysis,
    artifact,
    compiled,
    compiler,
    request,
    suite,
    observed,
    replayResults,
    executions,
    setRecords: value => {
      records = value;
    },
  };
}

describe('compiled learning consumption at the existing dispatch boundary', () => {
  it('observes six failures, compiles independent replay, and actually invokes method seven first on the next equivalent job', async () => {
    const g = await learnedFixture();
    assert.deepEqual(
      g.observed.map(row => row.outcome),
      [...Array(6).fill('failed'), 'succeeded']
    );
    assert.deepEqual(
      g.replayResults.map(row => row.origin),
      ['fail', 'pass', 'pass']
    );
    const result = await run(g.f);
    assert.equal(result.disposition, 'target', result.reason);
    assert.equal(g.executions[0].id, 'method-7');
    assert.equal(g.executions[0].result.ok, true);
    assert.equal(result.firstAttemptedMethod, 'method-7');
    const { receipt, learning } = result.resolutions[0];
    assert.equal(receipt.selectedRoute.id, 'method-7');
    assert.equal(receipt.alternatives[0].id, 'method-1');
    assert.equal(learning.incumbentAlternative, 'method-1');
    assert.equal(
      learning.selectedArtifact.version,
      g.compiled.receipt.compilation.artifact.version
    );
    assert.equal(learning.selectedArtifact.id, 'existing-method');
    assert.match(learning.learningReceipt, /^JovieInc\/Jovie:1:/);
    assert.equal(learning.analysisRef, g.request.analysisRef);
    assert.equal(
      Object.values(learning.predicateEvaluation).every(Boolean),
      true
    );
    assert.equal(learning.actualFirstAttemptedMethod, 'method-7');
    assert.equal(result.resolutions[1].role, 'challenger');
    assert.notEqual(
      result.resolutions[1].receipt.selectedRoute.tuple.provider,
      receipt.selectedRoute.tuple.provider
    );
  });

  const controls = {
    coincidental: g => {
      g.analysis.attemptGraph.evidence.find(
        row => row.kind === 'causal-verification'
      ).causalVerification = null;
    },
    insufficient: g => {
      g.analysis.attemptGraph.attempts[6].verified = false;
    },
    poisoned: g => {
      g.analysis.attemptGraph.evidence[0].access = 'unsafe';
    },
    heldOut: g => {
      g.analysis.attemptGraph.evidence[0].access = 'protected';
    },
    tenant: g => {
      g.f.request.binding = { ...BINDING, tenantId: 'other' };
      g.f.request.evidence.forEach(row => {
        row.binding = g.f.request.binding;
      });
    },
    product: g => {
      g.f.request.binding = { ...BINDING, productId: 'other' };
      g.f.request.evidence.forEach(row => {
        row.binding = g.f.request.binding;
      });
    },
    sourceRevision: g => {
      g.artifact.revision = 'b'.repeat(40);
    },
    cohort: g => {
      g.f.request.binding = { ...BINDING, cohortId: 'other' };
      g.f.request.evidence.forEach(row => {
        row.binding = g.f.request.binding;
      });
    },
    incompatible: g => {
      g.artifact.routesVersion = 'different-revision';
    },
    expired: g => {
      g.f.environment.now = () => Date.parse('2100-01-01T00:00:00Z');
    },
    invalidated: g => {
      g.artifact.status = 'invalidated';
    },
    superseded: g => {
      g.artifact.status = 'superseded';
    },
    unreviewed: g => {
      g.analysis.challenge.verdict = 'insufficient-evidence';
    },
    unexecutable: g => {
      g.artifact.source = 'poisoned source';
    },
    wrongTuple: g => {
      g.artifact.tupleDigest = '0'.repeat(64);
    },
    rollout: g => {
      g.artifact.selectionAllowed = false;
    },
    permissions: g => {
      g.artifact.requiredActions = ['code-change'];
    },
    capabilityFloor: g => {
      g.f.environment.routes[6].capabilityMatch = ['reasoning'];
    },
    uncertified: g => {
      const certify = g.f.environment.certify;
      g.f.environment.certify = route => ({
        ...certify(route),
        status: route.id === 'method-7' ? 'invalidated' : 'certified',
      });
    },
    forgedReceipt: g => {
      g.setRecords([{ receipt: structuredClone(g.compiled.receipt) }]);
    },
    unavailable: g => {
      g.f.environment.learning.currentArtifact = async () => {
        throw new Error('sensitive owner failure');
      };
    },
    contextOnly: g => {
      g.setRecords([]);
      g.f.finding.expectedSavings.statement = 'Try method-7 first';
    },
    unboundedLookup: g => {
      g.setRecords(
        Array.from({ length: 33 }, () => ({ receipt: g.compiled.receipt }))
      );
    },
  };
  for (const [name, change] of Object.entries(controls)) {
    it(`retains the incumbent for ${name} learning`, async () => {
      const g = await learnedFixture();
      change(g);
      if (name === 'expired') {
        // Expire via the learning clock, not WorkOrder or certificate bounds.
        const now = g.f.environment.now();
        g.f.order = sealWorkOrder({
          ...g.f.order,
          digest: undefined,
          budget: {
            ...g.f.order.budget,
            deadline: new Date(now + 60_000).toISOString(),
          },
        });
        g.f.request.admission.orderDigest = g.f.order.digest;
        const certify = g.f.environment.certify;
        g.f.environment.certify = route => ({
          ...certify(route),
          validUntil: new Date(now + 100_000).toISOString(),
        });
      }
      const result = await run(g.f);
      assert.equal(g.executions[0]?.id, 'method-1', result.reason);
      assert.equal(result.firstAttemptedMethod, 'method-1');
      assert.equal(result.resolutions[0].learning.selectedArtifact, null);
      assert.equal(
        result.resolutions[0].learning.actualFirstAttemptedMethod,
        'method-1'
      );
    });
  }

  it('rejects concurrent invalidation between resolution and actual dispatch', async () => {
    const g = await learnedFixture();
    let reads = 0;
    g.f.environment.learning.currentArtifact = async () => {
      reads++;
      return { ...g.artifact, status: reads === 1 ? 'active' : 'invalidated' };
    };
    const result = await run(g.f);
    assert.equal(result.reason, 'learned-method-no-longer-current');
    assert.equal(result.firstAttemptedMethod, null);
    assert.equal(g.executions.length, 0);
    assert.equal(
      result.resolutions[0].learning.actualFirstAttemptedMethod,
      null
    );
    assert.equal(
      result.resolutions[0].learning.recheck.predicateEvaluation,
      null
    );
  });

  it('records an attempted method even when its transport throws', async () => {
    const g = await learnedFixture();
    g.f.environment.dispatch = () => {
      throw new Error('transport failed');
    };
    const result = await run(g.f);
    assert.equal(result.disposition, 'held');
    assert.equal(result.firstAttemptedMethod, 'method-7');
    assert.equal(
      result.resolutions[0].learning.actualFirstAttemptedMethod,
      'method-7'
    );
  });

  it('aborts a hanging learning owner inside the existing job deadline without inference', async () => {
    const g = await learnedFixture();
    g.f.request.limits.maxWallTimeMs = 20;
    /** @type {AbortSignal | undefined} */
    let signal;
    g.f.environment.learning.lookup = async (_, options) => {
      signal = options?.signal;
      return new Promise(() => {});
    };
    const result = await run(g.f);
    assert.equal(result.reason, 'timed-out');
    assert.equal(signal?.aborted, true);
    assert.equal(result.expense.inferenceCalls, 0);
    assert.equal(result.firstAttemptedMethod, null);
    assert.equal(g.executions.length, 0);
  });

  it('rejects a capability certification invalidated before actual dispatch', async () => {
    const g = await learnedFixture();
    const certify = g.f.environment.certify;
    let reads = 0;
    g.f.environment.certify = route => ({
      ...certify(route),
      status:
        route.id === 'method-7' && ++reads > 1 ? 'invalidated' : 'certified',
    });
    const result = await run(g.f);
    assert.equal(result.reason, 'route-certification-expired');
    assert.equal(result.firstAttemptedMethod, null);
    assert.equal(g.executions.length, 0);
  });

  it('keeps current rollout, permission and independent review owners in authority', async () => {
    const g = await learnedFixture();
    g.compiler.authorize = async subject => ({ ...subject, ok: false });
    const denied = await compileLesson(g.request, g.compiler);
    assert.equal(denied.disposition, 'held');
    g.setRecords([{ receipt: denied.receipt }]);
    const result = await run(g.f);
    assert.equal(result.firstAttemptedMethod, 'method-1');
    assert.equal(result.resolutions[0].learning.selectedArtifact, null);
  });
});
