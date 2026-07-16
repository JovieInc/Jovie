#!/usr/bin/env node
/**
 * Agent-local verification receipt.
 *
 * Usage: pnpm ship:verify -- [--base origin/main] [--dry-run] [--with-performance] [--out path]
 *
 * This shortens the feedback loop for shippers; CI still independently verifies
 * the same change in a clean environment.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  classifyCiRisk,
  loadCiHarnessManifest,
  riskLocalCommands,
} from './lib/ci-control-plane.mjs';

function value(args, flag, fallback) {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
}

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function run(command, dryRun) {
  const startedAt = new Date().toISOString();
  if (dryRun)
    return { command, status: 'skipped', startedAt, finishedAt: startedAt };
  const result = spawnSync(command, {
    cwd: process.cwd(),
    shell: true,
    stdio: 'inherit',
  });
  return {
    command,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status ?? 1,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

const args = process.argv.slice(2);
const base = value(
  args,
  '--base',
  process.env.SHIP_VERIFY_BASE ?? 'origin/main'
);
const out = resolve(value(args, '--out', 'artifacts/verification/result.json'));
const dryRun = args.includes('--dry-run');
const withPerformance = args.includes('--with-performance');
const head = git(['rev-parse', 'HEAD']);
const changedFiles = [
  ...new Set(
    [
      ...git(['diff', '--name-only', `${base}...HEAD`]).split('\n'),
      ...git(['diff', '--name-only']).split('\n'),
      ...git(['diff', '--cached', '--name-only']).split('\n'),
    ].filter(Boolean)
  ),
].sort();
const manifest = loadCiHarnessManifest();
const risk = classifyCiRisk(changedFiles, manifest, { diffBase: base });
const commands = [
  ...new Set([
    'bash scripts/automation-verify.sh affected',
    ...riskLocalCommands(risk),
    ...(withPerformance ? ['pnpm --filter @jovie/web run perf:budgets'] : []),
  ]),
];
const checks = [];
for (const command of commands) {
  const result = run(command, dryRun);
  checks.push(result);
  if (result.status === 'failed') break;
}
const receipt = {
  schemaVersion: 'jovie.local-verification/v1',
  generatedAt: new Date().toISOString(),
  base,
  head,
  changedFiles,
  risk: {
    level: risk.riskLevel,
    requiresSmoke: risk.requiresSmoke,
    requiresPreview: risk.requiresPreview,
    matchedRules: risk.matchedRules.map(rule => rule.id),
  },
  checks,
  status: checks.every(check => check.status !== 'failed')
    ? 'passed'
    : 'failed',
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`ship:verify ${receipt.status}: ${out}`);
process.exitCode = receipt.status === 'passed' ? 0 : 1;
