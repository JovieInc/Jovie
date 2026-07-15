#!/usr/bin/env node
/**
 * scripts/agent/preflight.mjs — CLI entry (JOV-4183)
 * Collects environment facts, evaluates via preflight-lib, prints one JSON receipt.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

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

function which(bin, timeout = 3_000) {
  const r = run('bash', ['-c', `command -v ${bin}`], { timeout });
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
  process.env.AGENT_PREFLIGHT_LEDGER_PAGE || 'coordination/agent-job-ledger';

const PAGE_NOT_FOUND = /(?:page[_ -]?not[_ -]?found|no page[^\n]*slug)/i;

// `gbrain get` pays CLI bootstrap, migration/config probes, and shutdown drain
// on every invocation. GBrain's public package exports provide a bounded,
// read-only one-process path that connects once and reads the canonical page.
// This is intentionally discovered from the installed gbrain binary; when a
// compiled/no-source install does not expose the public package, the existing
// CLI path remains the fallback.
const GBRAIN_ENGINE_READ_SOURCE = `
import { loadConfig, toEngineConfig } from 'gbrain/config';
import { createEngine } from 'gbrain/engine-factory';
const started = Date.now();
const config = loadConfig();
if (!config) throw new Error('gbrain_config_missing');
const engineConfig = toEngineConfig(config);
const engine = await createEngine(engineConfig);
const created = Date.now();
try {
  await engine.connect(engineConfig);
  const connected = Date.now();
  const page = await engine.getPage(process.argv[1]);
  const read = Date.now();
  process.stdout.write(JSON.stringify({
    found: Boolean(page),
    create_ms: created - started,
    connect_ms: connected - created,
    read_ms: read - connected,
    total_ms: read - started,
  }));
} finally {
  await engine.disconnect();
}
`;

function findGbrainPackageRoot(gbrain) {
  let current;
  try {
    current = dirname(realpathSync(gbrain));
  } catch {
    return null;
  }
  for (let i = 0; i < 5; i++) {
    const manifest = join(current, 'package.json');
    if (existsSync(manifest)) {
      try {
        const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
        if (
          pkg.name === 'gbrain' &&
          pkg.exports?.['./config'] &&
          pkg.exports?.['./engine-factory']
        ) {
          return current;
        }
      } catch {
        return null;
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

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
  const attempts = [];
  const finish = (out, source, failureReason = null) => {
    const elapsed = nowMs() - start;
    const timeoutAttempt = [...attempts]
      .reverse()
      .find(attempt => attempt.outcome === 'timeout');
    const resolvedSlug = source === 'ledger' ? OWNERSHIP_LEDGER_PAGE : null;
    const degradedAttempt = attempts.find(attempt =>
      ['timeout', 'page_not_found', 'error'].includes(attempt.outcome)
    );
    const health = out
      ? degradedAttempt
        ? `degraded_${degradedAttempt.outcome}`
        : 'healthy'
      : failureReason === 'page_not_found'
        ? 'page_not_found'
        : failureReason === 'timeout'
          ? 'timeout'
          : 'empty';
    const diagnostics = {
      failure_class:
        health === 'healthy'
          ? null
          : 'gbrain_ownership_preflight_latency_or_slug_drift',
      requested_slug: OWNERSHIP_LEDGER_PAGE,
      resolved_slug: resolvedSlug,
      transport:
        attempts.find(attempt => attempt.outcome === 'success')?.transport ??
        'cli',
      cli_ms:
        attempts
          .filter(attempt => attempt.transport === 'cli')
          .reduce((sum, attempt) => sum + attempt.ms, 0) || null,
      mcp_ms: null,
      engine_ms:
        attempts
          .filter(attempt => attempt.transport === 'engine')
          .reduce((sum, attempt) => sum + attempt.ms, 0) || null,
      timeout_tier: timeoutAttempt?.timeout_tier ?? null,
      lookup_health: health,
      db_lock_signal_detected: attempts.some(
        attempt => attempt.db_lock_signal_detected === true
      )
        ? true
        : null,
      session_signal_detected: attempts.some(
        attempt => attempt.session_signal_detected === true
      )
        ? true
        : null,
      attempts,
    };
    return evaluateOwnership({
      gbrainOnPath: true,
      gbrainOutput: out,
      source,
      timedOut: failureReason === 'timeout',
      diagnostics,
      requireGbrain,
      task,
      ms: elapsed,
    });
  };

  const step = (name, args, cap) => {
    const budget = Math.min(cap, remaining());
    if (budget <= 0) {
      attempts.push({
        step: name,
        ms: 0,
        outcome: 'timeout',
        timeout_tier: 'overall',
        db_lock_signal_detected: null,
        session_signal_detected: null,
      });
      return { output: '', outcome: 'timeout' };
    }
    const stepStart = nowMs();
    const r = run(gbrain, args, { timeout: budget });
    const combined = `${r.stdout || ''}\n${r.stderr || ''}`;
    const output = (r.stdout || '').trim();
    const timedOut = r.error?.code === 'ETIMEDOUT';
    const pageNotFound = !timedOut && PAGE_NOT_FOUND.test(combined);
    const outcome = timedOut
      ? 'timeout'
      : pageNotFound
        ? 'page_not_found'
        : output
          ? 'success'
          : 'empty';
    attempts.push({
      step: name,
      transport: 'cli',
      ms: nowMs() - stepStart,
      outcome,
      timeout_tier: timedOut
        ? budget < cap
          ? 'overall'
          : `${name}_step`
        : null,
      db_lock_signal_detected:
        /(?:database|db)[^\n]{0,40}lock|advisory lock/i.test(combined) || null,
      session_signal_detected:
        /(?:stale|blocked|waiting)[^\n]{0,40}session/i.test(combined) || null,
    });
    return { output: pageNotFound ? '' : output, outcome };
  };

  const packageRoot = findGbrainPackageRoot(gbrain);
  const bunBudget = Math.min(1_000, remaining());
  const bun = packageRoot && bunBudget > 0 ? which('bun', bunBudget) : null;
  if (packageRoot && bun) {
    const budget = Math.min(7_000, remaining());
    const engineStart = nowMs();
    const r = run(
      bun,
      ['-e', GBRAIN_ENGINE_READ_SOURCE, OWNERSHIP_LEDGER_PAGE],
      { timeout: budget, cwd: packageRoot }
    );
    const ms = nowMs() - engineStart;
    const timedOut = r.error?.code === 'ETIMEDOUT';
    let result = null;
    if (!timedOut && r.status === 0) {
      try {
        result = JSON.parse(r.stdout.trim());
      } catch {
        result = null;
      }
    }
    const outcome = timedOut
      ? 'timeout'
      : result?.found === true
        ? 'success'
        : result?.found === false
          ? 'page_not_found'
          : 'error';
    attempts.push({
      step: 'ledger',
      transport: 'engine',
      ms,
      outcome,
      timeout_tier: timedOut
        ? budget < 7_000
          ? 'overall'
          : 'ledger_step'
        : null,
      db_lock_signal_detected:
        /(?:database|db)[^\n]{0,40}lock|advisory lock/i.test(r.stderr || '') ||
        null,
      session_signal_detected:
        /(?:stale|blocked|waiting)[^\n]{0,40}session/i.test(r.stderr || '') ||
        null,
    });
    if (outcome === 'success') {
      return finish('canonical ledger available', 'ledger');
    }
    // A timed-out engine read has already consumed most/all of the gate. A
    // cold CLI retry cannot fit its remaining budget and would only add load.
    if (outcome === 'timeout') return finish('', null, 'timeout');
  }

  // 1. FAST PATH — the canonical ledger page is the ownership
  //    surface: one deterministic read, no ranking, no embedding.
  const priorLedgerAttempt = attempts.find(
    attempt => attempt.step === 'ledger'
  );
  const ledger =
    priorLedgerAttempt?.outcome === 'page_not_found'
      ? { output: '', outcome: attempts[0]?.outcome ?? 'empty' }
      : step('ledger', ['get', OWNERSHIP_LEDGER_PAGE], 3_000);
  if (ledger.outcome === 'success') return finish(ledger.output, 'ledger');

  // 2. Keyword index — deterministic search over current claims/priorities.
  const queryText = task
    ? `agent ownership current claims priorities: ${task}`
    : 'agent org chart ownership coordination';
  const keyword = step('keyword', ['search', queryText, '--limit', '5'], 5_000);
  if (keyword.outcome === 'success') return finish(keyword.output, 'keyword');

  // 3. Semantic/hybrid query — ONLY when keyword came back empty, and only
  //    inside whatever budget is left (never past the 10s hard ceiling).
  const semantic = step('semantic', ['query', queryText], OWNERSHIP_BUDGET_MS);
  if (semantic.outcome === 'success') {
    return finish(semantic.output, 'semantic');
  }

  const failureReason = attempts.some(attempt => attempt.outcome === 'timeout')
    ? 'timeout'
    : ledger.outcome === 'page_not_found'
      ? 'page_not_found'
      : 'empty';
  return finish('', null, failureReason);
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
  const stateDir = process.env.GSTACK_STATE_DIR || join(homedir(), '.gstack');
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
