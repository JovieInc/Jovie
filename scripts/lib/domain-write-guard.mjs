/**
 * Scanner for the domain write guard (scripts/domain-write-guard.mjs).
 * Pure functions so the contract test can drive them with fixtures.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REGISTRY_PATH = 'apps/web/lib/domain/write-registry.json';
export const RATCHET_PATH = 'scripts/lib/domain-write-guard.ratchet.gen.json';
export const RATCHET_SCHEMA = 'jovie-domain-write-ratchet/v1';

const SCANNED_ROOT = /^apps\/web\/(?:app|lib|components)\/.+\.(?:ts|tsx|mts)$/;
const NOT_SOURCE =
  /(?:\.test\.|\.spec\.|\.stories\.|\.gen\.|\.d\.ts$|(?:^|\/)(?:__tests__|__mocks__|tests?|fixtures|testing|test-utils|node_modules)\/)/;
/** Migrations and seed/provision code are exempt by path, not by count. */
const EXEMPT_PATH =
  /^apps\/web\/(?:drizzle\/|lib\/db\/schema\/|lib\/testing\/|lib\/auth\/dev-test-auth)/;

export function loadRegistry(root) {
  return JSON.parse(readFileSync(join(root, REGISTRY_PATH), 'utf8'));
}

export function inScope(path, registry) {
  if (!SCANNED_ROOT.test(path) || NOT_SOURCE.test(path)) return false;
  if (EXEMPT_PATH.test(path)) return false;
  return !registry.domains.some(d => d.module === path);
}

/** Count `.insert(table)` / `.update(table)` / `.delete(table)` per table. */
export function scanSource(text, tables) {
  const hits = {};
  const names = Object.keys(tables);
  const call = new RegExp(
    `\\.(?:insert|update|delete)\\(\\s*(?:schema\\.)?(${names.join('|')})\\s*\\)`,
    'g'
  );
  for (const m of text.matchAll(call)) hits[m[1]] = (hits[m[1]] ?? 0) + 1;
  const sqlNames = Object.fromEntries(
    Object.entries(tables).map(([k, v]) => [v, k])
  );
  const rawTables = Object.values(tables).filter(v => v.includes('_'));
  const raw = new RegExp(
    `\\b(?:insert\\s+into|update|delete\\s+from)\\s+"?(?:public\\.)?"?(${rawTables.join('|')})\\b`,
    'gi'
  );
  for (const m of text.matchAll(raw)) {
    const key = sqlNames[m[1].toLowerCase()];
    if (key) hits[key] = (hits[key] ?? 0) + 1;
  }
  return hits;
}

export function trackedFiles(root) {
  const listed = spawnSync('git', ['ls-files', '-z', 'apps/web'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  if (listed.status !== 0) throw new Error(`git ls-files: ${listed.stderr}`);
  return listed.stdout.split('\0').filter(Boolean);
}

/** Tables a file writes without referencing any required side-effect call. */
export function sideEffectGapsOf(text, hits, sideEffects = {}) {
  return Object.keys(hits).filter(table => {
    const needed = sideEffects[table];
    return needed && !needed.some(name => text.includes(name));
  });
}

export function scanRepo(root, registry, files = trackedFiles(root)) {
  const found = {};
  const gaps = {};
  for (const path of files) {
    if (!inScope(path, registry)) continue;
    const text = readFileSync(join(root, path), 'utf8');
    const hits = scanSource(text, registry.coreTables);
    if (!Object.keys(hits).length) continue;
    found[path] = hits;
    const missing = registry.sideEffectWaivers?.[path]
      ? []
      : sideEffectGapsOf(text, hits, registry.sideEffects);
    if (missing.length) gaps[path] = missing;
  }
  return { found, gaps };
}

export const countsOf = found => JSON.parse(JSON.stringify(found));

export function checkRatchet(counts, ratchet, gaps = {}, gapRatchet = {}) {
  const errors = [];
  const stale = [];
  for (const [path, tables] of Object.entries(gaps))
    for (const table of tables)
      if (!gapRatchet[path]?.includes(table))
        errors.push(
          `${path} writes ${table} without a required side effect (cache invalidation); see sideEffects in ${REGISTRY_PATH}.`
        );
  for (const [path, tables] of Object.entries(gapRatchet))
    for (const table of tables)
      if (!gaps[path]?.includes(table))
        stale.push(`${path} ${table} side-effect gap fixed`);
  for (const [path, tables] of Object.entries(counts))
    for (const [table, n] of Object.entries(tables)) {
      const cap = ratchet[path]?.[table] ?? 0;
      if (n > cap)
        errors.push(
          `${path} writes ${table} directly ${n}x (allowed ${cap}). Route it through a registered domain function in ${REGISTRY_PATH}, or add the write to that domain module.`
        );
      else if (n < cap) stale.push(`${path} ${table} ${cap} -> ${n}`);
    }
  for (const [path, tables] of Object.entries(ratchet))
    for (const [table, cap] of Object.entries(tables))
      if (!counts[path]?.[table]) stale.push(`${path} ${table} ${cap} -> 0`);
  return { errors, stale };
}

/** Ratchet saved on the base revision, or null when absent (first adoption). */
export function baseRatchetAt(root, env = process.env) {
  const base = env.GITHUB_BASE_REF
    ? `origin/${env.GITHUB_BASE_REF}`
    : 'origin/main';
  const mb = spawnSync('git', ['merge-base', 'HEAD', base], {
    cwd: root,
    encoding: 'utf8',
  });
  if (mb.status !== 0) return null;
  const shown = spawnSync(
    'git',
    ['show', `${mb.stdout.trim()}:${RATCHET_PATH}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 }
  );
  return shown.status === 0 ? JSON.parse(shown.stdout) : null;
}

/** A PR may lower the ratchet, never raise or add to it. */
export function checkAgainstBase(saved, base) {
  if (!base) return [];
  const errors = [];
  for (const [path, tables] of Object.entries(saved.entries ?? {}))
    for (const [table, n] of Object.entries(tables)) {
      const cap = base.entries?.[path]?.[table] ?? 0;
      if (n > cap)
        errors.push(`ratchet raised for ${path} ${table}: ${cap} -> ${n}`);
    }
  for (const [path, tables] of Object.entries(saved.sideEffectGaps ?? {}))
    for (const table of tables)
      if (!base.sideEffectGaps?.[path]?.includes(table))
        errors.push(`ratchet added side-effect gap ${path} ${table}`);
  return errors;
}
