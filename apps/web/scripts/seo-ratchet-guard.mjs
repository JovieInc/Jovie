#!/usr/bin/env node
/**
 * SEO/AEO ratchet guard — static source-file lint.
 *
 * Verifies that apps/web/app/robots.ts:
 *  1. Contains all AI crawlers listed in seo-ratchet.baseline.json
 *  2. Does NOT use fail-dangerous production detection (=== 'production')
 *  3. Retains /app/ and /api/ disallow paths
 *  4. References sitemap.xml
 *
 * Verifies sitemap.ts emits lastModified for every entry.
 * Verifies profile/asset routes retain JSON-LD + metadata markers.
 *
 * Behavioral correctness is covered by tests/app/robots.test.ts,
 * tests/app/sitemap.test.ts, and tests/app/seo-ratchet.test.ts.
 *
 * Exit 0 = all checks passed. Exit 1 = at least one failure (with remediation).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const ROBOTS_PATH = join(projectRoot, 'app', 'robots.ts');
const SITEMAP_PATH = join(projectRoot, 'app', 'sitemap.ts');
const BASELINE_PATH = join(projectRoot, 'seo-ratchet.baseline.json');

const errors = [];
const warnings = [];

// ── Load files ──────────────────────────────────────────────────────────────

if (!existsSync(ROBOTS_PATH)) {
  errors.push(`robots.ts not found at ${ROBOTS_PATH}`);
}

if (!existsSync(SITEMAP_PATH)) {
  errors.push(`sitemap.ts not found at ${SITEMAP_PATH}`);
}

if (!existsSync(BASELINE_PATH)) {
  errors.push(`seo-ratchet.baseline.json not found at ${BASELINE_PATH}`);
}

if (errors.length > 0) {
  for (const e of errors) console.error(`[seo-ratchet] ✗ ${e}`);
  process.exit(1);
}

const robotsSrc = readFileSync(ROBOTS_PATH, 'utf8');
const sitemapSrc = readFileSync(SITEMAP_PATH, 'utf8');
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

// ── Check 1: All required AI crawlers are present ───────────────────────────

const { requiredAiCrawlers } = baseline.robots;
const missingCrawlers = requiredAiCrawlers.filter(
  crawler =>
    !robotsSrc.includes(`'${crawler}'`) && !robotsSrc.includes(`"${crawler}"`)
);

if (missingCrawlers.length > 0) {
  errors.push(
    `robots.ts is missing required AI crawlers: ${missingCrawlers.join(', ')}\n` +
      `  Add them back to the AI_CRAWLERS array in app/robots.ts.\n` +
      `  If removing a crawler is intentional, update seo-ratchet.baseline.json in the same PR.`
  );
} else {
  console.log(
    `[seo-ratchet] ✓ All ${requiredAiCrawlers.length} required AI crawlers present`
  );
}

// ── Check 2: Fail-safe detection pattern — must NOT be === 'production' ─────
//
// The dangerous pattern is: env.VERCEL_ENV === 'production'
// This causes undefined VERCEL_ENV → isProduction=false → Disallow: / on prod.
// The correct pattern inverts: isPreview = (=== 'preview' || === 'development')
// isProduction = !isPreview, so undefined → not preview → production.

const dangerousPattern = /VERCEL_ENV\s*===\s*['"]production['"]/;
if (dangerousPattern.test(robotsSrc)) {
  errors.push(
    `robots.ts uses fail-DANGEROUS production detection (=== 'production').\n` +
      `  When VERCEL_ENV is undefined/empty, this evaluates to false → Disallow: / on prod.\n` +
      `  Fix: invert the logic → const isPreview = env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development'\n` +
      `       const isProduction = !isPreview`
  );
} else {
  console.log(
    `[seo-ratchet] ✓ Fail-safe production detection pattern is correct`
  );
}

// ── Check 3: Required disallow paths are present ─────────────────────────────

const { requiredDisallowPaths } = baseline.robots;
const missingPaths = requiredDisallowPaths.filter(
  p => !robotsSrc.includes(`'${p}'`) && !robotsSrc.includes(`"${p}"`)
);

if (missingPaths.length > 0) {
  warnings.push(
    `robots.ts is missing expected disallow paths: ${missingPaths.join(', ')}\n` +
      `  These protect /app/ (dashboard) and /api/ from crawlers.\n` +
      `  If intentional, update seo-ratchet.baseline.json.`
  );
} else {
  console.log(`[seo-ratchet] ✓ Required disallow paths present`);
}

// ── Check 4: sitemap reference ────────────────────────────────────────────────

if (!robotsSrc.includes('sitemap.xml')) {
  errors.push(
    `robots.ts does not reference sitemap.xml.\n` +
      `  The production config must include: sitemap: \`\${BASE_URL}/sitemap.xml\``
  );
} else {
  console.log(`[seo-ratchet] ✓ sitemap.xml reference present`);
}

// ── Check 5: sitemap.ts emits lastModified ───────────────────────────────────

if (baseline.sitemap?.requireLastModified) {
  if (!/lastModified/.test(sitemapSrc)) {
    errors.push(
      `sitemap.ts does not set lastModified on sitemap entries.\n` +
        `  Every public URL must include <lastmod> in sitemap.xml.`
    );
  } else {
    console.log(`[seo-ratchet] ✓ sitemap.ts sets lastModified on entries`);
  }
}

// ── Check 6: profile/asset JSON-LD source markers ───────────────────────────

for (const marker of baseline.sourceMarkers ?? []) {
  const filePath = join(projectRoot, marker.file);
  if (!existsSync(filePath)) {
    errors.push(
      `SEO source marker file missing: ${marker.file}\n` +
        `  Update seo-ratchet.baseline.json if this route moved.`
    );
    continue;
  }

  const source = readFileSync(filePath, 'utf8');
  const missingMarkers = marker.markers.filter(
    token => !source.includes(token)
  );
  if (missingMarkers.length > 0) {
    errors.push(
      `${marker.file} lost required SEO/AEO markers for ${marker.id}: ${missingMarkers.join(', ')}\n` +
        `  Restore JSON-LD/metadata wiring or update seo-ratchet.baseline.json intentionally.`
    );
  } else {
    console.log(`[seo-ratchet] ✓ ${marker.id} source markers present`);
  }
}

// ── Check 7: baseline route registry is non-empty ─────────────────────────────

if (!Array.isArray(baseline.routes) || baseline.routes.length === 0) {
  errors.push(
    'seo-ratchet.baseline.json must list at least one SEO-clean route in `routes`.'
  );
} else {
  console.log(
    `[seo-ratchet] ✓ ${baseline.routes.length} baseline SEO-clean routes registered`
  );
}

// ── Report ───────────────────────────────────────────────────────────────────

for (const w of warnings) {
  console.warn(`[seo-ratchet] ⚠ ${w}`);
}

if (errors.length > 0) {
  console.error('');
  console.error('[seo-ratchet] FAILED — SEO ratchet guard found violations:');
  for (const e of errors) {
    console.error(`  ✗ ${e}`);
  }
  console.error('');
  console.error(
    '  Incident context: JovieInc/Jovie#11043 — a single env change silently'
  );
  console.error(
    '  set Disallow: / on all of jov.ie with no CI alarm. This guard prevents recurrence.'
  );
  process.exit(1);
}

console.log('');
console.log('[seo-ratchet] ✓ All checks passed');
