import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { test } from 'node:test';

import {
  canonical,
  GEM_LINEAR_ADMISSION_CONTRACT,
  LEGACY_GOVERNOR_FENCE_SET_CONTRACT,
  requestSummerAssessment,
  summerAssessmentConfig,
  TRIAGE_ASSESSMENT_DOMAIN,
  validJevTriageAssessment,
  validLegacyGovernorFenceSet,
  validWorkflowDrainObservation,
} from '../summer-triage-assessment-client.mjs';

const pair = generateKeyPairSync('ed25519');
const privateKey = pair.privateKey
  .export({ format: 'pem', type: 'pkcs8' })
  .toString();
const publicKey = pair.publicKey
  .export({ format: 'pem', type: 'spki' })
  .toString();
const environment = {
  SUMMER_BOTTLENECK_ORIGIN: 'https://summer.example',
  SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY: privateKey,
  SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID: 'host-outcome',
};
const delivery = {
  issueId: '68b3e8de-588e-46ba-8209-84329d154627',
  identifier: 'JOV-6500',
  deliveryId: 'delivery-1234567890',
};
const receipt = {
  schema: 'summer.linear-triage-assessment/v1',
  issueIdentifier: delivery.identifier,
  issueId: delivery.issueId,
  deliveryId: delivery.deliveryId,
  decision: 'urgent-investigation-required',
  linearUpdatedAt: '2026-09-24T03:59:00.000Z',
  acceptedInvestigation: false,
  authorizesDispatch: false,
};

function governorFenceSet(
  identifier = delivery.identifier,
  issueId = delivery.issueId
) {
  const families = [
    ['agent-ready', 'summer-backlog-governor:agent-ready:'],
    ['unscoped', 'summer-backlog-governor:'],
    ['devin', 'summer-backlog-governor:devin:'],
  ].map(([family, prefix]) => {
    const key = createHash('sha256')
      .update(prefix + identifier)
      .digest('hex');
    return {
      family,
      status: 'fenced',
      idempotencyKey: key,
      dispatchPath: `summer-company/linear-transitions/${key}/dispatch.json`,
      authorizesTransition: false,
    };
  });
  return {
    status: 'fenced',
    contract: GEM_LINEAR_ADMISSION_CONTRACT,
    issueIdentifier: identifier,
    issueId,
    idempotencyKey: families[0].idempotencyKey,
    dispatchPath: families[0].dispatchPath,
    authorizesTransition: false,
    fenceSetContract: LEGACY_GOVERNOR_FENCE_SET_CONTRACT,
    families,
  };
}

/** @param {RequestInit} init */
function requestBody(init) {
  assert.ok(typeof init.body === 'string');
  return JSON.parse(init.body);
}

test('only the exact ordered issue-bound three-family negative fence set is accepted', () => {
  const valid = governorFenceSet();
  assert.equal(
    validLegacyGovernorFenceSet(valid, delivery.identifier, delivery.issueId),
    true
  );
  const mutations = [
    fence => {
      delete fence.fenceSetContract;
      delete fence.families;
    },
    fence => {
      fence.fenceSetContract = 'old';
    },
    fence => {
      fence.families.pop();
    },
    fence => {
      fence.families.reverse();
    },
    fence => {
      fence.families[1] = structuredClone(fence.families[0]);
    },
    fence => {
      fence.families[1].family = 'other';
    },
    fence => {
      fence.families[1].idempotencyKey = 'a'.repeat(64);
    },
    fence => {
      fence.families[2].dispatchPath += '/extra';
    },
    fence => {
      fence.families[0].status = 'accepted';
    },
    fence => {
      fence.families[2].authorizesTransition = true;
    },
    fence => {
      fence.authorizesTransition = true;
    },
    fence => {
      fence.idempotencyKey = fence.families[1].idempotencyKey;
    },
    fence => {
      fence.dispatchPath = fence.families[1].dispatchPath;
    },
    fence => {
      fence.contract = 'old';
    },
    fence => {
      fence.issueIdentifier = 'JOV-6641';
    },
    fence => {
      fence.issueId = '00000000-0000-4000-8000-000000000001';
    },
    fence => {
      fence.families[2].authorizesDispatch = true;
    },
    fence => {
      fence.authorizesDispatch = true;
    },
    fence => {
      delete fence.families[1];
    },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(valid);
    mutate(changed);
    assert.equal(
      validLegacyGovernorFenceSet(
        changed,
        delivery.identifier,
        delivery.issueId
      ),
      false
    );
  }
  for (const value of [null, {}, [], { ...valid, families: {} }])
    assert.equal(
      validLegacyGovernorFenceSet(value, delivery.identifier, delivery.issueId),
      false
    );
  assert.equal(
    validLegacyGovernorFenceSet(valid, undefined, delivery.issueId),
    false
  );
  assert.equal(
    validLegacyGovernorFenceSet(valid, delivery.identifier, 'not-a-uuid'),
    false
  );
});

