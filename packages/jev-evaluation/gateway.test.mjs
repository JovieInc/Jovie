import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  evaluateThroughGateway,
  JEV_ROUTE,
  JEV_RUBRICS,
  prepareJevChoiceRequest,
  prepareJevRequest,
  prepareProfileCompletenessRequest,
  runJevChoiceEvaluation,
  runJevEvaluation,
  runProfileCompletenessEvaluation,
} from './gateway.mjs';

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

const choiceInput = {
  ...input,
  objective: 'Choose the feasible design for reviewing identity matches.',
  choices: [
    {
      id: 'decision_queue',
      description: 'Show identity work first with source inspection.',
    },
    {
      id: 'platform_inventory',
      description: 'Browse all pages by platform with status.',
    },
    {
      id: 'identity_comparison',
      description: 'Requires unavailable image comparison and confirmation.',
    },
  ],
};
const choiceOptions = (extra = {}) => {
  const fingerprint = prepareJevChoiceRequest(choiceInput).fingerprint;
  const base = options();
  return {
    ...base,
    approval: { ...base.approval, fingerprint },
    readCurrentFingerprint: () => fingerprint,
    transport: async () => result('decision_queue'),
    ...extra,
  };
};

test('choice binds immutable candidate IDs, descriptions and objective to reviewed text', () => {
  const prepared = prepareJevChoiceRequest(choiceInput);
  assert.equal(prepared.stage, 'choice');
  assert.deepEqual(Object.keys(prepared.questions.alignment.criteria), [
    'decision_queue',
    'platform_inventory',
    'identity_comparison',
    'insufficient',
  ]);
  for (const delta of [
    { objective: 'Different objective' },
    {
      choices: choiceInput.choices.map((c, i) =>
        i ? c : { ...c, id: 'other' }
      ),
    },
    {
      choices: choiceInput.choices.map((c, i) =>
        i ? c : { ...c, description: 'Different evidence' }
      ),
    },
    { choices: [...choiceInput.choices].reverse() },
  ])
    assert.notEqual(
      prepareJevChoiceRequest({ ...choiceInput, ...delta }).fingerprint,
      prepared.fingerprint
    );
  assert.throws(() =>
    Object.defineProperty(
      prepared.questions.alignment.criteria,
      'decision_queue',
      { value: 'override' }
    )
  );
  const copied = {
    ...choiceInput,
    choices: choiceInput.choices.map(c => ({ ...c })),
  };
  const original = prepareJevChoiceRequest(copied);
  copied.choices[0].description = 'Changed after preparation';
  assert.equal(original.fingerprint, prepared.fingerprint);
  assert.ok(!original.state.includes('Changed after preparation'));
});

test('choice rejects invalid candidates and screens every provider-bound field before I/O', () => {
  for (const delta of [
    null,
    { choices: null },
    { choices: [] },
    { choices: [choiceInput.choices[0]] },
    { choices: Array(6).fill(choiceInput.choices[0]) },
    { objective: null },
    { objective: '' },
    { objective: 'x'.repeat(2001) },
    { choices: [null, choiceInput.choices[1]] },
    { choices: [{ id: 12, description: 'x' }, choiceInput.choices[1]] },
    {
      choices: [{ id: '__proto__', description: 'x' }, choiceInput.choices[1]],
    },
    {
      choices: [
        { id: 'insufficient', description: 'x' },
        choiceInput.choices[1],
      ],
    },
    { choices: [choiceInput.choices[0], choiceInput.choices[0]] },
    { choices: [{ id: 'a', description: null }, choiceInput.choices[1]] },
    { choices: [{ id: 'a', description: '' }, choiceInput.choices[1]] },
    {
      choices: [
        { id: 'a', description: 'x'.repeat(2001) },
        choiceInput.choices[1],
      ],
    },
    { state: null },
    { state: '' },
    { state: 'x'.repeat(16001) },
    { objective: 'Bearer private' },
    { objective: 'Bearer\tsynthetic_token' },
    { state: 'Bearer\nsynthetic_token' },
    {
      choices: [
        { id: 'a', description: 'Bearer\tsynthetic_token' },
        choiceInput.choices[1],
      ],
    },
    {
      choices: [
        { id: 'a', description: 'user@example.com' },
        choiceInput.choices[1],
      ],
    },
  ])
    assert.throws(() =>
      prepareJevChoiceRequest(
        delta === null ? null : { ...choiceInput, ...delta }
      )
    );
});

