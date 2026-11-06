import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  callRelay,
  encodeImages,
  routeFor,
  sampleJudge,
} from '../output-quality/judge-core.mjs';
import {
  buildContent,
  contaminated,
  judgeBuyer,
  MAX_IMAGES_PER_REQUEST,
  parseAnswer,
  planImages,
  STRONG_MODEL,
  strongRoute,
  usdFor,
} from './judge.mjs';
import { parseOutcome } from './outcome.mjs';
import {
  ARCHETYPES,
  aggregateSamples,
  assertNoIdentity,
  buildBuyerPrompt,
  fileableObjections,
  parseBuyerSample,
  publicPersonaBrief,
  readyFlag,
  redact,
} from './rubric.mjs';
import { domConfirms, summarizeScreen } from './screen.mjs';

const STEPS = [
  {
    stepId: '01',
    title: 'homepage',
    tSec: 3.4,
    images: ['/f/01.png'],
    text: 'Free forever',
  },
  {
    stepId: '02',
    title: 'preview',
    tSec: 25.3,
    images: ['/f/02.png'],
    text: 'jov.ie/your-handle 97 Spotify followers (source: enrichment)',
  },
];

const sample = (pPay, extra = {}) => ({
  pPay,
  pPay3x: pPay / 2,
  objections: [
    {
      text: 'nothing paid shown',
      stepId: '01',
      category: 'no_value_shown',
      severity: 'major',
    },
  ],
  valueEvidence: [],
  flipToPay: [
    {
      change: 'show the paid plan on the path',
      removesObjection: 1,
      kind: 'offer',
    },
  ],
  ...extra,
});

test('outcome is read from the pricing source of truth and fails closed', () => {
  const src = readFileSync(
    new URL('../../apps/web/lib/config/plan-prices.ts', import.meta.url),
    'utf8'
  );
  const outcome = parseOutcome(
    src,
    'export const PRO_TRIAL_DURATION_DAYS = 14;'
  );
  assert.equal(outcome.kind, 'paid_conversion');
  assert.ok(outcome.monthlyUsd > 0);
  assert.equal(outcome.trialDays, 14);
  assert.throws(() => parseOutcome('export const X = {}'), /could not read/);
});

test('objection timestamps come from the walk, never the model', () => {
  const parsed = parseBuyerSample(sample(0.1), STEPS);
  assert.equal(parsed.objections[0].tSec, 3.4);
  assert.throws(
    () =>
      parseBuyerSample(
        sample(0.1, {
          objections: [
            { text: 'x', stepId: '99', category: 'trust', severity: 'major' },
          ],
        }),
        STEPS
      ),
    /unknown step/
  );
  assert.throws(
    () => parseBuyerSample({ ...sample(0.1), pPay: 1.4 }, STEPS),
    /out of range/
  );
});

test('a sample that names a blocker cannot forecast a likely payment', () => {
  const parsed = parseBuyerSample(
    sample(0.7, {
      objections: [
        {
          text: 'error',
          stepId: '02',
          category: 'defect',
          severity: 'blocker',
        },
      ],
    }),
    STEPS
  );
  assert.equal(parsed.pPay, 0.2);
  assert.equal(parsed.capped, true);
});

test('pay needs median and lower bound; incoherent samples are dropped', () => {
  const parse = p => parseBuyerSample(sample(p), STEPS);
  assert.equal(
    aggregateSamples([parse(0.7), parse(0.72), parse(0.68)]).verdict,
    'pay'
  );
  assert.equal(
    aggregateSamples([parse(0.7), parse(0.72), parse(0.45)]).verdict,
    'abstain'
  );
  assert.equal(
    aggregateSamples([parse(0.05), parse(0.1), parse(0.02)]).verdict,
    'no_pay'
  );
  const incoherent = parseBuyerSample({ ...sample(0.7), pPay3x: 0.9 }, STEPS);
  const result = aggregateSamples([incoherent, incoherent, parse(0.7)]);
  assert.equal(result.verdict, 'abstain');
  assert.match(result.reason, /coherent/);
});

test('only objections repeated across samples become fix items', () => {
  const parse = (category, stepId) =>
    parseBuyerSample(
      sample(0.05, {
        objections: [{ text: 't', stepId, category, severity: 'major' }],
      }),
      STEPS
    );
  const result = aggregateSamples([
    parse('no_value_shown', '01'),
    parse('no_value_shown', '01'),
    parse('trust', '02'),
  ]);
  assert.deepEqual(
    fileableObjections(result).map(row => row.category),
    ['no_value_shown']
  );
});

