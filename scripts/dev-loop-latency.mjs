#!/usr/bin/env node
// Dev-loop latency ratchet: times every rung of .husky/pre-commit (parsed from
// the hook, so new rungs are covered automatically) plus the pre-push
// publication gate against a one-line change to an ordinary web file, and
// fails when a rung exceeds its budget. Catches gates that do whole-repo work
// for unrelated changes (e.g. skill-governance copying 13k files per commit).
//
// Usage: node scripts/dev-loop-latency.mjs   (requires a clean tracked tree)
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const PROBE_FILE = 'apps/web/lib/utils.ts';

// ponytail: flat budgets with ~2x headroom over hosted-runner timings; move to
// a lockfile like .github/ci-harness/duration-ratchet.json if tuning gets busy.
export const BUDGETS = Object.freeze({
  stepSeconds: 10,
  stepOverrides: Object.freeze({ 'pnpm exec lint-staged': 20 }),
  preCommitTotalSeconds: 45,
});

export const PRE_PUSH_STEP = 'bash scripts/hooks/pre-push-gate.sh publication';

/** Top-level command lines of a hook script (conditional blocks are skipped). */
export function parseHookSteps(source) {
  return source
    .split('\n')
    .filter(line => /^(bash|node|pnpm|npx) /.test(line))
    .map(line => line.trim());
}

export function evaluateBudgets(results, budgets = BUDGETS) {
  const breaches = [];
  for (const { step, seconds, code } of results) {
    if (code !== 0) breaches.push(`${step}: exited ${code}`);
    const budget = budgets.stepOverrides[step] ?? budgets.stepSeconds;
    if (seconds > budget) {
      breaches.push(`${step}: ${seconds.toFixed(1)}s > ${budget}s budget`);
    }
  }
  const total = results
    .filter(r => r.step !== PRE_PUSH_STEP)
    .reduce((sum, r) => sum + r.seconds, 0);
  if (total > budgets.preCommitTotalSeconds) {
    breaches.push(
      `pre-commit total: ${total.toFixed(1)}s > ${budgets.preCommitTotalSeconds}s budget`
    );
  }
  return { breaches, total };
}

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

function timeStep(step) {
  const start = process.hrtime.bigint();
  const run = spawnSync('bash', ['-c', step], { cwd: ROOT, encoding: 'utf8' });
  const seconds = Number(process.hrtime.bigint() - start) / 1e9;
  return {
    step,
    seconds,
    code: run.status ?? 1,
    output: run.stdout + run.stderr,
  };
}

function main() {
  if (git('status', '--porcelain', '--untracked-files=no').trim()) {
    console.error('[dev-loop-latency] needs a clean tracked tree; aborting');
    process.exit(2);
  }
  if (!existsSync(resolve(ROOT, PROBE_FILE))) {
    console.error(`[dev-loop-latency] probe file ${PROBE_FILE} is missing`);
    process.exit(2);
  }

  const steps = parseHookSteps(
    readFileSync(resolve(ROOT, '.husky/pre-commit'), 'utf8')
  );
  const results = [];
  appendFileSync(resolve(ROOT, PROBE_FILE), '// dev-loop-latency probe\n');
  try {
    git('add', '--', PROBE_FILE);
    for (const step of steps) results.push(timeStep(step));
  } finally {
    git('restore', '--staged', '--worktree', '--', PROBE_FILE);
  }
  results.push(timeStep(PRE_PUSH_STEP));

  const { breaches, total } = evaluateBudgets(results);
  const rows = results.map(r => {
    const budget = BUDGETS.stepOverrides[r.step] ?? BUDGETS.stepSeconds;
    const ok = r.code === 0 && r.seconds <= budget ? '✅' : '❌';
    return `| \`${r.step}\` | ${r.seconds.toFixed(1)}s | ${budget}s | ${ok} |`;
  });
  const report = [
    '## Dev-loop latency (pre-commit + pre-push)',
    '',
    '| Step | Time | Budget | |',
    '| --- | ---: | ---: | --- |',
    ...rows,
    `| **pre-commit total** | ${total.toFixed(1)}s | ${BUDGETS.preCommitTotalSeconds}s | ${total <= BUDGETS.preCommitTotalSeconds ? '✅' : '❌'} |`,
    '',
    breaches.length
      ? `**Breaches:**\n${breaches.map(b => `- ${b}`).join('\n')}`
      : 'All steps within budget.',
    '',
  ].join('\n');
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  }
  for (const r of results.filter(r => r.code !== 0)) {
    console.error(`--- ${r.step} output ---\n${r.output.slice(-2000)}`);
  }
  if (breaches.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
