#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RESOLVE_MAIN_SCRIPT = fileURLToPath(
  new URL('./resolve-main-sha.sh', import.meta.url)
);
const DEFAULT_REST_BUDGET_MS = 90_000;

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
 * @returns {{ action: 'wait' | 'fail', waitMs?: number, reason?: string }}
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
    return { action: 'fail', reason: 'outside the rate-limit budget', retryAtMs };
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
    budgetMs = DEFAULT_REST_BUDGET_MS,
  }
) {
  const deadlineMs = now() + budgetMs;
  for (let attempt = 0; attempt < 2; attempt += 1) {
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
    if (decision.action === 'wait' && attempt === 0) {
      console.error(
        `::warning::Holding ${Math.ceil((decision.waitMs ?? 0) / 1000)}s for the GitHub rate limit reset before retrying ${path}.`
      );
      await sleep(decision.waitMs ?? 0);
      continue;
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
  now,
  sleep,
  budgetMs,
}) {
  const rest = { token, apiUrl, fetchImpl, now, sleep, budgetMs };
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
 * Main is resolved over git ls-remote. Superseded SHAs are neutral. Every
 * remaining REST error fails closed; a rate-limit response holds until
 * x-ratelimit-reset only inside the budget and never passes silently.
 */
export async function checkMainQueueProvenance({
  repository,
  sha,
  token,
  apiUrl = 'https://api.github.com',
  fetchImpl = fetch,
  resolveMain = resolveMainSha,
  now,
  sleep,
  budgetMs,
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
    };
  }

  const proof = await findExactQueueProof({
    repository,
    sha,
    token,
    apiUrl: normalizedApiUrl,
    fetchImpl,
    now,
    sleep,
    budgetMs,
  });
  return {
    isCurrent: true,
    queueProven: proof.proven,
    proofRunId: proof.runId,
    currentMainSha,
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
  });
  writeSummary([
    '### Main queue provenance',
    '',
    `- Run SHA: \`${sha}\``,
    `- Current main SHA: \`${result.currentMainSha}\``,
    `- Current: \`${result.isCurrent}\``,
    `- Exact successful merge-group PR Ready proof: \`${result.queueProven}\``,
    `- Proof run: \`${result.proofRunId ?? 'none'}\``,
  ]);

  if (!result.isCurrent) {
    console.log(
      `Main run ${sha} was superseded by ${result.currentMainSha}; release is neutral.`
    );
  } else if (result.queueProven) {
    console.log(
      `Exact merge-group provenance found for ${sha} (run ${result.proofRunId}).`
    );
  } else {
    console.log(
      `No exact merge-group proof for ${sha}; the current run must execute the fail-closed fallback contract.`
    );
  }
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
