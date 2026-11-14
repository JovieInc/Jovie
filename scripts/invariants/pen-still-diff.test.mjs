// biome-ignore-all format: compact tests for the advisory Pen-still diff.
// biome-ignore-all assist/source/organizeImports: compact tests keep imports together.
import assert from 'node:assert/strict'; import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { test } from 'node:test'; import {
compareImages, evaluateManifest, evaluateManifestWithBrowser, formatComment, frameCaptureUrl, parseManifest,
selectFrames, syntheticComparison, validateManifest, } from './pen-still-diff.mjs';
import { decodePng, encodePng, measureImage, ssim, stretchedPair, syntheticPair } from './pen-still-diff-lib.mjs';
import { captureSurfacePng } from './clef-screenshot-capture.mjs';
const CAPTURE_PNG = encodePng(syntheticPair().pen);
async function assertCaptureGeometry(expectedPath) {
  const calls = [];
  const mockup = {
    getBoundingClientRect: () => ({ x: 42, y: 104, width: 192, height: 256 }),
  };
  const heading = {
    getBoundingClientRect: () => ({ x: 26, y: 36, width: 120, height: 24 }),
  };
  const root = {
    getBoundingClientRect: () => ({ x: 10, y: 20, width: 320, height: 480 }),
    querySelector: selector =>
      selector === '[data-pen-mockup]' ? mockup : null,
    querySelectorAll: () => [heading],
  };
  const documentElement = {
    ownerDocument: {
      querySelector: selector => (selector === '.hero' ? root : null),
    },
  };
  const page = {
    goto: async url => calls.push(['goto', url]),
    url: () => 'http://127.0.0.1/fixture?source=capture',
    waitForTimeout: async wait => calls.push(['wait', wait]),
    locator: selector => ({
      first: () => ({ screenshot: async () => CAPTURE_PNG }),
      evaluate: async (callback, arg) => {
        assert.equal(selector, 'html');
        return callback(documentElement, arg);
      },
    }),
    close: async () => calls.push(['close']),
  };
  const browser = /** @type {import('playwright').Browser} */ (
    /** @type {unknown} */ ({
      newPage: async options => {
        calls.push(['newPage', options]);
        return page;
      },
    })
  );
  const captured = await captureSurfacePng(browser, {
    url: 'http://127.0.0.1/fixture',
    viewport: 390,
    selector: '.hero',
    wait: 0,
    expectedPath,
  });
  assert.equal(captured.png, CAPTURE_PNG);
  assert.equal(captured.viewport, 390);
  assert.equal(captured.mode, 'dark');
  assert.equal(captured.finalUrl, 'http://127.0.0.1/fixture?source=capture');
  assert.deepEqual(captured.geometry, {
    section: { width: 320, height: 480 },
    mockup: { x: 32, y: 84, width: 192, height: 256 },
    textBlocks: [{ x: 16, y: 16, width: 120, height: 24 }],
  });
  assert.equal(calls[0][1].colorScheme, 'dark');
  assert.deepEqual(calls.at(-1), ['close']);
}

for (const expectedPath of [undefined, '/fixture']) {
  test(`capture measures browser-owned DOM geometry and closes its page (${expectedPath ?? 'unrestricted'})`, async () => {
    await assertCaptureGeometry(expectedPath);
  });
}

