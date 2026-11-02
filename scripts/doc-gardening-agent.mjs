#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { runGh } from '../packages/api-client/gh.ts';
import {
  applyGardeningFixes,
  findStaleFreshnessMarkers,
  loadDocFreshnessRegistry,
  REPO_ROOT,
  runDocFreshnessLint,
} from './lib/doc-freshness.mjs';

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    openPr: !argv.includes('--no-pr'),
  };
}

function runGit(args, options = {}) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
  }).trim();
}

function hasGhAuth() {
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const PR_TITLE = 'docs: refresh doc-gardening seed freshness marker';

function repositoryName() {
  const repository =
    process.env.GITHUB_REPOSITORY ||
    runGit(['remote', 'get-url', 'origin'])
      .replace(/^(?:https:\/\/github\.com\/|git@github\.com:)/, '')
      .replace(/\.git$/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
    throw new Error('Cannot determine the GitHub repository for gardening.');
  }
  return repository;
}

async function pendingGardeningRepair(repository) {
  const result = await runGh(
    [
      'api',
      `repos/${repository}/pulls?state=open&base=main&per_page=100`,
      '--paginate',
      '--slurp',
    ],
    { priority: 'repair' }
  );
  if (result.code !== 0) {
    throw Object.assign(
      new Error(
        `Cannot verify pending gardening repairs (GitHub exit ${result.code}).`
      ),
      { exitCode: result.code }
    );
  }
  const pages = JSON.parse(result.stdout);
  if (
    !Array.isArray(pages) ||
    pages.length === 0 ||
    !pages.every(Array.isArray)
  ) {
    throw new Error(
      'Cannot verify pending gardening repairs: malformed roster.'
    );
  }
  const prs = pages.flat();
  if (
    prs.some(
      pr =>
        !pr ||
        !Number.isSafeInteger(pr.number) ||
        pr.number <= 0 ||
        typeof pr.state !== 'string' ||
        typeof pr.title !== 'string' ||
        typeof pr.user?.login !== 'string' ||
        typeof pr.head?.ref !== 'string'
    )
  ) {
    throw new Error('Cannot verify pending gardening repairs: malformed PR.');
  }
  const candidates = prs.filter(
    pr =>
      pr.state === 'open' &&
      pr.title === PR_TITLE &&
      pr.user.login === 'jovie-bot[bot]' &&
      /^codex\/doc-gardening-\d+$/.test(pr.head.ref)
  );
  if (candidates.some(pr => typeof pr.head.repo?.full_name !== 'string')) {
    throw new Error(
      'Cannot verify pending gardening repairs: missing repository identity.'
    );
  }
  return candidates.find(pr => pr.head.repo.full_name === repository);
}

async function main() {
  const { dryRun, openPr } = parseArgs(process.argv);
  const registry = loadDocFreshnessRegistry();

  const ciResult = runDocFreshnessLint(registry, {
    includeGardeningOnly: false,
  });
  if (!ciResult.ok) {
    console.error(
      'doc-gardening-agent: CI-scope doc freshness is already failing; fix main docs before gardening.'
    );
    process.exit(1);
  }

  const gardeningViolations = findStaleFreshnessMarkers(registry, {
    includeGardeningOnly: true,
  }).filter(violation => violation.gardeningOnly);

  if (gardeningViolations.length === 0) {
    console.log('doc-gardening-agent: no gardening-only stale docs found.');
    return;
  }

  console.log(
    `doc-gardening-agent: found ${gardeningViolations.length} gardening-only stale marker(s).`
  );

  if (dryRun) {
    for (const violation of gardeningViolations) {
      console.log(
        `- ${violation.file}: ${violation.id} ${violation.expected} -> ${violation.actual}`
      );
    }
    return;
  }

  // The workflow serializes writers. Reuse its pending work before changing
  // files or creating a branch; timestamped branches alone created a new PR on
  // every source event while the previous repair was still waiting to land.
  const canPublish = openPr && hasGhAuth();
  if (canPublish) {
    const pending = await pendingGardeningRepair(repositoryName());
    if (pending) {
      console.log(
        `doc-gardening-agent: pending repair #${pending.number}; no duplicate created.`
      );
      return;
    }
  }

  const fixes = applyGardeningFixes(gardeningViolations, REPO_ROOT);
  if (fixes.length === 0) {
    console.error(
      'doc-gardening-agent: stale markers detected but no auto-fix applied.'
    );
    process.exit(1);
  }

  for (const fix of fixes) {
    console.log(`fixed ${fix.file} (${fix.id} -> ${fix.actual})`);
  }

  if (!canPublish) {
    console.log(
      'doc-gardening-agent: fixes applied locally (PR creation skipped).'
    );
    return;
  }

  const branch = `codex/doc-gardening-${Date.now()}`;
  runGit(['checkout', '-b', branch]);
  runGit(['add', ...fixes.map(fix => fix.file)]);
  runGit([
    '-c',
    'user.name=jovie-bot[bot]',
    '-c',
    'user.email=jovie-bot[bot]@users.noreply.github.com',
    'commit',
    '-m',
    PR_TITLE,
    '-m',
    'Auto-generated by scripts/doc-gardening-agent.mjs.',
    '-m',
    'Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>',
  ]);
  runGit(['push', '-u', 'origin', branch]);

  const prUrl = execFileSync(
    'gh',
    [
      'pr',
      'create',
      '--draft',
      '--base',
      'main',
      '--head',
      branch,
      '--title',
      PR_TITLE,
      '--body',
      [
        '## Goal',
        'Keep the doc-gardening sandbox fresh so the recurring gardening agent can prove fix-up PR flow.',
        '',
        '## Changes',
        ...fixes.map(fix => `- Updated freshness marker in \`${fix.file}\``),
        '',
        '## Testing',
        '`pnpm doc:freshness:check`',
      ].join('\n'),
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  ).trim();

  console.log(`doc-gardening-agent: opened ${prUrl}`);
}

main().catch(error => {
  console.error(`doc-gardening-agent: ${error.message}`);
  process.exitCode = error.exitCode ?? 1;
});
