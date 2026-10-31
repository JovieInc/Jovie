#!/usr/bin/env node
/**
 * design-present/v1 — the presentation gate.
 *
 * Nothing visual reaches the founder unless it:
 *   (a) passes every deterministic design invariant on the rendered frame
 *       (content axis, sub-pixel edges, bans, clean frame, Pen row parity);
 *   (b) passes a vision critique against the Pen reference and the bans;
 *   (c) is shown as Pen reference, before and after, side by side.
 *
 * Usage:
 *   pnpm design:present-check --manifest docs/design-present/<set>/manifest.json \
 *     [--capture <afterBaseUrl>] [--capture-before <beforeBaseUrl>] \
 *     [--vision-model anthropic/sonnet] [--skip-vision]
 *
 * Writes <set>/triptych/<id>.png and <set>/receipt.json. Exit 0 only on pass.
 * `--skip-vision` records vision as "skipped", which can never pass.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateSnapshot } from './invariants.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../..');
export const RECEIPT_SCHEMA = 'design-present-receipt/v1';
export const GATE_SOURCES = [
  'invariants.mjs',
  'collect.mjs',
  'vision.mjs',
  'present-check.mjs',
];

export const sha256File = path =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

/** Fingerprint of the gate itself, so a receipt from an older gate is stale. */
export function gateVersion(dir = HERE) {
  const hash = createHash('sha256');
  for (const file of GATE_SOURCES) hash.update(readFileSync(join(dir, file)));
  return hash.digest('hex').slice(0, 16);
}

export function evaluateSet(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const setDir = dirname(manifestPath);
  const pen = JSON.parse(
    readFileSync(join(setDir, manifest.pen.geometry), 'utf8')
  );
  return manifest.screens.map(screen => {
    const geometryPath = join(setDir, 'after', `${screen.id}.geometry.json`);
    if (!existsSync(geometryPath))
      return {
        id: screen.id,
        pass: false,
        failures: [{ rule: 'missing-capture', message: geometryPath }],
      };
    const snapshot = JSON.parse(readFileSync(geometryPath, 'utf8'));
    const result = evaluateSnapshot(snapshot, pen.screens[screen.id], {
      axisInset: manifest.axisInset,
    });
    return { id: screen.id, ...result };
  });
}

async function composeTriptych({ penPng, beforePng, afterPng, out, title }) {
  const sharp = createRequire(join(REPO_ROOT, 'apps/web/package.json'))(
    'sharp'
  );
  const W = 720;
  const H = 450;
  const LABEL = 32;
  const GAP = 16;
  const panel = async path =>
    sharp(path)
      .resize(W, H, { fit: 'contain', background: '#030406' })
      .png()
      .toBuffer();
  const labels = ['Pen reference', 'Before (main)', 'After (this PR)'];
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W * 3 + GAP * 2}" height="${LABEL}">` +
      labels
        .map(
          (l, i) =>
            `<text x="${i * (W + GAP)}" y="22" font-family="Inter, Helvetica, Arial" font-size="15" fill="#A8B0C3">${title} · ${l}</text>`
        )
        .join('') +
      '</svg>'
  );
  await sharp({
    create: {
      width: W * 3 + GAP * 2,
      height: H + LABEL,
      channels: 4,
      background: '#030406',
    },
  })
    .composite([
      { input: svg, top: 0, left: 0 },
      { input: await panel(penPng), top: LABEL, left: 0 },
      { input: await panel(beforePng), top: LABEL, left: W + GAP },
      { input: await panel(afterPng), top: LABEL, left: (W + GAP) * 2 },
    ])
    .png()
    .toFile(out);
}

