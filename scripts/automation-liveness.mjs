#!/usr/bin/env node
/**
 * Automation liveness (dead-man) check for canon/automation-registry.jsonl.
 *
 * Reads each live entry's hosted-readable run receipt, compares it to the
 * entry's max staleness (critical loops: their heartbeat's max silence), and
 * writes:
 * - a jovie-automation-liveness/v1 report (--output),
 * - jovie-stage-event/v1 run receipts, one started -> finished pair per
 *   observed run plus this check's own run (--events),
 * - remediation decisions for the existing remediation-signal intake
 *   (--decisions), one fingerprint per critical loop.
 *
 * Silence is an alert: an unreadable or missing heartbeat is red.
 *
 * Usage:
 *   node scripts/automation-liveness.mjs [--output f] [--events f]
 *     [--decisions f] [--previous f] [--file]
 * --export-automations f writes `{automations: [...live entries]}` (each with
 * runsAs) for `pnpm ownership:live --automation-file f`, then exits.
 * --file applies the decisions through scripts/lib/remediation-signal.mjs
 * (needs LINEAR_API_KEY; REMEDIATION_INTAKE_DISABLED=1 skips).
 */
import { execFile } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createApiClient } from '../packages/api-client/client.ts';
import { createLinearClient } from '../packages/api-client/linear.ts';
import { hashCredential } from '../packages/api-client/store.ts';
import { ADMISSION_BLOCKING_LABELS } from './lib/admission-hold-labels.mjs';
import {
  evaluateLiveness,
  livenessDecisions,
  livenessFingerprint,
  loadRegistry,
  readPath,
  runStageEvents,
  validateRegistry,
} from './lib/automation-registry.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 10_000;
const SHA_RE = /^[0-9a-f]{40}$/;
// Overridable per observer for tests; one literal for the external-api guard.
const GITHUB_API = 'https://api.github.com';

async function readJson(fetchImpl, url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        ...headers,
      },
      signal: controller.signal,
    });
    if (response.status !== 200)
      return { ok: false, reason: `http-${response.status}` };
    return { ok: true, body: await response.json() };
  } catch (error) {
    return {
      ok: false,
      reason: error?.name === 'AbortError' ? 'timeout' : 'transport',
    };
  } finally {
    clearTimeout(timer);
  }
}

