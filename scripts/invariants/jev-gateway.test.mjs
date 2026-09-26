import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateThroughGateway,
  freePromotionDigest,
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
    assert.ok(prepareJevRequest({ ...input, stage }).fingerprint);
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
    const body = JSON.parse(String(init.body));
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

// These are caller-verified fixture receipts, never real pricing authority.
const promotion = {
  gateway: JEV_ROUTE.provider,
  provider: 'typesafe-ai',
  model: JEV_ROUTE.model,
  endpoint: JEV_ROUTE.endpoint,
  credentialRef: 'fixture-key',
  evidenceRef: 'fixture://zero-price-including-fees',
  checkedAt: 900,
  expiresAt: 2500,
  inputUsdPerToken: 0,
  outputUsdPerToken: 0,
  feesUsd: 0,
  maxCalls: 1,
};
const freeResult = () => ({
  ...result(),
  answers: {
    alignment: {
      type: 'choice',
      choice: 'contradicted',
      probabilities: {
        supported: 0.01,
        contradicted: 0.97,
        insufficient: 0.01,
        'needs-specialist': 0.01,
      },
    },
  },
  providerMetadata: {
    gateway: {
      cost: '0',
      gatewayCost: '0.000',
      surchargeCost: 0,
      generationId: 'gen_fixture',
      routing: { canonicalSlug: JEV_ROUTE.model, finalProvider: 'typesafe-ai' },
    },
  },
});
function freeOptions(extra = {}) {
  let claimed = false;
  return options({
    credentialRef: 'fixture-key',
    approval: {
      ...options().approval,
      fundingMode: 'free-only',
      maxUsd: 0,
      estimatedUpperBoundUsd: 0,
      availableUsd: 0,
      promotion: { ...promotion },
      policyDigest: freePromotionDigest(promotion),
    },
    reserveFreeCall: () => {
      if (claimed) return 0;
      claimed = true;
      return 1;
    },
    transport: async () => freeResult(),
    ...extra,
  });
}

test('genuine zero admission retains actual cost, distribution and bounded claim', async () => {
  let claims = 0;
  const opts = freeOptions({
    reserveFreeCall: claim => {
      claims++;
      assert.equal(claim.maxCalls, 1);
      assert.equal(claim.fingerprint, request.fingerprint);
      assert.equal(claim.policyDigest, freePromotionDigest(promotion));
      return 1;
    },
  });
  const r = await runJevEvaluation(input, opts);
  assert.equal(r.status, 'evaluated');
  assert.equal(r.billedCostUsd, 0);
  assert.equal(r.generationId, 'gen_fixture');
  assert.equal(r.callNumber, 1);
  assert.deepEqual(
    r.probabilities,
    freeResult().answers.alignment.probabilities
  );
  assert.equal(r.certified, false);
  assert.equal(r.shipBlocking, false);
  assert.equal(claims, 1);
  const dedup = await runJevEvaluation(input, { ...opts, previous: r });
  assert.equal(dedup.status, 'unchanged');
  assert.equal(claims, 1);
  assert.equal(
    (
      await runJevEvaluation(
        input,
        options({
          approval: {
            ...options().approval,
            fundingMode: 'paid',
          },
        })
      )
    ).status,
    'evaluated'
  );
});

test('promotion rejects malformed, unknown, positive, stale and mismatched evidence before reservation', async () => {
  const deltas = [
    { gateway: 'direct' },
    { provider: 'other' },
    { model: 'other' },
    { endpoint: 'other' },
    { credentialRef: '' },
    { credentialRef: null },
    { credentialRef: 'other' },
    { evidenceRef: '' },
    { evidenceRef: null },
    { checkedAt: null },
    { checkedAt: 1001 },
    { checkedAt: -400000 },
    { expiresAt: null },
    { expiresAt: 999 },
    { expiresAt: 1500 },
    { inputUsdPerToken: null },
    { inputUsdPerToken: '0' },
    { inputUsdPerToken: 0.001 },
    { outputUsdPerToken: null },
    { outputUsdPerToken: 0.001 },
    { feesUsd: null },
    { feesUsd: 0.001 },
    { maxCalls: 0 },
    { maxCalls: 1.5 },
    { maxCalls: Infinity },
  ];
  let calls = 0;
  for (const delta of deltas) {
    const opts = freeOptions({
      reserveFreeCall: () => {
        calls++;
        return 1;
      },
    });
    opts.approval.promotion = { ...promotion, ...delta };
    opts.approval.policyDigest = freePromotionDigest(opts.approval.promotion);
    assert.equal(
      (await runJevEvaluation(input, opts)).status,
      'not-admitted',
      JSON.stringify(delta)
    );
  }
  for (const delta of [
    { promotion: null },
    { policyDigest: 'wrong' },
    { maxUsd: 0.01 },
    { estimatedUpperBoundUsd: 0.01 },
    { availableUsd: NaN },
    { availableUsd: -1 },
    { fundingMode: 'unknown' },
    { fundingApproved: false },
    { dataApproved: false },
    { authorityRef: '' },
    { fingerprint: 'wrong' },
  ]) {
    const opts = freeOptions({
      reserveFreeCall: () => {
        calls++;
        return 1;
      },
    });
    Object.assign(opts.approval, delta);
    assert.equal((await runJevEvaluation(input, opts)).status, 'not-admitted');
  }
  assert.equal(
    (await runJevEvaluation(input, freeOptions({ reserveFreeCall: undefined })))
      .status,
    'not-admitted'
  );
  assert.equal(
    (await runJevEvaluation(input, freeOptions({ credentialRef: 'different' })))
      .status,
    'not-admitted'
  );
  assert.equal(calls, 0);
});

