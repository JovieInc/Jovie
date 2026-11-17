#!/usr/bin/env node
// Lower every shrink-only baseline to what the tree measures now.
//
// Shrink-only guards pass when debt is removed, so the PR that removes debt
// never has to edit a shared baseline file (that edit is what made two green
// PRs fail together in a merge group). This is the other half: it runs each
// guard's `tighten` command from scripts/lib/queue-drift-guards.json. Those
// commands only lower or delete entries (scripts/lib/shrink-only-baseline.mjs),
// so this is safe to run on any tree at any time and can never turn a
// failing check green: every tighten command also runs its guard's growth
// check and exits non-zero on new debt.
//
//   node scripts/baselines-tighten.mjs          tighten every guard
//   node scripts/baselines-tighten.mjs --list   print the commands only
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REGISTRY_PATH = fileURLToPath(
  new URL('./lib/queue-drift-guards.json', import.meta.url)
);

export function tightenCommands(
  registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
) {
  return registry.guards
    .filter(guard => guard.tighten)
    .map(({ id, baseline, tighten }) => ({ id, baseline, tighten }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const failed = [];
  for (const { id, tighten } of tightenCommands()) {
    if (process.argv.includes('--list')) {
      console.log(`${id}: ${tighten}`);
      continue;
    }
    console.log(`[baselines-tighten] ${id}`);
    try {
      execSync(tighten, { cwd: root, stdio: 'inherit' });
    } catch {
      // A guard with real growth still fails here; that is the guard working.
      failed.push(id);
    }
  }
  if (failed.length) {
    console.error(
      `[baselines-tighten] failed: ${failed.join(', ')} (growth is never absorbed; fix the guard first)`
    );
    process.exitCode = 1;
  }
}
