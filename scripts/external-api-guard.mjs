#!/usr/bin/env node
/**
 * node scripts/external-api-guard.mjs [--check]   fail on new direct provider calls
 * node scripts/external-api-guard.mjs --write     lower the ratchet to today's counts
 * node scripts/external-api-guard.mjs --onboard     grandfather existing calls to a provider
 *                                                 just added to providers.json
 * node scripts/external-api-guard.mjs --bootstrap grandfather every current call site
 *                                                 (only while no ratchet exists)
 * node scripts/external-api-guard.mjs --mail-bootstrap  grandfather today's mail
 *                                                 sites (only while no mail ratchet exists)
 *
 * Also runs the mail send guard (scripts/lib/mail-send-guard.mjs): every email
 * goes through the send gateway on a registered stream.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ALLOWLIST_PATH,
  baseCountsAt,
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
  trackedFiles,
} from './lib/external-api-guard.mjs';
import {
  buildMailRules,
  checkMailGuard,
  checkRegistry,
  loadStreamRegistry,
  MAIL_RATCHET_PATH,
  MAIL_RATCHET_SCHEMA,
  mailBaseCountsAt,
  mailBaseRatchetAt,
  scanMailRepo,
  tightenMailRatchet,
} from './lib/mail-send-guard.mjs';

/**
 * The checkout to scan is the current working tree, not this file's tree:
 * Source Validation runs the trusted-base copy of this script inside the
 * source checkout under review.
 */
function checkoutRoot() {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  return top.status === 0 ? top.stdout.trim() : process.cwd();
}

const repoRoot = checkoutRoot();

function save(entries) {
  writeFileSync(
    join(repoRoot, RATCHET_PATH),
    `${JSON.stringify({ schema: RATCHET_SCHEMA, entries }, null, 2)}\n`
  );
}

function saveMail(entries) {
  writeFileSync(
    join(repoRoot, MAIL_RATCHET_PATH),
    `${JSON.stringify({ schema: MAIL_RATCHET_SCHEMA, entries }, null, 2)}\n`
  );
}

/** The mail send guard. Returns its errors; writes the ratchet when asked. */
export function mailGuard(argv, base, files) {
  const registry = loadStreamRegistry(repoRoot);
  if (!registry) return [];
  const rules = buildMailRules(registry);
  const found = scanMailRepo(repoRoot, rules, files);
  const ratchetFile = join(repoRoot, MAIL_RATCHET_PATH);
  if (argv.includes('--mail-bootstrap')) {
    if (existsSync(ratchetFile))
      return [`${MAIL_RATCHET_PATH} exists; it only shrinks (use --write)`];
    const entries = {};
    for (const [path, hits] of Object.entries(found))
      for (const [rule, row] of Object.entries(hits))
        (entries[path] ??= {})[rule] = row.count;
    saveMail(entries);
    return [];
  }
  const ratchet = readJson(ratchetFile, { entries: {} }).entries;
  if (argv.includes('--write')) {
    saveMail(tightenMailRatchet(ratchet, found));
    return [];
  }
  return [
    ...checkRegistry(registry),
    ...checkMailGuard({
      found,
      ratchet,
      baseRatchet: mailBaseRatchetAt(base, repoRoot, spawnSync),
      baseCounts: mailBaseCountsAt(
        base,
        repoRoot,
        rules,
        [...Object.keys(found), ...Object.keys(ratchet)],
        spawnSync
      ),
    }),
  ];
}

export function main(argv = process.argv.slice(2)) {
  const adopting = argv.includes('--bootstrap');
  if (
    !existsSync(join(repoRoot, 'packages/api-client/providers.json')) ||
    (!adopting && !existsSync(join(repoRoot, RATCHET_PATH)))
  ) {
    process.stdout.write(
      'external-api-guard: not adopted on this checkout; skipped\n'
    );
    return 0;
  }
  const providers = loadProviders(repoRoot);
  const files = trackedFiles(repoRoot);
  const found = scanRepo(repoRoot, buildRules(providers), files);
  const base = ciBase(repoRoot);
  const mailErrors = mailGuard(argv, base, files);
  if (argv.includes('--mail-bootstrap')) {
    for (const error of mailErrors)
      process.stderr.write(`mail-send-guard: ${error}\n`);
    return mailErrors.length ? 1 : 0;
  }
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
    baseCounts: baseCountsAt(base, repoRoot, buildRules(providers), [
      ...Object.keys(found),
      ...Object.keys(ratchet),
    ]),
  });
  for (const error of errors)
    process.stderr.write(`external-api-guard: ${error}\n`);
  for (const error of mailErrors)
    process.stderr.write(`mail-send-guard: ${error}\n`);
  const sites = Object.values(ratchet).reduce(
    (n, rules) => n + Object.values(rules).reduce((a, b) => a + b, 0),
    0
  );
  process.stdout.write(
    `external-api-guard: ${errors.length ? 'FAIL' : 'ok'} (${Object.keys(ratchet).length} grandfathered files, ${sites} call sites left to migrate)\n`
  );
  process.stdout.write(
    `mail-send-guard: ${mailErrors.length ? 'FAIL' : 'ok'}\n`
  );
  return errors.length || mailErrors.length ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = main();
}