export async function runPresentCheck({
  manifestPath,
  captureAfter,
  captureBefore,
  visionModel,
  skipVision = false,
  log = console.log,
}) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const setDir = dirname(manifestPath);
  if (captureBefore || captureAfter) {
    const { captureScreens } = await import('./capture.mjs');
    if (captureBefore)
      await captureScreens({
        manifestPath,
        base: captureBefore,
        label: 'before',
      });
    if (captureAfter)
      await captureScreens({
        manifestPath,
        base: captureAfter,
        label: 'after',
      });
  }
  const deterministic = evaluateSet(manifestPath);
  const { critiqueScreen } = await import('./vision.mjs');
  mkdirSync(join(setDir, 'triptych'), { recursive: true });
  const rel = p => relative(REPO_ROOT, p);
  const screens = [];
  for (const screen of manifest.screens) {
    const files = {
      pen: join(setDir, 'pen', `${screen.id}.png`),
      before: join(setDir, 'before', `${screen.id}.png`),
      after: join(setDir, 'after', `${screen.id}.png`),
      geometry: join(setDir, 'after', `${screen.id}.geometry.json`),
      triptych: join(setDir, 'triptych', `${screen.id}.png`),
    };
    const missing = Object.entries(files)
      .filter(([k, p]) => k !== 'triptych' && !existsSync(p))
      .map(([k]) => k);
    const det = deterministic.find(d => d.id === screen.id);
    let vision = { status: 'skipped', findings: [] };
    if (!missing.length) {
      await composeTriptych({
        penPng: files.pen,
        beforePng: files.before,
        afterPng: files.after,
        out: files.triptych,
        title: screen.title,
      });
      if (!skipVision)
        vision = await critiqueScreen({
          title: screen.title,
          scope: manifest.scope,
          penPng: files.pen,
          afterPng: files.after,
          model: visionModel,
        });
    }
    const pass = !missing.length && det.pass && vision.status === 'pass';
    screens.push({
      id: screen.id,
      title: screen.title,
      route: screen.route,
      pass,
      missing,
      deterministic: { pass: det.pass, failures: det.failures },
      vision,
      files: Object.fromEntries(
        Object.entries(files)
          .filter(([, p]) => existsSync(p))
          .map(([k, p]) => [k, { path: rel(p), sha256: sha256File(p) }])
      ),
    });
    log(
      `${pass ? 'PASS' : 'FAIL'} ${screen.id}: deterministic=${det.pass ? 'pass' : `fail(${det.failures.length})`} vision=${vision.status}${missing.length ? ` missing=${missing.join(',')}` : ''}`
    );
    for (const f of det.failures)
      log(`  - ${f.rule}: ${f.message} (${f.example})`);
    for (const f of vision.findings ?? [])
      log(`  - vision ${f.severity} ${f.category}: ${f.note}`);
    if (vision.error) log(`  - vision error: ${vision.error}`);
  }
  const receipt = {
    schema: RECEIPT_SCHEMA,
    set: manifest.set,
    pr: manifest.pr ?? null,
    gateVersion: gateVersion(),
    manifest: rel(manifestPath),
    createdAt: new Date().toISOString(),
    pass: screens.length > 0 && screens.every(s => s.pass),
    screens,
  };
  writeFileSync(
    join(setDir, 'receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  log(
    `${receipt.pass ? 'PASS' : 'FAIL'} design-present ${manifest.set} (${screens.filter(s => s.pass).length}/${screens.length}) receipt=${rel(join(setDir, 'receipt.json'))} gate=${receipt.gateVersion}`
  );
  return receipt;
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const args = process.argv.slice(2);
  const manifest = flag(args, '--manifest');
  if (!manifest) {
    console.error(
      'usage: design:present-check --manifest <docs/design-present/<set>/manifest.json>'
    );
    process.exit(2);
  }
  const receipt = await runPresentCheck({
    manifestPath: resolve(manifest),
    captureAfter: flag(args, '--capture'),
    captureBefore: flag(args, '--capture-before'),
    visionModel: flag(args, '--vision-model'),
    skipVision: args.includes('--skip-vision'),
  });
  process.exit(receipt.pass ? 0 : 1);
}
