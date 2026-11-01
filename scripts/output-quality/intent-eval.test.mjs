import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { judgeBuyer, strongRoute } from '../buyer-eval/judge.mjs';
import { scoreCalibration } from './calibrate.mjs';
import { planRoute, receiptLine, runIntentLoop } from './intent-eval.mjs';
import { htmlText } from './render.mjs';
import {
  aggregateIntent,
  applyEdits,
  buildIntentPrompt,
  PRESETS,
  parseIntentSample,
  resolveStakes,
} from './rubric.mjs';

const answer = (over = {}) => ({
  first_impression: 'Fifty clocks.',
  mission_achieved: false,
  score: 30,
  top_issue: 'My own time is buried among 50.',
  single_change: 'Show only my local time, large.',
  harm_or_legal_risk: 'none',
  unsupported_or_contradictory_claims: [],
  other_issues: ['seconds are noise'],
  ...over,
});
const reply = body => ({
  text: JSON.stringify(body),
  usage: { neurons: 1000 },
});
const textRender = async ({ ref, text }) => ({
  type: 'text',
  ref: ref ?? 'inline',
  sha256: 'f'.repeat(64),
  text: text ?? readFileSync(ref, 'utf8'),
  images: [],
});
const POLICY = JSON.parse(
  readFileSync(new URL('./policy.json', import.meta.url), 'utf8')
);
const tmp = () => mkdtempSync(join(tmpdir(), 'oql-'));

test('routes are workers-ai-only; high stakes takes three samples and the text model', () => {
  assert.deepEqual(planRoute('routine', true), {
    id: 'dev.intent-eval',
    model: '@cf/zai-org/glm-5.3-flash',
    fixModel: '@cf/zai-org/glm-5.3',
    samples: 1,
    minSamples: 1,
  });
  const high = planRoute('high', false);
  assert.equal(high.model, '@cf/zai-org/glm-5.3');
  assert.equal(high.samples, 3);
  assert.equal(planRoute('high', true).model, '@cf/zai-org/glm-5.3-flash');
  assert.equal(resolveStakes({ kind: 'deck' }), 'high');
  assert.equal(resolveStakes({ preset: 'investor' }), 'high');
  assert.equal(resolveStakes({ kind: 'memo', preset: 'tim' }), 'routine');
  // buyer-eval is a thin layer over the same core and route table
  assert.equal(strongRoute().model, '@cf/zai-org/glm-5.3-flash');
});

test('the judge role-plays the audience against the mission', () => {
  const prompt = buildIntentPrompt({
    mission: 'Tell the time fast',
    audience: PRESETS.tim.audience,
    kind: 'ui',
    text: '4:12 PM',
    imageCount: 1,
  });
  assert.match(prompt, /role-playing this audience/);
  assert.match(
    prompt,
    /MISSION the artifact must achieve for this audience: Tell the time fast/
  );
  assert.match(prompt, /Correct but slow, cluttered/);
  assert.match(prompt, /<<<ARTIFACT\n4:12 PM\nARTIFACT>>>/);
});

test('pass needs every sample on mission, at the bar, with no harm; too few samples abstain', () => {
  const good = parseIntentSample(answer({ mission_achieved: true, score: 90 }));
  const harmful = parseIntentSample(
    answer({
      mission_achieved: true,
      score: 95,
      harm_or_legal_risk: 'Defames a named competitor.',
    })
  );
  assert.equal(aggregateIntent([good]).verdict, 'pass');
  assert.equal(aggregateIntent([good], { stakes: 'high' }).verdict, 'pass');
  assert.equal(
    aggregateIntent(
      [parseIntentSample(answer({ mission_achieved: true, score: 82 }))],
      { stakes: 'high' }
    ).verdict,
    'fail'
  );
  assert.equal(aggregateIntent([good, harmful]).verdict, 'fail');
  assert.equal(aggregateIntent([good], { minSamples: 2 }).verdict, 'abstain');
  assert.throws(
    () => parseIntentSample(answer({ mission_achieved: true, score: 10 })),
    /incoherent/
  );
  assert.throws(
    () => parseIntentSample(answer({ mission_achieved: false, score: 90 })),
    /mission missed with a passing score/
  );
  assert.throws(() => parseIntentSample(answer({ score: 101 })), /range/);
});

