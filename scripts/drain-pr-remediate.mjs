#!/usr/bin/env node
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { extractTerminalFailureNames } from './lib/ci-check-failures.mjs';
import {
  buildRemediationPlan,
  DEFAULT_MAX_REBASES_PER_RUN,
  DEFAULT_REBASE_COOLDOWN_HOURS,
  DRAIN_REBASE_LABEL,
  formatRemediationPlan,
} from './lib/drain-pr-remediate.mjs';
import { isSafeAutoResolvableConflict } from './lib/pr-conflict-handler.mjs';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const options = {
    repo: 'JovieInc/Jovie',
    repoOwner: 'JovieInc',
    dryRun: true,
    apply: false,
    json: false,
    limit: 200,
    maxRebases: DEFAULT_MAX_REBASES_PER_RUN,
    cooldownHours: DEFAULT_REBASE_COOLDOWN_HOURS,
    prNumber: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--repo':
        options.repo = argv[++index];
        options.repoOwner = options.repo.split('/')[0] ?? options.repoOwner;
        break;
      case '--limit':
        options.limit = Number.parseInt(argv[++index], 10);
        break;
      case '--max-rebases':
        options.maxRebases = Number.parseInt(argv[++index], 10);
        break;
      case '--cooldown-hours':
        options.cooldownHours = Number.parseInt(argv[++index], 10);
        break;
      case '--pr':
        options.prNumber = Number.parseInt(argv[++index], 10);
        break;
      case '--apply':
        options.apply = true;
        options.dryRun = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        options.apply = false;
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.maxRebases) || options.maxRebases < 1) {
    throw new Error('--max-rebases must be a positive integer');
  }
  if (!Number.isInteger(options.cooldownHours) || options.cooldownHours < 1) {
    throw new Error('--cooldown-hours must be a positive integer');
  }
  return options;
}

function printUsage() {
  console.log(`Usage: node scripts/drain-pr-remediate.mjs [options]

Mechanically rebases agent-owned PRs that are behind base with stale required-check
failures, then re-enrolls them into the merge queue. Defaults to dry-run.

Options:
  --dry-run                 Plan only (default)
  --apply                   Rebase/push eligible PRs and add merge-queue label
  --repo OWNER/REPO         Repository (default: JovieInc/Jovie)
  --pr N                    Only inspect/remediate a single PR
  --limit N                 Max open PRs to inspect (default: 200)
  --max-rebases N           Cap rebases per run (default: ${DEFAULT_MAX_REBASES_PER_RUN})
  --cooldown-hours N        Skip PRs rebased within N hours (default: ${DEFAULT_REBASE_COOLDOWN_HOURS})
  --json                    Emit JSON plan
`);
}