test('finite atomic reservation stops concurrent duplicate calls and is consumed on failure', async () => {
  let calls = 0;
  const opts = freeOptions({
    transport: async () => {
      calls++;
      return freeResult();
    },
  });
  const receipts = await Promise.all([
    runJevEvaluation(input, opts),
    runJevEvaluation(input, opts),
  ]);
  assert.deepEqual(receipts.map(r => r.status).sort(), [
    'evaluated',
    'quota-exhausted',
  ]);
  assert.equal(calls, 1);
  for (const n of [NaN, 1.5, -1, 2]) {
    assert.equal(
      (await runJevEvaluation(input, freeOptions({ reserveFreeCall: () => n })))
        .status,
      'quota-exhausted'
    );
  }
  const fail = freeOptions({
    transport: async () => {
      calls++;
      throw Error('private');
    },
  });
  assert.equal((await runJevEvaluation(input, fail)).status, 'provider-error');
  assert.equal((await runJevEvaluation(input, fail)).status, 'quota-exhausted');
  assert.equal(calls, 2);
});

test('free admission rechecks expiry, payload and policy across reservation and postflight', async () => {
  for (const boundary of ['expiry', 'payload', 'policy', 'cancel', 'timeout']) {
    let time = 1000;
    let fingerprint = request.fingerprint;
    let calls = 0;
    const signal = new AbortController();
    const opts = freeOptions({
      now: () => time,
      signal: signal.signal,
      timeoutMs: 5,
      readCurrentFingerprint: () => fingerprint,
      transport: async () => {
        calls++;
        return freeResult();
      },
      reserveFreeCall: async () => {
        if (boundary === 'expiry') time = 3000;
        if (boundary === 'payload') fingerprint = 'changed';
        if (boundary === 'policy') opts.approval.promotion.feesUsd = 1;
        if (boundary === 'cancel') signal.abort();
        if (boundary === 'timeout') await new Promise(r => setTimeout(r, 20));
        return 1;
      },
    });
    assert.equal(
      (await runJevEvaluation(input, opts)).status,
      boundary === 'cancel'
        ? 'cancelled'
        : boundary === 'timeout'
          ? 'timeout'
          : 'stale'
    );
    await new Promise(r => setTimeout(r, 25));
    assert.equal(calls, 0);
  }
  let time = 1000;
  const opts = freeOptions({
    now: () => time,
    transport: async () => {
      time = 3000;
      return freeResult();
    },
  });
  const r = await runJevEvaluation(input, opts);
  assert.equal(r.status, 'stale');
  assert.equal(r.billedCostUsd, 0);
  assert.equal(r.alignment, undefined);
});