test('choice returns declared IDs or abstention without alignment, rationale or authority', async () => {
  for (const choice of [
    ...choiceInput.choices.map(c => c.id),
    'insufficient',
  ]) {
    const r = await runJevChoiceEvaluation(
      choiceInput,
      choiceOptions({ transport: async () => result(choice) })
    );
    assert.equal(r.schema, 'jev-choice-receipt/v1');
    assert.equal(
      r.status,
      choice === 'insufficient' ? 'insufficient' : 'evaluated'
    );
    assert.equal(r.selectedChoice, choice === 'insufficient' ? null : choice);
    for (const key of [
      'visualInspection',
      'certified',
      'humanCertified',
      'shipBlocking',
    ])
      assert.equal(r[key], false);
    for (const key of ['alignment', 'rationale', 'shadow'])
      assert.equal(Object.hasOwn(r, key), false);
    assert.equal(r.billedCostUsd, null);
  }
  const unknown = await runJevChoiceEvaluation(
    choiceInput,
    choiceOptions({ transport: async () => result('supported') })
  );
  assert.equal(unknown.status, 'invalid-response');
  assert.equal(Object.hasOwn(unknown, 'selectedChoice'), false);
  const minimal = await runJevChoiceEvaluation(
    choiceInput,
    choiceOptions({
      transport: async () => ({
        answers: { alignment: { type: 'choice', choice: 'decision_queue' } },
        response: { modelId: JEV_ROUTE.model },
      }),
    })
  );
  assert.equal(minimal.responseId, null);
  assert.equal(minimal.inputTokens, null);
  assert.equal(minimal.outputTokens, null);
});

test('choice shares authoritative admission, stale evidence, deduplication and deadline guards', async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    return result('decision_queue');
  };
  assert.equal((await runJevChoiceEvaluation(choiceInput)).status, 'stale');
  for (const delta of [
    { approval: null },
    { approval: { ...choiceOptions().approval, dataApproved: false } },
    { approval: { ...choiceOptions().approval, expiresAt: 999 } },
    { approval: { ...choiceOptions().approval, maxUsd: 0 } },
    { approval: { ...choiceOptions().approval, estimatedUpperBoundUsd: 1 } },
    { readCurrentFingerprint: () => 'stale' },
    {
      previous: {
        requestFingerprint: prepareJevChoiceRequest(choiceInput).fingerprint,
      },
    },
  ]) {
    const r = await runJevChoiceEvaluation(
      choiceInput,
      choiceOptions({ transport, ...delta })
    );
    assert.ok(['stale', 'not-admitted', 'unchanged'].includes(r.status));
  }
  assert.equal(calls, 0);
  const aborter = new AbortController();
  aborter.abort();
  assert.equal(
    (
      await runJevChoiceEvaluation(
        choiceInput,
        choiceOptions({ transport, signal: aborter.signal })
      )
    ).status,
    'cancelled'
  );
  /** @type {((value: string) => void) | undefined} */
  let release;
  const pending = new Promise(resolve => {
    release = resolve;
  });
  assert.equal(
    (
      await runJevChoiceEvaluation(
        choiceInput,
        choiceOptions({
          transport,
          readCurrentFingerprint: () => pending,
          timeoutMs: 5,
        })
      )
    ).status,
    'timeout'
  );
  assert.ok(release);
  release(prepareJevChoiceRequest(choiceInput).fingerprint);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
  let reads = 0;
  const stale = await runJevChoiceEvaluation(
    choiceInput,
    choiceOptions({
      transport,
      readCurrentFingerprint: () =>
        ++reads === 1
          ? prepareJevChoiceRequest(choiceInput).fingerprint
          : 'changed',
    })
  );
  assert.equal(stale.status, 'stale');
  assert.equal(Object.hasOwn(stale, 'selectedChoice'), false);
});

