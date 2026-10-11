import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { resolveScreens } from './coherence.mjs';
import {
  buildScreenPrompt,
  buildScreenSchema,
  evaluateScreenCoherence,
  isBlockingFinding,
  parseScreenOutput,
  SCREEN_DIMENSIONS,
  screenCalibrationMisses,
} from './coherence-screen.mjs';
import { buildClaudeArgs } from './judge.mjs';

const DIMS = Object.fromEntries(SCREEN_DIMENSIONS.map(name => [name, 8]));

function screen(screenId, findings = []) {
  return { screenId, dimensions: { ...DIMS }, findings, verdict: 'v' };
}

test('five named dimensions, all required in the schema', () => {
  assert.deepEqual(SCREEN_DIMENSIONS, [
    'intent',
    'continuity',
    'subtraction',
    'seams',
    'inevitability',
  ]);
  const schema = buildScreenSchema(['a']);
  assert.deepEqual(
    schema.properties.screens.items.properties.dimensions.required,
    SCREEN_DIMENSIONS
  );
  assert.deepEqual(schema.properties.screens.items.properties.screenId.enum, [
    'a',
  ]);
});

test('only a located blocker blocks; low scores and minors are advisory', () => {
  const lowScores = parseScreenOutput(
    {
      screens: [
        {
          ...screen('a'),
          dimensions: Object.fromEntries(SCREEN_DIMENSIONS.map(n => [n, 2])),
          findings: [
            {
              severity: 'minor',
              dimension: 'seams',
              location: 'x',
              detail: 'y',
            },
            {
              severity: 'blocker',
              dimension: 'intent',
              location: ' ',
              detail: 'vague',
            },
          ],
        },
      ],
    },
    ['a']
  );
  const advisory = evaluateScreenCoherence(lowScores);
  assert.equal(advisory.pass, true);
  assert.deepEqual(advisory.unlocated, ['a intent: vague']);

  const blocked = evaluateScreenCoherence({
    screens: [
      screen('lib', [
        {
          severity: 'blocker',
          dimension: 'subtraction',
          location: 'library row 2, status column',
          detail: 'Draft repeated as Draft / Draft',
        },
      ]),
      screen('ok'),
    ],
  });
  assert.equal(blocked.pass, false);
  assert.deepEqual(blocked.failures, [
    'lib subtraction @ library row 2, status column: Draft repeated as Draft / Draft',
  ]);
  assert.deepEqual(
    blocked.screens.map(row => `${row.screenId}:${row.pass}`),
    ['lib:false', 'ok:true']
  );
});

test('a missing verdict fails closed', () => {
  assert.deepEqual(evaluateScreenCoherence(null), {
    pass: false,
    failures: ['screen coherence not judged'],
    unlocated: [],
    screens: [],
  });
});

test('parseScreenOutput rejects malformed or partial output', () => {
  assert.throws(() => parseScreenOutput({}, ['a']), /screens/);
  assert.throws(() => parseScreenOutput({ screens: [] }, ['a']), /missing a/);
  assert.throws(
    () =>
      parseScreenOutput(
        { screens: [{ ...screen('a'), dimensions: { ...DIMS, seams: 11 } }] },
        ['a']
      ),
    /seams out of range/
  );
  assert.throws(
    () =>
      parseScreenOutput(
        {
          screens: [
            screen('a', [
              {
                severity: 'major',
                dimension: 'seams',
                location: 'l',
                detail: 'd',
              },
            ]),
          ],
        },
        ['a']
      ),
    /unknown severity/
  );
  assert.throws(
    () =>
      parseScreenOutput(
        {
          screens: [
            screen('a', [
              {
                severity: 'minor',
                dimension: 'vibes',
                location: 'l',
                detail: 'd',
              },
            ]),
          ],
        },
        ['a']
      ),
    /unknown dimension/
  );
  assert.equal(
    isBlockingFinding({
      severity: 'blocker',
      dimension: 'seams',
      location: 'l',
      detail: 'd',
    }),
    true
  );
});

test('calibration: escapes must fail and the good neighbor must pass', () => {
  const fixtures = [
    { id: 'escape', expect: 'fail' },
    { id: 'neighbor', expect: 'pass' },
    { id: 'absent', expect: 'fail' },
  ];
  const lenient = evaluateScreenCoherence({
    screens: [screen('escape'), screen('neighbor')],
  });
  assert.deepEqual(screenCalibrationMisses(fixtures, lenient), [
    'escape: expected fail, got pass',
    'absent: not judged',
  ]);
});

test('the committed calibration manifest covers the four escapes and a neighbor', () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL('./coherence-calibration.json', import.meta.url),
      'utf8'
    )
  );
  const ids = manifest.fixtures.map(
    fixture => `${fixture.id}:${fixture.expect}`
  );
  assert.deepEqual(ids, [
    'start-blank:fail',
    'library-draft-draft:fail',
    'greeting-insight-swap:fail',
    'sidebar-one-way-toggle:fail',
    'good-neighbor:pass',
  ]);
});

test('prompt lists every screen and neighbor screenshot; args allow every image dir', () => {
  const prompt = buildScreenPrompt([
    {
      id: 'side',
      label: 'Sidebar collapsed',
      context: 'wants the rail back',
      images: ['/a/closed.png'],
      neighbors: [{ id: 'open', label: 'Before', images: ['/b/open.png'] }],
    },
  ]);
  assert.match(prompt, /\/a\/closed\.png/);
  assert.match(prompt, /\/b\/open\.png/);
  assert.match(prompt, /feel inevitable rather than assembled/);
  const args = buildClaudeArgs({
    model: 'm',
    prompt: 'p',
    schema: {},
    imageDir: ['/a', '/b'],
  });
  const at = args.indexOf('--add-dir');
  assert.deepEqual(args.slice(at + 1, at + 3), ['/a', '/b']);
});

test('resolveScreens fails closed on a missing capture', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coherence-'));
  writeFileSync(join(dir, 'a.png'), '');
  const ok = resolveScreens(
    [{ id: 'a', label: 'A', context: 'c', images: ['a.png'] }],
    dir
  );
  assert.deepEqual(ok.imageDirs, [dir]);
  assert.throws(
    () =>
      resolveScreens(
        [{ id: 'b', label: 'B', context: 'c', images: ['b.png'] }],
        dir
      ),
    /missing screenshot/
  );
});
