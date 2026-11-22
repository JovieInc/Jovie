import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  approvedPalette,
  buildAll,
  buildColors,
  colorToHex,
  compareSnapshot,
  flatExport,
  paletteProblems,
  SNAPSHOT_PATH,
  ziawiMismatches,
} from './design-token-export.mjs';

const root = join(import.meta.dirname, '../..');
const ziawi = JSON.parse(
  readFileSync(join(root, 'apps/web/design/ziawi-color-sot.json'), 'utf8')
);

test('committed Figma variable files match the generator output', () => {
  for (const [path, text] of Object.entries(buildAll())) {
    assert.equal(readFileSync(path, 'utf8'), text, path);
  }
});

test('approved palette is 25 names built from the ZiaWI file', () => {
  const approved = approvedPalette(ziawi);
  assert.equal(approved.length, 25);
  assert.deepEqual(approved.slice(0, 5), [
    'surface.canvas',
    'surface.shell',
    'surface.card',
    'surface.elevated',
    'surface.floating',
  ]);
  assert.ok(!approved.includes('surface.panel'));
  assert.ok(!approved.includes('surface.glass'));
  assert.deepEqual(
    approved.filter(n => /^accent\.[a-z]+$/.test(n)),
    ['ion', 'ultra', 'pulse', 'mint', 'orange', 'red'].map(r => `accent.${r}`)
  );
});

test('the export carries exactly the approved palette, no aliases', () => {
  const colors = buildColors(ziawi);
  const names = Object.keys(colors.light);
  assert.deepEqual(paletteProblems(names, approvedPalette(ziawi)), []);
  assert.deepEqual(Object.keys(colors.dark), names);
  for (const banned of [
    'card-alias',
    'surface.bgBase',
    'surface.surface0',
    'text.quaternary',
    'accent.aqua',
    'accent.gold',
    'accent.flare',
    'status.success',
  ]) {
    assert.ok(!names.includes(banned), banned);
  }
  assert.ok(!names.some(n => n.startsWith('feature.')));
});

test('CSS and ZiaWI agree on elevations and accents in both modes', () => {
  assert.deepEqual(ziawiMismatches(ziawi, buildColors(ziawi)), []);
});

test('dark values are the existing code values; light is read from the CSS', () => {
  const { light, dark } = buildColors(ziawi);
  assert.equal(dark['surface.canvas'], '#030406');
  assert.equal(dark['text.secondary'], '#a0a5af');
  assert.equal(dark['text.tertiary'], '#9da2ac');
  assert.equal(light['surface.canvas'], '#f3f4f6');
  assert.equal(light['text.secondary'], '#5a606a');
  assert.equal(light['accent.ion-soft'], '#11afff1f');
});

test('color conversion handles hex, rgba, oklch and lch', () => {
  assert.equal(colorToHex('#ABCDEF'), '#abcdef');
  assert.equal(colorToHex('rgba(168, 176, 195, 0.1)'), '#a8b0c31a');
  assert.equal(colorToHex('oklch(100% 0 0)'), '#ffffff');
  assert.equal(colorToHex('oklch(0% 0 0 / 5%)'), '#0000000d');
  assert.equal(colorToHex('lch(100% 0 0)'), '#ffffff');
  assert.throws(() => colorToHex('not a color'));
});

test('DTCG files nest color and dimension tokens', () => {
  const files = Object.fromEntries(
    Object.entries(buildAll()).map(([path, text]) => [
      path.endsWith('light.tokens.json') ? 'light' : 'dark',
      JSON.parse(text),
    ])
  );
  const { light, dark } = files;
  assert.equal(dark.surface.canvas.$value, '#030406');
  assert.equal(dark.surface.canvas.$type, 'color');
  assert.equal(light.surface.canvas.$value, '#f3f4f6');
  assert.equal(dark.accent.ion.$value, '#11afff');
  assert.equal(dark.radius.lg.$value, '12px');
  assert.equal(dark.size.row.dense.$value, '32px');
});

test('deliberate red: an off-palette color fails the palette cap', () => {
  const approved = approvedPalette(ziawi);
  const names = Object.keys(buildColors(ziawi).light);
  assert.match(
    paletteProblems([...names, 'surface.glass'], approved).join('\n'),
    /"surface\.glass" is not in the approved palette/
  );
  assert.match(
    paletteProblems([...names, 'accent.violet'], approved).join('\n'),
    /palette exports 26 colors; the approved list allows 25/
  );
  assert.deepEqual(paletteProblems(names.slice(0, -1), approved), []);
});

test('Figma snapshot: empty passes as "no snapshot yet"', () => {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  assert.equal(snapshot.fileKey, '9EtbM0FIxqViEJkLJy10qD');
  assert.deepEqual(snapshot.variables, {});
  assert.equal(compareSnapshot(snapshot, flatExport()).status, 'no-snapshot');
});

test('Figma snapshot: matching passes, drift fails (deliberate red)', () => {
  const flat = flatExport();
  const snapshot = { fileKey: 'abc', variables: structuredClone(flat) };
  assert.equal(compareSnapshot(snapshot, flat).status, 'in-sync');

  snapshot.variables['surface/canvas'].values.dark = '#ff0000';
  delete snapshot.variables['text/primary'];
  snapshot.variables['surface/glass'] = {
    type: 'color',
    values: { light: '#ffffff', dark: '#000000' },
  };
  const { status, findings } = compareSnapshot(snapshot, flat);
  assert.equal(status, 'drift');
  assert.equal(findings.length, 3);
});

test('grid tokens: new sizes, and existing row modes reused by alias', () => {
  const flat = flatExport();
  const px = name => flat[name].values.dark;
  assert.equal(px('grid/row-compact'), 36);
  assert.equal(px('grid/row-default'), px('size/row/compact'));
  assert.equal(px('grid/row-default'), 40);
  assert.equal(px('grid/row-comfortable'), px('size/row/list'));
  assert.equal(px('grid/row-comfortable'), 44);
  assert.equal(px('grid/cell-padding-x'), 12);
  assert.equal(px('grid/avatar'), 24);
  assert.equal(px('grid/status-dot'), 8);
  assert.equal(typeof px('radius/sm'), 'number');
  assert.equal(flat['surface/canvas'].type, 'color');
});
