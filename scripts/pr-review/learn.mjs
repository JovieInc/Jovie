#!/usr/bin/env node
// Self-learning loop for review model routing (run weekly by
// .github/workflows/pr-review-learn.yml). Mines labelled cases from git
// history, replays the review kernel on them within a budget, scores the
// results and merges per-case outcomes into the model-outcomes/v1 ledger that
// the canonical router reads through GEM_MODEL_OUTCOMES.
//
// Usage: node scripts/pr-review/learn.mjs --ledger-in <path?> --ledger-out <path>
//        [--workdir <dir>] [--budget-usd 5] [--days 120] [--max 40] [--ref HEAD]

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { emptyLedger, mergeLedger } from './ledger.mjs';
import { DEFAULT_MINE_OPTIONS, mineSeeds } from './mine-seeds.mjs';
import { fetchRankings } from './models.mjs';
import { outcomesFromCases, scoreReplay } from './replay.mjs';

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

/** Replay one case through cli.mjs in replay mode; returns its receipt or null. */
export async function replayCase(entry, { workdir, env, run = execFileAsync }) {
  const out = join(workdir, `${entry.id}.json`);
  try {
    await run(process.execPath, [CLI], {
      env: {
        ...env,
        PR_NUMBER: String(entry.pr),
        REPLAY_BASE_SHA: entry.baseSha,
        REPLAY_HEAD_SHA: entry.headSha,
        OUT: out,
      },
      timeout: 10 * 60 * 1000,
    });
  } catch {
    return null;
  }
  return existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
}

/** Run cases until the budget is spent; returns scored cases with receipts. */
export async function replayWithinBudget(
  cases,
  { budgetUsd, replay, pinsFor }
) {
  const done = [];
  let spent = 0;
  for (const entry of cases) {
    if (spent >= budgetUsd) break;
    const receipt = await replay(entry, pinsFor(entry));
    if (!receipt) continue;
    spent += receipt.spend?.usd ?? 0;
    done.push({ ...entry, receipt });
  }
  return { done, spent };
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

async function sensitivityRows(ledgerPath) {
  const { selectRoutes } = await import('./models.mjs');
  const registry = JSON.parse(
    readFileSync(
      new URL('../symphony/config/model-registry.json', import.meta.url),
      'utf8'
    )
  );
  const rows = [];
  for (const failureCost of [1, 5, 25]) {
    const variant = structuredClone(registry);
    variant.routing_policy.failure_cost_usd = {
      review: failureCost,
      'review-verify': failureCost,
    };
    const path = join(
      process.env.RUNNER_TEMP ?? '/tmp',
      `registry-fc-${failureCost}.json`
    );
    writeFileSync(path, JSON.stringify(variant));
    const run = (cmd, argv) =>
      execFileAsync(cmd, argv, {
        env: {
          ...process.env,
          GEM_MODEL_REGISTRY: path,
          GEM_MODEL_OUTCOMES: ledgerPath,
        },
      });
    try {
      const { routes } = selectRoutes(await fetchRankings({ run }));
      rows.push({ failureCost, ...routes });
    } catch {
      rows.push({ failureCost, discovery: 'none', verification: 'none' });
    }
  }
  return rows;
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
  const env = { ...process.env, GEM_MODEL_OUTCOMES: previousPath };

  const { defects, clean } = await mineSeeds({
    options: {
      ...DEFAULT_MINE_OPTIONS,
      days: args.days,
      maxCases: args.maxCases,
      ref: args.ref,
    },
  });
  const rankings = await fetchRankings({
    run: (cmd, argv) => execFileAsync(cmd, argv, { env }),
  });
  const { done } = await replayWithinBudget([...defects, ...clean], {
    budgetUsd: args.budgetUsd,
    pinsFor: entry => explorationPins(entry.id, rankings),
    replay: (entry, pins) =>
      replayCase(entry, { workdir: args.workdir, env: { ...env, ...pins } }),
  });

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
  const card = renderScorecard(
    score,
    ledger,
    await sensitivityRows(args.ledgerOut)
  );
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
