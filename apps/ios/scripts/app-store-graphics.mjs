#!/usr/bin/env node
/**
 * App Store graphics for the Jovie iOS app (JOV-4481).
 *
 *   node apps/ios/scripts/app-store-graphics.mjs capture --app <Jovie.app> [--out <dir>]
 *   node apps/ios/scripts/app-store-graphics.mjs render [--out <dir>]
 *   node apps/ios/scripts/app-store-graphics.mjs verify [--out <dir>]
 *
 * `apps/ios/app-store/storefront.json` is the code side of the Pen "App Store /
 * iOS screenshots (STAGING)" section: screen order, fixture launch argument,
 * headline, accent, and layout. Capture launches the real app on the 6.9-inch
 * simulator with fixture data, a fixed status bar and dark appearance. Render
 * composites each capture into the store graphic with Chromium. Verify fails
 * when the graphics were not generated from the current app source.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

export const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
export const STOREFRONT_PATH = 'apps/ios/app-store/storefront.json';
export const RECEIPT_SCHEMA = 'ios-app-store-graphics-receipt/v1';
const COLOR_SOT_PATH = 'apps/web/design/ziawi-color-sot.json';
const LAUNCH_MODE_PATH = 'apps/ios/Jovie/App/LaunchMode.swift';
const PBXPROJ_PATH = 'apps/ios/Jovie.xcodeproj/project.pbxproj';
const HEADLINE_FONT = 'apps/web/public/fonts/Satoshi-Variable.woff2';
const BUNDLE_ID = 'ie.jov.Jovie';
// Marketing rotates blue, purple, pink only (accent rotation rule 2026-09-26).
const MARKETING_ACCENTS = ['ion', 'ultra', 'pulse'];

/** Everything that changes what the store graphics show. */
export const SOURCE_INPUTS = [
  'apps/ios/Jovie',
  PBXPROJ_PATH,
  'apps/ios/app-store',
  'apps/ios/scripts/app-store-graphics.mjs',
  COLOR_SOT_PATH,
  HEADLINE_FONT,
];

export const DEFAULT_OUT = join(REPO_ROOT, 'artifacts/app-store-graphics');

function readRepo(path, root = REPO_ROOT) {
  return readFileSync(join(root, path), 'utf8');
}

export function loadStorefront(root = REPO_ROOT) {
  return JSON.parse(readRepo(STOREFRONT_PATH, root));
}

export function screenFile(spec, index) {
  const screen = spec.screens[index];
  return `${spec.locale}/${String(index + 1).padStart(2, '0')}-${screen.id}.png`;
}

/**
 * Content hash of the committed inputs, from git blob ids. Keys the receipt
 * so any app UI, version, copy, or template change makes old graphics stale.
 */
