#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  annotateNativeMergeQueue,
  fetchNativeMergeQueue,
} from './lib/github-merge-queue.mjs';
import {
  fetchCompleteOpenPrSummariesRest,
  hydrateOpenPrGraphqlMetadata,
  hydrateOpenPrStatusContexts,
  normalizeRestPullRequest,
} from './lib/github-open-prs-rest.mjs';
import { tryGitHubRebase } from './lib/github-update-branch.mjs';
import {
  matchesHydratedConflictPr,
  matchesRawConflictPr,
  parseConflictEvent,
} from './lib/pr-conflict-event.mjs';
import {
  buildPlan,
  DEFAULT_BLOCKED_LABEL,
  DEFAULT_REQUIRED_CHECKS,
  formatPlan,
  parseConflictFxCohortComments,
  requireSuccessfulMutationResults,
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
    eventPayloadFile: '',
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
      case '--event-payload-file':
        options.eventPayloadFile = argv[++index];
        if (
          !options.eventPayloadFile ||
          options.eventPayloadFile.startsWith('--')
        ) {
          throw new Error('--event-payload-file requires a path');
        }
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
  if (
    !Number.isInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 500
  ) {
    throw new Error('--limit must be an integer between 1 and 500');
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
  --limit N                    Max open PRs to inspect, 1-500 (default: 200)
  --runner-capacity N          Observed GitHub-hosted runner pool size (fail-low default: 2)
  --active-ci N                Current in-progress Actions runs (default: 0)
  --queued-ci N                Current queued Actions runs (default: 0)
  --cohort-id ID               Durable cohort identifier (default: GITHUB_RUN_ID)
  --plan-file PATH             Write the machine-readable plan to PATH
  --event-payload-file PATH    Scope this run to one authenticated PR event
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
      // Retry transient API failures, not just rate limits: even bounded REST
      // pages and GraphQL metadata batches can fail during provider incidents.
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

async function fetchOpenPrs(
  options,
  { ghRequest = ghJson, forCapacity = false } = {}
) {
  const request = ({ owner, name, query }) =>
    ghRequest([
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-F',
      `owner=${owner}`,
      '-F',
      `name=${name}`,
    ]);
  const restRequest = endpoint =>
    ghRequest(['api', '--method', 'GET', endpoint]);
  // Enumerate with REST so fleet size and large PR bodies cannot turn one
  // generated `gh pr list` GraphQL connection into a controller-wide 502.
  // REST omits mergeability and diff totals, so hydrate those exact-identity
  // fields in small GraphQL batches before any classification or mutation.
  const summaries = await fetchCompleteOpenPrSummariesRest({
    repo: options.repo,
    limit: options.limit,
    request: restRequest,
  });
  const liveMetadata = await hydrateOpenPrGraphqlMetadata({
    repo: options.repo,
    prs: summaries,
    request,
    batchSize: 25,
  });
  const prs = await hydrateOpenPrStatusContexts({
    repo: options.repo,
    prs: liveMetadata,
    request,
    includeStatuses: pr =>
      forCapacity ||
      pr.mergeable === 'CONFLICTING' ||
      pr.mergeStateStatus === 'DIRTY',
    batchSize: 40,
    requireStatusContexts: forCapacity,
  });
  if (!forCapacity) await annotateQueue(prs, options, ghRequest);
  return { prs, degradedChecks: true };
}

async function annotateQueue(prs, options, request = ghJson) {
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
      return request(args, { token: queueToken });
    },
  });
  annotateNativeMergeQueue(prs, queuePositions);
}

async function fetchEventPr(options, scope, request = ghJson) {
  const restRequest = endpoint => request(['api', '--method', 'GET', endpoint]);
  const graphqlRequest = ({ owner, name, query }) =>
    request([
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-F',
      `owner=${owner}`,
      '-F',
      `name=${name}`,
    ]);
  let detail;
  // GitHub can initially report UNKNOWN mergeability. Only reread this exact
  // PR; a still-unknown result is a typed nonaction, never a fleet fallback.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    detail = await restRequest(`repos/${options.repo}/pulls/${scope.number}`);
    if (!matchesRawConflictPr(scope, detail)) {
      return { prs: [], nonAction: 'event_live_identity_or_hold_changed' };
    }
    if (
      typeof detail.mergeable === 'boolean' &&
      typeof detail.mergeable_state === 'string' &&
      detail.mergeable_state.toLowerCase() !== 'unknown'
    )
      break;
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (
    typeof detail.mergeable !== 'boolean' ||
    typeof detail.mergeable_state !== 'string' ||
    detail.mergeable_state.toLowerCase() === 'unknown'
  ) {
    return { prs: [], nonAction: 'mergeability_unknown_after_exact_reread' };
  }
  const normalized = normalizeRestPullRequest(detail, []);
  const [hydrated] = await hydrateOpenPrGraphqlMetadata({
    repo: options.repo,
    prs: [normalized],
    request: graphqlRequest,
  });
  if (!matchesHydratedConflictPr(scope, hydrated)) {
    return { prs: [], nonAction: 'hydrated_event_identity_or_hold_changed' };
  }
  if (
    hydrated.mergeable !== 'CONFLICTING' &&
    hydrated.mergeStateStatus !== 'DIRTY'
  ) {
    return { prs: [], nonAction: 'event_pr_not_dirty' };
  }
  const [pr] = await hydrateOpenPrStatusContexts({
    repo: options.repo,
    prs: [hydrated],
    request: graphqlRequest,
  });
  if (!matchesHydratedConflictPr(scope, pr)) {
    return { prs: [], nonAction: 'status_event_identity_or_hold_changed' };
  }
  await annotateQueue([pr], options, request);
  if (pr.isInMergeQueue !== false) {
    return { prs: [], nonAction: 'event_pr_in_native_queue' };
  }
  return { prs: [pr], nonAction: null };
}

