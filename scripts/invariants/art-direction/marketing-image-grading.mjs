/**
 * Marketing image grading manifest and recolor ban.
 *
 * Tim, Nov 22 2026: every image on a marketing page is recolored for color
 * harmony, in a photographic way with hue-by-hue precision sliders, or by AI
 * image generation recreating it under the color rules. Never by a sloppy
 * edit: no LUT thrown on and called done, no blanket filter, no CSS filter or
 * hue-rotate on the page.
 *
 * Checks:
 *  1. Every raster image referenced from a marketing source (homepage, ICP,
 *     solutions, pricing, shared marketing components) is listed in
 *     docs/design-system/marketing-image-grading.json. A new image not in the
 *     manifest fails, as does a stale entry.
 *  2. Statuses are ungraded, graded-hue or regenerated. A graded entry names an
 *     allowed method, who graded it and when. LUTs, blanket filters and
 *     hue-rotate are banned methods.
 *  3. Shrink-only: the set of ungraded images may not grow against
 *     origin/main. New images therefore arrive already graded.
 *  4. No CSS filter, hue-rotate, sepia, saturate or mix-blend recolor on
 *     marketing img/picture/Image elements or image selectors. Pre-existing
 *     hits live in marketing-image-recolor.baseline.json (shrink-only).
 *
 *   node scripts/invariants/art-direction/marketing-image-grading.mjs [--write]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SKIP_PATH } from './accent-pack-config.mjs';
import { jsxElements, tokenize } from './accent-pack-lib.mjs';
import {
  MARKETING_SOURCE_ROOTS,
  REPO_ROOT,
  relPath,
  stripComments,
  walkFiles,
} from './paths.mjs';
import { ancestorJson, evaluateRatchet } from './ratchet.mjs';

export const GRADING_MANIFEST =
  'docs/design-system/marketing-image-grading.json';
export const RECOLOR_BASELINE =
  'scripts/invariants/art-direction/marketing-image-recolor.baseline.json';

/** Marketing sources: the art-direction roots plus shared marketing surfaces. */
export const IMAGE_SOURCE_ROOTS = Object.freeze([
  ...MARKETING_SOURCE_ROOTS,
  'apps/web/components/features/home',
  'apps/web/components/features/landing',
  'apps/web/components/features/pricing',
  'apps/web/data/marketing',
]);

/** Raster plates that live under these public roots are marketing images by location. */
export const IMAGE_ASSET_ROOTS = Object.freeze([
  'apps/web/public/assets/generated',
  'apps/web/public/marketing',
]);

export const STATUSES = Object.freeze([
  'ungraded',
  'graded-hue',
  'regenerated',
]);
export const ALLOWED_METHODS = Object.freeze({
  'graded-hue': 'hue-by-hue-photographic-grade',
  regenerated: 'regeneration-under-color-rules',
});
/** A method that names any of these is a banned shortcut. */
export const BANNED_METHOD =
  /\b(lut|filter|hue-?rotate|blanket|overlay|tint|css)\b/i;

