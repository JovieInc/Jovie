import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addedLines,
  checkLine,
  checkLines,
  isUiFile,
} from './design-frontend-skill-check.mjs';

const FILE = 'apps/web/components/features/chat/NewChat.tsx';

/**
 * @param {string} text
 */
const ids = text => checkLine(FILE, 1, text).map(finding => finding.id);

test('each rule fires on its deliberate-red line and passes its neighbour', () => {
  /** @type {Array<[string, string, string]>} */
  const cases = [
    [
      'FS-001',
      "className='font-serif text-lg'",
      "className='font-sans text-lg'",
    ],
    [
      'FS-001',
      'font-family: Georgia, serif;',
      'font-family: Inter, sans-serif;',
    ],
    ['FS-002', '<span>Saved ✓</span>', '<span>Saved</span>'],
    ['FS-002', '<span>Launch 🚀</span>', '<span>Launch</span>'],
    [
      'FS-003',
      "className='hover:-translate-y-0.5'",
      "className='hover:bg-surface-2'",
    ],
    [
      'FS-003',
      "className='group-hover:scale-105'",
      "className='group-hover:text-primary-token'",
    ],
    ['FS-003', "className='hover:border-2'", "className='hover:border-subtle'"],
    ['FS-004', "className='transition-all'", "className='transition-colors'"],
    ['FS-004', 'transition: all 200ms;', 'transition: opacity 150ms;'],
    ['FS-005', "className='text-[11px]'", "className='text-[12px]'"],
    [
      'FS-006',
      "className='opacity-0 group-hover:opacity-100'",
      "className='opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'",
    ],
    ['FS-007', "className='bg-[#0a0a0a]'", "className='bg-surface-1'"],
    [
      'FS-007',
      "style={{ color: '#fff' }}",
      "style={{ color: 'var(--color-text)' }}",
    ],
    ['FS-008', '<select name="plan">', '<Select name="plan">'],
  ];
  for (const [id, red, green] of cases) {
    assert.ok(ids(red).includes(id), `${id} should fire on: ${red}`);
    assert.ok(!ids(green).includes(id), `${id} should pass: ${green}`);
  }
});

test('comments, legal marks, token definitions and reasoned opt-outs do not fire', () => {
  assert.deepEqual(ids('// never transition-all here (DESIGN.md)'), []);
  assert.deepEqual(ids('<div // native <select> not suitable'), []);
  assert.deepEqual(ids('<p>Jovie® and Jovie™ © 2026</p>'), []);
  assert.deepEqual(ids('  --surface-color: #0a0a0a;'), []);
  assert.deepEqual(ids("<a href='https://x.test/a'>Docs</a>"), []);
  assert.deepEqual(
    ids(
      "className='transition-all' // frontend-skill-allow FS-004: legacy keyframe host"
    ),
    []
  );
  assert.deepEqual(
    ids("className='transition-all' // frontend-skill-allow FS-004:"),
    ['FS-004']
  );
});

test('only product UI files are checked', () => {
  assert.equal(isUiFile('apps/web/components/ui/Button.tsx'), true);
  assert.equal(isUiFile('apps/web/app/globals.css'), true);
  assert.equal(isUiFile('packages/ui/src/select.tsx'), true);
  assert.equal(isUiFile('apps/web/components/ui/Button.test.tsx'), false);
  assert.equal(isUiFile('apps/web/components/ui/Button.stories.tsx'), false);
  assert.equal(isUiFile('apps/web/lib/format.ts'), false);
});

test('diff mode checks added lines only, with their new line numbers', () => {
  const diff = [
    `diff --git a/${FILE} b/${FILE}`,
    `--- a/${FILE}`,
    `+++ b/${FILE}`,
    '@@ -10,0 +11,2 @@',
    "+  <div className='transition-all'>",
    '+  <span>ok</span>',
    '@@ -40 +42 @@',
    "-  <div className='transition-all'>",
    "+  <div className='font-serif'>",
    '--- a/apps/web/lib/x.ts',
    '+++ b/apps/web/lib/x.ts',
    '@@ -1,0 +1 @@',
    "+const c = 'transition-all';",
  ].join('\n');
  const lines = addedLines(diff);
  assert.deepEqual(
    lines.get(FILE)?.map(([line]) => line),
    [11, 12, 42]
  );
  const findings = checkLines(lines);
  assert.deepEqual(
    findings.map(finding => [finding.id, finding.line]),
    [
      ['FS-004', 11],
      ['FS-001', 42],
    ]
  );
});
