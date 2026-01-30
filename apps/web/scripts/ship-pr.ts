#!/usr/bin/env node

import { execSync, spawnSync } from 'child_process';

type ChangeType = 'feat' | 'fix' | 'chore';

type CliOptions = {
  type?: ChangeType;
  slug?: string;
  goal?: string;
  kpi?: string;
  rollback?: string;
  noPush: boolean;
  noPr: boolean;
  dryRun: boolean;
};

function getTimestampSlug(): string {
  const d = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  return `auto-ship-${yyyy}${mm}${dd}-${hh}${min}`;
}

function sanitizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^a-z0-9-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replace(/^-/, '')
    .replace(/-$/, '');
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    noPush: false,
    noPr: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--type') {
      const value = argv[i + 1];
      if (value === 'feat' || value === 'fix' || value === 'chore') {
        opts.type = value;
        i += 1;
        continue;
      }
      throw new Error(
        `Invalid --type: ${value ?? '(missing)'} (expected feat|fix|chore)`
      );
    }
    if (arg === '--slug') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --slug');
      opts.slug = value;
      i += 1;
      continue;
    }
    if (arg === '--goal') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --goal');
      opts.goal = value;
      i += 1;
      continue;
    }
    if (arg === '--kpi') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --kpi');
      opts.kpi = value;
      i += 1;
      continue;
    }
    if (arg === '--rollback') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value for --rollback');
      opts.rollback = value;
      i += 1;
      continue;
    }
    if (arg === '--no-push') {
      opts.noPush = true;
      continue;
    }
    if (arg === '--no-pr') {
      opts.noPr = true;
      continue;
    }
    if (arg === '--dry-run') {
      opts.dryRun = true;
      continue;
    }

    throw new Error(`Unknown arg: ${arg}`);
  }

  return opts;
}

function cmdStdout(command: string): string {
  return execSync(command, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryCmdStdout(command: string): string | undefined {
  try {
    return cmdStdout(command);
  } catch {
    return undefined;
  }
}

function runOrThrow(command: string, args: string[], dryRun: boolean): void {
  const pretty = [command, ...args].join(' ');
  console.log(pretty);

  if (dryRun) return;

  const res = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status ?? 'unknown'}): ${pretty}`);
  }
}

function hasUpstreamConfigured(): boolean {
  try {
    cmdStdout('git rev-parse --abbrev-ref --symbolic-full-name @{u}');
    return true;
  } catch {
    return false;
  }
}

function inferTypeFromBranch(branch: string): ChangeType | undefined {
  if (branch.startsWith('feat/')) return 'feat';
  if (branch.startsWith('fix/')) return 'fix';
  if (branch.startsWith('chore/')) return 'chore';
  return undefined;
}

function inferSlugFromBranch(branch: string): string | undefined {
  const parts = branch.split('/');
  if (parts.length >= 2) return parts.slice(1).join('/');
  return undefined;
}

function buildPrBody(opts: {
  goal?: string;
  kpi?: string;
  rollback?: string;
}): string {
  const goal = opts.goal ?? '<1-2 sentences>';
  const kpi = opts.kpi ?? '<n/a>';
  const rollback = opts.rollback ?? 'Revert PR.';

  return `## Goal\n\n${goal}\n\n## KPI (if applicable)\n\n${kpi}\n\n## Rollback plan\n\n${rollback}`;
}

function findAvailableBranchName(desiredBranch: string): string {
  const exists = (branch: string): boolean => {
    try {
      cmdStdout(`git rev-parse --verify ${branch}`);
      return true;
    } catch {
      return false;
    }
  };

  if (!exists(desiredBranch)) return desiredBranch;
  for (let i = 2; i <= 50; i += 1) {
    const candidate = `${desiredBranch}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  throw new Error(`Branch name collision: ${desiredBranch} (and -2..-50)`);
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));

  let currentBranch = cmdStdout('git rev-parse --abbrev-ref HEAD');

  if (currentBranch === 'production') {
    throw new Error(
      'Refusing to run on production branch. Switch to main or a feature branch.'
    );
  }

  const inferredType = inferTypeFromBranch(currentBranch);
  const type: ChangeType = opts.type ?? inferredType ?? 'chore';

  const inferredSlugRaw = inferSlugFromBranch(currentBranch);
  const slugRaw = opts.slug ?? inferredSlugRaw ?? getTimestampSlug();
  const slug = sanitizeSlug(slugRaw);

  if (!slug) {
    throw new Error('Derived slug is empty; pass --slug <kebab-slug>');
  }

  const desiredBranch = `${type}/${slug}`;

  const resolvedBranch = findAvailableBranchName(desiredBranch);

  if (currentBranch === 'main') {
    const status = cmdStdout('git status --porcelain');

    runOrThrow('git', ['fetch', 'origin'], opts.dryRun);

    if (status.length === 0) {
      runOrThrow('git', ['pull', '--ff-only'], opts.dryRun);
    } else {
      console.log('Working tree not clean; skipping git pull --ff-only');
    }

    runOrThrow('git', ['checkout', '-b', resolvedBranch], opts.dryRun);
    currentBranch = resolvedBranch;
  }

  if (currentBranch !== 'main' && currentBranch !== resolvedBranch) {
    if (opts.type || opts.slug) {
      runOrThrow('git', ['checkout', '-b', resolvedBranch], opts.dryRun);
      currentBranch = resolvedBranch;
    }
  }

  runOrThrow('pnpm', ['ship'], opts.dryRun);

  runOrThrow('git', ['add', '-A'], opts.dryRun);

  const hasStaged = cmdStdout('git diff --cached --name-only');
  if (hasStaged) {
    runOrThrow('git', ['commit', '-m', `${type}: ${slug}`], opts.dryRun);
  } else {
    console.log('No staged changes after pnpm ship; skipping commit.');
  }

  if (!opts.noPush) {
    const pushArgs = hasUpstreamConfigured()
      ? ['push', 'origin', 'HEAD']
      : ['push', '-u', 'origin', 'HEAD'];
    runOrThrow('git', pushArgs, opts.dryRun);
  }

  if (!opts.noPr) {
    const prJson = tryCmdStdout('gh pr view --json number,state');
    const prState = (() => {
      if (!prJson) return undefined;
      try {
        const parsed = JSON.parse(prJson) as { state?: string };
        return parsed.state;
      } catch {
        return undefined;
      }
    })();

    const hasOpenPr = prState === 'OPEN';

    if (!hasOpenPr) {
      runOrThrow(
        'gh',
        [
          'pr',
          'create',
          '--base',
          'main',
          '--head',
          'HEAD',
          '--title',
          `[${type}]: ${slug}`,
          '--body',
          buildPrBody({
            goal: opts.goal,
            kpi: opts.kpi,
            rollback: opts.rollback,
          }),
        ],
        opts.dryRun
      );
    } else {
      console.log('PR already exists for this branch; skipping gh pr create.');
    }
  }
}

main();