test('the loop fixes the top issue, re-evaluates until pass and records every pass', async () => {
  const state = tmp();
  const artifact = join(state, 'note.txt');
  writeFileSync(artifact, '50 clocks');
  let judged = 0;
  const call = async ({ schemaName }) => {
    if (schemaName === 'artifact_revision')
      return reply({
        edits: [
          { find: '50 clocks', replace: '4:12 PM' },
          { find: 'nope', replace: 'x' },
        ],
        what_changed: 'one clock',
      });
    judged += 1;
    return reply(
      judged === 1
        ? answer()
        : answer({ mission_achieved: true, score: 93, top_issue: 'none' })
    );
  };
  let tick = 0;
  const receipt = await runIntentLoop({
    mission: 'Help Tim tell the time as quickly as possible.',
    preset: 'tim',
    artifact,
    fix: 'auto',
    state,
    call,
    render: textRender,
    now: () => new Date(Date.UTC(2026, 10, 1, 0, 0, tick++)),
  });
  assert.equal(receipt.verdict, 'pass');
  assert.equal(receipt.passCount, 2);
  assert.match(receipt.passes[0].fix, /^one clock \(1 edit\(s\) did not match/);
  assert.equal(readFileSync(receipt.final.path, 'utf8'), '4:12 PM');
  assert.equal(
    readFileSync(artifact, 'utf8'),
    '50 clocks',
    'never edits the caller file'
  );
  const rows = readFileSync(join(state, 'passes.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(rows.length, 2);
  assert.ok(
    rows.every(
      r => r.startedAt && r.endedAt && r.ms >= 0 && r.runId === receipt.runId
    )
  );
  assert.match(
    receiptLine(receipt),
    /^Intent-eval: jovie\.intent-eval\/v1 run=\S+ verdict=pass score=93 passes=2 /
  );
});

test('out of budget the loop stops and reports what is left; a dead judge abstains', async () => {
  const state = tmp();
  const failing = await runIntentLoop({
    mission: 'm',
    audience: 'a',
    text: 'x',
    fix: 'auto',
    maxPasses: 2,
    state,
    render: textRender,
    call: async ({ schemaName }) =>
      reply(
        schemaName === 'artifact_revision'
          ? { edits: [{ find: 'x', replace: 'y' }], what_changed: 'c' }
          : answer()
      ),
  });
  assert.equal(failing.verdict, 'fail');
  assert.equal(failing.passCount, 2);
  assert.ok(failing.remaining.includes('seconds are noise'));
  const dead = await runIntentLoop({
    mission: 'm',
    audience: 'a',
    text: 'x',
    state,
    render: textRender,
    call: async () => {
      throw new Error('relay 503');
    },
  });
  assert.equal(dead.verdict, 'abstain');
  assert.match(dead.passes[0].failures.join(), /relay 503/);
  await assert.rejects(
    runIntentLoop({ audience: 'a', text: 'x', state, render: textRender }),
    /--mission is required/
  );
});

test('reviser falls back to the second model and receives gate violations', async () => {
  const state = tmp();
  const prompts = [];
  let judged = 0;
  const receipt = await runIntentLoop({
    mission: 'm',
    audience: 'a',
    text: 'Hello — world',
    fix: 'auto',
    state,
    render: textRender,
    violationsFor: async () => ['em-dash: No em or en dashes [—]'],
    call: async ({ schemaName, model, content }) => {
      if (schemaName === 'artifact_revision') {
        prompts.push(content[0].text);
        if (model === '@cf/zai-org/glm-5.3')
          throw new Error('judge answer truncated (finish_reason length)');
        return reply({
          edits: [{ find: ' \u2014 ', replace: ', ' }],
          what_changed: 'comma',
        });
      }
      judged += 1;
      return reply(
        judged === 1 ? answer() : answer({ mission_achieved: true, score: 90 })
      );
    },
  });
  assert.equal(receipt.verdict, 'pass');
  assert.equal(prompts.length, 2, 'retried on the second model');
  assert.match(prompts[0], /rule violations: em-dash/);
});

test('buyer-eval judge rides the shared sampler', async () => {
  const walk = {
    subjectId: 'p',
    steps: [{ stepId: 1, tSec: 0, text: 't', images: [] }],
  };
  const result = await judgeBuyer({
    persona: { id: 'p', tier: 'A', brief: 'artist' },
    outcome: { priceUsd: 12 },
    walk,
    samples: 1,
    call: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(result.route, 'dev.buyer-eval');
  assert.deepEqual(result.samples, []);
  assert.match(result.failures[0], /offline/);
});

test('policy may enforce only after a calibration that matched every case', () => {
  assert.ok(['warn', 'enforce'].includes(POLICY.mode));
  if (POLICY.mode === 'enforce')
    assert.equal(POLICY.calibration?.allMatched, true);
  const spec = JSON.parse(
    readFileSync(
      new URL('./fixtures/calibration.json', import.meta.url),
      'utf8'
    )
  );
  assert.ok(
    spec.cases.some(
      c => c.id === 'clock-every-timezone' && c.mustFail && c.expect === 'fail'
    )
  );
  assert.deepEqual(
    scoreCalibration([
      { id: 'tz', expect: 'fail', mustFail: true, verdict: 'pass' },
    ]),
    { cases: 1, matched: 0, allMatched: false, mustFailMissed: ['tz'] }
  );
});

test('html text extraction drops scripts and styles', () => {
  assert.equal(
    htmlText(
      '<style>x{}</style><h1>4:12&nbsp;PM</h1><script>a()</script><p>LA</p>'
    ),
    '4:12 PM\n LA'
  );
});

test('edits apply only when the passage matches exactly once', () => {
  assert.deepEqual(
    applyEdits('a b a', [
      { find: 'a', replace: 'x' },
      { find: 'b', replace: 'y' },
      { find: '', replace: 'z' },
    ]),
    {
      body: 'a y a',
      applied: 1,
      skipped: ['a', ''],
    }
  );
});
