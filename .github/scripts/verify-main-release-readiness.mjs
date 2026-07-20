#!/usr/bin/env node

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/;

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

async function githubApi(path, { token, apiUrl, fetchImpl = fetch }) {
  const response = await fetchImpl(`${apiUrl}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'jovie-main-queue-provenance',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API ${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

export async function findExactQueueProof({
  repository,
  sha,
  token,
  apiUrl,
  fetchImpl = fetch,
}) {
  const query = new URLSearchParams({
    event: 'merge_group',
    head_sha: sha,
    status: 'completed',
    per_page: '100',
  });
  const payload = await githubApi(
    `/repos/${repository}/actions/workflows/ci.yml/runs?${query}`,
    { token, apiUrl, fetchImpl }
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
      { token, apiUrl, fetchImpl }
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
 * Superseded main SHAs are neutral; every GitHub API error fails closed.
 */
export async function checkMainQueueProvenance({
  repository,
  sha,
  token,
  apiUrl = 'https://api.github.com',
  fetchImpl = fetch,
}) {
  if (!SHA_PATTERN.test(sha)) throw new Error('sha must be a full SHA');

  const normalizedApiUrl = apiUrl.replace(/\/$/, '');
  const tip = await githubApi(`/repos/${repository}/commits/main`, {
    token,
    apiUrl: normalizedApiUrl,
    fetchImpl,
  });
  const currentMainSha = tip?.sha ?? '';
  if (!SHA_PATTERN.test(currentMainSha)) {
    throw new Error('GitHub API returned an invalid main HEAD SHA');
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
