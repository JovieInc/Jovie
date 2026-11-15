#!/usr/bin/env node
/**
 * node scripts/workflow-token-budget-guard.mjs            fail on new unbudgeted GITHUB_TOKEN spend
 * node scripts/workflow-token-budget-guard.mjs --write    lower the ratchet to today's counts
 * node scripts/workflow-token-budget-guard.mjs --bootstrap  create the ratchet (only while none exists)
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  check,
  RATCHET_PATH,
  readRatchet,
  scanRepo,
  tighten,
  writeRatchet,
} from './lib/workflow-token-budget.mjs';
import {
  collectAddedLines,
  diffBase,
  evaluateViolations,
  liveRegistryIds,
  loadAllowlist,
} from './schedule-trigger-guard.mjs';

export function main(argv = process.argv.slice(2), root = process.cwd()) {
  const { found, declared } = scanRepo(root);
  if (argv.includes('--bootstrap')) {
    if (existsSync(join(root, RATCHET_PATH))) {
      process.stderr.write(
        `${RATCHET_PATH} exists; the ratchet only shrinks (use --write)\n`
      );
      return 1;
    }
    writeRatchet(root, found);
    return 0;
  }
  const ratchet = readRatchet(root);
  if (argv.includes('--write')) {
    writeRatchet(root, tighten(ratchet, found));
    return 0;
  }
  const errors = check({ found, declared, ratchet });
  for (const error of errors)
    process.stderr.write(`workflow-token-budget: ${error}\n`);
  // Event-driven-only mandate (Tim 2026-10-21 + 2026-11-14, JOV-12720): the
  // schedule/polling guard rides this same step until the pr-fleet-rules.yml
  // wiring is split by a workflows-permitted lane (owner follow-up).
  let scheduleFailed = false;
  if (!argv.includes('--write') && !argv.includes('--bootstrap')) {
    const base = diffBase(root);
    if (!base) {
      process.stdout.write(
        'schedule-trigger-guard: no diff base (origin/main); skipping\n'
      );
    } else {
      const scheduleErrors = evaluateViolations({
        added: collectAddedLines(root, base),
        allowlist: loadAllowlist(root),
        registryIds: liveRegistryIds(root),
      });
      for (const error of scheduleErrors)
        process.stderr.write(`schedule-trigger-guard: ${error}\n`);
      scheduleFailed = scheduleErrors.length > 0;
    }
  }
  const left = Object.values(ratchet).reduce(
    (n, rules) => n + Object.values(rules).reduce((a, b) => a + b, 0),
    0
  );
  process.stdout.write(
    `workflow-token-budget: ${errors.length || scheduleFailed ? 'FAIL' : 'ok'} (${left} grandfathered unbudgeted GITHUB_TOKEN sites, ${Object.keys(declared).length} declared budgets)\n`
  );
  return errors.length || scheduleFailed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main();
