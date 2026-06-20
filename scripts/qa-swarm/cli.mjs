#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { proposeQaSwarmFindings } from './propose.mjs';
import { QA_SWARM_RECIPES } from './registry.mjs';
import { isQaSwarmProposeInput } from './types.mjs';

function printUsage() {
  console.log(`Usage:
  node scripts/qa-swarm/cli.mjs list
  node scripts/qa-swarm/cli.mjs propose --recipe <id> --input <findings.json> [--dry-run] [--eve-enabled]

Recipes:
${QA_SWARM_RECIPES.map(recipe => `  - ${recipe.id} (${recipe.skillInvocation})`).join('\n')}
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    recipe: null,
    inputPath: null,
    dryRun: false,
    eveEnabled: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--recipe') {
      options.recipe = rest[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === '--input') {
      options.inputPath = rest[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (token === '--eve-enabled') {
      options.eveEnabled = true;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.command || options.command === '--help') {
    printUsage();
    return;
  }

  if (options.command === 'list') {
    console.log(JSON.stringify(QA_SWARM_RECIPES, null, 2));
    return;
  }

  if (options.command !== 'propose') {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (!options.recipe || !options.inputPath) {
    console.error('propose requires --recipe and --input');
    process.exitCode = 1;
    return;
  }

  const raw = JSON.parse(readFileSync(options.inputPath, 'utf8'));
  const payload = {
    recipeId: options.recipe,
    findings: raw.findings ?? raw,
    dryRun: options.dryRun,
    eveEnabled: options.eveEnabled,
    sourceIssue: raw.sourceIssue,
    sourcePr: raw.sourcePr,
    branch: raw.branch,
    runId: raw.runId,
  };

  if (!isQaSwarmProposeInput(payload)) {
    console.error('Invalid QA swarm propose payload.');
    process.exitCode = 1;
    return;
  }

  const summary = await proposeQaSwarmFindings(payload);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
