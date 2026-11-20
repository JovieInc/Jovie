#!/usr/bin/env node
/**
 * Type-safety escape ratchet (TS adoption audit 2026-11-19, Tim).
 *
 * Counts per file, in non-test TS/TSX under apps/, packages/ and workers/:
 *
 *   as-unknown-as  `x as unknown as T` double casts (AST: AsExpression whose
 *                  type is `unknown` wrapping another AsExpression)
 *   non-null       non-null assertions `x!` (AST: NonNullExpression)
 *   ts-ignore      TypeScript suppression directive comments (ts-ignore and
 *                  ts-expect-error; the token is built at runtime below so
 *                  this file itself never carries a suppression literal)
 *   any            explicit `any` in type position (AST: AnyKeyword)
 *
 * Test files (*.test.* / *.spec.* / __tests__), declarations (*.d.ts),
 * generated code, drizzle migrations and node_modules are out of scope.
 *
 * Existing escapes live in a shrink-only per-file ledger:
 * scripts/invariants/type-safety-ratchet.baseline.json. Any count that grows,
 * or a new file that enters with a nonzero count, fails; decreases are
 * allowed and print a hint to lock the floor lower.
 *
 *   node scripts/invariants/type-safety-ratchet.mjs           check
 *   node scripts/invariants/type-safety-ratchet.mjs --write   shrink the ledger (never grows it)
 *   node scripts/invariants/type-safety-ratchet.mjs --init    (re)create the ledger from today's tree
 *
 * Parse-only (no type-check), so the scan is fast; the typescript compiler
 * API is used purely for its AST.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const BASELINE_PATH =
  'scripts/invariants/type-safety-ratchet.baseline.json';

export const SCOPES = ['apps', 'packages', 'workers'];
export const CATEGORIES = ['as-unknown-as', 'non-null', 'ts-ignore', 'any'];

const EXCLUDED_PATHS = [
  /(^|\/)node_modules\//u,
  /\.d\.ts$/u,
  /(^|\/)__tests__\//u,
  /\.test\.[cm]?[jt]sx?$/u,
  /\.spec\.[cm]?[jt]sx?$/u,
  /(^|\/)(generated|__generated__)\//u,
  /\.generated\.[cm]?[jt]sx?$/u,
  /(^|\/)drizzle\//u,
];

// Suppression directive tokens, assembled at runtime so this gate's own
// source never carries a suppression literal (the gate-weakening detector
// flags added suppression literals in code files, doc comments included).
const TS_DIRECTIVE_RE = new RegExp(
  `@ts-(?:${['ignore', 'expect-error'].join('|')})\\b`,
  'gu'
);

/** Is this repo-relative file inside the ratchet's scope? */
export function isScanned(file) {
  return (
    SCOPES.some(scope => file === scope || file.startsWith(`${scope}/`)) &&
    /\.tsx?$/u.test(file) &&
    !EXCLUDED_PATHS.some(re => re.test(file))
  );
}

