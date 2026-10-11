import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import {
  contentDensity,
  decodePng,
  frameDifference,
  loadStorefront,
  marketingVersion,
  pngInfo,
  RECEIPT_SCHEMA,
  REPO_ROOT,
  renderHtml,
  screenBackground,
  screenFile,
  sourceHash,
  validateStorefront,
  verifyOutput,
} from './app-store-graphics.mjs';

const colorSot = JSON.parse(
  readFileSync(join(REPO_ROOT, 'apps/web/design/ziawi-color-sot.json'), 'utf8')
);
const launchModeSource = readFileSync(
  join(REPO_ROOT, 'apps/ios/Jovie/App/LaunchMode.swift'),
  'utf8'
);
const context = { launchModeSource, colorSot };

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
}

function png(width, height, { colorType = 2, transparency = false } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    ...(transparency ? [chunk('tRNS', Buffer.alloc(6))] : []),
    chunk('IDAT', deflateSync(Buffer.from('tRNS inside pixel data'))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Encode RGB pixels, cycling every PNG row filter so decoding is exercised. */
function pixelPng(width, height, paint) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const stride = width * 3;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) pixels.set(paint(x, y), y * stride + x * 3);
  }
  const rows = [];
  for (let y = 0; y < height; y++) {
    const filter = y % 5;
    const row = Buffer.alloc(stride + 1);
    row[0] = filter;
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const left = x >= 3 ? pixels[at - 3] : 0;
      const up = y ? pixels[at - stride] : 0;
      const upLeft = x >= 3 && y ? pixels[at - stride - 3] : 0;
      const estimate = left + up - upLeft;
      const paeth =
        Math.abs(estimate - left) <= Math.abs(estimate - up) &&
        Math.abs(estimate - left) <= Math.abs(estimate - upLeft)
          ? left
          : Math.abs(estimate - up) <= Math.abs(estimate - upLeft)
            ? up
            : upLeft;
      const predictor = [0, left, up, (left + up) >> 1, paeth][filter];
      row[x + 1] = (pixels[at] - predictor) & 255;
    }
    rows.push(row);
  }
  return {
    pixels,
    png: Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(Buffer.concat(rows))),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  };
}

const CHECK = { top: 0.15, bottom: 0.85, minDensity: 0.002 };
const blankCapture = pixelPng(40, 40, () => [7, 8, 10]).png;
// Text-like rows: thin bright strokes on the dark shell.
const contentCapture = pixelPng(40, 40, (x, y) =>
  // Row 1 is the status bar band (2%-5% of the height).
  (y % 6 === 0 || y === 1) && x % 4 === 0 ? [240, 240, 240] : [7, 8, 10]
).png;

function withScreens(screens) {
  return { ...loadStorefront(), screens };
}

test('the committed storefront is valid', async () => {
  assert.deepEqual(await validateStorefront(loadStorefront(), context), []);
});

test('storefront validation rejects banned copy, fake fixtures and off-rotation accents', async () => {
  const base = loadStorefront().screens;
  const [first, second, third, fourth, fifth] = base.map(screen => screen.id);
  const problems = await validateStorefront(
    withScreens([
      { ...base[0], headline: 'Merch — now.' },
      { ...base[1], launchArgument: '-ui-testing-invented' },
      { ...base[2], accent: 'orange' },
      { ...base[3], accent: 'ion' },
      { ...base[4], accent: 'red', id: base[3].id },
    ]),
    context
  );
  const text = problems.join('\n');
  assert.match(text, new RegExp(`${first}: headline em-dash`));
  assert.match(text, /-ui-testing-invented is not a LaunchMode fixture/);
  // Rotation is positional: blue, purple, pink, orange, then repeat.
  assert.match(
    text,
    new RegExp(
      `${third}: accent must be pulse \\(rotation ion, ultra, pulse, orange\\)`
    )
  );
  assert.match(text, new RegExp(`${fourth}: accent must be orange`));
  assert.match(text, new RegExp(`${fourth}: accent must be ion`));
  assert.match(text, /duplicate id/);
  assert.ok(second && fifth);
});

test('a bound Pen section names frame, headline and capture nodes for every screen', async () => {
  const spec = loadStorefront();
  const problems = await validateStorefront(
    {
      ...spec,
      pen: {
        ...spec.pen,
        status: 'bound',
        sectionNodeId: 'abc12',
        frames: {
          ...spec.pen.frames,
          chat: { frame: 'XC4ox', headline: 'DVed2' },
          audience: undefined,
        },
      },
    },
    context
  );
  assert.deepEqual(problems, [
    'chat: no Pen capture node id',
    'audience: no Pen frame node id',
    'audience: no Pen headline node id',
    'audience: no Pen capture node id',
  ]);
  assert.deepEqual(
    await validateStorefront(
      { ...spec, pen: { ...spec.pen, status: 'drafted' } },
      context
    ),
    ['pen.status must be requested or bound']
  );
});