function githubHeaders(token) {
  return token
    ? { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
    : {};
}

/** Last run of a workflow whose conclusion is one of `receipt.conclusions`. */
export async function observeGithubWorkflow(
  receipt,
  { fetchImpl, token, apiUrl = GITHUB_API }
) {
  const conclusions = receipt.conclusions ?? ['success'];
  const branch = receipt.branch
    ? `&branch=${encodeURIComponent(receipt.branch)}`
    : '';
  const base = `${apiUrl}/repos/${receipt.repo}/actions/workflows/${encodeURIComponent(receipt.workflow)}/runs?status=completed&per_page=30${branch}`;
  const events = receipt.events ?? null;
  // Filter by event server-side: a busy push/PR workflow would otherwise
  // push its scheduled runs out of the 30-run window (security.yml, 2026-10-21).
  const urls = events
    ? events.map(event => `${base}&event=${encodeURIComponent(event)}`)
    : [base];
  const runs = [];
  for (const url of urls) {
    const read = await readJson(fetchImpl, url, githubHeaders(token));
    if (!read.ok) return { ok: false, reason: `github-${read.reason}` };
    if (!Array.isArray(read.body?.workflow_runs))
      return { ok: false, reason: 'github-runs-unreadable' };
    runs.push(...read.body.workflow_runs);
  }
  runs.sort((a, b) =>
    String(b?.updated_at ?? '').localeCompare(String(a?.updated_at ?? ''))
  );
  const run = runs.find(
    row =>
      conclusions.includes(row?.conclusion) &&
      (!events || events.includes(row?.event))
  );
  if (!run)
    return {
      ok: true,
      lastProofAt: null,
      reason: `no-${conclusions.join('-or-')}${events ? `-${events.join('-or-')}` : ''}-run-in-last-30`,
    };
  return {
    ok: true,
    lastProofAt: run.updated_at,
    startedAt: run.run_started_at ?? run.created_at,
    endedAt: run.updated_at,
    ref: String(run.id),
    outcome: run.conclusion === 'success' ? 'completed' : 'failed',
    url: run.html_url,
  };
}

/** A timestamp inside a JSON document (status feeds, health routes). */
export async function observeJsonTimestamp(receipt, { fetchImpl }) {
  const read = await readJson(fetchImpl, receipt.url);
  if (!read.ok) return { ok: false, reason: `json-${read.reason}` };
  const value = readPath(read.body, receipt.path);
  if (value === undefined || value === null) {
    return {
      ok: true,
      lastProofAt: null,
      reason: `heartbeat-source-missing:${receipt.path}`,
    };
  }
  if (receipt.okPath) {
    const okValue = readPath(read.body, receipt.okPath);
    if (!(receipt.okValues ?? ['verified', 'ok', true]).includes(okValue)) {
      return {
        ok: true,
        lastProofAt: null,
        reason: `heartbeat-not-ok:${receipt.okPath}=${String(okValue)}`,
      };
    }
  }
  return { ok: true, lastProofAt: value, url: receipt.url };
}

const PUSH_RUNS_PAGE = 100;
const LANDING_SKEW_MS = 2 * 60_000;

/**
 * When a merge-queue squash commit reached main.
 *
 * Its committer date is the queue time, which can precede the fast-forward
 * onto main by hours. The earliest push-event run at or after that date is
 * the landing time. An unreadable or incomplete run list keeps the committer
 * date, so a real stall still alerts.
 */
async function landedOnMainAt(
  repo,
  sha,
  committerDate,
  { fetchImpl, token, apiUrl }
) {
  const committerMs = Date.parse(committerDate ?? '');
  const base = `${apiUrl}/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&event=push&per_page=${PUSH_RUNS_PAGE}`;
  const headers = githubHeaders(token);
  const first = await readJson(fetchImpl, base, headers);
  if (!first.ok || !Array.isArray(first.body?.workflow_runs))
    return committerDate;
  let runs = first.body.workflow_runs;
  const total = Number(first.body.total_count);
  if (Number.isFinite(total) && total > runs.length) {
    const lastPage = Math.ceil(total / PUSH_RUNS_PAGE);
    const older = await readJson(
      fetchImpl,
      `${base}&page=${lastPage}`,
      headers
    );
    if (!older.ok || !Array.isArray(older.body?.workflow_runs))
      return committerDate;
    runs = older.body.workflow_runs;
  }
  const landedMs = runs
    .map(run => Date.parse(run?.created_at ?? ''))
    .filter(
      ms =>
        Number.isFinite(ms) &&
        (!Number.isFinite(committerMs) || ms + LANDING_SKEW_MS >= committerMs)
    )
    .reduce((min, ms) => Math.min(min, ms), Number.POSITIVE_INFINITY);
  return Number.isFinite(landedMs)
    ? new Date(landedMs).toISOString()
    : committerDate;
}

function shaFromMainRef(head) {
  return head?.ref === 'refs/heads/main' && head?.object?.type === 'commit'
    ? head.object.sha
    : null;
}

function shaFromCommitBody(text) {
  const trimmed = String(text ?? '').trim();
  if (SHA_RE.test(trimmed)) return trimmed;
  try {
    const sha = JSON.parse(trimmed)?.sha;
    return SHA_RE.test(sha ?? '') ? sha : null;
  } catch {
    return null;
  }
}

function mainRefFailure(error, status) {
  if (status) return { ok: false, reason: `main-ref-http-${status}` };
  return {
    ok: false,
    reason: error?.status
      ? `main-ref-http-${error.status}`
      : `main-ref-${error?.failure ?? error?.kind ?? 'unreadable'}`,
  };
}

const execFileAsync = promisify(execFile);

function gitProbeEnv(token) {
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
  };
  const pairs = [['core.hooksPath', '/dev/null']];
  if (token) {
    const encoded = Buffer.from(`x-access-token:${token}`).toString('base64');
    pairs.push(
      ['credential.helper', ''],
      [
        'http.https://github.com/.extraheader',
        `AUTHORIZATION: basic ${encoded}`,
      ]
    );
  }
  env.GIT_CONFIG_COUNT = String(pairs.length);
  for (const [index, [key, value]] of pairs.entries()) {
    env[`GIT_CONFIG_KEY_${index}`] = key;
    env[`GIT_CONFIG_VALUE_${index}`] = value;
  }
  return env;
}

