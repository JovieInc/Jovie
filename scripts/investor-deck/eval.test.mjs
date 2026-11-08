import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callRelay } from '../output-quality/judge-core.mjs';
import { ANCHOR, HOLDOUTS } from './calibration.mjs';
import {
  calibrationHolds,
  investContaminated,
  investRoute,
  judgeDeck,
  relativeVerdicts,
} from './eval.mjs';
import { passingGateInput, sample } from './fixtures/deck.mjs';
import { PERSONA_LABEL, PERSONAS } from './personas.mjs';
import { aggregateInvest, parseInvestSample } from './rubric.mjs';

test('personas are labeled simulations built from public sources', () => {
  assert.equal(PERSONAS.length, 6);
  assert.match(PERSONA_LABEL, /SIMULATION/u);
  for (const p of PERSONAS) assert.ok(p.modelledOn && p.brief && p.program);
  assert.equal(HOLDOUTS.length >= 3, true);
  assert.ok(ANCHOR.deck.length > 200);
});

test('route is Workers AI only, never a subscription CLI', () => {
  const route = investRoute();
  assert.match(route.baseUrl, /workers\.dev/u);
  assert.throws(
    () =>
      investRoute({
        callers: [
          { id: 'dev.investor-eval', route: 'gateway-first', models: ['m'] },
        ],
        providers: {},
      }),
    /workers-ai-only/u
  );
});

test('samples must be coherent; aggregation needs median and floor', () => {
  const mismatch = parseInvestSample(sample(0.2, { verdict: 'invest' }));
  assert.equal(mismatch.verdict, 'pass');
  assert.equal(mismatch.verdictMismatch, true);
  assert.throws(() => parseInvestSample(sample(1.4)), /out of range/u);
  const yes = aggregateInvest(
    [0.6, 0.55, 0.7].map(p => parseInvestSample(sample(p)))
  );
  assert.equal(yes.verdict, 'invest');
  const lowFloor = aggregateInvest(
    [0.6, 0.55, 0.2].map(p => parseInvestSample(sample(p)))
  );
  assert.equal(lowFloor.verdict, 'pass');
  assert.equal(
    aggregateInvest([parseInvestSample(sample(0.9))]).verdict,
    'abstain'
  );
});

test('a relay failure abstains, it never yields invest', async () => {
  const result = await judgeDeck({
    persona: PERSONAS[0],
    deck: 'SLIDE 1',
    samples: 3,
    route: { model: 'm', baseUrl: 'https://x.workers.dev/v1' },
    call: async () => {
      throw new Error('workers-ai relay 502');
    },
  });
  assert.equal(result.verdict, 'abstain');
  assert.equal(result.failures.length, 3);
});

test('calibration needs all holdouts below the anchor for at least five personas', () => {
  const { evalReport } = passingGateInput();
  const rows = evalReport.calibrationRows;
  rows.find(r => r.persona === PERSONAS[2].id && r.deck === HOLDOUTS[0].id).p =
    0.4;
  const cal = calibrationHolds(rows);
  assert.equal(cal.ok, true);
  assert.deepEqual(cal.unseparated, [PERSONAS[2].id]);
  const scored = relativeVerdicts(
    [
      { persona: PERSONAS[0].id, p: 0.35 },
      { persona: PERSONAS[1].id, p: 0.2 },
      { persona: PERSONAS[2].id, p: 0.9 },
    ],
    cal
  );
  assert.deepEqual(
    scored.map(s => s.relative),
    ['invest', 'pass', 'unscored']
  );
  rows.find(r => r.persona === PERSONAS[1].id && r.deck === ANCHOR.id).verdict =
    'abstain';
  assert.equal(calibrationHolds(rows).ok, false);
});

test('investor contamination ignores ordinary investor words', () => {
  assert.deepEqual(
    investContaminated({ t: 'ICP is unclear this summer' }, 'prompt'),
    []
  );
  assert.deepEqual(investContaminated({ t: 'like Ovie' }, 'prompt'), ['ovie']);
});

test('calibration requires every expected persona and every distinct holdout', () => {
  const { evalReport } = passingGateInput();
  assert.equal(calibrationHolds(evalReport.calibrationRows).ok, true);
  const onePersona = evalReport.calibrationRows.filter(
    r => r.persona === PERSONAS[0].id
  );
  assert.equal(calibrationHolds(onePersona).ok, false);
  const noThirdHoldout = evalReport.calibrationRows.filter(
    r => r.deck !== HOLDOUTS[2].id
  );
  assert.equal(calibrationHolds(noThirdHoldout).ok, false);
  const duplicated = noThirdHoldout.concat(
    noThirdHoldout.filter(r => r.deck === HOLDOUTS[0].id)
  );
  assert.equal(calibrationHolds(duplicated).ok, false);
});

