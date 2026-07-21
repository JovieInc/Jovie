#!/usr/bin/env node
/**
 * Chromatic free-tier budget telemetry + throttle enforcement (Phase 2/3).
 *
 * Free plan: 5,000 billed snapshots / month. Never auto-upgrade.
 * Policy (docs/VISUAL_TESTING_POLICY.md):
 *   - 80% monthly usage → stop nonessential Chromatic runs
 *   - 100% (exhaustion) → fall back to local Playwright screenshot diffs
 *
 * Usage:
 *   node scripts/chromatic-budget.mjs status
 *   node scripts/chromatic-budget.mjs check [--usage N] [--plan free]
 *   node scripts/chromatic-budget.mjs record --snapshots N [--pr N]
 *   node scripts/chromatic-budget.mjs decide   # prints allow|throttle|fallback JSON
 *
 * Inputs (priority order for current usage):
 *   1. --usage flag
 *   2. CHROMATIC_MONTHLY_USAGE env
 *   3. Sum of recorded PR snapshot counts in state file for the current UTC month
 *
 * Exit codes:
 *   0 — under budget (or throttle advisory with --allow-throttle)
 *   2 — at/above 80% nonessential stop (throttle)
 *   3 — at/above 100% fallback required
 *   1 — invalid args / config error
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const STATE_PATH = join(REPO_ROOT, 'scripts/chromatic-budget.state.json');
const DEFAULT_MONTHLY_LIMIT = 5000;
const THROTTLE_RATIO = 0.8;

/** Never configure a paid plan upgrade path from this script. */
const ALLOWED_PLANS = new Set(['free']);

