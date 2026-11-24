#!/usr/bin/env node
/**
 * Card intent ratchet ("no extra carding", design-system rule, Tim 2026-11).
 *
 * A card is allowed only for one of five intents (transient, movable,
 * collection, selectable, floating). Card primitives therefore take an
 * `intent` prop. There are too many legacy call sites to require it at once,
 * so this gate ratchets:
 *
 *   1. Untyped usages. Counts JSX usages of the card primitives (Card,
 *      ContentSurfaceCard, DrawerSurfaceCard) that carry no `intent`
 *      attribute, per file, in non-test, non-story TSX under apps/ and
 *      packages/. The per-file counts and their total live in
 *      scripts/invariants/card-intent-ratchet.baseline.json and may only go
 *      down. A new untyped usage, or a new file with one, fails.
 *   2. Flat states. An empty, loading or error-state component (file named
 *      *Empty*, *Loading*, *Skeleton*, *Error*, or a route loading.tsx /
 *      error.tsx) must never render a card primitive, with or without an
 *      intent. This check has no baseline: it is always zero.
 *
 *   node scripts/invariants/card-intent-ratchet.mjs              check
 *   node scripts/invariants/card-intent-ratchet.mjs --write      shrink the ledger (never grows it)
 *   node scripts/invariants/card-intent-ratchet.mjs --init       (re)create the ledger from today's tree
 *   node scripts/invariants/card-intent-ratchet.mjs --inventory  untyped counts per area
 *
 * Never raise the baseline to make a change pass: add an `intent` or remove
 * the card.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const BASELINE_PATH =
  'scripts/invariants/card-intent-ratchet.baseline.json';
export const SCOPES = ['apps', 'packages'];
export const CARD_PRIMITIVES = new Set([
  'Card',
  'ContentSurfaceCard',
  'DrawerSurfaceCard',
]);
export const CARD_INTENTS = [
  'transient',
  'movable',
  'collection',
  'selectable',
  'floating',
];

const EXCLUDED_PATHS = [
  /(^|\/)node_modules\//u,
  /\.d\.ts$/u,
  /(^|\/)__tests__\//u,
  /\.(test|spec|stories)\.[cm]?[jt]sx?$/u,
  /(^|\/)(generated|__generated__)\//u,
  /(^|\/)\.next\//u,
];

/** The primitives' own definitions are not call sites. */
const PRIMITIVE_DEFINITIONS = new Set([
  'packages/ui/atoms/card.tsx',
  'apps/web/components/molecules/ContentSurfaceCard.tsx',
  'apps/web/components/molecules/drawer/DrawerSurfaceCard.tsx',
]);

const STATE_FILE_RE =
  /(?:^|\/)(?:[A-Za-z0-9]*(?:Empty|Loading|Skeleton|Error)[A-Za-z0-9]*|loading|error)\.tsx$/u;

export function isScanned(file) {
  return (
    SCOPES.some(scope => file.startsWith(`${scope}/`)) &&
    file.endsWith('.tsx') &&
    !PRIMITIVE_DEFINITIONS.has(file) &&
    !EXCLUDED_PATHS.some(re => re.test(file))
  );
}

/** Is this file an empty, loading or error-state component? */
export function isStateFile(file) {
  return STATE_FILE_RE.test(file);
}

/** Card primitive usages in one file: { total, untyped }. */
export function countSource(text, file) {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX
  );
  let total = 0;
  let untyped = 0;
  const visit = node => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = node.tagName.getText(source);
      if (CARD_PRIMITIVES.has(name)) {
        total += 1;
        const hasIntent = node.attributes.properties.some(
          prop =>
            ts.isJsxAttribute(prop) && prop.name.getText(source) === 'intent'
        );
        if (!hasIntent) untyped += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return { total, untyped };
}

/** { untyped: {file: n}, stateViolations: [file] } for the given files. */
export function scan(files, read) {
  const untyped = {};
  const stateViolations = [];
  for (const file of files) {
    if (!isScanned(file)) continue;
    const text = read(file);
    if (!text || !text.includes('Card')) continue;
    const counts = countSource(text, file);
    if (counts.untyped > 0) untyped[file] = counts.untyped;
    if (counts.total > 0 && isStateFile(file)) stateViolations.push(file);
  }
  return { untyped, stateViolations };
}

