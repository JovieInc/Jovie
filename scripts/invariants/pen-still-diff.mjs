// biome-ignore-all format: compact invariant keeps this advisory diff inside the PR size guard.
// biome-ignore-all assist/source/organizeImports: compact invariant keeps imports together.
/**
* Pen-still screenshot diff. Advisory until canonical stills exist.
*
*   node scripts/invariants/pen-still-diff.mjs \
*     --manifest docs/design-system/pen-bindings.json [--route /] --out pen-still-out
*
* Advisory exits 0; strict requires at least one active frame and every active comparison to pass.
* Parked and fork frames are excluded. Dark is the primary mode.
* Capture reuses clef-screenshot-capture.mjs with one browser per manifest.
*/
import { createHash } from 'node:crypto';
import { BINDING_SCHEMA, bindingsToStillFrames } from '../design/pen-bindings-lib.mjs';
import { captureSurfacePng } from './clef-screenshot-capture.mjs';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path'; import { fileURLToPath } from 'node:url'; import {
composeTriptych, decodePng, diffImage, encodePng, judgePair, measureGeometry, measureImage,
PEN_STILL_TOLERANCES, resizeImage, ssim, syntheticPair, } from './pen-still-diff-lib.mjs';
export const MANIFEST_SCHEMA = 'pen-still-manifest/v1'; export const RECEIPT_SCHEMA = 'pen-still-diff/v1';
export const COMMENT_MARKER = '<!-- pen-still-diff -->'; const LOCKED_HEADLINE = 'Be found. Be understood.';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..'); function frameId(frame) { return {
sectionId: frame.sectionId, penNodeId: frame.penNodeId, viewport: frame.viewport, mode: frame.mode,
...(frame.route ? { route: frame.route } : {}), ...(frame.story ? { story: frame.story } : {}), }; }
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
const id = JSON.stringify([frame.route ?? null, frame.story ?? null, frame.sectionId, frame.mode, frame.viewport]);
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
const target = JSON.stringify([a.route ?? null, a.story ?? null]).localeCompare(JSON.stringify([b.route ?? null, b.story ?? null]));
if (target) return target;
return String(a.sectionId).localeCompare(String(b.sectionId)); }); return { active, excluded }; }
/**
* @param {{route?: string, story?: string}} frame
* @param {{baseUrl?: string, storybookUrl?: string}} [options]
*/
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
'No canonical image pair was compared. This synthetic triptych exercises the diff and is not design evidence.',
pass: compared.judgment.pass, judgment: compared.judgment, triptych: compared.triptych, }; }
/**
* @typedef {ReturnType<typeof frameId> & {
*   verdict: string, reason?: string, judgment?: ReturnType<typeof judgePair>,
*   triptych?: ReturnType<typeof composeTriptych>
* }} FrameResult
*/
export async function evaluateManifest(manifest, options = {}) { const root = options.root ?? REPO_ROOT;
const { active, excluded } = selectFrames(manifest);
/** @type {FrameResult[]} */
const frames = []; for (const frame of active) {
const stillPath = resolve(root, frame.stillPath); if (!existsSync(stillPath)) { frames.push({ ...frameId(frame),
verdict: 'waiting', reason: 'canonical-still-missing', }); continue; } try { const actualHash = createHash('sha256')
.update(readFileSync(stillPath)) .digest('hex');
const expectedHash = frame.fileHash?.replace(/^sha256:/, '') ?? null;
if (expectedHash && expectedHash !== actualHash) { frames.push({ ...frameId(frame), verdict: 'fail',
reason: 'file-hash-mismatch', }); continue; } const url = frameCaptureUrl(frame, options);
if (!url || !options.capture) { frames.push({ ...frameId(frame), verdict: 'waiting',
reason: 'capture-target-missing', }); continue; } const captured = await options.capture(frame, url);
// JOV-11623: an anonymous capture that landed on a different route (the
// closed-signup /start handoff to /waitlist, /app/chat to /signin) is not
// this frame's surface; diffing it against the Pen still fabricated
// failures. Report the frame as waiting for a comparable capture instead.
const landedPath = captured.finalUrl
  ? new URL(captured.finalUrl).pathname
  : null;
if (captured.redirected || (landedPath && landedPath !== new URL(url).pathname)) {
  frames.push({ ...frameId(frame), verdict: 'waiting',
    reason: 'capture-redirected-off-route' }); continue; }
// Pair like with like: the Pen still's text bands and mockup box are
// pixel-derived, so the render's must be too. DOM geometry counts
// different things (h1/h2/h3/p elements vs painted glyph bands; a
// [data-pen-mockup] element vs the largest painted non-text region),
// which failed every comparison structurally — textBlockYDelta 1 and
// null mockup errors on every frame, including one that scored SSIM
// 0.96 against its design (JOV-11623).
const compared = compareImages( decodePng(readFileSync(stillPath)), decodePng(captured.png)
); frames.push({ ...frameId(frame), verdict: compared.judgment.pass ? 'pass' : 'fail',
judgment: compared.judgment, triptych: compared.triptych, }); } catch {
frames.push({ ...frameId(frame), verdict: 'fail', reason: 'comparison-unavailable' }); } }
const comparable = frames.some(frame => frame.triptych); return { schema: RECEIPT_SCHEMA,
advisory: !options.strict, primaryMode: 'dark', lockedHeadline: LOCKED_HEADLINE, tolerances: PEN_STILL_TOLERANCES,
excluded: excluded.map(frame => ({ sectionId: frame.sectionId, status: frame.status, mode: frame.mode,
viewport: frame.viewport, })), frames: frames.map(({ triptych: _triptych, ...rest }) => rest),
triptychs: frames.flatMap(frame => frame.triptych ? [ { sectionId: frame.sectionId, mode: frame.mode,
viewport: frame.viewport, ...(frame.route ? { route: frame.route } : {}),
...(frame.story ? { story: frame.story } : {}), triptych: frame.triptych, }, ] : [] ),
sample: comparable ? null : syntheticComparison(), pass: options.strict
? frames.length > 0 && frames.every(frame => frame.verdict === 'pass')
: frames.every(frame => frame.verdict !== 'fail'), }; }
/** Lazily share Chromium; captureSurfacePng gives every frame its own page/context. */
export async function evaluateManifestWithBrowser(manifest, options = {}) {
if (options.capture || (!options.baseUrl && !options.storybookUrl)) return evaluateManifest(manifest, options);
const session = /** @type {{ browser?: import('playwright').Browser }} */ ({});
const launchBrowser = options.launchBrowser ?? (async () => {
const { chromium } = await import('playwright'); return chromium.launch(); });
try { return await evaluateManifest(manifest, { ...options, capture: async (frame, url) => {
if (session.browser && !session.browser.isConnected()) {
const disconnected = session.browser; session.browser = undefined; await disconnected.close();
}
if (!session.browser) session.browser = await launchBrowser();
return captureSurfacePng(session.browser, { url,
viewport: frame.viewport, mode: frame.mode, selector: frame.sectionSelector,
mockupSelector: frame.mockupSelector, expectedPath: new URL(url).pathname, });
} }); } finally { await session.browser?.close(); }
}
export function formatComment(receipt) { const lines = [ COMMENT_MARKER, `## Pen still diff (${receipt.advisory ? 'advisory' : 'strict'})`, '',
`Dark is the primary review mode. ${receipt.advisory ? 'This job does not block merge.' : `Strict qualification: ${receipt.pass ? 'pass' : 'fail'}. Every active frame must be compared and pass.`}`,
'', ]; if (receipt.sample) lines.push(receipt.sample.reason, ''); lines.push(
'| Section | Mode | Viewport | Verdict | SSIM | Section height ratio |', '| --- | --- | --- | --- | --- | --- |'
); const rows = [...receipt.frames]; if (receipt.sample) { rows.push({ sectionId: 'synthetic sample',
mode: 'dark', viewport: '—', verdict: receipt.sample.pass ? 'pass' : 'fail', judgment: receipt.sample.judgment,
}); } for (const frame of rows) { const ssimScore = frame.judgment ? frame.judgment.ssim.toFixed(3) : '—';
const ratio = frame.judgment ? frame.judgment.sectionHeightRatio.toFixed(3) : '—'; lines.push(
`| ${frame.sectionId} | ${frame.mode} | ${frame.viewport} | ${frame.verdict} | ${ssimScore} | ${ratio} |` ); }
for (const item of receipt.triptychs) { if (item.file) lines.push('',
`![Pen, render, and diff: ${String([item.route, item.story, item.sectionId].filter(Boolean).join(' / ')).replace(/[\[\]\r\n]/g, ' ')} (${item.mode}, ${item.viewport})](${item.file})`); }
if (receipt.sample?.file) lines.push('', `![Synthetic sample (not design evidence)](${receipt.sample.file})`);
lines.push( '',
`Excluded parked or fork frames: ${receipt.excluded.length}.`, '' ); return lines.join('\n'); }
function parseArgs(argv) { const args = {}; for (let i = 0; i < argv.length; i++) { const token = argv[i];
if (!token.startsWith('--')) continue; const next = argv[i + 1];
if (next === undefined || next.startsWith('--'))
args[token.slice(2)] = true; else { args[token.slice(2)] = next; i += 1; } } return args; }
export async function main(argv = process.argv.slice(2), options = {}) { const args = parseArgs(argv); if (args.help || !args.manifest) {
process.stdout.write(
'usage: pen-still-diff.mjs --manifest <file> [--route /] --out <dir> [--base-url URL] [--storybook-url URL] [--strict]\n' );
process.exit(args.help ? 0 : 2); } const manifestText = readFileSync(String(args.manifest), 'utf8'); const manifest = JSON.parse(manifestText).schema === BINDING_SCHEMA
? { schema: MANIFEST_SCHEMA, primaryMode: 'dark', frames: bindingsToStillFrames(JSON.parse(manifestText), typeof args.route === 'string' ? args.route : null) }
: parseManifest(manifestText);
const baseUrl = args['base-url'] || process.env.PEN_STILL_BASE_URL; const storybookUrl =
args['storybook-url'] || process.env.PEN_STILL_STORYBOOK_URL; const receipt = await evaluateManifestWithBrowser(manifest, {
root: options.root ?? REPO_ROOT, strict: Boolean(args.strict), baseUrl: typeof baseUrl === 'string' ? baseUrl : undefined,
storybookUrl: typeof storybookUrl === 'string' ? storybookUrl : undefined,
capture: options.capture, launchBrowser: options.launchBrowser, });
const outDir = resolve(String(args.out ?? 'pen-still-out')); mkdirSync(outDir, { recursive: true });
// Hash the full identity, not a lossy slug: separators, case, Unicode and long IDs stay distinct.
const triptychs = receipt.triptychs.map(({ triptych, ...identity }) => {
const digest = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
const file = `triptych-${digest}.png`; writeFileSync(join(outDir, file), encodePng(triptych));
return { ...identity, file }; });
const sample = receipt.sample ? { kind: receipt.sample.kind, reason: receipt.sample.reason,
pass: receipt.sample.pass, judgment: receipt.sample.judgment, file: 'synthetic-triptych.png' } : null;
if (sample) writeFileSync(join(outDir, sample.file), encodePng(receipt.sample.triptych));
// Keep the old attachment only when it identifies exactly one image. Clear stale aliases on reuse.
const legacy = triptychs.length === 1 ? triptychs[0].file : sample?.file;
if (legacy) writeFileSync(join(outDir, 'triptych.png'), readFileSync(join(outDir, legacy)));
else rmSync(join(outDir, 'triptych.png'), { force: true });
const publicReceipt = { ...receipt, triptychs, sample }; writeFileSync(
join(outDir, 'receipt.json'), `${JSON.stringify(publicReceipt, null, 2)}\n` );
writeFileSync(join(outDir, 'comment.md'), formatComment(publicReceipt));
process.stdout.write(`${JSON.stringify(publicReceipt, null, 2)}\n`);
if (args.strict && !receipt.pass) process.exit(1); } const isMain = process.argv[1] &&
fileURLToPath(import.meta.url) === resolve(process.argv[1]); if (isMain) { main().catch(error => {
process.stderr.write(`${error.stack ?? error.message}\n`); process.exit(1); }); }