test('pinned SDK emits exactly the declared Choice question and rejects provider errors without retry', async () => {
  const prepared = prepareJevChoiceRequest(choiceInput);
  let calls = 0;
  const r = await runJevChoiceEvaluation(
    choiceInput,
    choiceOptions({
      apiKey: 'test-fixture-only',
      transport: (request, opts) =>
        evaluateThroughGateway(request, {
          ...opts,
          fetch: async (url, init) => {
            calls++;
            assert.equal(url, JEV_ROUTE.endpoint);
            assert.ok(typeof init.body === 'string');
            const body = JSON.parse(init.body);
            assert.deepEqual(body.questions, prepared.questions);
            assert.equal(body.state, prepared.state);
            return new Response(
              JSON.stringify({
                answers: result('platform_inventory').answers,
                usage: result().usage,
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            );
          },
        }),
    })
  );
  assert.equal(r.selectedChoice, 'platform_inventory');
  assert.equal(calls, 1);
  const failed = await runJevChoiceEvaluation(
    choiceInput,
    choiceOptions({
      transport: async () => {
        throw new Error('private-provider-error');
      },
    })
  );
  assert.equal(failed.status, 'provider-error');
  assert.ok(!JSON.stringify(failed).includes('private-provider-error'));
});

const completeSnapshot = {
  profileId: '00000000-0000-4000-8000-000000000001',
  username: 'synthetic-echo',
  displayName: 'Synthetic Echo',
  avatarUrl: 'https://example.com/echo.jpg',
  bio: 'A synthetic songwriter releasing an acoustic EP.',
  destinations: [{ platform: 'website', url: 'https://example.com/echo' }],
  provenance: [
    {
      kind: 'public_source',
      referenceId: 'synthetic',
      url: 'https://example.com/echo',
    },
  ],
};
const completenessInput = (snapshot = completeSnapshot) => {
  const snapshotJson = JSON.stringify(snapshot);
  return {
    sourceSha: input.sourceSha,
    profileId: completeSnapshot.profileId,
    snapshotJson,
    snapshotSha256: createHash('sha256').update(snapshotJson).digest('hex'),
    policyVersion: /** @type {const} */ ('profile-completeness/v1'),
    checks: {
      identity: true,
      photo: true,
      content: true,
      destinations: true,
      provenance: true,
    },
  };
};
const completenessOptions = (value, choice = 'supported', extra = {}) => {
  const prepared = prepareProfileCompletenessRequest(value);
  return options({
    approval: { ...options().approval, fingerprint: prepared.fingerprint },
    readCurrentFingerprint: () => prepared.fingerprint,
    transport: async () => result(choice),
    ...extra,
  });
};

test('completeness binds exact snapshot, checks, profile and policy; rejects invalid and sensitive evidence', () => {
  const value = completenessInput();
  const prepared = prepareProfileCompletenessRequest(value);
  assert.equal(prepared.artifactSha256, value.snapshotSha256);
  assert.equal(prepared.stage, 'completeness');
  const next = completenessInput({
    ...completeSnapshot,
    bio: 'Changed public biography',
  });
  assert.notEqual(
    prepared.fingerprint,
    prepareProfileCompletenessRequest(next).fingerprint
  );
  assert.notEqual(
    prepared.fingerprint,
    prepareProfileCompletenessRequest({
      ...value,
      checks: { ...value.checks, photo: false },
    }).fingerprint
  );
  for (const invalid of [
    null,
    { ...value, profileId: 'invalid' },
    { ...value, policyVersion: 'v2' },
    { ...value, snapshotJson: null },
    { ...value, snapshotJson: 'x'.repeat(14001) },
    { ...value, snapshotSha256: 'x' },
    { ...value, snapshotSha256: '0'.repeat(64) },
    { ...value, checks: null },
    { ...value, checks: {} },
    { ...value, checks: { ...value.checks, photo: 'yes' } },
    completenessInput({
      ...completeSnapshot,
      profileId: '00000000-0000-4000-8000-000000000002',
    }),
    completenessInput({ ...completeSnapshot, bio: 'Bearer\nsecret-value' }),
    completenessInput({
      ...completeSnapshot,
      ['Bearer\tsynthetic_token']: 'public',
    }),
    completenessInput({ ...completeSnapshot, bio: 'contact@example.com' }),
  ])
    assert.throws(() => {
      // @ts-expect-error Deliberately exercise malformed runtime inputs.
      prepareProfileCompletenessRequest(invalid);
    });
  const malformed = '{';
  assert.throws(() =>
    prepareProfileCompletenessRequest({
      ...value,
      snapshotJson: malformed,
      snapshotSha256: createHash('sha256').update(malformed).digest('hex'),
    })
  );
});

test('each missing mandatory completeness field skips the model and cannot pass', async () => {
  let calls = 0;
  for (const key of Object.keys(completenessInput().checks)) {
    const value = completenessInput();
    value.checks[key] = false;
    const assessment = await runProfileCompletenessEvaluation(
      value,
      completenessOptions(value, 'supported', {
        transport: async () => {
          calls++;
          return result('supported');
        },
      })
    );
    assert.equal(assessment.transportStatus, 'not_evaluated');
    assert.equal(assessment.verdict, null);
    assert.equal(assessment.evaluatedAt, null);
    assert.deepEqual(assessment.reasons, [`missing_${key}`]);
  }
  assert.equal(calls, 0);
});

test('completeness returns typed model judgments without confidence or ownership claims', async () => {
  const value = completenessInput();
  for (const choice of [
    'supported',
    'contradicted',
    'insufficient',
    'needs-specialist',
  ]) {
    const assessment = await runProfileCompletenessEvaluation(
      value,
      completenessOptions(value, choice)
    );
    const verdict = choice === 'needs-specialist' ? 'insufficient' : choice;
    assert.deepEqual(assessment, {
      schemaVersion: 'profile-completeness/v1',
      profileId: value.profileId,
      snapshotSha256: value.snapshotSha256,
      policyVersion: 'profile-completeness/v1',
      evaluatedAt: new Date(1000).toISOString(),
      model: 'typesafe-ai/jev',
      transportStatus: 'evaluated',
      verdict,
      reasons: [`jev_${verdict}`],
      confidence: null,
    });
  }
});

test('unadmitted, changed, unchanged, failed and invalid responses never become completeness passes', async () => {
  const value = completenessInput();
  const fingerprint = prepareProfileCompletenessRequest(value).fingerprint;
  const cases = [
    [{ approval: null }, 'not_evaluated', 'evaluation_not_admitted'],
    [
      { readCurrentFingerprint: () => 'changed' },
      'not_evaluated',
      'evaluation_stale',
    ],
    [
      { previous: { requestFingerprint: fingerprint, status: 'evaluated' } },
      'not_evaluated',
      'evaluation_unchanged',
    ],
    [
      {
        transport: async () => {
          throw Error('provider secret');
        },
      },
      'failed',
      'evaluation_failed',
    ],
    [
      { transport: async () => result('invalid') },
      'failed',
      'evaluation_failed',
    ],
  ];
  for (const [extra, status, reason] of cases) {
    const assessment = await runProfileCompletenessEvaluation(
      value,
      completenessOptions(value, 'supported', extra)
    );
    assert.equal(assessment.transportStatus, status);
    assert.equal(assessment.verdict, null);
    assert.equal(assessment.evaluatedAt, null);
    assert.deepEqual(assessment.reasons, [reason]);
  }
  let reads = 0;
  const stale = await runProfileCompletenessEvaluation(
    value,
    completenessOptions(value, 'supported', {
      readCurrentFingerprint: () =>
        ++reads === 1 ? fingerprint : 'edited-during-evaluation',
    })
  );
  assert.equal(stale.verdict, null);
  assert.deepEqual(stale.reasons, ['evaluation_stale']);
  assert.equal((await runProfileCompletenessEvaluation(value)).verdict, null);
});
