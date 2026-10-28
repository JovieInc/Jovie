/**
 * Domain write guard: direct DB writes to core tables belong inside the
 * registered domain write modules (apps/web/lib/domain/write-registry.json).
 * Any other file that calls db.insert/update/delete on a core table is a second
 * path to the same state and will drift (the createRelease form action vs the
 * chat tool, 2026-10-26). Existing offenders are grandfathered per
 * (file, table) in domain-write-guard.ratchet.gen.json, which only shrinks.
 *
 *   node scripts/domain-write-guard.mjs            check (CI)
 *   node scripts/domain-write-guard.mjs --write    lower the ratchet
 *   node scripts/domain-write-guard.mjs --bootstrap write the first ratchet
 * Rule: .claude/rules/domain-writes.md
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  baseRatchetAt,
  checkAgainstBase,
  checkRatchet,
  countsOf,
  loadRegistry,
  RATCHET_PATH,
  RATCHET_SCHEMA,
  scanRepo,
} from './lib/domain-write-guard.mjs';

function checkoutRoot() {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  return top.status === 0 ? top.stdout.trim() : process.cwd();
}

export function main(argv = process.argv.slice(2)) {
  const root = checkoutRoot();
  const registry = loadRegistry(root);
  const { found, gaps } = scanRepo(root, registry);
  const counts = countsOf(found);
  const ratchetFile = join(root, RATCHET_PATH);
  const save = (entries, sideEffectGaps) =>
    writeFileSync(
      ratchetFile,
      `${JSON.stringify({ schema: RATCHET_SCHEMA, entries, sideEffectGaps }, null, 2)}\n`
    );
  if (argv.includes('--bootstrap')) {
    if (existsSync(ratchetFile)) {
      process.stderr.write(`${RATCHET_PATH} exists; use --write\n`);
      return 1;
    }
    save(counts, gaps);
    return 0;
  }
  const saved = existsSync(ratchetFile)
    ? JSON.parse(readFileSync(ratchetFile, 'utf8'))
    : null;
  const ratchet = saved?.entries;
  if (!ratchet) {
    process.stderr.write(`domain-write-guard: missing ${RATCHET_PATH}\n`);
    return 1;
  }
  if (argv.includes('--write')) {
    const next = {};
    for (const [path, tables] of Object.entries(counts))
      for (const [table, n] of Object.entries(tables)) {
        const cap = ratchet[path]?.[table];
        if (cap !== undefined) (next[path] ??= {})[table] = Math.min(n, cap);
      }
    const nextGaps = {};
    for (const [path, tables] of Object.entries(gaps)) {
      const kept = tables.filter(t =>
        saved.sideEffectGaps?.[path]?.includes(t)
      );
      if (kept.length) nextGaps[path] = kept;
    }
    save(next, nextGaps);
    return 0;
  }
  const { errors, stale } = checkRatchet(
    counts,
    ratchet,
    gaps,
    saved.sideEffectGaps ?? {}
  );
  errors.push(...checkAgainstBase(saved, baseRatchetAt(root)));
  for (const e of errors) process.stderr.write(`domain-write-guard: ${e}\n`);
  for (const s of stale)
    process.stdout.write(`domain-write-guard: lower ratchet: ${s}\n`);
  const left = Object.values(ratchet).reduce(
    (n, t) => n + Object.values(t).reduce((a, b) => a + b, 0),
    0
  );
  process.stdout.write(
    `domain-write-guard: ${errors.length ? 'FAIL' : 'ok'} (${Object.keys(ratchet).length} grandfathered files, ${left} direct writes left to route through domain functions)\n`
  );
  return errors.length ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}