async function fetchCohortHistory(
  options,
  request = ghJson,
  requireComplete = false
) {
  const pages = await request([
    'api',
    '--method',
    'GET',
    '--paginate',
    '--slurp',
    `repos/${options.repo}/issues/${options.historyIssue}/comments?per_page=100`,
  ]);
  if (
    requireComplete &&
    (!Array.isArray(pages) ||
      pages.length === 0 ||
      pages.some(page => !Array.isArray(page)))
  ) {
    throw new Error(
      'cohort history pagination omitted complete capacity evidence'
    );
  }
  const comments = Array.isArray(pages) ? pages.flat() : [];
  return parseConflictFxCohortComments(comments);
}

async function withMutationToken(run) {
  const token = process.env.GH_MUTATION_TOKEN;
  if (!token) {
    throw new Error(
      'GH_MUTATION_TOKEN is required for conflict-controller mutations'
    );
  }
  const hadToken = Object.hasOwn(process.env, 'GH_TOKEN');
  const priorToken = process.env.GH_TOKEN;
  process.env.GH_TOKEN = token;
  try {
    return await run();
  } finally {
    if (hadToken) process.env.GH_TOKEN = priorToken;
    else delete process.env.GH_TOKEN;
  }
}

async function executePlan(plan, options) {
  if (options.dryRun) return [];
  const mutableItems = plan.items.filter(
    item => item.action === 'request_github_rebase'
  );
  if (options.eventPayloadFile && mutableItems.length > 0) {
    throw new Error('exact-PR event runs cannot request a GitHub rebase');
  }
  if (mutableItems.length === 0) return [];

  return withMutationToken(async () => {
    const results = [];
    for (const item of mutableItems) {
      logDecision(item, { phase: 'execute' });
      try {
        const result = await tryGitHubRebase({
          repo: options.repo,
          pr: item.pr,
          expectedBaseRefName: item.pr.baseRefName,
          expectedBaseOid: item.pr.baseRefOid,
          expectedHeadOid: item.pr.headRefOid,
          dryRun: false,
        });
        results.push({ pr: item.number, action: item.action, ...result });
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
  });
}

export async function main(
  argv = process.argv.slice(2),
  { request = ghJson } = {}
) {
  const options = parseArgs(argv);
  if (
    process.env.GITHUB_EVENT_NAME === 'pull_request_target' &&
    !options.eventPayloadFile
  ) {
    throw new Error('pull_request_target requires --event-payload-file');
  }
  let prs;
  let degradedChecks = false;
  let nonAction = null;
  let eventScope = null;
  if (options.eventPayloadFile) {
    let payload;
    try {
      payload = JSON.parse(readFileSync(options.eventPayloadFile, 'utf8'));
    } catch {
      payload = null;
    }
    eventScope = parseConflictEvent(payload, options.repo);
    if (eventScope) {
      ({ prs, nonAction } = await fetchEventPr(options, eventScope, request));
      degradedChecks = true;
      if (prs.length === 1) {
        const [inventory, history] = await Promise.all([
          fetchOpenPrs(options, { ghRequest: request, forCapacity: true }),
          fetchCohortHistory(options, request, true),
        ]);
        const observedTarget = inventory.prs.find(
          pr => pr.number === eventScope.number
        );
        if (!matchesHydratedConflictPr(eventScope, observedTarget)) {
          prs = [];
          nonAction = 'capacity_inventory_event_identity_changed';
        } else if (
          observedTarget.mergeable !== 'CONFLICTING' &&
          observedTarget.mergeStateStatus !== 'DIRTY'
        ) {
          prs = [];
          nonAction = 'capacity_inventory_event_not_dirty';
        } else {
          await annotateQueue([observedTarget], options, request);
          if (observedTarget.isInMergeQueue !== false) {
            prs = [];
            nonAction = 'capacity_inventory_event_in_native_queue';
          } else {
            prs = [observedTarget];
          }
        }
        options.capacityPrs = inventory.prs.filter(
          pr => pr.number !== eventScope.number
        );
        options.cohortHistory = history;
      }
    } else {
      prs = [];
      nonAction = 'invalid_or_unsupported_event';
    }
    options.cohortHistory ??= [];
  } else {
    const [inventory, cohortHistory] = await Promise.all([
      fetchOpenPrs(options),
      fetchCohortHistory(options),
    ]);
    ({ prs, degradedChecks } = inventory);
    options.cohortHistory = cohortHistory;
  }
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
  if (options.eventPayloadFile) {
    plan.eventNonAction = nonAction;
    plan.eventScope = eventScope;
    const matrices = [...plan.fxMatrix, ...plan.exceptionMatrix];
    if (
      plan.items.length > 1 ||
      plan.items.some(
        item =>
          item.state !== 'DIRTY' ||
          item.number !== eventScope?.number ||
          item.pr.headRefOid !== eventScope.head ||
          item.pr.baseRefOid !== eventScope.base ||
          item.pr.headRefName !== eventScope.headRef ||
          item.pr.baseRefName !== eventScope.baseRef
      ) ||
      matrices.some(
        item =>
          item.prNumber !== eventScope?.number ||
          item.headRefOid !== eventScope.head ||
          item.baseRefOid !== eventScope.base ||
          item.headRefName !== eventScope.headRef ||
          item.baseRefName !== eventScope.baseRef
      )
    ) {
      throw new Error('exact-PR event plan escaped its DIRTY identity scope');
    }
  }

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
  requireSuccessfulMutationResults(results);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
}