test('unknown or positive returned costs stop success and preserve observed charges', async () => {
  for (const cost of [
    null,
    undefined,
    '',
    false,
    {},
    'garbage',
    '-1',
    -1,
    Infinity,
  ]) {
    const raw = freeResult();
    Object.assign(raw.providerMetadata.gateway, { gatewayCost: cost });
    const r = await runJevEvaluation(
      input,
      freeOptions({ transport: async () => raw })
    );
    assert.equal(r.status, 'cost-unknown');
    assert.equal(r.billedCostUsd, null);
  }
  for (const field of ['cost', 'gatewayCost', 'surchargeCost']) {
    const raw = freeResult();
    raw.providerMetadata.gateway[field] = '0.005';
    const r = await runJevEvaluation(
      input,
      freeOptions({ transport: async () => raw })
    );
    assert.equal(r.status, 'cost-violation');
    assert.equal(r.alignment, undefined);
    assert.equal(r.generationId, 'gen_fixture');
    if (field === 'gatewayCost') assert.equal(r.billedCostUsd, 0.005);
  }
  const noId = freeResult();
  delete noId.providerMetadata.gateway.generationId;
  assert.equal(
    (
      await runJevEvaluation(
        input,
        freeOptions({ transport: async () => noId })
      )
    ).status,
    'cost-unknown'
  );
  for (const field of ['finalProvider', 'canonicalSlug']) {
    const raw = freeResult();
    raw.providerMetadata.gateway.routing[field] = 'wrong';
    assert.equal(
      (
        await runJevEvaluation(
          input,
          freeOptions({ transport: async () => raw })
        )
      ).status,
      'invalid-response'
    );
  }
  for (const raw of [null, result('unknown')]) {
    assert.equal(
      (
        await runJevEvaluation(
          input,
          freeOptions({ transport: async () => raw })
        )
      ).status,
      'cost-unknown'
    );
  }
  for (const raw of [
    { ...freeResult(), warnings: [{}] },
    {
      ...freeResult(),
      answers: { alignment: { type: 'choice', choice: 'unknown' } },
    },
  ]) {
    assert.equal(
      (
        await runJevEvaluation(
          input,
          freeOptions({ transport: async () => raw })
        )
      ).status,
      'invalid-response'
    );
  }
});

test('real pinned SDK preserves evaluation billing metadata and restricts free route', async () => {
  let calls = 0;
  const raw = await evaluateThroughGateway(request, {
    apiKey: 'test-fixture-only',
    freeOnly: true,
    fetch: async (url, init) => {
      calls++;
      assert.equal(url, JEV_ROUTE.endpoint);
      const body = JSON.parse(String(init.body));
      assert.deepEqual(body.providerOptions, {
        gateway: { only: ['typesafe-ai'], models: [JEV_ROUTE.model] },
      });
      return new Response(JSON.stringify(freeResult()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(calls, 1);
  assert.equal(raw.providerMetadata.gateway.gatewayCost, '0.000');
  assert.deepEqual(
    raw.answers.alignment.probabilities,
    freeResult().answers.alignment.probabilities
  );
});

test('malformed distributions cannot become evidence, and valid evidence is immutable', async () => {
  for (const p of [
    [],
    {},
    'wrong',
    { supported: 1 },
    { supported: NaN, contradicted: 0, insufficient: 0, 'needs-specialist': 0 },
    { supported: 2, contradicted: 0, insufficient: 0, 'needs-specialist': 0 },
    { supported: 0, contradicted: 0, insufficient: 0, 'needs-specialist': 0 },
  ]) {
    const raw = freeResult();
    Object.assign(raw.answers.alignment, { probabilities: p });
    assert.equal(
      (
        await runJevEvaluation(
          input,
          freeOptions({ transport: async () => raw })
        )
      ).status,
      'invalid-response'
    );
  }
  const raw = freeResult();
  const r = await runJevEvaluation(
    input,
    freeOptions({ transport: async () => raw })
  );
  raw.answers.alignment.probabilities.contradicted = 0;
  assert.equal(r.probabilities.contradicted, 0.97);
  assert.throws(() => {
    r.probabilities.contradicted = 0;
  });
  const tiny = freeResult();
  tiny.providerMetadata.gateway.gatewayCost = `0.${'0'.repeat(400)}1`;
  assert.equal(
    (
      await runJevEvaluation(
        input,
        freeOptions({ transport: async () => tiny })
      )
    ).status,
    'cost-unknown'
  );
});

test('cost failure takes precedence over postflight expiry and invalid response', async () => {
  for (const cost of ['0.005', null]) {
    let time = 1000;
    const raw = freeResult();
    Object.assign(raw.providerMetadata.gateway, { gatewayCost: cost });
    raw.answers.alignment.choice = 'invalid';
    const r = await runJevEvaluation(
      input,
      freeOptions({
        now: () => time,
        transport: async () => {
          time = 3000;
          return raw;
        },
      })
    );
    assert.equal(r.status, cost === null ? 'cost-unknown' : 'cost-violation');
    assert.equal(r.billedCostUsd, cost === null ? null : 0.005);
    assert.equal(r.alignment, undefined);
    assert.equal(r.shadow, undefined);
  }
});
