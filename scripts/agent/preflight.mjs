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

  // Cap wait — bootstrap must stay cheap.
  const timeout = 5_000;
  let out = '';
  if (task) {
    const r = run(
      gbrain,
      ['query', `agent ownership and current priorities for: ${task}`],
      { timeout }
    );
    out = r.stdout;
  } else {
    let r = run(gbrain, ['get', 'agent-org-chart'], { timeout });
    out = r.stdout;
    if (!out.trim()) {
      r = run(gbrain, ['query', 'agent org chart ownership coordination'], {
        timeout,
      });
      out = r.stdout;
    }
  }

  return evaluateOwnership({
    gbrainOnPath: true,
    gbrainOutput: out,
    requireGbrain,
    task,
    ms: nowMs() - start,
  });
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

  return evaluateGstack({
    binPath,
    version,
    // A job must use the version it started with. Network update checks (and
    // their cache/marker writes) belong to the nightly refresh job, never
    // preflight.
    policy: policy || 'pinned',
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
