/**
 * Marketing hero and feature imagery comes from the imagery pipeline.
 *
 * Spec: docs/marketing/IMAGERY.md. A marketing source file may show imagery
 * only through `<ProductShot>` (registry shots rendered from live components)
 * or `<ImageryStage>` (art-directed stage: plate + shots). Raw `<img>`,
 * `next/image`, raster CSS `url()` and generated-plate path literals bypass
 * the pipeline's cropping, readability, verification and freshness gates.
 *
 * Shrink-only ratchet: ids live in imagery-provenance.baseline.json. New ids
 * fail; resolved ids must be deleted from the baseline
 * (`node scripts/invariants/art-direction/imagery-provenance.mjs --write`).
 * SVG (logos, icons, data URIs) is not imagery for this check.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MARKETING_SOURCE_ROOTS,
  REPO_ROOT,
  stripComments,
  walkFiles,
} from './paths.mjs';
import { ancestorJson, evaluateRatchet } from './ratchet.mjs';

export const PROVENANCE_BASELINE =
  'scripts/invariants/art-direction/imagery-provenance.baseline.json';

/** The pipeline's own renderers; they are where raw image tags are allowed. */
export const PIPELINE_OWNERS = new Set([
  'apps/web/components/marketing/ProductShot.tsx',
  'apps/web/components/marketing/ProductShot.css',
  'apps/web/components/marketing/ImageryStage.tsx',
  'apps/web/components/marketing/ImageryStage.css',
]);

const RASTER = /\.(?:png|jpe?g|webp|avif|gif)\b/i;

const RULES = [
  { id: 'img-tag', test: s => /<img\b/.test(s) },
  {
    id: 'next-image',
    test: s => /from\s+['"]next\/image['"]/.test(s),
  },
  {
    id: 'css-raster-url',
    test: s =>
      [...s.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g)].some(
        m => !m[2].startsWith('data:') && RASTER.test(m[2])
      ),
  },
  { id: 'plate-literal', test: s => /\/assets\/generated\//.test(s) },
  {
    id: 'screenshot-literal',
    test: s => /\/product-(?:screenshots|shots)\//.test(s),
  },
];

/** @param {readonly {path: string, source: string}[]} files */
export function scanSources(files) {
  /** @type {string[]} */
  const ids = [];
  for (const { path, source } of files) {
    if (PIPELINE_OWNERS.has(path)) continue;
    const code = stripComments(source);
    for (const rule of RULES) {
      if (rule.test(code)) ids.push(`${path}#${rule.id}`);
    }
  }
  return { ids: ids.sort() };
}

export function scanMarketing(repoRoot = REPO_ROOT) {
  const files = walkFiles(repoRoot, MARKETING_SOURCE_ROOTS).map(absolute => ({
    path: relative(repoRoot, absolute).split('\\').join('/'),
    source: readFileSync(absolute, 'utf8'),
  }));
  return scanSources(files);
}

export async function checkImageryProvenance(repoRoot = REPO_ROOT) {
  const { ids } = scanMarketing(repoRoot);
  const recorded = JSON.parse(
    readFileSync(`${repoRoot}/${PROVENANCE_BASELINE}`, 'utf8')
  ).ids;
  const ancestor = ancestorJson(repoRoot, PROVENANCE_BASELINE);
  const failures = [];
  if (!ancestor.ok) failures.push(ancestor.error);
  else {
    failures.push(
      ...evaluateRatchet({
        current: ids,
        recorded,
        ancestor: ancestor.ancestor ? ancestor.ancestor.ids : null,
      })
    );
  }
  if (failures.length > 0) {
    failures.push(
      'Marketing imagery must come from the pipeline: declare a shot in lib/screenshots/product-shots.ts and render it with <ProductShot>, or compose a stage with <ImageryStage> (docs/marketing/IMAGERY.md).'
    );
  }
  return { failures, ids, count: ids.length };
}

export const check = checkImageryProvenance;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--write')) {
    const { ids } = scanMarketing();
    writeFileSync(
      `${REPO_ROOT}/${PROVENANCE_BASELINE}`,
      JSON.stringify(
        { schema: 'jovie.imagery-provenance-baseline/v1', ids },
        null,
        2
      ) + '\n'
    );
    process.stdout.write(`imagery-provenance: wrote ${ids.length} id(s)\n`);
  } else {
    const { failures, count } = await checkImageryProvenance();
    process.stdout.write(`imagery-provenance: ${count} live id(s)\n`);
    if (failures.length > 0) {
      process.stderr.write(failures.join('\n') + '\n');
      process.exitCode = 1;
    }
  }
}
