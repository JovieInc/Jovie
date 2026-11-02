// biome-ignore-all format: compact tests for the advisory Pen-still diff.
// biome-ignore-all assist/source/organizeImports: compact tests keep imports together.
import assert from 'node:assert/strict'; import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { test } from 'node:test'; import {
compareImages, evaluateManifest, formatComment, frameCaptureUrl, parseManifest,
selectFrames, syntheticComparison, validateManifest, } from './pen-still-diff.mjs';
import { decodePng, encodePng, measureImage, ssim, stretchedPair, syntheticPair } from './pen-still-diff-lib.mjs';
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../../docs/pen-stills/homepage/manifest.json'), 'utf8'));
test('homepage manifest is valid, dark-first, and drops parked and fork frames', () => {
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
assert.match(comment, /!\[Pen, render, and diff\]\(triptych\.png\)/); });
test('a hash mismatch fails the frame without reading a capture', async () => {
const dir = mkdtempSync(join(tmpdir(), 'pen-still-'));
writeFileSync(join(dir, 'hero.png'), encodePng(syntheticPair().pen)); const receipt = await evaluateManifest({
schema: 'pen-still-manifest/v1', primaryMode: 'dark', frames: [{
sectionId: 'hero', penNodeId: 'node', fileHash: 'sha256:deadbeef', stillPath: 'hero.png',
viewport: 1440, mode: 'dark', status: 'active', route: '/', }],
}, { root: dir, baseUrl: 'http://127.0.0.1:9', capture: async () => { throw new Error('capture should not run'); } });
assert.equal(receipt.frames[0].verdict, 'fail'); assert.equal(receipt.frames[0].reason, 'file-hash-mismatch');
assert.equal(receipt.pass, false); });
