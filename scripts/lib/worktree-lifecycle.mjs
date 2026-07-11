import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_POLICY = Object.freeze({
  ttlDays: 14,
  emergencyTtlDays: 3,
  criticalTtlDays: 1,
  emergencyFreeGb: 20,
  criticalFreeGb: 10,
  metadataFile: '.worktree-owner.json',
});

function runGit(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function effectiveTtlDays(policy = DEFAULT_POLICY, freeGb = Infinity) {
  const resolved = { ...DEFAULT_POLICY, ...policy };
  if (freeGb <= resolved.criticalFreeGb) return resolved.criticalTtlDays;
  if (freeGb <= resolved.emergencyFreeGb) return resolved.emergencyTtlDays;
  return resolved.ttlDays;
}

function pressureAlert(policy, freeGb) {
  if (freeGb <= policy.criticalFreeGb) return 'summer_disk_pressure_critical';
  if (freeGb <= policy.emergencyFreeGb) return 'summer_disk_pressure';
  return null;
}

function validMetadata(metadata) {
  return (
    metadata &&
    typeof metadata === 'object' &&
    typeof metadata.owner === 'string' &&
    metadata.owner.length > 0 &&
    typeof metadata.run_id === 'string' &&
    metadata.run_id.length > 0 &&
    typeof metadata.created_at === 'string' &&
    !Number.isNaN(Date.parse(metadata.created_at))
  );
}

export function evaluateCandidate(worktree, options = {}) {
  const policy = { ...DEFAULT_POLICY, ...(options.policy ?? {}) };
  const now = Date.parse(options.now ?? new Date().toISOString());
  const freeGb = options.freeGb ?? Infinity;
  const ttlDays = effectiveTtlDays(policy, freeGb);
  const result = {
    eligible: false,
    ttlDays,
    alert: pressureAlert(policy, freeGb),
  };
  if (worktree.currentMain) return { ...result, reason: 'current_main' };
  if (worktree.namedUser || worktree.metadata?.named_user === true)
    return { ...result, reason: 'named_user' };
  if (worktree.locked) return { ...result, reason: 'locked' };
  if (worktree.activeProcess) return { ...result, reason: 'active_process' };
  if (worktree.dirty) return { ...result, reason: 'dirty' };
  if (worktree.prunable) return { ...result, reason: 'prunable' };
  if (!validMetadata(worktree.metadata))
    return { ...result, reason: 'missing_metadata' };
  if (
    worktree.metadata.owner !== 'unclaimed' ||
    worktree.metadata.claimed === true
  ) {
    return { ...result, reason: 'claimed' };
  }
  const activity = Date.parse(
    worktree.metadata.last_activity_at ?? worktree.metadata.created_at
  );
  const ageDays = (now - activity) / 86400000;
  if (!Number.isFinite(ageDays) || ageDays < ttlDays) {
    return {
      ...result,
      reason: 'ttl_not_reached',
      ageDays: Math.max(0, ageDays),
    };
  }
  return { ...result, eligible: true, reason: 'eligible', ageDays };
}

export function parseWorktreePorcelain(output) {
  const entries = [];
  let current = null;
  for (const line of output.split('\n')) {
    if (line === '') {
      if (current) entries.push(current);
      current = null;
      continue;
    }
    const [key, ...rest] = line.split(' ');
    if (key === 'worktree') current = { path: rest.join(' ') };
    else if (current && key === 'HEAD') current.head = rest[0];
    else if (current && key === 'branch') current.branch = rest.join(' ');
    else if (current && key === 'detached') current.detached = true;
    else if (current && key === 'locked') current.locked = true;
    else if (current && key === 'prunable') current.prunable = true;
  }
  if (current) entries.push(current);
  return entries;
}

function readMetadata(worktreePath, metadataFile) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(worktreePath, metadataFile), 'utf8')
    );
  } catch {
    return null;
  }
}

function diskFreeGb(target) {
  try {
    const line = execFileSync('df', ['-Pk', target], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .at(-1);
    return Number(line.trim().split(/\s+/)[3]) / (1024 * 1024);
  } catch {
    return null;
  }
}

function activeProcessPaths() {
  try {
    const output = execFileSync('lsof', ['-Fn', '-a', '-d', 'cwd'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split('\n')
      .filter(line => line.startsWith('n'))
      .map(line => line.slice(1))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function inventory(root, options = {}) {
  const policy = { ...DEFAULT_POLICY, ...(options.policy ?? {}) };
  const repoRoot = path.resolve(
    root ?? runGit(process.cwd(), ['rev-parse', '--show-toplevel'])
  );
  const freeGb = options.freeGb ?? diskFreeGb(repoRoot) ?? Infinity;
  const processPaths = options.processPaths ?? activeProcessPaths();
  const entries = parseWorktreePorcelain(
    runGit(repoRoot, ['worktree', 'list', '--porcelain'])
  );
  const worktrees = entries.map(entry => {
    const worktreePath = path.resolve(entry.path);
    let dirty = false;
    try {
      dirty =
        runGit(worktreePath, [
          'status',
          '--porcelain',
          '--untracked-files=normal',
        ]) !== '';
    } catch {
      dirty = true;
    }
    const metadata = readMetadata(worktreePath, policy.metadataFile);
    const currentMain =
      worktreePath === repoRoot || entry.branch === 'refs/heads/main';
    const activeProcess = processPaths.some(
      p => p === worktreePath || p.startsWith(`${worktreePath}${path.sep}`)
    );
    const decision = evaluateCandidate(
      {
        ...entry,
        path: worktreePath,
        dirty,
        metadata,
        currentMain,
        activeProcess,
      },
      { ...options, policy, freeGb }
    );
    return {
      ...entry,
      path: worktreePath,
      dirty,
      currentMain,
      activeProcess,
      namedUser: metadata?.named_user === true,
      metadata,
      decision,
    };
  });
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    host: os.hostname(),
    root: repoRoot,
    free_gb: freeGb,
    policy: { ...policy, effective_ttl_days: effectiveTtlDays(policy, freeGb) },
    alert: pressureAlert(policy, freeGb),
    worktrees,
  };
}

export function registerWorktree(
  worktreePath,
  { owner, runId, createdAt, namedUser = false }
) {
  if (!owner || !runId) throw new Error('owner and run-id are required');
  const metadata = {
    schema_version: 1,
    owner,
    run_id: runId,
    created_at: createdAt ?? new Date().toISOString(),
    last_activity_at: createdAt ?? new Date().toISOString(),
    named_user: namedUser,
  };
  fs.writeFileSync(
    path.join(worktreePath, DEFAULT_POLICY.metadataFile),
    `${JSON.stringify(metadata, null, 2)}\n`,
    { mode: 0o600 }
  );
  return metadata;
}

export function reap(root, options = {}) {
  const report = inventory(root, options);
  const removals = [];
  if (options.apply === true) {
    for (const worktree of report.worktrees.filter(
      item => item.decision.eligible
    )) {
      try {
        execFileSync(
          'git',
          ['-C', report.root, 'worktree', 'remove', worktree.path],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        );
        removals.push({ path: worktree.path, removed: true });
      } catch (error) {
        removals.push({
          path: worktree.path,
          removed: false,
          error: error.message,
        });
      }
    }
    if (removals.some(item => item.removed)) {
      execFileSync('git', ['-C', report.root, 'worktree', 'prune'], {
        encoding: 'utf8',
      });
      report.prune_ran = true;
    }
  }
  report.dry_run = options.apply !== true;
  report.removals = removals;
  return report;
}