test('the private guard abort signal bounds signed observation transport without retry', async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = requestSummerAssessment(delivery, {
    environment,
    signal: controller.signal,
    fetchImpl: async (_url, init) => {
      calls++;
      assert.ok(init.signal);
      /** @type {Promise<Response>} */
      const response = new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => reject(init.signal.reason),
          { once: true }
        );
      });
      return response;
    },
  });
  controller.abort(Error('owned-guard-expired'));
  await assert.rejects(pending, /owned-guard-expired/);
  assert.equal(calls, 1);
});

test('validates bounded Jev recommendations and rejects completion, invalid priorities and non-finite confidence', async () => {
  const assessment = {
    schema: 'summer.jev-triage/v1',
    model: 'typesafe-ai/jev',
    status: 'decided',
    destination: 'Todo',
    priority: 2,
    category: 'bug',
    confidence: 0.98,
    reason: 'bounded repair',
    assessmentKey: 'key-1',
  };
  for (const destination of ['Todo', 'Backlog'])
    assert.equal(
      validJevTriageAssessment({ ...assessment, destination }),
      true
    );
  for (const status of ['ambiguous', 'unavailable'])
    assert.equal(
      validJevTriageAssessment({
        ...assessment,
        status,
        destination: null,
        priority: null,
      }),
      true
    );
  for (const invalid of [
    { destination: 'Done' },
    { priority: 0 },
    { priority: 5 },
    { confidence: NaN },
    { confidence: -1 },
    { confidence: 2 },
    { schema: 'other' },
    { model: 'other' },
    { category: '' },
    { reason: '' },
    { assessmentKey: '' },
    { status: 'unavailable' },
  ]) {
    assert.equal(
      validJevTriageAssessment({ ...assessment, ...invalid }),
      false
    );
  }
  const result = await requestSummerAssessment(delivery, {
    environment,
    fetchImpl: async () => Response.json({ ...receipt, assessment }),
  });
  assert.deepEqual(result.assessment, assessment);
  await assert.rejects(
    requestSummerAssessment(delivery, {
      environment,
      fetchImpl: async () =>
        Response.json({
          ...receipt,
          assessment: { ...assessment, destination: 'Done' },
        }),
    }),
    /assessment-invalid/
  );
});

function worldObservation() {
  return {
    schema: 'summer.workflow-drain-observation/v1',
    api: 'eve0.47.7:world.runs.list:canonical-storage',
    observedAt: '2026-10-16T21:00:00.000Z',
    authorizesTransition: false,
    authorizesDispatch: false,
    genericWriterDrain: 'unverified',
    status: 'observed',
    complete: true,
    identity: {
      projectId: 'prj_LaVQva346cjp5XfrbAIIQUln7tPH',
      teamId: 'team_bpNDbti6srVLYPKdmQLu4UgT',
      environment: 'production',
      sourceRevision: 'a'.repeat(40),
      deploymentId: 'dpl_current',
      providerOwnerReadback: 'separate-required',
    },
    counts: {
      pending: 0,
      running: 0,
      currentDeployment: 0,
      oldDeployment: 0,
      unknownLineage: 0,
    },
    runs: [],
    pagination: {
      pendingPages: 1,
      runningPages: 1,
      complete: true,
      maxPagesPerStatus: 4,
      pageSize: 100,
    },
    retention: {
      status: 'not-reported',
      basis: 'pinned-canonical-current-nonterminal-storage-contract',
      scope: 'current-nonterminal-storage',
      historicalCoverage: 'not-claimed',
      windows: [],
    },
    holds: [],
  };
}

