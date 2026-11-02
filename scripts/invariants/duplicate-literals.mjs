#!/usr/bin/env node
/**
 * Duplicate-literal guard (canon/SOURCES_OF_TRUTH.md). Loads each owner's
 * values straight from the owner file (so a price change in the owner moves
 * the scan with it) and fails when the same literal appears in source outside
 * the owner. Existing offenders are a shrink-only ledger:
 * scripts/invariants/duplicate-literals.baseline.json.
 *
 *   node scripts/invariants/duplicate-literals.mjs            check
 *   node scripts/invariants/duplicate-literals.mjs --write    shrink the ledger (never grows it)
 *   node scripts/invariants/duplicate-literals.mjs --init     (re)create the ledger from today's tree
 *   node scripts/invariants/duplicate-literals.mjs --issues   print one agent-ready issue body per domain
 *
 * Model ids are guarded separately by scripts/model-id-guard.mjs.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const BASELINE_PATH =
  'scripts/invariants/duplicate-literals.baseline.json';
const MAP_PATH = 'canon/sources-of-truth.json';

const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Owner values for one scan, read from the owner file. */
export function ownerValues(scan, ownerText) {
  const values = new Set();
  for (const source of scan.extract)
    for (const m of ownerText.matchAll(new RegExp(source, 'g'))) {
      const v = m[1];
      if (v === undefined) continue;
      if (scan.minValue !== undefined && !(Number(v) >= scan.minValue))
        continue;
      values.add(v);
    }
  return [...values].sort();
}

export function literalRegexes(scan, values) {
  const templates = [scan.literal].flat();
  return values.flatMap(v =>
    templates.map(t => ({
      value: v,
      re: new RegExp(t.replace('{n}', escapeRe(v)), 'g'),
    }))
  );
}

function isScanned(file, scan, excludes) {
  return (
    scan.scope.some(s => file.startsWith(`${s}/`)) &&
    scan.exts.some(e => file.endsWith(e)) &&
    file !== scan.owner &&
    !scan.allow.includes(file) &&
    !excludes.some(re => re.test(file))
  );
}

/** { scanId: { file: count } } for the given files. */
export function scan(map, files, read) {
  const excludes = map.scanExcludes.map(s => new RegExp(s));
  const found = {};
  for (const sc of map.scans) {
    const values = ownerValues(sc, read(sc.owner));
    if (values.length === 0)
      throw new Error(
        `${sc.id}: no values extracted from ${sc.owner}; the extract patterns are stale`
      );
    const regexes = literalRegexes(sc, values);
    found[sc.id] = {};
    for (const file of files) {
      if (!isScanned(file, sc, excludes)) continue;
      const text = read(file);
      let count = 0;
      for (const { re } of regexes) count += [...text.matchAll(re)].length;
      if (count) found[sc.id][file] = count;
    }
  }
  return found;
}

/** Offenders that are new or grew past the ledger; and ledger rows that can shrink. */
export function compare(found, ledger) {
  const violations = [];
  const shrinkable = [];
  for (const [id, files] of Object.entries(found)) {
    const base = ledger[id] ?? {};
    for (const [file, count] of Object.entries(files)) {
      if (count > (base[file] ?? 0))
        violations.push({ scan: id, file, count, allowed: base[file] ?? 0 });
    }
    for (const [file, allowed] of Object.entries(base))
      if ((files[file] ?? 0) < allowed)
        shrinkable.push({ scan: id, file, now: files[file] ?? 0, allowed });
  }
  return { violations, shrinkable };
}

export function shrink(found, ledger) {
  const next = {};
  for (const [id, base] of Object.entries(ledger)) {
    next[id] = {};
    for (const [file, allowed] of Object.entries(base)) {
      const now = found[id]?.[file] ?? 0;
      if (now > 0) next[id][file] = Math.min(allowed, now);
    }
  }
  return next;
}

export function issueBodies(map, found) {
  return map.domains
    .map(d => {
      const scans = map.scans.filter(s => s.domain === d.id);
      const rows = scans.flatMap(s =>
        Object.entries(found[s.id] ?? {}).map(
          ([file, n]) =>
            `- \`${file}\` (${n}) restates a ${s.label.toLowerCase()} owned by \`${s.owner}\``
        )
      );
      if (!rows.length) return null;
      return {
        domain: d.id,
        title: `Derive, don't copy: ${d.title} literals outside ${d.owner.ref}`,
        body: [
          `Domain \`${d.id}\` has ONE owner: \`${d.owner.ref}\` (see canon/sources-of-truth.json).`,
          "Each file below restates the owner's value as a literal. Replace each with an import from the owner, or a value generated from it, then run `node scripts/invariants/duplicate-literals.mjs --write` so the ledger shrinks in the same PR.",
          '',
          ...rows,
          '',
          `Fingerprint: \`sot-duplicates-${d.id}\``,
        ].join('\n'),
      };
    })
    .filter(Boolean);
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], {
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
  const map = JSON.parse(read(MAP_PATH));
  const found = scan(map, trackedFiles(), read);
  if (args.has('--init')) {
    writeFileSync(
      resolve(ROOT, BASELINE_PATH),
      `${JSON.stringify({ schema: 'jovie-duplicate-literals-ledger/v1', rule: 'Shrink-only. Never add a row; derive the value from its owner instead (canon/SOURCES_OF_TRUTH.md).', ledger: found }, null, 2)}\n`
    );
    console.log('duplicate-literals: ledger written');
    return;
  }
  if (args.has('--issues')) {
    for (const i of issueBodies(map, found))
      console.log(`## ${i.title}\n\n${i.body}\n`);
    return;
  }
  const { ledger } = JSON.parse(read(BASELINE_PATH));
  if (args.has('--write')) {
    const next = shrink(found, ledger);
    const body = JSON.parse(read(BASELINE_PATH));
    writeFileSync(
      resolve(ROOT, BASELINE_PATH),
      `${JSON.stringify({ ...body, ledger: next }, null, 2)}\n`
    );
    console.log('duplicate-literals: ledger shrunk');
    return;
  }
  const { violations, shrinkable } = compare(found, ledger);
  for (const s of shrinkable)
    console.log(
      `duplicate-literals: ${s.file} (${s.scan}) is down to ${s.now} from ${s.allowed}; run --write to lock it in`
    );
  if (violations.length) {
    for (const v of violations)
      console.error(
        `duplicate-literals: ${v.file} has ${v.count} ${v.scan} literal(s), ledger allows ${v.allowed}. Import the value from its owner instead of copying it (see canon/SOURCES_OF_TRUTH.md).`
      );
    process.exit(1);
  }
  const total = Object.values(found).reduce(
    (n, f) => n + Object.keys(f).length,
    0
  );
  console.log(
    `duplicate-literals: no new duplicates (${total} baselined files).`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
