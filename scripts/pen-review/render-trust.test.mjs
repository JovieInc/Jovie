import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { garbleFinding, speckleBands } from './render-guard.mjs';
import { prepareHtml } from './render-html.mjs';
import { renderTrusted } from './run.mjs';

const img = (w, h, f) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = f(x, y);
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  return { width: w, height: h, data };
};
// Clean dark UI: flat panels with a few crisp text-like bars.
const clean = () =>
  img(160, 96, (x, y) => (y % 24 > 18 && x % 40 < 30 ? 220 : 6));
// Mis-strided readback: dense isolated speckle (deterministic hash noise).
const garbled = () => img(160, 96, (x, y) => ((x + 2 * y) % 3 === 0 ? 230 : 4));

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

// PNG encode is not needed: the exporter stub returns a buffer and decodePng is
// bypassed by encoding the stub images through the real decoder's input format.
import { deflateSync } from 'node:zlib';

function png({ width, height, data }) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = b => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type), body]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(tb));
    return Buffer.concat([len, tb, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    Buffer.from(data.buffer, y * width * 4, width * 4).copy(
      raw,
      y * (width * 4 + 1) + 1
    );
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const out = (id, image) => {
  const buf = png(image);
  return [
    {
      id,
      path: `/x/${id}.png`,
      buf,
      md5: createHash('md5').update(buf).digest('hex'),
    },
  ];
};
const facts = { name: 'PROPOSAL / X · dark', nodes: [] };
const noWait = async () => {};

test('renderTrusted: needs two identical clean exports (font race settles)', async () => {
  const seq = [
    clean(),
    img(160, 96, (x, y) => (y % 24 > 18 && x % 40 < 31 ? 220 : 6)),
    img(160, 96, (x, y) => (y % 24 > 18 && x % 40 < 31 ? 220 : 6)),
  ];
  let i = 0;
  const r = await renderTrusted('F', '/x', facts, {
    exporter: () => out('F', seq[i++]),
    wait: noWait,
    htmlFallback: async () => null,
  });
  assert.equal(r.renderer, 'pen-raster');
  assert.equal(r.stable, true);
  assert.deepEqual(r.guard, []);
  assert.equal(i, 3, 'first export differed, so two more were needed');
});

test('renderTrusted: garbled raster falls back to the Chromium html render', async () => {
  const r = await renderTrusted('F', '/x', facts, {
    exporter: () => out('F', garbled()),
    wait: noWait,
    htmlFallback: async id => ({ ...out(id, clean())[0], problems: [] }),
  });
  assert.equal(r.renderer, 'chromium-html');
  assert.deepEqual(r.guard, []);
  assert.match(r.rasterGuard[0].reason, /garbled raster/);
});

test('renderTrusted: html fallback font failure keeps the render untrusted', async () => {
  const r = await renderTrusted('F', '/x', facts, {
    exporter: () => out('F', garbled()),
    wait: noWait,
    htmlFallback: async id => ({
      ...out(id, clean())[0],
      problems: ['font not loaded: Satoshi'],
    }),
  });
  assert.deepEqual(r.guard, ['font not loaded: Satoshi']);
});

test('prepareHtml: local fonts replace Google Fonts, relative images resolve', () => {
  const html = `<html><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link href="https://fonts.googleapis.com/css2?family=Inter%3Awght%40100..900&display=swap" rel="stylesheet" /><link href="https://fonts.googleapis.com/css2?family=Fraunces&display=swap" rel="stylesheet" /></head><body><div style="background-image: url('generated-58.png')"></div><img src="a b.png"></body></html>`;
  const out = prepareHtml(html, {
    assetBase: '/ws',
    fontDir: '/fonts',
    localFonts: { Inter: { file: 'Inter.woff2', weight: '100 900' } },
  });
  assert.doesNotMatch(out, /family=Inter/);
  assert.match(out, /family=Fraunces&display=block/);
  assert.match(out, /url\('file:\/\/\/ws\/generated-58\.png'\)/);
  assert.match(out, /src="file:\/\/\/ws\/a%20b\.png"/);
});