test('validates fresh canonical World storage observations while retaining separate generic writer authority', () => {
  const now = Date.parse('2026-10-16T21:00:01.000Z');
  const valid = worldObservation();
  assert.equal(validWorkflowDrainObservation(valid, now), true);
  for (const change of [
    { schema: 'analytics' },
    { api: 'analytics' },
    { authorizesTransition: true },
    { authorizesDispatch: true },
    { genericWriterDrain: 'verified' },
    { observedAt: 'invalid' },
    { observedAt: '2026-10-16T20:59:00.000Z' },
    { observedAt: '2026-10-16T21:01:00.000Z' },
    { status: 'unknown' },
    { complete: false },
    { holds: ['old-writer'] },
    { runs: [{}] },
    { identity: { ...valid.identity, projectId: 'other' } },
    { identity: { ...valid.identity, environment: 'preview' } },
    { identity: { ...valid.identity, sourceRevision: 'unknown' } },
    { identity: { ...valid.identity, deploymentId: null } },
    { counts: { ...valid.counts, oldDeployment: 1 } },
    { counts: { ...valid.counts, unknownLineage: 1 } },
    { counts: { ...valid.counts, pending: -1 } },
    { counts: { ...valid.counts, running: 1 } },
    { pagination: { ...valid.pagination, complete: false } },
    { pagination: { ...valid.pagination, pendingPages: 0 } },
    { retention: { ...valid.retention, status: 'truncated' } },
    { retention: { ...valid.retention, historicalCoverage: 'complete' } },
  ])
    assert.equal(
      validWorkflowDrainObservation({ ...valid, ...change }, now),
      false,
      JSON.stringify(change)
    );
  const held = { ...valid, status: 'held', complete: false };
  assert.equal(validWorkflowDrainObservation(held, now), true);
  assert.equal(
    validWorkflowDrainObservation({ ...held, complete: true }, now),
    false
  );
  const run = {
    runId: 'wrun_current',
    status: 'pending',
    deploymentId: 'dpl_current',
    workflowName: 'agent-turn',
    createdAt: valid.observedAt,
    updatedAt: valid.observedAt,
  };
  const running = {
    ...valid,
    runs: [run],
    counts: { ...valid.counts, pending: 1, currentDeployment: 1 },
  };
  assert.equal(validWorkflowDrainObservation(running, now), true);
  for (const change of [
    { runId: null },
    { deploymentId: 'dpl_old' },
    { status: 'completed' },
    { workflowName: '' },
    { createdAt: 'invalid' },
  ])
    assert.equal(
      validWorkflowDrainObservation(
        { ...running, runs: [{ ...run, ...change }] },
        now
      ),
      false
    );
  assert.equal(
    validWorkflowDrainObservation(
      {
        ...running,
        runs: [run, run],
        counts: { ...running.counts, pending: 2, currentDeployment: 2 },
      },
      now
    ),
    false
  );
});

