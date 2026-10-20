#!/usr/bin/env node
/**
 * node scripts/external-api-guard.mjs [--check]   fail on new direct provider calls
 * node scripts/external-api-guard.mjs --write     lower the ratchet to today's counts
 * node scripts/external-api-guard.mjs --onboard     grandfather existing calls to a provider
 *                                                 just added to providers.json
 * node scripts/external-api-guard.mjs --bootstrap grandfather every current call site
 *                                                 (only while no ratchet exists)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  ALLOWLIST_PATH,
  baseProvidersAt,
  baseRatchetAt,
  buildRules,
  checkGuard,
  ciBase,
  countsOf,
  loadProviders,
  onboardedHits,
  onboardRatchet,
  RATCHET_PATH,
  RATCHET_SCHEMA,
  readJson,
  scanRepo,
  tightenRatchet,
} from './lib/external-api-guard.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function save(entries) {
  writeFileSync(
    join(repoRoot, RATCHET_PATH),
    `${JSON.stringify({ schema: RATCHET_SCHEMA, entries }, null, 2)}\n`
  );
}

export function main(argv = process.argv.slice(2)) {
  const providers = loadProviders(repoRoot);
  const found = scanRepo(repoRoot, buildRules(providers));
  const base = ciBase(repoRoot);
  const onboarded = onboardedHits(
    found,
    baseProvidersAt(base, repoRoot),
    providers,
    path => readFileSync(join(repoRoot, path), 'utf8')
  );
  const allowlist = readJson(join(repoRoot, ALLOWLIST_PATH), {
    entries: [],
  }).entries;
  const ratchetFile = join(repoRoot, RATCHET_PATH);
  if (argv.includes('--bootstrap')) {
    if (existsSync(ratchetFile)) {
      process.stderr.write(
        `${RATCHET_PATH} exists; the ratchet only shrinks (use --write)\n`
      );
      return 1;
    }
    const counts = countsOf(found);
    for (const entry of allowlist) delete counts[entry.path]?.[entry.rule];
    save(
      Object.fromEntries(
        Object.entries(counts).filter(([, rules]) => Object.keys(rules).length)
      )
    );
    return 0;
  }
  const ratchet = readJson(ratchetFile, { entries: {} }).entries;
  if (argv.includes('--onboard')) {
    save(onboardRatchet(ratchet, found, onboarded));
    return 0;
  }
  if (argv.includes('--write')) {
    save(tightenRatchet(ratchet, found));
    return 0;
  }
  const errors = checkGuard({
    found,
    ratchet,
    allowlist,
    baseRatchet: baseRatchetAt(base, repoRoot),
    onboarded,
  });
  for (const error of errors)
    process.stderr.write(`external-api-guard: ${error}\n`);
  const sites = Object.values(ratchet).reduce(
    (n, rules) => n + Object.values(rules).reduce((a, b) => a + b, 0),
    0
  );
  process.stdout.write(
    `external-api-guard: ${errors.length ? 'FAIL' : 'ok'} (${Object.keys(ratchet).length} grandfathered files, ${sites} call sites left to migrate)\n`
  );
  return errors.length ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}