test('investor samples use maintained shared transport policy and investor-specific contamination', async () => {
  const requests = [];
  const options = [];
  /** @type {typeof import('../../packages/api-client/client.ts').createApiClient} */
  const createClient = option => {
    options.push(option);
    return {
      provider: option.provider,
      credential: option.credential,
      state: async () => null,
      request: async request => {
        requests.push(request);
        return {
          status: 200,
          headers: new Headers(),
          text: '',
          fromCache: null,
          attempts: 1,
          json: () =>
            JSON.parse(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify(
                        sample(0.6, { for: ['ICP is clear this summer'] })
                      ),
                    },
                  },
                ],
                usage: {},
              })
            ),
        };
      },
    };
  };
  const result = await judgeDeck({
    persona: PERSONAS[0],
    deck: 'Synthetic company.',
    samples: 3,
    route: {
      model: 'synthetic-model',
      baseUrl: 'https://synthetic.invalid/v1',
    },
    call: args =>
      callRelay({
        ...args,
        env: { WORKERS_AI_TOKEN: 'synthetic-test-credential' },
        createClient,
      }),
  });
  assert.equal(result.samples, 3);
  assert.equal(result.verdict, 'invest');
  assert.deepEqual(result.failures, []);
  assert.equal(requests.length, 3);
  assert.ok(options.every(option => option.provider === 'cloudflare'));
  for (const request of requests) {
    assert.equal(request.url, 'https://synthetic.invalid/v1/chat/completions');
    assert.equal(request.body.model, 'synthetic-model');
    assert.equal(request.body.max_tokens, 16000);
    assert.equal(request.maxAttempts, 2);
    assert.equal(request.priority, 'default');
  }
});

test('invalid sample counts are rejected before the transport is called', async () => {
  let calls = 0;
  for (const samples of [NaN, Infinity, 0, -1, 1.5]) {
    await assert.rejects(
      judgeDeck({
        persona: PERSONAS[0],
        deck: 'Synthetic',
        samples,
        call: async () => {
          calls++;
          throw new Error('unexpected transport call');
        },
      }),
      /positive integer/u
    );
  }
  assert.equal(calls, 0);
});

test('calibration rejects unknown fixtures even when kind is absent', () => {
  const { evalReport } = passingGateInput();
  for (const replaced of [HOLDOUTS[2].id, ANCHOR.id]) {
    const rows = evalReport.calibrationRows.map(row => {
      if (row.deck !== replaced) return row;
      const { kind, ...rest } = row;
      return { ...rest, deck: 'unknown-fixture' };
    });
    assert.equal(calibrationHolds(rows).ok, false);
  }
});

test('investor orchestration caps concurrent personas and fixtures at eight', async () => {
  let active = 0;
  let peak = 0;
  /** @type {() => void} */
  let release = () => assert.fail('fixture barrier not initialized');
  const barrier = new Promise(resolve => {
    release = () => resolve(undefined);
  });
  const call = async () => {
    active += 1;
    peak = Math.max(peak, active);
    try {
      await barrier;
      return { text: JSON.stringify(sample(0.8)), usage: {} };
    } finally {
      active -= 1;
    }
  };
  const jobs = PERSONAS.slice(0, 2).map(persona =>
    judgeDeck({
      persona,
      deck: 'synthetic concurrency fixture',
      samples: 9,
      call,
      route: { model: 'fixture', baseUrl: 'https://fixture.invalid' },
    })
  );
  try {
    assert.equal(active, 8);
  } finally {
    release();
    await Promise.all(jobs);
  }
  assert.equal(peak, 8);
  assert.equal(active, 0);
});

test('pool hands a reserved slot to its waiter before a reentrant arrival', async () => {
  const { pooled, MAX_IN_FLIGHT } = await import('./eval.mjs');
  const releases = [];
  let active = 0;
  let peak = 0;
  const enter = () =>
    pooled(() => {
      active += 1;
      peak = Math.max(peak, active);
      return new Promise(resolve =>
        releases.push(() => {
          active -= 1;
          resolve();
        })
      );
    });
  const jobs = Array.from({ length: MAX_IN_FLIGHT + 1 }, enter);
  releases.shift()();
  await new Promise(resolve =>
    queueMicrotask(() => {
      jobs.push(enter());
      resolve();
    })
  );
  while (releases.length) {
    releases.splice(0).forEach(release => release());
    await new Promise(resolve => setImmediate(resolve));
  }
  await Promise.all(jobs);
  assert.equal(peak, MAX_IN_FLIGHT);
  assert.equal(active, 0);
  await assert.rejects(
    pooled(() => {
      throw new Error('sync fixture');
    }),
    /sync fixture/
  );
  await assert.rejects(
    pooled(async () => {
      throw new Error('async fixture');
    }),
    /async fixture/
  );
  assert.equal(await pooled(() => 42), 42);
});
