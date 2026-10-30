import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseShowinfoTimes, pickKeyframes, stepWindows } from './ingest.mjs';
import {
  buildColdPrompt,
  buildColdSchema,
  buildJudgePrompt,
  buildJudgeSchema,
  CRITERIA,
  coldFails,
  missingAsrRefs,
  parseColdOutput,
  parseJudgeOutput,
  RUBRIC_VERSION,
  stepVerdict,
} from './rubric.mjs';

const finding = (over = {}) => ({
  criterion: 'TT-03',
  severity: 'blocker',
  image: 'a',
  bbox: [0.1, 0.1, 0.2, 0.1],
  evidence: 'Start Pro ($12)',
  detail: 'Price on the waitlist receipt',
  fix: 'Remove the price CTA',
  ...over,
});

describe('rubric', () => {
  test('every criterion cites anti-slop rules that exist in the registry', () => {
    assert.deepEqual(missingAsrRefs(), []);
    assert.ok(CRITERIA.length >= 15);
    for (const c of CRITERIA) {
      assert.ok(
        c.fail.length > 0 && c.pass.length > 0,
        `${c.id} needs fail and pass examples`
      );
    }
  });

  test('one blocker or two majors fail a step; one major passes', () => {
    assert.equal(stepVerdict([finding()]), 'fail');
    assert.equal(stepVerdict([finding({ severity: 'major' })]), 'pass');
    assert.equal(
      stepVerdict([
        finding({ severity: 'major' }),
        finding({ severity: 'major' }),
      ]),
      'fail'
    );
    assert.equal(stepVerdict([]), 'pass');
  });

  test('prompt carries the rubric, Pen refs and every image path', () => {
    const prompt = buildJudgePrompt({
      surface: 'Waitlist',
      steps: [
        {
          id: '4e',
          title: 'Receipt',
          images: [{ name: '4e-shot', path: '/x/4e.png', t: 92 }],
        },
      ],
      penRefs: [{ id: 'p1IJJ', title: 'Reserved', path: '/pen/p1IJJ.png' }],
      tier: 'screen',
    });
    assert.match(prompt, /TT-03 Value before price/u);
    assert.match(prompt, /4e-shot @ 92\.0s: \/x\/4e\.png/u);
    assert.match(prompt, /\/pen\/p1IJJ\.png/u);
    assert.match(
      prompt,
      new RegExp(RUBRIC_VERSION.replace(/[./]/gu, '\\$&'), 'u')
    );
  });

  test('schema dedupes image names (duplicate enum broke the CLI)', () => {
    const schema = buildJudgeSchema(['1a'], ['a', 'a', 'b']);
    const image =
      schema.properties.steps.items.properties.findings.items.properties.image;
    assert.deepEqual(image.enum, ['a', 'b']);
  });

  test('parse fails closed on missing steps, unknown criteria and bad bboxes', () => {
    assert.throws(() => parseJudgeOutput(null, ['1a']), /missing steps/u);
    assert.throws(
      () => parseJudgeOutput({ steps: [] }, ['1a']),
      /missing step 1a/u
    );
    const base = { stepId: '1a', penGap: 3, penSummary: '', timQuote: '' };
    assert.throws(
      () =>
        parseJudgeOutput(
          { steps: [{ ...base, findings: [finding({ criterion: 'X' })] }] },
          ['1a']
        ),
      /unknown criterion/u
    );
    assert.throws(
      () =>
        parseJudgeOutput(
          { steps: [{ ...base, findings: [finding({ bbox: [0, 0, 2, 1] })] }] },
          ['1a']
        ),
      /bbox/u
    );
    const ok = parseJudgeOutput(
      { steps: [{ ...base, findings: [finding()] }], overall: 'no' },
      ['1a']
    );
    assert.equal(ok.verdict, 'fail');
    assert.equal(ok.steps[0].verdict, 'fail');
  });
});

describe('cold screenshot test', () => {
  test('prompt has no rubric and no product context', () => {
    const prompt = buildColdPrompt([{ name: 'a', path: '/a.png' }]);
    assert.doesNotMatch(prompt, /TT-\d+|Jovie|Pen|rubric/u);
    assert.match(prompt, /what's wrong/u);
    assert.deepEqual(
      buildColdSchema(['a', 'a']).properties.images.items.properties.image.enum,
      ['a']
    );
  });

  test('any credible issue fails, whatever its severity; non-credible does not', () => {
    assert.equal(coldFails([{ credible: true, severity: 'minor' }]), true);
    assert.equal(coldFails([{ credible: false, severity: 'blocker' }]), false);
    assert.equal(coldFails([]), false);
  });

  test('every image must be answered', () => {
    assert.throws(
      () => parseColdOutput({ images: [] }, ['a']),
      /missing image a/u
    );
    const parsed = parseColdOutput(
      {
        images: [
          {
            image: 'a',
            issues: [
              {
                credible: true,
                severity: 'major',
                bbox: [0, 0, 1, 1],
                detail: 'x',
              },
            ],
          },
        ],
      },
      ['a']
    );
    assert.equal(parsed[0].issues[0].credible, true);
  });
});

describe('ingest', () => {
  test('parses ffmpeg showinfo timestamps', () => {
    assert.deepEqual(
      parseShowinfoTimes('n:0 pts:1 pts_time:1.5 x\nn:1 pts_time:3.04 y'),
      [1.5, 3.04]
    );
  });

  test('step windows are per video and ordered by offset', () => {
    const w = stepWindows([
      { step: 'b', video: 'v.mp4', videoOffsetSec: 5 },
      { step: 'a', video: 'v.mp4', videoOffsetSec: 0 },
      { step: 'c', video: 'w.mp4', videoOffsetSec: 2 },
      { step: 'n', video: null },
    ]);
    assert.deepEqual(w.get('a'), { video: 'v.mp4', start: 0, end: 5 });
    assert.equal(w.get('b').end, Number.POSITIVE_INFINITY);
    assert.equal(w.has('n'), false);
  });

  test('keyframes spread across the window and stay inside it', () => {
    const picked = pickKeyframes(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      { start: 2, end: 9 },
      3
    );
    assert.equal(picked.length, 3);
    assert.ok(picked.every(t => t >= 2 && t < 9));
    assert.deepEqual(pickKeyframes([1, 20], { start: 5, end: 10 }), []);
  });
});
