import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildClaudeArgs } from './judge.mjs';
import {
  buildJudgePrompt,
  buildJudgeSchema,
  calibrationHolds,
  evaluatePassBar,
  PERSONAS,
  parseJudgeOutput,
  trendLine,
  worstStep,
} from './rubric.mjs';
import { FUNNEL_STEPS, OUTREACH_DM_TEMPLATE } from './steps.mjs';

const STEP_IDS = ['outreach', 'start'];

function stepVerdict(stepId, score, wouldContinue = true) {
  return {
    stepId,
    value: score,
    emotion: score >= 7 ? 'excited' : 'confused',
    positivity: score,
    clarity: score,
    friction: score,
    trust: score,
    wouldContinue,
    reason: `scored ${score}`,
    quote: 'q',
  };
}

function verdicts(score, { payers = 5, judge = 'opus-5.5' } = {}) {
  return PERSONAS.map((persona, index) => ({
    personaId: persona.id,
    judge,
    wouldPay: index < payers,
    steps: STEP_IDS.map(stepId => stepVerdict(stepId, score)),
  }));
}

const CLEAN_METRICS = STEP_IDS.flatMap(stepId => [
  { stepId, viewport: 'desktop', lcpMs: 900, cls: 0, a11yBlockers: 0 },
  { stepId, viewport: 'mobile', lcpMs: 1800, cls: 0, a11yBlockers: 0 },
]);

test('five canon personas with distinct ids', () => {
  assert.equal(PERSONAS.length, 5);
  assert.equal(new Set(PERSONAS.map(persona => persona.id)).size, 5);
});

test('a flow every persona loves passes', () => {
  const result = evaluatePassBar({
    stepIds: STEP_IDS,
    verdicts: verdicts(8),
    primaryJudge: 'opus-5.5',
    metrics: CLEAN_METRICS,
  });
  assert.deepEqual(result.failures, []);
  assert.equal(result.pass, true);
  assert.equal(result.payers, 5);
});

test('fewer than 4 of 5 payers fails even with high step scores', () => {
  const result = evaluatePassBar({
    stepIds: STEP_IDS,
    verdicts: verdicts(9, { payers: 3 }),
    primaryJudge: 'opus-5.5',
    metrics: CLEAN_METRICS,
  });
  assert.equal(result.pass, false);
  assert.match(result.failures.join('\n'), /3\/5 personas would pay/);
});

test('only the primary judge counts toward would-pay', () => {
  const result = evaluatePassBar({
    stepIds: STEP_IDS,
    verdicts: [
      ...verdicts(8, { payers: 2 }),
      ...verdicts(8, { payers: 5, judge: 'fable-5.1' }),
    ],
    primaryJudge: 'opus-5.5',
    metrics: CLEAN_METRICS,
  });
  assert.equal(result.payers, 2);
  assert.equal(result.pass, false);
});

test('one persona stopping fails the bar', () => {
  const all = verdicts(8);
  all[3].steps[1] = stepVerdict('start', 8, false);
  const result = evaluatePassBar({
    stepIds: STEP_IDS,
    verdicts: all,
    primaryJudge: 'opus-5.5',
    metrics: CLEAN_METRICS,
  });
  assert.equal(result.pass, false);
  assert.match(result.failures[0], /skeptic \(opus-5.5\) stops at start/);
});

test('mobile LCP, CLS, a11y blockers and uncaptured steps each fail', () => {
  const result = evaluatePassBar({
    stepIds: STEP_IDS,
    verdicts: verdicts(8),
    primaryJudge: 'opus-5.5',
    metrics: [
      {
        stepId: 'outreach',
        viewport: 'mobile',
        lcpMs: 4652,
        cls: 0,
        a11yBlockers: 0,
      },
      {
        stepId: 'outreach',
        viewport: 'desktop',
        lcpMs: 6000,
        cls: 0.043,
        a11yBlockers: 0,
      },
      {
        stepId: 'start',
        viewport: 'mobile',
        lcpMs: 1200,
        cls: 0,
        a11yBlockers: 2,
      },
      {
        stepId: 'first-use',
        viewport: 'mobile',
        uncaptured: 'paid test account',
      },
    ],
  });
  const text = result.failures.join('\n');
  assert.match(text, /outreach@mobile LCP 4652ms/);
  assert.doesNotMatch(text, /outreach@desktop LCP/);
  assert.match(text, /outreach@desktop CLS 0.043/);
  assert.match(text, /start@mobile has 2 accessibility blockers/);
  assert.match(text, /first-use@mobile not captured/);
});