test('ready flag has hysteresis', () => {
  assert.equal(readyFlag({ verdict: 'pay', pPay: 0.62 }, false), false);
  assert.equal(readyFlag({ verdict: 'pay', pPay: 0.66 }, false), true);
  assert.equal(readyFlag({ verdict: 'pay', pPay: 0.62 }, true), true);
});

test('Tier B personas accept public fields only and identity never leaves', () => {
  assert.throws(
    () => publicPersonaBrief({ genre: 'piano', email: 'a@b.co' }),
    /not allowed/
  );
  const brief = publicPersonaBrief({
    genre: 'piano',
    followerBucket: 'under 100',
    catalogSize: 20,
  });
  assert.match(brief, /piano/);
  const tokens = ['Ada Example', 'adaexample'];
  const scrubbed = redact(
    'Ada Example at jov.ie/adaexample wrote ada@example.com',
    tokens
  );
  assert.doesNotMatch(scrubbed, /Ada|adaexample|@example/);
  assert.doesNotThrow(() => assertNoIdentity(scrubbed, tokens));
  assert.throws(
    () => assertNoIdentity('the preview showed Ada Example', tokens),
    /write blocked/
  );
});

test('archetype briefs never name product features and include an off-ICP control', () => {
  for (const persona of ARCHETYPES)
    assert.doesNotMatch(persona.brief, /jovie|smart link|artist presence/i);
  assert.ok(ARCHETYPES.some(persona => persona.control));
});

test('stand-in walks tell the judge not to object to the stand-in numbers', () => {
  const outcome = {
    kind: 'paid_conversion',
    displayName: 'Plan',
    monthlyUsd: 12,
    trialDays: 14,
    horizonDays: 14,
  };
  const prompt = buildBuyerPrompt({
    persona: ARCHETYPES[0],
    outcome,
    steps: STEPS,
    standIn: true,
  });
  assert.match(prompt, /STAND-IN/);
  assert.match(prompt, /\$12\/month/);
  assert.match(prompt, /3\.4s/);
});

test('screen blockers need a deterministic DOM confirmation', () => {
  const answers = {
    '01': { placeholder_or_jargon: { noul: 0.9 } },
    '02': { placeholder_or_jargon: { noul: 0.9 } },
  };
  const result = summarizeScreen(STEPS, answers);
  assert.deepEqual(
    result.blockers.map(row => row.stepId),
    ['02']
  );
  assert.equal(
    domConfirms(
      'paid_ask_while_waitlisted',
      "You're on the list. Start Pro ($12/mo)"
    ),
    true
  );
  assert.equal(
    domConfirms('paid_ask_while_waitlisted', 'Start Pro ($12/mo)'),
    false
  );
});

test('judge output that cites company memory is flagged as contaminated', () => {
  assert.deepEqual(
    contaminated({ note: 'premium pricing at $300 per month' }, 'prompt'),
    ['$300', 'premium pricing']
  );
  assert.deepEqual(
    contaminated({ note: 'participate in the summer tour' }, 'prompt'),
    ['summer']
  );
  assert.deepEqual(contaminated({ note: 'participate' }, 'prompt'), []);
});

const OUTCOME = {
  kind: 'paid_conversion',
  displayName: 'Plan',
  monthlyUsd: 12,
  trialDays: 14,
  horizonDays: 14,
};
const fakeEncode = paths => ({
  mime: 'image/jpeg',
  bytes: Buffer.from(paths.join('|')),
});

