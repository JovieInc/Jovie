/**
 * Read-only evidence collector for stage timings (docs/metrics/STAGE_EVENTS.md).
 *
 * Budget-aware by construction: merged PRs, their timelines and commit check
 * suites come from paginated GraphQL search (~15 points per 50 PRs), and job
 * timings for controller runs are batched through `nodes(ids:)`. REST is used
 * only for workflow-run listings. Every source reports {ok, n, error} so a
 * missing source is visible as unknown, never as a zero.
 */

import { parseStageEventFeed } from './stage-events.mjs';

const DAY_MS = 86_400_000;
const ACTIONS_APP_ID = 15368;
const PR_PAGE = 25;
const NODE_BATCH = 40;
const MAX_RUN_PAGES = 12;
const FEED_MAX_BYTES = 8 * 1024 * 1024;

const PR_SEARCH = `query($q:String!,$after:String){
  search(type:ISSUE,query:$q,first:${PR_PAGE},after:$after){
    pageInfo{hasNextPage endCursor}
    nodes{... on PullRequest{
      number title headRefName createdAt mergedAt author{login}
      mergeCommit{oid}
      timelineItems(first:60,itemTypes:[READY_FOR_REVIEW_EVENT,ADDED_TO_MERGE_QUEUE_EVENT,REMOVED_FROM_MERGE_QUEUE_EVENT,MERGED_EVENT,LABELED_EVENT]){
        nodes{__typename
          ... on ReadyForReviewEvent{createdAt}
          ... on AddedToMergeQueueEvent{createdAt}
          ... on RemovedFromMergeQueueEvent{createdAt}
          ... on MergedEvent{createdAt}
          ... on LabeledEvent{createdAt label{name}}}}
      commits(last:15){nodes{commit{id oid committedDate statusCheckRollup{state}}}}
    }}
  }
}`;

// Check-suite timings only for commits on PRs that went red: nesting them in
// the search made 29-day collection time out.
const COMMIT_SUITES = `query($ids:[ID!]!){
  nodes(ids:$ids){... on Commit{id
    checkSuites(first:40,filterBy:{appId:${ACTIONS_APP_ID}}){nodes{
      conclusion createdAt updatedAt workflowRun{event}}}}}
}`;

const RUN_JOBS = `query($ids:[ID!]!){
  nodes(ids:$ids){... on WorkflowRun{databaseId
    checkSuite{checkRuns(first:80){nodes{name conclusion startedAt completedAt}}}}}
}`;

const TIMELINE_TYPES = {
  ReadyForReviewEvent: 'ready_for_review',
  AddedToMergeQueueEvent: 'added_to_merge_queue',
  RemovedFromMergeQueueEvent: 'removed_from_merge_queue',
  MergedEvent: 'merged',
  LabeledEvent: 'labeled',
};

/** gh prints one JSON document, or NDJSON when a --jq filter streams. */
export function parseGhOutput(out) {
  const text = String(out ?? '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  }
}

function graphql(gh, query, variables) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value))
      for (const item of value) args.push('-f', `${key}[]=${item}`);
    else args.push('-f', `${key}=${value}`);
  }
  // GitHub returns transient 502s on heavy search pages; retry those only.
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const parsed = parseGhOutput(gh(args, { query, variables }));
      if (parsed?.errors?.length)
        throw new Error(parsed.errors.map(e => e.message).join('; '));
      return parsed?.data ?? null;
    } catch (error) {
      lastError = error;
      if (
        !/HTTP 50[234]|timed? ?out|ECONNRESET|unexpected end of JSON/i.test(
          String(error?.message)
        )
      )
        break;
    }
  }
  const lines = String(lastError?.message ?? lastError)
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('  '));
  throw new Error(lines.at(-1) ?? 'graphql request failed');
}

const normalizeSuite = suite => ({
  conclusion: suite.conclusion,
  createdAt: suite.createdAt,
  updatedAt: suite.updatedAt,
  event: suite.workflowRun?.event ?? null,
});

