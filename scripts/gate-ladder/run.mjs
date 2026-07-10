#!/usr/bin/env node
/**
 * Run a gate-ladder rung by id (JOV-3210).
 *
 * Usage:
 *   node scripts/gate-ladder/run.mjs --rung secrets --app web --phase preCommit
 *   node scripts/gate-ladder/run.mjs --list
 *
 * This is the shared entrypoint web + iOS adapters can call. Hard-block rungs
 * exit non-zero; advisory rungs warn and exit 0 unless --strict.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ladder = JSON.parse(
  readFileSync(resolve(__dirname, 'ladder.json'), 'utf8')
);

function usage(code = 0) {
  console.log(`Usage:
  node scripts/gate-ladder/run.mjs --list
  node scripts/gate-ladder/run.mjs --rung <id> --app web|ios --phase preCommit|prePush|pr [--strict]
`);
  process.exit(code);
}

function parseArgs(argv) {
  const out = { list: false, strict: false, rung: null, app: 'web', phase: 'preCommit' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') out.list = true;
    else if (a === '--strict') out.strict = true;
    else if (a === '--rung') out.rung = argv[++i];
    else if (a === '--app') out.app = argv[++i];
    else if (a === '--phase') out.phase = argv[++i];
    else if (a === '--help' || a === '-h') usage(0);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    for (const rung of ladder.rungs) {
      console.log(
        `${rung.id.padEnd(18)} hard=${String(rung.hardBlock).padEnd(5)} ${rung.name}`
      );
    }
    process.exit(0);
  }

  if (!args.rung) usage(2);
  const rung = ladder.rungs.find(r => r.id === args.rung);
  if (!rung) {
    console.error(`[gate-ladder] unknown rung: ${args.rung}`);
    process.exit(2);
  }

  const phase = rung[args.phase];
  if (phase == null) {
    console.log(
      `[gate-ladder] rung ${rung.id} has no ${args.phase} command — skip`
    );
    process.exit(0);
  }

  const command = phase[args.app];
  if (!command) {
    console.log(
      `[gate-ladder] rung ${rung.id} has no ${args.phase} adapter for ${args.app} — skip`
    );
    process.exit(0);
  }

  // Only execute real shell commands (not prose descriptions used for PR mapping).
  const executable =
    command.startsWith('bash ') ||
    command.startsWith('pnpm ') ||
    command.startsWith('node ');

  if (!executable) {
    console.log(
      `[gate-ladder] ${rung.id}/${args.phase}/${args.app}: documented mapping only → ${command}`
    );
    process.exit(0);
  }

  console.log(`[gate-ladder] running ${rung.id}: ${command}`);
  const result = spawnSync(command, {
    shell: true,
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  const code = result.status ?? 1;
  if (code !== 0 && !rung.hardBlock && !args.strict) {
    console.warn(
      `[gate-ladder] advisory rung ${rung.id} failed (exit ${code}) — not blocking`
    );
    process.exit(0);
  }
  process.exit(code);
}

main();