test('capture reports an off-route redirect before waiting or taking a screenshot', async () => {
  const calls = [];
  const finalUrl = 'https://example.test/signin?redirect_url=%2Fapp%2Fchat';
  const browser = /** @type {import('playwright').Browser} */ (
    /** @type {unknown} */ ({
      newPage: async () => ({
        goto: async url => calls.push(['goto', url]),
        url: () => finalUrl,
        waitForTimeout: async () => assert.fail('redirects must not wait'),
        click: async () => assert.fail('redirects must not click'),
        locator: () => assert.fail('redirects must not capture the wrong page'),
        screenshot: async () => assert.fail('redirects must not screenshot'),
        close: async () => calls.push(['close']),
      }),
    })
  );
  const captured = await captureSurfacePng(browser, {
    url: 'https://example.test/app/chat',
    expectedPath: '/app/chat',
    selector: '[data-pen-section="chat/app-chat"]',
    click: 'button',
  });
  assert.deepEqual(captured, {
    png: null,
    geometry: null,
    viewport: 1440,
    mode: 'dark',
    finalUrl,
    redirected: true,
  });
  assert.deepEqual(calls, [
    ['goto', 'https://example.test/app/chat'],
    ['close'],
  ]);
});

// Inline fixture: the legacy homepage manifest was folded into docs/design-system/pen-bindings.json.
const manifest = JSON.parse(`{"schema": "pen-still-manifest/v1", "surface": "homepage", "primaryMode": "dark", "penFile": {"name": "Jovie Homepage Profiles Claim \u2014 review copy 2026-10-01.pen", "sha256": null, "note": "The live Pen file is on the design machine and is not in this repo. Fill sha256 when canonical stills are exported."}, "frames": [{"sectionId": "hero", "penNodeId": "pending-canonical-hero", "fileHash": null, "stillPath": "docs/pen-stills/homepage/hero.dark.1440.png", "viewport": 1440, "mode": "dark", "status": "active", "route": "/", "story": "homepage--hero", "sectionSelector": "[data-pen-section='hero']", "mockupSelector": "[data-pen-mockup]"}, {"sectionId": "hero", "penNodeId": "pending-canonical-hero", "fileHash": null, "stillPath": "docs/pen-stills/homepage/hero.dark.390.png", "viewport": 390, "mode": "dark", "status": "active", "route": "/", "story": "homepage--hero", "sectionSelector": "[data-pen-section='hero']", "mockupSelector": "[data-pen-mockup]"}, {"sectionId": "hero", "penNodeId": "pending-canonical-hero", "fileHash": null, "stillPath": "docs/pen-stills/homepage/hero.light.1440.png", "viewport": 1440, "mode": "light", "status": "active", "route": "/", "story": "homepage--hero", "sectionSelector": "[data-pen-section='hero']", "mockupSelector": "[data-pen-mockup]"}, {"sectionId": "parked-exploration", "penNodeId": "parked-example", "fileHash": null, "stillPath": "docs/pen-stills/homepage/parked.dark.1440.png", "viewport": 1440, "mode": "dark", "status": "parked"}, {"sectionId": "taste-fork", "penNodeId": "fork-example", "fileHash": null, "stillPath": "docs/pen-stills/homepage/fork.dark.1440.png", "viewport": 1440, "mode": "dark", "status": "fork"}]}`);
test('legacy frame manifest is valid, dark-first, and drops parked and fork frames', () => {
const validated = validateManifest(manifest); assert.equal(validated.ok, true); if (!validated.ok) return;
assert.equal(validated.manifest.primaryMode, 'dark'); const selected = selectFrames(validated.manifest);
assert.deepEqual(selected.excluded.map(frame => frame.status).sort(), ['fork', 'parked']);
assert.ok(selected.active.every(frame => frame.status === 'active'));
assert.equal(selected.active[0].mode, 'dark'); assert.equal(selected.active[0].viewport, 1440);
assert.ok(selected.active.findIndex(frame => frame.mode === 'light') > 0);
const docs = [readFileSync(join(import.meta.dirname, '../../docs/pen-stills/README.md'), 'utf8'), JSON.stringify(manifest)].join('\n');
assert.match(docs, /Be found\. Be understood\./); assert.doesNotMatch(docs, /Daniel Kang|Haruki|payroll/i); });
test('manifest rejects a light primary mode and a duplicate frame', () => {
assert.equal(validateManifest({ ...manifest, primaryMode: 'light' }).ok, false);
const duplicate = structuredClone(manifest); duplicate.frames.push({ ...duplicate.frames[0] });
const again = validateManifest(duplicate); assert.equal(again.ok, false);
assert.match(again.errors.join('\n'), /duplicates/); }); test('story URL wins over the route', () => {
assert.equal(
frameCaptureUrl({ story: 'homepage--hero', route: '/' }, { baseUrl: 'http://127.0.0.1:3000', storybookUrl: 'http://127.0.0.1:6006/' }),
'http://127.0.0.1:6006/iframe.html?id=homepage--hero&viewMode=story', );
assert.equal(frameCaptureUrl({ route: '/pricing' }, { baseUrl: 'http://127.0.0.1:3000' }), 'http://127.0.0.1:3000/pricing');
}); test('png roundtrip and identical stills score SSIM 1', () => { const { pen } = syntheticPair();
const decoded = decodePng(encodePng(pen)); assert.equal(decoded.width, pen.width);
assert.equal(decoded.height, pen.height); assert.ok(Math.abs(ssim(pen, decoded) - 1) < 1e-6); });
test('synthetic pair stays inside tolerance and a tall section does not', () => {
const sample = syntheticComparison(); assert.equal(sample.pass, true);
assert.ok(sample.judgment.ssim >= sample.judgment.tolerances.ssimMin);
assert.ok(sample.triptych.width > sample.triptych.height);
const compared = compareImages(...Object.values(stretchedPair()));
assert.equal(compared.judgment.sectionPass, false); assert.equal(compared.judgment.pass, false);
assert.ok(compared.judgment.sectionHeightRatio > 1.5); });
test('mockup aspect and text-block centers are measured on the still', () => {
const metrics = measureImage(syntheticPair().pen); assert.ok(metrics.mockup);
assert.ok(metrics.mockup.aspect > 1); assert.equal(metrics.textBlocks.length, 2);
assert.ok(metrics.textBlocks[0].y < metrics.mockup.y); });
test('missing canonical stills are advisory and excluded frames stay out', async () => {
const receipt = await evaluateManifest(parseManifest(JSON.stringify(manifest)), { root: '/tmp/no-such-stills' });
assert.equal(receipt.pass, true); assert.equal(receipt.advisory, true);
assert.ok(receipt.frames.every(frame => frame.verdict === 'waiting'));
assert.equal(receipt.sample.kind, 'synthetic'); assert.equal(receipt.excluded.length, 2);
const comment = formatComment({ ...receipt, sample: { ...receipt.sample, triptych: undefined }, triptychs: [] });
assert.match(comment, /pen-still-diff/); assert.match(comment, /synthetic sample/);
assert.doesNotMatch(comment, /!\[/); /* No links before artifacts have been written. */ });
test('a conformant render passes even when DOM geometry counts different things (JOV-11623)', async () => {
const dir = mkdtempSync(join(tmpdir(), 'pen-still-'));
const { pen, render } = syntheticPair();
writeFileSync(join(dir, 'hero.png'), encodePng(pen));
const receipt = await evaluateManifest({
schema: 'pen-still-manifest/v1', primaryMode: 'dark', frames: [{
sectionId: 'hero', penNodeId: 'node', stillPath: 'hero.png',
viewport: 1440, mode: 'dark', status: 'active', route: '/' }]},
{ root: dir, baseUrl: 'http://127.0.0.1:9', capture: async () => ({
// DOM geometry that disagrees with the pixels: a null mockup element and
// one text block where the pixels hold two bands. The comparison must
// derive both sides from pixels and pass the conformant render.
png: encodePng(render),
geometry: { section: { width: 1440, height: 900 }, mockup: null,
textBlocks: [{ x: 0, y: 0, width: 10, height: 10 }] } }) });
assert.equal(receipt.frames[0].verdict, 'pass');
assert.equal(receipt.frames[0].judgment.textPass, true);
assert.equal(receipt.frames[0].judgment.mockupPass, true); });

test('a capture that lands on a different route waits instead of comparing (JOV-11623)', async () => {
const dir = mkdtempSync(join(tmpdir(), 'pen-still-'));
const { pen } = syntheticPair();
writeFileSync(join(dir, 'start.png'), encodePng(pen));
const receipt = await evaluateManifest({
schema: 'pen-still-manifest/v1', primaryMode: 'dark', frames: [{
sectionId: 'onboarding/start', penNodeId: 'node', stillPath: 'start.png',
viewport: 1440, mode: 'dark', status: 'active', route: '/start' }]},
{ root: dir, baseUrl: 'http://127.0.0.1:9', capture: async () => ({
png: encodePng(pen), finalUrl: 'https://jov.ie/waitlist' }) });
assert.equal(receipt.frames[0].verdict, 'waiting');
assert.equal(receipt.frames[0].reason, 'capture-redirected-off-route'); });

test('a hash mismatch fails the frame without reading a capture', async () => {
const dir = mkdtempSync(join(tmpdir(), 'pen-still-'));
writeFileSync(join(dir, 'hero.png'), encodePng(syntheticPair().pen)); const receipt = await evaluateManifest({
schema: 'pen-still-manifest/v1', primaryMode: 'dark', frames: [{
sectionId: 'hero', penNodeId: 'node', fileHash: 'sha256:deadbeef', stillPath: 'hero.png',
viewport: 1440, mode: 'dark', status: 'active', route: '/', }],
}, { root: dir, baseUrl: 'http://127.0.0.1:9', capture: async () => { throw new Error('capture should not run'); } });
assert.equal(receipt.frames[0].verdict, 'fail'); assert.equal(receipt.frames[0].reason, 'file-hash-mismatch');
assert.equal(receipt.pass, false); });

// CLI regressions use only generated fixtures; no native Pen or app evidence.
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const cliModule = new URL('./pen-still-diff.mjs', import.meta.url).href;
function fixture(t, ids = ['hero']) {
  const root = mkdtempSync(join(tmpdir(), 'pen-diff-regression-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const frames = ids.map((sectionId, index) => {
    const { pen } = syntheticPair();
    pen.data[0] ^= index * 31;
    const stillPath = `${index}.png`;
    writeFileSync(join(root, stillPath), encodePng(pen));
    return { sectionId, penNodeId: `node-${index}`, stillPath, renderPath: stillPath, captureError: false,
      fileHash: /** @type {string | null} */ (null), story: /** @type {string | undefined} */ (undefined),
      viewport: 1440, mode: 'dark', status: 'active', route: '/' };
  });
  return { root, manifest: { schema: 'pen-still-manifest/v1', frames } };
}
function runFixtureCli({ root, manifest }, strict = true, out = 'out') {
  const manifestPath = join(root, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const script = `import { main } from ${JSON.stringify(cliModule)};
    import { readFileSync } from 'node:fs'; import { join } from 'node:path';
    await main(process.argv.slice(1), { root: ${JSON.stringify(root)},
      capture: async frame => { if (frame.captureError) throw new Error('fixture capture unavailable');
        return { png: readFileSync(join(${JSON.stringify(root)}, frame.renderPath)) }; } });`;
  const outDir = join(root, out);
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, '--',
    '--manifest', manifestPath, '--out', outDir, '--base-url', 'http://fixture.invalid',
    ...(strict ? ['--strict'] : [])], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.error, undefined);
  const receipt = existsSync(join(outDir, 'receipt.json'))
    ? JSON.parse(readFileSync(join(outDir, 'receipt.json'), 'utf8')) : null;
  return { ...result, outDir, receipt };
}
test('a Storybook capture compares its selected target rather than the fallback route', async t => {
  const { root, manifest } = fixture(t);
  const storyManifest = { ...manifest, frames: manifest.frames.map(frame => ({ ...frame, story: 'homepage--hero' })) };
  const receipt = await evaluateManifest(storyManifest, {
    root, baseUrl: 'http://app.invalid', storybookUrl: 'http://stories.invalid',
    capture: async (frame, url) => {
      assert.equal(url, 'http://stories.invalid/iframe.html?id=homepage--hero&viewMode=story');
      return { png: readFileSync(join(root, frame.stillPath)), finalUrl: url };
    },
  });
  assert.equal(receipt.frames[0].verdict, 'pass');
});
for (const mixed of [false, true]) test(`strict rejects ${mixed ? 'mixed pass/waiting' : 'all-waiting'} frames`, t => {
  const input = fixture(t, mixed ? ['ready', 'missing'] : ['missing']);
  input.manifest.frames.at(-1).stillPath = 'absent.png';
  const result = runFixtureCli(input);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.receipt.pass, false);
  assert.equal(result.receipt.advisory, false);
  assert.equal(result.receipt.frames.at(-1).verdict === 'waiting' || result.receipt.frames[0].verdict === 'waiting', true);
  assert.equal(result.receipt.sample?.kind ?? null, mixed ? null : 'synthetic');
  const advisory = runFixtureCli(input, false);
  assert.equal(advisory.status, 0, advisory.stderr);
  assert.equal(advisory.receipt.advisory, true);
});
test('strict rejects an empty active set and never promotes the sample to evidence', t => {
  const input = fixture(t);
  input.manifest.frames[0].status = 'parked';
  const result = runFixtureCli(input);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.receipt.pass, false);
  assert.equal(result.receipt.frames.length, 0);
  assert.equal(result.receipt.triptychs.length, 0);
  assert.equal(result.receipt.sample.kind, 'synthetic');
  assert.equal(result.receipt.sample.pass, true);
});
test('strict rejects an empty manifest', t => {
  const input = fixture(t, []);
  const result = runFixtureCli(input);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /non-empty/);
});
for (const missing of ['route', 'capture']) test(`strict cannot qualify missing ${missing}`, async t => {
  const input = fixture(t);
  const options = { root: input.root, strict: true, baseUrl: 'http://fixture.invalid',
    capture: async () => ({ png: readFileSync(join(input.root, '0.png')) }) };
  if (missing === 'route') delete input.manifest.frames[0].route;
  else delete options.capture;
  const receipt = await evaluateManifest(input.manifest, options);
  assert.equal(receipt.frames[0].reason, 'capture-target-missing');
  assert.equal(receipt.pass, false);
});
for (const kind of ['capture', 'png']) test(`strict records unavailable ${kind} and keeps other results`, t => {
  const input = fixture(t, ['available', 'unavailable']);
  if (kind === 'capture') input.manifest.frames[1].captureError = true;
  else writeFileSync(join(input.root, '1.png'), 'not a PNG');
  const result = runFixtureCli(input);
  assert.equal(result.status, 1);
  assert.ok(result.receipt, result.stderr);
  assert.equal(result.receipt.frames[0].verdict, 'pass');
  assert.equal(result.receipt.frames[1].verdict, 'fail');
  assert.equal(result.receipt.pass, false);
});
test('strict accepts complete passing comparisons and still rejects visual failures', t => {
  const input = fixture(t);
  let result = runFixtureCli(input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.receipt.pass, true);
  assert.equal(result.receipt.advisory, false);
  writeFileSync(join(input.root, 'render.png'), encodePng(stretchedPair().render));
  input.manifest.frames[0].renderPath = 'render.png';
  result = runFixtureCli(input);
  assert.equal(result.status, 1);
  assert.equal(result.receipt.frames[0].verdict, 'fail');
  assert.equal(result.receipt.sample, null);
  assert.equal(runFixtureCli(input, false).status, 0);
});
test('multi-frame receipt and comment point to each distinct image, with safe stable names', t => {
  const ids = ['a/b', 'a\\b', 'a?b', 'A/B', '../triptych', '☃', 'x'.repeat(300)];
  const input = fixture(t, ids);
  const result = runFixtureCli(input);
  assert.equal(result.status, 0, result.stderr);
  const artifacts = result.receipt.triptychs;
  assert.equal(new Set(artifacts.map(item => item.file.toLowerCase())).size, ids.length);
  const comment = readFileSync(join(result.outDir, 'comment.md'), 'utf8');
  const imageLinks = [...comment.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match => match[1]);
  assert.deepEqual(imageLinks.sort(), artifacts.map(item => item.file).sort());
  assert.equal(existsSync(join(result.outDir, 'triptych.png')), false);
  for (const artifact of artifacts) {
    assert.equal(basename(artifact.file), artifact.file);
    assert.match(artifact.file, /^[a-z0-9-]+\.png$/);
    assert.ok(artifact.file.length < 150);
    const frame = input.manifest.frames.find(frame => frame.sectionId === artifact.sectionId);
    const png = decodePng(readFileSync(join(input.root, frame.stillPath)));
    const expected = encodePng(compareImages(png, png).triptych);
    assert.deepEqual(readFileSync(join(result.outDir, artifact.file)), expected);
  }
  assert.equal(new Set(artifacts.map(item => readFileSync(join(result.outDir, item.file)).toString('base64'))).size, ids.length);
  input.manifest.frames.reverse();
  const again = runFixtureCli(input, true, 'again');
  assert.deepEqual(again.receipt.triptychs, artifacts);
});
test('single frame legacy alias is exact and removed when the directory becomes multi-frame', t => {
  const input = fixture(t, ['one', 'two']);
  const second = input.manifest.frames.pop();
  const single = runFixtureCli(input);
  assert.equal(single.status, 0, single.stderr);
  assert.equal(single.receipt.triptychs.length, 1);
  assert.deepEqual(readFileSync(join(single.outDir, 'triptych.png')),
    readFileSync(join(single.outDir, single.receipt.triptychs[0].file)));
  input.manifest.frames.push(second);
  const multi = runFixtureCli(input);
  assert.equal(multi.status, 0, multi.stderr);
  assert.equal(existsSync(join(multi.outDir, 'triptych.png')), false);
});
test('sample artifacts are explicitly synthetic and never frame references', t => {
  const input = fixture(t);
  input.manifest.frames[0].stillPath = 'missing.png';
  const result = runFixtureCli(input);
  assert.equal(result.receipt.triptychs.length, 0);
  assert.equal(result.receipt.sample.file, 'synthetic-triptych.png');
  assert.deepEqual(readFileSync(join(result.outDir, result.receipt.sample.file)), encodePng(syntheticComparison().triptych));
  const comment = readFileSync(join(result.outDir, 'comment.md'), 'utf8');
  assert.match(comment, /!\[Synthetic sample[^\]]*\]\(synthetic-triptych\.png\)/);
  assert.doesNotMatch(comment, /This job does not block merge/);
  assert.match(comment, /strict/i);
});

