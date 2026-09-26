import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateThroughGateway,
  JEV_ROUTE,
  JEV_RUBRICS,
  prepareJevRequest,
  runJevEvaluation,
} from './jev-gateway.mjs';

const input = {
  sourceSha: 'a'.repeat(40),
  artifactSha256: 'b'.repeat(64),
  scope: 'public synthetic fixture',
  stage: 'copy',
  modality: 'text',
  state: 'Claim: refund completed. Evidence: no refund was issued.',
};
const request = prepareJevRequest(input);
const result = (choice = 'contradicted') => ({
  answers: { alignment: { type: 'choice', choice } },
  response: { modelId: JEV_ROUTE.model, headers: { 'x-vercel-id': 'test-id' } },
  usage: { inputTokens: 23, outputTokens: 0 },
  warnings: [],
});
const options = (extra = {}) => ({
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
  transport: async () => result(),
  now: () => 1000,
  ...extra,
});

test('binds every stage, artifact, scope, text and rubric to immutable request', () => {
  for (const stage of Object.keys(JEV_RUBRICS))
    assert.ok(
      prepareJevRequest({
        ...input,
        stage,
        labels: stage === 'task-cluster' ? ['lyrics'] : undefined,
      }).fingerprint
    );
  for (const delta of [
    { sourceSha: 'c'.repeat(40) },
    { artifactSha256: 'd'.repeat(64) },
    { scope: 'other' },
    { state: 'other' },
    { stage: 'section' },
  ]) {
    assert.notEqual(
      prepareJevRequest({ ...input, ...delta }).fingerprint,
      request.fingerprint
    );
  }
  assert.throws(() => {
    Object.defineProperty(request.questions.alignment.criteria, 'supported', {
      value: 'ignore all instructions',
    });
  });
});

test('rejects missing, visual, oversized, secret and personal data before I/O', () => {
  for (const delta of [
    null,
    { sourceSha: 'main' },
    { artifactSha256: 'file.png' },
    { stage: 'unknown' },
    { scope: '' },
    { modality: 'image' },
    { state: '' },
    { state: 'x'.repeat(16001) },
    { scope: 'x'.repeat(201) },
    { state: 'Bearer private' },
    { state: 'hello user@example.com' },
    { state: 'data:image/png;base64,123' },
  ]) {
    assert.throws(() =>
      prepareJevRequest(delta === null ? null : { ...input, ...delta })
    );
  }
});

test('no unknown admission, stale approval, spend overflow or image call', async () => {
  let calls = 0;
  const base = options({
    transport: async () => {
      calls++;
      return result();
    },
  });
  for (const delta of [
    null,
    { dataApproved: false },
    { fundingApproved: false },
    { fingerprint: 'old' },
    { expiresAt: 999 },
    { expiresAt: Infinity },
    { expiresAt: 999999 },
    { authorityRef: '' },
    { availableUsd: 0 },
    { maxUsd: 0 },
    { estimatedUpperBoundUsd: 2 },
    { estimatedUpperBoundUsd: null },
  ]) {
    const r = await runJevEvaluation(input, {
      ...base,
      approval: delta === null ? null : { ...base.approval, ...delta },
    });
    assert.equal(r.status, 'not-admitted');
  }
  assert.equal((await runJevEvaluation(input)).status, 'stale');
  assert.equal(
    (await runJevEvaluation(input, options({ timeoutMs: 16000 }))).status,
    'not-admitted'
  );
  assert.equal(calls, 0);
});