async function defaultGit(args, env) {
  const { stdout } = await execFileAsync('git', args, {
    timeout: TIMEOUT_MS,
    env,
    encoding: 'utf8',
    windowsHide: true,
  });
  return stdout;
}

/**
 * refs/heads/main over the git protocol. The token stays in the child
 * environment, never in argv. A failure returns null so the REST fallback
 * can still run.
 */
export async function lsRemoteMain(repo, token, gitExec = defaultGit) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(String(repo ?? ''))) return null;
  try {
    const stdout = await gitExec(
      [
        'ls-remote',
        '--refs',
        `https://github.com/${repo}.git`,
        'refs/heads/main',
      ],
      gitProbeEnv(token)
    );
    const sha = String(stdout ?? '')
      .trim()
      .split(/\s+/)[0];
    return SHA_RE.test(sha ?? '') ? sha : null;
  } catch {
    return null;
  }
}

async function shaFromGit(readGitTip) {
  if (typeof readGitTip !== 'function') return null;
  try {
    const sha = await readGitTip();
    return SHA_RE.test(sha ?? '') ? sha : null;
  } catch {
    return null;
  }
}

/**
 * Branch tip for the promotion probe.
 *
 * `git/ref` is the cheap read. The Actions token answers that route with
 * HTTP 403 while production is inside the silence budget (runs 39674054063
 * and 39682307911; the second ran after the commits/main fallback landed).
 * `GET /commits/main` is the same 403 the production controller already left
 * for `git ls-remote`. On a 403, ask git for refs/heads/main, then try one
 * last commit-SHA read. Any other failure stays unreadable.
 */
async function readMainSha(client, repo, headers, apiUrl, readGitTip) {
  const request = (url, accept) =>
    client.request({
      url,
      headers: {
        Accept: accept,
        'Cache-Control': 'no-cache',
        ...headers,
      },
      priority: 'report',
      conditional: false,
      maxAttempts: 2,
      maxWaitMs: TIMEOUT_MS,
      timeoutMs: TIMEOUT_MS,
    });
  let failure;
  try {
    const response = await request(
      `${apiUrl}/repos/${repo}/git/ref/heads/main`,
      'application/json'
    );
    if (response.status === 200) {
      const sha = shaFromMainRef(response.json());
      return SHA_RE.test(sha ?? '')
        ? { ok: true, sha }
        : { ok: false, reason: 'main-sha-unreadable' };
    }
    failure = mainRefFailure(null, response.status);
    if (response.status !== 403) return failure;
  } catch (error) {
    failure = mainRefFailure(error);
    if (error?.status !== 403) return failure;
  }
  const fromGit = await shaFromGit(readGitTip);
  if (fromGit) return { ok: true, sha: fromGit };
  try {
    // application/vnd.github.sha is the raw tip. The default commit
    // document also builds the patch, which this probe does not need.
    const response = await request(
      `${apiUrl}/repos/${repo}/commits/main`,
      'application/vnd.github.sha'
    );
    if (response.status !== 200) return failure;
    const sha = shaFromCommitBody(response.text);
    return SHA_RE.test(sha ?? '') ? { ok: true, sha } : failure;
  } catch {
    return failure;
  }
}

/**
 * Production promotion heartbeat, independent of the continuity guard's own
 * verdict: production carrying main is a fresh proof; otherwise the proof is
 * as old as the oldest missing commit has been on main. Unreadable is unknown
 * (red), never healthy.
 */
