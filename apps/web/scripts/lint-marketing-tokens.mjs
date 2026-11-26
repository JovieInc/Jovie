#!/usr/bin/env node
/**
 * Marketing token lint (JOV-13064): deterministic, NON-required.
 *
 * Founder directive 2026-11-19 ('reviews raise the baseline'); source: Aeon
 * Figma/design-system review, findings 2-3. Paper/Figma drifted to a 1296px
 * container and Inter headlines; the repo tokens are already correct:
 *   - canonical marketing container: var(--ds-public-content-max) = 1298px
 *   - display type: Satoshi via var(--font-display); body/interface: Inter
 *
 * Rules (each report-only in the default run; --strict fails on hits —
 * the promotion target per apps/web/review-findings/README.md):
 *   raw-1296            the literal `1296` anywhere in a marketing file.
 *   raw-container-max   a raw container max-width (>= 100px) expressed as
 *                       `max-w-[Npx]` or `max-width: Npx` instead of the
 *                       token. `@media (max-width: …)` breakpoints are not
 *                       container widths and are skipped.
 *   heading-font-sans   an `<h1>`-`<h6>` tag carrying `font-sans` — display
 *                       type must use var(--font-display) / Satoshi.
 *
 * Scan scope (marketing surfaces): app/(home), app/(marketing),
 * components/marketing, components/site, components/features/home —
 * .ts/.tsx/.css, excluding *.test.* and __tests__ (stories included,
 * matching the design-system ratchet convention).
 *
 * CLI:
 *   node scripts/lint-marketing-tokens.mjs [--strict] [--json]
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

const RULES = [
  {
    id: 'raw-1296',
    status: 'shadow',
    title:
      'No raw 1296 — the marketing container token is --ds-public-content-max (1298px)',
    regex: /1296/g,
  },
  {
    id: 'raw-container-max',
    status: 'shadow',
    title:
      'Container max-widths must use var(--ds-public-content-max), not raw px',
    regex: /max-w-\[\d{3,}px\]|max-width:\s*\d{3,}px/g,
    skip: line => /@media/i.test(line),
  },
  {
    id: 'heading-font-sans',
    status: 'shadow',
    title: 'Headings must use --font-display (Satoshi), never font-sans',
    regex: /<h[1-6][^>]*font-sans/g,
  },
];

export function collectMarketingSources(webRoot, acc = []) {
  for (const dir of SCAN_ROOTS) {
    walk(join(webRoot, dir), acc);
  }
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
export function lintMarketingTokens(options = {}) {
  const {
    args = [],
    webRoot = WEB_ROOT,
    scanRoots,
    log = () => {},
    error = (...a) => console.error(...a),
  } = options;

  const sources = scanRoots
    ? scanRoots.flatMap(dir => walk(dir, []))
    : collectMarketingSources(webRoot);

  /** @type {Record<string, { file: string, line: number }[]>} */
  const hits = {};
  for (const file of sources) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');
    for (const rule of RULES) {
      rule.regex.lastIndex = 0;
      if (!rule.regex.test(source)) continue;
      for (const [index, line] of lines.entries()) {
        if (rule.skip?.(line)) continue;
        rule.regex.lastIndex = 0;
        if (rule.regex.test(line)) {
          hits[rule.id] ??= [];
          hits[rule.id].push({
            file: relative(webRoot, file),
            line: index + 1,
          });
        }
      }
    }
  }

  if (args.includes('--json')) {
    log(JSON.stringify({ hits }, null, 2));
  } else {
    for (const rule of RULES) {
      const ruleHits = hits[rule.id] ?? [];
      log(
        `[${rule.status}] ${rule.id}: ${ruleHits.length} hit${ruleHits.length === 1 ? '' : 's'} — ${rule.title}`
      );
      for (const hit of ruleHits.slice(0, 20)) {
        log(`  ${hit.file}:${hit.line}`);
      }
      if (ruleHits.length > 20) log(`  ... and ${ruleHits.length - 20} more`);
    }
  }

  const strict = args.includes('--strict');
  const strictHits = strict
    ? RULES.reduce((sum, rule) => sum + (hits[rule.id]?.length ?? 0), 0)
    : 0;
  if (strictHits > 0) {
    error(`lint-marketing-tokens: --strict failed with ${strictHits} hit(s)`);
    return { code: 1 };
  }
  if (!args.includes('--json')) {
    log('lint-marketing-tokens: ok (informational mode)');
  }
  return { code: 0 };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = lintMarketingTokens({
    args: process.argv.slice(2),
    log: (...a) => console.log(...a),
  }).code;
}
