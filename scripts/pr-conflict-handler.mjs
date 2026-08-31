#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import {
  annotateNativeMergeQueue,
  fetchNativeMergeQueue,
} from './lib/github-merge-queue.mjs';
import { fetchOpenPrsRest } from './lib/github-open-prs-rest.mjs';
import { tryGitHubRebase } from './lib/github-update-branch.mjs';
import {
  buildPlan,
  DEFAULT_BLOCKED_LABEL,
  DEFAULT_REQUIRED_CHECKS,
  formatPlan,
  parseConflictFxCohortComments,
} from './lib/pr-conflict-handler.mjs';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const options = {
    repo: 'JovieInc/Jovie',
    repoOwner: 'JovieInc',
    dryRun: true,
    maxConcurrent: 40,
    limit: 200,
    apply: false,
    json: false,
    blockedLabel: DEFAULT_BLOCKED_LABEL,
    requiredChecks: [...DEFAULT_REQUIRED_CHECKS],
    runnerCapacity: 2,
    activeCi: 0,
    queuedCi: 0,
    cohortId: process.env.GITHUB_RUN_ID ?? 'local',
    planFile: '',
    historyIssue: 16794,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--repo':
        options.repo = argv[++index];
        options.repoOwner = options.repo.split('/')[0] ?? options.repoOwner;
        break;
      case '--max-concurrent':
        options.maxConcurrent = Number.parseInt(argv[++index], 10);
        break;
      case '--limit':
        options.limit = Number.parseInt(argv[++index], 10);
        break;
      case '--runner-capacity':
        options.runnerCapacity = Number.parseInt(argv[++index], 10);
        break;
      case '--active-ci':
        options.activeCi = Number.parseInt(argv[++index], 10);
        break;
      case '--queued-ci':
        options.queuedCi = Number.parseInt(argv[++index], 10);
        break;
      case '--cohort-id':
        options.cohortId = argv[++index];
        break;
      case '--plan-file':
        options.planFile = argv[++index];
        break;
      case '--history-issue':
        options.historyIssue = Number.parseInt(argv[++index], 10);
        break;
      case '--required-check':
        options.requiredChecks.push(argv[++index]);
        break;
      case '--required-checks':
        options.requiredChecks = argv[++index]
          .split(',')
          .map(value => value.trim())
          .filter(Boolean);
        break;
      case '--blocked-label':
        options.blockedLabel = argv[++index];
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

  if (!Number.isInteger(options.maxConcurrent) || options.maxConcurrent < 1) {
    throw new Error('--max-concurrent must be a positive integer');
  }
  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error('--limit must be a positive integer');
  }
  for (const key of ['runnerCapacity', 'activeCi', 'queuedCi']) {
    if (!Number.isInteger(options[key]) || options[key] < 0) {
      throw new Error(
        `--${key.replace(/[A-Z]/gu, match => `-${match.toLowerCase()}`)} must be a non-negative integer`
      );
    }
  }
  if (!Number.isInteger(options.historyIssue) || options.historyIssue < 1) {
    throw new Error('--history-issue must be a positive integer');
  }
  return options;
}

function printUsage() {
  console.log(`Usage: node scripts/pr-conflict-handler.mjs [options]

Classifies open PRs and plans safe freshness actions. Defaults to read-only dry-run.

Options:
  --dry-run                    Print classification/order/actions without mutations (default)
  --apply                      Execute safe mutations (labels, exact-head GitHub rebase)
  --repo OWNER/REPO            Repository (default: JovieInc/Jovie)
  --max-concurrent N           Operator ceiling above adaptive 2→10→40 cohorts (default: 40)
  --limit N                    Max open PRs to inspect (default: 200)
  --runner-capacity N          Observed GitHub-hosted runner pool size (fail-low default: 2)
  --active-ci N                Current in-progress Actions runs (default: 0)
  --queued-ci N                Current queued Actions runs (default: 0)
  --cohort-id ID               Durable cohort identifier (default: GITHUB_RUN_ID)
  --plan-file PATH             Write the machine-readable plan to PATH
  --history-issue N            Durable cohort ledger issue (default: 16794)
  --required-checks a,b,c      Required aggregate checks to use for BLOCKED classification
  --blocked-label NAME         Label for failing required checks (default: needs-ci-fix)
  --json                       Emit JSON plan as well as logs
`);
}

function logDecision(item, extra = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      pr: item.number,
      state: item.state,
      action: item.action,
      reason: item.actionReason,
      classificationReason: item.reason,
      base: item.pr.baseRefName,
      head: item.pr.headRefName,
      internal: item.internal,
      triggersCi: item.triggersCi,
      ...extra,
    })
  );
}

/**
 * @param {string[]} args
 * @param {{ retries?: number; token?: string }} [options]
 */