export async function observeProductionFreshness(
  receipt,
  { fetchImpl, token, nowMs, githubClient, apiUrl = GITHUB_API, lsRemote }
) {
  const build = await readJson(fetchImpl, receipt.buildInfoUrl);
  const live = build.ok ? build.body?.commitSha : null;
  if (!SHA_RE.test(live ?? ''))
    return { ok: false, reason: 'live-sha-unreadable' };
  const headers = githubHeaders(token);
  const client =
    githubClient ??
    createApiClient({
      provider: 'github',
      credential: hashCredential('github', token ?? ''),
      fetch: fetchImpl,
    });
  const mainRead = await readMainSha(
    client,
    receipt.repo,
    headers,
    apiUrl,
    () => lsRemote?.(receipt.repo, token)
  );
  if (!mainRead.ok) return mainRead;
  const main = mainRead.sha;
  const now = new Date(nowMs).toISOString();
  if (live === main)
    return { ok: true, lastProofAt: now, reason: 'production-current' };
  const compare = await readJson(
    fetchImpl,
    `${apiUrl}/repos/${receipt.repo}/compare/${live}...${main}`,
    headers
  );
  if (!compare.ok) return { ok: false, reason: 'unshipped-range-unreadable' };
  if (Number(compare.body?.ahead_by) === 0)
    return { ok: true, lastProofAt: now, reason: 'production-current' };
  const oldestCommit = compare.body?.commits?.[0];
  const committerDate = oldestCommit?.commit?.committer?.date;
  if (!Number.isFinite(Date.parse(committerDate ?? '')))
    return { ok: false, reason: 'unshipped-age-unreadable' };
  const sha = oldestCommit?.sha;
  const landedAt = SHA_RE.test(sha ?? '')
    ? await landedOnMainAt(receipt.repo, sha, committerDate, {
        fetchImpl,
        token,
        apiUrl,
      })
    : committerDate;
  return {
    ok: true,
    lastProofAt: landedAt,
    reason: `${compare.body.ahead_by}-commits-unshipped`,
  };
}

/**
 * Merge-queue progress (2026-10-20: the queue stalled 39 min with no alarm,
 * JOV-8706). An empty queue is a fresh proof; otherwise the proof is the later
 * of the last merged PR and the oldest entry's enqueue time, so a
 * non-empty queue that stops merging goes silent. Unreadable is silence.
 */
