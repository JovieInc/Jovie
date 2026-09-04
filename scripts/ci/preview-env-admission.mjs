#!/usr/bin/env node

/**
 * Preview-env admission/cleanup receipt CLI (JOV-5941).
 *
 * Emits canonical admission records when a hosted Vercel preview or ephemeral
 * Neon branch is admitted, and cleanup receipts when it is torn down. Both
 * records are validated by the canonical contract in
 * scripts/lib/preview-env-contract.mjs — a contract violation exits 1.
 *
 * Usage:
 *   preview-env-admission.mjs emit-admission --kind <neon-branch|vercel-preview> \
 *     --work-id <JOV-1234> --sha <40-hex> --policy <policy> --reason <text> \
 *     --evidence <text> --owner <owner> --surface <surface> \
 *     --environment <name> --ttl-hours <n> --cleanup-trigger <trigger> \
 *     --cleanup-proof <text> --cost-budget <text> [--out <path>]
 *   preview-env-admission.mjs emit-cleanup --kind <kind> --environment <name> \
 *     --cleanup-trigger <trigger> --proof <text> --cleaned-by <workflow> \
 *     [--work-id <id>] [--sha <40-hex>] [--out <path>]
 */

import { appendFileSync, writeFileSync } from 'node:fs';

import {
  buildPreviewEnvAdmission,
  buildPreviewEnvCleanupReceipt,
  PREVIEW_ENV_ADMISSION_SCHEMA,
  PREVIEW_ENV_CLEANUP_SCHEMA,
} from '../lib/preview-env-contract.mjs';

const USAGE = `Usage:
  preview-env-admission.mjs emit-admission --kind <neon-branch|vercel-preview> \\
    --work-id <JOV-1234> --sha <40-hex> --policy <policy> --reason <text> \\
    --evidence <text> --owner <owner> --surface <surface> \\
    --environment <name> --ttl-hours <n> --cleanup-trigger <trigger> \\
    --cleanup-proof <text> --cost-budget <text> [--out <path>]
  preview-env-admission.mjs emit-cleanup --kind <neon-branch|vercel-preview> \\
    --environment <name> --cleanup-trigger <trigger> --proof <text> \\
    --cleaned-by <workflow> [--work-id <id>] [--sha <40-hex>] [--out <path>]

Both subcommands print the record JSON to stdout, write it to --out when
given, and append a Markdown section to $GITHUB_STEP_SUMMARY when set.
Exit codes: 0 success, 1 contract violation, 2 usage error.`;

const ADMISSION_FLAGS = [
  'kind',
  'work-id',
  'sha',
  'policy',
  'reason',
  'evidence',
  'owner',
  'surface',
  'environment',
  'ttl-hours',
  'cleanup-trigger',
  'cleanup-proof',
  'cost-budget',
  'out',
];

const CLEANUP_FLAGS = [
  'kind',
  'environment',
  'cleanup-trigger',
  'proof',
  'cleaned-by',
  'work-id',
  'sha',
  'out',
];

export function parseFlags(argv, allowedFlags) {
  const flags = {};
  const allowed = new Set(allowedFlags);
  const problems = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      return { flags, help: true, problems };
    }
    if (!arg.startsWith('--')) {
      problems.push(`unexpected positional argument: ${arg}`);
      continue;
    }
    const name = arg.slice(2);
    if (!allowed.has(name)) {
      problems.push(`unknown flag: --${name}`);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      problems.push(`flag --${name} requires a value`);
      continue;
    }
    flags[name] = value;
    index += 1;
  }
  return { flags, help: false, problems };
}

export function buildAdmissionFromFlags(flags, { now = Date.now() } = {}) {
  const ttlHours = Number(flags['ttl-hours']);
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) {
    throw new Error(
      'Invalid preview-env admission: --ttl-hours must be a positive number'
    );
  }
  return buildPreviewEnvAdmission({
    kind: flags.kind,
    workId: flags['work-id'],
    sha: flags.sha,
    policy: flags.policy,
    reason: flags.reason,
    requiredEvidence: flags.evidence,
    owner: flags.owner,
    surface: flags.surface,
    environment: flags.environment,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlHours * 60 * 60 * 1000).toISOString(),
    cleanupTrigger: flags['cleanup-trigger'],
    cleanupProof: flags['cleanup-proof'],
    costBudget: flags['cost-budget'],
  });
}

export function buildCleanupReceiptFromFlags(flags, { now = Date.now() } = {}) {
  const fields = {
    kind: flags.kind,
    environment: flags.environment,
    cleanupTrigger: flags['cleanup-trigger'],
    cleanedAt: new Date(now).toISOString(),
    cleanupProof: flags.proof,
    cleanedBy: flags['cleaned-by'],
  };
  if (flags['work-id']) fields.workId = flags['work-id'];
  if (flags.sha) fields.sha = flags.sha;
  return buildPreviewEnvCleanupReceipt(fields);
}

function emitRecord(record, schemaName, outPath) {
  const json = JSON.stringify(record, null, 2);
  if (outPath) {
    writeFileSync(outPath, `${json}\n`, 'utf8');
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Preview Env Receipt (\`${schemaName}\`)\n\n\`\`\`json\n${json}\n\`\`\`\n\n`,
      'utf8'
    );
  }
  console.log(json);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') {
    console.error(USAGE);
    process.exitCode = command ? 0 : 2;
    return;
  }

  if (command === 'emit-admission') {
    const { flags, help, problems } = parseFlags(rest, ADMISSION_FLAGS);
    if (help) {
      console.error(USAGE);
      return;
    }
    if (problems.length > 0) {
      console.error(problems.join('\n'));
      console.error(USAGE);
      process.exitCode = 2;
      return;
    }
    try {
      const record = buildAdmissionFromFlags(flags);
      emitRecord(record, PREVIEW_ENV_ADMISSION_SCHEMA, flags.out);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'emit-cleanup') {
    const { flags, help, problems } = parseFlags(rest, CLEANUP_FLAGS);
    if (help) {
      console.error(USAGE);
      return;
    }
    if (problems.length > 0) {
      console.error(problems.join('\n'));
      console.error(USAGE);
      process.exitCode = 2;
      return;
    }
    try {
      const record = buildCleanupReceiptFromFlags(flags);
      emitRecord(record, PREVIEW_ENV_CLEANUP_SCHEMA, flags.out);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    return;
  }

  console.error(`unknown subcommand: ${command}`);
  console.error(USAGE);
  process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