test('strong tier routes through routing.json on Workers AI, never a subscription CLI', () => {
  const route = strongRoute();
  assert.equal(route.model, STRONG_MODEL);
  assert.match(STRONG_MODEL, /^@cf\//);
  assert.match(route.baseUrl, /^https:\/\//);
  assert.throws(
    () =>
      strongRoute({
        callers: [
          { id: 'dev.buyer-eval', route: 'gateway-only', models: ['x'] },
        ],
        providers: { 'workers-ai': {} },
      }),
    /workers-ai-only/
  );
});

test('frames are attached inline within the per-request image cap', () => {
  const many = Array.from({ length: 19 }, (_, i) => ({
    stepId: String(i + 1).padStart(2, '0'),
    images: [`/f/${i}-shot.png`, `/f/${i}-video.jpg`],
  }));
  const plan = planImages(many);
  assert.ok(plan.length <= MAX_IMAGES_PER_REQUEST);
  assert.deepEqual(
    plan.flatMap(unit => unit.paths),
    many.map(step => step.images[0])
  );
  assert.match(plan[0].label, /STEPS 01, 02, 03/);
  assert.equal(planImages(STEPS).length, 2);
  const content = buildContent('prompt', STEPS, fakeEncode);
  assert.equal(content.filter(part => part.type === 'image_url').length, 2);
  assert.match(content[1].text, /STEP 01/);
  assert.ok(!JSON.stringify(content).includes('Read tool'));
});

test('judge aggregates injected samples, prices neurons and drops bad samples', async () => {
  const good = JSON.stringify(sample(0.1));
  const answers = [
    { text: good, usage: { neurons: 1000, prompt_tokens: 10 } },
    { text: `\`\`\`json\n${good}\n\`\`\``, usage: { neurons: 1000 } },
    {
      text: JSON.stringify(sample(0.1, { note: 'premium pricing' })),
      usage: {},
    },
  ];
  const calls = [];
  const result = await judgeBuyer({
    persona: ARCHETYPES[0],
    outcome: OUTCOME,
    walk: { steps: STEPS, subjectId: null },
    encode: fakeEncode,
    call: async args => {
      calls.push(args);
      return answers[calls.length - 1];
    },
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].model, STRONG_MODEL);
  assert.equal(calls[0].schema.type, 'object');
  assert.equal(result.samples.length, 2);
  assert.match(result.failures[0], /contaminated/);
  assert.ok(Math.abs(result.costUsd - 0.022) < 1e-9);
  assert.equal(usdFor({}), 0);
  assert.throws(() => parseAnswer('not json'));
});

test('a transport failure is a recorded failure, never a pass', async () => {
  const result = await judgeBuyer({
    persona: ARCHETYPES[0],
    outcome: OUTCOME,
    walk: { steps: STEPS, subjectId: null },
    encode: fakeEncode,
    call: async () => {
      throw new Error('workers-ai relay 502');
    },
  });
  assert.equal(result.samples.length, 0);
  assert.equal(result.failures.length, 3);
  assert.equal(aggregateSamples(result.samples).verdict, 'abstain');
});

/**
 * @param {unknown} body
 * @param {{status?: number, text?: string, observe?: (request: import('../../packages/api-client/client.ts').RequestOptions, options: import('../../packages/api-client/client.ts').ApiClientOptions) => void}} [config]
 * @returns {typeof import('../../packages/api-client/client.ts').createApiClient}
 */
function fixtureRelayClient(body, config = {}) {
  return options => ({
    provider: options.provider,
    credential: options.credential,
    state: async () => null,
    request: async request => {
      config.observe?.(request, options);
      return {
        status: config.status ?? 200,
        headers: new Headers(),
        text: config.text ?? JSON.stringify(body),
        fromCache: null,
        attempts: 1,
        json: () => JSON.parse(JSON.stringify(body)),
      };
    },
  });
}

test('shared judge rejects missing or unsanctioned routes before transport', () => {
  const routing = {
    callers: [
      {
        id: 'fixture',
        route: 'workers-ai-only',
        models: ['vision', 'fallback'],
      },
    ],
    providers: {
      'workers-ai': { relayBaseUrl: 'https://relay.example.invalid/v1' },
    },
  };
  assert.deepEqual(routeFor('fixture', routing), {
    id: 'fixture',
    model: 'vision',
    models: ['vision', 'fallback'],
    baseUrl: 'https://relay.example.invalid/v1',
  });
  assert.throws(() => routeFor('missing', routing), /has no missing caller/);
  assert.throws(
    () =>
      routeFor('fixture', {
        ...routing,
        callers: [{ id: 'fixture', route: 'external', models: ['vision'] }],
      }),
    /must be workers-ai-only/
  );
  assert.throws(
    () =>
      routeFor('fixture', {
        ...routing,
        callers: [{ id: 'fixture', route: 'workers-ai-only', models: [] }],
      }),
    /has no fixture caller/
  );
});

test('shared relay preserves authorization, bounded request and response contracts with injected transport', async () => {
  let calls = 0;
  const content = [{ type: 'text', text: 'fixture prompt' }];
  const schema = { type: 'object' };
  const result = await callRelay({
    model: 'fixture-model',
    content,
    schema,
    schemaName: 'fixture_schema',
    timeoutMs: 1234,
    maxTokens: 512,
    baseUrl: 'https://unused.example.invalid',
    env: {
      WORKERS_AI_TOKEN: ' fixture-token ',
      WORKERS_AI_BASE_URL: 'https://relay.example.invalid/v1///',
    },
    createClient: fixtureRelayClient(
      {
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { neurons: 100 },
      },
      {
        observe(request, options) {
          calls += 1;
          assert.equal(options.provider, 'cloudflare');
          assert.ok(
            options.credential && !options.credential.includes('fixture-token')
          );
          const headers = new Headers();
          options.authorize?.(headers);
          assert.equal(headers.get('Authorization'), 'Bearer fixture-token');
          assert.equal(
            request.url,
            'https://relay.example.invalid/v1/chat/completions'
          );
          assert.equal(request.method, 'POST');
          assert.equal(request.maxAttempts, 2);
          assert.equal(request.timeoutMs, 1234);
          assert.equal(request.maxWaitMs, 1234);
          assert.equal(request.write, false);
          assert.equal(request.idempotent, true);
          assert.deepEqual(request.body, {
            model: 'fixture-model',
            max_tokens: 512,
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'fixture_schema', strict: true, schema },
            },
            messages: [{ role: 'user', content }],
          });
        },
      }
    ),
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { text: '{"ok":true}', usage: { neurons: 100 } });
  const defaulted = await callRelay({
    model: 'fixture-model',
    content,
    schema,
    baseUrl: 'https://fallback.example.invalid/v1/',
    env: { WORKERS_AI_TOKEN: 'fixture-token' },
    createClient: fixtureRelayClient(
      { choices: [{ message: { content: '{}' } }] },
      {
        observe(request) {
          assert.equal(
            request.url,
            'https://fallback.example.invalid/v1/chat/completions'
          );
          assert.equal(request.timeoutMs, 300_000);
          assert.deepEqual(request.body, {
            model: 'fixture-model',
            max_tokens: 12_000,
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'audience_judgement', strict: true, schema },
            },
            messages: [{ role: 'user', content }],
          });
        },
      }
    ),
  });
  assert.deepEqual(defaulted, { text: '{}', usage: {} });
});

