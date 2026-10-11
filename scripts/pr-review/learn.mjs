#!/usr/bin/env node
// Self-learning loop for review model routing (run weekly by
// .github/workflows/pr-review-learn.yml). Mines labelled cases from git
// history, replays the review kernel on them within a budget, scores the
// results and merges per-case outcomes into the model-outcomes/v1 ledger that
// ./rank.mjs reads through PR_REVIEW_OUTCOMES.
//
// Usage: node scripts/pr-review/learn.mjs --ledger-in <path?> --ledger-out <path>
//        [--workdir <dir>] [--budget-usd 5] [--days 120] [--max 40] [--ref HEAD]

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { emptyLedger, mergeLedger } from './ledger.mjs';
import { DEFAULT_MINE_OPTIONS, mineSeeds } from './mine-seeds.mjs';
import { rankReviewModels, selectRoutes } from './models.mjs';
import { loadOutcomes, loadRegistry } from './rank.mjs';
import { outcomesFromCases, scoreReplay } from './replay.mjs';
import { DEFAULT_RUN_LIMITS } from './run.mjs';

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL('./cli.mjs', import.meta.url));

export const EXPLORATION_RATE = 0.1;

/**
 * Deterministic exploration: about 10% of cases pin the second-ranked
 * discovery model so challengers keep getting measured.
 */
export function explorationPins(caseId, rankings, rate = EXPLORATION_RATE) {
  const bucket =
    createHash('sha256').update(caseId).digest().readUInt32BE(0) / 0xffffffff;
  const challenger = rankings.discovery.ranked[1];
  if (bucket >= rate || !challenger) return {};
  return { PR_REVIEW_DISCOVERY_MODEL: challenger.model };
}

/**
 * Replay one case through cli.mjs in replay mode; returns its receipt or null.
 * @param {{id: string, pr: number, baseSha: string, headSha: string}} entry
 * @param {{workdir: string, env: NodeJS.ProcessEnv, limitUsd?: number,
 *   run?: (file: string, args: readonly string[], options: {env: NodeJS.ProcessEnv, timeout: number}) => Promise<unknown>}} options
 */
export async function replayCase(
  entry,
  { workdir, env, limitUsd = DEFAULT_RUN_LIMITS.budgetUsd, run = execFileAsync }
) {
  if (
    !Number.isFinite(limitUsd) ||
    limitUsd < 0 ||
    limitUsd > DEFAULT_RUN_LIMITS.budgetUsd
  )
    throw new Error('replay budget must stay within the kernel cap');
  if (typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(entry.id))
    throw new Error('invalid replay case identity');
  const out = join(workdir, `${entry.id}.json`);
  rmSync(out, { force: true });
  try {
    await run(process.execPath, [CLI], {
      env: {
        ...env,
        PR_NUMBER: String(entry.pr),
        REPLAY_BASE_SHA: entry.baseSha,
        REPLAY_HEAD_SHA: entry.headSha,
        OUT: out,
        PR_REVIEW_REPLAY_BUDGET_USD: String(limitUsd),
      },
      timeout: 10 * 60 * 1000,
    });
  } catch {
    return null;
  }
  if (!existsSync(out)) return null;
  try {
    const receipt = JSON.parse(readFileSync(out, 'utf8'));
    return receipt?.schema === 'pr-review-receipt/v1' &&
      receipt.pr === entry.pr &&
      receipt.baseSha === entry.baseSha &&
      receipt.headSha === entry.headSha
      ? receipt
      : null;
  } catch {
    return null;
  }
}

/** Run cases until the budget is spent; returns scored cases with receipts. */
export async function replayWithinBudget(
  cases,
  { budgetUsd, replay, pinsFor }
) {
  if (!Number.isFinite(budgetUsd) || budgetUsd < 0)
    throw new Error('invalid replay budget');
  const done = [];
  let spent = 0;
  let held = null;
  for (const entry of cases) {
    if (spent >= budgetUsd) break;
    const capUsd = Math.min(DEFAULT_RUN_LIMITS.budgetUsd, budgetUsd - spent);
    const pins = pinsFor(entry);
    spent += capUsd; // Reserve before dispatch; ambiguous failure never refunds it.
    let receipt;
    try {
      receipt = await replay(entry, pins, capUsd);
    } catch {
      held = 'replay-transport-unverified';
      break;
    }
    const usd = receipt?.spend?.usd;
    if (
      !Number.isFinite(usd) ||
      usd < 0 ||
      !['complete', 'incomplete'].includes(receipt?.status)
    ) {
      held = 'replay-receipt-unverified';
      break;
    }
    if (
      usd > capUsd + 1e-9 ||
      (receipt.spend.capUsd !== undefined &&
        (!Number.isFinite(receipt.spend.capUsd) ||
          receipt.spend.capUsd > capUsd + 1e-9))
    ) {
      spent += Math.max(0, usd - capUsd);
      held = 'replay-cap-exceeded';
      break;
    }
    if (
      receipt.status !== 'complete' &&
      !(receipt.failure === 'no-key' && usd === 0)
    ) {
      held = 'replay-receipt-unverified';
      break;
    }
    spent += usd - capUsd;
    done.push({ ...entry, receipt });
  }
  return { done, spent, held };
}