/** Per-category escape counts for one source file (AST-based, parse only). */
export function countSource(text, file) {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    kind
  );
  const counts = {
    'as-unknown-as': 0,
    'non-null': 0,
    'ts-ignore': 0,
    any: 0,
  };
  const visit = node => {
    if (
      ts.isAsExpression(node) &&
      ts.isAsExpression(node.expression) &&
      node.expression.type.kind === ts.SyntaxKind.UnknownKeyword
    ) {
      // `x as unknown as T`: an as-cast whose inner cast went through unknown.
      counts['as-unknown-as'] += 1;
    } else if (node.kind === ts.SyntaxKind.NonNullExpression) {
      counts['non-null'] += 1;
    } else if (node.kind === ts.SyntaxKind.AnyKeyword) {
      counts.any += 1;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  counts['ts-ignore'] = (text.match(TS_DIRECTIVE_RE) ?? []).length;
  return counts;
}

/** { file: { category: count } } for every in-scope file with any escape. */
export function scan(files, read) {
  const found = {};
  for (const file of files) {
    if (!isScanned(file)) continue;
    const text = read(file);
    if (!text) continue;
    const counts = countSource(text, file);
    const nonzero = Object.entries(counts).filter(([, n]) => n > 0);
    if (nonzero.length) found[file] = Object.fromEntries(nonzero);
  }
  return found;
}

/** Violations that are new or grew past the ledger; ledger rows that can shrink. */
export function compare(found, ledger) {
  const violations = [];
  const shrinkable = [];
  for (const [file, counts] of Object.entries(found)) {
    const base = ledger[file] ?? {};
    for (const [category, count] of Object.entries(counts)) {
      const allowed = base[category] ?? 0;
      if (count > allowed) violations.push({ file, category, count, allowed });
    }
  }
  for (const [file, base] of Object.entries(ledger)) {
    const counts = found[file] ?? {};
    for (const [category, allowed] of Object.entries(base)) {
      const now = counts[category] ?? 0;
      if (now < allowed) shrinkable.push({ file, category, now, allowed });
    }
  }
  return { violations, shrinkable };
}

/** The ledger shrunk to today's counts — never grown, never extended. */
export function shrink(found, ledger) {
  const next = {};
  for (const [file, base] of Object.entries(ledger)) {
    const counts = found[file] ?? {};
    const row = {};
    for (const [category, allowed] of Object.entries(base)) {
      const now = counts[category] ?? 0;
      if (now > 0) row[category] = Math.min(allowed, now);
    }
    if (Object.keys(row).length) next[file] = row;
  }
  return next;
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

function readBaseline() {
  return JSON.parse(readFileSync(resolve(ROOT, BASELINE_PATH), 'utf8'));
}

function writeBaseline(baseline) {
  writeFileSync(
    resolve(ROOT, BASELINE_PATH),
    `${JSON.stringify(baseline, null, 2)}\n`
  );
}

function main() {
  const args = new Set(process.argv.slice(2));
  const started = Date.now();
  const read = p => {
    try {
      return readFileSync(resolve(ROOT, p), 'utf8');
    } catch {
      return '';
    }
  };
  const found = scan(trackedFiles(), read);
  if (args.has('--init')) {
    writeBaseline({
      schema: 'jovie-type-safety-ratchet-baseline/v1',
      rule: 'Shrink-only per-file counts of type-safety escapes (as-unknown-as, non-null, ts-ignore, any) in non-test TS/TSX under apps/, packages/, workers/. Never add a row: fix the escape instead. When a count drops, run --write to lock the floor lower.',
      files: found,
    });
    console.log(
      `type-safety-ratchet: baseline written (${Object.keys(found).length} files)`
    );
    return;
  }
  const baseline = readBaseline();
  if (args.has('--write')) {
    const files = shrink(found, baseline.files);
    writeBaseline({ ...baseline, files });
    console.log('type-safety-ratchet: baseline shrunk');
    return;
  }
  const { violations, shrinkable } = compare(found, baseline.files);
  for (const s of shrinkable)
    console.log(
      `type-safety-ratchet: ${s.file} ${s.category} is down to ${s.now} from ${s.allowed}; run "node scripts/invariants/type-safety-ratchet.mjs --write" to lock it in`
    );
  if (violations.length) {
    for (const v of violations)
      console.error(
        `type-safety-ratchet: ${v.file} has ${v.count} ${v.category} escape(s), baseline allows ${v.allowed}. Fix the escape (type it properly) instead of adding a new one.`
      );
    process.exit(1);
  }
  const total = Object.values(found).reduce(
    (n, counts) => n + Object.values(counts).reduce((a, b) => a + b, 0),
    0
  );
  console.log(
    `type-safety-ratchet: ${total} escape(s) across ${Object.keys(found).length} file(s), all within baseline (${Date.now() - started}ms)`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