const RED_ROLLUP = new Set(['FAILURE', 'ERROR']);

/** Attach check suites to every commit of PRs that had a red rollup. */
export function attachRedPrSuites({ gh, prs }) {
  const commits = new Map();
  for (const pr of prs)
    if (pr.commits.some(c => RED_ROLLUP.has(c.rollup)))
      for (const commit of pr.commits)
        if (commit.id) commits.set(commit.id, commit);
  const ids = [...commits.keys()];
  for (let i = 0; i < ids.length; i += NODE_BATCH) {
    const batch = ids.slice(i, i + NODE_BATCH);
    const data = graphql(gh, COMMIT_SUITES, { ids: batch });
    for (const node of data?.nodes ?? []) {
      const commit = node?.id ? commits.get(node.id) : null;
      if (commit)
        commit.suites = (node.checkSuites?.nodes ?? []).map(normalizeSuite);
    }
  }
  return prs;
}

export function normalizePr(node, repository) {
  return {
    repository,
    number: node.number,
    title: node.title,
    headRefName: node.headRefName,
    author: node.author?.login ?? null,
    createdAt: node.createdAt,
    mergedAt: node.mergedAt,
    mergeCommitSha: node.mergeCommit?.oid ?? null,
    timeline: (node.timelineItems?.nodes ?? [])
      .filter(item => TIMELINE_TYPES[item?.__typename] && item.createdAt)
      .map(item => ({
        type: TIMELINE_TYPES[item.__typename],
        at: item.createdAt,
        ...(item.label ? { label: item.label.name } : {}),
      })),
    commits: (node.commits?.nodes ?? []).map(({ commit }) => ({
      id: commit.id ?? null,
      oid: commit.oid,
      committedDate: commit.committedDate,
      rollup: commit.statusCheckRollup?.state ?? null,
      suites: (commit.checkSuites?.nodes ?? []).map(normalizeSuite),
    })),
  };
}

/**
 * Merged PRs in [since, now], chunked by 3 days (search caps at 1000 hits and
 * heavy pages time out). A failed chunk is recorded in `failures` and the
 * rest still count, so one 502 cannot blank the whole window.
 */
export function collectMergedPrs({
  gh,
  repository,
  sinceMs,
  nowMs,
  failures = [],
}) {
  const prs = [];
  // Whole UTC calendar days: search dates are inclusive and day-granular.
  const firstDay = Date.UTC(
    new Date(sinceMs).getUTCFullYear(),
    new Date(sinceMs).getUTCMonth(),
    new Date(sinceMs).getUTCDate()
  );
  for (let start = firstDay; start <= nowMs; start += 3 * DAY_MS) {
    const from = new Date(start).toISOString().slice(0, 10);
    const to = new Date(Math.min(start + 2 * DAY_MS, nowMs))
      .toISOString()
      .slice(0, 10);
    const q = `repo:${repository} is:pr is:merged merged:${from}..${to}`;
    let after = null;
    for (let page = 0; page < 40; page += 1) {
      let data;
      try {
        data = graphql(gh, PR_SEARCH, { q, after });
      } catch (error) {
        failures.push(`${from}..${to}: ${error.message}`);
        break;
      }
      const search = data?.search;
      for (const node of search?.nodes ?? [])
        if (node?.number) prs.push(normalizePr(node, repository));
      if (!search?.pageInfo?.hasNextPage) break;
      after = search.pageInfo.endCursor;
    }
  }
  const seen = new Set();
  return prs.filter(pr => !seen.has(pr.number) && seen.add(pr.number));
}