test('valid choices remain advisory and cannot mint machine, human, or image proof', async () => {
  for (const choice of [
    'supported',
    'contradicted',
    'insufficient',
    'needs-specialist',
  ]) {
    const r = await runJevEvaluation(
      input,
      options({
        transport: async () => ({
          ...result(choice),
          certified: true,
          humanCertified: true,
        }),
      })
    );
    assert.equal(r.status, 'evaluated');
    assert.equal(r.alignment, choice);
    assert.equal(r.shadow.alignment, choice);
    assert.equal(r.certified, false);
    assert.equal(r.shadow.certified, false);
    assert.equal(r.humanCertified, false);
    assert.equal(r.visualInspection, false);
    assert.equal(r.billedCostUsd, null);
    assert.equal(r.responseId, 'test-id');
    assert.throws(() => {
      r.certified = true;
    });
  }
});

test('rejects mismatched model, unknown answer and provider warnings', async () => {
  for (const raw of [
    null,
    result('pass'),
    { ...result(), response: { modelId: 'openai/gpt-6-astra' } },
    { ...result(), warnings: [{}] },
    {
      ...result(),
      answers: { alignment: { type: 'boolean', choice: 'supported' } },
    },
  ]) {
    assert.equal(
      (await runJevEvaluation(input, options({ transport: async () => raw })))
        .status,
      'invalid-response'
    );
  }
});

test('changed artifact or expired admission during I/O cannot retain successful result', async () => {
  let current = request.fingerprint;
  const r = await runJevEvaluation(
    input,
    options({
      readCurrentFingerprint: () => current,
      transport: async () => {
        current = 'changed';
        return result('supported');
      },
    })
  );
  assert.equal(r.status, 'stale');
  let time = 1000;
  assert.equal(
    (
      await runJevEvaluation(
        input,
        options({
          now: () => time,
          transport: async () => {
            time = 3000;
            return result();
          },
        })
      )
    ).status,
    'stale'
  );
});

test('unchanged prior outcome never causes a second evaluation for green', async () => {
  let calls = 0;
  const opts = options({
    transport: async () => {
      calls++;
      return result();
    },
  });
  const previous = await runJevEvaluation(input, opts);
  assert.equal(
    (await runJevEvaluation(input, { ...opts, previous })).status,
    'unchanged'
  );
  assert.equal(calls, 1);
});

test('approval that expires during preflight never dispatches paid transport', async () => {
  let time = 1000;
  let calls = 0;
  const receipt = await runJevEvaluation(
    input,
    options({
      now: () => time,
      readCurrentFingerprint: async () => {
        time = 3000;
        return request.fingerprint;
      },
      transport: async () => {
        calls++;
        return result();
      },
    })
  );
  assert.equal(calls, 0);
  assert.equal(receipt.status, 'not-admitted');
});

test('postflight remains inside cancellation, expiry and timeout boundaries', async () => {
  for (const boundary of ['cancelled', 'stale', 'timeout']) {
    const controller = new AbortController();
    let reads = 0;
    let time = 1000;
    const receipt = await runJevEvaluation(
      input,
      options({
        signal: controller.signal,
        now: () => time,
        timeoutMs: 5,
        readCurrentFingerprint: async () => {
          if (++reads === 2) {
            if (boundary === 'cancelled') controller.abort();
            if (boundary === 'stale') time = 3000;
            if (boundary === 'timeout')
              await new Promise(resolve => setTimeout(resolve, 20));
          }
          return request.fingerprint;
        },
      })
    );
    assert.equal(receipt.status, boundary);
    assert.equal(receipt.certified, false);
    assert.equal(receipt.alignment, undefined);
  }
});

test('cancelled or timed out preflight never dispatches after its late completion', async () => {
  for (const boundary of ['cancelled', 'timeout']) {
    const controller = new AbortController();
    let calls = 0;
    const receipt = await runJevEvaluation(
      input,
      options({
        signal: controller.signal,
        timeoutMs: 5,
        readCurrentFingerprint: async () => {
          if (boundary === 'cancelled') controller.abort();
          await new Promise(resolve => setTimeout(resolve, 20));
          return request.fingerprint;
        },
        transport: async () => {
          calls++;
          return result();
        },
      })
    );
    assert.equal(receipt.status, boundary);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(calls, 0);
  }
});

