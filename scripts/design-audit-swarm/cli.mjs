#!/usr/bin/env node
/**
 * Design audit swarm — read-only; Linear propose only.
 *   list | collect [--recipe id] | run [--recipe id] [--dry-run]
 */
import {
  collectDesignAuditFindings,
  DESIGN_AUDIT_RECIPES,
  READ_ONLY_CONTRACT,
} from './collect.mjs';
import { proposeDesignAuditFindings } from './propose.mjs';

function usage() {
  console.log(`Usage:
  node scripts/design-audit-swarm/cli.mjs list
  node scripts/design-audit-swarm/cli.mjs collect [--recipe <id>]
  node scripts/design-audit-swarm/cli.mjs run [--recipe <id>] [--dry-run]

Contract: mutatesPen=${READ_ONLY_CONTRACT.mutatesPen}
Recipes: ${DESIGN_AUDIT_RECIPES.map(r => r.id).join(', ')}
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, recipeId: null, dryRun: false };
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === '--recipe') {
      options.recipeId = rest[++i] ?? null;
      continue;
    }
    if (rest[i] === '--dry-run') options.dryRun = true;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.command || options.command === '--help') {
    usage();
    return;
  }
  if (options.command === 'list') {
    console.log(
      JSON.stringify(
        { contract: READ_ONLY_CONTRACT, recipes: DESIGN_AUDIT_RECIPES },
        null,
        2
      )
    );
    return;
  }
  if (options.command === 'collect' || options.command === 'run') {
    const findings = collectDesignAuditFindings({
      recipeId: options.recipeId ?? undefined,
    });
    if (options.command === 'collect') {
      console.log(
        JSON.stringify({ findings, contract: READ_ONLY_CONTRACT }, null, 2)
      );
      return;
    }
    if (findings.length === 0) {
      console.log(
        JSON.stringify(
          {
            dryRun: options.dryRun,
            contract: READ_ONLY_CONTRACT,
            findingCount: 0,
            proposedCount: 0,
            proposed: [],
            message: 'No design audit findings',
          },
          null,
          2
        )
      );
      return;
    }
    console.log(
      JSON.stringify(
        await proposeDesignAuditFindings({
          findings,
          dryRun: options.dryRun,
          sourceIssue: 'JOV-13850',
        }),
        null,
        2
      )
    );
    return;
  }
  usage();
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