/** Completed runs of one workflow since `sinceMs` (REST listing only). */
export function listWorkflowRuns({ gh, repository, workflow, sinceMs }) {
  const since = new Date(sinceMs).toISOString();
  const runs = [];
  for (let page = 1; page <= MAX_RUN_PAGES; page += 1) {
    const parsed = parseGhOutput(
      gh([
        'api',
        `repos/${repository}/actions/workflows/${workflow}/runs?created=>=${encodeURIComponent(since)}&status=completed&per_page=100&page=${page}`,
        '--jq',
        '[.workflow_runs[] | {id, nodeId: .node_id, headSha: .head_sha, event, conclusion, createdAt: .created_at, startedAt: .run_started_at, updatedAt: .updated_at, url: .html_url, headCommitAt: .head_commit.timestamp}]',
      ])
    );
    const list = Array.isArray(parsed) ? parsed.flat() : [];
    runs.push(...list.filter(run => run?.id));
    if (list.length < 100) break;
  }
  return runs;
}

/** Attach check-run (job) timings to runs through batched GraphQL. */
export function attachJobs({ gh, runs }) {
  const byNode = new Map(runs.filter(r => r.nodeId).map(r => [r.nodeId, r]));
  const ids = [...byNode.keys()];
  for (let i = 0; i < ids.length; i += NODE_BATCH) {
    const batch = ids.slice(i, i + NODE_BATCH);
    const data = graphql(gh, RUN_JOBS, { ids: batch });
    for (const [index, node] of (data?.nodes ?? []).entries()) {
      const run = byNode.get(batch[index]);
      if (!run || !node) continue;
      run.jobs = (node.checkSuite?.checkRuns?.nodes ?? []).map(job => ({
        name: job.name,
        conclusion: job.conclusion,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      }));
    }
  }
  return runs;
}

async function fetchText(fetchImpl, url, headers = {}) {
  const response = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > FEED_MAX_BYTES) throw new Error('feed exceeds size cap');
  return text;
}

const LINEAR_ISSUES = `query($numbers:[Float!]){
  issues(first:50,filter:{team:{key:{eq:"JOV"}},number:{in:$numbers}}){
    nodes{identifier createdAt startedAt
      history(first:30){nodes{createdAt fromState{type} toState{type}}}}
  }
}`;