test('binds fresh World census opt-in to signed Backlog version and rejects unsolicited observations', async () => {
  const version = '2026-10-16T20:59:00.000Z';
  const bound = {
    ...delivery,
    expectedState: 'Backlog',
    expectedLinearUpdatedAt: version,
    observeLegacyWorkflowDrain: true,
  };
  const world = worldObservation();
  const request = (input, response) =>
    requestSummerAssessment(input, {
      environment,
      now: () => Date.parse(world.observedAt),
      fetchImpl: async (_url, options) => {
        const { signature, ...unsigned } = requestBody(options);
        const verifyBody = body =>
          verify(
            null,
            Buffer.from(`${TRIAGE_ASSESSMENT_DOMAIN}\0${canonical(body)}`),
            publicKey,
            Buffer.from(signature.slice('ed25519='.length), 'base64url')
          );
        assert.equal(verifyBody(unsigned), true);
        if (unsigned.observeLegacyWorkflowDrain === true)
          assert.equal(
            verifyBody({ ...unsigned, observeLegacyWorkflowDrain: false }),
            false
          );
        return Response.json(response);
      },
    });
  const observed = {
    ...backlogReceipt(version),
    workflowDrainObservation: world,
  };
  assert.equal(
    (await request(bound, observed)).workflowDrainObservation.status,
    'observed'
  );
  await assert.rejects(
    request(bound, backlogReceipt(version)),
    /assessment-invalid/
  );
  await assert.rejects(
    request({ ...bound, observeLegacyWorkflowDrain: false }, observed),
    /assessment-invalid/
  );
  for (const value of [1, 'true', null])
    await assert.rejects(
      request({ ...bound, observeLegacyWorkflowDrain: value }, observed),
      /backlog-binding-invalid/
    );
  await assert.rejects(
    request({ ...delivery, observeLegacyWorkflowDrain: true }, observed),
    /backlog-binding-invalid/
  );
});

test('signs a bounded host request and validates Summer identity and authority', async () => {
  const result = await requestSummerAssessment(delivery, {
    environment,
    now: () => Date.parse('2026-09-24T04:00:00Z'),
    fetchImpl: async (url, options) => {
      assert.equal(
        url,
        'https://summer.example/summer/v1/symphony/triage-assessments'
      );
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      if (typeof options.body !== 'string')
        throw new Error('expected-json-body');
      const body = requestBody(options);
      const { signature, ...unsigned } = body;
      assert.equal(body.schema, TRIAGE_ASSESSMENT_DOMAIN);
      assert.equal(body.issueIdentifier, delivery.identifier);
      assert.equal(body.requestedAt, '2026-09-24T04:00:00.000Z');
      assert.ok(
        verify(
          null,
          Buffer.from(`${TRIAGE_ASSESSMENT_DOMAIN}\0${canonical(unsigned)}`),
          publicKey,
          Buffer.from(signature.slice('ed25519='.length), 'base64url')
        )
      );
      return Response.json(receipt);
    },
  });
  assert.deepEqual(result, receipt);
});

test('rejects non-HTTPS destinations and wrong key types', () => {
  assert.throws(
    () =>
      summerAssessmentConfig({
        ...environment,
        SUMMER_BOTTLENECK_ORIGIN: 'http://summer.example',
      }),
    /origin-invalid/
  );
  assert.throws(
    () =>
      summerAssessmentConfig({
        ...environment,
        SUMMER_BOTTLENECK_ORIGIN: 'https://127.0.0.1',
      }),
    /origin-invalid/
  );
  assert.throws(
    () =>
      summerAssessmentConfig({
        ...environment,
        SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID: 'x',
      }),
    /key-id-invalid/
  );
});

test('fails closed on provider error or a response claiming dispatch authority', async () => {
  await assert.rejects(
    requestSummerAssessment(delivery, {
      environment,
      fetchImpl: async () =>
        Response.json({ code: 'unavailable' }, { status: 503 }),
    }),
    /http-503/
  );
  await assert.rejects(
    requestSummerAssessment(delivery, {
      environment,
      fetchImpl: async () =>
        Response.json({ ...receipt, authorizesDispatch: true }),
    }),
    /assessment-invalid/
  );
  await assert.rejects(
    requestSummerAssessment(delivery, {
      environment,
      fetchImpl: async () => Response.json({ ...receipt, issueId: 'wrong' }),
    }),
    /assessment-invalid/
  );
});

