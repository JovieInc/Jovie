/**
 * Data architecture guard. Encodes the canonical data architecture
 * (docs/architecture/data-architecture-adr-2026-10-29.md): reads through RSC +
 * cache tags, mutations through a server action or route handler that
 * revalidates the changed record's tag, TanStack Query as the only client
 * cache, one DB client. Existing violations are grandfathered per (file, rule)
 * in data-architecture-guard.ratchet.gen.json, which only shrinks. New data
 * libraries need an entry in canon/data-architecture.json.
 *
 *   node scripts/data-architecture-guard.mjs              check (CI)
 *   node scripts/data-architecture-guard.mjs --write      lower the ratchet
 *   node scripts/data-architecture-guard.mjs --bootstrap  write the first ratchet
 *   node scripts/data-architecture-guard.mjs --json       totals + top offenders
 * Rule: .claude/rules/data-architecture.md
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  baseRatchetAt,
  checkAgainstBase,
  checkLibraries,
  checkRatchet,
  loadRegistry,
  lowerRatchet,
  RATCHET_PATH,
  RATCHET_SCHEMA,
  RULES,
  scanRepo,
  topOffenders,
  totalsOf,
} from './lib/data-architecture-guard.mjs';

function checkoutRoot() {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  return top.status === 0 ? top.stdout.trim() : process.cwd();
}

/** One line per file keeps the ratchet small and its diffs readable. */
export function serializeRatchet(entries) {
  const sorted = Object.keys(entries).sort();
  const lines = sorted.map(
    (path, i) =>
      `    ${JSON.stringify(path)}: ${JSON.stringify(entries[path])}${i < sorted.length - 1 ? ',' : ''}`
  );
  return [
    '{',
    `  "schema": ${JSON.stringify(RATCHET_SCHEMA)},`,
    `  "totals": ${JSON.stringify(totalsOf(entries))},`,
    '  "entries": {',
    ...lines,
    '  }',
    '}',
    '',
  ].join('\n');
}

export function summarize(entries, allowed) {
  return {
    schema: 'jovie-data-architecture-metrics/v1',
    totals: totalsOf(entries),
    files: Object.keys(entries).length,
    allowed,
    top: Object.fromEntries(
      Object.keys(RULES).map(rule => [rule, topOffenders(entries, rule, 10)])
    ),
  };
}

export function main(argv = process.argv.slice(2), root = checkoutRoot()) {
  const { found, allowed } = scanRepo(root);
  const ratchetFile = join(root, RATCHET_PATH);
  const save = entries => writeFileSync(ratchetFile, serializeRatchet(entries));
  if (argv.includes('--json')) {
    process.stdout.write(
      `${JSON.stringify(summarize(found, allowed), null, 2)}\n`
    );
    return 0;
  }
  if (argv.includes('--bootstrap')) {
    if (existsSync(ratchetFile)) {
      process.stderr.write(`${RATCHET_PATH} exists; use --write\n`);
      return 1;
    }
    save(found);
    return 0;
  }
  const saved = existsSync(ratchetFile)
    ? JSON.parse(readFileSync(ratchetFile, 'utf8'))
    : null;
  if (!saved?.entries) {
    process.stderr.write(`data-architecture-guard: missing ${RATCHET_PATH}\n`);
    return 1;
  }
  if (argv.includes('--write')) {
    save(lowerRatchet(found, saved.entries));
    return 0;
  }
  const { errors, stale } = checkRatchet(found, saved.entries);
  errors.push(...checkAgainstBase(saved, baseRatchetAt(root)));
  errors.push(...checkLibraries(root, loadRegistry(root)));
  for (const e of errors)
    process.stderr.write(`data-architecture-guard: ${e}\n`);
  for (const s of stale)
    process.stdout.write(`data-architecture-guard: lower ratchet: ${s}\n`);
  if (stale.length)
    process.stdout.write(
      'data-architecture-guard: run `node scripts/data-architecture-guard.mjs --write` to lock in the improvement\n'
    );
  const totals = totalsOf(saved.entries);
  const left = Object.values(totals).reduce((a, b) => a + b, 0);
  process.stdout.write(
    `data-architecture-guard: ${errors.length ? 'FAIL' : 'ok'} (${left} grandfathered violations in ${Object.keys(saved.entries).length} files, ${allowed} reasoned allows)\n`
  );
  return errors.length ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}
