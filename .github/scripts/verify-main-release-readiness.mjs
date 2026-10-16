#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RESOLVE_MAIN_SCRIPT = fileURLToPath(
  new URL('./resolve-main-sha.sh', import.meta.url)
);
// One hour, the lifetime of a GitHub App installation token. A retry after
// that is a 401. Stay ten minutes under it, matching gh-api-hold.sh.
export const INSTALLATION_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
export const INSTALLATION_TOKEN_MARGIN_MS = 10 * 60 * 1000;
export const MAX_REST_HOLD_MS =
  INSTALLATION_TOKEN_LIFETIME_MS - INSTALLATION_TOKEN_MARGIN_MS;
// Main Queue Provenance timeout. Five minutes remain for checkout and the
// retry after the longest hold.
export const PROVENANCE_JOB_TIMEOUT_MINUTES = 55;
export const PROVENANCE_JOB_MARGIN_MS = 5 * 60 * 1000;
export const DEFAULT_REST_BUDGET_MS = MAX_REST_HOLD_MS;
const REST_ATTEMPTS = 4;

/**
 * A rate-limit response whose reset does not fit the hold. This is not proof
 * and not a successful empty body.
 */
export class GitHubRestBudgetExhausted extends Error {
  /**
   * @param {string} path
   * @param {number} status
   * @param {number | null} [retryAtMs]
   */
  constructor(path, status, retryAtMs = null) {
    super(
      `GitHub API ${path} returned HTTP ${status}: outside the rate-limit budget`
    );
    this.name = 'GitHubRestBudgetExhausted';
    this.path = path;
    this.status = status;
    this.retryAtMs = retryAtMs;
  }
}

/**
 * Wait budget for one provenance pass. The smaller of the requested budget,
 * the installation-token margin, and the job timeout minus teardown margin.
 * @param {number} [requestedMs]
 * @param {{ jobTimeoutMs?: number }} [options]
 */
export function restHoldBudgetMs(
  requestedMs = DEFAULT_REST_BUDGET_MS,
  { jobTimeoutMs = PROVENANCE_JOB_TIMEOUT_MINUTES * 60 * 1000 } = {}
) {
  const requested = Number.isFinite(requestedMs)
    ? requestedMs
    : DEFAULT_REST_BUDGET_MS;
  const jobCap = Math.max(0, jobTimeoutMs - PROVENANCE_JOB_MARGIN_MS);
  return Math.max(0, Math.min(requested, MAX_REST_HOLD_MS, jobCap));
}

function headerNumber(headers, name) {
  if (!headers) return null;
  const value =
    typeof headers.get === 'function' ? headers.get(name) : headers[name];
  return value != null && /^[0-9]+$/.test(String(value).trim())
    ? Number(value)
    : null;
}

/**
 * Hold a remaining REST read until x-ratelimit-reset (or retry-after) when
 * that instant is inside the budget. Anything else fails closed. A rate-limit
 * response never becomes a successful empty body.
 * @param {{
 *   status?: number,
 *   headers?: { get?: (name: string) => string | null },
 *   bodyText?: string,
 *   nowMs: number,
 *   deadlineMs: number,
 * }} input
 * @returns {{ action: 'wait' | 'fail', waitMs?: number, reason?: string, retryAtMs?: number }}
 */
export function planGitHubRestHold({
  status = 0,
  headers = null,
  bodyText = '',
  nowMs,
  deadlineMs,
}) {
  const remaining = headerNumber(headers, 'x-ratelimit-remaining');
  const reset = headerNumber(headers, 'x-ratelimit-reset');
  const retryAfter = headerNumber(headers, 'retry-after');
  const text = String(bodyText ?? '');
  const rateLimited =
    remaining === 0 ||
    status === 429 ||
    /\bAPI rate limit (?:already )?exceeded\b/i.test(text) ||
    /\bsecondary rate limit\b/i.test(text);
  if (!rateLimited) return { action: 'fail' };
  const bounds = [];
  if (reset !== null) bounds.push(reset * 1000);
  if (retryAfter !== null) bounds.push(nowMs + retryAfter * 1000);
  if (bounds.length === 0) {
    return { action: 'fail', reason: 'missing x-ratelimit-reset' };
  }
  const retryAtMs = Math.max(nowMs, ...bounds) + 1000;
  if (retryAtMs > deadlineMs) {
    return {
      action: 'fail',
      reason: 'outside the rate-limit budget',
      retryAtMs,
    };
  }
  return { action: 'wait', waitMs: Math.max(0, retryAtMs - nowMs) };
}

