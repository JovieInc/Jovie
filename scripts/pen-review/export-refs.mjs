#!/usr/bin/env node
/**
 * Pen-to-web parity references: one PNG (Pen truth, out-of-process render)
 * and one html-css export per canonical surface, plus a manifest the Gem
 * parity gate reads.
 *
 *   node scripts/pen-review/export-refs.mjs --out DIR [--surfaces signin=oaz9c,pricing=hLRZB]
 *   node scripts/pen-review/export-refs.mjs --out DIR --sheet homepage=A9IKRW,oHJCI,Cyuz2
 *
 * The PNG is the reference to diff against: the html-css export is a
 * structural aid only (2026-11-01: its flex translation stretches some
 * vertical stacks, so it is not pixel truth). Every PNG passes the render
 * guard (garble, blank, missing glyphs) or the manifest marks it untrusted.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodePng } from '../invariants/pen-still-diff-lib.mjs';
import { exportFramesHeadless, runPen } from './pen-bridge.mjs';
import { renderGuard } from './render-guard.mjs';

export const CANONICAL_SURFACES = Object.freeze({
  signin: 'oaz9c',
  pricing: 'hLRZB',
  start: 'hGHPE',
  release: 'SVPSC',
  homepage: 'A9IKRW',
  profile: 'D9kdx',
  'app-chat': 'hkkdJ',
  contacts: 'QOHpb',
  library: 'JudKN',
});

const arg = (argv, name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const parsePairs = s => Object.fromEntries(s.split(',').map(p => p.split('=')));

export function exportRefs(
  surfaces,
  out,
  { exporter = exportFramesHeadless, pen = runPen } = {}
) {
  const ids = Object.values(surfaces);
  const pngDir = join(out, 'png');
  const renders = exporter(ids, pngDir);
  const manifest = {
    schema: 'pen-parity-refs/v1',
    at: new Date().toISOString(),
    surfaces: {},
  };
  for (const [surface, id] of Object.entries(surfaces)) {
    const r = renders.find(x => x.id === id);
    const img = decodePng(r.buf);
    const guard = renderGuard(
      [{ id, md5: r.md5, img }],
      {},
      { dark: true }
    ).map(g => g.reason);
    const html = join(out, surface, `${id}.html`);
    mkdirSync(join(out, surface), { recursive: true });
    pen([`Export(${JSON.stringify([id])},"html-css",${JSON.stringify(html)})`]);
    manifest.surfaces[surface] = {
      id,
      png: r.path,
      width: img.width,
      height: img.height,
      md5: r.md5,
      html,
      trusted: guard.length === 0,
      guard,
    };
  }
  writeFileSync(
    join(out, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return manifest;
}

/** Candidates sheet: competing masters for one surface, side by side. */
export function candidatesSheet(
  surface,
  ids,
  out,
  { exporter = exportFramesHeadless } = {}
) {
  const dir = join(out, 'candidates', surface);
  const renders = exporter(ids, dir);
  const cells = renders
    .map(r => {
      const img = decodePng(r.buf);
      return `<figure><img src="${r.id}.png" alt="${r.id}" loading="lazy"><figcaption><code>${r.id}</code> · ${img.width}×${img.height} · ${createHash('md5').update(r.buf).digest('hex').slice(0, 8)}</figcaption></figure>`;
    })
    .join('\n');
  const page = `<!doctype html><meta charset="utf-8"><title>${surface} · competing Pen masters</title><style>body{margin:0;padding:32px;background:#030406;color:#c9ced8;font:14px/1.5 Inter,system-ui,sans-serif}h1{font-size:18px;font-weight:600;color:#f5f7fb}.g{display:grid;grid-template-columns:repeat(${Math.min(ids.length, 3)},1fr);gap:24px}figure{margin:0}img{width:100%;border:1px solid #1d2026;border-radius:8px}figcaption{margin-top:8px;color:#8a909c}</style><h1>${surface}: which one is the master?</h1><div class="g">${cells}</div>`;
  writeFileSync(join(dir, 'index.html'), page);
  return join(dir, 'index.html');
}

async function main(argv) {
  const out = resolve(arg(argv, 'out') ?? 'pen-refs');
  const sheet = arg(argv, 'sheet');
  if (sheet) {
    const [surface, list] = sheet.split('=');
    console.log(candidatesSheet(surface, list.split(','), out));
    return 0;
  }
  const surfaces = arg(argv, 'surfaces')
    ? parsePairs(arg(argv, 'surfaces'))
    : CANONICAL_SURFACES;
  const m = exportRefs(surfaces, out);
  console.log(JSON.stringify(m, null, 2));
  return Object.values(m.surfaces).every(s => s.trusted) ? 0 : 3;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
) {
  main(process.argv.slice(2)).then(
    c => process.exit(c),
    e => {
      console.error(String(e?.stack ?? e));
      process.exit(2);
    }
  );
}