test('real CLI strict exit rejects a missing still without injected capture', t => {
  const input = fixture(t);
  input.manifest.frames[0].stillPath = join(input.root, 'missing.png');
  const manifestPath = join(input.root, 'missing.json');
  const out = join(input.root, 'real-cli');
  writeFileSync(manifestPath, JSON.stringify(input.manifest));
  const result = spawnSync(process.execPath, [fileURLToPath(cliModule),
    '--manifest', manifestPath, '--out', out, '--strict'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 1, result.stderr);
  const receipt = JSON.parse(readFileSync(join(out, 'receipt.json'), 'utf8'));
  assert.equal(receipt.pass, false);
  assert.equal(receipt.frames[0].verdict, 'waiting');
  assert.equal(receipt.frames[0].reason, 'canonical-still-missing');
  assert.equal(receipt.sample.kind, 'synthetic');
});
test('hash failures with no comparable frames cannot qualify using a passing sample', t => {
  const input = fixture(t);
  input.manifest.frames[0].fileHash = 'sha256:deadbeef';
  const result = runFixtureCli(input);
  assert.equal(result.status, 1);
  assert.equal(result.receipt.pass, false);
  assert.equal(result.receipt.frames[0].reason, 'file-hash-mismatch');
  assert.equal(result.receipt.triptychs.length, 0);
  assert.equal(result.receipt.sample.pass, true);
});

test('pen-bindings.json adapts to frames: unbound routes yield none, bound routes yield dark active frames', async () => {
const { bindingsToStillFrames } = await import('../design/pen-bindings-lib.mjs');
const doc = JSON.parse(readFileSync(join(import.meta.dirname, '../../docs/design-system/pen-bindings.json'), 'utf8'));
const live = bindingsToStillFrames(doc); // `/` is bound to the 12 approved homepage v3 stills (home-canonical-v3)
assert.deepEqual(live.map(f => f.stillPath).sort(), ['1440', '390'].flatMap(v => ['footer', 'hero', 'invite', 'profile', 'releases', 'specs'].map(s => `docs/pen-stills/home/${v}/${s}.png`)).sort());
assert.ok(live.every(f => f.mode === 'dark' && /^sha256:[0-9a-f]{64}$/.test(f.fileHash)));
const bound = { routes: { '/': { approved: { by: 'tim', at: '2026-11-07T00:00:00Z', receipt: 'r' }, viewports: { 1440: [{ section: 'hero', nodeId: 'N1', still: 'docs/pen-stills/home/1440/hero.png', sha256: 'a'.repeat(64) }], 390: [] } } } };
const frames = bindingsToStillFrames(bound);
assert.equal(frames.length, 1); assert.equal(frames[0].sectionSelector, "[data-pen-section='hero']");
assert.equal(frames[0].fileHash, `sha256:${'a'.repeat(64)}`); assert.equal(frames[0].mode, 'dark');
assert.equal(validateManifest({ schema: 'pen-still-manifest/v1', frames }).ok, true); });

test('one lazy browser captures all frames in isolated pages and closes after a frame fails', async t => {
const input = fixture(t, Array.from({ length: 12 }, (_, i) => `section-${String(i).padStart(2, '0')}`));
const calls = []; let launches = 0; let pageIndex = 0;
const launchBrowser = async () => { launches++; return {
isConnected: () => true,
newPage: async options => {
const index = pageIndex++; let url;
calls.push(['page', index, options.colorScheme, options.viewport.width]);
return {
goto: async target => { url = target; if (index === 1) throw new Error('capture unavailable'); },
url: () => url, waitForTimeout: async () => {},
screenshot: async () => readFileSync(join(input.root, `${index}.png`)),
locator: () => ({ evaluate: async () => null }),
close: async () => calls.push(['page-close', index]),
}; }, close: async () => calls.push(['browser-close']),
}; };
const receipt = await evaluateManifestWithBrowser(input.manifest, {
root: input.root, strict: true, baseUrl: 'http://fixture.invalid', launchBrowser,
});
assert.equal(launches, 1); assert.equal(pageIndex, 12);
assert.equal(receipt.frames.length, 12); assert.equal(receipt.frames.filter(frame => frame.verdict === 'pass').length, 11);
assert.equal(receipt.frames[1].reason, 'comparison-unavailable'); assert.equal(receipt.pass, false);
assert.equal(calls.filter(call => call[0] === 'page-close').length, 12);
assert.deepEqual(calls.at(-1), ['browser-close']);
assert.ok(calls.filter(call => call[0] === 'page').every(call => call[2] === 'dark' && call[3] === 1440));
const next = await evaluateManifestWithBrowser(input.manifest, {
root: input.root, baseUrl: 'http://fixture.invalid', launchBrowser,
capture: async frame => ({ png: readFileSync(join(input.root, frame.stillPath)) }),
});
assert.equal(next.pass, true); assert.equal(launches, 1); // injected captures own their lifecycle
});

test('missing stills, hash failures and absent targets never launch a browser', async t => {
const input = fixture(t); const launchBrowser = async () => assert.fail('no capture is possible');
for (const variant of [
{ ...input.manifest, frames: [{ ...input.manifest.frames[0], stillPath: 'missing.png' }] },
{ ...input.manifest, frames: [{ ...input.manifest.frames[0], fileHash: 'sha256:deadbeef' }] },
{ ...input.manifest, frames: [{ ...input.manifest.frames[0], route: undefined }] },
]) {
const receipt = await evaluateManifestWithBrowser(variant, {
root: input.root, baseUrl: 'http://fixture.invalid', strict: true, launchBrowser,
});
assert.equal(receipt.pass, false);
}
const noTarget = await evaluateManifestWithBrowser(input.manifest, { root: input.root, strict: true, launchBrowser });
assert.equal(noTarget.frames[0].reason, 'capture-target-missing');
});

test('a disconnected capture browser is replaced so later frames can still qualify', async t => {
const input = fixture(t, ['first', 'second']); let launches = 0; let closes = 0;
const launchBrowser = async () => {
const first = launches++ === 0; let connected = true;
return { isConnected: () => connected, close: async () => { closes++; },
newPage: async () => {
if (first) { connected = false; throw new Error('browser disconnected'); }
return { goto: async () => {}, url: () => 'http://fixture.invalid/', waitForTimeout: async () => {},
screenshot: async () => readFileSync(join(input.root, '1.png')),
locator: () => ({ evaluate: async () => null }), close: async () => {}, };
} };
};
const receipt = await evaluateManifestWithBrowser(input.manifest, {
root: input.root, baseUrl: 'http://fixture.invalid', strict: true, launchBrowser,
});
assert.equal(launches, 2); assert.equal(closes, 1);
assert.equal(receipt.frames[0].reason, 'comparison-unavailable');
assert.equal(receipt.frames[1].verdict, 'pass'); assert.equal(receipt.pass, false);
});

for (const target of ['route', 'story']) test(`same section and node across ${target}s retain distinct artifacts`, t => {
const input = fixture(t, ['hero', 'hero']);
input.manifest.frames[1].penNodeId = input.manifest.frames[0].penNodeId;
input.manifest.frames.forEach((frame, i) => {
if (target === 'route') frame.route = i ? '/pricing' : '/about';
else frame.story = i ? 'pricing--hero' : 'about--hero';
});
assert.equal(validateManifest(input.manifest).ok, true);
const result = runFixtureCli(input);
assert.equal(result.status, 0, result.stderr); assert.equal(result.receipt.pass, true);
assert.equal(result.receipt.frames.length, 2); assert.equal(result.receipt.triptychs.length, 2);
assert.equal(new Set(result.receipt.triptychs.map(item => item.file)).size, 2);
assert.deepEqual(result.receipt.frames.map(frame => frame[target]).sort(), input.manifest.frames.map(frame => frame[target]).sort());
for (const artifact of result.receipt.triptychs) {
assert.ok(existsSync(join(result.outDir, artifact.file)));
assert.ok(readFileSync(join(result.outDir, 'comment.md'), 'utf8').includes(artifact[target]));
}
assert.equal(existsSync(join(result.outDir, 'triptych.png')), false);
input.manifest.frames.reverse();
assert.deepEqual(runFixtureCli(input, true, 'again').receipt.triptychs, result.receipt.triptychs);
input.manifest.frames.push({ ...input.manifest.frames[0] });
assert.equal(validateManifest(input.manifest).ok, false); // same target duplicates still fail
});