export function hasExactSuccessfulMergeGroupProof({ sha, runs, jobsByRun }) {
  if (!SHA_PATTERN.test(sha)) return false;

  return runs.some(run => {
    if (
      run.event !== 'merge_group' ||
      run.head_sha !== sha ||
      run.status !== 'completed' ||
      run.conclusion !== 'success'
    ) {
      return false;
    }

    return (jobsByRun.get(run.id) ?? []).some(
      job =>
        job.name === 'PR Ready' &&
        job.status === 'completed' &&
        job.conclusion === 'success'
    );
  });
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function githubApi(
  path,
  {
    token,
    apiUrl,
    fetchImpl = fetch,
    now = Date.now,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    deadlineMs,
  }
) {
  for (let attempt = 0; attempt < REST_ATTEMPTS; attempt += 1) {
    const response = await fetchImpl(`${apiUrl}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'jovie-main-queue-provenance',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (response.ok) return response.json();
    let bodyText = '';
    if (typeof response.text === 'function') {
      bodyText = await response.text().catch(() => '');
    }
    const decision = planGitHubRestHold({
      status: response.status,
      headers: response.headers,
      bodyText,
      nowMs: now(),
      deadlineMs,
    });
    const rateLimited =
      decision.action === 'wait' ||
      decision.reason === 'outside the rate-limit budget';
    if (decision.action === 'wait' && attempt < REST_ATTEMPTS - 1) {
      console.error(
        `::warning::Holding ${Math.ceil((decision.waitMs ?? 0) / 1000)}s for the GitHub rate limit reset before retrying ${path}.`
      );
      await sleep(decision.waitMs ?? 0);
      continue;
    }
    if (rateLimited) {
      throw new GitHubRestBudgetExhausted(
        path,
        response.status,
        decision.retryAtMs ?? null
      );
    }
    const reason = decision.reason ? `: ${decision.reason}` : '';
    throw new Error(
      `GitHub API ${path} returned HTTP ${response.status}${reason}`
    );
  }
}

function runProcess(command, args, env) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out = [];
    const err = [];
    child.stdout.on('data', chunk => out.push(chunk));
    child.stderr.on('data', chunk => err.push(chunk));
    child.on('error', error =>
      resolve({ code: 127, stdout: '', stderr: String(error) })
    );
    child.on('close', code =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      })
    );
  });
}

/**
 * Current refs/heads/main via .github/scripts/resolve-main-sha.sh (git
 * ls-remote, then one REST read that holds until x-ratelimit-reset inside
 * its budget). A failure throws. This never invents a SHA.
 * @param {{
 *   repository?: string,
 *   token?: string,
 *   env?: NodeJS.ProcessEnv,
 *   scriptPath?: string,
 *   spawnImpl?: (
 *     command: string,
 *     args: string[],
 *     env: NodeJS.ProcessEnv,
 *   ) => Promise<{ code: number, stdout: string, stderr: string }>,
 * }} [options]
 */
export async function resolveMainSha({
  repository,
  token = '',
  env = process.env,
  scriptPath = RESOLVE_MAIN_SCRIPT,
  spawnImpl = runProcess,
} = {}) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(String(repository ?? ''))) {
    throw new Error('repository must be owner/name');
  }
  const outcome = await spawnImpl('bash', [scriptPath, repository], {
    ...env,
    GH_TOKEN: token || env.GH_TOKEN || env.GITHUB_TOKEN || '',
    GITHUB_TOKEN: token || env.GITHUB_TOKEN || env.GH_TOKEN || '',
  });
  const sha = String(outcome.stdout ?? '').trim();
  if (outcome.code === 0 && SHA_PATTERN.test(sha)) return sha;
  const detail = String(outcome.stderr ?? '').trim();
  throw new Error(
    detail ||
      `Could not resolve refs/heads/main for ${repository} via git ls-remote.`
  );
}

export async function findExactQueueProof({
  repository,
  sha,
  token,
  apiUrl,
  fetchImpl = fetch,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  budgetMs = DEFAULT_REST_BUDGET_MS,
  jobTimeoutMs = PROVENANCE_JOB_TIMEOUT_MINUTES * 60 * 1000,
}) {
  const deadlineMs = now() + restHoldBudgetMs(budgetMs, { jobTimeoutMs });
  const rest = { token, apiUrl, fetchImpl, now, sleep, deadlineMs };
  const query = new URLSearchParams({
    event: 'merge_group',
    head_sha: sha,
    status: 'completed',
    per_page: '100',
  });
  const payload = await githubApi(
    `/repos/${repository}/actions/workflows/ci.yml/runs?${query}`,
    rest
  );
  const exactRuns = (payload.workflow_runs ?? []).filter(
    run =>
      run.head_sha === sha &&
      run.event === 'merge_group' &&
      run.status === 'completed' &&
      run.conclusion === 'success'
  );
  const jobsByRun = new Map();

  for (const run of exactRuns) {
    // Run 38869365703 failed this jobs list on an installation 403 whose
    // reset was outside a 90s budget. The shared deadline can wait that out.
    const jobsPayload = await githubApi(
      `/repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
      rest
    );
    jobsByRun.set(run.id, jobsPayload.jobs ?? []);
  }

  const proven = hasExactSuccessfulMergeGroupProof({
    sha,
    runs: exactRuns,
    jobsByRun,
  });
  return {
    proven,
    runId:
      exactRuns.find(run =>
        (jobsByRun.get(run.id) ?? []).some(
          job =>
            job.name === 'PR Ready' &&
            job.status === 'completed' &&
            job.conclusion === 'success'
        )
      )?.id ?? null,
  };
}

function writeOutput(values, outputPath = process.env.GITHUB_OUTPUT) {
  if (!outputPath) return;
  appendFileSync(
    outputPath,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`
  );
}

function writeSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

/**
 * One-shot exact-SHA provenance check. This never polls the current run.
 * Main is resolved over git ls-remote. Superseded SHAs are neutral. A
 * rate-limit response holds until x-ratelimit-reset inside the job and token
 * cap. Past that cap the result is rate_limit_hold with queueProven false.
 * That is not proof. Every other REST error fails closed.
 * @param {{
 *   repository: string,
 *   sha: string,
 *   token: string,
 *   apiUrl?: string,
 *   fetchImpl?: typeof fetch,
 *   resolveMain?: typeof resolveMainSha,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<unknown>,
 *   budgetMs?: number,
 *   jobTimeoutMs?: number,
 * }} input
 */
export async function checkMainQueueProvenance({
  repository,
  sha,
  token,
  apiUrl = 'https://api.github.com',
  fetchImpl = fetch,
  resolveMain = resolveMainSha,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  budgetMs = DEFAULT_REST_BUDGET_MS,
  jobTimeoutMs = PROVENANCE_JOB_TIMEOUT_MINUTES * 60 * 1000,
}) {
  if (!SHA_PATTERN.test(sha)) throw new Error('sha must be a full SHA');

  const normalizedApiUrl = apiUrl.replace(/\/$/, '');
  const currentMainSha = await resolveMain({ repository, token });
  if (!SHA_PATTERN.test(currentMainSha)) {
    throw new Error('git ls-remote returned an invalid main HEAD SHA');
  }

  if (currentMainSha !== sha) {
    return {
      isCurrent: false,
      queueProven: false,
      proofRunId: null,
      currentMainSha,
      disposition: 'superseded',
    };
  }

  try {
    const proof = await findExactQueueProof({
      repository,
      sha,
      token,
      apiUrl: normalizedApiUrl,
      fetchImpl,
      now,
      sleep,
      budgetMs,
      jobTimeoutMs,
    });
    return {
      isCurrent: true,
      queueProven: proof.proven,
      proofRunId: proof.runId,
      currentMainSha,
      disposition: proof.proven ? 'proven' : 'unproven',
    };
  } catch (error) {
    if (!(error instanceof GitHubRestBudgetExhausted)) throw error;
    return {
      isCurrent: true,
      queueProven: false,
      proofRunId: null,
      currentMainSha,
      disposition: 'rate_limit_hold',
      detail: error.message,
    };
  }
}

/**
 * @param {{
 *   disposition?: string,
 *   isCurrent: boolean,
 *   queueProven: boolean,
 *   proofRunId: number | null,
 *   currentMainSha: string,
 * }} result
 * @param {string} sha
 */
export function describeProvenance(result, sha) {
  if (result.disposition === 'rate_limit_hold') {
    return {
      level: 'warning',
      line: `::warning::rate-limit-hold: installation REST budget exhausted reading merge-group jobs for ${sha}. queue_proven stays false. This is not proof and not a pass. The fail-closed fallback contract runs.`,
    };
  }
  if (!result.isCurrent) {
    return {
      level: 'info',
      line: `Main run ${sha} was superseded by ${result.currentMainSha}; release is neutral.`,
    };
  }
  if (result.queueProven) {
    return {
      level: 'info',
      line: `Exact merge-group provenance found for ${sha} (run ${result.proofRunId}).`,
    };
  }
  return {
    level: 'info',
    line: `No exact merge-group proof for ${sha}; the current run must execute the fail-closed fallback contract.`,
  };
}

export async function runMainQueueProvenance() {
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const sha = requiredEnv('GITHUB_SHA');
  const token = requiredEnv('GITHUB_TOKEN');
  const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';

  const result = await checkMainQueueProvenance({
    repository,
    sha,
    token,
    apiUrl,
  });
  writeOutput({
    is_current: String(result.isCurrent),
    queue_proven: String(result.queueProven),
    proof_run_id: result.proofRunId ?? '',
    current_main_sha: result.currentMainSha,
    provenance_disposition: result.disposition ?? '',
  });
  writeSummary([
    '### Main queue provenance',
    '',
    `- Run SHA: \`${sha}\``,
    `- Current main SHA: \`${result.currentMainSha}\``,
    `- Current: \`${result.isCurrent}\``,
    `- Exact successful merge-group PR Ready proof: \`${result.queueProven}\``,
    `- Proof run: \`${result.proofRunId ?? 'none'}\``,
    `- Disposition: \`${result.disposition ?? ''}\``,
  ]);

  const described = describeProvenance(result, sha);
  if (described.level === 'warning') console.error(described.line);
  else console.log(described.line);
  return result;
}

const isEntrypoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  runMainQueueProvenance().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Main queue provenance failed: ${message}`);
    process.exitCode = 1;
  });
}
