#!/usr/bin/env node
/**
 * Design write swarm (JOV-13851).
 *   list | plan [--live] [--holder N] [--scope S] [--frames a,b] | dry-run
 *   validate --receipt path.json
 * Dry/plan never mutates Pen.
 */
import { readFileSync } from 'node:fs';
import {
  planWriteSwarm,
  validateWriteSwarmReceipt,
  WRITE_SWARM_CONTRACT,
} from './contract.mjs';

function usage() {
  console.log(`Usage:
  node scripts/design-write-swarm/cli.mjs list
  node scripts/design-write-swarm/cli.mjs plan [--live] [--holder <name>] [--scope <slice>] [--frames <ids>]
  node scripts/design-write-swarm/cli.mjs dry-run
  node scripts/design-write-swarm/cli.mjs validate --receipt <path.json>

dryMutatesPen=${WRITE_SWARM_CONTRACT.dryMutatesPen} forbidsInventAndRubberStamp=${WRITE_SWARM_CONTRACT.forbidsInventAndRubberStamp}
Attach: ${WRITE_SWARM_CONTRACT.attach} (lock ${WRITE_SWARM_CONTRACT.lockProfile})
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    live: false,
    holder: null,
    scope: null,
    frames: null,
    receipt: null,
  };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--live') options.live = true;
    else if (arg === '--holder') options.holder = rest[++i] ?? null;
    else if (arg === '--scope') options.scope = rest[++i] ?? null;
    else if (arg === '--frames') options.frames = rest[++i] ?? null;
    else if (arg === '--receipt') options.receipt = rest[++i] ?? null;
  }
  return options;
}

function print(value, code = 0) {
  console.log(JSON.stringify(value, null, 2));
  process.exitCode = code;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.command || options.command === '--help') {
    usage();
    return;
  }
  if (options.command === 'list') {
    print({
      contract: WRITE_SWARM_CONTRACT,
      modes: ['dry', 'live'],
      proof: 'pnpm design:write-swarm:test',
    });
    return;
  }
  if (options.command === 'plan' || options.command === 'dry-run') {
    const plan = planWriteSwarm({
      mode:
        options.command === 'dry-run' ? 'dry' : options.live ? 'live' : 'dry',
      holder: options.holder ?? undefined,
      scope: options.scope ?? undefined,
      frameIds: options.frames
        ? options.frames.split(',').map(s => s.trim())
        : [],
    });
    print({
      ...plan,
      proof: {
        mutatesPen: plan.contract.mutatesPen,
        forbidsInventAndRubberStamp:
          WRITE_SWARM_CONTRACT.forbidsInventAndRubberStamp,
        attachPath: WRITE_SWARM_CONTRACT.canonicalCanvas,
      },
    });
    return;
  }
  if (options.command === 'validate') {
    if (!options.receipt) {
      usage();
      process.exitCode = 1;
      return;
    }
    const result = validateWriteSwarmReceipt(
      JSON.parse(readFileSync(options.receipt, 'utf8'))
    );
    print(result, result.ok ? 0 : 1);
    return;
  }
  usage();
  process.exitCode = 1;
}

main();