const backlogReceipt = (version, decision = 'existing-intake-reconcile') => ({
  ...receipt,
  state: 'Backlog',
  priority: 1,
  linearUpdatedAt: version,
  decision,
  backlogIntake: {
    schema: 'summer.guarded-backlog-intake/v1',
    status: 'observed',
    policy: 'existing-guarded-admission',
    authorizesTransition: false,
  },
});

test('binds every Backlog observation and replay to the signed current issue version', async () => {
  const versions = [
    '2026-10-16T19:00:00.000Z',
    '2026-10-16T19:01:00.000Z',
    '2026-10-16T19:01:00.000Z',
  ];
  const signatures = [];
  for (const version of versions) {
    const result = await requestSummerAssessment(
      {
        ...delivery,
        expectedState: 'Backlog',
        expectedLinearUpdatedAt: version,
      },
      {
        environment,
        now: () => Date.parse('2026-10-16T19:02:00.000Z'),
        fetchImpl: async (_url, options) => {
          const { signature, ...unsigned } = requestBody(options);
          assert.equal(unsigned.expectedState, 'Backlog');
          assert.equal(unsigned.expectedLinearUpdatedAt, version);
          const valid = value =>
            verify(
              null,
              Buffer.from(`${TRIAGE_ASSESSMENT_DOMAIN}\0${canonical(value)}`),
              publicKey,
              Buffer.from(signature.slice('ed25519='.length), 'base64url')
            );
          assert.equal(valid(unsigned), true);
          assert.equal(valid({ ...unsigned, expectedState: 'Triage' }), false);
          assert.equal(
            valid({
              ...unsigned,
              expectedLinearUpdatedAt: '2026-10-16T18:00:00.000Z',
            }),
            false
          );
          signatures.push(signature);
          return Response.json(
            backlogReceipt(version, 'urgent-investigation-required')
          );
        },
      }
    );
    assert.equal(result.backlogIntake.authorizesTransition, false);
    assert.equal(result.authorizesDispatch, false);
  }
  assert.notEqual(signatures[0], signatures[1]);
  assert.equal(signatures[1], signatures[2]);
});

test('refuses incomplete Backlog bindings before a network call and rejects stale or elevated observations', async () => {
  const version = '2026-10-16T19:00:00.000Z';
  for (const binding of [
    { expectedState: 'Backlog' },
    { expectedLinearUpdatedAt: version },
    { expectedState: 'Todo', expectedLinearUpdatedAt: version },
    { expectedState: 'Backlog', expectedLinearUpdatedAt: '2026-10-16' },
    { expectedState: 'Backlog', expectedLinearUpdatedAt: 'invalid' },
  ]) {
    await assert.rejects(
      requestSummerAssessment(
        { ...delivery, ...binding },
        {
          environment,
          fetchImpl: async () => {
            assert.fail('invalid binding must not reach Summer');
          },
        }
      ),
      /backlog-binding-invalid/
    );
  }
  for (const invalid of [
    { state: 'Triage' },
    { priority: undefined },
    { priority: true },
    { priority: '1' },
    { priority: -1 },
    { priority: 5 },
    { linearUpdatedAt: '2026-10-16T19:01:00.000Z' },
    { decision: 'stale-event' },
    { backlogIntake: undefined },
    {
      backlogIntake: {
        ...backlogReceipt(version).backlogIntake,
        authorizesTransition: true,
      },
    },
    {
      backlogIntake: {
        ...backlogReceipt(version).backlogIntake,
        schema: 'other',
      },
    },
    {
      backlogIntake: {
        ...backlogReceipt(version).backlogIntake,
        policy: 'other',
      },
    },
    {
      backlogIntake: {
        ...backlogReceipt(version).backlogIntake,
        status: 'allowed',
      },
    },
    { assessment: {} },
    { assessmentCost: {} },
  ]) {
    await assert.rejects(
      requestSummerAssessment(
        {
          ...delivery,
          expectedState: 'Backlog',
          expectedLinearUpdatedAt: version,
        },
        {
          environment,
          fetchImpl: async () =>
            Response.json({ ...backlogReceipt(version), ...invalid }),
        }
      ),
      /assessment-invalid/
    );
  }
});

