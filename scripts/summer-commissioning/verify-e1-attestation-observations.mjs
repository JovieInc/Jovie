#!/usr/bin/env node
/**
 * Post-install E1 proof: two ≤600s runner-source observations evaluated with
 * Summer's real attestation + governed-dispatch predicates.
 *
 * Usage:
 *   node scripts/summer-commissioning/verify-e1-attestation-observations.mjs --self-test
 *   node scripts/summer-commissioning/verify-e1-attestation-observations.mjs \
 *     --observation-a /path/to/obs-a.json --observation-b /path/to/obs-b.json
 *
 * Exit 0 = pass; 2 = observations failed gate; 78 = usage / not configured.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const evePilot = resolve(root, 'apps/eve-pilot');
const runner = resolve(
  evePilot,
  'scripts/verify-e1-attestation-observations.ts'
);
const receiptPath =
  '/opt/cursor/artifacts/e1-attestation-observations-receipt.json';

function usage() {
  console.error(`Usage:
  node scripts/summer-commissioning/verify-e1-attestation-observations.mjs --self-test
  node scripts/summer-commissioning/verify-e1-attestation-observations.mjs \\
    --observation-a <file.json> --observation-b <file.json>
`);
}

function parseArgs(argv) {
  const out = {
    selfTest: false,
    observationA: null,
    observationB: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--self-test') out.selfTest = true;
    else if (arg === '--observation-a') out.observationA = argv[++i];
    else if (arg === '--observation-b') out.observationB = argv[++i];
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(String(error));
  usage();
  process.exit(78);
}

if (args.help) {
  usage();
  process.exit(78);
}

const env = { ...process.env };

if (args.selfTest) {
  env.E1_GATE_MODE = 'self-test';
} else {
  if (!args.observationA || !args.observationB) {
    usage();
    console.error(
      'E1 not configured: provide --self-test or both observation files.'
    );
    process.exit(78);
  }
  env.E1_GATE_MODE = 'live';
  env.E1_OBS_A_PATH = resolve(args.observationA);
  env.E1_OBS_B_PATH = resolve(args.observationB);
}

const result = spawnSync('pnpm', ['exec', 'tsx', runner], {
  cwd: evePilot,
  env,
  encoding: 'utf8',
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status === 0) {
  console.log(`PASS: E1 observation gate (receipt: ${receiptPath})`);
}
process.exit(result.status ?? 1);
