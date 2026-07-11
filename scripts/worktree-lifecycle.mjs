#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { inventory, reap, registerWorktree } from './lib/worktree-lifecycle.mjs';

function args(argv) {
  const result = { command: argv[0] ?? 'inventory' };
  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') result.apply = true;
    else if (arg === '--report') result.report = argv[++i];
    else if (arg === '--root') result.root = argv[++i];
    else if (arg === '--owner') result.owner = argv[++i];
    else if (arg === '--run-id') result.runId = argv[++i];
    else if (arg === '--created-at') result.createdAt = argv[++i];
    else if (arg === '--named-user') result.namedUser = true;
    else if (arg === '--ttl-days') result.ttlDays = Number(argv[++i]);
    else if (arg === '--emergency-ttl-days') result.emergencyTtlDays = Number(argv[++i]);
    else if (arg === '--critical-ttl-days') result.criticalTtlDays = Number(argv[++i]);
    else if (arg === '--emergency-free-gb') result.emergencyFreeGb = Number(argv[++i]);
    else if (arg === '--critical-free-gb') result.criticalFreeGb = Number(argv[++i]);
    else if (arg === '--config') result.config = argv[++i];
    else if (!result.path) result.path = arg;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return result;
}

const options = args(process.argv.slice(2));
const configPath = options.config ?? `${options.root ?? process.cwd()}/config/worktree-lifecycle.json`;
let fileConfig = {};
try { fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { /* optional config */ }
const configPolicy = {
  ttlDays: fileConfig.ttl_days,
  emergencyTtlDays: fileConfig.emergency_ttl_days,
  criticalTtlDays: fileConfig.critical_ttl_days,
  emergencyFreeGb: fileConfig.emergency_free_gb,
  criticalFreeGb: fileConfig.critical_free_gb,
};
const policy = Object.fromEntries(Object.entries({
  ...configPolicy,
  ttlDays: options.ttlDays ?? configPolicy.ttlDays,
  emergencyTtlDays: options.emergencyTtlDays ?? configPolicy.emergencyTtlDays,
  criticalTtlDays: options.criticalTtlDays ?? configPolicy.criticalTtlDays,
  emergencyFreeGb: options.emergencyFreeGb ?? configPolicy.emergencyFreeGb,
  criticalFreeGb: options.criticalFreeGb ?? configPolicy.criticalFreeGb,
}).filter(([, value]) => Number.isFinite(value)));

let report;
if (options.command === 'register') {
  const metadata = registerWorktree(options.path ?? process.cwd(), {
    owner: options.owner,
    runId: options.runId,
    createdAt: options.createdAt,
    namedUser: options.namedUser,
  });
  report = { registered: options.path ?? process.cwd(), metadata };
} else if (options.command === 'reap') {
  report = reap(options.root ?? process.cwd(), { ...options, policy });
} else if (options.command === 'inventory') {
  report = inventory(options.root ?? process.cwd(), { ...options, policy });
} else {
  throw new Error(`command must be inventory, reap, or register; got ${options.command}`);
}

const json = `${JSON.stringify(report, null, 2)}\n`;
if (options.report) fs.writeFileSync(options.report, json, { mode: 0o600 });
process.stdout.write(json);
if (report.alert) process.stderr.write(`ALERT_SUMMER ${report.alert}: disk pressure tightened worktree TTL\n`);