export async function observeMergeQueueProgress(
  receipt,
  { fetchImpl, token, nowMs, apiUrl = GITHUB_API }
) {
  if (!token) return { ok: false, reason: 'merge-queue-token-missing' };
  const [owner, name] = String(receipt.repo).split('/');
  const branch = receipt.branch ?? 'main';
  // Merge time comes from PR mergedAt: a queue-merged commit keeps the
  // timestamp of its merge group, not of the merge itself.
  const query = `query($owner:String!,$name:String!,$branch:String!){repository(owner:$owner,name:$name){mergeQueue(branch:$branch){entries(first:100){totalCount nodes{enqueuedAt}}} pullRequests(baseRefName:$branch,states:MERGED,first:10,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{mergedAt}}}}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let body;
  try {
    const response = await fetchImpl(`${apiUrl}/graphql`, {
      method: 'POST',
      headers: {
        ...githubHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { owner, name, branch },
      }),
      signal: controller.signal,
    });
    if (response.status !== 200)
      return { ok: false, reason: `merge-queue-http-${response.status}` };
    body = await response.json();
  } catch (error) {
    return {
      ok: false,
      reason:
        error?.name === 'AbortError'
          ? 'merge-queue-timeout'
          : 'merge-queue-transport',
    };
  } finally {
    clearTimeout(timer);
  }
  const repo = body?.data?.repository;
  const entries = repo?.mergeQueue?.entries;
  if (!repo || body?.errors?.length || !entries)
    return { ok: false, reason: 'merge-queue-unreadable' };
  if (Number(entries.totalCount) === 0)
    return {
      ok: true,
      lastProofAt: new Date(nowMs).toISOString(),
      reason: 'merge-queue-empty',
    };
  const merges = (repo.pullRequests?.nodes ?? [])
    .map(node => Date.parse(node?.mergedAt ?? ''))
    .filter(Number.isFinite);
  const lastMerge = merges.length ? Math.max(...merges) : Number.NaN;
  const enqueued = (entries.nodes ?? [])
    .map(node => Date.parse(node?.enqueuedAt ?? ''))
    .filter(Number.isFinite);
  const waitingSince = enqueued.length ? Math.min(...enqueued) : Number.NaN;
  const proof = Math.max(
    Number.isFinite(lastMerge) ? lastMerge : -Infinity,
    Number.isFinite(waitingSince) ? waitingSince : -Infinity
  );
  if (!Number.isFinite(proof))
    return { ok: false, reason: 'merge-queue-times-unreadable' };
  return {
    ok: true,
    lastProofAt: new Date(proof).toISOString(),
    reason: `${entries.totalCount}-queued`,
  };
}

/**
 * Triage dwell (Tim 2026-10-21: an issue that hits Triage is sorted right
 * away, not on a tick). The proof is an empty Triage, else the oldest Triage
 * entry time, so the age of the oldest unsorted issue is the staleness and
 * max silence is the dwell SLO. Unreadable or unauthenticated is silence.
 */
export async function observeLinearTriageDwell(receipt, { linear, nowMs }) {
  if (!linear) return { ok: false, reason: 'linear-client-missing' };
  const teams = receipt.teams ?? ['JOV', 'LYB'];
  let issues;
  try {
    const data = await linear.graphql(
      `query($teams:[String!]){issues(first:100,filter:{state:{type:{eq:"triage"}},team:{key:{in:$teams}}}){nodes{identifier createdAt startedTriageAt}}}`,
      { teams }
    );
    issues = data?.issues?.nodes;
  } catch {
    return { ok: false, reason: 'linear-triage-unreadable' };
  }
  if (!Array.isArray(issues))
    return { ok: false, reason: 'linear-triage-unreadable' };
  if (issues.length === 0)
    return {
      ok: true,
      lastProofAt: new Date(nowMs).toISOString(),
      reason: 'triage-empty',
    };
  const entered = issues
    .map(issue => ({
      id: issue?.identifier,
      at: Date.parse(issue?.startedTriageAt ?? issue?.createdAt ?? ''),
    }))
    .filter(row => Number.isFinite(row.at))
    .sort((a, b) => a.at - b.at);
  if (!entered.length)
    return { ok: false, reason: 'linear-triage-times-unreadable' };
  const over = entered.filter(
    row => nowMs - row.at > (receipt.dwellSloMinutes ?? 15) * 60_000
  ).length;
  return {
    ok: true,
    lastProofAt: new Date(entered[0].at).toISOString(),
    detailOnStale: true,
    reason: `${issues.length}-in-triage;${over}-over-slo;oldest=${entered[0].id}`,
  };
}

const MERGEABLE_GREEN = new Set(['CLEAN', 'UNSTABLE', 'HAS_HOOKS']);
const ADMISSION_BLOCKING = new Set(ADMISSION_BLOCKING_LABELS);
const GREEN_TIMING_MAX_PRS = 10;
const FAILURE_HOLD_CONTEXT = 'jovie-queue-failure-hold/v1';
const DEFECT_HOLD_CLASSES = new Set(['deterministic-source', 'unclassified']);

/**
 * When the exact head turned required-green: the latest success among each
 * required name's check runs (completed_at) and commit statuses (created_at).
 * Null when any required name has no success yet.
 */
async function requiredGreenAt(
  repo,
  sha,
  checks,
  { fetchImpl, token, apiUrl }
) {
  const headers = githubHeaders(token);
  const runs = await readJson(
    fetchImpl,
    `${apiUrl}/repos/${repo}/commits/${sha}/check-runs?filter=latest&per_page=100`,
    headers
  );
  const statuses = await readJson(
    fetchImpl,
    `${apiUrl}/repos/${repo}/commits/${sha}/status?per_page=100`,
    headers
  );
  if (!runs.ok || !statuses.ok) return { ok: false };
  let greenAt = -Infinity;
  for (const check of checks) {
    const times = [
      ...(runs.body?.check_runs ?? [])
        .filter(run => run?.name === check && run?.conclusion === 'success')
        .map(run => Date.parse(run.completed_at ?? '')),
      ...(statuses.body?.statuses ?? [])
        .filter(row => row?.context === check && row?.state === 'success')
        .map(row => Date.parse(row.created_at ?? '')),
    ].filter(Number.isFinite);
    if (!times.length) return { ok: true, greenAt: null, holdClass: null };
    greenAt = Math.max(greenAt, Math.max(...times));
  }
  // The merge-queue failure hold is a commit status on the head (ci-plan):
  // description `class=<class>;n=..;run=..`. A real-defect hold needs a new
  // head from its owner; it is reported, not counted as promotion latency.
  const hold = (statuses.body?.statuses ?? []).find(
    row => row?.context === FAILURE_HOLD_CONTEXT
  );
  const holdClass =
    /(?:^|;)class=([a-z-]+)/.exec(String(hold?.description ?? ''))?.[1] ?? null;
  return {
    ok: true,
    greenAt: Number.isFinite(greenAt) ? greenAt : null,
    holdClass,
  };
}

/**
 * Green -> enqueued dwell (Tim 2026-10-21: a PR whose exact head is
 * required-green is promoted and enqueued on the check event, not on a
 * tick). GitHub's mergeStateStatus already folds in the ruleset's required
 * checks (CLEAN/UNSTABLE/HAS_HOOKS = required green and mergeable), so one
 * cheap list read finds candidates; only ready candidates (capped) pay for a
 * per-head timing read. Proof is "no ready, mergeable, required-green PR sits
 * outside the merge queue", else the earliest such green time. Admission
 * label holds are reported separately, using the writer's shared policy.
 * Green drafts are counted in the reason; draft promotion is the writer's
 * (JOV-INV-022).
 */
export async function observeGreenToEnqueue(
  receipt,
  { fetchImpl, token, nowMs, apiUrl = GITHUB_API }
) {
  if (!token) return { ok: false, reason: 'green-enqueue-token-missing' };
  const [owner, name] = String(receipt.repo).split('/');
  const checks = receipt.requiredChecks ?? [];
  if (!checks.length) return { ok: false, reason: 'required-checks-missing' };
  const query = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){pullRequests(states:OPEN,first:40,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number isDraft isInMergeQueue mergeStateStatus baseRefName headRefOid labels(first:100){nodes{name} pageInfo{hasNextPage}}}}}}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let body;
  try {
    const response = await fetchImpl(`${apiUrl}/graphql`, {
      method: 'POST',
      headers: {
        ...githubHeaders(token),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { owner, name } }),
      signal: controller.signal,
    });
    if (response.status !== 200)
      return { ok: false, reason: `green-enqueue-http-${response.status}` };
    body = await response.json();
  } catch (error) {
    return {
      ok: false,
      reason:
        error?.name === 'AbortError'
          ? 'green-enqueue-timeout'
          : 'green-enqueue-transport',
    };
  } finally {
    clearTimeout(timer);
  }
  const prs = body?.data?.repository?.pullRequests?.nodes;
  if (body?.errors?.length || !Array.isArray(prs))
    return { ok: false, reason: 'green-enqueue-unreadable' };
  const base = receipt.branch ?? 'main';
  const green = prs.filter(
    pr =>
      pr &&
      !pr.isInMergeQueue &&
      pr.baseRefName === base &&
      MERGEABLE_GREEN.has(pr.mergeStateStatus)
  );
  const drafts = green.filter(pr => pr.isDraft).map(pr => pr.number);
  const waiting = [];
  const held = [];
  const labelHeld = [];
  const ready = [];
  for (const pr of green.filter(row => !row.isDraft)) {
    if (
      !Array.isArray(pr.labels?.nodes) ||
      pr.labels?.pageInfo?.hasNextPage !== false ||
      pr.labels.nodes.some(label => typeof label?.name !== 'string')
    )
      return { ok: false, reason: 'green-enqueue-labels-unreadable' };
    if (
      pr.labels.nodes.some(label =>
        ADMISSION_BLOCKING.has(label.name.toLowerCase())
      )
    )
      labelHeld.push(pr.number);
    else ready.push(pr);
  }
  for (const pr of ready.slice(0, GREEN_TIMING_MAX_PRS)) {
    const timing = await requiredGreenAt(receipt.repo, pr.headRefOid, checks, {
      fetchImpl,
      token,
      apiUrl,
    });
    if (!timing.ok)
      return { ok: false, reason: 'green-enqueue-checks-unreadable' };
    if (timing.greenAt === null) continue;
    if (DEFECT_HOLD_CLASSES.has(timing.holdClass ?? '')) held.push(pr.number);
    else waiting.push({ number: pr.number, greenAt: timing.greenAt });
  }
  waiting.sort((a, b) => a.greenAt - b.greenAt);
  const listed = waiting
    .slice(0, 5)
    .map(row => `#${row.number}:${Math.round((nowMs - row.greenAt) / 60_000)}m`)
    .join(',');
  const reason = `ready-green-unqueued=${waiting.length}[${listed}];draft-green=${drafts.length}[${drafts
    .slice(0, 8)
    .map(n => `#${n}`)
    .join(
      ','
    )}];defect-held=${held.length}[${held.map(n => `#${n}`).join(',')}];label-held=${labelHeld.length}[${labelHeld.map(n => `#${n}`).join(',')}]`;
  if (!waiting.length)
    return { ok: true, lastProofAt: new Date(nowMs).toISOString(), reason };
  return {
    ok: true,
    lastProofAt: new Date(waiting[0].greenAt).toISOString(),
    detailOnStale: true,
    reason,
  };
}

export async function observeEntry(entry, context) {
  const receipt = entry.receipt ?? {};
  if (receipt.kind === 'github-workflow')
    return observeGithubWorkflow(receipt, context);
  if (receipt.kind === 'json-timestamp')
    return observeJsonTimestamp(receipt, context);
  if (receipt.kind === 'production-freshness')
    return observeProductionFreshness(receipt, context);
  if (receipt.kind === 'merge-queue-progress')
    return observeMergeQueueProgress(receipt, context);
  if (receipt.kind === 'linear-triage-dwell')
    return observeLinearTriageDwell(receipt, context);
  if (receipt.kind === 'green-to-enqueue')
    return observeGreenToEnqueue(receipt, context);
  return null;
}

/**
 * @typedef {(url: string, init?: any) => Promise<{status: number, json: () => Promise<any>}>} FetchLike
 * @param {{
 *   registry: any,
 *   fetchImpl?: FetchLike,
 *   token?: string,
 *   nowMs?: number,
 *   githubClient?: import('../packages/api-client/client.ts').ApiClient,
 *   linear?: { graphql: (query: string, variables?: Record<string, unknown>) => Promise<any> } | null,
 *   lsRemote?: (repo: string, token?: string) => Promise<string | null>,
 * }} options
 */
export async function runLiveness({
  registry,
  fetchImpl = fetch,
  token = '',
  nowMs = Date.now(),
  githubClient,
  linear = null,
  lsRemote = lsRemoteMain,
}) {
  const startedAt = new Date(nowMs).toISOString();
  const observations = new Map();
  const context = { fetchImpl, token, nowMs, githubClient, linear, lsRemote };
  for (const entry of registry.entries ?? []) {
    if (entry?.status !== 'live') continue;
    const observed = await observeEntry(entry, context);
    if (observed) observations.set(entry.id, observed);
  }
  const report = evaluateLiveness(registry, observations, nowMs);
  const events = [];
  for (const [id, observed] of observations) {
    if (!observed?.startedAt || !observed?.endedAt) continue;
    events.push(
      ...runStageEvents({
        automationId: id,
        runRef: observed.ref,
        startedAt: observed.startedAt,
        endedAt: observed.endedAt,
        outcome: observed.outcome,
        sourceReceipt: observed.url,
      })
    );
  }
  return { report, events, startedAt };
}

function parseArgs(argv) {
  const args = { file: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--file') args.file = true;
    else if (
      [
        '--output',
        '--events',
        '--decisions',
        '--previous',
        '--export-automations',
      ].includes(flag) &&
      argv[index + 1]
    ) {
      args[flag.slice(2)] = argv[index + 1];
      index += 1;
    } else throw new Error(`unsupported argument: ${flag}`);
  }
  return args;
}

function readPrevious(path) {
  if (!path) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function summary(report) {
  const rows = report.results
    .map(
      row =>
        `| ${row.id} | ${row.critical ? 'yes' : ''} | ${row.status} | ${row.lastProofAt ?? 'none'} | ${row.budgetMinutes}m | ${row.reason ?? ''} |`
    )
    .join('\n');
  return [
    `### Automation liveness: ${report.status}`,
    '',
    '| id | critical | status | last heartbeat | budget | reason |',
    '|---|---|---|---|---|---|',
    rows,
    '',
    `${report.unmeasured.length} live entries have no hosted-readable receipt (see registry \`gap\`).`,
    '',
  ].join('\n');
}

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const args = parseArgs(argv);
  const registry = loadRegistry(REPO_ROOT);
  const invalid = validateRegistry(registry);
  if (invalid.length)
    throw new Error(`registry invalid:\n${invalid.join('\n')}`);
  if (args['export-automations']) {
    const automations = registry.entries.filter(
      entry => entry.status === 'live'
    );
    writeFileSync(
      args['export-automations'],
      `${JSON.stringify({ automations }, null, 2)}\n`
    );
    return { automations };
  }
  const { report, events, startedAt } = await runLiveness({
    registry,
    fetchImpl,
    token: env.GH_TOKEN ?? env.GITHUB_TOKEN ?? '',
    linear: env.LINEAR_API_KEY
      ? createLinearClient({
          identity: env.LINEAR_API_KEY,
          authorization: () => env.LINEAR_API_KEY ?? '',
          legacyStateRoot: null,
        })
      : null,
  });
  const endedAt = new Date().toISOString();
  const runUrl = env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : null;
  if (runUrl) {
    events.push(
      ...runStageEvents({
        automationId: 'github:jovie:automation-liveness',
        runRef: env.GITHUB_RUN_ID,
        startedAt,
        endedAt,
        outcome: 'completed',
        sourceReceipt: runUrl,
      })
    );
  }
  const previous = readPrevious(args.previous);
  const decisions = livenessDecisions(report, previous);
  const full = { ...report, startedAt, endedAt, runUrl, decisions };
  if (args.output)
    writeFileSync(args.output, `${JSON.stringify(full, null, 2)}\n`);
  if (args.events)
    writeFileSync(
      args.events,
      events.map(row => JSON.stringify(row)).join('\n') +
        (events.length ? '\n' : '')
    );
  if (args.decisions)
    writeFileSync(args.decisions, `${JSON.stringify(decisions, null, 2)}\n`);
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, summary(report));

  const state = { ...previous };
  for (const row of report.results) {
    if (row.critical)
      state[livenessFingerprint(row.id)] =
        row.status === 'fresh' ? 'green' : 'red';
  }
  if (args.file && env.REMEDIATION_INTAKE_DISABLED !== '1') {
    const { applyRemediationDecisionWithRetry } = await import(
      './lib/remediation-signal.mjs'
    );
    for (const decision of decisions) {
      const result = await applyRemediationDecisionWithRetry(decision, {
        fingerprint: decision.fingerprint,
        source: 'automation-liveness.yml',
        runUrl,
        detail: decision.detail,
        apiKey: env.LINEAR_API_KEY,
      });
      process.stdout.write(
        `${JSON.stringify({ fingerprint: decision.fingerprint, action: decision.action, ok: result.ok, reason: 'reason' in result ? result.reason : null })}\n`
      );
      // Keep the prior state when filing failed so the next run retries.
      if (!result.ok)
        state[decision.fingerprint] =
          previous[decision.fingerprint] ?? 'unknown';
    }
  }
  if (args.previous)
    writeFileSync(args.previous, `${JSON.stringify(state, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({ status: report.status, red: report.results.filter(row => row.status !== 'fresh').map(row => row.id) })}\n`
  );
  return full;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    process.stderr.write(
      `automation-liveness: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  });
}