test('shared relay rejects missing credentials, failed responses, truncation and absent answers', async () => {
  const options = {
    model: 'fixture',
    content: [],
    schema: {},
    baseUrl: 'https://relay.example.invalid',
    env: { WORKERS_AI_TOKEN: 'fixture-token' },
  };
  await assert.rejects(
    callRelay({
      ...options,
      env: {},
      createClient: () => {
        throw new Error('constructor must not run');
      },
    }),
    /WORKERS_AI_TOKEN not set/
  );
  await assert.rejects(
    callRelay({
      ...options,
      createClient: fixtureRelayClient(
        {},
        { status: 503, text: 'x'.repeat(300) }
      ),
    }),
    error => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, `workers-ai relay 503: ${'x'.repeat(200)}`);
      return true;
    }
  );
  await assert.rejects(
    callRelay({
      ...options,
      createClient: fixtureRelayClient({
        choices: [{ finish_reason: 'length' }],
      }),
    }),
    /answer truncated/
  );
  for (const body of [
    {},
    { choices: [] },
    { choices: [{}] },
    { choices: [{ message: { content: '' } }] },
  ]) {
    await assert.rejects(
      callRelay({ ...options, createClient: fixtureRelayClient(body) }),
      /returned no answer/
    );
  }
});

test('shared encoder removes its temporary output after unreadable input failures', () => {
  const root = mkdtempSync(join(tmpdir(), 'judge-cleanup-owner-'));
  const previous = process.env.TMPDIR;
  try {
    process.env.TMPDIR = root;
    const missing = join(root, 'missing-fixture.ppm');
    assert.throws(() => encodeImages([missing]), /could not encode images/);
    assert.deepEqual(readdirSync(root), []);
    assert.throws(
      () => encodeImages([missing, missing]),
      /could not encode images/
    );
    assert.deepEqual(readdirSync(root), []);
  } finally {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

test('shared sampling records malformed and rejected results without manufacturing a pass', async () => {
  const answers = [
    { text: 'not JSON', usage: { neurons: 1000, completion_tokens: 2 } },
    { text: '{"ok":true}', usage: { neurons: 1000, prompt_tokens: 3 } },
  ];
  const result = await sampleJudge({
    model: 'fixture',
    prompt: 'fixture',
    content: [],
    schema: {},
    samples: 3,
    call: async () => {
      const next = answers.shift();
      if (!next) throw new Error('fixture transport refused');
      return next;
    },
  });
  assert.deepEqual(result.samples, [{ ok: true }]);
  assert.equal(result.failures.length, 2);
  assert.ok(
    result.failures.some(reason => reason === 'fixture transport refused')
  );
  assert.equal(result.costUsd, 0.022);
  assert.equal(result.inputTokens, 3);
  assert.equal(result.outputTokens, 2);
  const emptyUsage = await sampleJudge({
    model: 'fixture',
    prompt: 'fixture',
    content: [],
    schema: {},
    call: async () => ({ text: '{}', usage: {} }),
  });
  assert.deepEqual(emptyUsage.samples, [{}]);
});
