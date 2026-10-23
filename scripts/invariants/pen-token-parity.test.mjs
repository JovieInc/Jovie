import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  checkPaths,
  colorsEqual,
  comparePenTokens,
  parseColor,
  ratchet,
  resolveThemedValue,
  toExportDocument,
  variableEntries,
} from './pen-token-parity.mjs';

const root = join(import.meta.dirname, '../..');

test('#A8B0C31A matches the token rgba alpha rounded to two decimals', () => {
  assert.equal(colorsEqual('#A8B0C31A', 'rgba(168, 176, 195, 0.1)'), true);
  assert.equal(colorsEqual('#030406', '#030406'), true);
  assert.equal(colorsEqual('#030406', '#131417'), false);
  assert.deepEqual(parseColor('#abc'), parseColor('#aabbcc'));
});

test('a light-first theme list still resolves the dark value', () => {
  const doc = {
    variables: {
      'atom-surface-canvas': {
        type: 'color',
        value: [
          { value: '#ffffff', theme: { mode: 'light' } },
          { value: '#030406', theme: { mode: 'dark' } },
        ],
      },
    },
  };
  const [entry] = variableEntries(doc);
  assert.equal(entry.modes.dark, '#030406');
  assert.equal(entry.modes.light, '#ffffff');
  assert.equal(
    resolveThemedValue(
      [
        { value: '#ffffff', theme: { mode: 'light' } },
        { value: '#030406', theme: { mode: 'dark' } },
      ],
      { mode: 'dark' }
    ),
    '#030406'
  );
  const exported = toExportDocument(doc);
  assert.equal(exported.coverage, 'full');
  assert.equal(exported.primaryMode, 'dark');
});

test('seed export matches and only the incomplete export is baselined', () => {
  const result = checkPaths(root);
  assert.deepEqual(
    result.findings.map(finding => finding.id),
    ['incomplete-export']
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.fresh, []);
  const docs = readFileSync(
    join(root, 'docs/pen-stills/PEN_VARIABLES.md'),
    'utf8'
  );
  assert.match(docs, /Be found\. Be understood\./);
  assert.doesNotMatch(docs, /Daniel Kang|Haruki|payroll/i);
});

test('a new unmapped color fails and a baselined id does not', () => {
  const tokens = JSON.parse(
    readFileSync(join(root, 'design.tokens.json'), 'utf8')
  );
  const findings = comparePenTokens({
    doc: {
      schema: 'pen-variables-export/v1',
      coverage: 'full',
      primaryMode: 'dark',
      variables: [
        { name: 'atom-surface-canvas', modes: { dark: '#ffffff' } },
        { name: 'atom-new-ink', type: 'color', modes: { dark: '#ffffff' } },
        { name: 'spacing-1', type: 'number', modes: { dark: 4 } },
      ],
    },
    tokens,
    aliases: { 'atom-surface-canvas': 'color.surface.canvas' },
  });
  assert.deepEqual(
    findings.map(finding => finding.id),
    ['value:atom-surface-canvas:dark', 'unmapped:atom-new-ink']
  );
  const judged = ratchet(findings, { allowed: ['incomplete-export'] });
  assert.equal(judged.ok, false);
  assert.deepEqual(
    judged.fresh.map(finding => finding.detail),
    findings.map(finding => finding.detail)
  );
  assert.deepEqual(judged.stale, ['incomplete-export']);
  const held = ratchet([{ id: 'incomplete-export', detail: 'seed' }], {
    allowed: ['incomplete-export'],
  });
  assert.equal(held.ok, true);
});