/** Violations against the ledger, and rows that can shrink. */
export function compare(found, baseline) {
  const violations = [];
  const shrinkable = [];
  const foundTotal = Object.values(found.untyped).reduce((a, b) => a + b, 0);
  if (foundTotal > baseline.total)
    violations.push(
      `${foundTotal} card usage(s) without an intent, baseline allows ${baseline.total}. Add an \`intent\` or remove the card; never raise the baseline.`
    );
  for (const [file, count] of Object.entries(found.untyped)) {
    const allowed = baseline.files[file] ?? 0;
    if (count > allowed)
      violations.push(
        `${file} has ${count} card usage(s) without an intent, baseline allows ${allowed}.`
      );
  }
  for (const file of found.stateViolations)
    violations.push(
      `${file} is an empty, loading or error state and renders a card primitive. These states are always flat: remove the card, fill, border and shadow.`
    );
  for (const [file, allowed] of Object.entries(baseline.files)) {
    const now = found.untyped[file] ?? 0;
    if (now < allowed) shrinkable.push({ file, now, allowed });
  }
  return { violations, shrinkable };
}

/** The ledger shrunk to today's counts; never grown, never extended. */
export function shrink(found, baseline) {
  const files = {};
  for (const [file, allowed] of Object.entries(baseline.files)) {
    const now = found.untyped[file] ?? 0;
    if (now > 0) files[file] = Math.min(allowed, now);
  }
  const total = Object.values(files).reduce((a, b) => a + b, 0);
  return { ...baseline, total, files };
}

/** Untyped usage counts grouped by area (the first path segments). */
export function inventory(untyped) {
  const areas = {};
  for (const [file, count] of Object.entries(untyped)) {
    const parts = file.split('/');
    let area;
    if (parts[0] === 'packages') area = parts.slice(0, 2).join('/');
    else if (parts[2] === 'components' && parts[3] === 'features')
      area = parts.slice(0, 5).join('/');
    else if (parts[2] === 'components') area = parts.slice(0, 4).join('/');
    else if (parts[2] === 'app') area = parts.slice(0, 5).join('/');
    else area = parts.slice(0, 3).join('/');
    areas[area] = (areas[area] ?? 0) + count;
  }
  return Object.fromEntries(
    Object.entries(areas).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  );
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z', ...SCOPES], {
    cwd: ROOT,
    maxBuffer: 1 << 28,
  })
    .toString()
    .split('\0')
    .filter(Boolean);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const read = p => {
    try {
      return readFileSync(resolve(ROOT, p), 'utf8');
    } catch {
      return '';
    }
  };
  const found = scan(trackedFiles(), read);
  const total = Object.values(found.untyped).reduce((a, b) => a + b, 0);
  if (args.has('--inventory')) {
    console.log(
      JSON.stringify({ total, areas: inventory(found.untyped) }, null, 2)
    );
    return;
  }
  if (args.has('--init')) {
    writeFileSync(
      resolve(ROOT, BASELINE_PATH),
      `${JSON.stringify(
        {
          schema: 'jovie-card-intent-ratchet-baseline/v1',
          rule: 'Shrink-only count of card primitive usages (Card, ContentSurfaceCard, DrawerSurfaceCard) without an intent prop. Never raise it: add an intent or remove the card. When a count drops, run --write to lock the floor lower.',
          total,
          files: found.untyped,
        },
        null,
        2
      )}\n`
    );
    console.log(`card-intent-ratchet: baseline written (${total} usages)`);
    return;
  }
  const baseline = JSON.parse(
    readFileSync(resolve(ROOT, BASELINE_PATH), 'utf8')
  );
  if (args.has('--write')) {
    writeFileSync(
      resolve(ROOT, BASELINE_PATH),
      `${JSON.stringify(shrink(found, baseline), null, 2)}\n`
    );
    console.log('card-intent-ratchet: baseline shrunk');
    return;
  }
  const { violations, shrinkable } = compare(found, baseline);
  for (const s of shrinkable)
    console.log(
      `card-intent-ratchet: ${s.file} is down to ${s.now} from ${s.allowed}; run "node scripts/invariants/card-intent-ratchet.mjs --write" to lock it in`
    );
  if (violations.length) {
    for (const v of violations) console.error(`card-intent-ratchet: ${v}`);
    process.exit(1);
  }
  console.log(
    `card-intent-ratchet: ${total} untyped card usage(s), baseline ${baseline.total}, no card in an empty/loading/error state`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