test('signs a literal negative legacy fence opt-in and verifies its permanent issue binding', async () => {
  const version = '2026-10-16T19:00:00.000Z';
  const key = createHash('sha256')
    .update(`summer-backlog-governor:agent-ready:${delivery.identifier}`)
    .digest('hex');
  const bound = {
    ...delivery,
    expectedState: 'Backlog',
    expectedLinearUpdatedAt: version,
    fenceLegacyGovernor: true,
  };
  const observed = {
    ...backlogReceipt(version),
    admissionDelegation: {
      contract: GEM_LINEAR_ADMISSION_CONTRACT,
      writer: 'gem-fleet-gate',
      status: 'delegated',
      authorizesTransition: false,
    },
    legacyGovernorFence: governorFenceSet(),
  };
  const request = async (value, response) =>
    requestSummerAssessment(value, {
      environment,
      fetchImpl: async (_url, options) => {
        const { signature, ...unsigned } = requestBody(options);
        assert.equal(
          verify(
            null,
            Buffer.from(`${TRIAGE_ASSESSMENT_DOMAIN}\0${canonical(unsigned)}`),
            publicKey,
            Buffer.from(signature.slice('ed25519='.length), 'base64url')
          ),
          true
        );
        assert.equal(unsigned.fenceLegacyGovernor, value.fenceLegacyGovernor);
        assert.equal(
          verify(
            null,
            Buffer.from(
              `${TRIAGE_ASSESSMENT_DOMAIN}\0${canonical({ ...unsigned, fenceLegacyGovernor: !unsigned.fenceLegacyGovernor })}`
            ),
            publicKey,
            Buffer.from(signature.slice('ed25519='.length), 'base64url')
          ),
          false
        );
        return Response.json(response);
      },
    });
  assert.equal(
    (await request(bound, observed)).legacyGovernorFence.authorizesTransition,
    false
  );
  for (const invalid of [
    { admissionDelegation: undefined },
    {
      admissionDelegation: { ...observed.admissionDelegation, writer: 'other' },
    },
    {
      admissionDelegation: { ...observed.admissionDelegation, contract: 'old' },
    },
    {
      admissionDelegation: {
        ...observed.admissionDelegation,
        status: 'allowed',
      },
    },
    {
      admissionDelegation: {
        ...observed.admissionDelegation,
        authorizesTransition: true,
      },
    },
    { legacyGovernorFence: undefined },
    { legacyGovernorFence: { ...governorFenceSet(), families: undefined } },
    ...[
      { contract: 'old' },
      { status: 'held' },
      { issueId: 'other' },
      { issueIdentifier: 'JOV-6641' },
      { idempotencyKey: 'a'.repeat(64) },
      { dispatchPath: `summer-company/linear-transitions/${key}/intent.json` },
      { authorizesTransition: true },
    ].map(value => ({
      legacyGovernorFence: { ...observed.legacyGovernorFence, ...value },
    })),
    { escalation: {} },
  ])
    await assert.rejects(
      request(bound, { ...observed, ...invalid }),
      /assessment-invalid/
    );
  for (const value of [undefined, false]) {
    const noFence = { ...bound };
    delete noFence.fenceLegacyGovernor;
    if (value !== undefined) noFence.fenceLegacyGovernor = value;
    await assert.rejects(request(noFence, observed), /assessment-invalid/);
    await request(noFence, backlogReceipt(version));
  }
  for (const value of ['true', 1, null])
    await assert.rejects(
      requestSummerAssessment(
        { ...bound, fenceLegacyGovernor: value },
        {
          environment,
          fetchImpl: async () =>
            assert.fail('invalid opt-in cannot reach Summer'),
        }
      ),
      /backlog-binding-invalid/
    );
  await assert.rejects(
    requestSummerAssessment(
      { ...delivery, fenceLegacyGovernor: true },
      {
        environment,
        fetchImpl: async () => assert.fail('unbound fence cannot reach Summer'),
      }
    ),
    /backlog-binding-invalid/
  );
});