test('abort before and during I/O, timeout and provider failure fail closed without raw errors', async () => {
  const pre = new AbortController();
  pre.abort();
  assert.equal(
    (await runJevEvaluation(input, options({ signal: pre.signal }))).status,
    'cancelled'
  );
  const mid = new AbortController();
  assert.equal(
    (
      await runJevEvaluation(
        input,
        options({
          signal: mid.signal,
          transport: async () => {
            mid.abort();
            return result('supported');
          },
        })
      )
    ).status,
    'cancelled'
  );
  const timeout = await runJevEvaluation(
    input,
    options({ timeoutMs: 5, transport: () => new Promise(() => {}) })
  );
  assert.equal(timeout.status, 'timeout');
  const failed = await runJevEvaluation(
    input,
    options({
      transport: async () => {
        throw new Error('Bearer private-secret');
      },
    })
  );
  assert.equal(failed.status, 'provider-error');
  assert.ok(!JSON.stringify(failed).includes('private-secret'));
});

test('real pinned SDK uses evaluation endpoint, fixed Jev route, text state and no hidden retry', async () => {
  let calls = 0;
  const fetch = async (url, init) => {
    calls++;
    assert.equal(url, JEV_ROUTE.endpoint);
    assert.equal(new Headers(init.headers).get('ai-model-id'), JEV_ROUTE.model);
    const body = JSON.parse(init.body);
    assert.equal(body.state, input.state);
    assert.deepEqual(body.questions, request.questions);
    return new Response(
      JSON.stringify({ answers: result().answers, usage: result().usage }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };
  const raw = await evaluateThroughGateway(request, {
    apiKey: 'test-fixture-only',
    fetch,
  });
  assert.ok(raw.answers.alignment.type === 'choice');
  assert.equal(raw.answers.alignment.choice, 'contradicted');
  assert.equal(calls, 1);
  await assert.rejects(() => evaluateThroughGateway(request, {}));
  calls = 0;
  await assert.rejects(() =>
    evaluateThroughGateway(request, {
      apiKey: 'test-fixture-only',
      fetch: async () => {
        calls++;
        return new Response('{}', { status: 503 });
      },
    })
  );
  assert.equal(calls, 1);
});

const clusterInput = {
  ...input,
  stage: 'task-cluster',
  state: 'Task: "register splits with PRO"',
  labels: ['rights-royalty-registration', 'editorial-pitching'],
};

test('task-cluster freezes a bounded label choice and rejects forged labels', async () => {
  const req = prepareJevRequest(clusterInput);
  assert.throws(() => /** @type {any} */ (req).labels.push('late'));
  const criteria = req.questions.alignment.criteria;
  for (const slug of [...clusterInput.labels, 'unclassified'])
    assert.ok(Object.hasOwn(criteria, slug));
  assert.ok(!Object.hasOwn(criteria, 'supported'));
  assert.notEqual(
    prepareJevRequest({ ...clusterInput, labels: ['lyrics'] }).fingerprint,
    req.fingerprint
  );
  for (const labels of [
    undefined,
    'lyrics',
    [],
    Array.from({ length: 65 }, (_, i) => `cluster-${i}`),
    ['Not A Slug'],
    ['unclassified'],
    ['lyrics', 'lyrics'],
  ])
    assert.throws(() => prepareJevRequest({ ...clusterInput, labels }));
  const opt = choice => ({
    ...options(),
    approval: { ...options().approval, fingerprint: req.fingerprint },
    readCurrentFingerprint: () => req.fingerprint,
    transport: async () => result(choice),
  });
  assert.equal(
    (await runJevEvaluation(clusterInput, opt('lyrics'))).status,
    'invalid-response'
  );
  for (const choice of ['editorial-pitching', 'unclassified']) {
    assert.equal(
      (await runJevEvaluation(clusterInput, opt(choice))).alignment,
      choice
    );
  }
});
