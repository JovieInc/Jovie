/**
 * Preflight-gap ratchet (PR #23573: four CI rework rounds that
 * `pnpm preflight:changed` should have caught). A CI-required check with no
 * preflight coverage and no `preflight-exempt: reason` fails here.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { SOURCE_GUARDS } from './ci-fast-lanes.mjs';
import {
  REQUIRED_CHECK_PREFLIGHT,
  REQUIRED_WORKFLOW_JOBS,
} from './lib/preflight-coverage-map.mjs';
import {
  GENERATOR_CHECK_EXEMPT,
  GENERATORS,
  HEAVY_GUARDS,
  NARROWED,
  PREFLIGHT_COVERAGE_KINDS,
} from './preflight-changed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = file =>
  load(readFileSync(path.join(ROOT, '.github/workflows', file), 'utf8'));
const needs = (wf, job) => {
  const n = wf.jobs[job]?.needs ?? [];
  return Array.isArray(n) ? n : [n];
};

function requiredChecks() {
  const ci = workflow('ci.yml');
  const keys = new Set();
  for (const parent of ['ci-pr-ready', 'ci-fast'])
    for (const job of needs(ci, parent)) keys.add(`ci.yml#${job}`);
  keys.delete('ci.yml#ci-fast'); // the aggregate itself; its children are listed
  keys.delete('ci.yml#ci-merge-group-admission'); // merge-group only
  for (const [file, job] of REQUIRED_WORKFLOW_JOBS) {
    assert.ok(workflow(file).jobs[job], `${file} has no job ${job}`);
    keys.add(`${file}#${job}`);
  }
  return keys;
}

test('every CI-required check has preflight coverage or an explicit exemption', () => {
  const missing = [...requiredChecks()].filter(
    k => !(k in REQUIRED_CHECK_PREFLIGHT)
  );
  assert.deepEqual(
    missing,
    [],
    `Required CI checks without preflight coverage. Add each to scripts/lib/preflight-coverage-map.mjs with { covers: [...] } and wire it into scripts/preflight-changed.mjs, or { exempt: 'preflight-exempt: <reason>' }.`
  );
});

test('map entries are well formed and not stale', () => {
  const live = requiredChecks();
  for (const [key, entry] of Object.entries(REQUIRED_CHECK_PREFLIGHT)) {
    assert.ok(live.has(key), `${key} is no longer a required check; remove it`);
    const hasCovers = Array.isArray(entry.covers) && entry.covers.length > 0;
    const hasExempt = typeof entry.exempt === 'string';
    assert.ok(hasCovers !== hasExempt, `${key}: exactly one of covers/exempt`);
    if (hasCovers)
      for (const kind of entry.covers)
        assert.ok(
          PREFLIGHT_COVERAGE_KINDS.has(kind),
          `${key}: unknown ${kind}`
        );
    else
      assert.match(
        entry.exempt,
        /^preflight-exempt: \S.{15,}/,
        `${key}: write 'preflight-exempt: <reason>' with a real reason`
      );
  }
});

test('every --check package script is a preflight generator or exempt', () => {
  const registered = new Set(GENERATORS.map(g => g.pkgScript).filter(Boolean));
  const unaccounted = [];
  for (const file of ['package.json', 'apps/web/package.json']) {
    const { scripts } = JSON.parse(readFileSync(path.join(ROOT, file), 'utf8'));
    for (const [name, command] of Object.entries(scripts)) {
      if (!/--check\b/.test(command)) continue;
      const key = `${file}#${name}`;
      const generatorIds = GENERATORS.map(g => g.check);
      const viaCommand = generatorIds.some(c => command.includes(c));
      if (registered.has(key) || viaCommand) continue;
      const reason = GENERATOR_CHECK_EXEMPT[key];
      if (typeof reason === 'string' && /^preflight-exempt: \S/.test(reason))
        continue;
      unaccounted.push(key);
    }
  }
  assert.deepEqual(
    unaccounted,
    [],
    'Generator --check scripts missing from GENERATORS (scripts/preflight-changed.mjs); add one with when/write/check, or an exemption with a reason'
  );
  for (const g of GENERATORS) {
    assert.ok(g.when instanceof RegExp && g.write && g.check, g.id);
    if (g.pkgScript) {
      const [file, name] = g.pkgScript.split('#');
      const { scripts } = JSON.parse(
        readFileSync(path.join(ROOT, file), 'utf8')
      );
      assert.ok(scripts[name], `${g.id}: ${g.pkgScript} does not exist`);
    }
  }
});

test('preflight never silently drops or mis-narrows a source guard', () => {
  const ids = new Set(SOURCE_GUARDS.map(g => g.id));
  for (const id of HEAVY_GUARDS) assert.ok(ids.has(id), `heavy ${id} is gone`);
  for (const id of Object.keys(NARROWED))
    assert.ok(ids.has(id), `narrowed ${id} is gone`);
  // The locked design dir CI runs must stay inside the narrowed command
  // (PR #23573 round 4: one-primary-action-per-screen).
  const ci = SOURCE_GUARDS.find(g => g.id === 'merge-group-unit-guards');
  assert.ok(ci.command.includes('tests/unit/design-system'));
  assert.ok(
    NARROWED['merge-group-unit-guards'].command.includes(
      ' tests/unit/design-system '
    )
  );
});