export function renderScorecard(score, ledger, sensitivity = []) {
  const rows = Object.entries(ledger.outcomes).flatMap(([model, byCap]) =>
    Object.entries(byCap).map(
      ([cap, r]) =>
        `| ${model} | ${cap} | ${r.attempts} | ${(r.successes / r.attempts).toFixed(2)} |`
    )
  );
  const fmt = value => (value === null ? 'n/a' : String(value));
  return [
    '### PR review learn loop',
    '',
    `Cases this run: ${score.cases}. Precision ${fmt(score.precision)}, recall ${fmt(score.recall)}, clean-PR false-alarm rate ${fmt(score.cleanFalseAlarmRate)}, incomplete ${fmt(score.incompleteRate)}, spend $${score.usdTotal}.`,
    '',
    '| Router model | Capability | Attempts (all runs) | Success rate |',
    '|---|---|---|---|',
    ...rows,
    '',
    ...(sensitivity.length
      ? [
          '| Failure cost | Discovery pick | Verification pick |',
          '|---|---|---|',
          ...sensitivity.map(
            s => `| $${s.failureCost} | ${s.discovery} | ${s.verification} |`
          ),
        ]
      : []),
  ].join('\n');
}

function parseArgs(argv) {
  /** @type {import('./mine-seeds.mjs').MineOptions & {budgetUsd: number, workdir: string, ledgerIn?: string, ledgerOut?: string}} */
  const args = {
    budgetUsd: 5,
    workdir: 'pr-review-learn',
    ...DEFAULT_MINE_OPTIONS,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const next = () => argv[++i];
    if (argv[i] === '--ledger-in') args.ledgerIn = next();
    if (argv[i] === '--ledger-out') args.ledgerOut = next();
    if (argv[i] === '--workdir') args.workdir = next();
    if (argv[i] === '--budget-usd') args.budgetUsd = Number(next());
    if (argv[i] === '--days') args.days = Number(next());
    if (argv[i] === '--max') args.maxCases = Number(next());
    if (argv[i] === '--ref') args.ref = next();
  }
  if (!args.ledgerOut) throw new Error('--ledger-out is required');
  return args;
}

/** Which pair the ranking would pick at other failure costs, on the new ledger. */
export function sensitivityRows(outcomes, registry = loadRegistry()) {
  return [1, 5, 25].map(failureCost => {
    const variant = structuredClone(registry);
    variant.routing_policy.failure_cost_usd = {
      review: failureCost,
      'review-verify': failureCost,
    };
    try {
      const { routes } = selectRoutes(
        rankReviewModels({ registry: variant, outcomes })
      );
      return { failureCost, ...routes };
    } catch {
      return { failureCost, discovery: 'none', verification: 'none' };
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  mkdirSync(args.workdir, { recursive: true });
  const previous =
    args.ledgerIn && existsSync(args.ledgerIn)
      ? JSON.parse(readFileSync(args.ledgerIn, 'utf8'))
      : emptyLedger();
  const previousPath = join(args.workdir, 'ledger-previous.json');
  writeFileSync(previousPath, JSON.stringify(previous));
  const env = { ...process.env, PR_REVIEW_OUTCOMES: previousPath };

  const { defects, clean } = await mineSeeds({
    options: {
      ...DEFAULT_MINE_OPTIONS,
      days: args.days,
      maxCases: args.maxCases,
      ref: args.ref,
    },
  });
  const rankings = rankReviewModels({ outcomes: previous.outcomes ?? {} });
  const { done, spent, held } = await replayWithinBudget(
    [...defects, ...clean],
    {
      budgetUsd: args.budgetUsd,
      pinsFor: entry => explorationPins(entry.id, rankings),
      replay: (entry, pins, limitUsd) =>
        replayCase(entry, {
          workdir: args.workdir,
          env: { ...env, ...pins },
          limitUsd,
        }),
    }
  );

  const updates = {};
  for (const entry of done) {
    updates[entry.id] = {
      headSha: entry.headSha,
      clean: Boolean(entry.clean),
      outcomes: outcomesFromCases([entry]),
    };
  }
  const ledger = mergeLedger(previous, updates);
  writeFileSync(args.ledgerOut, `${JSON.stringify(ledger, null, 2)}\n`);
  const score = scoreReplay(done);
  const card =
    renderScorecard(
      score,
      ledger,
      sensitivityRows(loadOutcomes(args.ledgerOut))
    ) +
    `\nBudget charged/reserved: $${spent.toFixed(6)}. Hold: ${held ?? 'none'}.\n`;
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${card}\n`, { flag: 'a' });
  }
  process.stdout.write(`${card}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    process.stderr.write(
      `pr-review learn: failed (${error?.name ?? 'Error'})\n`
    );
    process.exitCode = 1;
  });
}
