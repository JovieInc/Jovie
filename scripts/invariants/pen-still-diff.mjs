// biome-ignore-all format: compact invariant keeps this advisory diff inside the PR size guard.
// biome-ignore-all assist/source/organizeImports: compact invariant keeps imports together.
/**
* Pen-still screenshot diff. Advisory until canonical stills exist.
*
*   node scripts/invariants/pen-still-diff.mjs \
*     --manifest docs/pen-stills/homepage/manifest.json --out pen-still-out
*
* Exit 0 unless `--strict` and a comparable frame misses tolerance.
* Parked and fork frames are excluded. Dark is the primary mode.
* Capture reuses clef-screenshot-evaluator.mjs.
*/
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path'; import { fileURLToPath } from 'node:url'; import {
composeTriptych, decodePng, diffImage, encodePng, judgePair, measureGeometry, measureImage,
PEN_STILL_TOLERANCES, resizeImage, ssim, syntheticPair, } from './pen-still-diff-lib.mjs';
export const MANIFEST_SCHEMA = 'pen-still-manifest/v1'; export const RECEIPT_SCHEMA = 'pen-still-diff/v1';
export const COMMENT_MARKER = '<!-- pen-still-diff -->'; const LOCKED_HEADLINE = 'Be found. Be understood.';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..'); function frameId(frame) { return {
sectionId: frame.sectionId, penNodeId: frame.penNodeId, viewport: frame.viewport, mode: frame.mode, }; }
/** @param {unknown} value */
export function validateManifest(value) { const errors = []; if (!value || typeof value !== 'object')
return { ok: false, errors: ['manifest must be an object'] };
const manifest = /** @type {Record<string, any>} */ (value); if (manifest.schema !== MANIFEST_SCHEMA)
errors.push(`schema must be ${MANIFEST_SCHEMA}`);
if (manifest.primaryMode !== undefined && manifest.primaryMode !== 'dark')
errors.push('primaryMode must be dark'); if (!Array.isArray(manifest.frames) || manifest.frames.length === 0)
errors.push('frames must be a non-empty array'); const seen = new Set();
for (const [index, frame] of (manifest.frames ?? []).entries()) { const label = `frames[${index}]`;
if (!frame || typeof frame !== 'object') { errors.push(`${label} must be an object`); continue; }
for (const key of ['sectionId', 'penNodeId', 'stillPath']) {
if (typeof frame[key] !== 'string' || frame[key].length === 0)
errors.push(`${label}.${key} is required`); } if (frame.viewport !== 1440 && frame.viewport !== 390)
errors.push(`${label}.viewport must be 1440 or 390`); if (frame.mode !== 'dark' && frame.mode !== 'light')
errors.push(`${label}.mode must be dark or light`); if (!['active', 'parked', 'fork'].includes(frame.status))
errors.push(`${label}.status must be active, parked, or fork`);
if (frame.fileHash != null && typeof frame.fileHash !== 'string')
errors.push(`${label}.fileHash must be a string or null`);
const id = `${frame.sectionId}:${frame.mode}:${frame.viewport}`;
if (seen.has(id)) errors.push(`${label} duplicates ${id}`); seen.add(id); } return errors.length
? { ok: false, errors } : { ok: true, manifest: { ...manifest, primaryMode: 'dark' } }; }
/** @param {string} text */
export function parseManifest(text) { const validated = validateManifest(JSON.parse(text));
if (!validated.ok) throw new Error(validated.errors.join('\n')); return validated.manifest; }
/** Parked and fork frames never enter the diff. Dark is ordered first. */
export function selectFrames(manifest) { const excluded = []; const active = [];
for (const frame of manifest.frames) { if (frame.status !== 'active') excluded.push(frame);
else active.push(frame); } active.sort((a, b) => {
const mode = Number(a.mode !== 'dark') - Number(b.mode !== 'dark'); if (mode) return mode;
const viewport = Number(a.viewport !== 1440) - Number(b.viewport !== 1440); if (viewport) return viewport;
return String(a.sectionId).localeCompare(String(b.sectionId)); }); return { active, excluded }; }
/** @param {{route?: string, story?: string}} frame */
export function frameCaptureUrl(frame, { baseUrl, storybookUrl } = {}) { if (frame.story && storybookUrl) {
const id = encodeURIComponent(frame.story);
return `${String(storybookUrl).replace(/\/$/, '')}/iframe.html?id=${id}&viewMode=story`; }
if (frame.route && baseUrl) return new URL(frame.route, baseUrl).href; return null; }
export function compareImages(penImage, renderImage, renderGeometry = null) {
const penMetrics = measureImage(penImage); const renderMetrics =
measureGeometry(renderGeometry) ?? measureImage(renderImage);
const aligned = resizeImage(renderImage, penImage.width, penImage.height); const judgment = judgePair(
penMetrics, renderMetrics, ssim(penImage, aligned) ); return { penMetrics, renderMetrics, judgment,
triptych: composeTriptych( penImage, aligned, diffImage(penImage, renderImage) ), }; }
export function syntheticComparison() { const { pen, render } = syntheticPair();
const compared = compareImages(pen, render); return { kind: 'synthetic', reason:
'No canonical Pen still is on disk. This triptych exercises the diff and is not a design verdict.',
pass: compared.judgment.pass, judgment: compared.judgment, triptych: compared.triptych, }; }
export async function evaluateManifest(manifest, options = {}) { const root = options.root ?? REPO_ROOT;
const { active, excluded } = selectFrames(manifest); const frames = []; for (const frame of active) {
const stillPath = resolve(root, frame.stillPath); if (!existsSync(stillPath)) { frames.push({ ...frameId(frame),
verdict: 'waiting', reason: 'canonical-still-missing', }); continue; } const actualHash = createHash('sha256')
.update(readFileSync(stillPath)) .digest('hex');
const expectedHash = frame.fileHash?.replace(/^sha256:/, '') ?? null;
if (expectedHash && expectedHash !== actualHash) { frames.push({ ...frameId(frame), verdict: 'fail',
reason: 'file-hash-mismatch', }); continue; } const url = frameCaptureUrl(frame, options);
if (!url || !options.capture) { frames.push({ ...frameId(frame), verdict: 'waiting',
reason: 'capture-target-missing', }); continue; } const captured = await options.capture(frame, url);
const compared = compareImages( decodePng(readFileSync(stillPath)), decodePng(captured.png), captured.geometry
); frames.push({ ...frameId(frame), verdict: compared.judgment.pass ? 'pass' : 'fail',
judgment: compared.judgment, triptych: compared.triptych, }); }
const comparable = frames.some(frame => frame.verdict !== 'waiting'); return { schema: RECEIPT_SCHEMA,
advisory: true, primaryMode: 'dark', lockedHeadline: LOCKED_HEADLINE, tolerances: PEN_STILL_TOLERANCES,
excluded: excluded.map(frame => ({ sectionId: frame.sectionId, status: frame.status, mode: frame.mode,
viewport: frame.viewport, })), frames: frames.map(({ triptych: _triptych, ...rest }) => rest),
triptychs: frames.flatMap(frame => frame.triptych ? [ { sectionId: frame.sectionId, mode: frame.mode,
viewport: frame.viewport, triptych: frame.triptych, }, ] : [] ),
sample: comparable ? null : syntheticComparison(), pass: frames.every(frame => frame.verdict !== 'fail'), }; }
export function formatComment(receipt) { const lines = [ COMMENT_MARKER, '## Pen still diff (advisory)', '',
`Dark is the primary review mode. The locked homepage headline is "${receipt.lockedHeadline}". This job does not block merge.`,
'', ]; if (receipt.sample) lines.push(receipt.sample.reason, ''); lines.push(
'| Section | Mode | Viewport | Verdict | SSIM | Section height ratio |', '| --- | --- | --- | --- | --- | --- |'
); const rows = [...receipt.frames]; if (receipt.sample) { rows.push({ sectionId: 'synthetic sample',
mode: 'dark', viewport: '—', verdict: receipt.sample.pass ? 'pass' : 'fail', judgment: receipt.sample.judgment,
}); } for (const frame of rows) { const ssimScore = frame.judgment ? frame.judgment.ssim.toFixed(3) : '—';
const ratio = frame.judgment ? frame.judgment.sectionHeightRatio.toFixed(3) : '—'; lines.push(
`| ${frame.sectionId} | ${frame.mode} | ${frame.viewport} | ${frame.verdict} | ${ssimScore} | ${ratio} |` ); }
lines.push( '', '![Pen, render, and diff](triptych.png)', '',
`Excluded parked or fork frames: ${receipt.excluded.length}.`, '' ); return lines.join('\n'); }
function parseArgs(argv) { const args = {}; for (let i = 0; i < argv.length; i++) { const token = argv[i];
if (!token.startsWith('--')) continue; const next = argv[i + 1];
if (next === undefined || next.startsWith('--'))
args[token.slice(2)] = true; else { args[token.slice(2)] = next; i += 1; } } return args; }
async function main() { const args = parseArgs(process.argv.slice(2)); if (args.help || !args.manifest) {
process.stdout.write(
'usage: pen-still-diff.mjs --manifest <file> --out <dir> [--base-url URL] [--storybook-url URL] [--strict]\n' );
process.exit(args.help ? 0 : 2); } const manifest = parseManifest(readFileSync(String(args.manifest), 'utf8'));
const baseUrl = args['base-url'] || process.env.PEN_STILL_BASE_URL; const storybookUrl =
args['storybook-url'] || process.env.PEN_STILL_STORYBOOK_URL; const capture = baseUrl || storybookUrl
? async (frame, url) => { const { captureSurfacePng, withCaptureBrowser } = await import(
'./clef-screenshot-evaluator.mjs' ); return withCaptureBrowser(browser => captureSurfacePng(browser, { url,
viewport: frame.viewport, mode: frame.mode, selector: frame.sectionSelector,
mockupSelector: frame.mockupSelector, }) ); } : undefined; const receipt = await evaluateManifest(manifest, {
root: REPO_ROOT, baseUrl: typeof baseUrl === 'string' ? baseUrl : undefined,
storybookUrl: typeof storybookUrl === 'string' ? storybookUrl : undefined, capture, });
const outDir = resolve(String(args.out ?? 'pen-still-out')); mkdirSync(outDir, { recursive: true });
const triptych = receipt.triptychs[0]?.triptych ?? receipt.sample?.triptych ?? null; if (triptych)
writeFileSync(join(outDir, 'triptych.png'), encodePng(triptych)); const publicReceipt = { ...receipt,
triptychs: receipt.triptychs.map(item => ({ sectionId: item.sectionId, mode: item.mode, viewport: item.viewport,
file: 'triptych.png', })), sample: receipt.sample ? { kind: receipt.sample.kind, reason: receipt.sample.reason,
pass: receipt.sample.pass, judgment: receipt.sample.judgment, file: 'triptych.png', } : null, }; writeFileSync(
join(outDir, 'receipt.json'), `${JSON.stringify(publicReceipt, null, 2)}\n` );
writeFileSync(join(outDir, 'comment.md'), formatComment(publicReceipt));
process.stdout.write(`${JSON.stringify(publicReceipt, null, 2)}\n`);
if (args.strict && !receipt.pass) process.exit(1); } const isMain = process.argv[1] &&
fileURLToPath(import.meta.url) === resolve(process.argv[1]); if (isMain) { main().catch(error => {
process.stderr.write(`${error.stack ?? error.message}\n`); process.exit(1); }); }