/** Linear createdAt/startedAt/state history for JOV ids (needs a key). */
export async function collectLinearIssues({ fetchImpl, apiKey, identifiers }) {
  const out = {};
  const numbers = [
    ...new Set(identifiers.map(id => Number(id.split('-')[1]))),
  ].filter(Number.isFinite);
  for (let i = 0; i < numbers.length; i += 50) {
    const response = await fetchImpl('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: apiKey },
      body: JSON.stringify({
        query: LINEAR_ISSUES,
        variables: { numbers: numbers.slice(i, i + 50) },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Linear HTTP ${response.status}`);
    const body = await response.json();
    if (body.errors?.length)
      throw new Error(body.errors.map(e => e.message).join('; '));
    for (const node of body.data?.issues?.nodes ?? []) {
      const history = (node.history?.nodes ?? []).map(h => ({
        at: h.createdAt,
        fromType: h.fromState?.type ?? null,
        toType: h.toState?.type ?? null,
      }));
      const firstMove = history
        .filter(h => h.fromType)
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
      out[node.identifier] = {
        identifier: node.identifier,
        createdAt: node.createdAt,
        startedAt: node.startedAt,
        initialType: firstMove?.fromType ?? 'unstarted',
        history,
      };
    }
  }
  return out;
}

async function settle(sources, id, work) {
  try {
    const value = await work();
    sources[id] = {
      ok: true,
      n: Array.isArray(value) ? value.length : Object.keys(value ?? {}).length,
    };
    return value;
  } catch (error) {
    sources[id] = {
      ok: false,
      n: 0,
      error: String(error?.message ?? error).slice(0, 300),
    };
    return null;
  }
}

/**
 * Collect every stage source the manifest registers. Never throws: each
 * source settles to data or to a recorded failure.
 */
export async function collectStageRaw({
  gh,
  fetchImpl = globalThis.fetch,
  env = process.env,
  manifest,
  repository = 'JovieInc/Jovie',
  lybRepository = 'JovieInc/LogYourBody',
  now = Date.now(),
  days = 29,
}) {
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  const sinceMs = nowMs - days * DAY_MS;
  const sources = {};

  const prFailures = [];
  const prs =
    (await settle(sources, 'github-pr', () =>
      attachRedPrSuites({
        gh,
        prs: collectMergedPrs({
          gh,
          repository,
          sinceMs,
          nowMs,
          failures: prFailures,
        }),
      })
    )) ?? [];
  if (prFailures.length)
    sources['github-pr'] = {
      ...sources['github-pr'],
      ok: prs.length > 0,
      partial: prFailures.slice(0, 5),
    };

  const controllers = (await settle(sources, 'github-controller', () => {
    const production = listWorkflowRuns({
      gh,
      repository,
      workflow: 'production-controller.yml',
      sinceMs,
    }).filter(run => run.conclusion === 'success');
    attachJobs({ gh, runs: production });
    const released = new Set(
      production
        .filter(run =>
          (run.jobs ?? []).some(
            job =>
              job.conclusion === 'SUCCESS' &&
              /Promote to Production$|^Production Verified$/.test(job.name)
          )
        )
        .map(run => run.headSha)
    );
    const staging = listWorkflowRuns({
      gh,
      repository,
      workflow: 'staging-controller.yml',
      sinceMs,
    }).filter(run => run.conclusion === 'success' && released.has(run.headSha));
    attachJobs({ gh, runs: staging });
    return { production, staging };
  })) ?? { production: [], staging: [] };

  const lyb = (await settle(sources, 'github-lyb', () => {
    const runs = listWorkflowRuns({
      gh,
      repository: lybRepository,
      workflow: 'ios-release-loop.yml',
      sinceMs,
    });
    attachJobs({ gh, runs });
    return { runs };
  })) ?? { runs: [] };

  const identifiers = prs
    .map(pr => {
      const match = `${pr.headRefName} ${pr.title}`.match(/\bjov-(\d+)\b/i);
      return match ? `JOV-${match[1]}` : null;
    })
    .filter(Boolean);
  const linearIssues = env.LINEAR_API_KEY
    ? ((await settle(sources, 'linear-history', () =>
        collectLinearIssues({
          fetchImpl,
          apiKey: env.LINEAR_API_KEY,
          identifiers,
        })
      )) ?? {})
    : ((sources['linear-history'] = {
        ok: false,
        n: 0,
        error: 'LINEAR_API_KEY not set',
      }),
      {});

  const feeds = {};
  const external = {};
  for (const [id, source] of Object.entries(manifest.sources ?? {})) {
    if (source.kind === 'derived') continue;
    if (!source.url) {
      sources[id] = { ok: false, n: 0, error: 'no producer url yet (spec)' };
      continue;
    }
    if (source.kind === 'events') {
      const text = await settle(sources, id, () =>
        fetchText(fetchImpl, source.url)
      );
      if (text !== null) {
        const parsed = parseStageEventFeed(text, manifest);
        feeds[id] = parsed;
        sources[id] = {
          ok: true,
          n: parsed.events.length,
          rejected: parsed.rejected.length,
        };
      }
    } else if (source.kind === 'timings') {
      const secret = source.auth ? env[source.auth] : null;
      if (source.auth && !secret) {
        sources[id] = { ok: false, n: 0, error: `${source.auth} not set` };
        continue;
      }
      const text = await settle(sources, id, () =>
        fetchText(
          fetchImpl,
          source.url,
          secret ? { authorization: `Bearer ${secret}` } : {}
        )
      );
      if (text !== null) {
        const body = JSON.parse(text);
        Object.assign(external, body.entities ?? {});
        sources[id] = { ok: true, n: Object.keys(body.entities ?? {}).length };
      }
    }
  }

  return {
    collectedAt: new Date(nowMs).toISOString(),
    windowDays: days,
    prs,
    controllers,
    lyb,
    linearIssues,
    feeds,
    external,
    sources,
  };
}