export function sourceHash(root = REPO_ROOT) {
  const listing = execFileSync(
    'git',
    ['ls-files', '-s', '--', ...SOURCE_INPUTS],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  if (!listing.trim())
    throw new Error('No App Store graphics inputs are tracked');
  return createHash('sha256').update(listing).digest('hex');
}

export function marketingVersion(pbxproj) {
  const versions = new Set(
    [...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(m => m[1].trim())
  );
  if (versions.size !== 1) {
    throw new Error(
      `Expected one MARKETING_VERSION, found ${[...versions].join(', ') || 'none'}`
    );
  }
  return [...versions][0];
}

/** Validate the storefront spec. Returns a list of problems; empty means valid. */
export async function validateStorefront(spec, { launchModeSource, colorSot }) {
  const problems = [];
  const { lintCopy } = await import('../../../packages/copy/lint.ts');
  const ids = new Set();
  if (!spec.device?.width || !spec.device?.height)
    problems.push('device size is missing');
  const check = spec.contentCheck;
  if (
    !check ||
    !(check.top >= 0 && check.top < check.bottom && check.bottom <= 1) ||
    !(check.minDensity > 0)
  ) {
    problems.push(
      'contentCheck needs 0 <= top < bottom <= 1 and minDensity > 0'
    );
  }
  // Pen binding: `requested` until studio builds the section, then every
  // screen maps to its Pen frame id.
  if (!['requested', 'bound'].includes(spec.pen?.status)) {
    problems.push('pen.status must be requested or bound');
  }
  if (spec.pen?.status === 'bound') {
    if (!spec.pen.sectionNodeId) problems.push('pen.sectionNodeId is missing');
    for (const screen of spec.screens ?? []) {
      if (!spec.pen.frames?.[screen.id])
        problems.push(`${screen.id}: no Pen frame id`);
    }
  }
  if (
    !Array.isArray(spec.screens) ||
    spec.screens.length < 3 ||
    spec.screens.length > 10
  ) {
    problems.push('App Store listings take 3 to 10 screenshots');
    return problems;
  }
  spec.screens.forEach((screen, index) => {
    const label = screen.id ?? `screen ${index + 1}`;
    if (!/^[a-z0-9-]+$/.test(screen.id ?? ''))
      problems.push(`${label}: id must be kebab-case`);
    if (ids.has(screen.id)) problems.push(`${label}: duplicate id`);
    ids.add(screen.id);
    if (
      !launchModeSource.includes(
        `arguments.contains("${screen.launchArgument}")`
      )
    ) {
      problems.push(
        `${label}: ${screen.launchArgument} is not a LaunchMode fixture`
      );
    }
    if (
      !MARKETING_ACCENTS.includes(screen.accent) ||
      !colorSot.accents.hex[screen.accent]
    ) {
      problems.push(
        `${label}: accent must be one of ${MARKETING_ACCENTS.join(', ')}`
      );
    }
    if (index > 0 && spec.screens[index - 1].accent === screen.accent) {
      problems.push(`${label}: neighbours must not share an accent`);
    }
    const copy = lintCopy(screen.headline ?? '', {
      register: 'jovie-marketing',
      headline: true,
    });
    for (const finding of copy.blocking) {
      problems.push(`${label}: headline ${finding.rule} (${finding.message})`);
    }
    if (!screen.headline || screen.headline.length > 40) {
      problems.push(`${label}: headline must be 1 to 40 characters`);
    }
  });
  return problems;
}

/** Width, height and alpha from a PNG header. */
export function pngInfo(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('not a PNG');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  // tRNS must precede the first IDAT, so only the header chunks are walked.
  let hasTransparencyChunk = false;
  for (let offset = 8; offset + 8 <= buffer.length; ) {
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT' || type === 'IEND') break;
    if (type === 'tRNS') hasTransparencyChunk = true;
    offset += 12 + buffer.readUInt32BE(offset);
  }
  const hasAlpha = colorType === 4 || colorType === 6 || hasTransparencyChunk;
  return { width, height, hasAlpha };
}

/** RGB(A) pixels of an 8-bit, non-interlaced truecolor PNG. */
export function decodePng(buffer) {
  const { width, height } = pngInfo(buffer);
  const colorType = buffer[25];
  if (buffer[24] !== 8 || buffer[28] !== 0 || ![2, 6].includes(colorType)) {
    throw new Error('only 8-bit non-interlaced RGB or RGBA PNGs are supported');
  }
  const channels = colorType === 6 ? 4 : 3;
  const data = [];
  for (let offset = 8; offset + 8 <= buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    if (buffer.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      data.push(buffer.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[dst + x - channels] : 0;
      const up = y ? pixels[dst - stride + x] : 0;
      const upLeft =
        x >= channels && y ? pixels[dst - stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const toLeft = Math.abs(estimate - left);
        const toUp = Math.abs(estimate - up);
        const toUpLeft = Math.abs(estimate - upLeft);
        predictor =
          toLeft <= toUp && toLeft <= toUpLeft
            ? left
            : toUp <= toUpLeft
              ? up
              : upLeft;
      }
      pixels[dst + x] = (raw[src + x] + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}

/**
 * Share of sampled pixels in the screen body (between `top` and `bottom`
 * fractions of the height) that sit on a hard luminance edge. Text, cards and
 * artwork score around 1%; a blank thread, spinner or empty state scores ~0.
 */
export function contentDensity(buffer, { top, bottom }) {
  const { width, height, channels, pixels } = decodePng(buffer);
  const luma = (x, y) => {
    const i = (y * width + x) * channels;
    return (pixels[i] * 2 + pixels[i + 1] * 5 + pixels[i + 2]) >> 3;
  };
  let edges = 0;
  let samples = 0;
  for (
    let y = Math.round(height * top);
    y < Math.round(height * bottom);
    y += 2
  ) {
    for (let x = 0; x < width - 1; x += 2) {
      samples++;
      if (Math.abs(luma(x, y) - luma(x + 1, y)) > 32) edges++;
    }
  }
  return samples ? edges / samples : 0;
}

/**
 * Share of sampled pixels that differ visibly between two same-size frames.
 * A blinking caret or a spinner glyph stays far below 0.1%; a timeline still
 * seeding or scrolling moves whole regions.
 */
export function frameDifference(a, b) {
  const first = decodePng(a);
  const second = decodePng(b);
  if (first.width !== second.width || first.height !== second.height) return 1;
  let changed = 0;
  let samples = 0;
  for (let y = 0; y < first.height; y += 2) {
    for (let x = 0; x < first.width; x += 2) {
      const i = (y * first.width + x) * first.channels;
      const j = (y * second.width + x) * second.channels;
      samples++;
      if (
        Math.abs(first.pixels[i] - second.pixels[j]) > 16 ||
        Math.abs(first.pixels[i + 1] - second.pixels[j + 1]) > 16 ||
        Math.abs(first.pixels[i + 2] - second.pixels[j + 2]) > 16
      ) {
        changed++;
      }
    }
  }
  return changed / samples;
}

function escapeHtml(text) {
  return text.replace(
    /[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}

/** One store graphic as a self-contained HTML document. */
export function renderHtml({
  spec,
  screen,
  colorSot,
  captureDataUri,
  fontDataUri,
}) {
  const { width, height } = spec.device;
  const layout = spec.layout;
  const canvas = colorSot.elevations.dark[layout.canvas];
  const card = colorSot.elevations.dark.card;
  const floating = colorSot.elevations.dark.floating;
  const accent = colorSot.accents.hex[screen.accent];
  const screenWidth = layout.deviceWidth - layout.bezel * 2;
  const screenHeight = Math.round((screenWidth * height) / width);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Satoshi;src:url(${fontDataUri}) format("woff2");font-weight:300 900}
*{box-sizing:border-box;margin:0}
html,body{width:${width}px;height:${height}px;overflow:hidden;background:${canvas}}
.stage{position:relative;width:100%;height:100%;
background:radial-gradient(ellipse 90% 60% at 50% 66%,
color-mix(in oklch,${accent} 62%,${canvas}) 0%,
color-mix(in oklch,${accent} 26%,${canvas}) 46%,${canvas} 82%)}
h1{position:absolute;top:${layout.headlineTop}px;left:50%;transform:translateX(-50%);
width:${layout.headlineMaxWidth}px;text-align:center;color:#fff;
font:700 ${layout.headlineSize}px/1.05 Satoshi,Inter,system-ui,sans-serif;
letter-spacing:-0.02em;text-wrap:balance}
.device{position:absolute;top:${layout.deviceTop}px;left:50%;transform:translateX(-50%);
width:${layout.deviceWidth}px;padding:${layout.bezel}px;background:${card};
border:2px solid ${floating};border-radius:${layout.deviceRadius}px}
.device img{display:block;width:${screenWidth}px;height:${screenHeight}px;
border-radius:${layout.deviceRadius - layout.bezel}px}
</style></head><body><div class="stage" data-screen="${screen.id}">
<h1>${escapeHtml(screen.headline)}</h1>
<div class="device"><img alt="" src="${captureDataUri}"></div>
</div></body></html>`;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    timeout: 180_000,
    ...options,
  });
}

/** For simctl calls whose failure means "already in that state". */
function runQuietly(command, args) {
  try {
    run(command, args, { stdio: 'ignore' });
  } catch {
    // Already booted, not installed, or not running.
  }
}

function simulatorUdid(name) {
  const { devices } = JSON.parse(
    run('xcrun', ['simctl', 'list', 'devices', 'available', '-j'])
  );
  for (const [runtime, list] of Object.entries(devices)) {
    if (!runtime.includes('SimRuntime.iOS')) continue;
    const match = list.find(
      device => device.name === name && device.isAvailable
    );
    if (match) return match.udid;
  }
  throw new Error(
    `No available "${name}" simulator; App Store sizes need that exact device`
  );
}

const sleep = ms => new Promise(done => setTimeout(done, ms));

/**
 * Screenshot until two consecutive frames match and the screen body has
 * content. Fixtures seed asynchronously, and a cold CI simulator is much
 * slower than a warm local one, so a fixed delay captured empty screens.
 */
async function captureSettled({ udid, file, spec, screen, settleMs }) {
  const deadline = Date.now() + settleMs * 6;
  await sleep(settleMs);
  let previous;
  let density = 0;
  let difference = 1;
  while (true) {
    run('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=png', file], {
      stdio: 'ignore',
    });
    const buffer = readFileSync(file);
    density = contentDensity(buffer, spec.contentCheck);
    difference = previous ? frameDifference(previous, buffer) : 1;
    const settled = difference < 0.001;
    if (settled && density >= spec.contentCheck.minDensity) return buffer;
    if (Date.now() > deadline) {
      throw new Error(
        `${screen.id}: ${settled ? 'screen body is empty' : 'screen never settled'} (content density ${(density * 100).toFixed(2)}%, last frame change ${(difference * 100).toFixed(2)}%)`
      );
    }
    previous = buffer;
    await sleep(2000);
  }
}

async function capture({ appPath, out, settleMs }) {
  const spec = loadStorefront();
  if (!appPath) throw new Error('capture needs --app <path to Jovie.app>');
  const udid = simulatorUdid(spec.device.simulator);
  const rawDir = join(out, 'raw');
  mkdirSync(rawDir, { recursive: true });
  runQuietly('xcrun', ['simctl', 'boot', udid]);
  run('xcrun', ['simctl', 'bootstatus', udid, '-b'], { timeout: 300_000 });
  run('xcrun', ['simctl', 'ui', udid, 'appearance', 'dark']);
  run('xcrun', [
    'simctl',
    'status_bar',
    udid,
    'override',
    '--time',
    '9:41',
    '--dataNetwork',
    'wifi',
    '--wifiMode',
    'active',
    '--wifiBars',
    '3',
    '--cellularMode',
    'active',
    '--cellularBars',
    '4',
    '--operatorName',
    '',
    '--batteryState',
    'charged',
    '--batteryLevel',
    '100',
  ]);
  runQuietly('xcrun', ['simctl', 'uninstall', udid, BUNDLE_ID]);
  run('xcrun', ['simctl', 'install', udid, appPath]);
  for (const screen of spec.screens) {
    runQuietly('xcrun', ['simctl', 'terminate', udid, BUNDLE_ID]);
    run('xcrun', [
      'simctl',
      'launch',
      udid,
      BUNDLE_ID,
      screen.launchArgument,
      'UITest',
    ]);
    const file = join(rawDir, `${screen.id}.png`);
    const buffer = await captureSettled({ udid, file, spec, screen, settleMs });
    const info = pngInfo(buffer);
    if (
      info.width !== spec.device.width ||
      info.height !== spec.device.height
    ) {
      throw new Error(
        `${screen.id}: captured ${info.width}x${info.height}, expected ${spec.device.width}x${spec.device.height}`
      );
    }
    console.log(`captured ${file}`);
  }
  run('xcrun', ['simctl', 'status_bar', udid, 'clear']);
}

async function render({ out }) {
  const spec = loadStorefront();
  const colorSot = JSON.parse(readRepo(COLOR_SOT_PATH));
  const problems = await validateStorefront(spec, {
    launchModeSource: readRepo(LAUNCH_MODE_PATH),
    colorSot,
  });
  if (problems.length)
    throw new Error(`storefront.json is invalid:\n${problems.join('\n')}`);
  const fontDataUri = `data:font/woff2;base64,${readFileSync(join(REPO_ROOT, HEADLINE_FONT)).toString('base64')}`;
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const screens = [];
  try {
    const page = await browser.newPage({
      viewport: { width: spec.device.width, height: spec.device.height },
      deviceScaleFactor: 1,
    });
    for (const [index, screen] of spec.screens.entries()) {
      const raw = readFileSync(join(out, 'raw', `${screen.id}.png`));
      await page.setContent(
        renderHtml({
          spec,
          screen,
          colorSot,
          fontDataUri,
          captureDataUri: `data:image/png;base64,${raw.toString('base64')}`,
        }),
        { waitUntil: 'load' }
      );
      await page.evaluate(() => document.fonts.ready);
      const file = screenFile(spec, index);
      mkdirSync(dirname(join(out, file)), { recursive: true });
      const png = await page.screenshot({ type: 'png' });
      writeFileSync(join(out, file), png);
      screens.push({
        id: screen.id,
        file,
        sha256: sha256(png),
        captureSha256: sha256(raw),
        contentDensity: contentDensity(raw, spec.contentCheck),
      });
      console.log(`rendered ${join(out, file)}`);
    }
  } finally {
    await browser.close();
  }
  const receipt = {
    schema: RECEIPT_SCHEMA,
    sourceHash: sourceHash(),
    marketingVersion: marketingVersion(readRepo(PBXPROJ_PATH)),
    gitSha: run('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).trim(),
    device: spec.device,
    pen: { status: spec.pen.status, sectionNodeId: spec.pen.sectionNodeId },
    screens,
  };
  writeFileSync(
    join(out, 'receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
}

/** Problems that make a generated set unusable or stale; empty means fresh. */
export function verifyOutput({ out, spec, currentSourceHash, currentVersion }) {
  const problems = [];
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(join(out, 'receipt.json'), 'utf8'));
  } catch {
    return ['receipt.json is missing or unreadable'];
  }
  if (receipt.schema !== RECEIPT_SCHEMA)
    problems.push(`receipt schema is ${receipt.schema}`);
  if (receipt.sourceHash !== currentSourceHash) {
    problems.push(
      'graphics are stale: app source changed since they were rendered'
    );
  }
  if (receipt.marketingVersion !== currentVersion) {
    problems.push(
      `graphics are for ${receipt.marketingVersion}, app is ${currentVersion}`
    );
  }
  spec.screens.forEach((screen, index) => {
    const file = screenFile(spec, index);
    const entry = receipt.screens?.find(s => s.id === screen.id);
    if (!entry || entry.file !== file) {
      problems.push(`${file}: not in the receipt`);
      return;
    }
    let buffer;
    try {
      buffer = readFileSync(join(out, file));
    } catch {
      problems.push(`${file}: missing`);
      return;
    }
    const info = pngInfo(buffer);
    if (
      info.width !== spec.device.width ||
      info.height !== spec.device.height
    ) {
      problems.push(
        `${file}: ${info.width}x${info.height}, expected ${spec.device.width}x${spec.device.height}`
      );
    }
    if (info.hasAlpha)
      problems.push(`${file}: App Store screenshots cannot have alpha`);
    if (sha256(buffer) !== entry.sha256)
      problems.push(`${file}: does not match the receipt`);
    let capture;
    try {
      capture = readFileSync(join(out, 'raw', `${screen.id}.png`));
    } catch {
      problems.push(`raw/${screen.id}.png: missing`);
      return;
    }
    if (sha256(capture) !== entry.captureSha256) {
      problems.push(`raw/${screen.id}.png: does not match the receipt`);
    }
    const density = contentDensity(capture, spec.contentCheck);
    if (density < spec.contentCheck.minDensity) {
      problems.push(
        `${file}: capture is mostly empty (content density ${(density * 100).toFixed(2)}%), so it cannot show its headline`
      );
    }
  });
  if ((receipt.screens?.length ?? 0) !== spec.screens.length) {
    problems.push('receipt screen count does not match storefront.json');
  }
  return problems;
}

function verify({ out }) {
  const problems = verifyOutput({
    out,
    spec: loadStorefront(),
    currentSourceHash: sourceHash(),
    currentVersion: marketingVersion(readRepo(PBXPROJ_PATH)),
  });
  if (problems.length)
    throw new Error(
      `App Store graphics failed verification:\n${problems.join('\n')}`
    );
  console.log(
    `App Store graphics in ${out} are fresh for the current app source`
  );
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main(argv) {
  const [command, ...args] = argv;
  const out = resolve(option(args, '--out') ?? DEFAULT_OUT);
  if (command === 'capture') {
    await capture({
      appPath: option(args, '--app'),
      out,
      settleMs: Number(option(args, '--settle-ms') ?? 5000),
    });
  } else if (command === 'render') {
    await render({ out });
  } else if (command === 'verify') {
    verify({ out });
  } else {
    throw new Error(
      'usage: app-store-graphics.mjs capture|render|verify [--out dir] [--app Jovie.app]'
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
