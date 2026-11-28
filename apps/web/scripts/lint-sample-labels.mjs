#!/usr/bin/env node
/**
 * Sample-label copy lint (JOV-13067): deterministic, NON-required.
 *
 * Founder rule: "a demo should show only what's actually available, and
 * label samples at the point of action." Source: Aeon Figma/design-system
 * review, finding 7 — an unlabeled sample CTA (Find me, a non-functional
 * lookup) presented as live; live-reading Pricing bullets.
 *
 * Rule (report-only in the default run; --strict fails on hits — the
 * promotion target per apps/web/review-findings/README.md):
 *   unlabeled-sample-cta  a marketing file presents a sample/demo control
 *                         (the `Find me` lookup signature) without any
 *                         example/sample labeling anywhere in the same
 *                         file. Truthful labeled examples pass; the ban
 *                         list is deliberately tight to the findings.
 *
 * Scan scope (marketing surfaces + their copy data): app/(home),
 * app/(marketing), components/marketing, components/site,
 * components/features/home, data/homepage*.ts — .ts/.tsx, excluding
 * *.test.* and __tests__ (stories included).
 *
 * CLI:
 *   node scripts/lint-sample-labels.mjs [--strict] [--json]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(SCRIPT_DIR, '..');

const SCAN_ROOTS = [
  'app/(home)',
  'app/(marketing)',
  'components/marketing',
  'components/site',
  'components/features/home',
];
const DATA_GLOBS = [/^data\/homepage.*\.ts$/];

const SAMPLE_CTA_RE = /Find me/g;
const EXAMPLE_LABEL_RE = /example|sample|demo only|not a (?:real|working)/i;

export function collectSampleLabelSources(webRoot, acc = []) {
  for (const dir of SCAN_ROOTS) walk(join(webRoot, dir), acc);
  walkData(join(webRoot, 'data'), acc);
  return acc;
}

function walk(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walk(full, acc);
    } else if (
      /\.(tsx?|css)$/.test(entry) &&
      !/\.test\./.test(entry) &&
      !/\.spec\./.test(entry)
    ) {
      acc.push(full);
    }
  }
  return acc;
}

function walkData(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const rel = relative(resolve(WEB_ROOT), full).replaceAll('\\', '/');
    if (statSync(full).isDirectory()) continue;
    if (DATA_GLOBS.some(g => g.test(rel))) acc.push(full);
  }
  return acc;
}

/**
 * @param {{
 *   args?: string[],
 *   webRoot?: string,
 *   scanRoots?: string[],
 *   log?: (...a: unknown[]) => void,
 *   error?: (...a: unknown[]) => void,
 * }} [options]
 * @returns {{ code: 0 | 1 }}
 */
export function lintSampleLabels(options = {}) {
  const {
    args = [],
    webRoot = WEB_ROOT,
    scanRoots,
    log = () => {},
    error = (...a) => console.error(...a),
  } = options;

  const sources = (scanRoots ?? collectSampleLabelSources(webRoot)).flatMap(
    dir => walk(dir, [])
  );

  /** @type {{ file: string, line: number }[]} */
  const hits = [];
  for (const file of sources) {
    const source = readFileSync(file, 'utf8');
    SAMPLE_CTA_RE.lastIndex = 0;
    if (!SAMPLE_CTA_RE.test(source)) continue;
    if (EXAMPLE_LABEL_RE.test(source)) continue;
    const lines = source.split('\n');
    for (const [index, line] of lines.entries()) {
      SAMPLE_CTA_RE.lastIndex = 0;
      if (SAMPLE_CTA_RE.test(line)) {
        hits.push({ file: relative(webRoot, file), line: index + 1 });
      }
    }
  }

  if (args.includes('--json')) {
    log(JSON.stringify({ hits }, null, 2));
  } else {
    log(
      `[shadow] unlabeled-sample-cta: ${hits.length} hit${hits.length === 1 ? '' : 's'} — sample CTAs must carry an EXAMPLE/sample label at the point of action`
    );
    for (const hit of hits.slice(0, 20)) log(`  ${hit.file}:${hit.line}`);
    if (hits.length > 20) log(`  ... and ${hits.length - 20} more`);
  }

  if (args.includes('--strict') && hits.length > 0) {
    error(
      `lint-sample-labels: --strict failed with ${hits.length} unlabeled sample CTA hit(s)`
    );
    return { code: 1 };
  }
  log('lint-sample-labels: ok (informational mode)');
  return { code: 0 };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = lintSampleLabels({
    args: process.argv.slice(2),
    log: (...a) => console.log(...a),
  }).code;
}