const RASTER = /(['"`])([^'"`\n$]+\.(?:png|jpe?g|webp|avif|gif))\1/gi;

export function resolveImage(ref, sourceFile, repoRoot = REPO_ROOT) {
  const candidates = [];
  if (ref.startsWith('/')) candidates.push(join('apps/web/public', ref));
  else if (ref.startsWith('@/'))
    candidates.push(join('apps/web', ref.slice(2)));
  else if (ref.startsWith('.'))
    candidates.push(normalize(join(dirname(sourceFile), ref)));
  else return null;
  return candidates.find(c => existsSync(join(repoRoot, c))) ?? null;
}

/** Map of image path -> sorted list of marketing sources that reference it. */
export function scanImages(repoRoot = REPO_ROOT) {
  /** @type {Map<string, Set<string>>} */
  const found = new Map();
  for (const file of walkFiles(repoRoot, IMAGE_SOURCE_ROOTS)) {
    const rel = relPath(repoRoot, file);
    if (SKIP_PATH.test(rel)) continue;
    const text = stripComments(readFileSync(file, 'utf8'));
    for (const m of text.matchAll(RASTER)) {
      const image = resolveImage(m[2], rel, repoRoot);
      if (!image) continue;
      if (!found.has(image)) found.set(image, new Set());
      found.get(image).add(rel);
    }
  }
  for (const file of walkFiles(repoRoot, IMAGE_ASSET_ROOTS, {
    exts: new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']),
  })) {
    const rel = relPath(repoRoot, file);
    if (!found.has(rel)) found.set(rel, new Set(['(public marketing asset)']));
  }
  return new Map([...found].sort().map(([k, v]) => [k, [...v].sort()]));
}

/** Validate manifest entries; returns failure strings. */
export function validateManifest(manifest, scanned) {
  const failures = [];
  const listed = new Map();
  for (const entry of manifest.images ?? []) listed.set(entry.path, entry);
  for (const image of scanned.keys())
    if (!listed.has(image))
      failures.push(`marketing image is not in the grading manifest: ${image}`);
  for (const path of listed.keys())
    if (!scanned.has(path))
      failures.push(
        `manifest lists an image no marketing page references (remove it): ${path}`
      );
  for (const entry of listed.values()) {
    if (!STATUSES.includes(entry.status)) {
      failures.push(
        `${entry.path}: status must be one of ${STATUSES.join(', ')}`
      );
      continue;
    }
    if (entry.status === 'ungraded') continue;
    if (BANNED_METHOD.test(entry.method ?? ''))
      failures.push(
        `${entry.path}: banned grading method "${entry.method}" (no LUTs, blanket filters or CSS filters)`
      );
    else if (entry.method !== ALLOWED_METHODS[entry.status])
      failures.push(
        `${entry.path}: ${entry.status} requires method "${ALLOWED_METHODS[entry.status]}"`
      );
    if (!entry.gradedBy)
      failures.push(`${entry.path}: graded entry needs gradedBy`);
    if (!/^\d{4}-\d{2}-\d{2}/.test(entry.gradedAt ?? ''))
      failures.push(`${entry.path}: graded entry needs gradedAt (ISO date)`);
  }
  return failures;
}

/** Ungraded paths may only shrink against the ancestor manifest. */
export function ungradedRatchet(manifest, ancestor) {
  if (!ancestor) return [];
  const before = new Set(
    (ancestor.images ?? [])
      .filter(e => e.status === 'ungraded')
      .map(e => e.path)
  );
  return (manifest.images ?? [])
    .filter(e => e.status === 'ungraded' && !before.has(e.path))
    .map(
      e =>
        `new image arrives ungraded; grade it first (hue-by-hue grade or regeneration): ${e.path}`
    );
}

/* ------------------------------------------------------- recolor ban */

const RECOLOR =
  /(?<![\w-])(?:[\w[\]-]+:)*(hue-rotate|sepia|saturate|grayscale|invert|brightness|contrast|blur|filter|mix-blend|bg-blend)(?![\w-]*(?:none))(?:-[\w[\]./%()-]+)?/;
const IMAGE_TAG = /^(img|picture|Image|NextImage|ProductShot|ImageryStage)$/;

export function recolorIds(source, file) {
  const ids = new Set();
  const ext = file.slice(file.lastIndexOf('.'));
  if (ext === '.css') {
    const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim().replace(/\s+/g, ' ');
      if (
        !/\b(img|picture)\b|image|photo|plate|poster|artwork|cover/i.test(
          selector
        )
      )
        continue;
      for (const d of m[2].matchAll(
        /(?:^|;|\s)(filter|backdrop-filter|mix-blend-mode)\s*:\s*([^;]+)/g
      )) {
        const value = d[2].trim();
        if (/^(none|normal|inherit|initial|unset)$/.test(value)) continue;
        if (d[1] === 'backdrop-filter') continue;
        if (
          d[1] === 'filter' &&
          !/hue-rotate|sepia|saturate|grayscale|invert|brightness|contrast/.test(
            value
          )
        )
          continue;
        ids.add(`image-recolor:${file}:${selector.slice(0, 50)}:${d[1]}`);
      }
    }
    return [...ids];
  }
  for (const el of jsxElements(tokenize(source))) {
    if (!IMAGE_TAG.test(el.tag)) continue;
    const strs = el.toks
      .filter(t => t.t === 'str')
      .map(t => t.v)
      .join(' ');
    const m = RECOLOR.exec(strs);
    const style = el.toks.some(
      (t, i) =>
        t.t === 'id' &&
        /^(filter|mixBlendMode)$/.test(t.v) &&
        el.toks[i + 1]?.v === ':'
    );
    if (m && !/blur/.test(m[1]))
      ids.add(`image-recolor:${file}:${el.tag}:${m[1]}`);
    else if (style) ids.add(`image-recolor:${file}:${el.tag}:style-filter`);
  }
  return [...ids];
}

export function scanRecolor(repoRoot = REPO_ROOT) {
  const ids = [];
  for (const file of walkFiles(repoRoot, IMAGE_SOURCE_ROOTS)) {
    const rel = relPath(repoRoot, file);
    if (SKIP_PATH.test(rel)) continue;
    ids.push(...recolorIds(readFileSync(file, 'utf8'), rel));
  }
  return [...new Set(ids)].sort();
}

/* ------------------------------------------------------------- check */

export const check = checkGrading;

export function checkGrading(repoRoot = REPO_ROOT) {
  const failures = [];
  const scanned = scanImages(repoRoot);
  const manifest = JSON.parse(
    readFileSync(join(repoRoot, GRADING_MANIFEST), 'utf8')
  );
  failures.push(...validateManifest(manifest, scanned));
  const anc = ancestorJson(repoRoot, GRADING_MANIFEST);
  if (!anc.ok) return { failures: [anc.error] };
  failures.push(...ungradedRatchet(manifest, anc.ancestor));
  const recolor = scanRecolor(repoRoot);
  const recorded = JSON.parse(
    readFileSync(join(repoRoot, RECOLOR_BASELINE), 'utf8')
  ).ids;
  const ancR = ancestorJson(repoRoot, RECOLOR_BASELINE);
  if (!ancR.ok) return { failures: [ancR.error] };
  failures.push(
    ...evaluateRatchet({
      current: recolor,
      recorded,
      ancestor: ancR.ancestor?.ids ?? null,
    })
  );
  return {
    failures,
    images: scanned.size,
    ungraded: manifest.images.filter(e => e.status === 'ungraded').length,
    recolor: recolor.length,
  };
}

export function buildManifest(repoRoot = REPO_ROOT, previous = null) {
  const scanned = scanImages(repoRoot);
  const old = new Map((previous?.images ?? []).map(e => [e.path, e]));
  const images = [...scanned].map(([path, pages]) => {
    const prev = old.get(path);
    return {
      path,
      pages,
      status: prev?.status ?? 'ungraded',
      method: prev?.method ?? null,
      gradedBy: prev?.gradedBy ?? null,
      gradedAt: prev?.gradedAt ?? null,
    };
  });
  return {
    schema: 'jovie.marketing-image-grading/v1',
    allowedMethods: ALLOWED_METHODS,
    bannedMethods: [
      'LUT',
      'blanket filter',
      'CSS filter',
      'hue-rotate',
      'overlay or tint',
    ],
    images,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--write')) {
    let previous = null;
    try {
      previous = JSON.parse(
        readFileSync(join(REPO_ROOT, GRADING_MANIFEST), 'utf8')
      );
    } catch {
      /* first run */
    }
    const manifest = buildManifest(REPO_ROOT, previous);
    writeFileSync(
      join(REPO_ROOT, GRADING_MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    const ids = scanRecolor();
    writeFileSync(
      join(REPO_ROOT, RECOLOR_BASELINE),
      `${JSON.stringify({ schema: 'jovie.marketing-image-recolor/v1', ids }, null, 2)}\n`
    );
    process.stdout.write(
      `grading manifest: ${manifest.images.length} images, recolor baseline ${ids.length}\n`
    );
  } else {
    const r = checkGrading();
    if (r.failures.length) {
      process.stderr.write(
        `marketing-image-grading:\n${r.failures.join('\n')}\n`
      );
      process.exitCode = 1;
    } else
      process.stdout.write(
        `marketing-image-grading: ok (${r.images} images, ${r.ungraded} ungraded, ${r.recolor} recolor baselined)\n`
      );
  }
}