test('headlines are two or three words on at most two lines, with a bounded scroll', async () => {
  const base = loadStorefront().screens;
  const problems = await validateStorefront(
    withScreens([
      { ...base[0], headline: 'Merch.' },
      { ...base[1], headline: 'Capture every single fan.' },
      { ...base[2], headline: 'Drive\nstreams\nnow.' },
      { ...base[3], scroll: 0.5 },
      { ...base[4], headline: 'Share one\nlink.' },
    ]),
    context
  );
  assert.deepEqual(problems, [
    `${base[0].id}: headline must be two or three words`,
    `${base[1].id}: headline must be two or three words`,
    `${base[2].id}: headline must be one or two non-empty lines`,
    `${base[3].id}: scroll must be between 0 and 0.3`,
  ]);
});

test('the pinned app header must be a sane fraction of the screen', async () => {
  const spec = loadStorefront();
  assert.deepEqual(
    await validateStorefront(
      { ...spec, layout: { ...spec.layout, pinnedHeader: 0.4 } },
      context
    ),
    ['layout.pinnedHeader must be between 0 and 0.2']
  );
});

test('renderHtml pins the header and scrolls only the content below it', () => {
  const spec = loadStorefront();
  const html = renderHtml({
    spec,
    screen: { ...spec.screens[0], scroll: 0.1 },
    colorSot,
    captureDataUri: 'data:image/png;base64,AA==',
    fontDataUri: 'data:font/woff2;base64,AA==',
  });
  assert.match(html, /class="pinned"><img/);
  assert.match(html, /\.content img\{margin-top:-\d+px\}/);
});

test('screenBackground samples the app background near the bottom left', () => {
  assert.equal(screenBackground(blankCapture), '#07080a');
});

test('storefront validation enforces the App Store screenshot count', async () => {
  const problems = await validateStorefront(
    withScreens(loadStorefront().screens.slice(0, 2)),
    context
  );
  assert.deepEqual(problems, ['App Store listings take 3 to 10 screenshots']);
});

test('decodePng reverses every PNG row filter', () => {
  const { png: encoded, pixels } = pixelPng(9, 11, (x, y) => [
    (x * 37 + y * 11) & 255,
    (x * y * 7) & 255,
    (255 - x * 13) & 255,
  ]);
  const decoded = decodePng(encoded);
  assert.equal(decoded.channels, 3);
  assert.deepEqual(decoded.pixels, pixels);
  assert.throws(() => decodePng(png(1, 1, { colorType: 0 })), /only 8-bit/);
});

test('contentDensity separates an empty screen from a screen with content', () => {
  assert.equal(contentDensity(blankCapture, CHECK), 0);
  assert.ok(contentDensity(contentCapture, CHECK) >= CHECK.minDensity);
  assert.equal(contentDensity(contentCapture, { top: 0.5, bottom: 0.5 }), 0);
});

test('frameDifference ignores a caret blink but not a moved region', () => {
  const caret = pixelPng(40, 40, (x, y) =>
    x === 20 && y === 20 ? [240, 240, 240] : [7, 8, 10]
  ).png;
  assert.ok(frameDifference(blankCapture, caret) < 0.01);
  assert.equal(frameDifference(blankCapture, blankCapture), 0);
  assert.ok(frameDifference(blankCapture, contentCapture) > 0.05);
  assert.equal(
    frameDifference(blankCapture, pixelPng(20, 20, () => [0, 0, 0]).png),
    1
  );
});

test('screen files are ordered for fastlane deliver', () => {
  const spec = loadStorefront();
  assert.equal(screenFile(spec, 0), `en-US/01-${spec.screens[0].id}.png`);
});

test('marketing version must be single-valued', () => {
  assert.equal(
    marketingVersion('MARKETING_VERSION = 1.0;\nMARKETING_VERSION = 1.0;'),
    '1.0'
  );
  assert.throws(() =>
    marketingVersion('MARKETING_VERSION = 1.0;\nMARKETING_VERSION = 1.1;')
  );
  assert.throws(() => marketingVersion(''));
});

test('pngInfo reads size and alpha from the header chunks only', () => {
  assert.deepEqual(pngInfo(png(1320, 2868)), {
    width: 1320,
    height: 2868,
    hasAlpha: false,
  });
  assert.equal(pngInfo(png(1, 1, { colorType: 6 })).hasAlpha, true);
  assert.equal(pngInfo(png(1, 1, { transparency: true })).hasAlpha, true);
  assert.throws(() => pngInfo(Buffer.from('not a png')));
});

