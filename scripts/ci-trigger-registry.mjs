#!/usr/bin/env node
// Check the CI trigger registry against .github/workflows. Read-only unless
// --write, which syncs each entry's triggers to the workflow files and adds a
// missing workflow with runsPerMergedPr null, so the check still fails until a
// person or lane fills in the expected number.
//   node scripts/ci-trigger-registry.mjs [--write] [--json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  checkRegistry,
  formatRegistry,
  REGISTRY_PATH,
  readRegistry,
  scanWorkflows,
} from './lib/ci-trigger-registry.mjs';

export function main(
  argv = process.argv.slice(2),
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
) {
  const registry = readRegistry(root);
  const scanned = scanWorkflows(root);
  if (argv.includes('--write')) {
    const workflows = {};
    for (const [file, triggers] of Object.entries(scanned))
      workflows[file] = {
        triggers,
        runsPerMergedPr: registry.workflows[file]?.runsPerMergedPr ?? null,
      };
    registry.workflows = workflows;
    fs.writeFileSync(path.join(root, REGISTRY_PATH), formatRegistry(registry));
  }
  const { errors, expectedRunsPerMergedPr } = checkRegistry(registry, scanned);
  if (argv.includes('--json'))
    process.stdout.write(
      `${JSON.stringify({ errors, expectedRunsPerMergedPr, budget: registry.budget }, null, 2)}\n`
    );
  else {
    for (const error of errors)
      process.stderr.write(`ci-trigger-registry: ${error}\n`);
    process.stdout.write(
      `ci-trigger-registry: ${errors.length ? 'FAIL' : 'ok'} (${Object.keys(scanned).length} workflows, ${expectedRunsPerMergedPr} expected runs per merged PR, ceiling ${registry.budget.ceiling}, target ${registry.budget.runsPerMergedPr})\n`
    );
  }
  return errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = main();
