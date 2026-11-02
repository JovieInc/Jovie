#!/usr/bin/env node
/**
 * node scripts/model-id-guard.mjs [--check]   fail on a concrete OpenAI model id outside the registry
 * node scripts/model-id-guard.mjs --write     lower the ratchet to today's counts (never raises it)
 * node scripts/model-id-guard.mjs --bootstrap grandfather every current site (only while no ratchet exists)
 *
 * The one place a concrete OpenAI model id lives is `modelFamilies` in ops/registry/capacity.json (aliases
 * such as openai:sol@latest). Anything else that names gpt-<ver>-<luna|terra|sol|astra> hardcodes a model
 * that goes stale. Grandfathered sites live in scripts/lib/model-id-guard.ratchet.json and only shrink.
 * Tests, fixtures, docs, generated canon and the registries themselves are not scanned.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RATCHET_PATH = 'scripts/lib/model-id-guard.ratchet.json';
export const RATCHET_SCHEMA = 'jovie.model-id-guard-ratchet/v1';
export const MODEL_ID = /\bgpt-\d+(?:\.\d+)?-(?:luna|terra|sol|astra)\b/gu;

const SCANNED = /\.(?:ts|tsx|js|mjs|cjs|mts|cts|py|sh|bash|ya?ml|toml|json)$/u;
const SKIPPED =
  /(?:^|\/)(?:node_modules|docs|canon|fixtures|__tests__|tests?|evals?|__snapshots__)\/|\.(?:test|spec|stories|gen)\.|eval-results|^ops\/registry\/capacity\.json$|^scripts\/backlog-orchestrator\/config\/model-registry\.json$|^scripts\/lib\/model-id-guard\.|^scripts\/model-id-guard\.|^scripts\/lanes\/model_families\.py$|^pnpm-lock|(?:^|\/)package-lock/u;

export function scannable(path) {
  return SCANNED.test(path) && !SKIPPED.test(path);
}

export function countIn(text) {
  return (text.match(MODEL_ID) ?? []).length;
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

/** Violations: a file with more concrete ids than the ratchet allows (a new file allows none). */
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
  const out = spawnSync('git', ['ls-files', '-z'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
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
        'model-id-guard: ratchet exists; use --write to tighten it'
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
      'model-id-guard: concrete OpenAI model id outside the registry:'
    );
    for (const v of bad)
      console.error(`  ${v.file}: ${v.found} found, ${v.allowed} allowed`);
    console.error(
      'Resolve it from ops/registry/capacity.json modelFamilies (python: scripts/lanes/model_families.resolve, alias openai:<tier>@latest).'
    );
    return 1;
  }
  const slack = Object.entries(ratchet).filter(
    ([f, n]) => (counts[f] ?? 0) < n
  ).length;
  if (slack)
    console.log(
      `model-id-guard: ok; ${slack} grandfathered file(s) can shrink (run --write)`
    );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exit(main());