async function ghJson(args, { retries = 3 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const { stdout } = await execFileAsync('gh', args, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    } catch (error) {
      const stderr = error.stderr ?? '';
      const rateLimited = /rate limit|secondary rate|abuse/i.test(stderr);
      if (!rateLimited || attempt === retries) throw error;
      const delayMs = Math.min(30_000, 2000 * 2 ** (attempt - 1));
      console.error(
        `[gh-retry] ${args.join(' ')} hit rate limit; retry ${attempt}/${retries} in ${delayMs}ms`
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('unreachable');
}

async function fetchOpenPrs(options) {
  const fields = [
    'number',
    'title',
    'isDraft',
    'mergeable',
    'mergeStateStatus',
    'baseRefName',
    'headRefName',
    'headRepositoryOwner',
    'isCrossRepository',
    'labels',
    'statusCheckRollup',
    'updatedAt',
    'commitsBehindBase',
  ];
  const prs = await ghJson([
    'pr',
    'list',
    '--repo',
    options.repo,
    '--state',
    'open',
    '--limit',
    String(options.limit),
    '--json',
    fields.join(','),
  ]);
  if (options.prNumber) {
    return prs.filter(pr => pr.number === options.prNumber);
  }
  return prs;
}

async function fetchRequiredFailures(repo, prNumber) {
  try {
    const checks = await ghJson([
      'pr',
      'checks',
      String(prNumber),
      '--repo',
      repo,
      '--required',
      '--json',
      'name,bucket,state,workflow,description',
    ]);
    return extractTerminalFailureNames(checks);
  } catch (error) {
    const stderr = `${error.stderr ?? ''}`;
    if (/exit status 8/i.test(String(error.message)) || /pending/i.test(stderr)) {
      return [];
    }
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        pr: prNumber,
        warning: `required check lookup failed: ${error.message}`,
      })
    );
    return [];
  }
}

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runGh(args, cwd) {
  return execFileSync('gh', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function conflictedPaths(cwd) {
  const output = runGit(['diff', '--name-only', '--diff-filter=U'], cwd);
  return output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function tryMechanicalRebase({ repo, pr }) {
  const workdir = mkdtempSync(join(tmpdir(), `jovie-drain-${pr.number}-rebase-`));
  try {
    runGh(['repo', 'clone', repo, '.', '--', '--no-tags'], workdir);
    runGit(
      ['fetch', 'origin', pr.baseRefName, pr.headRefName, '--depth', '50'],
      workdir
    );
    runGit(
      ['checkout', '-B', pr.headRefName, `origin/${pr.headRefName}`],
      workdir
    );
    try {
      runGit(['rebase', `origin/${pr.baseRefName}`], workdir);
    } catch (_error) {
      const paths = conflictedPaths(workdir);
      if (!isSafeAutoResolvableConflict(paths)) {
        runGit(['rebase', '--abort'], workdir);
        return {
          ok: false,
          conflict: true,
          reason: `non-trivial conflict paths: ${paths.join(', ') || 'unknown'}`,
        };
      }
      runGit(['checkout', '--theirs', 'pnpm-lock.yaml'], workdir);
      execFileSync(
        'corepack',
        ['pnpm', 'install', '--lockfile-only', '--ignore-scripts'],
        {
          cwd: workdir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      runGit(['add', 'pnpm-lock.yaml'], workdir);
      runGit(['rebase', '--continue'], workdir);
    }
    runGit(
      ['push', '--force-with-lease', 'origin', `HEAD:${pr.headRefName}`],
      workdir
    );
    return { ok: true, conflict: false, reason: 'rebased and pushed with --force-with-lease' };
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

async function ensureLabel(repo, label, color, description) {
  try {
    await execFileAsync(
      'gh',
      [
        'label',
        'create',
        label,
        '--repo',
        repo,
        '--color',
        color,
        '--description',
        description,
      ],
      { encoding: 'utf8' }
    );
  } catch (error) {
    const stderr = `${error.stderr ?? ''}${error.stdout ?? ''}`;
    if (/already exists/i.test(stderr)) return;
    throw error;
  }
}

async function addLabels(repo, number, labels) {
  for (const label of labels) {
    await execFileAsync(
      'gh',
      ['pr', 'edit', String(number), '--repo', repo, '--add-label', label],
      { encoding: 'utf8' }
    );
  }
}

async function addConflictLabel(repo, number) {
  await ensureLabel(
    repo,
    'needs-conflict-resolution',
    'B60205',
    'Drain remediation hit a non-trivial merge conflict'
  );
  await addLabels(repo, number, ['needs-conflict-resolution']);
}

async function executePlan(plan, prByNumber, options) {
  if (options.dryRun) return [];
  const results = [];

  await ensureLabel(
    options.repo,
    DRAIN_REBASE_LABEL,
    '0E8A16',
    'Mechanical drain rebase attempted; used for cooldown'
  );

  for (const item of plan.candidates) {
    const pr = prByNumber.get(item.number);
    if (!pr) continue;
    try {
      const result = tryMechanicalRebase({ repo: options.repo, pr });
      if (!result.ok) {
        if (result.conflict) {
          await addConflictLabel(options.repo, item.number);
        }
        results.push({ pr: item.number, action: 'rebase', ...result });
        continue;
      }
      await addLabels(options.repo, item.number, [
        DRAIN_REBASE_LABEL,
        'merge-queue',
      ]);
      results.push({ pr: item.number, action: 'rebase', ok: true, ...result });
    } catch (error) {
      results.push({
        pr: item.number,
        action: 'rebase',
        ok: false,
        error: error.message,
      });
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          pr: item.number,
          action: 'rebase',
          error: error.message,
        })
      );
    }
  }
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prs = await fetchOpenPrs(options);
  const requiredFailuresByPr = new Map();

  for (const pr of prs) {
    const failures = await fetchRequiredFailures(options.repo, pr.number);
    requiredFailuresByPr.set(pr.number, failures);
  }

  const plan = buildRemediationPlan(prs, {
    maxRebases: options.maxRebases,
    cooldownHours: options.cooldownHours,
    repoOwner: options.repoOwner,
    requiredFailuresByPr,
  });

  console.log(formatRemediationPlan(plan, { dryRun: options.dryRun }));
  if (options.json) console.log(JSON.stringify(plan, null, 2));

  const prByNumber = new Map(prs.map(pr => [pr.number, pr]));
  const results = await executePlan(plan, prByNumber, options);
  if (results.length > 0) {
    console.log(
      JSON.stringify({ ts: new Date().toISOString(), results }, null, 2)
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});