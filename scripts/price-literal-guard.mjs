#!/usr/bin/env node
/**
 * node scripts/price-literal-guard.mjs [--check]   fail on a new hardcoded price literal in UI source
 * node scripts/price-literal-guard.mjs --write     lower the ratchet to today's counts (never raises it)
 * node scripts/price-literal-guard.mjs --bootstrap grandfather every current site (only while no ratchet exists)
 *
 * Plan prices have one owner: apps/web/lib/config/plan-prices.ts, read through
 * offer truth (getPublicPriceClaim, formatPublicPriceDisplay) or the
 * entitlements registry. A `$12` typed into a component or page drifts the day
 * the price changes (the $199 -> $12 move left stale copy behind). This guard
 * flags `$<digits>` literals in apps/web/app and apps/web/components source,
 * ignoring comments. Grandfathered files live in
 * scripts/lib/price-literal-guard.ratchet.json and only shrink.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RATCHET_PATH = 'scripts/lib/price-literal-guard.ratchet.json';
export const RATCHET_SCHEMA = 'jovie.price-literal-guard-ratchet/v1';

const SCOPE = /^apps\/web\/(?:app|components)\/.+\.(?:ts|tsx|js|jsx)$/u;
const SKIPPED =
  /(?:^|\/)(?:__tests__|tests?|__snapshots__)\/|\.(?:test|spec|stories|gen)\./u;
// `$` not part of an identifier, template `${`, or an escaped `\$`, followed by
// a digit: `$12`, `$0.00`, `$1,000`. Regex backrefs like '$1' are rare in UI
// source and stay grandfathered rather than special-cased.
const PRICE_LITERAL = /(?<![\w$\\])\$\d/gu;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//gu;
// A `//` comment, but not the `//` of a URL scheme (`https://`).
const LINE_COMMENT = /(^|[^:\\])\/\/.*$/gmu;

export function scannable(path) {
  return SCOPE.test(path) && !SKIPPED.test(path);
}

export function stripComments(text) {
  return text.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '$1');
}

export function countIn(text) {
  return (stripComments(text).match(PRICE_LITERAL) ?? []).length;
}

export function scan(root, files) {
  const counts = {};
  for (const file of files) {
    if (!scannable(file)) continue;
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    const n = countIn(text);
    if (n) counts[file] = n;
  }
  return counts;
}

export function violations(counts, ratchet) {
  return Object.entries(counts)
    .filter(([file, n]) => n > (ratchet[file] ?? 0))
    .map(([file, n]) => ({ file, found: n, allowed: ratchet[file] ?? 0 }));
}

export function tighten(counts, ratchet) {
  const next = {};
  for (const [file, allowed] of Object.entries(ratchet)) {
    const n = counts[file] ?? 0;
    if (n > 0) next[file] = Math.min(allowed, n);
  }
  return Object.fromEntries(Object.entries(next).sort());
}

function root() {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  return top.status === 0 ? top.stdout.trim() : process.cwd();
}

function trackedFiles(cwd) {
  const out = spawnSync(
    'git',
    ['ls-files', '-z', 'apps/web/app', 'apps/web/components'],
    {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    }
  );
  return out.stdout.split('\0').filter(Boolean);
}

export function main(argv = process.argv.slice(2)) {
  const cwd = root();
  const path = join(cwd, RATCHET_PATH);
  const counts = scan(cwd, trackedFiles(cwd));
  const save = entries =>
    writeFileSync(
      path,
      `${JSON.stringify({ schema: RATCHET_SCHEMA, entries }, null, 2)}\n`
    );
  if (argv.includes('--bootstrap')) {
    if (existsSync(path)) {
      console.error(
        'price-literal-guard: ratchet exists; use --write to tighten it'
      );
      return 1;
    }
    save(Object.fromEntries(Object.entries(counts).sort()));
    return 0;
  }
  const ratchet = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8')).entries
    : {};
  if (argv.includes('--write')) {
    save(tighten(counts, ratchet));
    return 0;
  }
  const bad = violations(counts, ratchet);
  if (bad.length) {
    console.error(
      'price-literal-guard: hardcoded $ price literal in apps/web UI source:'
    );
    for (const v of bad)
      console.error(`  ${v.file}: ${v.found} found, ${v.allowed} allowed`);
    console.error(
      "Derive prices from '@/lib/config/plan-prices' via getPublicPriceClaim/formatPublicPriceDisplay ('@/lib/billing/offer-truth') or format amounts with formatAmount; never type a price into copy."
    );
    return 1;
  }
  const slack = Object.entries(ratchet).filter(
    ([f, n]) => (counts[f] ?? 0) < n
  ).length;
  if (slack)
    console.log(
      `price-literal-guard: ok; ${slack} grandfathered file(s) can shrink (run --write)`
    );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exit(main());
