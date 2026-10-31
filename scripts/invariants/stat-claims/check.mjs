#!/usr/bin/env node
// Stat-claims guard (proof-stat registry, apps/web/data/proof-stats).
//
// Every numeric claim in marketing copy (counts of artists or users, speed or
// size multiples, percentage lifts, rankings, "trusted by N") must bind to a
// registered stat: `{stat:<id>}`. The number then comes from the live,
// threshold- and freshness-checked observation, so it is never hand-typed,
// never stale and never rounded up. Hand-written claims ratchet: a file may
// never gain hits, and baseline entries that no longer hit must be removed.
//
// Also checks that every `{stat:<id>}` binding names a registered stat.
//
// Deterministic: no network, no model. Whole-tree scan of the marketing roots.
// `--json` prints the measurement (bound vs unbound numeric claims) for the
// proof-stats loop; `--write-baseline` rewrites the ratchet.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { literals } from '../offer-claims/check.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
export const config = JSON.parse(
  readFileSync(join(here, 'config.json'), 'utf8')
);
export const BASELINE_PATH = join(here, 'baseline.json');
export const REGISTRY_PATH = 'apps/web/data/proof-stats/registry.json';

for (const e of config.exclude) {
  if (!e.reason?.trim())
    throw new Error('Every stat-claims exclusion needs a reason');
}

export const PATTERNS = config.patterns.map(p => ({
  id: p.id,
  regex: new RegExp(p.source, 'iu'),
}));
const EXCLUDES = config.exclude.map(e => new RegExp(e.path, 'u'));
const TS_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const TEXT_EXT = new Set(config.textExtensions);
export const BINDING =
  /\{stat:([a-z][a-z0-9_]{2,63})(?:\.(?:value|sentence))?\}/gu;

export function isExcluded(path) {
  return EXCLUDES.some(r => r.test(path));
}

/** Pattern ids in copy after removing valid stat bindings. */
export function hits(text) {
  const unbound = text.replaceAll(BINDING, '');
  return PATTERNS.filter(p => p.regex.test(unbound)).map(p => p.id);
}

/** Stat ids bound in a piece of text. */
export function bindings(text) {
  return [...text.matchAll(BINDING)].map(m => m[1]);
}

function pieces(path, content, cwd) {
  const ext = extname(path);
  if (TS_EXT.has(ext)) return literals(content, path, cwd);
  if (TEXT_EXT.has(ext)) return content.split('\n');
  return [];
}

/** { counts: {patternId: n}, bound: [statId...] } for one file. */
export function countFile(path, content, cwd = process.cwd()) {
  const counts = {};
  const bound = [];
  for (const piece of pieces(path, content, cwd)) {
    bound.push(...bindings(piece));
    for (const id of hits(piece)) counts[id] = (counts[id] ?? 0) + 1;
  }
  return { counts, bound };
}

export function listFiles(cwd) {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...config.roots], {
    cwd,
    maxBuffer: 1 << 28,
  });
  return out.toString('utf8').split('\0').filter(Boolean);
}

export function scan(cwd = process.cwd(), files = listFiles(cwd)) {
  const result = {};
  const bound = {};
  for (const f of files) {
    if (isExcluded(f)) continue;
    const ext = extname(f);
    if (!TS_EXT.has(ext) && !TEXT_EXT.has(ext)) continue;
    let content;
    try {
      content = readFileSync(join(cwd, f), 'utf8');
    } catch {
      continue;
    }
    const file = countFile(f, content, cwd);
    if (Object.keys(file.counts).length) result[f] = file.counts;
    if (file.bound.length) bound[f] = file.bound;
  }
  return { unbound: result, bound };
}

export function registeredIds(cwd = process.cwd()) {
  const registry = JSON.parse(readFileSync(join(cwd, REGISTRY_PATH), 'utf8'));
  return new Set(registry.stats.map(stat => stat.id));
}

/** Ratchet + binding validity. */
export function evaluate(current, baseline, ids) {
  const errors = [];
  for (const [file, counts] of Object.entries(current.unbound)) {
    for (const [id, n] of Object.entries(counts)) {
      const allowed = baseline[file]?.[id] ?? 0;
      if (n > allowed) {
        errors.push(
          `${file}: ${n} hand-written ${id} claim(s), baseline ${allowed}. Bind the number to a proof stat ({stat:<id>}, apps/web/data/proof-stats/registry.json) instead of typing it.`
        );
      }
    }
  }
  for (const [file, counts] of Object.entries(baseline)) {
    for (const [id, n] of Object.entries(counts)) {
      const now = current.unbound[file]?.[id] ?? 0;
      if (now < n) {
        errors.push(
          `${file}: baseline ${id}=${n} but only ${now} now. Lower baseline.json (it only shrinks).`
        );
      }
    }
  }
  for (const [file, statIds] of Object.entries(current.bound)) {
    for (const id of statIds) {
      if (!ids.has(id)) {
        errors.push(`${file}: {stat:${id}} is not a registered proof stat.`);
      }
    }
  }
  return errors;
}

/** Share of numeric claims in marketing copy that are stat-bound. */
export function measurement(current) {
  const unbound = Object.values(current.unbound).reduce(
    (s, c) => s + Object.values(c).reduce((a, b) => a + b, 0),
    0
  );
  const bound = Object.values(current.bound).reduce((s, b) => s + b.length, 0);
  const total = unbound + bound;
  return {
    schema: 'jovie.stat-claims.measurement/v1',
    numericClaims: total,
    bound,
    unbound,
    boundShare: total === 0 ? 1 : bound / total,
  };
}

export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const current = scan(cwd);
  if (argv.includes('--write-baseline')) {
    const sorted = Object.fromEntries(
      Object.entries(current.unbound).sort(([a], [b]) => (a < b ? -1 : 1))
    );
    writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
    const m = measurement(current);
    console.log(
      `stat-claims: wrote baseline, ${Object.keys(sorted).length} files, ${m.unbound} unbound claims`
    );
    return 0;
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify(measurement(current)));
    return 0;
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const errors = evaluate(current, baseline, registeredIds(cwd));
  if (errors.length) {
    console.error(
      `stat-claims: ${errors.length} violation(s)\n${errors.map(e => `  - ${e}`).join('\n')}`
    );
    return 1;
  }
  const m = measurement(current);
  console.log(
    `stat-claims: ok (${m.bound} bound, ${m.unbound} baselined hand-written numeric claims; bound share ${(m.boundShare * 100).toFixed(1)}%)`
  );
  return 0;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