test('calibration: the blank /start Tim rejected must fail', () => {
  const blank = verdicts(8);
  for (const verdict of blank)
    verdict.steps[1] = stepVerdict('start', 1, false);
  const result = evaluatePassBar({
    stepIds: STEP_IDS,
    verdicts: blank,
    primaryJudge: 'opus-5.5',
    metrics: CLEAN_METRICS,
  });
  assert.equal(calibrationHolds(result, 'start'), true);
  assert.deepEqual(worstStep(result.aggregates), { stepId: 'start', score: 1 });

  const lenient = evaluatePassBar({
    stepIds: STEP_IDS,
    verdicts: verdicts(8),
    primaryJudge: 'opus-5.5',
    metrics: CLEAN_METRICS,
  });
  assert.equal(calibrationHolds(lenient, 'start'), false);
});

test('parseJudgeOutput rejects incomplete or out-of-range verdicts', () => {
  assert.throws(() => parseJudgeOutput(null, STEP_IDS), /missing steps/);
  assert.throws(
    () => parseJudgeOutput({ steps: [stepVerdict('outreach', 5)] }, STEP_IDS),
    /missing step start/
  );
  assert.throws(
    () =>
      parseJudgeOutput(
        { steps: [stepVerdict('outreach', 5), stepVerdict('start', 11)] },
        STEP_IDS
      ),
    /out of range/
  );
  const parsed = parseJudgeOutput(
    {
      steps: [stepVerdict('start', 2, false), stepVerdict('outreach', 4)],
      wouldPay: false,
      payReason: 'nothing about me',
    },
    STEP_IDS
  );
  assert.deepEqual(
    parsed.steps.map(step => step.stepId),
    STEP_IDS
  );
  assert.equal(parsed.wouldPay, false);
});

test('prompt carries the anchors, persona and every screenshot path', () => {
  const prompt = buildJudgePrompt(PERSONAS[3], [
    {
      id: 'start',
      label: 'Start',
      context: 'You tapped claim.',
      images: ['/tmp/start-mobile.png'],
    },
  ]);
  assert.match(prompt, /You are Sam/);
  assert.match(prompt, /0-2: nothing about me/);
  assert.match(prompt, /Screenshot: \/tmp\/start-mobile.png/);
  const schema = buildJudgeSchema(['start']);
  assert.deepEqual(schema.properties.steps.items.properties.stepId.enum, [
    'start',
  ]);
});

test('judges run on the subscription CLI with Read only and no repo settings', () => {
  const args = buildClaudeArgs({
    model: 'claude-opus-5-5',
    prompt: 'p',
    schema: {},
    imageDir: '/tmp/x',
  });
  assert.equal(args[args.indexOf('--model') + 1], 'claude-opus-5-5');
  assert.equal(args[args.indexOf('--allowedTools') + 1], 'Read');
  assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.ok(args.includes('--strict-mcp-config'));
});

test('trend line is one compact JSON row', () => {
  const result = evaluatePassBar({
    stepIds: STEP_IDS,
    verdicts: verdicts(8),
    primaryJudge: 'opus-5.5',
    metrics: CLEAN_METRICS,
  });
  const line = trendLine({
    runId: 'r1',
    at: '2026-10-03T00:00:00Z',
    baseUrl: 'https://jov.ie',
    result,
  });
  assert.doesNotMatch(line, /\n/);
  assert.equal(JSON.parse(line).steps.start.v, 8);
});

test('outreach DM copy matches the template the lead pipeline sends', () => {
  const source = readFileSync(
    new URL('../../apps/web/lib/leads/constants.ts', import.meta.url),
    'utf8'
  );
  assert.ok(source.includes(JSON.stringify(OUTREACH_DM_TEMPLATE)));
});

test('step registry covers outreach through first use, in order', () => {
  assert.deepEqual(
    FUNNEL_STEPS.map(step => step.id),
    [
      'outreach',
      'claim-landing',
      'start',
      'qualify-chat',
      'profile-reveal',
      'claim-decision',
      'upgrade',
      'first-use',
    ]
  );
});