export function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function loadState(path = STATE_PATH) {
  if (!existsSync(path)) {
    return {
      schemaVersion: 1,
      plan: 'free',
      monthlyLimit: DEFAULT_MONTHLY_LIMIT,
      months: {},
    };
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function saveState(state, path = STATE_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function validateState(state) {
  const errors = [];
  if (!state || typeof state !== 'object') {
    return { ok: false, errors: ['state must be an object'] };
  }
  if (state.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!ALLOWED_PLANS.has(state.plan)) {
    errors.push(
      `plan must be one of ${[...ALLOWED_PLANS].join(', ')} — paid upgrades are never auto-configured`
    );
  }
  if (
    typeof state.monthlyLimit !== 'number' ||
    state.monthlyLimit !== DEFAULT_MONTHLY_LIMIT
  ) {
    // Free tier is fixed; refuse higher limits that would imply a paid plan.
    if (state.monthlyLimit > DEFAULT_MONTHLY_LIMIT) {
      errors.push(
        `monthlyLimit ${state.monthlyLimit} exceeds free-tier ${DEFAULT_MONTHLY_LIMIT}; refuse paid upgrade path`
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

export function sumMonthUsage(state, key = monthKey()) {
  const month = state.months?.[key];
  if (!month) return 0;
  if (typeof month.usage === 'number') return month.usage;
  const records = Array.isArray(month.records) ? month.records : [];
  return records.reduce((sum, r) => sum + (Number(r.snapshots) || 0), 0);
}

/**
 * @returns {{ action: 'allow' | 'throttle' | 'fallback', usage, limit, ratio, throttleAt, message }}
 */
export function decideBudget({
  usage,
  limit = DEFAULT_MONTHLY_LIMIT,
  throttleRatio = THROTTLE_RATIO,
} = {}) {
  if (typeof usage !== 'number' || usage < 0 || !Number.isFinite(usage)) {
    throw new Error(`usage must be a non-negative number; got ${usage}`);
  }
  if (typeof limit !== 'number' || limit <= 0) {
    throw new Error(`limit must be a positive number; got ${limit}`);
  }
  const ratio = usage / limit;
  const throttleAt = Math.floor(limit * throttleRatio);
  if (usage >= limit) {
    return {
      action: 'fallback',
      usage,
      limit,
      ratio,
      throttleAt,
      message: `Chromatic free tier exhausted (${usage}/${limit}). Fall back to local Playwright screenshot diffs. Do NOT auto-upgrade.`,
    };
  }
  if (usage >= throttleAt) {
    return {
      action: 'throttle',
      usage,
      limit,
      ratio,
      throttleAt,
      message: `Chromatic free tier ≥80% (${usage}/${limit}). Stop nonessential Chromatic runs; keep required merge-queue lanes only.`,
    };
  }
  return {
    action: 'allow',
    usage,
    limit,
    ratio,
    throttleAt,
    message: `Chromatic budget ok (${usage}/${limit}, ${Math.round(ratio * 100)}%).`,
  };
}

export function recordSnapshots(state, { snapshots, pr, now = new Date() }) {
  if (!Number.isInteger(snapshots) || snapshots < 0) {
    throw new Error('snapshots must be a non-negative integer');
  }
  const key = monthKey(now);
  const months = { ...(state.months || {}) };
  const month = months[key] || { records: [], usage: 0 };
  const records = Array.isArray(month.records) ? [...month.records] : [];
  records.push({
    snapshots,
    pr: pr ?? null,
    at: now.toISOString(),
  });
  const usage = records.reduce((sum, r) => sum + (Number(r.snapshots) || 0), 0);
  months[key] = { records, usage };
  return {
    ...state,
    schemaVersion: 1,
    plan: 'free',
    monthlyLimit: DEFAULT_MONTHLY_LIMIT,
    months,
  };
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--usage') args.usage = Number(argv[++i]);
    else if (a === '--snapshots') args.snapshots = Number(argv[++i]);
    else if (a === '--pr') args.pr = argv[++i];
    else if (a === '--plan') args.plan = argv[++i];
    else if (a === '--allow-throttle') args.allowThrottle = true;
    else if (a === '--json') args.json = true;
    else if (a.startsWith('-')) {
      throw new Error(`unknown flag: ${a}`);
    } else args._.push(a);
  }
  return args;
}

function resolveUsage(args, state) {
  if (typeof args.usage === 'number' && Number.isFinite(args.usage)) {
    return args.usage;
  }
  if (process.env.CHROMATIC_MONTHLY_USAGE) {
    const n = Number(process.env.CHROMATIC_MONTHLY_USAGE);
    if (Number.isFinite(n)) return n;
  }
  return sumMonthUsage(state);
}

function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    return 1;
  }
  const cmd = args._[0] ?? 'status';
  const state = loadState();
  const validation = validateState(state);
  if (!validation.ok && cmd !== 'record') {
    console.error(validation.errors.join('\n'));
    return 1;
  }

  if (args.plan && !ALLOWED_PLANS.has(args.plan)) {
    console.error(
      `Refusing plan="${args.plan}". Only free tier is allowed; paid upgrades require explicit human approval.`
    );
    return 1;
  }

  if (cmd === 'record') {
    if (!Number.isInteger(args.snapshots) || args.snapshots < 0) {
      console.error('--snapshots N is required (non-negative integer)');
      return 1;
    }
    const next = recordSnapshots(state, {
      snapshots: args.snapshots,
      pr: args.pr ?? process.env.GITHUB_PR_NUMBER ?? null,
    });
    saveState(next);
    const usage = sumMonthUsage(next);
    const decision = decideBudget({ usage, limit: next.monthlyLimit });
    if (args.json) {
      console.log(JSON.stringify({ recorded: args.snapshots, ...decision }, null, 2));
    } else {
      console.log(`recorded ${args.snapshots} snapshots; ${decision.message}`);
    }
    return 0;
  }

  const usage = resolveUsage(args, state);
  const limit = state.monthlyLimit || DEFAULT_MONTHLY_LIMIT;
  const decision = decideBudget({ usage, limit });

  if (cmd === 'status' || cmd === 'decide') {
    if (args.json || cmd === 'decide') {
      console.log(JSON.stringify(decision, null, 2));
    } else {
      console.log(decision.message);
      console.log(
        `action=${decision.action} throttleAt=${decision.throttleAt} limit=${decision.limit}`
      );
    }
    return 0;
  }

  if (cmd === 'check') {
    if (args.json) console.log(JSON.stringify(decision, null, 2));
    else console.log(decision.message);

    if (decision.action === 'fallback') return 3;
    if (decision.action === 'throttle') {
      // Required merge-queue Chromatic may still run; nonessential must stop.
      // Default: exit 2 so scheduled/exploratory jobs fail closed.
      // Set --allow-throttle (or CHROMATIC_ALLOW_THROTTLE=1) for required lanes.
      if (args.allowThrottle || process.env.CHROMATIC_ALLOW_THROTTLE === '1') {
        console.log(
          'throttle allowed for required lane (CHROMATIC_ALLOW_THROTTLE / --allow-throttle)'
        );
        return 0;
      }
      return 2;
    }
    return 0;
  }

  console.error(`unknown command: ${cmd}`);
  return 1;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.exit(main());
}
