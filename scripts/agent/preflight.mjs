#!/usr/bin/env node
/**
 * scripts/agent/preflight.mjs — CLI entry (JOV-4183)
 * Collects environment facts, evaluates via preflight-lib, prints one JSON receipt.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  assembleReceipt,
  evaluateGoal,
  evaluateGstack,
  evaluateOwnership,
  evaluateWorktree,
  exitCodeForReceipt,
} from './preflight-lib.mjs';

function parseArgs(argv) {
  let task = process.env.AGENT_PREFLIGHT_TASK || '';
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--task') {
      task = argv[++i] || '';
    } else if (argv[i] === '--json-only') {
      // always json
    } else if (argv[i] === '-h' || argv[i] === '--help') {
      process.stdout.write(
        'Usage: node scripts/agent/preflight.mjs [--task "desc"]\n' +
          'Also: bash scripts/agent/preflight.sh (wrapper)\n' +
          'See scripts/agent/PREFLIGHT.md\n'
      );
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${argv[i]}`);
      process.exit(2);
    }
  }
  return { task };
}

function nowMs() {
  return Date.now();
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts.timeout ?? 15_000,
    env: opts.env ?? process.env,
    cwd: opts.cwd,
  });
  return {
    status: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error,
  };
}

function which(bin) {
  const r = run('bash', ['-lc', `command -v ${bin}`], { timeout: 3000 });
  if (r.status !== 0) return null;
  return r.stdout.trim() || null;
}

function git(args) {
  return run('git', args, { timeout: 10_000 });
}

function collectWorktree() {
  const start = nowMs();
  const top = git(['rev-parse', '--show-toplevel']);
  if (top.status !== 0) {
    return evaluateWorktree({
      isGitRepo: false,
      porcelainLineCount: 0,
      detached: false,
      branch: null,
      root: null,
      ms: nowMs() - start,
    });
  }
  const root = top.stdout.trim();
  const sym = git(['symbolic-ref', '-q', 'HEAD']);
  const detached = sym.status !== 0;
  let branch = null;
  if (detached) {
    const short = git(['rev-parse', '--short', 'HEAD']);
    branch = short.stdout.trim() || 'DETACHED';
  } else {
    const b = git(['branch', '--show-current']);
    branch = b.stdout.trim() || null;
  }
  const porcelain = git(['status', '--porcelain']);
  const lines = porcelain.stdout
    .split('\n')
    .map(l => l.trimEnd())
    .filter(Boolean);
  return evaluateWorktree({
    isGitRepo: true,
    porcelainLineCount: lines.length,
    detached,
    branch,
    root,
    ms: nowMs() - start,
  });
}

// Ownership lookup budget (JOV-4185): p95 target < 5s, hard ceiling 10s.
// A semantic/hybrid query must NEVER hang the run — every step is capped and
// the whole gate auto-falls-back when the budget is spent.
const OWNERSHIP_BUDGET_MS = Math.max(
  1_000,
  Number(process.env.AGENT_PREFLIGHT_OWNERSHIP_BUDGET_MS) || 10_000
);
const OWNERSHIP_LEDGER_PAGE =
  process.env.AGENT_PREFLIGHT_LEDGER_PAGE || 'agent-job-ledger';

function collectOwnership(task) {
  const start = nowMs();
  const gbrain = which('gbrain');
  const requireGbrain = process.env.AGENT_PREFLIGHT_REQUIRE_GBRAIN === '1';
  if (!gbrain) {
    return evaluateOwnership({
      gbrainOnPath: false,
      gbrainOutput: null,
      requireGbrain,
      task,
      ms: nowMs() - start,
    });
  }

  const deadline = start + OWNERSHIP_BUDGET_MS;
  const remaining = () => Math.max(0, deadline - nowMs());
  const finish = (out, source, timedOut = false) =>
    evaluateOwnership({
      gbrainOnPath: true,
      gbrainOutput: out,
      source,
      timedOut,
      requireGbrain,
      task,
      ms: nowMs() - start,
    });

  let timedOut = false;
  const step = (args, cap) => {
    const budget = Math.min(cap, remaining());
    if (budget <= 0) return '';
    const r = run(gbrain, args, { timeout: budget });
    if (r.error) timedOut = true;
    return (r.stdout || '').trim();
  };

  // 1. FAST PATH — the agent-job-ledger page is the canonical ownership
  //    surface: one deterministic read, no ranking, no embedding.
  const ledger = step(['get', OWNERSHIP_LEDGER_PAGE], 3_000);
  if (ledger) return finish(ledger, 'ledger');

  // 2. Keyword index — deterministic search over current claims/priorities.
  const queryText = task
    ? `agent ownership current claims priorities: ${task}`
    : 'agent org chart ownership coordination';
  const keyword = step(['search', queryText, '--limit', '5'], 5_000);
  if (keyword) return finish(keyword, 'keyword');

  // 3. Semantic/hybrid query — ONLY when keyword came back empty, and only
  //    inside whatever budget is left (never past the 10s hard ceiling).
  const semantic = step(['query', queryText], remaining());
  if (semantic) return finish(semantic, 'semantic');

  return finish('', null, timedOut);
}

function findGstackBin(repoRoot) {
  const candidates = [
    repoRoot ? join(repoRoot, '.agents/skills/gstack/bin') : null,
    repoRoot ? join(repoRoot, '.claude/skills/gstack/bin') : null,
    join(homedir(), '.claude/skills/gstack/bin'),
    join(homedir(), '.agents/skills/gstack/bin'),
  ].filter(Boolean);

  for (const c of candidates) {
    if (existsSync(join(c, 'gstack-config'))) return c;
  }
  return null;
}

function collectGstack(repoRoot) {
  const start = nowMs();
  const requireGstack = process.env.AGENT_PREFLIGHT_REQUIRE_GSTACK === '1';
  const binPath = findGstackBin(repoRoot);
  if (!binPath) {
    return evaluateGstack({
      binPath: null,
      requireGstack,
      ms: nowMs() - start,
    });
  }

  let version = null;
  const versionFile = join(binPath, '..', 'VERSION');
  const pkgFile = join(binPath, '..', 'package.json');
  if (existsSync(versionFile)) {
    version = readFileSync(versionFile, 'utf8').trim() || null;
  } else if (existsSync(pkgFile)) {
    try {
      version = JSON.parse(readFileSync(pkgFile, 'utf8')).version || null;
    } catch {
      version = null;
    }
  }

  // Upgrade policy is PINNED by default (JOV-4184): runs consume the installed
  // version as-is; upgrades happen out-of-band (nightly Hermes cron), never
  // mid-run. The config read only surfaces an explicit override.
  let policy = null;
  const pol = run(join(binPath, 'gstack-config'), ['get', 'upgrade_policy'], {
    timeout: 3000,
  });
  if (pol.status === 0 && pol.stdout.trim()) {
    policy = pol.stdout.trim();
  } else {
    const pol2 = run(
      join(binPath, 'gstack-config'),
      ['get', 'gstack_upgrade_policy'],
      { timeout: 3000 }
    );
    if (pol2.status === 0 && pol2.stdout.trim()) {
      policy = pol2.stdout.trim();
    }
  }
  if (!policy) policy = 'pinned';

  // Read-only freshness peek: parse the cached update-check state file written
  // by the out-of-band checker. Never invoke `gstack-update-check` in-run — it
  // hits the network and performs one-time migrations (mutations), which are
  // exactly the per-run upgrade tax JOV-4184 removes from the job hot path.
  let latest = null;
  const stateDir =
    process.env.GSTACK_STATE_DIR || join(homedir(), '.gstack');
  const cacheFile = join(stateDir, 'last-update-check');
  if (existsSync(cacheFile)) {
    try {
      const line = readFileSync(cacheFile, 'utf8').trim();
      if (line.startsWith('UPGRADE_AVAILABLE')) {
        latest = line.split(/\s+/)[2] || null;
      }
    } catch {
      latest = null;
    }
  }

  return evaluateGstack({
    binPath,
    version,
    latest,
    policy,
    requireGstack,
    ms: nowMs() - start,
  });
}

function collectGoal(repoRoot) {
  const start = nowMs();
  const candidates = [
    repoRoot ? join(repoRoot, '.context/active-goal.json') : null,
    repoRoot ? join(repoRoot, '.context/goal.json') : null,
    join(homedir(), '.gstack/active-goal.json'),
    join(homedir(), '.gstack/goals/active.json'),
  ].filter(Boolean);

  for (const gp of candidates) {
    if (!existsSync(gp)) continue;
    let goalId = null;
    try {
      const d = JSON.parse(readFileSync(gp, 'utf8'));
      goalId = d.id || d.goal_id || d.slug || null;
    } catch {
      goalId = null;
    }
    return evaluateGoal({
      goalPath: gp,
      goalId,
      ms: nowMs() - start,
    });
  }
  return evaluateGoal({ goalPath: null, ms: nowMs() - start });
}

function main() {
  const { task } = parseArgs(process.argv);
  const t0 = nowMs();

  // Gate order: worktree → ownership → gstack → goal
  const wt = collectWorktree();
  const own = collectOwnership(task || null);
  const gs = collectGstack(wt.worktree.root);
  const goal = collectGoal(wt.worktree.root);

  const receipt = assembleReceipt([wt, own, gs, goal], nowMs() - t0);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  process.exit(exitCodeForReceipt(receipt));
}

main();