test('renderHtml escapes copy and uses the accent from the color source of truth', () => {
  const spec = loadStorefront();
  const html = renderHtml({
    spec,
    screen: { ...spec.screens[0], headline: '<b>Fans & shows</b>' },
    colorSot,
    captureDataUri: 'data:image/png;base64,AA==',
    fontDataUri: 'data:font/woff2;base64,AA==',
  });
  assert.match(html, /&lt;b&gt;Fans &amp; shows&lt;\/b&gt;/);
  assert.ok(html.includes(colorSot.accents.hex[spec.screens[0].accent]));
  assert.ok(html.includes(`width:${spec.device.width}px`));
});

test('sourceHash is stable for the same tree', () => {
  assert.match(sourceHash(), /^[0-9a-f]{64}$/);
  assert.equal(sourceHash(), sourceHash());
});

function writeSet(out, spec, mutate = {}) {
  const screens = spec.screens.map((screen, index) => {
    const file = screenFile(spec, index);
    const buffer =
      mutate.png?.(index) ?? png(spec.device.width, spec.device.height);
    const capture = mutate.capture?.(index) ?? contentCapture;
    mkdirSync(join(out, 'en-US'), { recursive: true });
    mkdirSync(join(out, 'raw'), { recursive: true });
    writeFileSync(join(out, file), buffer);
    writeFileSync(join(out, 'raw', `${screen.id}.png`), capture);
    return {
      id: screen.id,
      file,
      sha256: createHash('sha256').update(buffer).digest('hex'),
      captureSha256: createHash('sha256').update(capture).digest('hex'),
    };
  });
  writeFileSync(
    join(out, 'receipt.json'),
    JSON.stringify({
      schema: RECEIPT_SCHEMA,
      sourceHash: 'abc',
      marketingVersion: '1.0',
      screens,
    })
  );
}

test('verifyOutput passes a fresh set and fails stale or malformed ones', () => {
  const spec = loadStorefront();
  const fresh = mkdtempSync(join(tmpdir(), 'app-store-fresh-'));
  writeSet(fresh, spec);
  const current = { spec, currentSourceHash: 'abc', currentVersion: '1.0' };
  assert.deepEqual(verifyOutput({ out: fresh, ...current }), []);

  const stale = verifyOutput({
    out: fresh,
    ...current,
    currentSourceHash: 'def',
    currentVersion: '1.1',
  });
  assert.match(stale.join('\n'), /stale: app source changed/);
  assert.match(stale.join('\n'), /graphics are for 1.0, app is 1.1/);

  const broken = mkdtempSync(join(tmpdir(), 'app-store-broken-'));
  writeSet(broken, spec, {
    png: index =>
      index === 0
        ? png(1290, 2796)
        : index === 1
          ? png(spec.device.width, spec.device.height, { colorType: 6 })
          : undefined,
  });
  writeFileSync(
    join(broken, screenFile(spec, 2)),
    png(spec.device.width, spec.device.height, { transparency: true })
  );
  const text = verifyOutput({ out: broken, ...current }).join('\n');
  assert.match(text, /01-.*1290x2796, expected 1320x2868/);
  assert.match(text, /02-.*cannot have alpha/);
  assert.match(text, /03-.*does not match the receipt/);

  const empty = mkdtempSync(join(tmpdir(), 'app-store-blank-capture-'));
  writeSet(empty, spec, {
    capture: index => (index === 0 ? blankCapture : undefined),
  });
  assert.deepEqual(verifyOutput({ out: empty, ...current }), [
    `raw/${spec.screens[0].id}.png: status bar (9:41) is missing`,
    `${screenFile(spec, 0)}: capture is mostly empty (content density 0.00%), so it cannot show its headline`,
  ]);

  // Content without a status bar (scrolled or cropped away) also fails.
  const noStatusBar = pixelPng(40, 40, (x, y) =>
    y % 6 === 0 && y > 2 && x % 4 === 0 ? [240, 240, 240] : [7, 8, 10]
  ).png;
  const cropped = mkdtempSync(join(tmpdir(), 'app-store-no-status-bar-'));
  writeSet(cropped, spec, {
    capture: index => (index === 1 ? noStatusBar : undefined),
  });
  assert.deepEqual(verifyOutput({ out: cropped, ...current }), [
    `raw/${spec.screens[1].id}.png: status bar (9:41) is missing`,
  ]);

  assert.deepEqual(
    verifyOutput({
      out: mkdtempSync(join(tmpdir(), 'app-store-empty-')),
      ...current,
    }),
    ['receipt.json is missing or unreadable']
  );
});
