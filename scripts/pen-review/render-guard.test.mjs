import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  garbleFinding,
  glyphFindings,
  renderGuard,
  speckleBands,
} from './render-guard.mjs';

const img = (w, h, fn) => {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = fn(x, y);
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data };
};

const clean = () =>
  img(160, 96, (x, y) => (y % 24 > 18 && x % 40 < 30 ? 220 : 6));
// Mis-strided readback: dense isolated speckle (deterministic hash noise).
const garbled = () => img(160, 96, (x, y) => ((x + 2 * y) % 3 === 0 ? 230 : 4));

test('render guard: identical renders, white noise and blank renders fail', () => {
  const dark = img(64, 64, (x, y) =>
    x > 20 && x < 40 && y > 20 && y < 30 ? 240 : 6
  );
  const white = img(64, 64, (x, y) => ((x * 7 + y * 3) % 11 === 0 ? 30 : 250));
  assert.equal(
    renderGuard([
      { id: 'a', md5: 'h', img: dark },
      { id: 'b', md5: 'h', img: dark },
    ]).length,
    2
  );
  assert.match(
    renderGuard([{ id: 'a', md5: '1', img: white }])[0].reason,
    /noise/
  );
  assert.match(
    renderGuard([{ id: 'a', md5: '1', img: img(8, 8, () => 6) }])[0].reason,
    /blank/
  );
  assert.equal(renderGuard([{ id: 'a', md5: '1', img: dark }]).length, 0);
});

test('render guard: identical fallback glyphs and inkless text fail', () => {
  // Every icon cell draws the same "?" glyph although the icons differ.
  const q = img(200, 40, (x, y) =>
    x % 40 > 14 && x % 40 < 22 && y > 10 && y < 30 ? 230 : 6
  );
  const icons = ['search', 'home', 'link', 'user', 'bell'].map((ic, i) => ({
    id: `i${i}`,
    t: 'icon_font',
    ic,
    d: 1,
    x: i * 40 + 6,
    y: 6,
    w: 28,
    h: 28,
  }));
  assert.match(
    glyphFindings({ img: q }, { nodes: icons })[0],
    /missing icon glyphs/
  );
  const blankText = [
    { id: 't', t: 'text', tx: 'Hello world', d: 1, x: 0, y: 0, w: 100, h: 20 },
  ];
  assert.match(
    glyphFindings({ img: img(120, 30, () => 6) }, { nodes: blankText })[0],
    /missing text/
  );
});

test('garble detector: speckle field fails, clean UI passes', () => {
  assert.equal(garbleFinding(clean()), null);
  assert.match(garbleFinding(garbled()), /garbled raster/);
  const half = img(160, 96, (x, y) =>
    y < 48 ? 6 : (x + 2 * y) % 3 === 0 ? 230 : 4
  );
  assert.ok(
    speckleBands(half)
      .slice(4)
      .every(b => b.v > 30),
    'lower bands flagged'
  );
  assert.match(garbleFinding(half), /garbled raster: 4\/8/);
});