async function ghJson(args, { retries = 3, token } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const { stdout } = await execFileAsync('gh', args, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        env: token
          ? {
              ...process.env,
              GH_TOKEN: token,
            }
          : process.env,
      });
      return JSON.parse(stdout);
    } catch (error) {
      const stderr = error.stderr ?? '';
      // Retry transient API failures, not just rate limits: the bulk
      // `gh pr list --json statusCheckRollup` GraphQL query times out or
      // errors under load at blitz-scale open-PR counts (#13347).
      const transient =
        /rate limit|secondary rate|abuse|something went wrong|timeout|timed out|502|503|504|connection reset|unexpected end of JSON/i.test(
          `${stderr}${error.message ?? ''}`
        );
      if (!transient || attempt === retries) {
        if (stderr) {
          console.error(
            `[gh] ${args.slice(0, 3).join(' ')} failed (attempt ${attempt}/${retries}): ${stderr.slice(0, 2000)}`
          );
        }
        throw error;
      }
      const delayMs = Math.min(30_000, 2000 * 2 ** (attempt - 1));
      console.error(
        `[gh-retry] ${args.join(' ')} transient failure; retry ${attempt}/${retries} in ${delayMs}ms`
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('unreachable');
}

async function fetchOpenPrs(options) {
  const request = endpoint =>
    ghJson([
      'api',
      '--method',
      'GET',
      '-H',
      'Accept: application/vnd.github+json',
      endpoint,
    ]);
  const prs = await fetchOpenPrsRest({
    repo: options.repo,
    limit: options.limit,
    request,
  });
  const [owner, name] = options.repo.split('/');
  const queueToken = process.env.GH_QUEUE_TOKEN || process.env.GH_TOKEN;
  const queuePositions = await fetchNativeMergeQueue({
    branches: prs.map(pr => pr.baseRefName),
    request: async ({ branch, cursor, pageSize }) => {
      const args = [
        'api',
        'graphql',
        '-f',
        'query=query($owner:String!,$name:String!,$branch:String!,$first:Int!,$cursor:String){repository(owner:$owner,name:$name){mergeQueue(branch:$branch){entries(first:$first,after:$cursor){nodes{position pullRequest{number}}pageInfo{hasNextPage endCursor}}}}}',
        '-F',
        `owner=${owner}`,
        '-F',
        `name=${name}`,
        '-F',
        `branch=${branch}`,
        '-F',
        `first=${pageSize}`,
      ];
      if (cursor !== null) args.push('-F', `cursor=${cursor}`);
      return ghJson(args, { token: queueToken });
    },
  });
  annotateNativeMergeQueue(prs, queuePositions);
  return { prs, degradedChecks: false };
}

async function fetchCohortHistory(options) {
  const pages = await ghJson([
    'api',
    '--method',
    'GET',
    '--paginate',
    '--slurp',
    `repos/${options.repo}/issues/${options.historyIssue}/comments?per_page=100`,
  ]);
  const comments = Array.isArray(pages) ? pages.flat() : [];
  return parseConflictFxCohortComments(comments);
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

async function addLabel(repo, number, label) {
  await execFileAsync(
    'gh',
    ['pr', 'edit', String(number), '--repo', repo, '--add-label', label],
    {
      encoding: 'utf8',
    }
  );
}

async function executePlan(plan, options) {
  if (options.dryRun) return [];
  const results = [];
  await ensureLabel(
    options.repo,
    options.blockedLabel,
    'D93F0B',
    'Required checks are failing; fix CI before freshness updates'
  );

  for (const item of plan.items) {
    logDecision(item, { phase: 'execute' });
    try {
      if (item.action === 'flag_blocked_checks' && item.label) {
        await addLabel(options.repo, item.number, item.label);
        results.push({ pr: item.number, ok: true, action: item.action });
      } else if (item.action === 'request_github_rebase') {
        const result = await tryGitHubRebase({
          repo: options.repo,
          pr: item.pr,
          expectedBaseRefName: item.pr.baseRefName,
          expectedBaseOid: item.pr.baseRefOid,
          expectedHeadOid: item.pr.headRefOid,
          dryRun: false,
        });
        results.push({ pr: item.number, action: item.action, ...result });
      }
    } catch (error) {
      results.push({
        pr: item.number,
        ok: false,
        action: item.action,
        error: error.message,
      });
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          pr: item.number,
          action: item.action,
          error: error.message,
        })
      );
    }
  }
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [{ prs, degradedChecks }, cohortHistory] = await Promise.all([
    fetchOpenPrs(options),
    fetchCohortHistory(options),
  ]);
  options.cohortHistory = cohortHistory;
  if (degradedChecks) {
    // Without check rollups, "required check missing" is indistinguishable
    // from "not fetched" — drop required-check-based BLOCKED classification
    // and rely on GitHub's own mergeStateStatus, which is still fetched.
    options.requiredChecks = [];
    console.error(
      '[degraded] classifying without check rollups: required-check gating disabled for this run; mergeStateStatus still applies'
    );
  }
  const plan = buildPlan(prs, options);

  if (options.planFile) {
    writeFileSync(options.planFile, `${JSON.stringify(plan, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  console.log(formatPlan(plan, { dryRun: options.dryRun }));
  for (const item of plan.items) logDecision(item, { phase: 'plan' });
  if (options.json) console.log(JSON.stringify(plan, null, 2));

  const results = await executePlan(plan, options);
  if (results.length > 0) {
    console.log(
      JSON.stringify({ ts: new Date().toISOString(), results }, null, 2)
    );
  }
}

main().catch(error => {
  console.error(error);
  // Surface subprocess stderr — `console.error(error)` alone hides the gh
  // CLI's actual failure reason, which made the 100%-failing-runs incident
  // (#13347) undiagnosable from the Actions UI.
  if (error?.stderr) {
    console.error(`stderr: ${String(error.stderr).slice(0, 4000)}`);
  }
  process.exitCode = 1;
});
