import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  comparePenTokens,
  parseColor,
  variableEntries,
} from '../invariants/pen-token-parity.mjs';
import {
  buildAll,
  buildComponents,
  buildVariables,
  colorAliasesFor,
  colorToHex,
  oklchToHex,
  variableName,
} from './pen-token-import.mjs';

const root = join(import.meta.dirname, '../..');
const read = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const tokens = read('design.tokens.json');
const aliases = read('docs/pen-stills/pen-variable-aliases.json').aliases;

test('committed import files match the generator output', () => {
  for (const [path, text] of Object.entries(buildAll())) {
    assert.equal(readFileSync(path, 'utf8'), text, path);
  }
});

test('existing alias names are reused in reverse; new names use atom-*', () => {
  const { variables } = buildVariables(tokens, aliases);
  for (const name of Object.keys(aliases)) assert.ok(name in variables, name);
  assert.equal(variableName('color', 'accent.ion'), 'atom-color-accent-ion');
  assert.equal(variableName('radius', 'lg'), 'atom-radius-lg');
  assert.equal(variableName('fontSize', 'sm'), 'atom-text-sm');
  assert.equal(variableName('size', 'row.dense'), 'atom-size-row-dense');
});

test('colors are dark-primary themed hex; dimensions are numbers', () => {
  const { variables } = buildVariables(tokens, aliases);
  assert.deepEqual(variables['atom-surface-canvas'].value, [
    { value: '#030406', theme: { mode: 'dark' } },
  ]);
  assert.equal(variables['atom-radius-lg'].value, 12);
  assert.equal(variables['atom-size-row-dense'].value, 32);
  assert.equal(variables['atom-size-header-height'].value, 32);
});

test('oklch converts to hex within one channel step', () => {
  assert.equal(oklchToHex('oklch(100% 0 0)'), '#ffffff');
  assert.equal(oklchToHex('oklch(0% 0 0 / 0.5)'), '#00000080');
  assert.equal(oklchToHex('not a color'), null);
  assert.equal(colorToHex('rgba(168, 176, 195, 0.1)'), '#a8b0c31a');
});

test('round trip: variableEntries + parity yields zero mismatches', () => {
  const { variables, names } = buildVariables(tokens, aliases);
  const doc = { variables };
  assert.ok(variableEntries(doc).length > 100);
  // Parity cannot parse oklch tokens; compare against hex-normalized colors.
  const normalized = structuredClone(tokens);
  for (const node of Object.values(normalized.color)) {
    node.$value = colorToHex(node.$value);
  }
  const findings = comparePenTokens({
    doc,
    tokens: normalized,
    aliases: colorAliasesFor(names),
  });
  assert.deepEqual(findings, []);
  for (const entry of variableEntries(doc)) {
    if (entry.type === 'color') assert.ok(parseColor(entry.modes.dark));
  }
});

test('components spec carries every table row mode from code', () => {
  const spec = buildComponents();
  assert.equal(spec.table.rowModes.dense.rowHeight, 32);
  assert.equal(spec.table.rowModes.controls.rowHeight, 96);
  assert.ok(Array.isArray(spec.table.cellKinds));
});

test('deliberate red: a hand-edited Pen variable is caught by parity', () => {
  const { variables, names } = buildVariables(tokens, aliases);
  const edited = structuredClone(variables);
  edited['atom-surface-canvas'].value = [
    { value: '#ff0000', theme: { mode: 'dark' } },
  ];
  const normalized = structuredClone(tokens);
  for (const node of Object.values(normalized.color)) {
    node.$value = colorToHex(node.$value);
  }
  const findings = comparePenTokens({
    doc: { variables: edited },
    tokens: normalized,
    aliases: colorAliasesFor(names),
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].id, /^value:atom-surface-canvas:dark$/);
});
